import { createHash } from 'crypto';
import { WebhookEvent, type MeetingBaasWebhookPayload } from './types';

const VALID_WEBHOOK_EVENTS: MeetingBaasWebhookPayload['event'][] = [
  WebhookEvent.COMPLETED,
  WebhookEvent.FAILED,
  WebhookEvent.STATUS_CHANGE,
];

export type SignatureVerificationResult = {
  isValid: boolean;
  reason?: string;
};

// Meeting BaaS V2 authenticates webhooks via x-mb-secret header
// (the secret from callback_config). V1 uses x-meeting-baas-api-key.
// We check both for compatibility.
export const verifyWebhookApiKey = (
  headers: Record<string, string> | undefined,
  expectedKey: string
): SignatureVerificationResult => {
  if (!expectedKey) {
    return { isValid: false, reason: 'MEETING_BAAS_API_KEY not configured' };
  }

  if (!headers) {
    return { isValid: false, reason: 'no headers provided' };
  }

  // Normalize header keys to lowercase for case-insensitive lookup
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = v;
  }

  // V2: x-mb-secret (callback_config.secret)
  const mbSecret = normalized['x-mb-secret'];
  if (mbSecret) {
    return mbSecret === expectedKey
      ? { isValid: true }
      : { isValid: false, reason: 'x-mb-secret mismatch' };
  }

  // V1: x-meeting-baas-api-key
  const apiKey = normalized['x-meeting-baas-api-key'];
  if (apiKey) {
    return apiKey === expectedKey
      ? { isValid: true }
      : { isValid: false, reason: 'x-meeting-baas-api-key mismatch' };
  }

  return { isValid: false, reason: 'missing x-mb-secret or x-meeting-baas-api-key header' };
};

export const getApiKeyFingerprint = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex').substring(0, 8);
};

export const isValidMeetingBaasPayload = (
  params: unknown
): params is MeetingBaasWebhookPayload => {
  if (!params || typeof params !== 'object') {
    return false;
  }

  const payload = params as Record<string, unknown>;

  // Must have 'event' field with valid V2 event type
  if (typeof payload['event'] !== 'string' || payload['event'].length === 0) {
    return false;
  }

  if (!VALID_WEBHOOK_EVENTS.includes(payload['event'] as MeetingBaasWebhookPayload['event'])) {
    return false;
  }

  // Must have 'data' object with bot_id
  if (!payload['data'] || typeof payload['data'] !== 'object') {
    return false;
  }

  const data = payload['data'] as Record<string, unknown>;
  return typeof data['bot_id'] === 'string' && data['bot_id'].length > 0;
};
