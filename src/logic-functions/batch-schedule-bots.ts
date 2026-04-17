import axios from 'axios';
import { defineLogicFunction } from 'twenty-sdk';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import {
  resolveCalendarEventOwner,
  checkIfRecordingExistsForEvent,
  upsertRecording,
  detectPlatform,
} from '../twenty-sync-service';
import { createLogger } from '../logger';
import { buildRestUrl, restHeaders } from '../utils';

const logger = createLogger('batch-schedule-bots');

type RecordingPreference = 'RECORD_ALL' | 'RECORD_ORGANIZED' | 'RECORD_NONE';

// Max events to inspect per invocation (logic function has a 60s timeout)
const MAX_EVENTS_PER_RUN = 200;
// SDK batch endpoint supports up to 100 items
const BATCH_SIZE = 100;

type ConferenceLink = {
  primaryLinkUrl?: string;
  primaryLinkLabel?: string;
  secondaryLinks?: unknown[];
};

type CalendarEvent = {
  id: string;
  conferenceUrl?: string;
  startsAt?: string;
  title?: string;
};

type BatchResult = {
  scheduled: number;
  skipped: number;
  errors: string[];
  hasMore: boolean;
};

const fetchWorkspaceMemberPreference = async (
  workspaceMemberId: string,
): Promise<RecordingPreference> => {
  try {
    const response = await axios.get(
      buildRestUrl(`workspaceMembers/${workspaceMemberId}`),
      { headers: restHeaders() },
    );
    const body = response.data?.data ?? response.data;
    const memberData = body?.workspaceMember ?? body;
    return (memberData?.recordingPreference as RecordingPreference) ?? 'RECORD_NONE';
  } catch {
    return 'RECORD_NONE';
  }
};

const isOrganizer = async (
  calendarEventId: string,
  workspaceMemberId: string,
): Promise<boolean> => {
  try {
    const url = buildRestUrl('calendarEventParticipants', {
      filter: { calendarEventId: { eq: calendarEventId } },
      limit: 50,
    });
    const response = await axios.get(url, { headers: restHeaders() });
    const participants: Record<string, unknown>[] =
      response.data?.data?.calendarEventParticipants ?? [];
    return participants.some(
      (p) => p.isOrganizer === true && p.workspaceMemberId === workspaceMemberId,
    );
  } catch {
    return false;
  }
};

// Paginate through future calendar events with conference links
const fetchFutureCalendarEvents = async (
  maxEvents: number,
): Promise<{ events: CalendarEvent[]; hasMore: boolean }> => {
  const now = new Date().toISOString();
  const events: CalendarEvent[] = [];
  let cursor: string | undefined;

  while (events.length < maxEvents) {
    const pageSize = Math.min(20, maxEvents - events.length);
    const url = buildRestUrl('calendarEvents', {
      filter: { startsAt: { gte: now } },
      limit: pageSize,
      cursor,
    });

    let page: Record<string, unknown>[];
    try {
      const response = await axios.get(url, { headers: restHeaders() });
      page = response.data?.data?.calendarEvents ?? [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        logger.error(`REST API error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }

    if (page.length === 0) break;

    for (const event of page) {
      const conferenceLink = event.conferenceLink as ConferenceLink | undefined;
      const conferenceUrl = conferenceLink?.primaryLinkUrl;
      if (conferenceUrl) {
        events.push({
          id: event.id as string,
          conferenceUrl,
          startsAt: event.startsAt as string | undefined,
          title: event.title as string | undefined,
        });
      }
    }

    // If we got fewer results than the page size, there are no more pages
    if (page.length < pageSize) break;

    cursor = page[page.length - 1].id as string;
  }

  return { events, hasMore: events.length >= maxEvents };
};

export default defineLogicFunction({
  universalIdentifier: 'a7d3e1f2-8b4c-4d5e-9f6a-1c2d3e4f5a6b',
  name: 'batch-schedule-bots',
  description:
    'Schedules bots for all existing future calendar events. Call after enabling recording to catch events that were already synced.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: {
    path: '/batch-schedule-bots',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: [],
  },
  handler: async (): Promise<BatchResult> => {
    const result: BatchResult = { scheduled: 0, skipped: 0, errors: [], hasMore: false };

    const apiKey = process.env.MEETING_BAAS_API_KEY;
    if (!apiKey) {
      result.errors.push('MEETING_BAAS_API_KEY not configured');
      return result;
    }

    const serverUrl = process.env.TWENTY_API_URL ?? '';
    const callbackUrl = serverUrl ? `${serverUrl}/s/webhook/meeting-baas` : undefined;

    // 1. Fetch future calendar events with conference links
    logger.debug('fetching future calendar events');
    const { events, hasMore } = await fetchFutureCalendarEvents(MAX_EVENTS_PER_RUN);
    result.hasMore = hasMore;
    logger.debug(`found ${events.length} future events with conference links`);

    if (events.length === 0) return result;

    // 2. Filter: dedup, resolve ownership, check preferences
    type QualifiedEvent = CalendarEvent & {
      workspaceMemberId: string;
    };
    const qualified: QualifiedEvent[] = [];

    // Cache preferences per workspace member to avoid redundant API calls
    const preferenceCache = new Map<string, RecordingPreference>();

    for (const event of events) {
      // Dedup: skip if recording already exists
      const exists = await checkIfRecordingExistsForEvent(event.id);
      if (exists) {
        result.skipped++;
        continue;
      }

      // Resolve ownership
      const ownership = await resolveCalendarEventOwner(event.id);
      if (!ownership.workspaceMemberId) {
        result.skipped++;
        continue;
      }

      // Check preference (cached per workspace member)
      let preference = preferenceCache.get(ownership.workspaceMemberId);
      if (preference === undefined) {
        preference = await fetchWorkspaceMemberPreference(ownership.workspaceMemberId);
        preferenceCache.set(ownership.workspaceMemberId, preference);
      }

      if (preference === 'RECORD_NONE') {
        result.skipped++;
        continue;
      }

      if (preference === 'RECORD_ORGANIZED') {
        const memberIsOrganizer = await isOrganizer(event.id, ownership.workspaceMemberId);
        if (!memberIsOrganizer) {
          result.skipped++;
          continue;
        }
      }

      qualified.push({ ...event, workspaceMemberId: ownership.workspaceMemberId });
    }

    logger.debug(`${qualified.length} events qualified, ${result.skipped} skipped`);

    if (qualified.length === 0) return result;

    // 3. Batch create scheduled bots
    const client = new MeetingBaasApiClient(apiKey);

    for (let i = 0; i < qualified.length; i += BATCH_SIZE) {
      const batch = qualified.slice(i, i + BATCH_SIZE);

      const items = batch.map((event) => ({
        meetingUrl: event.conferenceUrl!,
        joinAt: event.startsAt!,
        extra: {
          calendarEventId: event.id,
          workspaceMemberId: event.workspaceMemberId,
          meeting_url: event.conferenceUrl,
        },
        callbackUrl,
        callbackSecret: apiKey,
      }));

      try {
        const { botIds, errors } = await client.batchCreateScheduledBots(items);

        // Create placeholder recordings for successfully scheduled bots
        for (let j = 0; j < botIds.length; j++) {
          const event = batch[j];
          try {
            await upsertRecording({
              botId: botIds[j],
              name: event.title ? `Scheduled: ${event.title}` : `Scheduled: ${event.conferenceUrl}`,
              date: event.startsAt!,
              duration: 0,
              platform: detectPlatform(event.conferenceUrl!),
              status: 'IN_PROGRESS',
              meetingUrl: { primaryLinkLabel: 'Join Meeting', primaryLinkUrl: event.conferenceUrl!, secondaryLinks: null },
              mp4Url: null,
              transcript: '',
              calendarEventId: event.id,
              workspaceMemberId: event.workspaceMemberId,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to create placeholder for bot ${botIds[j]}: ${msg}`);
          }
          result.scheduled++;
        }

        for (const err of errors) {
          const event = batch[err.index];
          result.errors.push(`Event ${event?.id}: ${err.code} - ${err.message}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Batch API error: ${msg}`);
        logger.error(`Batch API call failed: ${msg}`);
      }
    }

    logger.debug(`batch complete: ${result.scheduled} scheduled, ${result.errors.length} errors`);
    return result;
  },
});
