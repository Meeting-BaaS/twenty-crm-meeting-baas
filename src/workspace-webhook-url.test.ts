import { afterEach, describe, expect, it } from 'vitest';
import {
  getMeetingBaasCallbackUrl,
  getWorkspaceWebhookBaseUrl,
  selectWorkspaceBaseUrl,
  WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY,
} from './workspace-webhook-url';

describe('selectWorkspaceBaseUrl', () => {
  it('prefers the custom workspace URL', () => {
    expect(
      selectWorkspaceBaseUrl(
        'https://custom.example.com/',
        'https://workspace.twenty.com/',
      ),
    ).toBe('https://custom.example.com');
  });

  it('falls back to the subdomain URL', () => {
    expect(
      selectWorkspaceBaseUrl(
        null,
        'https://workspace.twenty.com/',
      ),
    ).toBe('https://workspace.twenty.com');
  });
});

describe('getWorkspaceWebhookBaseUrl', () => {
  const originalWebhookBaseUrl =
    process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY];
  const originalTwentyApiUrl = process.env.TWENTY_API_URL;
  const originalServerUrl = process.env.SERVER_URL;

  afterEach(() => {
    if (originalWebhookBaseUrl === undefined) {
      delete process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY];
    } else {
      process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY] =
        originalWebhookBaseUrl;
    }

    if (originalTwentyApiUrl === undefined) {
      delete process.env.TWENTY_API_URL;
    } else {
      process.env.TWENTY_API_URL = originalTwentyApiUrl;
    }

    if (originalServerUrl === undefined) {
      delete process.env.SERVER_URL;
    } else {
      process.env.SERVER_URL = originalServerUrl;
    }
  });

  it('uses the configured workspace webhook base URL', () => {
    process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY] =
      'https://custom.example.com/';
    process.env.TWENTY_API_URL = 'https://api.twenty.com';

    expect(getWorkspaceWebhookBaseUrl()).toBe('https://custom.example.com');
    expect(getMeetingBaasCallbackUrl()).toBe(
      'https://custom.example.com/s/webhook/meeting-baas',
    );
  });

  it('rejects the global Twenty API host as a callback base URL', () => {
    delete process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY];
    process.env.TWENTY_API_URL = 'https://api.twenty.com';
    delete process.env.SERVER_URL;

    expect(getWorkspaceWebhookBaseUrl()).toBeNull();
    expect(getMeetingBaasCallbackUrl()).toBeNull();
  });

  it('falls back to a non-global API URL when available', () => {
    delete process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY];
    process.env.TWENTY_API_URL = 'https://workspace.twenty.local/';

    expect(getWorkspaceWebhookBaseUrl()).toBe('https://workspace.twenty.local');
  });
});
