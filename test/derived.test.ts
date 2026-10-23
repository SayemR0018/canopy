import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import {
  DerivedService,
  SummarySchema,
  DigestSchema,
  CommitMsgSchema,
  WhySchema,
  truncatePayload,
} from '../src/server/derived.js';
import { OpenAICompatibleClient } from '../src/server/llm.js';

describe('Derived Cache and LLM Layer (M3)', () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('truncates content exceeding maximum payload limit and appends notice', () => {
    const huge = 'A'.repeat(12000);
    const { text, truncated } = truncatePayload(huge, 8192);
    expect(truncated).toBe(true);
    expect(text).toContain('Truncated by Canopy');
    expect(text.length).toBeLessThan(huge.length);

    const small = 'Hello world';
    const resSmall = truncatePayload(small, 8192);
    expect(resSmall.truncated).toBe(false);
    expect(resSmall.text).toBe(small);
  });

  it('validates schemas with Zod correctly', () => {
    const validSummary = SummarySchema.parse({
      summary: 'High-level summary of service logic.',
      purpose: 'Coordinates data cache.',
      key_symbols: ['DerivedService', 'computeDerived'],
    });
    expect(validSummary.summary).toBeDefined();

    const validDigest = DigestSchema.parse({
      line1: 'Updated core server endpoints and added lazy file retrieval.',
      line2: 'Enhanced test suite coverage across client and server packages.',
      risk_flags: ['Potential rate limit exhaustion on high volume', 'No breaking schema changes'],
    });
    expect(validDigest.line1).toBeDefined();
    expect(validDigest.risk_flags.length).toBe(2);

    // Multiline line1 should fail validation
    expect(() =>
      DigestSchema.parse({
        line1: 'Line one\nIllegal newline',
        line2: 'Line two',
        risk_flags: ['risk'],
      })
    ).toThrow();
  });

  it('stores derived output in SQLite and serves cache hits with 0 LLM calls', async () => {
    let callCount = 0;
    const mockLlm = {
      model: 'mock-model',
      baseUrl: 'http://mock',
      apiKey: '',
      chat: async () => {
        callCount += 1;
        return {
          text: JSON.stringify({
            summary: 'A fast SQLite cache module.',
            purpose: 'Serves derived data.',
            key_symbols: ['cache'],
          }),
          tokensIn: 20,
          tokensOut: 15,
          latencyMs: 12,
        };
      },
    } as unknown as OpenAICompatibleClient;

    const service = new DerivedService(db, mockLlm);

    // Call 1: Cache Miss
    const res1 = await service.getBlobSummary('blob123', 'src/cache.ts', 'export const cache = true;');
    expect(res1.cached).toBe(false);
    expect(res1.isDegraded).toBe(false);
    expect(res1.data.summary).toBe('A fast SQLite cache module.');
    expect(callCount).toBe(1);

    // Call 2: Cache Hit
    const res2 = await service.getBlobSummary('blob123', 'src/cache.ts', 'export const cache = true;');
    expect(res2.cached).toBe(true);
    expect(res2.isDegraded).toBe(false);
    expect(res2.tokensIn).toBe(0);
    expect(res2.tokensOut).toBe(0);
    expect(callCount).toBe(1); // 0 new LLM calls!

    // Verify DB record directly
    const row = service.getCachedRecord('blob123', 'summary', 'en');
    expect(row).toBeDefined();
    expect(row?.blob_hash).toBe('blob123');
    expect(row?.is_degraded).toBe(0);
  });

  it('retries twice on invalid model output and falls back to deterministic heuristic flagged degraded', async () => {
    let callCount = 0;
    const mockFailingLlm = {
      model: 'failing-model',
      baseUrl: 'http://mock',
      apiKey: '',
      chat: async () => {
        callCount += 1;
        // Returns garbage that fails JSON parsing and Zod validation
        return {
          text: 'This is not valid json at all!',
          tokensIn: 10,
          tokensOut: 10,
          latencyMs: 5,
        };
      },
    } as unknown as OpenAICompatibleClient;

    const service = new DerivedService(db, mockFailingLlm);

    const res = await service.getDigest('dummy diff', 'HEAD~2', 'en');

    // 1 initial attempt + 2 retries = 3 attempts total
    expect(callCount).toBe(3);
    expect(res.cached).toBe(false);
    expect(res.isDegraded).toBe(true);
    expect(res.data.line1).toContain('Recent changes');
    expect(res.data.risk_flags.length).toBeGreaterThan(0);

    // Second call should return the degraded record from cache
    const resCached = await service.getDigest('dummy diff', 'HEAD~2', 'en');
    expect(resCached.cached).toBe(true);
    expect(resCached.isDegraded).toBe(true);
    expect(callCount).toBe(3); // 0 additional LLM calls
  });

  it('supports Bengali language translation and stores separately in cache', async () => {
    const mockLlm = {
      model: 'mock-model',
      baseUrl: 'http://mock',
      apiKey: '',
      chat: async () => {
        return {
          text: JSON.stringify({
            line1: 'সংগ্রহস্থলে সাম্প্রতিক পরিবর্তনসমূহ সফলভাবে সংযুক্ত হয়েছে।',
            line2: 'মূল মডিউল এবং ডেটাবেজ লেয়ার আপডেট করা হয়েছে।',
            risk_flags: ['উচ্চ ট্রাফিক পর্যবেক্ষণ করুন', 'কোনো ব্রেকিং চেঞ্জ নেই'],
          }),
          tokensIn: 30,
          tokensOut: 25,
          latencyMs: 15,
        };
      },
    } as unknown as OpenAICompatibleClient;

    const service = new DerivedService(db, mockLlm);

    const resBn = await service.getDigest('diff text', 'HEAD~1', 'bn');
    expect(resBn.data.line1).toContain('সংগ্রহস্থলে');

    const cachedBn = service.getCachedRecord(resBn.blobHash, 'digest', 'bn');
    expect(cachedBn).toBeDefined();
    expect(cachedBn?.lang).toBe('bn');

    // English should be a separate cache miss
    const cachedEn = service.getCachedRecord(resBn.blobHash, 'digest', 'en');
    expect(cachedEn).toBeUndefined();
  });
});
