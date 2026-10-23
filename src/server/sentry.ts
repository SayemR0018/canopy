export interface GenAiTraceData {
  agentName: 'CanopyDigestAgent' | 'CanopyWhyAgent' | 'CanopyCommitAgent' | 'CanopySummaryAgent';
  kind: string;
  model: string;
  system?: string;
  blobHash: string;
  lang?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cacheHit: boolean;
  retries?: number;
  isDegraded?: boolean;
}

export interface SentryClient {
  captureException(err: any, context?: Record<string, any>): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
  recordGenAiSpan(trace: GenAiTraceData): void;
}

function scrubPii(obj: Record<string, any>): Record<string, any> {
  const scrubbed: Record<string, any> = {};
  const forbiddenPatterns = /password|secret|token|key|diff|content|body|authorization/i;
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === 'ip' || k.toLowerCase() === 'ip_address' || k.toLowerCase() === 'client_ip') {
      // client IP is scrubbed
      continue;
    } else if (forbiddenPatterns.test(k) && typeof v === 'string' && v.length > 64) {
      scrubbed[k] = `[SCRUBBED_${v.length}_BYTES]`;
    } else {
      scrubbed[k] = v;
    }
  }
  return scrubbed;
}

export function createSentry(dsn?: string): SentryClient {
  const activeDsn = dsn || process.env.SENTRY_DSN;

  if (!activeDsn) {
    // Silent no-op when SENTRY_DSN is not configured
    return {
      captureException: () => {},
      captureMessage: () => {},
      recordGenAiSpan: () => {},
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

  const generateHexId = (length: number) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  };

  return {
    captureException: (err: any, context?: Record<string, any>) => {
      try {
        const safeContext = scrubPii(context || {});
        console.warn('[Sentry Alert] Exception captured:', err?.message || err, safeContext);
        const eventId = generateHexId(32);
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
          extra: safeContext,
          user: { ip_address: undefined },
        });
        sendEnvelope(`${header}\n${itemHeader}\n${itemBody}\n`);
      } catch {
        // Safe no-op
      }
    },

    captureMessage: (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
      try {
        console.log(`[Sentry ${level.toUpperCase()}] ${message}`);
        const eventId = generateHexId(32);
        const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
        const itemHeader = JSON.stringify({ type: 'event' });
        const itemBody = JSON.stringify({
          event_id: eventId,
          timestamp: new Date().toISOString(),
          level,
          platform: 'node',
          message: { formatted: message },
          user: { ip_address: undefined },
        });
        sendEnvelope(`${header}\n${itemHeader}\n${itemBody}\n`);
      } catch {
        // Safe no-op
      }
    },

    recordGenAiSpan: (trace: GenAiTraceData) => {
      try {
        console.log(
          `[Sentry GenAI Trace] agent=${trace.agentName} model=${trace.model} cache_hit=${trace.cacheHit} latency=${trace.latencyMs}ms tokens=${trace.tokensIn}/${trace.tokensOut} retries=${trace.retries ?? 0} degraded=${trace.isDegraded ?? false}`
        );

        const eventId = generateHexId(32);
        const traceId = generateHexId(32);
        const spanId = generateHexId(16);
        const nowSec = Date.now() / 1000;
        const startSec = Math.max(0, nowSec - (trace.latencyMs / 1000));

        const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
        const itemHeader = JSON.stringify({ type: 'transaction' });
        const itemBody = JSON.stringify({
          event_id: eventId,
          type: 'transaction',
          transaction: trace.agentName,
          start_timestamp: startSec,
          timestamp: nowSec,
          contexts: {
            trace: {
              trace_id: traceId,
              span_id: spanId,
              op: 'gen_ai',
              description: `${trace.agentName} execution`,
              status: trace.isDegraded ? 'resource_exhausted' : 'ok',
              data: {
                'gen_ai.system': trace.system || 'gemma',
                'gen_ai.request.model': trace.model,
                'gen_ai.usage.prompt_tokens': trace.tokensIn,
                'gen_ai.usage.completion_tokens': trace.tokensOut,
                'gen_ai.usage.total_tokens': trace.tokensIn + trace.tokensOut,
                'canopy.cache_hit': trace.cacheHit,
                'canopy.retry_count': trace.retries ?? 0,
                'canopy.is_degraded': trace.isDegraded ?? false,
                'canopy.blob_hash': trace.blobHash,
                'canopy.lang': trace.lang || 'en',
              },
            },
          },
          tags: {
            'gen_ai.system': trace.system || 'gemma',
            'gen_ai.request.model': trace.model,
            'canopy.agent': trace.agentName,
            'canopy.cache_hit': String(trace.cacheHit),
            'canopy.is_degraded': String(trace.isDegraded ?? false),
            'canopy.lang': trace.lang || 'en',
          },
          user: { ip_address: undefined },
        });

        sendEnvelope(`${header}\n${itemHeader}\n${itemBody}\n`);
      } catch {
        // Safe no-op
      }
    },
  };
}
