import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { createLogger } from '../logger';
import { RateLimitError } from '../meeting-baas-api-client';
import { checkIfActiveRecordingExistsForEvent } from '../twenty-sync-service';
import { createPendingRecording, scheduleBot } from './schedule-bot';

const logger = createLogger('on-calendar-event-updated');

// Meeting BaaS enforces a 90-day limit on join_at for scheduled bots.
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
// Max jitter to spread concurrent scheduling calls
const MAX_JITTER_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CalendarEvent = {
  conferenceLink?: {
    primaryLinkUrl?: string;
  };
  startsAt?: string;
  title?: string;
};

type CalendarEventUpdatedEvent = DatabaseEventPayload<
  ObjectRecordUpdateEvent<CalendarEvent>
>;

const handler = async (
  event: CalendarEventUpdatedEvent,
): Promise<object | undefined> => {
  const { properties, recordId } = event;
  const conferenceLink = properties.after?.conferenceLink?.primaryLinkUrl;
  const startsAt = properties.after?.startsAt;
  const title = properties.after?.title;

  if (!conferenceLink) {
    return { skipped: true, reason: 'no conference link after update' };
  }

  if (!startsAt) {
    return { skipped: true, reason: 'no start time' };
  }

  // Skip past events
  const eventTime = new Date(startsAt).getTime();
  if (eventTime < Date.now()) {
    return { skipped: true, reason: 'event in the past' };
  }

  // Dedup: skip if an active (non-FAILED) recording already exists for this event
  const alreadyExists = await checkIfActiveRecordingExistsForEvent(recordId);
  if (alreadyExists) {
    return { skipped: true, reason: 'active recording already exists for this calendar event' };
  }

  // Events beyond 90 days: only create PENDING_SCHEDULE
  if (eventTime > Date.now() + MAX_SCHEDULE_AHEAD_MS) {
    const recordingId = await createPendingRecording(recordId, {
      conferenceUrl: conferenceLink,
      startsAt,
      title,
    });
    return { queued: true, recordingId, calendarEventId: recordId };
  }

  // Step 1: Create PENDING_SCHEDULE immediately
  const pendingId = await createPendingRecording(recordId, {
    conferenceUrl: conferenceLink,
    startsAt,
    title,
  });

  // Step 2: Jitter to spread concurrent requests
  await sleep(Math.random() * MAX_JITTER_MS);

  // Step 3: Try direct scheduling
  try {
    const botId = await scheduleBot(recordId, conferenceLink, startsAt, { skipDedupCheck: true });

    if (botId) {
      return { scheduled: true, botId, pendingId, calendarEventId: recordId };
    }

    return { skipped: true, pendingId, reason: 'no qualifying members' };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { deferred: true, pendingId, calendarEventId: recordId, retryAfterSeconds: error.retryAfterSeconds };
    }

    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to schedule bot for updated calendar event ${recordId}: ${msg}`);
    return { error: msg, pendingId };
  }
};

export default defineLogicFunction({
  universalIdentifier: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  name: 'on-calendar-event-updated',
  description: 'Schedules a Meeting BaaS bot when a calendar event gains a conference link',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.updated',
  },
});
