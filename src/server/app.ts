import fs from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GitService } from './git.js';
import type { DatabaseAdapter } from '../db/index.js';
import { DerivedService } from './derived.js';
import { createSentry } from './sentry.js';
import { renderCanopyHtml } from './ui.js';

export interface AppConfig {
  gitService: GitService;
  db?: DatabaseAdapter;
  derivedService?: DerivedService;
  publicReadonly?: boolean;
  rateLimitPerMin?: number;
  dailyTokenCap?: number;
  sentryDsn?: string;
}

const MAX_DIFF_BYTES = 64 * 1024; // 64 KB limit on pasted diffs

export function createApp(config: AppConfig) {
  const app = new Hono();
  const { gitService, publicReadonly = false } = config;
  const sentry = createSentry(config.sentryDsn);

  // Initialize or use provided DerivedService if database exists
  let derivedService = config.derivedService;
  if (!derivedService && config.db) {
    derivedService = new DerivedService(config.db, undefined, config.dailyTokenCap ?? 200000);
  }

  app.use('*', cors());

  // In-memory rate limiting map: ip -> { count, resetTime }
  const ipRateMap = new Map<string, { count: number; resetTime: number }>();
  const limitPerMin = config.rateLimitPerMin ?? 60;

  // Rate limiting middleware for all /api/* routes
  app.use('/api/*', async (c, next) => {
    const rawIp =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1';
    const ip = rawIp.replace(/:\d+$/, '');
    const now = Date.now();
    let record = ipRateMap.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + 60000 };
      ipRateMap.set(ip, record);
    } else {
      record.count += 1;
      if (record.count > limitPerMin) {
        return c.json(
          {
            error: 'Rate limit exceeded. Please wait a minute before making more requests.',
            retryAfterMs: record.resetTime - now,
          },
          429
        );
      }
    }

    await next();
  });

  // Web UI endpoint (M5)
  app.get('/', (c) => {
    return c.html(renderCanopyHtml());
  });

  // /healthz endpoint
  app.get('/healthz', (c) => {
    let cacheCount = 0;
    if (config.db) {
      try {
        const row = config.db.prepare<{ count: number }>('SELECT count(*) as count FROM derived').get();
        cacheCount = row?.count ?? 0;
      } catch {
        cacheCount = 0;
      }
    }

    return c.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      cacheEntries: cacheCount,
      memoryUsage: process.memoryUsage(),
      publicReadonly,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tree?dir=&rev=&recursive=
  app.get('/api/tree', async (c) => {
    try {
      const dir = c.req.query('dir') || '';
      const rev = c.req.query('rev') || 'HEAD';
      const recursive = c.req.query('recursive') === 'true';

      const entries = await gitService.getTree(dir, rev, recursive);
      return c.json({
        dir,
        rev,
        entries,
      });
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/tree' });
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision')
        ? 400
        : err.message.includes('Not a valid object name') || err.message.includes('does not exist')
        ? 404
        : 500;
      return c.json({ error: err.message }, status);
    }
  });

  // GET /api/file?path=&rev=
  app.get('/api/file', async (c) => {
    try {
      const filePath = c.req.query('path');
      if (!filePath) {
        return c.json({ error: 'Missing path query parameter' }, 400);
      }
      const rev = c.req.query('rev') || 'HEAD';
      const file = await gitService.getFile(filePath, rev);
      return c.json(file);
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/file' });
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision') || err.message.includes('is a tree') || err.message.includes('not a file') ? 400 : 404;
      return c.json({ error: err.message }, status);
    }
  });

  // GET /api/log?rev=&limit=&path=
  app.get('/api/log', async (c) => {
    try {
      const rev = c.req.query('rev') || 'HEAD';
      const limit = parseInt(c.req.query('limit') || '50', 10);
      const filePath = c.req.query('path') || undefined;

      const commits = await gitService.getLog(rev, limit, filePath);
      return c.json({
        rev,
        commits,
      });
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/log' });
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision') ? 400 : 500;
      return c.json({ error: err.message }, status);
    }
  });

  // GET /api/blame?path=&rev=
  app.get('/api/blame', async (c) => {
    try {
      const filePath = c.req.query('path');
      if (!filePath) {
        return c.json({ error: 'Missing path query parameter' }, 400);
      }
      const rev = c.req.query('rev') || 'HEAD';
      const blame = await gitService.getBlame(filePath, rev);
      return c.json(blame);
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/blame' });
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision') ? 400 : 404;
      return c.json({ error: err.message }, status);
    }
  });

  // GET /api/stats
  app.get('/api/stats', async (c) => {
    try {
      const stats = await gitService.getRepoStats();
      let benchmarkSavingsPct = 81.0;
      try {
        if (fs.existsSync('./docs/benchmark-results.json')) {
          const raw = JSON.parse(fs.readFileSync('./docs/benchmark-results.json', 'utf8'));
          if (raw?.savings5FilesPct != null) benchmarkSavingsPct = raw.savings5FilesPct;
        }
      } catch {}

      return c.json({
        ...stats,
        benchmarkSavingsPct,
      });
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/stats' });
      return c.json({ error: err.message }, 500);
    }
  });

  // --- Derived Endpoints (M3, M4) ---

  // Helper to ensure derived service exists
  const getDerived = () => {
    if (!derivedService) {
      throw new Error('Derived service / database cache is not enabled');
    }
    return derivedService;
  };

  // GET or POST /api/derived/summary
  app.all('/api/derived/summary', async (c) => {
    try {
      const s = getDerived();
      let pathParam = c.req.query('path');
      let revParam = c.req.query('rev') || 'HEAD';
      let lang = c.req.query('lang') || 'en';
      let content = '';
      let blobHash = '';

      if (c.req.method === 'POST') {
        const body = await c.req.json().catch(() => ({}));
        pathParam = body.path || pathParam;
        revParam = body.rev || revParam;
        lang = body.lang || lang;
        content = body.content || '';
        blobHash = body.blobHash || '';
      }

      if (!pathParam && !blobHash) {
        return c.json({ error: 'path or blobHash is required' }, 400);
      }

      if (!content && pathParam) {
        const file = await gitService.getFile(pathParam, revParam);
        content = file.content;
        blobHash = file.hash;
      }

      const result = await s.getBlobSummary(blobHash, pathParam || 'file', content, lang);
      return c.json(result);
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/derived/summary' });
      return c.json({ error: err.message }, 500);
    }
  });

  // GET or POST /api/derived/digest
  app.all('/api/derived/digest', async (c) => {
    try {
      const s = getDerived();
      let since = c.req.query('since') || 'HEAD~5';
      let lang = c.req.query('lang') || 'en';
      let diff = '';

      if (c.req.method === 'POST') {
        const rawBody = await c.req.text().catch(() => '');
        if (Buffer.byteLength(rawBody, 'utf8') > MAX_DIFF_BYTES) {
          return c.json({ error: `Diff payload exceeds maximum limit of ${MAX_DIFF_BYTES / 1024} KB` }, 413);
        }
        let parsed: any = {};
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          parsed = { diff: rawBody };
        }
        since = parsed.since || since;
        lang = parsed.lang || lang;
        diff = parsed.diff || '';
      }

      if (!diff) {
        // Fetch commit logs and diff since target revision
        try {
          const log = await gitService.getLog('HEAD', 20);
          const diffText = await gitService.getDiff(since, 'HEAD');
          diff = `Recent Commits:\n${log.slice(0, 10).map((l) => `${l.hash.slice(0, 8)} ${l.message}`).join('\n')}\n\nDiff:\n${diffText}`;
        } catch {
          diff = `Repository update since ${since}`;
        }
      }

      const result = await s.getDigest(diff, since, lang);
      return c.json(result);
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/derived/digest' });
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /api/derived/commit (generates semantic commit message from diff)
  app.post('/api/derived/commit', async (c) => {
    if (publicReadonly) {
      return c.json({ error: 'Write endpoints are disabled in public read-only mode' }, 403);
    }
    try {
      const s = getDerived();
      const rawBody = await c.req.text();

      if (Buffer.byteLength(rawBody, 'utf8') > MAX_DIFF_BYTES) {
        return c.json({ error: `Diff payload exceeds maximum limit of ${MAX_DIFF_BYTES / 1024} KB` }, 413);
      }

      let diffText = '';
      try {
        const parsed = JSON.parse(rawBody);
        diffText = parsed.diff || '';
      } catch {
        diffText = rawBody;
      }

      if (!diffText || !diffText.trim()) {
        return c.json({ error: 'Diff payload is required to generate a commit message' }, 400);
      }

      const result = await s.getCommitMessage(diffText);
      return c.json(result);
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/derived/commit' });
      return c.json({ error: err.message }, 500);
    }
  });

  // GET or POST /api/derived/why
  app.all('/api/derived/why', async (c) => {
    try {
      const s = getDerived();
      let filePath = c.req.query('path');
      let rev = c.req.query('rev') || 'HEAD';

      if (c.req.method === 'POST') {
        const body = await c.req.json().catch(() => ({}));
        filePath = body.path || filePath;
        rev = body.rev || rev;
      }

      if (!filePath) {
        return c.json({ error: 'path query parameter is required' }, 400);
      }

      // Collect historical context and blame
      const commits = await gitService.getLog(rev, 15, filePath);
      const blame = await gitService.getBlame(filePath, rev);

      // Summarize authors from blame
      const authorMap = new Map<string, number>();
      for (const line of blame.lines) {
        authorMap.set(line.author, (authorMap.get(line.author) || 0) + 1);
      }
      const topAuthors = Array.from(authorMap.entries())
        .map(([author, count]) => `${author}: ${count} lines`)
        .join(', ');

      const historyContext = commits
        .map((c) => `[${c.hash.slice(0, 8)}] ${c.date.slice(0, 10)} (${c.author}): ${c.message}`)
        .join('\n');

      const blameSummary = `Total lines: ${blame.lines.length}. Authors: ${topAuthors}`;

      const result = await s.getWhy(filePath, historyContext, blameSummary);
      return c.json(result);
    } catch (err: any) {
      sentry.captureException(err, { endpoint: '/api/derived/why' });
      return c.json({ error: err.message }, 500);
    }
  });

  // GET /api/derived/stats (Agent Trace View)
  app.get('/api/derived/stats', async (c) => {
    try {
      const s = getDerived();
      const metrics = s.getMetrics();

      let dbCacheTotal = 0;
      let dbDegradedTotal = 0;
      if (config.db) {
        try {
          const row1 = config.db.prepare<{ count: number }>('SELECT count(*) as count FROM derived').get();
          dbCacheTotal = row1?.count ?? 0;
          const row2 = config.db.prepare<{ count: number }>('SELECT count(*) as count FROM derived WHERE is_degraded = 1').get();
          dbDegradedTotal = row2?.count ?? 0;
        } catch {
          // Ignore DB count errors
        }
      }

      return c.json({
        model: s.getModel(),
        promptVersions: {
          summary: s.getPromptVersion('summary'),
          digest: s.getPromptVersion('digest'),
          commit_msg: s.getPromptVersion('commit_msg'),
          why: s.getPromptVersion('why'),
        },
        metrics,
        database: {
          totalCachedEntries: dbCacheTotal,
          totalDegradedEntries: dbDegradedTotal,
        },
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
