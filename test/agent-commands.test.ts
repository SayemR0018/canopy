import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../src/server/app.js';
import { GitService } from '../src/server/git.js';
import { openDatabase } from '../src/db/index.js';
import { DerivedService } from '../src/server/derived.js';
import { OpenAICompatibleClient } from '../src/server/llm.js';
import { seedRepository } from '../scripts/seed.js';
import fs from 'node:fs';

describe('Agent Commands and Server Derived API (M4)', () => {
  const testDir = './test-data-agent';
  let app: ReturnType<typeof createApp>;
  let derivedService: DerivedService;
  let llmCallCount = 0;

  beforeAll(async () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    await seedRepository(testDir);
    const gitService = new GitService(`${testDir}/repo.git`);
    const db = openDatabase(':memory:');

    const mockLlm = {
      model: 'models/gemma-4-26b-a4b-it',
      baseUrl: 'http://mock-llm',
      apiKey: '',
      chat: async (messages: any[]) => {
        llmCallCount += 1;
        const prompt = messages.map((m: any) => m.content).join(' ');

        if (prompt.includes('বাংলা') || prompt.includes('Bengali')) {
          return {
            text: JSON.stringify({
              line1: 'সংগ্রহস্থলে সাম্প্রতিক পরিবর্তনসমূহ সফলভাবে সংযুক্ত হয়েছে।',
              line2: 'মডিউল আর্কিটেকচার এবং টেস্ট প্যাকেজ আপডেট করা হয়েছে।',
              risk_flags: ['উচ্চ ট্রাফিক পর্যবেক্ষণ করুন', 'কোনো ব্রেকিং চেঞ্জ নেই'],
            }),
            tokensIn: 40,
            tokensOut: 30,
            latencyMs: 15,
          };
        }

        if (prompt.includes('semantic git commit messages')) {
          return {
            text: JSON.stringify({
              title: 'feat(api): add lazy tree and file traversal endpoints',
              body: '- Implement GET /api/tree and /api/file\n- Add safe path traversal protection',
            }),
            tokensIn: 35,
            tokensOut: 25,
            latencyMs: 12,
          };
        }

        if (prompt.includes('code historian explaining WHY')) {
          return {
            text: JSON.stringify({
              role: 'Provides synthetic benchmark code modules for client evaluation.',
              architecture: 'Directly consumed by web app package and tests.',
              change_patterns: 'Consistently updated across historical feature milestones.',
            }),
            tokensIn: 50,
            tokensOut: 45,
            latencyMs: 20,
          };
        }

        // Default digest
        return {
          text: JSON.stringify({
            line1: 'Upgraded lazy streaming endpoints to reduce client clone bandwidth.',
            line2: 'Optimized SQLite derived cache indices and added retry resilience.',
            risk_flags: ['Monitor memory usage under concurrent requests', 'No migration required'],
          }),
          tokensIn: 45,
          tokensOut: 35,
          latencyMs: 18,
        };
      },
    } as unknown as OpenAICompatibleClient;

    derivedService = new DerivedService(db, mockLlm);

    app = createApp({
      gitService,
      db,
      derivedService,
      publicReadonly: false,
      rateLimitPerMin: 100,
    });
  }, 30000);

  it('GET /api/derived/digest returns exactly 2 lines and a list of risk flags', async () => {
    const res = await app.request('/api/derived/digest?since=HEAD~3&lang=en');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.line1).toBeDefined();
    expect(body.data.line2).toBeDefined();
    expect(body.data.line1).not.toContain('\n');
    expect(body.data.line2).not.toContain('\n');
    expect(Array.isArray(body.data.risk_flags)).toBe(true);
    expect(body.data.risk_flags.length).toBeGreaterThan(0);
  });

  it('Second digest call hits cache with 0 additional LLM calls', async () => {
    const initialCalls = llmCallCount;
    // Calling the exact same query
    const res = await app.request('/api/derived/digest?since=HEAD~3&lang=en');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cached).toBe(true);
    expect(llmCallCount).toBe(initialCalls); // 0 new LLM calls
  });

  it('GET /api/derived/digest?lang=bn returns Bengali content', async () => {
    const res = await app.request('/api/derived/digest?since=HEAD~2&lang=bn');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.line1).toContain('সংগ্রহস্থলে');
    expect(body.data.risk_flags.length).toBeGreaterThan(0);
  });

  it('POST /api/derived/commit generates semantic title and body from diff', async () => {
    const fakeDiff = `
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
+export const lazy = true;
`;
    const res = await app.request('/api/derived/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff: fakeDiff }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toContain('feat(');
    expect(body.data.body).toBeDefined();
  });

  it('POST /api/derived/commit rejects diffs exceeding 64KB with 413', async () => {
    const hugeDiff = 'x'.repeat(70 * 1024); // 70 KB
    const res = await app.request('/api/derived/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff: hugeDiff }),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain('exceeds maximum limit');
  });

  it('GET /api/derived/why returns architectural rationale and history', async () => {
    const treeRes = await app.request('/api/tree?dir=apps/web/src');
    const treeBody = await treeRes.json();
    const targetPath = treeBody.entries[0].path;

    const res = await app.request(`/api/derived/why?path=${encodeURIComponent(targetPath)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBeDefined();
    expect(body.data.architecture).toBeDefined();
    expect(body.data.change_patterns).toBeDefined();
  });

  it('GET /api/derived/stats returns cache trace metrics', async () => {
    const res = await app.request('/api/derived/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.totalRequests).toBeGreaterThan(0);
    expect(body.metrics.cacheHits).toBeGreaterThanOrEqual(1);
    expect(body.database.totalCachedEntries).toBeGreaterThan(0);
  });
});
