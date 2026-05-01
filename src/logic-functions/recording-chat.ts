import { defineLogicFunction } from 'twenty-sdk/define';
import {
  extractActionsFromAnswer,
  fetchRecordingDetail,
  generateAiTextServerSide,
  parseJsonBody,
} from './recording-detail-service';

type RequestBody = {
  recordingId?: string;
  question?: string;
};

const CHAT_SYSTEM_PROMPT = [
  'You are analyzing a meeting recording. Answer questions about the content.',
  'When suggesting action items, prefix each with "ACTION:" on its own line.',
  'Use markdown for formatting.',
].join('\n');

export default defineLogicFunction({
  universalIdentifier: '37a6eb35-7ab2-4381-96d8-a86a50726941',
  name: 'recording-chat',
  description: 'Answers questions about a recording transcript.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: {
    path: '/recording-chat',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: [],
  },
  handler: async (event: { body?: RequestBody | string | null }) => {
    const body = parseJsonBody<RequestBody>(event?.body);
    const recordingId = body?.recordingId?.trim();
    const question = body?.question?.trim();

    if (!recordingId) {
      return { statusCode: 400, error: 'recordingId is required' };
    }
    if (!question) {
      return { statusCode: 400, error: 'question is required' };
    }

    const recording = await fetchRecordingDetail(recordingId);
    if (!recording) {
      return { statusCode: 404, error: 'Recording not found' };
    }

    const context = recording.transcript.trim()
      ? `Meeting transcript:\n${recording.transcript}\n\nUser question: ${question}`
      : question;
    const answer = await generateAiTextServerSide(CHAT_SYSTEM_PROMPT, context);

    return {
      statusCode: 200,
      answer: answer ?? 'Sorry, I could not generate a response.',
      actions: answer ? extractActionsFromAnswer(answer) : [],
    };
  },
});
