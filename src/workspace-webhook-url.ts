export const WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY = 'WORKSPACE_WEBHOOK_BASE_URL';

const normalizeBaseUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, '');

    return `${url.origin}${normalizedPath}`;
  } catch {
    return null;
  }
};

const isGlobalApiUrl = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.hostname === 'api.twenty.com' ||
      (url.hostname.startsWith('api.') && url.hostname.endsWith('.twenty.com'))
    );
  } catch {
    return false;
  }
};

export const selectWorkspaceBaseUrl = (
  customUrl: string | null | undefined,
  subdomainUrl: string | null | undefined,
): string | null => {
  return normalizeBaseUrl(customUrl) ?? normalizeBaseUrl(subdomainUrl);
};

export const getWorkspaceWebhookBaseUrl = (): string | null => {
  const configured = normalizeBaseUrl(
    process.env[WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY],
  );

  if (configured) {
    return configured;
  }

  const fallback = process.env.TWENTY_API_URL ?? process.env.SERVER_URL ?? '';
  if (!fallback || isGlobalApiUrl(fallback)) {
    return null;
  }

  return normalizeBaseUrl(fallback);
};

export const getMeetingBaasCallbackUrl = (): string | null => {
  const baseUrl = getWorkspaceWebhookBaseUrl();

  return baseUrl ? `${baseUrl}/s/webhook/meeting-baas` : null;
};

export const getRecordingVideoProxyUrl = (botId: string): string | null => {
  const baseUrl = getWorkspaceWebhookBaseUrl();

  return baseUrl
    ? `${baseUrl}/s/recording-video?botId=${encodeURIComponent(botId)}`
    : null;
};
