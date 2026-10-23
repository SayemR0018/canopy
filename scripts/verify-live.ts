import { performance } from 'node:perf_hooks';

const targetUrl = (process.argv[2] || process.env.CANOPY_LIVE_URL || 'http://localhost:3000').replace(/\/+$/, '');

console.log(`\n======================================================`);
console.log(`🌲 Canopy Live Verification Suite (M8)`);
console.log(`Target URL: ${targetUrl}`);
console.log(`======================================================\n`);

async function runLiveVerification() {
  let passedChecks = 0;
  const totalChecks = 4;

  // 1. Check /healthz
  console.log(`[1/4] Verifying /healthz health check...`);
  try {
    const res = await fetch(`${targetUrl}/healthz`);
    if (!res.ok) throw new Error(`Status ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Unexpected status payload: ${JSON.stringify(data)}`);
    console.log(`  ✅ /healthz returned 200 OK (Uptime: ${data.uptime}s, Cache entries: ${data.cacheEntries})`);
    passedChecks++;
  } catch (err: any) {
    console.error(`  ❌ /healthz failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Check lazy file fetch
  console.log(`\n[2/4] Verifying lazy tree and blob file fetch...`);
  try {
    const treeRes = await fetch(`${targetUrl}/api/tree?dir=apps/web/src`);
    if (!treeRes.ok) throw new Error(`Tree fetch failed (${treeRes.status})`);
    const treeData = await treeRes.json();
    const fileEntry = treeData.entries?.find((e: any) => e.type === 'blob');
    if (!fileEntry) throw new Error('No blob entries returned in apps/web/src');

    const fileRes = await fetch(`${targetUrl}/api/file?path=${encodeURIComponent(fileEntry.path)}`);
    if (!fileRes.ok) throw new Error(`File fetch failed (${fileRes.status})`);
    const fileData = await fileRes.json();
    if (!fileData.content || fileData.hash !== fileEntry.hash) {
      throw new Error('File content or blob hash mismatch');
    }
    console.log(`  ✅ Successfully fetched file "${fileEntry.path}" (${fileData.size} bytes, blob: ${fileData.hash.slice(0, 8)})`);
    passedChecks++;
  } catch (err: any) {
    console.error(`  ❌ Lazy file fetch failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Check cold vs cached digest latency
  console.log(`\n[3/4] Verifying cold vs cached digest latency...`);
  try {
    // Unique revision range to ensure cold execution if needed
    const sinceParam = 'HEAD~7';

    const coldStart = performance.now();
    const coldRes = await fetch(`${targetUrl}/api/derived/digest?since=${encodeURIComponent(sinceParam)}&lang=en`);
    const coldLatency = Math.round(performance.now() - coldStart);
    if (!coldRes.ok) throw new Error(`Cold digest request failed (${coldRes.status})`);
    const coldData = await coldRes.json();

    const cachedStart = performance.now();
    const cachedRes = await fetch(`${targetUrl}/api/derived/digest?since=${encodeURIComponent(sinceParam)}&lang=en`);
    const cachedLatency = Math.round(performance.now() - cachedStart);
    if (!cachedRes.ok) throw new Error(`Cached digest request failed (${cachedRes.status})`);
    const cachedData = await cachedRes.json();

    if (!cachedData.cached) {
      throw new Error('Expected second digest request to hit cache (cached: true)');
    }

    console.log(`  ✅ Cold digest latency:   ${coldLatency} ms (Cached: ${coldData.cached})`);
    console.log(`  ✅ Cached digest latency: ${cachedLatency} ms (Cached: ${cachedData.cached}, Speedup: ${(coldLatency / Math.max(1, cachedLatency)).toFixed(1)}x)`);
    console.log(`  ✅ Digest Output: "${cachedData.data.line1}"`);
    passedChecks++;
  } catch (err: any) {
    console.error(`  ❌ Digest verification failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Check rate limiting holds
  console.log(`\n[4/4] Verifying rate limit enforcement...`);
  try {
    let hitRateLimit = false;
    let rateLimitStatus = 0;

    // Send rapid burst of requests exceeding standard 60 req/min limit
    const promises: Promise<Response>[] = [];
    for (let i = 0; i < 85; i++) {
      promises.push(fetch(`${targetUrl}/api/tree`));
    }

    const responses = await Promise.all(promises);
    for (const r of responses) {
      if (r.status === 429) {
        hitRateLimit = true;
        rateLimitStatus = 429;
        break;
      }
    }

    if (!hitRateLimit) {
      throw new Error('Rate limit check failed: Server did not return HTTP 429 upon request burst');
    }
    console.log(`  ✅ Rate limiter triggered HTTP ${rateLimitStatus} Too Many Requests as expected.`);
    passedChecks++;
  } catch (err: any) {
    console.error(`  ❌ Rate limit check failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 Live Verification Completed: ${passedChecks}/${totalChecks} checks passed!`);
  console.log(`======================================================\n`);
}

runLiveVerification().catch((err) => {
  console.error('Fatal live verification failure:', err);
  process.exit(1);
});
