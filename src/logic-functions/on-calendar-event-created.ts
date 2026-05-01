import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { createLogger } from '../logger';
import { RateLimitError } from '../meeting-baas-api-client';
import { checkIfActiveRecordingExistsForEvent, checkIfScheduledRecordingExistsForEvent } from '../twenty-sync-service';
import { createPendingRecording, scheduleBot } from './schedule-bot';

const logger = createLogger('on-calendar-event-created');

// Meeting BaaS enforces a 90-day limit on join_at for scheduled bots.
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
// Max jitter to spread concurrent scheduling calls (initial sync thundering herd)
const MAX_JITTER_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CalendarEvent = {
  conferenceLink?: {
    primaryLinkUrl?: string;
  };
  startsAt?: string;
  title?: string;
};

type CalendarEventCreatedEvent = DatabaseEventPayload<
  ObjectRecordCreateEvent<CalendarEvent>
>;

const handler = async (
  event: CalendarEventCreatedEvent,
): Promise<object | undefined> => {
  const { properties, recordId } = event;
  const conferenceLink = properties.after?.conferenceLink?.primaryLinkUrl;
  const startsAt = properties.after?.startsAt;
  const title = properties.after?.title;

  console.error(`[on-calendar-event-created] recordId=${recordId} conferenceLink=${conferenceLink} startsAt=${startsAt} title=${title}`);

  if (!conferenceLink) {
    console.error(`[on-calendar-event-created] EXIT: no conference link`);
    return { skipped: true, reason: 'no conference link' };
  }

  if (!startsAt) {
    console.error(`[on-calendar-event-created] EXIT: no start time`);
    return { skipped: true, reason: 'no start time' };
  }

  // Skip past events
  const eventTime = new Date(startsAt).getTime();
  if (eventTime < Date.now()) {
    console.error(`[on-calendar-event-created] EXIT: event in the past`);
    return { skipped: true, reason: 'event in the past' };
  }

  // Dedup: skip if an active (non-FAILED) recording already exists for this event
  const alreadyExists = await checkIfActiveRecordingExistsForEvent(recordId);
  if (alreadyExists) {
    console.error(`[on-calendar-event-created] EXIT: active recording already exists`);
    return { skipped: true, reason: 'active recording already exists for this calendar event' };
  }

  // Events beyond 90 days: only create PENDING_SCHEDULE — cron picks up later
  if (eventTime > Date.now() + MAX_SCHEDULE_AHEAD_MS) {
    console.error(`[on-calendar-event-created] event >90 days out, creating PENDING_SCHEDULE`);
    const recordingId = await createPendingRecording(recordId, {
      conferenceUrl: conferenceLink,
      startsAt,
      title,
    });
    return { queued: true, recordingId, calendarEventId: recordId };
  }

  // Step 1: Create PENDING_SCHEDULE immediately (guaranteed fast, no external API).
  // This ensures the event is captured even if scheduling fails or is rate-limited.
  const pendingId = await createPendingRecording(recordId, {
    conferenceUrl: conferenceLink,
    startsAt,
    title,
  });

  // Step 2: Add random jitter to spread concurrent requests during initial sync.
  const jitter = Math.random() * MAX_JITTER_MS;
  console.error(`[on-calendar-event-created] jitter ${Math.round(jitter)}ms before scheduling`);
  await sleep(jitter);

  // Step 2b: After jitter, re-check: did a concurrent trigger already schedule a bot?
  // This catches the race between calendarEvent.created and calendarEvent.updated
  // firing simultaneously for the same event.
  const alreadyScheduled = await checkIfScheduledRecordingExistsForEvent(recordId);
  if (alreadyScheduled) {
    console.error(`[on-calendar-event-created] EXIT: already scheduled by concurrent trigger`);
    return { skipped: true, pendingId, reason: 'already scheduled by concurrent trigger' };
  }

  // Step 3: Try to schedule directly with Meeting BaaS.
  try {
    const botId = await scheduleBot(recordId, conferenceLink, startsAt);

    if (botId) {
      console.error(`[on-calendar-event-created] SUCCESS: botId=${botId}`);
      return { scheduled: true, botId, pendingId, calendarEventId: recordId };
    }

    // scheduleBot returns null when no qualifying member found
    console.error(`[on-calendar-event-created] no qualifying members, PENDING_SCHEDULE remains`);
    return { skipped: true, pendingId, reason: 'no qualifying members' };
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Rate limited — leave PENDING_SCHEDULE for the cron to handle
      console.error(`[on-calendar-event-created] rate limited (retry after ${error.retryAfterSeconds}s), deferring to cron`);
      return { deferred: true, pendingId, calendarEventId: recordId, retryAfterSeconds: error.retryAfterSeconds };
    }

    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[on-calendar-event-created] ERROR: ${msg}, PENDING_SCHEDULE remains`);
    logger.warn(`Failed to schedule bot for calendar event ${recordId}: ${msg}`);
    return { error: msg, pendingId };
  }
};

export default defineLogicFunction({
  universalIdentifier: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'on-calendar-event-created',
  description: 'Schedules a Meeting BaaS bot when a calendar event with a conference link is created',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.created',
  },
});
