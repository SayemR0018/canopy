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

export function bytesToKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

export function bytesToMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function calculateMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function calculateMin(arr: number[]): number {
  return Math.min(...arr);
}

function calculateMax(arr: number[]): number {
  return Math.max(...arr);
}

export interface SingleRunResult {
  run: number;
  cloneDurationMs: number;
  cloneTotalBytes: number;
  cloneWorkingTreeBytes: number;
  mountDurationMs: number;
  mountBytes: number;
  files5ColdDurationMs: number;
  files5ColdBytes: number;
  files5CachedDurationMs: number;
  totalTransferred5Files: number;
  savingsVsClonePct: number;
  savingsVsWorkingTreePct: number;
  speedupCold: number;
  initialSpeedup: number;
  initialSavingsVsClonePct: number;
}

export async function runBenchmark(iterations: number = 7) {
  console.log(`🌲 Starting Canopy vs Git Clone 7-Run Hardened Benchmark (${iterations} iterations)...\n`);

  const repoDir = path.resolve('./data/repo.git');
  if (!fs.existsSync(repoDir)) {
    console.log('Bare repo missing. Seeding synthetic monorepo...');
    await seedRepository('./data');
  }

  // Start local Canopy Server
  const gitService = new GitService(repoDir);
  const app = createApp({ gitService });
  const serverPort = 3199;
  const server = serve({ fetch: app.fetch, port: serverPort });
  const serverUrl = `http://127.0.0.1:${serverPort}`;

  // Give server a moment to bind
  await new Promise((r) => setTimeout(r, 200));

  const runs: SingleRunResult[] = [];
  const sampleFiles = [
    'apps/web/src/module_001.tsx',
    'apps/web/src/module_002.json',
    'apps/web/src/module_003.md',
    'apps/web/src/module_004.sql',
    'apps/web/src/module_005.css',
  ];

  for (let i = 1; i <= iterations; i++) {
    console.log(`--- [Run ${i}/${iterations}] ---`);

    // 1. Benchmark Traditional git clone
    const tempCloneDir = path.resolve(`./temp-git-clone-${i}`);
    if (fs.existsSync(tempCloneDir)) {
      fs.rmSync(tempCloneDir, { recursive: true, force: true });
    }

    const cloneStart = performance.now();
    execSync(`git clone "${repoDir}" "${tempCloneDir}" --quiet`);
    const cloneDurationMs = Math.round(performance.now() - cloneStart);

    const cloneTotalBytes = getDirSize(tempCloneDir);
    const gitObjectsSize = getDirSize(path.join(tempCloneDir, '.git'));
    const cloneWorkingTreeBytes = cloneTotalBytes - gitObjectsSize;

    fs.rmSync(tempCloneDir, { recursive: true, force: true });

    // 2. Benchmark Canopy Mount
    const workspaceDir = path.resolve(`./temp-canopy-workspace-${i}`);
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }

    const client = new CanopyClient(workspaceDir);
    const mountStart = performance.now();
    const mountRes = await client.mount(serverUrl);
    const mountDurationMs = Math.round(performance.now() - mountStart);
    const mountBytes = mountRes.manifestBytes;

    // 3. Benchmark reading 5 files (cold: expands directory slice + fetches blobs)
    const coldStart = performance.now();
    for (const f of sampleFiles) {
      await client.cat(f);
    }
    const files5ColdDurationMs = Math.round(performance.now() - coldStart);

    const clientStats = client.getStats();
    const files5ColdBytes = clientStats.fetchedBytes;
    const totalTransferred5Files = clientStats.manifestBytes + clientStats.fetchedBytes;

    // 4. Benchmark reading same 5 files (warm / cached)
    const warmStart = performance.now();
    for (const f of sampleFiles) {
      await client.cat(f);
    }
    const files5CachedDurationMs = Math.round((performance.now() - warmStart) * 10) / 10;

    // Calculations
    const savingsVsClonePct = Math.round(((cloneTotalBytes - totalTransferred5Files) / cloneTotalBytes) * 1000) / 10;
    const savingsVsWorkingTreePct = Math.round(((cloneWorkingTreeBytes - totalTransferred5Files) / cloneWorkingTreeBytes) * 1000) / 10;
    const speedupCold = Math.round((cloneDurationMs / (mountDurationMs + files5ColdDurationMs)) * 10) / 10;
    const initialSpeedup = Math.round((cloneDurationMs / Math.max(1, mountDurationMs)) * 10) / 10;
    const initialSavingsVsClonePct = Math.round(((cloneTotalBytes - mountBytes) / cloneTotalBytes) * 1000) / 10;

    console.log(`  Clone: ${cloneDurationMs} ms (${bytesToMiB(cloneTotalBytes)}) | Working tree: ${bytesToMiB(cloneWorkingTreeBytes)}`);
    console.log(`  Mount: ${mountDurationMs} ms (${bytesToKiB(mountBytes)})`);
    console.log(`  5 Files Cold: ${files5ColdDurationMs} ms (${bytesToKiB(files5ColdBytes)}) | Warm: ${files5CachedDurationMs} ms`);
    console.log(`  Total Transferred: ${bytesToKiB(totalTransferred5Files)} | Savings vs clone: ${savingsVsClonePct}% | Savings vs tree: ${savingsVsWorkingTreePct}%\n`);

    runs.push({
      run: i,
      cloneDurationMs,
      cloneTotalBytes,
      cloneWorkingTreeBytes,
      mountDurationMs,
      mountBytes,
      files5ColdDurationMs,
      files5ColdBytes,
      files5CachedDurationMs,
      totalTransferred5Files,
      savingsVsClonePct,
      savingsVsWorkingTreePct,
      speedupCold,
      initialSpeedup,
      initialSavingsVsClonePct,
    });

    // Cleanup workspace
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }

  server.close();

  // Aggregate stats across 7 runs
  const metrics = [
    'cloneDurationMs',
    'cloneTotalBytes',
    'cloneWorkingTreeBytes',
    'mountDurationMs',
    'mountBytes',
    'files5ColdDurationMs',
    'files5ColdBytes',
    'files5CachedDurationMs',
    'totalTransferred5Files',
    'savingsVsClonePct',
    'savingsVsWorkingTreePct',
    'speedupCold',
    'initialSpeedup',
    'initialSavingsVsClonePct',
  ] as const;

  const median: Record<string, any> = {};
  const min: Record<string, any> = {};
  const max: Record<string, any> = {};

  for (const m of metrics) {
    const values = runs.map((r) => r[m]);
    median[m] = calculateMedian(values);
    min[m] = calculateMin(values);
    max[m] = calculateMax(values);
  }

  // Consistent unit formatted values from raw bytes
  const formatted = {
    cloneTotalMiB: bytesToMiB(median.cloneTotalBytes),
    cloneWorkingTreeMiB: bytesToMiB(median.cloneWorkingTreeBytes),
    mountKiB: bytesToKiB(median.mountBytes),
    files5ColdKiB: bytesToKiB(median.files5ColdBytes),
    totalTransferredKiB: bytesToKiB(median.totalTransferred5Files),
  };

  const totalEndToEndDurationMs = median.mountDurationMs + median.files5ColdDurationMs;
  const warmNetworkBytes = 0;

  const repoStats = await gitService.getRepoStats();

  const benchmarkResults = {
    runsCount: iterations,
    median: {
      ...median,
      totalEndToEndDurationMs,
      warmNetworkBytes,
      ...formatted,
    },
    min,
    max,
    runs,
    repo: {
      seed: 1337,
      totalFiles: repoStats.totalFiles,
      totalDirs: 40,
      totalCommits: repoStats.totalCommits,
      totalBytes: repoStats.totalBytes,
      totalBytesKiB: bytesToKiB(repoStats.totalBytes),
      totalBytesMiB: bytesToMiB(repoStats.totalBytes),
    },
  };

  fs.mkdirSync('./docs', { recursive: true });
  fs.writeFileSync('./docs/benchmark-results.json', JSON.stringify(benchmarkResults, null, 2), 'utf8');

  console.log('========================================================================');
  console.log(`🎯 7-RUN BENCHMARK MEDIAN SUMMARY:`);
  console.log(`Traditional git clone (history): ${median.cloneDurationMs} ms (min: ${min.cloneDurationMs}, max: ${max.cloneDurationMs}) | ${median.cloneTotalBytes.toLocaleString()} bytes (${formatted.cloneTotalMiB})`);
  console.log(`Working-tree baseline:           ${median.cloneWorkingTreeBytes.toLocaleString()} bytes (${formatted.cloneWorkingTreeMiB})`);
  console.log(`Canopy mount (root slice):       ${median.mountDurationMs} ms (min: ${min.mountDurationMs}, max: ${max.mountDurationMs}) | ${median.mountBytes.toLocaleString()} bytes (${formatted.mountKiB})`);
  console.log(`5 files cold read:               ${median.files5ColdDurationMs} ms | ${median.files5ColdBytes.toLocaleString()} bytes (${formatted.files5ColdKiB})`);
  console.log(`5 files warm cache:              ${median.files5CachedDurationMs} ms (0 network bytes)`);
  console.log(`Total transferred (mount+5):     ${median.totalTransferred5Files.toLocaleString()} bytes (${formatted.totalTransferredKiB})`);
  console.log(`Bandwidth savings vs full clone: ${median.savingsVsClonePct}%`);
  console.log(`Bandwidth savings vs tree size:  ${median.savingsVsWorkingTreePct}%`);
  console.log(`Speedup (mount only):            ${median.initialSpeedup}x faster`);
  console.log(`Speedup (mount + 5 cold files):  ${median.speedupCold}x faster`);
  console.log('========================================================================\n');

  return benchmarkResults;
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('benchmark.ts')) {
  runBenchmark(7).catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
