import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { createApp } from '../src/server/app.js';
import { GitService } from '../src/server/git.js';
import { CanopyClient } from '../src/cli/client.js';
import { seedRepository } from '../scripts/seed.js';
import fs from 'node:fs';

describe('Canopy Lazy Client (M2 & P1)', () => {
  const testDataDir = './test-data-client';
  const testWorkspace = './test-workspace-client';
  let server: any;
  let serverUrl: string;

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) fs.rmSync(testDataDir, { recursive: true, force: true });
    if (fs.existsSync(testWorkspace)) fs.rmSync(testWorkspace, { recursive: true, force: true });

    await seedRepository(testDataDir);
    const gitService = new GitService(`${testDataDir}/repo.git`);
    const app = createApp({ gitService });
    const port = 3198;
    server = serve({ fetch: app.fetch, port });
    serverUrl = `http://127.0.0.1:${port}`;
    await new Promise((r) => setTimeout(r, 100));
  }, 30000);

  afterAll(() => {
    if (server) server.close();
    if (fs.existsSync(testDataDir)) fs.rmSync(testDataDir, { recursive: true, force: true });
    if (fs.existsSync(testWorkspace)) fs.rmSync(testWorkspace, { recursive: true, force: true });
  });

  it('mounts root manifest slice only without downloading file bodies or full tree', async () => {
    const client = new CanopyClient(testWorkspace);
    const mountRes = await client.mount(serverUrl);

    // Root slice contains only the top-level directory entries (6 dirs)
    expect(mountRes.entriesCount).toBe(6);
    expect(mountRes.manifestBytes).toBeLessThan(5000);
    expect(client.isMounted()).toBe(true);

    const stats = client.getStats();
    expect(stats.fetchedBlobs).toBe(0);
    expect(stats.fetchedBytes).toBe(0);
  });

  it('expands directory slices on demand via getTree', async () => {
    const client = new CanopyClient(testWorkspace);
    const slice = await client.getTree('apps/web/src');

    expect(slice.length).toBe(75);
    expect(slice[0].path).toContain('apps/web/src');
  });

  it('fetches on first read with automatic slice expansion and hits local cache on second read', async () => {
    const client = new CanopyClient(testWorkspace);
    const targetFile = 'apps/web/src/module_001.tsx';

    // 1st read: cold fetch (automatically expands directory slice and fetches blob)
    const firstRead = await client.cat(targetFile);
    expect(firstRead.fromCache).toBe(false);
    expect(firstRead.content.length).toBeGreaterThan(0);
    expect(firstRead.hash.length).toBe(40);

    let stats = client.getStats();
    expect(stats.fetchedBlobs).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHits).toBe(0);

    // 2nd read: warm cache hit
    const secondRead = await client.cat(targetFile);
    expect(secondRead.fromCache).toBe(true);
    expect(secondRead.content).toBe(firstRead.content);

    stats = client.getStats();
    expect(stats.fetchedBlobs).toBe(1); // unchanged
    expect(stats.cacheHits).toBe(1); // incremented
  });

  it('calculates bandwidth savings and cache hit metrics', async () => {
    const client = new CanopyClient(testWorkspace);
    const summary = client.getSummaryStats();

    expect(summary.totalRepoFiles).toBe(3000);
    expect(summary.fetchedBlobs).toBe(1);
    expect(summary.cacheHits).toBe(1);
    expect(summary.cacheMisses).toBe(1);
    expect(summary.cacheHitRate).toBe(50);
    expect(summary.savingsPercent).toBeGreaterThan(50);
  });

  it('runs bin/canopy.js CLI entrypoint cleanly', async () => {
    const { execSync } = await import('node:child_process');
    const stdout = execSync('node bin/canopy.js --help', { encoding: 'utf8' });
    expect(stdout).toContain('canopy [options] [command]');
    expect(stdout).toContain('mount');
    expect(stdout).toContain('cat');
    expect(stdout).toContain('digest');
    expect(stdout).toContain('commit');
    expect(stdout).toContain('why');
  });
});
