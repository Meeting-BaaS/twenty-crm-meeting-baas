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

  console.error(`[on-calendar-event-created] recordId=${recordId} conferenceLink=${conferenceLink} startsAt=${startsAt}`);

  if (!conferenceLink) {
    console.error(`[on-calendar-event-created] EXIT: no conference link`);
    return { skipped: true, reason: 'no conference link' };
  }

  if (!startsAt) {
    console.error(`[on-calendar-event-created] EXIT: no start time`);
    return { skipped: true, reason: 'no start time' };
  }

  try {
    const botId = await scheduleBot(recordId, conferenceLink, startsAt);
    if (!botId) {
      console.error(`[on-calendar-event-created] EXIT: scheduleBot returned null`);
      return { skipped: true, reason: 'bot not scheduled (preference or config)' };
    }
    console.error(`[on-calendar-event-created] SUCCESS: botId=${botId}`);
    return { scheduled: true, botId, calendarEventId: recordId };
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
