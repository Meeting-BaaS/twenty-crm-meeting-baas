import { createLogger } from './logger';
import { generateSummary } from './generate-summary';
import { extractParticipantNames, fetchTranscript } from './meeting-baas-api-client';
import type { ProcessResult, SyncResult } from './types';
import {
  parseWebhookPayload,
  verifyWebhookApiKey
} from './webhook-validator';
import { detectPlatform, syncBotRecording, checkIfRecordingExists, upsertRecordingStatus } from './twenty-sync-service';
import { downloadAndStoreRecording } from './twenty-file-upload';

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

      // Verify x-mb-secret before processing the webhook payload.
      const verification = verifyWebhookApiKey(finalHeaders, meetingBaasApiKey);
      if (!verification.isValid) {
        throw new Error('Invalid webhook API key');
      }

      if (payload.event === 'bot.failed') {
        const failedData = payload.data;
        this.logger.error(`bot failed: ${failedData.error_message} (${failedData.error_code})`);

        // Transition recording to FAILED status
        const existingId = await checkIfRecordingExists(failedData.bot_id);
        if (existingId) {
          await upsertRecordingStatus(existingId, 'FAILED');
          this.logger.debug(`recording ${existingId} transitioned to FAILED`);
        }

        throw new Error(`Meeting BaaS bot failed: ${failedData.error_message}`);
      }

      if (payload.event === 'bot.status_change') {
        const statusData = payload.data;
        const statusCode = statusData.status.code;
        this.logger.debug(`bot status change: bot_id=${statusData.bot_id} code=${statusCode}`);

        // Transition SCHEDULED → IN_PROGRESS when the bot enters the call
        if (['in_call_recording', 'in_call_not_recording', 'recording'].includes(statusCode)) {
          const existingId = await checkIfRecordingExists(statusData.bot_id);
          if (existingId) {
            await upsertRecordingStatus(existingId, 'IN_PROGRESS');
            this.logger.debug(`recording ${existingId} transitioned to IN_PROGRESS`);
          }
        }

        return { success: true };
      }

      // bot.completed — the SDK types give us everything directly
      const data = payload.data;
      const extra = payload.extra ?? {};
      const meetingUrl = (extra.meeting_url as string) || '';
      const meetingTitle = (extra.meeting_title as string) || `Recording ${new Date().toLocaleDateString()}`;
      const calendarEventId = extra.calendarEventId as string | undefined;
      const workspaceMemberId = extra.workspaceMemberId as string | undefined;
      const durationSeconds = data.duration_seconds ?? 0;

      result.durationMinutes = Math.round(durationSeconds / 60);
      const participantNames = extractParticipantNames(data);
      console.error(`[webhook] bot_id=${data.bot_id} duration=${durationSeconds}s transcription=${data.transcription ? 'present' : 'none'} diarization=${data.diarization ? 'present' : 'none'} video=${data.video ? 'present' : 'none'} participants=${participantNames.join(', ')}`);

      // Fetch transcript from the presigned URLs the SDK provides
      const transcript = await fetchTranscript(data.diarization, data.transcription);
      if (transcript) {
        console.error(`[webhook] transcript fetched (${transcript.length} chars)`);
      } else {
        console.error(`[webhook] no transcript available`);
      }

      // Generate AI summary from transcript (non-fatal if it fails)
      const summary = await generateSummary(transcript);
      console.error(`[webhook] summary: ${summary ? `generated (${summary.length} chars)` : 'none (empty transcript or AI failed)'}`);

      const syncResult: SyncResult = {
        recordingsProcessed: 0,
        recordingsCreated: 0,
        recordingsUpdated: 0,
        errors: [],
      };

      const recordingId = await syncBotRecording(
        {
          botId: data.bot_id,
          title: meetingTitle,
          date: data.joined_at || new Date().toISOString(),
          duration: durationSeconds,
          transcript,
          summary: summary ?? undefined,
          mp4Url: data.video || '',
          meetingUrl,
          platform: detectPlatform(meetingUrl),
          participantNames,
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

        // Download MP4 and store in Twenty's file storage (non-fatal)
        const storeLocally = process.env.STORE_RECORDINGS_LOCALLY !== 'false';
        if (storeLocally && data.video) {
          await downloadAndStoreRecording(data.video, recordingId);
        }
      }

      result.success = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`error: ${message}`);
      result.errors?.push(message);
    }

    return result;
  }
}
