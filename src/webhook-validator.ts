import { createHash } from 'crypto';
import { z } from 'zod';

// V2 webhook event types
const WebhookEventSchema = z.enum(['bot.completed', 'bot.failed', 'bot.status_change']);

// bot.completed payload
const CompletedDataSchema = z.object({
  bot_id: z.string().min(1),
  duration_seconds: z.number().optional(),
  video: z.string().optional(),
  joined_at: z.string().optional(),
  participants: z.array(z.unknown()).optional(),
  transcription: z.string().optional(),
  diarization: z.string().optional(),
});

const CompletedPayloadSchema = z.object({
  event: z.literal('bot.completed'),
  data: CompletedDataSchema,
  extra: z.record(z.string(), z.unknown()).optional().nullable(),
});

// bot.failed payload
const FailedDataSchema = z.object({
  bot_id: z.string().min(1),
  error_message: z.string().optional(),
  error_code: z.string().optional(),
});

const FailedPayloadSchema = z.object({
  event: z.literal('bot.failed'),
  data: FailedDataSchema,
  extra: z.record(z.string(), z.unknown()).optional().nullable(),
});

// bot.status_change payload
const StatusChangeDataSchema = z.object({
  bot_id: z.string().min(1),
  status: z.string().optional(),
});

const StatusChangePayloadSchema = z.object({
  event: z.literal('bot.status_change'),
  data: StatusChangeDataSchema,
  extra: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Union of all V2 webhook payloads
export const WebhookPayloadSchema = z.discriminatedUnion('event', [
  CompletedPayloadSchema,
  FailedPayloadSchema,
  StatusChangePayloadSchema,
]);

export type ParsedWebhookPayload = z.infer<typeof WebhookPayloadSchema>;

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

// Parse and validate webhook payload using zod. Handles:
// - Direct payload: { event, data }
// - Wrapped payload (Twenty logic function): { params: { event, data }, headers: {...} }
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
  const directResult = WebhookPayloadSchema.safeParse(normalizedParams);
  if (directResult.success) {
    return { payload: directResult.data };
  }

  // Try unwrapping from a wrapper object (Twenty logic function envelope)
  if (normalizedParams && typeof normalizedParams === 'object') {
    const wrapper = normalizedParams as Record<string, unknown>;

    if (wrapper.headers && typeof wrapper.headers === 'object' && !Array.isArray(wrapper.headers)) {
      extractedHeaders = wrapper.headers as Record<string, string>;
    }

    for (const key of ['params', 'payload', 'body', 'data', 'event']) {
      const candidate = wrapper[key];
      const wrappedResult = WebhookPayloadSchema.safeParse(candidate);
      if (wrappedResult.success) {
        return { payload: wrappedResult.data, extractedHeaders };
      }
    }

    // Try reconstructing from top-level event + data fields
    if (typeof wrapper['event'] === 'string' && wrapper['data']) {
      const reconstructed = { event: wrapper['event'], data: wrapper['data'], extra: wrapper['extra'] };
      const reconstructedResult = WebhookPayloadSchema.safeParse(reconstructed);
      if (reconstructedResult.success) {
        return { payload: reconstructedResult.data, extractedHeaders };
      }
    }
  }

  throw new Error('Invalid or missing webhook payload');
};
