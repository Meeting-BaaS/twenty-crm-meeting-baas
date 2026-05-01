import { createBaasClient, type BaasClient, type V2 } from '@meeting-baas/sdk';
import { createLogger } from './logger';

const logger = createLogger('meeting-baas-api');

// Thrown when Meeting BaaS returns 429 — callers can catch this to defer scheduling.
export class RateLimitError extends Error {
  /** Seconds to wait before retrying (from Retry-After header), or 0 if unknown */
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message?: string) {
    super(message ?? `Rate limited — retry after ${retryAfterSeconds}s`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type CreateScheduledBotInput = Parameters<BaasClient<'v2'>['createScheduledBot']>[0];
type BatchCreateScheduledBotsInput = Parameters<BaasClient<'v2'>['batchCreateScheduledBots']>[0];
type BatchCreateScheduledBotsResponse = Awaited<
  ReturnType<BaasClient<'v2'>['batchCreateScheduledBots']>
>;
type SuccessfulBatchCreateScheduledBotsResponse = Extract<
  BatchCreateScheduledBotsResponse,
  { success: true }
>;

// Type for the full bot details returned by the SDK
export type BotDetails = Awaited<ReturnType<BaasClient<'v2'>['getBotDetails']>> extends
  | { success: true; data: infer D }
  | { success: false }
  ? D
  : never;

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(v);
  }
  return result;
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Extract display names from SDK participant/speaker data, filtering out emails.
// Emails come from calendar event participants, not from the meeting webhook.
export const extractParticipantNames = (
  data: V2.BotWebhookCompletedData,
): string[] => {
  const rawEntries = [
    ...(data.participants ?? []).map((p) => ({ displayName: p.display_name, name: p.name })),
    ...(data.speakers ?? []).map((s) => ({ displayName: s.display_name, name: s.name })),
  ];
  const names: string[] = [];
  for (const entry of rawEntries) {
    if (entry.displayName) names.push(entry.displayName);
    if (entry.name && !isEmail(entry.name) && entry.name !== entry.displayName) {
      names.push(entry.name);
    }
  }
  return uniqueStrings(names);
};

// Fetch and format transcript from Meeting BaaS presigned URLs.
//
// The transcription URL is a JSON file (V2.OutputTranscription) with
// result.utterances[] containing { speaker, text, start, end }.
//
// The diarization URL is JSONL (V2.DiarizationSegment[]) with only
// { speaker, start_time, end_time } — NO text content.
//
// So we prefer transcription (has text), diarization is only useful
// for speaker timing info.
export const fetchTranscript = async (
  diarizationUrl?: string | null,
  transcriptionUrl?: string | null,
): Promise<string> => {
  // Prefer transcription — it has the actual spoken text
  if (transcriptionUrl) {
    try {
      const response = await fetch(transcriptionUrl);
      if (!response.ok) {
        console.error(`[meeting-baas] failed to fetch transcription: ${response.status}`);
        return '';
      }

      const data: V2.OutputTranscription = await response.json();
      const utterances = data.result?.utterances ?? [];

      if (utterances.length === 0) {
        console.error('[meeting-baas] transcription has 0 utterances');
        return '';
      }

      console.error(`[meeting-baas] transcription: ${utterances.length} utterances, ${data.result.total_duration}s`);

      return utterances
        .map((u) => `${u.speaker}: ${u.text}`)
        .join('\n');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[meeting-baas] failed to parse transcription: ${msg}`);
    }
  }

  // Diarization only has speaker timing, no text — not useful as a transcript
  if (diarizationUrl) {
    console.error('[meeting-baas] only diarization available (no text content), skipping');
  }

  return '';
};

// Try to extract retry-after seconds from SDK error details.
const parseRetryAfter = (details: unknown): number => {
  if (!details || typeof details !== 'object') return 10;
  const d = details as Record<string, unknown>;
  // SDK may expose retryAfter, retry_after, or Retry-After
  const raw = d.retryAfter ?? d.retry_after ?? d['Retry-After'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 10;
  }
  return 10; // default 10s if unknown
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

  // Create a scheduled bot to join a meeting at a specific time.
  // Throws RateLimitError on 429 so callers can defer to PENDING_SCHEDULE.
  async createScheduledBot(params: CreateScheduledBotInput): Promise<string> {
    logger.debug(`scheduling bot for meeting: ${params.meeting_url} at ${params.join_at}`);

    const result = await this.client.createScheduledBot(params);

    if (!result.success) {
      if ('statusCode' in result && result.statusCode === 429) {
        const retryAfter = parseRetryAfter(result.details);
        throw new RateLimitError(retryAfter);
      }
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS API error${errorInfo}: ${result.error}`);
    }

    const botId = result.data.bot_id;
    logger.debug(`scheduled bot created with id: ${botId}`);
    return botId;
  }

  // Batch-create scheduled bots (up to 100 items per call).
  // Throws RateLimitError on 429.
  async batchCreateScheduledBots(
    params: BatchCreateScheduledBotsInput,
  ): Promise<SuccessfulBatchCreateScheduledBotsResponse> {
    logger.debug(`batch scheduling ${params.length} bots`);

    const result = await this.client.batchCreateScheduledBots(params);

    if (!result.success) {
      if ('statusCode' in result && result.statusCode === 429) {
        const retryAfter = parseRetryAfter(result.details);
        throw new RateLimitError(retryAfter);
      }
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS batch API error${errorInfo}: ${result.error}`);
    }

    logger.debug(`batch result: ${result.data.length} created, ${result.errors.length} failed`);
    return result;
  }

  // Fetch full bot details from the SDK (presigned URLs valid for 4 hours)
  async getBotDetails(botId: string): Promise<BotDetails> {
    logger.debug(`fetching bot details for ${botId}`);

    const result = await this.client.getBotDetails({ bot_id: botId });

    if (!result.success) {
      const errorInfo = 'code' in result ? ` (${result.code})` : '';
      throw new Error(`Meeting BaaS API error${errorInfo}: ${result.error}`);
    }

    return result.data;
  }
}
