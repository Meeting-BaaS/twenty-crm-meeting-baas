import { createBaasClient, type BaasClient, type V2 } from '@meeting-baas/sdk';
import { createLogger } from './logger';
import type { MeetingPlatform, RecordingData } from './types';
import { detectPlatform } from './twenty-sync-service';

const logger = createLogger('meeting-baas-api');

export class MeetingBaasApiClient {
  private client: BaasClient<'v2'>;

  constructor(apiKey: string) {
    if (!apiKey) {
      logger.critical('MEETING_BAAS_API_KEY is required but not provided');
      throw new Error('MEETING_BAAS_API_KEY is required');
    }
    this.client = createBaasClient({
      api_key: apiKey,
      api_version: 'v2',
      timeout: 60000,
    }) as BaasClient<'v2'>;
  }

  // Create a scheduled bot to join a meeting at a specific time
  async createScheduledBot(options: {
    meetingUrl: string;
    joinAt: string;
    botName?: string;
    recordingMode?: 'speaker_view' | 'gallery_view' | 'audio_only';
    extra?: Record<string, unknown>;
    callbackUrl?: string;
    callbackSecret?: string;
  }): Promise<string> {
    logger.debug(`scheduling bot for meeting: ${options.meetingUrl} at ${options.joinAt}`);

    const result = await this.client.createScheduledBot({
      meeting_url: options.meetingUrl,
      join_at: options.joinAt,
      bot_name: options.botName || 'Twenty CRM Recorder',
      ...(options.recordingMode && { recording_mode: options.recordingMode }),
      ...(options.extra && { extra: options.extra }),
      ...(options.callbackUrl && {
        callback_enabled: true,
        callback_config: {
          url: options.callbackUrl,
          ...(options.callbackSecret && { secret: options.callbackSecret }),
        },
      }),
    });

    if (!result.success) {
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS API error${errorInfo}: ${result.error}`);
    }

    const botId = result.data.bot_id;
    logger.debug(`scheduled bot created with id: ${botId}`);
    return botId;
  }

  // Batch-create scheduled bots (up to 100 items per call)
  async batchCreateScheduledBots(
    items: Array<{
      meetingUrl: string;
      joinAt: string;
      botName?: string;
      recordingMode?: 'speaker_view' | 'gallery_view' | 'audio_only';
      extra?: Record<string, unknown>;
      callbackUrl?: string;
      callbackSecret?: string;
    }>,
  ): Promise<{ botIds: string[]; errors: Array<{ index: number; code: string; message: string }> }> {
    logger.debug(`batch scheduling ${items.length} bots`);

    const params = items.map((item) => ({
      meeting_url: item.meetingUrl,
      join_at: item.joinAt,
      bot_name: item.botName || 'Twenty CRM Recorder',
      ...(item.recordingMode && { recording_mode: item.recordingMode }),
      ...(item.extra && { extra: item.extra }),
      ...(item.callbackUrl && {
        callback_enabled: true as const,
        callback_config: {
          url: item.callbackUrl,
          ...(item.callbackSecret && { secret: item.callbackSecret }),
        },
      }),
    }));

    const result = await this.client.batchCreateScheduledBots(params);

    if (!result.success) {
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS batch API error${errorInfo}: ${result.error}`);
    }

    const botIds = result.data.map((d) => d.bot_id);
    const errors = result.errors.map((e) => ({
      index: e.index,
      code: e.code,
      message: e.message,
    }));

    logger.debug(`batch result: ${botIds.length} created, ${errors.length} failed`);
    return { botIds, errors };
  }

  // Transform V2 bot.completed webhook data into normalized RecordingData
  transformWebhookData(
    data: V2.BotWebhookCompletedData,
    extra?: Record<string, unknown> | null,
  ): RecordingData {
    const duration = data.duration_seconds ?? 0;
    const extraData = extra ?? {};
    const meetingUrl = (extraData.meeting_url as string) || '';
    const title = (extraData.meeting_title as string) || `Recording ${new Date().toLocaleDateString()}`;
    const platform: MeetingPlatform = detectPlatform(meetingUrl);

    return {
      botId: data.bot_id,
      title,
      date: data.joined_at || new Date().toISOString(),
      duration,
      transcript: '',
      transcriptionUrl: data.transcription || undefined,
      diarizationUrl: data.diarization || undefined,
      mp4Url: data.video || '',
      meetingUrl,
      platform,
      extra: extraData,
    };
  }

  // Fetch and format transcript from diarization or transcription URL
  async fetchTranscript(recordingData: RecordingData): Promise<string> {
    // Prefer diarization (speaker-attributed)
    const url = recordingData.diarizationUrl || recordingData.transcriptionUrl;
    if (!url) return '';

    try {
      const response = await fetch(url);
      if (!response.ok) {
        logger.warn(`Failed to fetch transcript: ${response.status}`);
        return '';
      }

      const text = await response.text();

      if (recordingData.diarizationUrl) {
        // Diarization is JSONL: one JSON object per line
        // Format: {"speaker": "Name", "text": "...", "start": 0.0, "end": 1.0}
        return text
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => {
            try {
              const entry = JSON.parse(line) as Record<string, unknown>;
              const speaker = (entry.speaker as string) || 'Unknown';
              const content = (entry.text as string) || '';
              return `${speaker}: ${content}`;
            } catch {
              return '';
            }
          })
          .filter(Boolean)
          .join('\n');
      }

      return text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to fetch transcript: ${msg}`);
      return '';
    }
  }
}
