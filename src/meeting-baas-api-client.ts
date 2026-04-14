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
      mp4Url: data.video || '',
      meetingUrl,
      platform,
      extra: extraData,
    };
  }
}
