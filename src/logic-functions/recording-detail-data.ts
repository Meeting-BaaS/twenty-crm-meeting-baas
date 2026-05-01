import { defineLogicFunction } from 'twenty-sdk/define';
import { fetchLinkedTasksForRecording, fetchRecordingDetail, parseJsonBody } from './recording-detail-service';

type RequestBody = {
  recordingId?: string;
};

export default defineLogicFunction({
  universalIdentifier: '26745ab7-7d8a-47ba-890d-0afd640cd0d7',
  name: 'recording-detail-data',
  description: 'Returns a recording record and its linked tasks for the recording detail page.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/recording-detail-data',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: [],
  },
  handler: async (event: { body?: RequestBody | string | null }) => {
    const body = parseJsonBody<RequestBody>(event?.body);
    const recordingId = body?.recordingId?.trim();

    if (!recordingId) {
      return { statusCode: 400, error: 'recordingId is required' };
    }

    const recording = await fetchRecordingDetail(recordingId);
    if (!recording) {
      return { statusCode: 404, error: 'Recording not found' };
    }

    const linkedTasks = await fetchLinkedTasksForRecording(recordingId);

    return {
      statusCode: 200,
      recording,
      linkedTasks,
    };
  },
});
