// SDK V2 types
import type { V2 } from '@meeting-baas/sdk';

export type BotWebhookCompleted = V2.BotWebhookCompleted;
export type BotWebhookCompletedData = V2.BotWebhookCompletedData;
export type BotWebhookFailed = V2.BotWebhookFailed;
export type BotWebhookFailedData = V2.BotWebhookFailedData;
export type BotWebhookStatusChange = V2.BotWebhookStatusChange;

export type MeetingBaasWebhookPayload =
  | BotWebhookCompleted
  | BotWebhookFailed
  | BotWebhookStatusChange;

export const WebhookEvent = {
  COMPLETED: 'bot.completed' as BotWebhookCompleted['event'],
  FAILED: 'bot.failed' as BotWebhookFailed['event'],
  STATUS_CHANGE: 'bot.status_change' as BotWebhookStatusChange['event'],
} as const;

// Meeting platform types
export type MeetingPlatform =
  | 'GOOGLE_MEET'
  | 'ZOOM'
  | 'MICROSOFT_TEAMS'
  | 'UNKNOWN';

// Normalized recording data from Meeting BaaS
export type RecordingData = {
  botId: string;
  title: string;
  date: string;
  duration: number;
  transcript: string;
  transcriptionUrl?: string;
  diarizationUrl?: string;
  mp4Url: string;
  meetingUrl: string;
  platform: MeetingPlatform;
  extra: Record<string, unknown>;
};

// Webhook handler result
export type ProcessResult = {
  success: boolean;
  recordingId?: string;
  errors?: string[];
  durationMinutes?: number;
};

// Recording upsert input for the REST API
export type RecordingUpsertInput = {
  botId: string;
  name: string;
  date: string;
  duration: number;
  platform: MeetingPlatform;
  status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  meetingUrl: { primaryLinkLabel: string; primaryLinkUrl: string; secondaryLinks: null } | null;
  mp4Url: { primaryLinkLabel: string; primaryLinkUrl: string; secondaryLinks: null } | null;
  transcript: string;
  summary?: string;
  calendarEventId?: string;
  workspaceMemberId?: string;
};

// Sync result
export type SyncResult = {
  recordingsProcessed: number;
  recordingsCreated: number;
  recordingsUpdated: number;
  errors: { botId: string; error: string }[];
};

// Ownership chain resolution result
export type CalendarEventOwnership = {
  workspaceMemberId?: string;
  workspaceMemberName?: string;
};
