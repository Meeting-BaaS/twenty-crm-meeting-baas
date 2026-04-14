import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookHandler } from './webhook-handler';
import { WebhookEvent } from './types';

const mocks = vi.hoisted(() => ({
  generateSummary: vi.fn(),
  syncBotRecording: vi.fn(),
  transformWebhookData: vi.fn(),
  meetingBaasConstructor: vi.fn(),
}));

vi.mock('./generate-summary', () => ({
  generateSummary: mocks.generateSummary,
}));

vi.mock('./twenty-sync-service', () => ({
  syncBotRecording: mocks.syncBotRecording,
}));

vi.mock('./meeting-baas-api-client', () => ({
  MeetingBaasApiClient: class {
    constructor(apiKey: string) {
      mocks.meetingBaasConstructor(apiKey);
    }

    transformWebhookData(...args: unknown[]) {
      return mocks.transformWebhookData(...args);
    }
  },
}));

const completedPayload = {
  event: WebhookEvent.COMPLETED,
  data: {
    bot_id: 'bot-123',
    duration_seconds: 1800,
    video: 'https://example.com/recording.mp4',
    joined_at: '2026-04-14T10:00:00Z',
    participants: [],
  },
  extra: {
    meeting_url: 'https://meet.google.com/abc-defg-hij',
    meeting_title: 'Test Recording',
    calendarEventId: 'calendar-event-1',
    workspaceMemberId: 'workspace-member-1',
  },
} as const;

describe('WebhookHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MEETING_BAAS_API_KEY = 'secret-123';

    mocks.transformWebhookData.mockReturnValue({
      botId: 'bot-123',
      title: 'Test Recording',
      date: '2026-04-14T10:00:00Z',
      duration: 1800,
      transcript: 'Transcript text',
      mp4Url: 'https://example.com/recording.mp4',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      platform: 'GOOGLE_MEET',
      extra: {
        calendarEventId: 'calendar-event-1',
        workspaceMemberId: 'workspace-member-1',
      },
    });
    mocks.generateSummary.mockResolvedValue('Summary text');
    mocks.syncBotRecording.mockResolvedValue('recording-123');
  });

  it('processes a completed webhook authenticated with x-mb-secret', async () => {
    const handler = new WebhookHandler();

    const result = await handler.handle(
      { body: completedPayload },
      { 'x-mb-secret': 'secret-123' },
    );

    expect(result).toEqual({
      success: true,
      errors: [],
      durationMinutes: 30,
      recordingId: 'recording-123',
    });
    expect(mocks.meetingBaasConstructor).toHaveBeenCalledWith('secret-123');
    expect(mocks.generateSummary).toHaveBeenCalledWith('Transcript text');
    expect(mocks.syncBotRecording).toHaveBeenCalledWith(
      {
        botId: 'bot-123',
        title: 'Test Recording',
        date: '2026-04-14T10:00:00Z',
        duration: 1800,
        transcript: 'Transcript text',
        summary: 'Summary text',
        mp4Url: 'https://example.com/recording.mp4',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        platform: 'GOOGLE_MEET',
        calendarEventId: 'calendar-event-1',
        workspaceMemberId: 'workspace-member-1',
      },
      {
        recordingsProcessed: 0,
        recordingsCreated: 0,
        recordingsUpdated: 0,
        errors: [],
      },
    );
  });

  it('accepts the legacy x-meeting-baas-api-key header from wrapped params', async () => {
    const handler = new WebhookHandler();

    const result = await handler.handle({
      headers: { 'x-meeting-baas-api-key': 'secret-123' },
      payload: completedPayload,
    });

    expect(result.success).toBe(true);
    expect(mocks.syncBotRecording).toHaveBeenCalledOnce();
  });

  it('rejects webhooks with mismatched auth headers', async () => {
    const handler = new WebhookHandler();

    const result = await handler.handle(completedPayload, {
      'x-mb-secret': 'wrong-secret',
    });

    expect(result).toEqual({
      success: false,
      errors: ['Invalid webhook API key'],
    });
    expect(mocks.syncBotRecording).not.toHaveBeenCalled();
  });

  it('acknowledges status change events without syncing a recording', async () => {
    const handler = new WebhookHandler();

    const result = await handler.handle(
      {
        event: WebhookEvent.STATUS_CHANGE,
        data: {
          bot_id: 'bot-123',
          status: 'joined',
        },
      },
      { 'x-mb-secret': 'secret-123' },
    );

    expect(result).toEqual({
      success: true,
      errors: [],
    });
    expect(mocks.syncBotRecording).not.toHaveBeenCalled();
    expect(mocks.generateSummary).not.toHaveBeenCalled();
  });
});
