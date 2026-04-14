import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk';
import { createLogger } from '../logger';
import { scheduleBot } from './schedule-bot';

const logger = createLogger('on-calendar-event-created');

type CalendarEvent = {
  conferenceLink?: {
    primaryLinkUrl?: string;
  };
  startsAt?: string;
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

  if (!conferenceLink) {
    return { skipped: true, reason: 'no conference link' };
  }

  if (!startsAt) {
    return { skipped: true, reason: 'no start time' };
  }

  try {
    const botId = await scheduleBot(recordId, conferenceLink, startsAt);
    if (!botId) {
      return { skipped: true, reason: 'bot not scheduled (preference or config)' };
    }
    return { scheduled: true, botId, calendarEventId: recordId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to schedule bot for calendar event ${recordId}: ${msg}`);
    return { error: msg };
  }
};

export default defineLogicFunction({
  universalIdentifier: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'on-calendar-event-created',
  description: 'Schedules a Meeting BaaS recording bot when a calendar event with a conference link is created',
  timeoutSeconds: 15,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.created',
  },
});
