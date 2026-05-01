import { defineLogicFunction, type CronPayload } from 'twenty-sdk/define';
import { createLogger } from '../logger';
import { processPendingSchedules } from './process-pending-schedules';

const logger = createLogger('daily-schedule-pending');

export default defineLogicFunction({
  universalIdentifier: 'c8f4d2a1-6b3e-4a9c-8d7f-2e5a1b3c4d6e',
  name: 'daily-schedule-pending',
  description:
    'Runs every 5 minutes to drain pending recording schedules once they are eligible.',
  timeoutSeconds: 60,
  cronTriggerSettings: {
    // Every 5 minutes
    pattern: '*/5 * * * *',
  },
  handler: async (_event: CronPayload): Promise<object> => {
    const result = await processPendingSchedules();
    logger.debug(
      `cron run: ${result.scheduled} scheduled, ${result.failed} failed, ${result.skipped} skipped (outside window)`,
    );
    return result;
  },
});
