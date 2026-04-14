import { defineLogicFunction } from 'twenty-sdk';
import type { ProcessResult } from './types';
import { WebhookHandler } from './webhook-handler';

export default defineLogicFunction({
  universalIdentifier: 'c1449053-7e9d-4377-8502-9db6a89a1781',
  name: 'receive-recording-webhook',
  description:
    'Receives Meeting BaaS webhooks when recordings complete, and stores them in Twenty.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/webhook/meeting-baas',
    httpMethod: 'POST',
    isAuthRequired: false,
    forwardedRequestHeaders: [
      'x-mb-secret',
      'x-meeting-baas-api-key',
      'content-type',
    ],
  },
  handler: async (
    params: unknown,
    headers?: Record<string, string>,
  ): Promise<ProcessResult> => {
    const handler = new WebhookHandler();
    return handler.handle(params, headers);
  },
});
