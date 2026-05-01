export const getApiUrl = (): string => {
  return process.env.TWENTY_API_URL || process.env.SERVER_URL || 'https://api.twenty.com';
};

export const getRestApiUrl = (): string => {
  return `${getApiUrl()}/rest`;
};

export const getApiToken = (): string =>
  process.env.TWENTY_API_KEY ?? process.env.TWENTY_APP_ACCESS_TOKEN ?? '';

export const restHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${getApiToken()}`,
  'Content-Type': 'application/json',
});

// Build a Twenty REST API URL with typed filter and limit params.
// Example: buildRestUrl('recordings', { filter: { botId: { eq: 'bot-123' } }, limit: 1 })
// → https://api.twenty.com/rest/recordings?filter=botId[eq]:"bot-123"&limit=1

type FilterCondition = Partial<Record<'eq' | 'neq' | 'gte' | 'lte' | 'is', string>>;

export const buildRestUrl = (
  resource: string,
  options?: { filter?: Record<string, FilterCondition>; limit?: number; cursor?: string },
): string => {
  const base = `${getRestApiUrl()}/${resource}`;
  if (!options) return base;

  const params = new URLSearchParams();

  if (options.filter) {
    const filterParts = Object.entries(options.filter)
      .flatMap(([field, conditions]) =>
        Object.entries(conditions).map(
          ([op, value]) => `${field}[${op}]:"${value}"`,
        ),
      )
      .join(',');
    params.set('filter', filterParts);
  }

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }

  if (options.cursor) {
    params.set('starting_after', options.cursor);
  }

  return `${base}?${params.toString()}`;
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};
