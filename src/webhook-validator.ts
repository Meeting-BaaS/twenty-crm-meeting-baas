import { createHash } from 'crypto';
import type { V2 } from '@meeting-baas/sdk';

// Re-export SDK types for use throughout the codebase
export type ParsedWebhookPayload =
  | V2.BotWebhookCompleted
  | V2.BotWebhookFailed
  | V2.BotWebhookStatusChange;

export type SignatureVerificationResult = {
  isValid: boolean;
  reason?: string;
};

// V2 authenticates callbacks via x-mb-secret header (the secret from callback_config)
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

  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = v;
  }

  const mbSecret = normalized['x-mb-secret'];
  if (mbSecret) {
    return mbSecret === expectedKey
      ? { isValid: true }
      : { isValid: false, reason: 'x-mb-secret mismatch' };
  }

  return { isValid: false, reason: 'missing x-mb-secret header' };
};

export const getApiKeyFingerprint = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex').substring(0, 8);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parsePayloadCandidate = (value: unknown): ParsedWebhookPayload | null => {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  if (typeof value.data.bot_id !== 'string' || value.data.bot_id.length === 0) {
    return null;
  }

  switch (value.event) {
    case 'bot.completed':
      return value as V2.BotWebhookCompleted;
    case 'bot.failed':
      return value as V2.BotWebhookFailed;
    case 'bot.status_change':
      return isRecord(value.data.status) &&
        typeof value.data.status.code === 'string' &&
        value.data.status.code.length > 0
        ? (value as V2.BotWebhookStatusChange)
        : null;
    default:
      return null;
  }
};

// Extract webhook payload from various envelope formats. Handles:
// - Direct payload: { event, data }
// - Wrapped payload (Twenty logic function): { body: { event, data }, headers: {...} }
// - String JSON payloads
export const parseWebhookPayload = (
  params: unknown
): { payload: ParsedWebhookPayload; extractedHeaders?: Record<string, string> } => {
  let normalizedParams = params;
  let extractedHeaders: Record<string, string> | undefined;

  if (typeof normalizedParams === 'string') {
    try {
      normalizedParams = JSON.parse(normalizedParams);
    } catch {
      throw new Error('Invalid or missing webhook payload');
    }
  }

  // Try direct parse first
  const directPayload = parsePayloadCandidate(normalizedParams);
  if (directPayload) {
    return { payload: directPayload };
  }

  // Try unwrapping from a wrapper object (Twenty logic function envelope)
  if (isRecord(normalizedParams)) {
    const wrapper = normalizedParams;

    if (isRecord(wrapper.headers)) {
      extractedHeaders = Object.fromEntries(
        Object.entries(wrapper.headers).filter(([, value]) => typeof value === 'string'),
      );
    }

    for (const key of ['body', 'params', 'payload', 'data']) {
      const candidate = wrapper[key];
      const parsedCandidate = parsePayloadCandidate(candidate);
      if (parsedCandidate) {
        return { payload: parsedCandidate, extractedHeaders };
      }
    }

    // Try reconstructing from top-level event + data fields
    if (typeof wrapper['event'] === 'string' && wrapper['data']) {
      const reconstructed = { event: wrapper['event'], data: wrapper['data'], extra: wrapper['extra'] };
      const parsedReconstructed = parsePayloadCandidate(reconstructed);
      if (parsedReconstructed) {
        return { payload: parsedReconstructed, extractedHeaders };
      }
    }
  }

  throw new Error('Invalid or missing webhook payload');
};
