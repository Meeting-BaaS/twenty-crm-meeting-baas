import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookHandler } from './webhook-handler';

const mocks = vi.hoisted(() => ({
  generateSummary: vi.fn(),
  syncBotRecording: vi.fn(),
  checkIfRecordingExists: vi.fn(),
  upsertRecordingStatus: vi.fn(),
  transformWebhookData: vi.fn(),
  fetchTranscript: vi.fn(),
  meetingBaasConstructor: vi.fn(),
}));

vi.mock('./generate-summary', () => ({
  generateSummary: mocks.generateSummary,
}));

vi.mock('./twenty-sync-service', () => ({
  syncBotRecording: mocks.syncBotRecording,
  checkIfRecordingExists: mocks.checkIfRecordingExists,
  upsertRecordingStatus: mocks.upsertRecordingStatus,
}));

vi.mock('./meeting-baas-api-client', () => ({
  MeetingBaasApiClient: class {
    constructor(apiKey: string) {
      mocks.meetingBaasConstructor(apiKey);
    }

    transformWebhookData(...args: unknown[]) {
      return mocks.transformWebhookData(...args);
    }

    fetchTranscript(...args: unknown[]) {
      return mocks.fetchTranscript(...args);
    }
  },
}));

const completedPayload = {
  event: 'bot.completed',
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
      transcript: '',
      mp4Url: 'https://example.com/recording.mp4',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      platform: 'GOOGLE_MEET',
      participantNames: ['Alice Example', 'Bob Example'],
      extra: {
        calendarEventId: 'calendar-event-1',
        workspaceMemberId: 'workspace-member-1',
      },
    });
    mocks.fetchTranscript.mockResolvedValue('Speaker A: Hello\nSpeaker B: Hi');
    mocks.generateSummary.mockResolvedValue('Summary text');
    mocks.syncBotRecording.mockResolvedValue('recording-123');
    mocks.checkIfRecordingExists.mockResolvedValue(null);
    mocks.upsertRecordingStatus.mockResolvedValue(undefined);
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
    expect(mocks.fetchTranscript).toHaveBeenCalledOnce();
    expect(mocks.generateSummary).toHaveBeenCalledWith('Speaker A: Hello\nSpeaker B: Hi');
    expect(mocks.syncBotRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'bot-123',
        title: 'Test Recording',
        transcript: 'Speaker A: Hello\nSpeaker B: Hi',
        summary: 'Summary text',
        participantNames: ['Alice Example', 'Bob Example'],
        calendarEventId: 'calendar-event-1',
        workspaceMemberId: 'workspace-member-1',
      }),
      expect.any(Object),
    );
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

  it('reports bot.failed events as errors', async () => {
    const handler = new WebhookHandler();

    const result = await handler.handle(
      {
        event: 'bot.failed',
        data: {
          bot_id: 'bot-123',
          error_message: 'timeout',
          error_code: 'TIMEOUT',
        },
      },
      { 'x-mb-secret': 'secret-123' },
    );

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Meeting BaaS bot failed: timeout');
    expect(mocks.syncBotRecording).not.toHaveBeenCalled();
  });

  it('propagates sync errors to the result', async () => {
    mocks.syncBotRecording.mockImplementation((_data: unknown, syncResult: { errors: { botId: string; error: string }[] }) => {
      syncResult.errors.push({ botId: 'bot-123', error: '500: Internal Server Error' });
      return null;
    });

    const handler = new WebhookHandler();

    const result = await handler.handle(completedPayload, {
      'x-mb-secret': 'secret-123',
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Failed to sync recording');
  });
});
