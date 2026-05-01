import { defineLogicFunction } from 'twenty-sdk/define';
import { ensureTaskBelongsToRecording, fetchRecordingDetail, parseJsonBody, updateTaskStatus } from './recording-detail-service';

type RequestBody = {
  recordingId?: string;
  taskId?: string;
  done?: boolean;
};

export default defineLogicFunction({
  universalIdentifier: '5a33077c-5f44-4ce6-958a-df5a4431304a',
  name: 'recording-toggle-task',
  description: 'Toggles a linked task status for a recording.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/recording-toggle-task',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: [],
  },
  handler: async (event: { body?: RequestBody | string | null }) => {
    const body = parseJsonBody<RequestBody>(event?.body);
    const recordingId = body?.recordingId?.trim();
    const taskId = body?.taskId?.trim();
    const done = body?.done === true;

    if (!recordingId) {
      return { statusCode: 400, error: 'recordingId is required' };
    }
    if (!taskId) {
      return { statusCode: 400, error: 'taskId is required' };
    }

    const recording = await fetchRecordingDetail(recordingId);
    if (!recording) {
      return { statusCode: 404, error: 'Recording not found' };
    }

    const belongs = await ensureTaskBelongsToRecording(taskId, recordingId);
    if (!belongs) {
      return { statusCode: 403, error: 'Task does not belong to this recording' };
    }

    await updateTaskStatus(taskId, done);

    return {
      statusCode: 200,
      success: true,
    };
  },
});
