// Meeting platform types
export type MeetingPlatform =
  | 'GOOGLE_MEET'
  | 'ZOOM'
  | 'MICROSOFT_TEAMS'
  | 'UNKNOWN';

// Webhook handler result
export type ProcessResult = {
  success: boolean;
  recordingId?: string;
  errors?: string[];
  durationMinutes?: number;
};

// Recording status
export type RecordingStatus = 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'PENDING_SCHEDULE' | 'SCHEDULED';

// Recording upsert input for the REST API
export type RecordingUpsertInput = {
  botId: string;
  name: string;
  date: string | null;
  duration: number;
  platform: MeetingPlatform;
  status: RecordingStatus;
  meetingUrl: { primaryLinkLabel: string; primaryLinkUrl: string; secondaryLinks: null } | null;
  mp4Url: { primaryLinkLabel: string; primaryLinkUrl: string; secondaryLinks: null } | null;
  transcript: string;
  summary?: string;
  participantNames?: string;
  participantEmails?: string;
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
