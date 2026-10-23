import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { serve } from '@hono/node-server';
import { createApp } from '../src/server/app.js';
import { GitService } from '../src/server/git.js';
import { CanopyClient } from '../src/cli/client.js';
import { seedRepository } from './seed.js';

function getDirSize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(full);
    } else if (entry.isFile()) {
      try {
        size += fs.statSync(full).size;
      } catch {
        // ignore locked files
      }
    }
  }
  return size;
}

export async function runBenchmark(): Promise<{
  cloneDurationMs: number;
  cloneTotalBytes: number;
  cloneWorkingTreeBytes: number;
  mountDurationMs: number;
  mountBytes: number;
  files5ColdDurationMs: number;
  files5ColdBytes: number;
  files5CachedDurationMs: number;
  totalTransferred5Files: number;
  savings5FilesPct: number;
  speedupCold: number;
}> {
  console.log('🌲 Starting Canopy vs Traditional Git Clone Benchmark...\n');

  const repoDir = path.resolve('./data/repo.git');
  if (!fs.existsSync(repoDir)) {
    console.log('Bare repo missing. Seeding synthetic monorepo...');
    await seedRepository('./data');
  }

  // 1. Benchmark Traditional git clone
  const tempCloneDir = path.resolve('./temp-git-clone');
  if (fs.existsSync(tempCloneDir)) {
    fs.rmSync(tempCloneDir, { recursive: true, force: true });
  }

  console.log('Running traditional git clone...');
  const cloneStart = performance.now();
  execSync(`git clone "${repoDir}" "${tempCloneDir}" --quiet`);
  const cloneDurationMs = Math.round(performance.now() - cloneStart);

  const cloneTotalBytes = getDirSize(tempCloneDir);
  const gitObjectsSize = getDirSize(path.join(tempCloneDir, '.git'));
  const cloneWorkingTreeBytes = cloneTotalBytes - gitObjectsSize;

  console.log(`- Traditional git clone time: ${cloneDurationMs} ms`);
  console.log(`- Total cloned size on disk: ${cloneTotalBytes.toLocaleString()} bytes (${(cloneTotalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`- Working tree size: ${cloneWorkingTreeBytes.toLocaleString()} bytes\n`);

  fs.rmSync(tempCloneDir, { recursive: true, force: true });

  // 2. Start local Canopy Server
  const gitService = new GitService(repoDir);
  const app = createApp({ gitService });
  const serverPort = 3199;
  const server = serve({ fetch: app.fetch, port: serverPort });
  const serverUrl = `http://127.0.0.1:${serverPort}`;

  // Give server a moment to bind
  await new Promise((r) => setTimeout(r, 200));

  // 3. Benchmark Canopy Mount
  const workspaceDir = path.resolve('./temp-canopy-workspace');
  if (fs.existsSync(workspaceDir)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }

  const client = new CanopyClient(workspaceDir);

  console.log('Running Canopy lazy mount...');
  const mountStart = performance.now();
  const mountRes = await client.mount(serverUrl);
  const mountDurationMs = Math.round(performance.now() - mountStart);

  console.log(`- Canopy mount time: ${mountDurationMs} ms`);
  console.log(`- Manifest size transferred: ${mountRes.manifestBytes.toLocaleString()} bytes (${(mountRes.manifestBytes / 1024).toFixed(1)} KB)`);
  console.log(`- Total repo files indexed: ${mountRes.entriesCount}`);
  console.log(`- Uncompressed repo size: ${(mountRes.totalRepoBytes / 1024 / 1024).toFixed(2)} MB\n`);

  // 4. Benchmark reading 5 files
  const manifest = client.getManifest();
  const sampleFiles = manifest.filter((e) => e.type === 'blob').slice(0, 5);

  console.log('Fetching 5 files lazily (cold / first read)...');
  const coldStart = performance.now();
  let coldBytes = 0;
  for (const f of sampleFiles) {
    const res = await client.cat(f.path);
    coldBytes += res.size;
  }
  const files5ColdDurationMs = Math.round(performance.now() - coldStart);

  console.log(`- 5 files cold read time: ${files5ColdDurationMs} ms`);
  console.log(`- 5 files payload bytes: ${coldBytes.toLocaleString()} bytes\n`);

  console.log('Reading same 5 files from local cache (warm)...');
  const warmStart = performance.now();
  for (const f of sampleFiles) {
    await client.cat(f.path);
  }
  const files5CachedDurationMs = Math.round((performance.now() - warmStart) * 10) / 10;
  console.log(`- 5 files cached read time: ${files5CachedDurationMs} ms (0 network bytes)\n`);

  // Calculate final metrics
  const totalTransferred5Files = mountRes.manifestBytes + coldBytes;
  const savings5FilesPct = Math.round(((cloneTotalBytes - totalTransferred5Files) / cloneTotalBytes) * 1000) / 10;
  const speedupCold = Math.round((cloneDurationMs / (mountDurationMs + files5ColdDurationMs)) * 10) / 10;

  console.log('========================================================================');
  console.log('🎯 BENCHMARK SUMMARY (5 files read vs full clone):');
  console.log(`Traditional git clone:    ${cloneDurationMs} ms | ${cloneTotalBytes.toLocaleString()} bytes`);
  console.log(`Canopy lazy access:       ${mountDurationMs + files5ColdDurationMs} ms | ${totalTransferred5Files.toLocaleString()} bytes`);
  console.log(`Bandwidth reduction:      ${savings5FilesPct}% saved`);
  console.log(`Speedup factor:           ${speedupCold}x faster`);
  console.log('========================================================================\n');

  // Cleanup
  server.close();
  fs.rmSync(workspaceDir, { recursive: true, force: true });

  const results = {
    cloneDurationMs,
    cloneTotalBytes,
    cloneWorkingTreeBytes,
    mountDurationMs,
    mountBytes: mountRes.manifestBytes,
    files5ColdDurationMs,
    files5ColdBytes: coldBytes,
    files5CachedDurationMs,
    totalTransferred5Files,
    savings5FilesPct,
    speedupCold,
  };

  // Save results
  fs.mkdirSync('./docs', { recursive: true });
  fs.writeFileSync('./docs/benchmark-results.json', JSON.stringify(results, null, 2), 'utf8');

  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/benchmark.ts')) {
  runBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
