import { describe, expect, it } from 'vitest';
import { WebhookEvent } from './types';
import {
  getApiKeyFingerprint,
  isValidMeetingBaasPayload,
  verifyWebhookApiKey,
} from './webhook-validator';

describe('verifyWebhookApiKey', () => {
  it('accepts the V2 x-mb-secret header case-insensitively', () => {
    const result = verifyWebhookApiKey(
      { 'X-MB-SECRET': 'secret-123' },
      'secret-123',
    );

    expect(result).toEqual({ isValid: true });
  });

  it('accepts the legacy V1 x-meeting-baas-api-key header', () => {
    const result = verifyWebhookApiKey(
      { 'x-meeting-baas-api-key': 'legacy-key' },
      'legacy-key',
    );

    expect(result).toEqual({ isValid: true });
  });

  it('rejects mismatched webhook secrets', () => {
    const result = verifyWebhookApiKey(
      { 'x-mb-secret': 'wrong-secret' },
      'expected-secret',
    );

    expect(result).toEqual({
      isValid: false,
      reason: 'x-mb-secret mismatch',
    });
  });

  it('rejects requests without either supported auth header', () => {
    const result = verifyWebhookApiKey({ 'content-type': 'application/json' }, 'expected-secret');

    expect(result).toEqual({
      isValid: false,
      reason: 'missing x-mb-secret or x-meeting-baas-api-key header',
    });
  });
});

describe('isValidMeetingBaasPayload', () => {
  it('accepts supported webhook payloads with a bot id', () => {
    expect(
      isValidMeetingBaasPayload({
        event: WebhookEvent.COMPLETED,
        data: { bot_id: 'bot-123' },
      }),
    ).toBe(true);
  });

  it('rejects payloads with unsupported events', () => {
    expect(
      isValidMeetingBaasPayload({
        event: 'bot.unknown',
        data: { bot_id: 'bot-123' },
      }),
    ).toBe(false);
  });
});

describe('getApiKeyFingerprint', () => {
  it('returns a stable short fingerprint', () => {
    expect(getApiKeyFingerprint('secret-123')).toHaveLength(8);
    expect(getApiKeyFingerprint('secret-123')).toBe(
      getApiKeyFingerprint('secret-123'),
    );
  });
});
