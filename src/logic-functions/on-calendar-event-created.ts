import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { createLogger } from '../logger';
import { checkIfActiveRecordingExistsForEvent } from '../twenty-sync-service';
import { createPendingRecording } from './schedule-bot';

const logger = createLogger('on-calendar-event-created');

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

  // Dedup: skip if an active (non-FAILED) recording already exists for this event
  const alreadyExists = await checkIfActiveRecordingExistsForEvent(recordId);
  if (alreadyExists) {
    console.error(`[on-calendar-event-created] EXIT: active recording already exists`);
    return { skipped: true, reason: 'active recording already exists for this calendar event' };
  }

  try {
    const recordingId = await createPendingRecording(recordId);
    if (!recordingId) {
      console.error(`[on-calendar-event-created] EXIT: failed to create pending recording`);
      return { skipped: true, reason: 'failed to create pending recording' };
    }

    return {
      queued: true,
      recordingId,
      calendarEventId: recordId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[on-calendar-event-created] ERROR: ${msg}`);
    logger.warn(`Failed to schedule bot for calendar event ${recordId}: ${msg}`);
    return { error: msg };
  }
};

export default defineLogicFunction({
  universalIdentifier: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'on-calendar-event-created',
  description: 'Schedules a Meeting BaaS bot when a calendar event with a conference link is created',
  timeoutSeconds: 15,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.created',
  },
});
