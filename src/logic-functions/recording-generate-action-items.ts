import { defineLogicFunction } from 'twenty-sdk/define';
import { fetchRecordingDetail, generateAiTextServerSide, parseJsonBody } from './recording-detail-service';

type RequestBody = {
  recordingId?: string;
};

type ActionItem = {
  title: string;
  assignee: string | null;
};

const ACTION_ITEMS_SYSTEM_PROMPT = [
  'You extract action items from a meeting transcript.',
  'Return a JSON array: [{ "title": "...", "assignee": "..." | null }].',
  'Only concrete, actionable items. No discussion points. Valid JSON only.',
].join('\n');

export default defineLogicFunction({
  universalIdentifier: 'ee56cc99-c66b-469f-b657-f89b82c5f2d6',
  name: 'recording-generate-action-items',
  description: 'Generates action items from a recording transcript.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: {
    path: '/recording-generate-action-items',
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
    if (!recording.transcript.trim()) {
      return { statusCode: 400, error: 'Recording transcript is empty' };
    }

    const result = await generateAiTextServerSide(
      ACTION_ITEMS_SYSTEM_PROMPT,
      recording.transcript,
    );

    if (!result) {
      return { statusCode: 200, items: [] };
    }

    try {
      const parsed = JSON.parse(result) as Array<{ title?: string; assignee?: string | null }>;
      const items: ActionItem[] = parsed
        .filter((item) => typeof item?.title === 'string' && item.title.trim().length > 0)
        .map((item) => ({
          title: item.title!.trim(),
          assignee: typeof item.assignee === 'string' && item.assignee.trim().length > 0
            ? item.assignee.trim()
            : null,
        }));

      return { statusCode: 200, items };
    } catch {
      return { statusCode: 200, items: [] };
    }
  },
});
