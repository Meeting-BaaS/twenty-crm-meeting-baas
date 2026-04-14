// SDK entity definitions (discovered automatically by twenty app build)
export { default as RecordingObject, RECORDING_UNIVERSAL_IDENTIFIER } from './objects/recording';

// Field on standard object
export { default as RecordingPreferenceField } from './fields/recording-preference-on-workspace-member.field';

// Front component
export { default as MeetingBaasSettingsComponent } from './front-components/meeting-baas-settings.front-component';

// Logic functions (database event triggers)
export { default as OnCalendarEventCreated } from './logic-functions/on-calendar-event-created';
export { default as OnCalendarEventUpdated } from './logic-functions/on-calendar-event-updated';

// Logic functions (HTTP-triggered)
export { default as BatchScheduleBots } from './logic-functions/batch-schedule-bots';

// Types
export type {
  BotWebhookCompleted,
  BotWebhookCompletedData,
  BotWebhookFailed,
  BotWebhookFailedData,
  CalendarEventOwnership,
  MeetingBaasWebhookPayload,
  MeetingPlatform,
  ProcessResult,
  RecordingData,
  RecordingUpsertInput,
  SyncResult,
} from './types';

// Services
export { MeetingBaasApiClient } from './meeting-baas-api-client';
export { WebhookHandler } from './webhook-handler';

// AI summary
export { generateSummary } from './generate-summary';

// Sync service
export {
  checkIfRecordingExists,
  checkIfRecordingExistsForEvent,
  detectPlatform,
  resolveCalendarEventOwner,
  syncBotRecording,
  upsertRecording,
} from './twenty-sync-service';

// Utilities
export { createLogger } from './logger';
export { getApiUrl, getRestApiUrl, restHeaders } from './utils';
export {
  WebhookPayloadSchema,
  getApiKeyFingerprint,
  parseWebhookPayload,
  verifyWebhookApiKey,
} from './webhook-validator';
export type { ParsedWebhookPayload } from './webhook-validator';
