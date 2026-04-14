import { createLogger } from './logger';
import { generateSummary } from './generate-summary';
import { MeetingBaasApiClient } from './meeting-baas-api-client';
import type { ProcessResult, SyncResult } from './types';
import {
  getApiKeyFingerprint,
  parseWebhookPayload,
  verifyWebhookApiKey
} from './webhook-validator';
import { syncBotRecording } from './twenty-sync-service';

declare const process: { env: Record<string, string | undefined> };

export class WebhookHandler {
  private logger: ReturnType<typeof createLogger>;

  constructor() {
    this.logger = createLogger('meeting-baas');
  }

  async handle(params: unknown, headers?: Record<string, string>): Promise<ProcessResult> {
    const result: ProcessResult = {
      success: false,
      errors: [],
    };

    try {
      this.logger.debug('invoked');

      // MEETING_BAAS_API_KEY is injected by Twenty's logic function executor
      // from the app's encrypted applicationVariable (set in UI under Settings > Variables)
      const meetingBaasApiKey = process.env.MEETING_BAAS_API_KEY || '';
      if (!meetingBaasApiKey) {
        this.logger.critical('MEETING_BAAS_API_KEY not configured');
        throw new Error('MEETING_BAAS_API_KEY environment variable is required');
      }

      const { payload, extractedHeaders } = parseWebhookPayload(params);
      const finalHeaders = extractedHeaders || headers;

      this.logger.debug(`payload event=${payload.event} bot_id=${payload.data.bot_id}`);

      this.logger.debug(`API key fingerprint=${getApiKeyFingerprint(meetingBaasApiKey)}`);
      this.logger.debug(`headers received: ${JSON.stringify(Object.keys(finalHeaders ?? {}))}`);
      this.verifyApiKey(finalHeaders, meetingBaasApiKey);
      this.logger.debug('API key verification: ok');

      if (payload.event === 'bot.failed') {
        const failedData = payload.data;
        this.logger.error(`bot failed: ${failedData.error_message} (${failedData.error_code})`);
        throw new Error(`Meeting BaaS bot failed: ${failedData.error_message}`);
      }

      // bot.completed — transform, fetch transcript, summarize, sync
      const completedData = payload.data;
      const meetingBaasClient = new MeetingBaasApiClient(meetingBaasApiKey);
      const recordingData = meetingBaasClient.transformWebhookData(
        completedData,
        payload.extra ?? undefined,
      );

      result.durationMinutes = Math.round(recordingData.duration / 60);

      const transcript = await meetingBaasClient.fetchTranscript(recordingData);
      if (transcript) {
        recordingData.transcript = transcript;
        this.logger.debug(`transcript fetched (${transcript.length} chars)`);
      }

      // Generate AI summary from transcript (non-fatal if it fails)
      const summary = await generateSummary(recordingData.transcript);
      if (summary) {
        this.logger.debug('AI summary generated');
      }

      // calendarEventId and workspaceMemberId come from the bot's `extra` field,
      // set by schedule-bot.ts when creating the scheduled bot
      const extra = recordingData.extra;
      const calendarEventId = extra.calendarEventId as string | undefined;
      const workspaceMemberId = extra.workspaceMemberId as string | undefined;

      const syncResult: SyncResult = {
        recordingsProcessed: 0,
        recordingsCreated: 0,
        recordingsUpdated: 0,
        errors: [],
      };

      const recordingId = await syncBotRecording(
        {
          botId: recordingData.botId,
          title: recordingData.title,
          date: recordingData.date,
          duration: recordingData.duration,
          transcript: recordingData.transcript,
          summary: summary ?? undefined,
          mp4Url: recordingData.mp4Url,
          meetingUrl: recordingData.meetingUrl,
          platform: recordingData.platform,
          calendarEventId,
          workspaceMemberId,
        },
        syncResult,
      );

      if (syncResult.errors.length > 0) {
        const errMsgs = syncResult.errors.map((e) => `${e.botId}: ${e.error}`);
        this.logger.error(`sync failed: ${errMsgs.join('; ')}`);
        throw new Error(`Failed to sync recording: ${errMsgs.join('; ')}`);
      }

      if (recordingId) {
        result.recordingId = recordingId;
        this.logger.debug(`upserted recording id=${recordingId}`);
      }

      result.success = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`error: ${message}`);
      result.errors?.push(message);
    }

    return result;
  }

  private verifyApiKey(
    headers: Record<string, string> | undefined,
    expectedApiKey: string
  ): void {
    const verification = verifyWebhookApiKey(headers, expectedApiKey);
    if (!verification.isValid) {
      this.logger.critical(`Webhook auth failed: ${verification.reason}`);
      throw new Error('Invalid webhook API key');
    }
  }
}
