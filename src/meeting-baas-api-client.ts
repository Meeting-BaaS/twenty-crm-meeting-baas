import { createBaasClient, type BaasClient, type V2 } from '@meeting-baas/sdk';
import { createLogger } from './logger';
import type { MeetingPlatform, RecordingData } from './types';
import { detectPlatform } from './twenty-sync-service';

const logger = createLogger('meeting-baas-api');

type CreateScheduledBotInput = Parameters<BaasClient<'v2'>['createScheduledBot']>[0];
type BatchCreateScheduledBotsInput = Parameters<BaasClient<'v2'>['batchCreateScheduledBots']>[0];
type BatchCreateScheduledBotsResponse = Awaited<
  ReturnType<BaasClient<'v2'>['batchCreateScheduledBots']>
>;
type SuccessfulBatchCreateScheduledBotsResponse = Extract<
  BatchCreateScheduledBotsResponse,
  { success: true }
>;

const uniqueNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }

  return result;
};

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
  async createScheduledBot(params: CreateScheduledBotInput): Promise<string> {
    logger.debug(`scheduling bot for meeting: ${params.meeting_url} at ${params.join_at}`);

    const result = await this.client.createScheduledBot(params);

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
    params: BatchCreateScheduledBotsInput,
  ): Promise<SuccessfulBatchCreateScheduledBotsResponse> {
    logger.debug(`batch scheduling ${params.length} bots`);

    const result = await this.client.batchCreateScheduledBots(params);

    if (!result.success) {
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS batch API error${errorInfo}: ${result.error}`);
    }

    logger.debug(`batch result: ${result.data.length} created, ${result.errors.length} failed`);
    return result;
  }

  // Fetch bot details including fresh presigned artifact URLs (valid for 4 hours)
  async getBotDetails(botId: string): Promise<{
    video: string | null;
    audio: string | null;
    diarization: string | null;
    transcription: string | null;
  }> {
    logger.debug(`fetching bot details for ${botId}`);

    const result = await this.client.getBotDetails({ bot_id: botId });

    if (!result.success) {
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS API error${errorInfo}: ${result.error}`);
    }

    return {
      video: result.data.video ?? null,
      audio: result.data.audio ?? null,
      diarization: result.data.diarization ?? null,
      transcription: result.data.transcription ?? null,
    };
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
    const participantNames = uniqueNames([
      ...(data.participants ?? []).flatMap((participant) =>
        participant.display_name ? [participant.display_name, participant.name] : [participant.name],
      ),
      ...(data.speakers ?? []).flatMap((speaker) =>
        speaker.display_name ? [speaker.display_name, speaker.name] : [speaker.name],
      ),
    ]);

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
      participantNames,
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
