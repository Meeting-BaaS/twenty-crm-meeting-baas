export const getApiUrl = (): string => {
  return process.env.TWENTY_API_URL || process.env.SERVER_URL || 'https://api.twenty.com';
};

export const getRestApiUrl = (): string => {
  return `${getApiUrl()}/rest`;
};

export const restHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${process.env.TWENTY_API_KEY ?? ''}`,
  'Content-Type': 'application/json',
});

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
