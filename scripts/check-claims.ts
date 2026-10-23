import fs from 'node:fs';
import path from 'node:path';

console.log('🔍 Checking claims in README.md and docs/POST_FACTS.md against docs/benchmark-results.json...\n');

const benchmarkPath = path.resolve('./docs/benchmark-results.json');
if (!fs.existsSync(benchmarkPath)) {
  console.error(`❌ docs/benchmark-results.json not found! Run "npm run benchmark" first.`);
  process.exit(1);
}

const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));

// Recursively gather all numbers from benchmarkData
const knownNumbers = new Set<number>();
const knownStrings = new Set<string>();

function harvest(obj: any) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'number') {
    knownNumbers.add(obj);
    knownStrings.add(obj.toString());
    knownStrings.add(obj.toFixed(1));
    knownStrings.add(obj.toFixed(2));
    knownStrings.add(Math.round(obj).toString());
    return;
  }
  if (typeof obj === 'string') {
    // Check if string contains numbers (like "0.7 KiB" or "2.77 MiB")
    const match = obj.match(/([0-9]+(?:\.[0-9]+)?)/g);
    if (match) {
      for (const m of match) {
        const val = parseFloat(m);
        if (!isNaN(val)) {
          knownNumbers.add(val);
          knownStrings.add(m);
        }
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) harvest(item);
    return;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      harvest(obj[key]);
    }
  }
}

harvest(benchmarkData);

// Also add repo metadata numbers if present
if (benchmarkData.repo) {
  harvest(benchmarkData.repo);
}

function extractTableNumbers(markdown: string, sectionHeadingRegex: RegExp): { raw: string; num: number; line: number }[] {
  const lines = markdown.split(/\r?\n/);
  let inSection = false;
  const numbers: { raw: string; num: number; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (sectionHeadingRegex.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line) && !sectionHeadingRegex.test(line)) {
      // Reached next section
      break;
    }
    if (inSection) {
      // Find all numbers in table rows or text: e.g. 1,775, 2.77, 99.9%, 1.9x
      // Skip pure footnote or markdown links like [1] or header hashes
      // Match numbers with optional commas and optional decimals
      const matches = line.matchAll(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b/g);
      for (const m of matches) {
        const raw = m[1];
        const cleaned = raw.replace(/,/g, '');
        const val = parseFloat(cleaned);
        // Exclude 0
        if (!isNaN(val)) {
          numbers.push({ raw, num: val, line: i + 1 });
        }
      }
    }
  }
  return numbers;
}

const readmeContent = fs.readFileSync(path.resolve('./README.md'), 'utf8');
const postFactsContent = fs.readFileSync(path.resolve('./docs/POST_FACTS.md'), 'utf8');

const readmeClaims = [
  ...extractTableNumbers(readmeContent, /##\s+Real Benchmark Results/i),
  ...extractTableNumbers(readmeContent, /##\s+Verification & Testing/i),
];
const postFactsClaims = [
  ...extractTableNumbers(postFactsContent, /##\s+1\.\s+Synthetic Repository Characteristics/i),
  ...extractTableNumbers(postFactsContent, /##\s+2\.\s+Bandwidth & Latency Benchmark Results/i),
  ...extractTableNumbers(postFactsContent, /##\s+3\.\s+Verification Gate Suite Facts/i),
  ...extractTableNumbers(postFactsContent, /##\s+4\.\s+Models and Engine Configuration/i),
];

console.log(`Extracted ${readmeClaims.length} numeric claims from README.md benchmark & verification sections.`);
console.log(`Extracted ${postFactsClaims.length} numeric claims from docs/POST_FACTS.md sections 1, 2, 3 & 4.`);

let failedCount = 0;

function checkClaims(claims: { raw: string; num: number; line: number }[], fileName: string) {
  for (const c of claims) {
    const cleaned = c.raw.replace(/,/g, '');
    const num = c.num;

    // Check exact or rounded match
    let match = knownStrings.has(cleaned) || knownNumbers.has(num);
    if (!match) {
      // Check with floating point tolerance for rounded numbers (e.g. 99.9 vs 99.88)
      for (const kn of knownNumbers) {
        if (Math.abs(kn - num) < 0.051) {
          match = true;
          break;
        }
      }
    }

    if (!match) {
      console.error(`❌ [CLAIM ABSENT] ${fileName}:${c.line} -> Number "${c.raw}" (${num}) is absent from docs/benchmark-results.json`);
      failedCount++;
    }
  }
}

checkClaims(readmeClaims, 'README.md');
checkClaims(postFactsClaims, 'docs/POST_FACTS.md');

if (failedCount > 0) {
  console.error(`\n❌ Claim audit failed with ${failedCount} missing numbers.`);
  process.exit(1);
} else {
  console.log(`\n✅ Claim audit passed! All numbers in README.md and docs/POST_FACTS.md are verified in docs/benchmark-results.json.\n`);
  process.exit(0);
}
