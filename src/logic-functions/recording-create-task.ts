import { defineLogicFunction } from 'twenty-sdk/define';
import { createTaskForRecording, fetchRecordingDetail, parseJsonBody } from './recording-detail-service';

type RequestBody = {
  recordingId?: string;
  title?: string;
};

export default defineLogicFunction({
  universalIdentifier: '9876d90c-a42f-4cf5-a33f-6824fd0c40a8',
  name: 'recording-create-task',
  description: 'Creates a task linked to a recording.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/recording-create-task',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: [],
  },
  handler: async (event: { body?: RequestBody | string | null }) => {
    const body = parseJsonBody<RequestBody>(event?.body);
    const recordingId = body?.recordingId?.trim();
    const title = body?.title?.trim();

    if (!recordingId) {
      return { statusCode: 400, error: 'recordingId is required' };
    }
    if (!title) {
      return { statusCode: 400, error: 'title is required' };
    }

    const recording = await fetchRecordingDetail(recordingId);
    if (!recording) {
      return { statusCode: 404, error: 'Recording not found' };
    }

    const task = await createTaskForRecording(title, recordingId);
    if (!task) {
      return { statusCode: 500, error: 'Failed to create task' };
    }

    return {
      statusCode: 200,
      task,
    };
  },
});
