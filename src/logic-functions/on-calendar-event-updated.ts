import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { createLogger } from '../logger';
import { checkIfActiveRecordingExistsForEvent } from '../twenty-sync-service';
import { createPendingRecording } from './schedule-bot';

const logger = createLogger('on-calendar-event-updated');

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

  // Dedup: skip if an active (non-FAILED) recording already exists for this event
  const alreadyExists = await checkIfActiveRecordingExistsForEvent(recordId);
  if (alreadyExists) {
    return { skipped: true, reason: 'active recording already exists for this calendar event' };
  }

  try {
    const recordingId = await createPendingRecording(recordId);
    if (!recordingId) {
      return { skipped: true, reason: 'failed to create pending recording' };
    }

    return {
      queued: true,
      recordingId,
      calendarEventId: recordId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to schedule bot for updated calendar event ${recordId}: ${msg}`);
    return { error: msg };
  }
};

export default defineLogicFunction({
  universalIdentifier: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  name: 'on-calendar-event-updated',
  description: 'Schedules a Meeting BaaS bot when a calendar event gains a conference link',
  timeoutSeconds: 15,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.updated',
    updatedFields: ['conferenceLink'],
  },
});
