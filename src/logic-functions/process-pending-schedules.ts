import axios from 'axios';
import { open, readFile, rename, rm, writeFile } from 'fs/promises';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import { createLogger } from '../logger';
import { detectPlatform } from '../twenty-sync-service';
import { buildRestUrl, getRestApiUrl, restHeaders } from '../utils';
import { getMeetingBaasCallbackUrl } from '../workspace-webhook-url';
import {
  loadCurrentEventSnapshot,
  qualifyEventForScheduling,
  type QualifiedEvent,
} from './schedule-bot';

const logger = createLogger('process-pending-schedules');

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 200;
const MAX_PENDING_SCAN = 2000;
const LOCK_PATH = '/tmp/meeting-baas-pending-schedules.lock';
const LOCK_TTL_MS = 4 * 60 * 1000;
// Meeting BaaS enforces a 90-day limit on join_at for scheduled bots.
// Events beyond this window stay as PENDING_SCHEDULE until a daily cron
// picks them up once they enter the window.
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

type PendingRecording = {
  id: string;
  calendarEventId: string;
  workspaceMemberId: string;
};

type EligiblePendingRecording = {
  recordingId: string;
  qualified: QualifiedEvent;
};

type SchedulerLock = {
  release: () => Promise<void>;
};

export type BatchResult = {
  scheduled: number;
  failed: number;
  skipped: number;
  errors: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tryAcquireLock = async (): Promise<SchedulerLock | null> => {
  const now = Date.now();
  const lockContent = JSON.stringify({ createdAt: now, pid: process.pid });

  // Fast path: no lock exists — exclusive create is atomic
  try {
    const handle = await open(LOCK_PATH, 'wx');
    await handle.writeFile(lockContent);
    await handle.close();

    return {
      release: async () => {
        await rm(LOCK_PATH, { force: true }).catch(() => undefined);
      },
    };
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code !== 'EEXIST') {
      throw error;
    }
  }

  // Lock exists — check if stale
  try {
    const raw = await readFile(LOCK_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { createdAt?: number };
    const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;
    if (now - createdAt <= LOCK_TTL_MS) {
      return null; // Lock is held and not stale
    }
  } catch {
    // Lock file corrupt or removed — treat as stale
  }

  // Stale lock — atomic takeover via rename (avoids the delete-then-create race).
  // Write to a PID-keyed temp file, rename over the lock, then verify ownership.
  const tempPath = `${LOCK_PATH}.${process.pid}`;
  try {
    await writeFile(tempPath, lockContent);
    await rename(tempPath, LOCK_PATH);

    // Verify we won: another process may have renamed after us
    const check = await readFile(LOCK_PATH, 'utf8');
    const parsed = JSON.parse(check) as { pid?: number };
    if (parsed.pid !== process.pid) {
      return null; // Lost the race
    }

    return {
      release: async () => {
        await rm(LOCK_PATH, { force: true }).catch(() => undefined);
      },
    };
  } catch {
    await rm(tempPath, { force: true }).catch(() => undefined);
    return null;
  }
};

const fetchPendingRecordingsPage = async (
  limit: number,
  cursor?: string,
): Promise<PendingRecording[]> => {
  const url = buildRestUrl('recordings', {
    filter: { status: { eq: 'PENDING_SCHEDULE' } },
    limit,
    cursor,
  });
  const response = await axios.get(url, { headers: restHeaders() });
  const recordings: Record<string, unknown>[] =
    response.data?.data?.recordings ?? [];

  return recordings.map((r) => ({
    id: r.id as string,
    calendarEventId: (r.calendarEventId as string) || '',
    workspaceMemberId: (r.workspaceMemberId as string) || '',
  }));
};

const fetchPendingRecordings = async (limit: number): Promise<PendingRecording[]> => {
  const pending: PendingRecording[] = [];
  let cursor: string | undefined;

  while (pending.length < limit) {
    const pageSize = Math.min(200, limit - pending.length);
    const page = await fetchPendingRecordingsPage(pageSize, cursor);
    if (page.length === 0) break;

    pending.push(...page);

    if (page.length < pageSize) break;
    cursor = page[page.length - 1]?.id;
    if (!cursor) break;
  }

  return pending;
};

const patchRecording = async (
  recordingId: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await axios({
    method: 'PATCH',
    headers: restHeaders(),
    url: `${getRestApiUrl()}/recordings/${recordingId}`,
    data,
  });
};

export const processPendingSchedules = async (): Promise<BatchResult> => {
  const result: BatchResult = { scheduled: 0, failed: 0, skipped: 0, errors: [] };
  const lock = await tryAcquireLock();

  if (!lock) {
    logger.debug('scheduler already running, skipping overlapping run');
    return result;
  }

  try {
    const apiKey = process.env.MEETING_BAAS_API_KEY;
    if (!apiKey) {
      result.errors.push('MEETING_BAAS_API_KEY not configured');
      return result;
    }

    const callbackUrl = getMeetingBaasCallbackUrl();
    if (!callbackUrl) {
      result.errors.push('WORKSPACE_WEBHOOK_BASE_URL not configured');
      return result;
    }

    let pending: PendingRecording[];
    try {
      pending = await fetchPendingRecordings(MAX_PENDING_SCAN);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to fetch pending recordings: ${msg}`);
      return result;
    }

    if (pending.length === 0) return result;

    logger.debug(`found ${pending.length} pending recordings to process`);

    // Re-resolve live event state for each pending row.
    const now = Date.now();
    const schedulingHorizon = now + MAX_SCHEDULE_AHEAD_MS;
    const valid: EligiblePendingRecording[] = [];
    for (const rec of pending) {
      if (!rec.calendarEventId) {
        try {
          await patchRecording(rec.id, { status: 'FAILED' });
        } catch {
          // best-effort
        }
        result.failed++;
        continue;
      }

      // Load current event state. loadCurrentEventSnapshot returns null when
      // the event is deleted (404) and throws on transient errors (network, 500).
      let snapshot: Awaited<ReturnType<typeof loadCurrentEventSnapshot>>;
      try {
        snapshot = await loadCurrentEventSnapshot(rec.calendarEventId);
      } catch (error) {
        // Transient error — skip and retry on next cron tick
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Transient error loading event ${rec.calendarEventId}, will retry: ${msg}`);
        result.skipped++;
        continue;
      }

      if (!snapshot?.startsAt) {
        // Event deleted or missing startsAt — permanently invalid
        try {
          await patchRecording(rec.id, { status: 'FAILED' });
        } catch {
          // best-effort
        }
        result.failed++;
        continue;
      }

      const eventTime = new Date(snapshot.startsAt).getTime();
      if (eventTime < now) {
        try {
          await patchRecording(rec.id, { status: 'FAILED' });
        } catch {
          // best-effort
        }
        result.failed++;
        continue;
      }

      if (eventTime > schedulingHorizon) {
        result.skipped++;
        continue;
      }

      if (!snapshot.conferenceUrl) {
        // No conference URL yet — skip and retry (URL may be added later)
        result.skipped++;
        continue;
      }

      // Qualification may return null for legitimate reasons (no qualifying members,
      // preference says don't record) or due to transient API failures in sub-calls.
      // Skip rather than FAILED so the next cron tick can retry.
      const qualified = await qualifyEventForScheduling(
        rec.calendarEventId,
        snapshot.conferenceUrl,
        snapshot.startsAt,
        snapshot.title,
      );
      if (!qualified) {
        result.skipped++;
        continue;
      }

      try {
        await patchRecording(rec.id, {
          name: qualified.meetingTitle
            ? `Pending: ${qualified.meetingTitle}`
            : `Pending: ${qualified.conferenceUrl}`,
          date: qualified.startsAt,
          platform: detectPlatform(qualified.conferenceUrl),
          meetingUrl: {
            primaryLinkLabel: 'Join Meeting',
            primaryLinkUrl: qualified.conferenceUrl,
            secondaryLinks: null,
          },
          workspaceMemberId: qualified.workspaceMemberId,
        });
      } catch {
        // best-effort
      }

      valid.push({ recordingId: rec.id, qualified });
    }

    if (valid.length === 0) return result;

    valid.sort(
      (a, b) =>
        new Date(a.qualified.startsAt).getTime() - new Date(b.qualified.startsAt).getTime(),
    );

    const client = new MeetingBaasApiClient(apiKey);

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);

      const items = batch.map(({ qualified }) => ({
        meeting_url: qualified.conferenceUrl,
        join_at: qualified.startsAt,
        bot_name: qualified.botName,
        transcription_enabled: true,
        transcription_config: { provider: 'gladia' as const },
        ...(qualified.entryMessage && { entry_message: qualified.entryMessage }),
        extra: {
          calendarEventId: qualified.calendarEventId,
          workspaceMemberId: qualified.workspaceMemberId,
          meeting_url: qualified.conferenceUrl,
          meeting_title: qualified.meetingTitle,
        },
        callback_enabled: true as const,
        callback_config: {
          url: callbackUrl,
          secret: apiKey,
        },
      }));

      try {
        const batchResult = await client.batchCreateScheduledBots(items);

        // Update successfully scheduled recordings using index to map back
        for (const { index, bot_id: botId } of batchResult.data) {
          const rec = batch[index];
          try {
            await patchRecording(rec.recordingId, {
              botId,
              status: 'SCHEDULED',
              name: rec.qualified.meetingTitle
                ? `Scheduled: ${rec.qualified.meetingTitle}`
                : `Scheduled: ${rec.qualified.conferenceUrl}`,
              date: rec.qualified.startsAt,
              meetingUrl: {
                primaryLinkLabel: 'Join Meeting',
                primaryLinkUrl: rec.qualified.conferenceUrl,
                secondaryLinks: null,
              },
              workspaceMemberId: rec.qualified.workspaceMemberId,
            });
            result.scheduled++;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Failed to update recording ${rec.recordingId}: ${msg}`);
          }
        }

        // Mark errors as FAILED
        for (const err of batchResult.errors) {
          const rec = batch[err.index];
          if (rec) {
            try {
              await patchRecording(rec.recordingId, { status: 'FAILED' });
            } catch {
              // best-effort
            }
            result.failed++;
            result.errors.push(
              `Event ${rec.qualified.calendarEventId}: ${err.code} - ${err.message}`,
            );
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Batch API error: ${msg}`);
        logger.error(`Batch API call failed: ${msg}`);
        // Mark all recordings in this batch as FAILED
        for (const rec of batch) {
          try {
            await patchRecording(rec.recordingId, { status: 'FAILED' });
          } catch {
            // best-effort
          }
          result.failed++;
        }
      }

      // Rate limit: sleep between batches
      if (i + BATCH_SIZE < valid.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    logger.debug(`batch complete: ${result.scheduled} scheduled, ${result.failed} failed`);
    return result;
  } finally {
    await lock.release();
  }
};
