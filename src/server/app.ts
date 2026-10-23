import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GitService } from './git.js';
import type { DatabaseAdapter } from '../db/index.js';

export interface AppConfig {
  gitService: GitService;
  db?: DatabaseAdapter;
  publicReadonly?: boolean;
  rateLimitPerMin?: number;
  dailyTokenCap?: number;
}

export function createApp(config: AppConfig) {
  const app = new Hono();
  const { gitService, publicReadonly = false } = config;

  app.use('*', cors());

  // In-memory rate limiting map: ip -> { count, resetTime }
  const ipRateMap = new Map<string, { count: number; resetTime: number }>();
  const limitPerMin = config.rateLimitPerMin ?? 60;

  // Rate limiting middleware
  app.use('/api/*', async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
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
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision') ? 400 : 500;
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
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision') ? 400 : 404;
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
      const status = err.message.includes('Path traversal') || err.message.includes('Invalid revision') ? 400 : 404;
      return c.json({ error: err.message }, status);
    }
  });

  // GET /api/stats
  app.get('/api/stats', async (c) => {
    try {
      const stats = await gitService.getRepoStats();
      return c.json(stats);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
