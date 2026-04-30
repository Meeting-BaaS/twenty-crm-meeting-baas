import axios from 'axios';
import { defineLogicFunction } from 'twenty-sdk/define';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import { createLogger } from '../logger';
import { buildRestUrl, getRestApiUrl, restHeaders } from '../utils';

const logger = createLogger('recording-video');

type TwentyListResponse = {
  data?: { recordings?: Record<string, unknown>[] };
};

const fetchRecordingByBotId = async (
  botId: string,
): Promise<{ id: string; botId: string } | null> => {
  const url = buildRestUrl('recordings', {
    filter: { botId: { eq: botId } },
    limit: 1,
  });
  const response = await axios.get<TwentyListResponse>(url, {
    headers: restHeaders(),
  });
  const recording = response.data?.data?.recordings?.[0];
  if (!recording) return null;
  return { id: recording.id as string, botId: recording.botId as string };
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
  universalIdentifier: 'caef7e78-7b3d-4ea9-b960-91c1185eaab9',
  name: 'recording-video',
  description:
    'Proxy endpoint that fetches a fresh presigned video URL from Meeting BaaS and redirects to it.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/recording-video',
    httpMethod: 'GET',
    isAuthRequired: false,
    forwardedRequestHeaders: [],
  },
  handler: async (
    event: { queryStringParameters?: Record<string, string | undefined> },
  ) => {
    const botId = event?.queryStringParameters?.botId;

    if (!botId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'botId query parameter is required' }),
      };
    }

    const apiKey = process.env.MEETING_BAAS_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'MEETING_BAAS_API_KEY not configured' }),
      };
    }

    try {
      const client = new MeetingBaasApiClient(apiKey);
      const details = await client.getBotDetails(botId);

      if (!details.video) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'No video available for this recording' }),
        };
      }

      // Update the recording's mp4Url with the fresh presigned URL
      const recording = await fetchRecordingByBotId(botId);
      if (recording) {
        await updateRecordingMp4Url(recording.id, details.video);
        logger.debug(`refreshed mp4Url for recording ${recording.id}`);
      }

      // Return the fresh URL (Twenty logic functions can't do HTTP 302 redirects)
      return { videoUrl: details.video };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`failed to get video URL: ${msg}`);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: msg }),
      };
    }
  },
});
