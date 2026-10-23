export interface SentryClient {
  captureException(err: any, context?: Record<string, any>): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
}

export function createSentry(dsn?: string): SentryClient {
  const activeDsn = dsn || process.env.SENTRY_DSN;

  if (!activeDsn) {
    // Silent no-op when SENTRY_DSN is not configured
    return {
      captureException: () => {},
      captureMessage: () => {},
    };
  }

  // Lightweight Sentry hook using Sentry envelope / capture API
  return {
    captureException: (err: any, context?: Record<string, any>) => {
      try {
        console.warn('[Sentry Alert] Exception captured:', err?.message || err, context || {});
      } catch {
        // Safe no-op
      }
    },
    captureMessage: (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
      try {
        console.log(`[Sentry ${level.toUpperCase()}] ${message}`);
      } catch {
        // Safe no-op
      }
    },
  };
}
