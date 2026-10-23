import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { seedRepository } from '../src/seed.js';
import { createApp } from '../src/server/app.js';
import { GitService } from '../src/server/git.js';
import { openDatabase } from '../src/db/index.js';
import { DerivedService } from '../src/server/derived.js';
import { OpenAICompatibleClient } from '../src/server/llm.js';
import { CanopyClient } from '../src/cli/client.js';

console.log(`\n======================================================`);
console.log(`🌲 Canopy Automated Verification Gate Suite`);
console.log(`======================================================\n`);

async function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
    });
  });
}

async function verify() {
  const verifyDataDir = path.resolve('./test-verify-data');
  const verifyWorkspaceDir = path.resolve('./test-verify-workspace');

  try {
    // Step 1: Run Unit Tests
    console.log(`[Step 1/7] Running Vitest test suite...`);
    await runCommand('npx', ['vitest', 'run']);
    console.log(`  ✅ All unit tests passed.\n`);

    // Clean up temporary verify directories
    if (fs.existsSync(verifyDataDir)) fs.rmSync(verifyDataDir, { recursive: true, force: true });
    if (fs.existsSync(verifyWorkspaceDir)) fs.rmSync(verifyWorkspaceDir, { recursive: true, force: true });
    fs.mkdirSync(verifyDataDir, { recursive: true });

    // Step 2: Tiny Local Mock LLM Server speaking /v1/chat/completions
    console.log(`[Step 2/7] Starting local Mock LLM server speaking /v1/chat/completions...`);
    let mockLlmCallCount = 0;
    let shouldReturnBadOutput = false;

    const mockLlmServer = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        mockLlmCallCount++;
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });

          if (shouldReturnBadOutput) {
            // Deliberately malformed JSON that fails Zod parsing
            res.end(JSON.stringify({
              choices: [{ message: { content: 'MALFORMED NON-JSON RESPONSE FROM MODEL' } }],
              usage: { prompt_tokens: 10, completion_tokens: 10 },
            }));
            return;
          }

          // Valid JSON matching schemas
          res.end(JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  line1: 'Automated verification test commit changes processed.',
                  line2: 'Core modules and configuration updated lazily.',
                  risk_flags: ['Synthetic test flag: clean validation', 'Low regression impact'],
                }),
              },
            }],
            usage: { prompt_tokens: 25, completion_tokens: 20 },
          }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => mockLlmServer.listen(4123, resolve));
    console.log(`  ✅ Mock LLM server listening on http://localhost:4123/v1\n`);

    // Step 3: Seed Synthetic Monorepo
    console.log(`[Step 3/7] Seeding deterministic synthetic monorepo in ${verifyDataDir}...`);
    const seedStats = await seedRepository(verifyDataDir);
    console.log(`  ✅ Seeded ${seedStats.totalFiles} files across ${seedStats.totalDirs} dirs and ${seedStats.totalCommits} commits.\n`);

    // Step 4: Boot Canopy Server
    console.log(`[Step 4/7] Booting Canopy Server with mock LLM and SQLite cache...`);
    const gitService = new GitService(path.join(verifyDataDir, 'repo.git'));
    const db = openDatabase(path.join(verifyDataDir, 'cache.db'));
    const llmClient = new OpenAICompatibleClient({
      baseUrl: 'http://localhost:4123/v1',
      model: 'models/gemma-4-26b-a4b-it',
      apiKey: 'mock-key',
    });
    const derivedService = new DerivedService(db, llmClient);

    const app = createApp({
      gitService,
      db,
      derivedService,
      publicReadonly: true,
      rateLimitPerMin: 200,
    });

    const canopyHttpServer = http.createServer((req, res) => {
      // Bridge Node HTTP to Hono fetch
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
      }

      const chunks: any[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const bodyBuffer = Buffer.concat(chunks);
        const honoReq = new Request(url.toString(), {
          method: req.method,
          headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' && bodyBuffer.length > 0 ? bodyBuffer : undefined,
        });

        const honoRes = await app.fetch(honoReq);
        res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()));
        const ab = await honoRes.arrayBuffer();
        res.end(Buffer.from(ab));
      });
    });

    await new Promise<void>((resolve) => canopyHttpServer.listen(3999, resolve));
    console.log(`  ✅ Canopy Server listening on http://localhost:3999\n`);

    // Step 5: E2E check - Opening 5 files fetches far fewer bytes than full clone
    console.log(`[Step 5/7] E2E lazy fetch benchmark (5 files vs full clone)...`);
    const client = new CanopyClient(verifyWorkspaceDir);
    const mountRes = await client.mount('http://localhost:3999');
    console.log(`  - Manifest bytes downloaded: ${(mountRes.manifestBytes / 1024).toFixed(1)} KB`);
    console.log(`  - Full repo content size:   ${(mountRes.totalRepoBytes / 1024 / 1024).toFixed(2)} MB`);

    const sampleSlice = await client.getTree('apps/web/src');
    const sampleFiles = sampleSlice.filter((e) => e.type === 'blob').slice(0, 5);

    for (const f of sampleFiles) {
      await client.cat(f.path);
    }

    const summary = client.getSummaryStats();
    console.log(`  - Transferred bytes (mount + 5 files): ${(summary.totalBytesTransferred / 1024).toFixed(1)} KB`);
    console.log(`  - Bandwidth saved: ${summary.savingsPercent.toFixed(1)}% (${(summary.bytesSaved / 1024 / 1024).toFixed(2)} MB saved)`);

    if (summary.savingsPercent < 50) {
      throw new Error(`Expected >50% bandwidth savings, got ${summary.savingsPercent}%`);
    }
    console.log(`  ✅ Verified: Opening 5 files saved ${summary.savingsPercent.toFixed(1)}% bandwidth vs full clone!\n`);

    // Step 6: Second digest makes 0 LLM calls + Bad model output retry and fallback
    console.log(`[Step 6/7] Verifying cache zero-calls and bad model retry fallback...`);
    const initialCalls = mockLlmCallCount;

    // First digest call (Cold: calls mock LLM)
    const digest1 = await client.digest('HEAD~3', 'en');
    console.log(`  - First digest run status: cached=${digest1.cached}, isDegraded=${digest1.isDegraded}`);
    expectEqual(mockLlmCallCount, initialCalls + 1, 'First digest must make 1 LLM call');

    // Second digest call (Must hit cache with 0 LLM calls)
    const digest2 = await client.digest('HEAD~3', 'en');
    console.log(`  - Second digest run status: cached=${digest2.cached}, isDegraded=${digest2.isDegraded}`);
    expectEqual(digest2.cached, true, 'Second digest must be cached: true');
    expectEqual(mockLlmCallCount, initialCalls + 1, 'Second digest must make 0 additional LLM calls');
    console.log(`  ✅ Verified: Second digest run made 0 LLM calls (instant cache hit).`);

    // Test bad model output triggers retry twice then fallback
    console.log(`  - Triggering bad model output test (3 attempts expected: 1 + 2 retries)...`);
    shouldReturnBadOutput = true;
    const callsBeforeBad = mockLlmCallCount;

    const digestBad = await client.digest('HEAD~99', 'en');
    const callsAfterBad = mockLlmCallCount;
    const retryCalls = callsAfterBad - callsBeforeBad;

    console.log(`  - Attempts made before fallback: ${retryCalls}`);
    console.log(`  - Degraded fallback result: isDegraded=${digestBad.isDegraded}`);
    expectEqual(retryCalls, 3, 'Bad model output must retry twice (3 total attempts)');
    expectEqual(digestBad.isDegraded, true, 'Result must be flagged isDegraded=true');
    console.log(`  ✅ Verified: Bad model output triggered 2 retries and fell back to deterministic heuristic.`);

    // Cleanup servers
    mockLlmServer.close();
    canopyHttpServer.close();
    db.close();

    // Step 7: Claims audit against docs/benchmark-results.json
    console.log(`\n[Step 7/7] Verifying all numerical claims in README.md and docs/POST_FACTS.md...`);
    await runCommand('npx', ['tsx', 'scripts/check-claims.ts']);
    console.log(`  ✅ Verified: All claims match script outputs.\n`);

    console.log(`\n======================================================`);
    console.log(`🎉 ALL VERIFICATION GATES PASSED SUCCESSFULLY!`);
    console.log(`Bandwidth reduction: ${summary.savingsPercent.toFixed(1)}%`);
    console.log(`Zero-call cache hit: verified`);
    console.log(`Retry & heuristic fallback: verified`);
    console.log(`Claims audit: verified`);
    console.log(`======================================================\n`);
  } finally {
    try {
      if (fs.existsSync(verifyDataDir)) fs.rmSync(verifyDataDir, { recursive: true, force: true, maxRetries: 3 });
      if (fs.existsSync(verifyWorkspaceDir)) fs.rmSync(verifyWorkspaceDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Ignore directory cleanup locks on Windows
    }
  }
}

function expectEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg} (expected ${expected}, got ${actual})`);
  }
}

verify().catch((err) => {
  console.error('\n❌ VERIFICATION GATE FAILED:', err);
  process.exit(1);
});
