import { describe, expect, it } from 'vitest';
import {
  getApiKeyFingerprint,
  parseWebhookPayload,
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

  it('rejects requests without the x-mb-secret header', () => {
    const result = verifyWebhookApiKey({ 'content-type': 'application/json' }, 'expected-secret');

    expect(result).toEqual({
      isValid: false,
      reason: 'missing x-mb-secret header',
    });
  });
});

describe('parseWebhookPayload', () => {
  it('parses a valid bot.completed payload', () => {
    const { payload } = parseWebhookPayload({
      event: 'bot.completed',
      data: { bot_id: 'bot-123', duration_seconds: 1800 },
    });

    expect(payload.event).toBe('bot.completed');
    expect(payload.data.bot_id).toBe('bot-123');
  });

  it('parses a valid bot.failed payload', () => {
    const { payload } = parseWebhookPayload({
      event: 'bot.failed',
      data: { bot_id: 'bot-456', error_message: 'timeout', error_code: 'TIMEOUT' },
    });

    expect(payload.event).toBe('bot.failed');
    expect(payload.data.bot_id).toBe('bot-456');
  });

  it('unwraps payload from a wrapper object with headers', () => {
    const { payload, extractedHeaders } = parseWebhookPayload({
      headers: { 'x-mb-secret': 'secret-123' },
      body: {
        event: 'bot.completed',
        data: { bot_id: 'bot-123' },
      },
    });

    expect(payload.event).toBe('bot.completed');
    expect(extractedHeaders).toEqual({ 'x-mb-secret': 'secret-123' });
  });

  it('rejects payloads with unsupported events', () => {
    expect(() =>
      parseWebhookPayload({
        event: 'bot.unknown',
        data: { bot_id: 'bot-123' },
      }),
    ).toThrow('Invalid or missing webhook payload');
  });

  it('rejects payloads missing bot_id', () => {
    expect(() =>
      parseWebhookPayload({
        event: 'bot.completed',
        data: {},
      }),
    ).toThrow('Invalid or missing webhook payload');
  });

  it('parses JSON string payloads', () => {
    const { payload } = parseWebhookPayload(
      JSON.stringify({
        event: 'bot.completed',
        data: { bot_id: 'bot-123' },
      }),
    );

    expect(payload.event).toBe('bot.completed');
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
