import axios from 'axios';
import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk';
import { createLogger } from '../logger';
import { getRestApiUrl } from '../utils';
import { scheduleBot } from './schedule-bot';

const logger = createLogger('on-calendar-event-updated');

type CalendarEvent = {
  conferenceLink?: {
    primaryLinkUrl?: string;
  };
  startsAt?: string;
};

type CalendarEventUpdatedEvent = DatabaseEventPayload<
  ObjectRecordUpdateEvent<CalendarEvent>
>;

const TWENTY_API_KEY = process.env.TWENTY_API_KEY ?? '';

// Check if a recording is already linked to this calendar event
const hasExistingRecording = async (calendarEventId: string): Promise<boolean> => {
  try {
    const response = await axios({
      method: 'GET',
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
      url: `${getRestApiUrl()}/recordings?filter=calendarEventId%5Beq%5D%3A%22${encodeURIComponent(calendarEventId)}%22&limit=1`,
    });
    const recordings: Record<string, unknown>[] =
      response.data?.data?.recordings ?? [];
    return recordings.length > 0;
  } catch {
    return false;
  }
};

const handler = async (
  event: CalendarEventUpdatedEvent,
): Promise<object | undefined> => {
  const { properties, recordId } = event;
  const conferenceLink = properties.after?.conferenceLink?.primaryLinkUrl;
  const startsAt = properties.after?.startsAt;

  if (!conferenceLink) {
    return { skipped: true, reason: 'no conference link after update' };
  }

  if (!startsAt) {
    return { skipped: true, reason: 'no start time' };
  }

  // Check if a recording or bot is already associated with this event
  const alreadyRecorded = await hasExistingRecording(recordId);
  if (alreadyRecorded) {
    return { skipped: true, reason: 'recording already exists for this calendar event' };
  }

  try {
    const botId = await scheduleBot(recordId, conferenceLink, startsAt);
    if (!botId) {
      return { skipped: true, reason: 'bot not scheduled (preference or config)' };
    }
    return { scheduled: true, botId, calendarEventId: recordId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to schedule bot for updated calendar event ${recordId}: ${msg}`);
    return { error: msg };
  }
};

export default defineLogicFunction({
  universalIdentifier: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  name: 'on-calendar-event-updated',
  description: 'Schedules a Meeting BaaS recording bot when a calendar event gains a conference link',
  timeoutSeconds: 15,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.updated',
    updatedFields: ['conferenceLink'],
  },
});
