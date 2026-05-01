import axios from 'axios';
import { open, readFile, rename, rm, writeFile } from 'fs/promises';
import { MeetingBaasApiClient, RateLimitError } from '../meeting-baas-api-client';
import { createLogger } from '../logger';
import { detectPlatform } from '../twenty-sync-service';
import { buildRestUrl, getRestApiUrl, restHeaders } from '../utils';
import { getMeetingBaasCallbackUrl } from '../workspace-webhook-url';
import {
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
  conferenceUrl: string;
  startsAt: string;
  name: string;
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

  return recordings.map((r) => {
    const meetingUrl = r.meetingUrl as { primaryLinkUrl?: string } | undefined;
    return {
      id: r.id as string,
      calendarEventId: (r.calendarEventId as string) || '',
      workspaceMemberId: (r.workspaceMemberId as string) || '',
      conferenceUrl: meetingUrl?.primaryLinkUrl || '',
      startsAt: (r.date as string) || '',
      name: (r.name as string) || '',
    };
  });
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

    if (pending.length === 0) {
      console.error('[process-pending] no pending recordings found');
      return result;
    }

    console.error(`[process-pending] found ${pending.length} pending recordings to process`);

    // Re-resolve live event state for each pending row.
    const now = Date.now();
    const schedulingHorizon = now + MAX_SCHEDULE_AHEAD_MS;
    const valid: EligiblePendingRecording[] = [];
    for (const rec of pending) {
      if (!rec.calendarEventId) {
        console.error(`[process-pending] ${rec.id}: no calendarEventId → FAILED`);
        try {
          await patchRecording(rec.id, { status: 'FAILED' });
        } catch {
          // best-effort
        }
        result.failed++;
        continue;
      }

      // Use event data stored in the recording (set by on-calendar-event-created/updated).
      // We can't query calendarEvents via REST — app tokens are blocked by query hooks.
      console.error(`[process-pending] ${rec.id}: conferenceUrl=${rec.conferenceUrl} startsAt=${rec.startsAt}`);

      if (!rec.startsAt) {
        console.error(`[process-pending] ${rec.id}: no startsAt → FAILED`);
        try {
          await patchRecording(rec.id, { status: 'FAILED' });
        } catch {
          // best-effort
        }
        result.failed++;
        continue;
      }

      const eventTime = new Date(rec.startsAt).getTime();
      if (eventTime < now) {
        console.error(`[process-pending] ${rec.id}: event in the past (${rec.startsAt}) → FAILED`);
        try {
          await patchRecording(rec.id, { status: 'FAILED' });
        } catch {
          // best-effort
        }
        result.failed++;
        continue;
      }

      if (eventTime > schedulingHorizon) {
        console.error(`[process-pending] ${rec.id}: event too far in future → SKIPPED`);
        result.skipped++;
        continue;
      }

      if (!rec.conferenceUrl) {
        console.error(`[process-pending] ${rec.id}: no conferenceUrl → SKIPPED`);
        result.skipped++;
        continue;
      }

      // Qualification may return null for legitimate reasons (no qualifying members,
      // preference says don't record) or due to transient API failures in sub-calls.
      // Skip rather than FAILED so the next cron tick can retry.
      const titleFromName = rec.name.replace(/^Pending:\s*/, '').replace(/^Pending schedule:\s*/, '');
      const qualified = await qualifyEventForScheduling(
        rec.calendarEventId,
        rec.conferenceUrl,
        rec.startsAt,
        titleFromName,
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
        if (error instanceof RateLimitError) {
          // Rate limited — leave remaining as PENDING_SCHEDULE for next cron tick
          const retryAfter = error.retryAfterSeconds;
          console.error(`[process-pending] rate limited, retry after ${retryAfter}s — deferring ${valid.length - i} remaining`);
          result.errors.push(`Rate limited — retry after ${retryAfter}s`);
          result.skipped += valid.length - i - batch.length;
          break;
        }

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
