import crypto from 'node:crypto';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/index.js';
import { OpenAICompatibleClient, type LLMResponse } from './llm.js';

export const SummarySchema = z.object({
  summary: z.string().min(5),
  purpose: z.string().min(3),
  key_symbols: z.array(z.string()).default([]),
});
export type SummaryData = z.infer<typeof SummarySchema>;

export const DigestSchema = z.object({
  line1: z.string().min(5).refine((s) => !s.includes('\n'), { message: 'Line 1 must be a single line' }),
  line2: z.string().min(5).refine((s) => !s.includes('\n'), { message: 'Line 2 must be a single line' }),
  risk_flags: z.array(z.string().min(2)).min(1),
});
export type DigestData = z.infer<typeof DigestSchema>;

export const CommitMsgSchema = z.object({
  title: z.string().min(5).max(72),
  body: z.string().default(''),
});
export type CommitMsgData = z.infer<typeof CommitMsgSchema>;

export const WhySchema = z.object({
  role: z.string().min(5),
  architecture: z.string().min(5),
  change_patterns: z.string().min(5),
});
export type WhyData = z.infer<typeof WhySchema>;

export interface DerivedRecord {
  blob_hash: string;
  kind: string;
  model: string;
  prompt_version: string;
  lang: string;
  output: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  is_degraded: number;
  created_at?: string;
}

export interface DerivedResult<T> {
  cached: boolean;
  data: T;
  rawOutput: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  isDegraded: boolean;
  blobHash: string;
  truncated: boolean;
}

export interface DerivedMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  degradedCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgLatencyMs: number;
}

export const PROMPT_VERSIONS: Record<string, string> = {
  summary: 'v1.0',
  digest: 'v1.0',
  commit_msg: 'v1.0',
  why: 'v1.0',
};

const MAX_PAYLOAD_BYTES = 8192;

export function truncatePayload(content: string, maxBytes: number = MAX_PAYLOAD_BYTES): { text: string; truncated: boolean } {
  const byteLen = Buffer.byteLength(content, 'utf8');
  if (byteLen <= maxBytes) {
    return { text: content, truncated: false };
  }
  const slice = content.slice(0, Math.floor(maxBytes * 0.9));
  const text = `${slice}\n\n[... Truncated by Canopy: content size ${byteLen} bytes exceeds limit of ${maxBytes} bytes ...]`;
  return { text, truncated: true };
}

export function computeSha1(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
}

export class DerivedService {
  private db: DatabaseAdapter;
  private llmClient: OpenAICompatibleClient;
  private dailyTokenCap: number;

  // In-memory counters for live trace metrics
  private metricsState = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    degradedCount: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalLatencyMs: 0,
  };

  constructor(db: DatabaseAdapter, llmClient?: OpenAICompatibleClient, dailyTokenCap: number = 200000) {
    this.db = db;
    this.llmClient = llmClient || new OpenAICompatibleClient();
    this.dailyTokenCap = dailyTokenCap;
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_derived_lookup ON derived(blob_hash, kind);
      CREATE INDEX IF NOT EXISTS idx_derived_created ON derived(created_at);

      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_str TEXT NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        model TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date_str);
    `);
  }

  public getModel(): string {
    return this.llmClient.model;
  }

  public getPromptVersion(kind: string): string {
    return PROMPT_VERSIONS[kind] || 'v1.0';
  }

  private isDailyCapExceeded(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const row = this.db.prepare<{ total: number }>(`
        SELECT (COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0)) as total
        FROM token_usage
        WHERE date_str = ?
      `).get(today);
      return (row?.total ?? 0) >= this.dailyTokenCap;
    } catch {
      return false;
    }
  }

  private recordTokenUsage(tokensIn: number, tokensOut: number): void {
    const today = new Date().toISOString().slice(0, 10);
    try {
      this.db.prepare(`
        INSERT INTO token_usage (date_str, tokens_in, tokens_out, model)
        VALUES (?, ?, ?, ?)
      `).run(today, tokensIn, tokensOut, this.llmClient.model);
    } catch {
      // Ignore token record errors
    }
  }

  public getMetrics(): DerivedMetrics {
    const totalRequests = this.metricsState.totalRequests;
    const cacheHits = this.metricsState.cacheHits;
    const cacheMisses = this.metricsState.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
    const avgLatencyMs = cacheMisses > 0 ? Math.round(this.metricsState.totalLatencyMs / cacheMisses) : 0;

    return {
      totalRequests,
      cacheHits,
      cacheMisses,
      cacheHitRate,
      degradedCount: this.metricsState.degradedCount,
      totalTokensIn: this.metricsState.totalTokensIn,
      totalTokensOut: this.metricsState.totalTokensOut,
      avgLatencyMs,
    };
  }

  public getCachedRecord(blobHash: string, kind: string, lang: string = 'en'): DerivedRecord | undefined {
    const promptVersion = this.getPromptVersion(kind);
    const model = this.llmClient.model;
    const stmt = this.db.prepare<DerivedRecord>(`
      SELECT blob_hash, kind, model, prompt_version, lang, output, tokens_in, tokens_out, latency_ms, is_degraded, created_at
      FROM derived
      WHERE blob_hash = ? AND kind = ? AND model = ? AND prompt_version = ? AND lang = ?
    `);
    return stmt.get(blobHash, kind, model, promptVersion, lang);
  }

  public saveDerivedRecord(record: DerivedRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO derived (blob_hash, kind, model, prompt_version, lang, output, tokens_in, tokens_out, latency_ms, is_degraded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.blob_hash,
      record.kind,
      record.model,
      record.prompt_version,
      record.lang,
      record.output,
      record.tokens_in,
      record.tokens_out,
      record.latency_ms,
      record.is_degraded
    );
  }

  /**
   * Generic derived computation with caching, Zod validation, 2 retries, and deterministic heuristic fallback.
   */
  public async computeDerived<T>({
    blobHash,
    kind,
    lang = 'en',
    systemPrompt,
    userPrompt,
    schema,
    heuristicFallback,
  }: {
    blobHash: string;
    kind: string;
    lang?: string;
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodSchema<T>;
    heuristicFallback: () => T;
  }): Promise<DerivedResult<T>> {
    this.metricsState.totalRequests += 1;
    const promptVersion = this.getPromptVersion(kind);
    const model = this.llmClient.model;

    // Check Cache
    const cached = this.getCachedRecord(blobHash, kind, lang);
    if (cached) {
      this.metricsState.cacheHits += 1;
      let parsed: T;
      try {
        parsed = schema.parse(JSON.parse(cached.output));
      } catch {
        parsed = JSON.parse(cached.output);
      }
      return {
        cached: true,
        data: parsed,
        rawOutput: cached.output,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        isDegraded: Boolean(cached.is_degraded),
        blobHash,
        truncated: false,
      };
    }

    // Cache Miss
    this.metricsState.cacheMisses += 1;

    // Check token cap before calling LLM
    if (this.isDailyCapExceeded()) {
      this.metricsState.degradedCount += 1;
      const fallbackData = heuristicFallback();
      const outputJson = JSON.stringify(fallbackData);
      this.saveDerivedRecord({
        blob_hash: blobHash,
        kind,
        model,
        prompt_version: promptVersion,
        lang,
        output: outputJson,
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: 0,
        is_degraded: 1,
      });
      return {
        cached: false,
        data: fallbackData,
        rawOutput: outputJson,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        isDegraded: true,
        blobHash,
        truncated: false,
      };
    }

    // Prepare truncated user prompt
    const { text: safeUserPrompt, truncated } = truncatePayload(userPrompt);

    // Call LLM with up to 2 retries (total 3 attempts)
    let parsedData: T | null = null;
    let rawOutput = '';
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalLatency = 0;
    let isDegraded = false;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: safeUserPrompt },
    ];

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response: LLMResponse = await this.llmClient.chat(messages, {
          temperature: attempt === 0 ? 0.1 : 0.2 * attempt,
        });

        totalTokensIn += response.tokensIn;
        totalTokensOut += response.tokensOut;
        totalLatency += response.latencyMs;

        // Try parsing JSON
        let rawJson: any;
        try {
          rawJson = JSON.parse(response.text);
        } catch {
          // Sometimes models wrap in markdown code blocks: ```json ... ```
          const match = response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match) {
            rawJson = JSON.parse(match[1]);
          } else {
            throw new Error('LLM response is not valid JSON');
          }
        }

        // Validate with Zod
        parsedData = schema.parse(rawJson);
        rawOutput = JSON.stringify(parsedData);
        break; // Success!
      } catch (err: any) {
        if (attempt === 2) {
          // Exhausted retries, fall back to heuristic
          isDegraded = true;
          this.metricsState.degradedCount += 1;
          parsedData = heuristicFallback();
          rawOutput = JSON.stringify(parsedData);
        }
      }
    }

    if (!parsedData) {
      isDegraded = true;
      parsedData = heuristicFallback();
      rawOutput = JSON.stringify(parsedData);
    }

    this.metricsState.totalTokensIn += totalTokensIn;
    this.metricsState.totalTokensOut += totalTokensOut;
    this.metricsState.totalLatencyMs += totalLatency;
    this.recordTokenUsage(totalTokensIn, totalTokensOut);

    // Save in SQLite cache
    this.saveDerivedRecord({
      blob_hash: blobHash,
      kind,
      model,
      prompt_version: promptVersion,
      lang,
      output: rawOutput,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      latency_ms: totalLatency,
      is_degraded: isDegraded ? 1 : 0,
    });

    return {
      cached: false,
      data: parsedData,
      rawOutput,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      latencyMs: totalLatency,
      isDegraded,
      blobHash,
      truncated,
    };
  }

  // --- Specialized methods for M3 and M4 ---

  public async getBlobSummary(
    blobHash: string,
    filePath: string,
    content: string,
    lang: string = 'en'
  ): Promise<DerivedResult<SummaryData>> {
    const isBengali = lang === 'bn';
    const langInstructions = isBengali
      ? 'Output values in Bengali language (বাংলা).'
      : 'Output values in English.';

    const systemPrompt = `You are Canopy, an AI code summarizer. Return a valid JSON object matching this schema:
{
  "summary": "1-2 sentence high-level overview of what this file does",
  "purpose": "Primary architectural responsibility of this file",
  "key_symbols": ["list", "of", "important", "functions", "or", "classes"]
}
${langInstructions}
Output ONLY valid JSON.`;

    const userPrompt = `File: ${filePath}\n\nContent:\n${content}`;

    return this.computeDerived<SummaryData>({
      blobHash,
      kind: 'summary',
      lang,
      systemPrompt,
      userPrompt,
      schema: SummarySchema,
      heuristicFallback: () => {
        const lines = content.split('\n');
        const symbols: string[] = [];
        for (const line of lines) {
          const m = line.match(/(?:function|class|interface|type|const|let|var|def)\s+([a-zA-Z0-9_$]+)/);
          if (m && symbols.length < 5) symbols.push(m[1]);
        }
        return {
          summary: isBengali
            ? `এই ফাইলটি (${lines.length} লাইন) সাধারণ কোড মডিউল। ডিকপলিং এবং পার্সিংয়ের জন্য অফলাইনে বিশ্লেষিত।`
            : `Deterministic summary for ${filePath} (${lines.length} lines). Offline fallback analysis.`,
          purpose: isBengali
            ? `প্রকল্পের একটি কার্যকরী কোড ইউনিট।`
            : `Source component providing functions in ${filePath}.`,
          key_symbols: symbols.length > 0 ? symbols : ['main'],
        };
      },
    });
  }

  public async getDigest(
    diffOrLogText: string,
    since: string = 'HEAD~5',
    lang: string = 'en'
  ): Promise<DerivedResult<DigestData>> {
    const digestHash = computeSha1(`digest:${since}:${diffOrLogText}`);
    const isBengali = lang === 'bn';

    const systemPrompt = `You are Canopy, an AI assistant analyzing repository changes.
Analyze the provided git commit history and diffs.
You must return a valid JSON object with EXACTLY this structure:
{
  "line1": "Single sentence summarizing the overall changes",
  "line2": "Single sentence detailing the components or systems modified",
  "risk_flags": [
    "Short bullet describing a potential risk or stability impact",
    "Another risk or observation"
  ]
}
RULES:
1. line1 and line2 MUST NOT contain any newline characters.
2. risk_flags MUST be an array of at least 1 string describing risks or stability implications.
3. ${isBengali ? 'Respond in Bengali (বাংলা).' : 'Respond in English.'}
Output ONLY the JSON object.`;

    const userPrompt = `Commit range: since ${since}\n\nDiff / Commit log:\n${diffOrLogText}`;

    return this.computeDerived<DigestData>({
      blobHash: digestHash,
      kind: 'digest',
      lang,
      systemPrompt,
      userPrompt,
      schema: DigestSchema,
      heuristicFallback: () => {
        const lines = diffOrLogText.split('\n');
        return {
          line1: isBengali
            ? `সংগ্রহস্থলে ${since} থেকে সাম্প্রতিক পরিবর্তনসমূহ সংযুক্ত হয়েছে।`
            : `Recent changes since ${since} update core repository modules.`,
          line2: isBengali
            ? `কোডবেস আর্কিটেকচার এবং টেস্ট প্যাকেজসমূহে পরিবর্তন লক্ষ্য করা গেছে।`
            : `Modifications span configuration, data processing, and source modules.`,
          risk_flags: isBengali
            ? ['অফলাইন মোড: ডিটারমিনিস্টিক বিশ্লেষক দ্বারা উৎপন্ন', 'উত্পাদনের পূর্বে পরিবর্তন পর্যালোচনা করুন']
            : ['Offline fallback: generated via deterministic heuristics', 'Review large commit set manually'],
        };
      },
    });
  }

  public async getCommitMessage(diffText: string): Promise<DerivedResult<CommitMsgData>> {
    const diffHash = computeSha1(`commit:${diffText}`);

    const systemPrompt = `You are Canopy, an AI generating semantic git commit messages.
Analyze the git diff and return a valid JSON object:
{
  "title": "type(scope): concise imperative title under 72 chars",
  "body": "Bullet points explaining the changes and reasons"
}
Output ONLY valid JSON.`;

    const userPrompt = `Git Diff:\n${diffText}`;

    return this.computeDerived<CommitMsgData>({
      blobHash: diffHash,
      kind: 'commit_msg',
      lang: 'en',
      systemPrompt,
      userPrompt,
      schema: CommitMsgSchema,
      heuristicFallback: () => {
        const lines = diffText.split('\n');
        const modifiedFiles: string[] = [];
        for (const line of lines) {
          if (line.startsWith('+++ b/')) {
            modifiedFiles.push(line.slice(6));
          }
        }
        const fileSample = modifiedFiles.slice(0, 2).join(', ') || 'workspace files';
        return {
          title: `chore: update ${fileSample}`.slice(0, 72),
          body: `- Updated ${modifiedFiles.length || 1} files\n- Deterministic commit message generated via fallback`,
        };
      },
    });
  }

  public async getWhy(
    filePath: string,
    historyContext: string,
    blameSummary: string
  ): Promise<DerivedResult<WhyData>> {
    const whyHash = computeSha1(`why:${filePath}:${historyContext.slice(0, 500)}:${blameSummary.slice(0, 500)}`);

    const systemPrompt = `You are Canopy, an AI code historian explaining WHY a file exists and how it evolved.
Return a valid JSON object:
{
  "role": "Concise explanation of this file's architectural role in the repository",
  "architecture": "How this module connects with other components and why it was designed this way",
  "change_patterns": "Observations on commit patterns, authorship, and stability over time"
}
Output ONLY valid JSON.`;

    const userPrompt = `File: ${filePath}\n\nBlame Summary:\n${blameSummary}\n\nCommit History:\n${historyContext}`;

    return this.computeDerived<WhyData>({
      blobHash: whyHash,
      kind: 'why',
      lang: 'en',
      systemPrompt,
      userPrompt,
      schema: WhySchema,
      heuristicFallback: () => {
        return {
          role: `Architectural component providing functionality for ${filePath}.`,
          architecture: `Serves modular domain logic within the monorepo hierarchy.`,
          change_patterns: `Maintained across historical commits; verified via offline inspection.`,
        };
      },
    });
  }
}
