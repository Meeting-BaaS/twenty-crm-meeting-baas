import axios from 'axios';
import { defineLogicFunction } from 'twenty-sdk/define';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import { downloadAndStoreRecording } from '../twenty-file-upload';
import { createLogger } from '../logger';
import { buildRestUrl, getRestApiUrl, restHeaders } from '../utils';
import { getRecordingVideoProxyUrl } from '../workspace-webhook-url';

const logger = createLogger('backfill-recording-files');

const MAX_RECORDINGS_PER_RUN = 50;
const PAGE_SIZE = 50;
const MAX_SCAN_PAGES = 10;

type BackfillResult = {
  processed: number;
  refreshed: number;
  stored: number;
  skipped: number;
  errors: string[];
};

type RecordingRow = {
  id: string;
  botId: string | null;
  mp4Url: { primaryLinkUrl?: string } | null;
  videoFile: unknown[] | null;
};

// Fetch recordings that have a botId but no stored videoFile
const fetchRecordingsWithoutFile = async (
  limit: number,
): Promise<RecordingRow[]> => {
  const matches: RecordingRow[] = [];
  let cursor: string | undefined;

  // We can't filter "videoFile is empty" via REST, so scan completed recordings
  // across a bounded number of pages until we collect enough work for one run.
  for (let page = 0; page < MAX_SCAN_PAGES && matches.length < limit; page++) {
    const allUrl = buildRestUrl('recordings', {
      filter: { status: { eq: 'COMPLETED' } },
      limit: PAGE_SIZE,
      cursor,
    });

    const response = await axios.get(allUrl, { headers: restHeaders() });
    const recordings: Record<string, unknown>[] =
      response.data?.data?.recordings ?? [];

    for (const r of recordings) {
      const botId = r.botId as string | null;
      const videoFile = r.videoFile as unknown[] | null;
      const hasFile = Array.isArray(videoFile) && videoFile.length > 0;
      if (!botId || hasFile) continue;

      matches.push({
        id: r.id as string,
        botId,
        mp4Url: r.mp4Url as RecordingRow['mp4Url'],
        videoFile,
      });

      if (matches.length >= limit) {
        break;
      }
    }

    if (recordings.length < PAGE_SIZE) {
      break;
    }

    const lastId = recordings[recordings.length - 1]?.id;
    if (typeof lastId !== 'string' || !lastId) {
      break;
    }
    cursor = lastId;
  }

  return matches;
};

const updateRecordingMp4Url = async (
  recordingId: string,
  videoUrl: string,
): Promise<void> => {
  await axios({
    method: 'PATCH',
    headers: restHeaders(),
    url: `${getRestApiUrl()}/recordings/${recordingId}`,
    data: {
      mp4Url: {
        primaryLinkLabel: 'Watch Recording',
        primaryLinkUrl: videoUrl,
        secondaryLinks: null,
      },
    },
  });
};

export default defineLogicFunction({
  universalIdentifier: 'e4f5a6b7-8c9d-4e0f-a1b2-c3d4e5f6a7b8',
  name: 'backfill-recording-files',
  description:
    'Refreshes presigned MP4 URLs for recordings without stored video files, and optionally downloads and stores them locally.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: {
    path: '/backfill-recording-files',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: [],
  },
  handler: async (): Promise<BackfillResult> => {
    const result: BackfillResult = {
      processed: 0,
      refreshed: 0,
      stored: 0,
      skipped: 0,
      errors: [],
    };

    const apiKey = process.env.MEETING_BAAS_API_KEY;
    if (!apiKey) {
      result.errors.push('MEETING_BAAS_API_KEY not configured');
      return result;
    }

    const storeLocally = process.env.STORE_RECORDINGS_LOCALLY !== 'false';
    const client = new MeetingBaasApiClient(apiKey);

    logger.debug('fetching recordings without stored video files');
    const recordings = await fetchRecordingsWithoutFile(MAX_RECORDINGS_PER_RUN);
    logger.debug(`found ${recordings.length} recordings to process`);

    for (const recording of recordings) {
      result.processed++;

      try {
        const bot = await client.getBotDetails(recording.botId!);

        if (!bot.video) {
          logger.debug(`recording ${recording.id}: no video URL from BaaS, skipping`);
          result.skipped++;
          continue;
        }

        // Set the proxy URL so the link auto-refreshes on click;
        // fall back to the raw presigned URL if proxy is unavailable
        const proxyUrl = getRecordingVideoProxyUrl(recording.botId!);
        await updateRecordingMp4Url(recording.id, proxyUrl ?? bot.video);
        result.refreshed++;
        logger.debug(`recording ${recording.id}: mp4Url refreshed`);

        // Optionally download and store the file locally
        if (storeLocally) {
          await downloadAndStoreRecording(bot.video, recording.id);
          result.stored++;
          logger.debug(`recording ${recording.id}: file stored locally`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`${recording.id}: ${msg}`);
        logger.error(`recording ${recording.id}: ${msg}`);
      }
    }

    logger.debug(
      `backfill complete: ${result.refreshed} refreshed, ${result.stored} stored, ${result.skipped} skipped, ${result.errors.length} errors`,
    );
    return result;
  },
});
