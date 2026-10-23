import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../src/server/app.js';
import { GitService } from '../src/server/git.js';
import { openDatabase } from '../src/db/index.js';
import { seedRepository } from '../scripts/seed.js';
import fs from 'node:fs';

describe('Canopy API Server (M1)', () => {
  const testDir = './test-data-server';
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    await seedRepository(testDir);
    const gitService = new GitService(`${testDir}/repo.git`);
    const db = openDatabase(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS derived (
        blob_hash TEXT NOT NULL,
        kind TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        lang TEXT NOT NULL,
        output TEXT NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        is_degraded INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (blob_hash, kind, model, prompt_version, lang)
      );
    `);

    app = createApp({
      gitService,
      db,
      publicReadonly: true,
      rateLimitPerMin: 100,
    });
  }, 30000);

  it('GET / returns HTML Web UI (M5)', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Canopy');
    expect(html).toContain('Digest');
  });

  it('GET /healthz returns 200 ok', async () => {
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.cacheEntries).toBe(0);
    expect(body.publicReadonly).toBe(true);
  });

  it('GET /api/tree lists root directories', async () => {
    const res = await app.request('/api/tree');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThan(0);
    const names = body.entries.map((e: any) => e.name);
    expect(names).toContain('apps');
    expect(names).toContain('packages');
  });

  it('GET /api/tree?dir=apps/web/src lists files', async () => {
    const res = await app.request('/api/tree?dir=apps/web/src');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0].type).toBe('blob');
  });

  it('GET /api/file returns blob content and hash', async () => {
    const treeRes = await app.request('/api/tree?dir=apps/admin/src');
    const treeBody = await treeRes.json();
    const target = treeBody.entries[0];

    const fileRes = await app.request(`/api/file?path=${target.path}`);
    expect(fileRes.status).toBe(200);
    const fileBody = await fileRes.json();
    expect(fileBody.path).toBe(target.path);
    expect(fileBody.hash).toBe(target.hash);
    expect(fileBody.content).toBeDefined();
    expect(fileBody.size).toBe(target.size);
  });

  it('GET /api/file blocks path traversal with 400', async () => {
    const res = await app.request('/api/file?path=../../etc/passwd');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Path traversal');
  });

  it('GET /api/file blocks directory paths with 400', async () => {
    const res = await app.request('/api/file?path=apps');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not a file');
  });

  it('POST /api/derived/commit is blocked with 403 in public read-only mode', async () => {
    const res = await app.request('/api/derived/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff: 'diff --git a/f b/f\n+hello' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('public read-only mode');
  });

  it('GET /api/log returns commit history', async () => {
    const res = await app.request('/api/log?limit=5');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commits.length).toBe(5);
    expect(body.commits[0].author).toContain('Canopy');
  });

  it('GET /api/blame returns blame lines', async () => {
    const treeRes = await app.request('/api/tree?dir=apps/admin/src');
    const treeBody = await treeRes.json();
    const target = treeBody.entries[0];

    const res = await app.request(`/api/blame?path=${target.path}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lines.length).toBeGreaterThan(0);
    expect(body.lines[0].author).toBeDefined();
  });

  it('GET /api/stats returns repo stats', async () => {
    const res = await app.request('/api/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCommits).toBe(200);
    expect(body.totalFiles).toBe(3000);
    expect(body.totalBytes).toBeGreaterThan(500000);
  });

  it('enforces rate limiting and parses cf-connecting-ip and x-forwarded-for behind proxies', async () => {
    const limitedApp = createApp({
      gitService: {
        getTree: async () => [{ name: 'test', type: 'blob', path: 'test', size: 10, hash: 'abc' }],
      } as any,
      db: null,
      rateLimitPerMin: 5,
    });

    const clientIp = '203.0.113.195';
    for (let i = 0; i < 5; i++) {
      const res = await limitedApp.request('/api/tree', {
        headers: {
          'x-forwarded-for': `${clientIp}:54321, 172.68.1.1`,
        },
      });
      expect(res.status).toBe(200);
    }

    // 6th request from same client IP (different ephemeral port or downstream proxy) should hit 429
    const limitedRes = await limitedApp.request('/api/tree', {
      headers: {
        'x-forwarded-for': `${clientIp}:54322, 172.68.1.2`,
      },
    });
    expect(limitedRes.status).toBe(429);
    const body = await limitedRes.json();
    expect(body.error).toContain('Rate limit exceeded');

    // Different client IP with cf-connecting-ip should succeed
    const distinctRes = await limitedApp.request('/api/tree', {
      headers: {
        'cf-connecting-ip': '198.51.100.42',
      },
    });
    expect(distinctRes.status).toBe(200);
  });
});

