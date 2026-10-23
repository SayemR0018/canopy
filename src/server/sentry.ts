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

  // Parse DSN details if available
  let envelopeUrl: string | null = null;
  let publicKey: string | null = null;
  try {
    const u = new URL(activeDsn);
    const projectId = u.pathname.replace(/^\/+|\/+$/g, '');
    publicKey = u.username;
    envelopeUrl = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
  } catch {
    // Fall back to console only if DSN URL parsing fails
  }

  const sendEnvelope = (payload: string) => {
    if (!envelopeUrl || !publicKey) return;
    try {
      fetch(envelopeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=canopy/0.1.0, sentry_key=${publicKey}`,
        },
        body: payload,
      }).catch(() => {});
    } catch {
      // Safe no-op on network or fetch failure
    }
  };

  const generateEventId = () => {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  };

  // Active Sentry client hook
  return {
    captureException: (err: any, context?: Record<string, any>) => {
      try {
        console.warn('[Sentry Alert] Exception captured:', err?.message || err, context || {});
        const eventId = generateEventId();
        const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
        const itemHeader = JSON.stringify({ type: 'event' });
        const itemBody = JSON.stringify({
          event_id: eventId,
          timestamp: new Date().toISOString(),
          level: 'error',
          platform: 'node',
          exception: {
            values: [
              {
                type: err?.name || 'Error',
                value: err?.message || String(err),
              },
            ],
          },
          extra: context || {},
        });
        sendEnvelope(`${header}\n${itemHeader}\n${itemBody}\n`);
      } catch {
        // Safe no-op
      }
    },
    captureMessage: (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
      try {
        console.log(`[Sentry ${level.toUpperCase()}] ${message}`);
        const eventId = generateEventId();
        const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
        const itemHeader = JSON.stringify({ type: 'event' });
        const itemBody = JSON.stringify({
          event_id: eventId,
          timestamp: new Date().toISOString(),
          level,
          platform: 'node',
          message: { formatted: message },
        });
        sendEnvelope(`${header}\n${itemHeader}\n${itemBody}\n`);
      } catch {
        // Safe no-op
      }
    },
  };
}
