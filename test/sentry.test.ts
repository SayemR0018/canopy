import { describe, it, expect, vi } from 'vitest';
import { createSentry } from '../src/server/sentry.js';
import { createApp } from '../src/server/app.js';

describe('Sentry Monitoring Hook (src/server/sentry.ts & app.ts)', () => {
  it('operates as a silent no-op when SENTRY_DSN is missing or empty', () => {
    const origDsn = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const sentry = createSentry(undefined);
    expect(sentry).toBeDefined();

    sentry.captureException(new Error('Test error'));
    sentry.captureMessage('Test message');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    logSpy.mockRestore();
    if (origDsn) process.env.SENTRY_DSN = origDsn;
  });

  it('activates and logs Sentry alerts when SENTRY_DSN is provided', () => {
    const dummyDsn = 'https://key123@o12345.ingest.sentry.io/67890';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const sentry = createSentry(dummyDsn);

    sentry.captureException(new Error('Synthetic alert'), { tag: 'test' });
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sentry Alert] Exception captured:',
      'Synthetic alert',
      { tag: 'test' }
    );

    sentry.captureMessage('Server booted successfully', 'info');
    expect(logSpy).toHaveBeenCalledWith('[Sentry INFO] Server booted successfully');

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('captures unhandled route errors via app.onError in createApp', async () => {
    const dummyDsn = 'https://key123@o12345.ingest.sentry.io/67890';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const app = createApp({
      gitService: {
        getTree: async () => {
          throw new Error('Simulated Git Failure');
        },
      } as any,
      sentryDsn: dummyDsn,
    });

    const res = await app.request('/api/tree');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Simulated Git Failure');

    expect(warnSpy).toHaveBeenCalled();
    const alertCall = warnSpy.mock.calls.find((c) =>
      c[0] === '[Sentry Alert] Exception captured:' && c[1] === 'Simulated Git Failure'
    );
    expect(alertCall).toBeDefined();

    warnSpy.mockRestore();
  });

  it('captures global unhandled route throws via app.onError', async () => {
    const dummyDsn = 'https://key123@o12345.ingest.sentry.io/67890';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const app = createApp({
      gitService: {} as any,
      sentryDsn: dummyDsn,
    });

    app.get('/api/test-throw', () => {
      throw new Error('Unhandled crash test');
    });

    const res = await app.request('/api/test-throw');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Unhandled crash test');

    const alertCall = warnSpy.mock.calls.find((c) =>
      c[0] === '[Sentry Alert] Exception captured:' && c[1] === 'Unhandled crash test'
    );
    expect(alertCall).toBeDefined();

    warnSpy.mockRestore();
  });

  it('normalizes DSN URLs with trailing slashes correctly', () => {
    const trailingSlashDsn = 'https://key456@o99999.ingest.sentry.io/123456/';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sentry = createSentry(trailingSlashDsn);
    expect(sentry).toBeDefined();

    sentry.captureException(new Error('Trailing slash test'));
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sentry Alert] Exception captured:',
      'Trailing slash test',
      {}
    );

    warnSpy.mockRestore();
  });

  it('verifies that startServer in src/server/index.ts wires and returns active Sentry', async () => {
    const origDsn = process.env.SENTRY_DSN;
    const dummyDsn = 'https://key123@o12345.ingest.sentry.io/67890';
    process.env.SENTRY_DSN = dummyDsn;

    const { startServer } = await import('../src/server/index.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { server, sentry } = await startServer(3888);
    expect(sentry).toBeDefined();

    // Verify Sentry status and boot message were logged on boot
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('- Sentry: active'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Sentry INFO] Canopy Server running on port 3888'));

    // Clean up server
    await new Promise<void>((resolve) => server.close(() => resolve()));
    logSpy.mockRestore();
    if (origDsn) {
      process.env.SENTRY_DSN = origDsn;
    } else {
      delete process.env.SENTRY_DSN;
    }
  });
});

