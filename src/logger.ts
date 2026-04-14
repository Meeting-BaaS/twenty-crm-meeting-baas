export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const parseLogLevel = (level: string): LogLevel => {
  const normalized = level.toLowerCase() as LogLevel;
  return Object.keys(LOG_LEVELS).includes(normalized) ? normalized : 'error';
};

const currentLevel = parseLogLevel(process.env.LOG_LEVEL || 'error');

const shouldLog = (level: LogLevel): boolean =>
  LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];

export const createLogger = (context: string) => ({
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) console.log(`[${context}] ${message}`, ...args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) console.log(`[${context}] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`[${context}] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (shouldLog('error')) console.error(`[${context}] ${message}`, ...args);
  },
  critical: (message: string, ...args: unknown[]) => {
    console.error(`[${context}] CRITICAL: ${message}`, ...args);
  },
});
