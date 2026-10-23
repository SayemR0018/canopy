import path from 'node:path';
import { Command } from 'commander';
import { CanopyClient } from './client.js';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name('canopy')
    .description('A lazy, AI-assisted layer over git')
    .version('0.1.0');

  program
    .command('mount <serverUrl>')
    .description('Mount a repository lazily (fetches only directory manifest)')
    .option('-r, --rev <rev>', 'Git revision/branch', 'HEAD')
    .option('-w, --workspace <dir>', 'Workspace directory', './canopy-workspace')
    .action(async (serverUrl, options) => {
      try {
        const client = new CanopyClient(options.workspace);
        console.log(`🌲 Mounting repository from ${serverUrl} at revision ${options.rev}...`);
        const res = await client.mount(serverUrl, options.rev);
        console.log(`✅ Successfully mounted!`);
        console.log(`- Manifest size: ${(res.manifestBytes / 1024).toFixed(1)} KB`);
        console.log(`- Total indexed files: ${res.entriesCount}`);
        console.log(`- Uncompressed repo size: ${(res.totalRepoBytes / 1024 / 1024).toFixed(2)} MB`);
        console.log(`- Workspace directory: ${options.workspace}`);
        console.log(`\nRun "canopy cat <path>" to lazily fetch and inspect files.`);
      } catch (err: any) {
        console.error(`❌ Mount error:`, err.message);
        process.exit(1);
      }
    });

  program
    .command('cat <filePath>')
    .alias('open')
    .description('Fetch and display file on demand (cached on first read)')
    .option('-w, --workspace <dir>', 'Workspace directory', './canopy-workspace')
    .action(async (filePath, options) => {
      try {
        const client = new CanopyClient(options.workspace);
        const res = await client.cat(filePath);
        if (process.stdout.isTTY) {
          console.log(`[Canopy: ${res.fromCache ? 'CACHE HIT' : 'COLD FETCH'} | ${res.size} bytes | ${res.hash.slice(0, 8)}]`);
        }
        process.stdout.write(res.content);
      } catch (err: any) {
        console.error(`❌ Cat error:`, err.message);
        process.exit(1);
      }
    });

  program
    .command('stats')
    .description('Display bandwidth savings and cache metrics')
    .option('-w, --workspace <dir>', 'Workspace directory', './canopy-workspace')
    .action((options) => {
      try {
        const client = new CanopyClient(options.workspace);
        const summary = client.getSummaryStats();
        console.log('\n🌲 Canopy Lazy Client Statistics:');
        console.log('───────────────────────────────────────────────────────');
        console.log(`- Indexed Repository Files:   ${summary.totalRepoFiles}`);
        console.log(`- Full Repo Content Size:     ${summary.fullRepoBytes.toLocaleString()} bytes (${(summary.fullRepoBytes / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`- Manifest Download Size:     ${summary.manifestBytes.toLocaleString()} bytes (${(summary.manifestBytes / 1024).toFixed(1)} KB)`);
        console.log(`- Blobs Fetched On-Demand:    ${summary.fetchedBlobs} / ${summary.totalRepoFiles}`);
        console.log(`- Blob Payload Downloaded:    ${summary.fetchedBytes.toLocaleString()} bytes`);
        console.log(`- Total Transferred Bytes:    ${summary.totalBytesTransferred.toLocaleString()} bytes`);
        console.log(`- Bandwidth Saved:            ${summary.bytesSaved.toLocaleString()} bytes (${summary.savingsPercent.toFixed(1)}%)`);
        console.log(`- Local Cache Hits:           ${summary.cacheHits}`);
        console.log(`- Local Cache Misses:         ${summary.cacheMisses}`);
        console.log(`- Cache Hit Rate:             ${summary.cacheHitRate.toFixed(1)}%`);
        console.log('───────────────────────────────────────────────────────\n');
      } catch (err: any) {
        console.error(`❌ Stats error:`, err.message);
        process.exit(1);
      }
    });

  // M4: canopy digest [--since] [--lang en|bn]
  program
    .command('digest')
    .description('Generate AI repository digest (exactly two lines + risk-flags)')
    .option('-s, --since <rev>', 'Git revision / time range to summarize since', 'HEAD~5')
    .option('-l, --lang <lang>', 'Summary language (en or bn)', 'en')
    .option('-w, --workspace <dir>', 'Workspace directory', './canopy-workspace')
    .action(async (options) => {
      try {
        const client = new CanopyClient(options.workspace);
        const lang = options.lang === 'bn' ? 'bn' : 'en';
        const res = await client.digest(options.since, lang);

        if (process.stdout.isTTY) {
          console.log(`[Canopy Digest: ${res.cached ? 'CACHE HIT' : 'GENERATED'} | ${res.isDegraded ? 'DEGRADED FALLBACK' : 'AI MODEL'}]\n`);
        }
        console.log(res.data.line1);
        console.log(res.data.line2);
        console.log('\nRisk Flags:');
        for (const flag of res.data.risk_flags) {
          console.log(`- ${flag}`);
        }
        if (res.truncated) {
          console.log('\n(Note: Diff was truncated to fit context limits)');
        }
      } catch (err: any) {
        console.error(`❌ Digest error:`, err.message);
        process.exit(1);
      }
    });

  // M4: canopy commit (message from diff on stdin)
  program
    .command('commit')
    .description('Generate a semantic commit message from a diff passed on stdin')
    .option('-w, --workspace <dir>', 'Workspace directory', './canopy-workspace')
    .action(async (options) => {
      try {
        const client = new CanopyClient(options.workspace);
        const diffText = await readStdin();

        if (!diffText || !diffText.trim()) {
          console.error('❌ Commit error: No diff provided on stdin. Example usage:');
          console.error('  git diff | canopy commit');
          process.exit(1);
        }

        const res = await client.commitMessage(diffText);
        console.log(res.data.title);
        if (res.data.body) {
          console.log(`\n${res.data.body}`);
        }
        if (res.truncated) {
          console.log('\n# Note: Diff was truncated to fit context limits');
        }
      } catch (err: any) {
        console.error(`❌ Commit message error:`, err.message);
        process.exit(1);
      }
    });

  // M4: canopy why <path>
  program
    .command('why <filePath>')
    .description('Explain why a file exists and how it evolved (history + blame + cached summary)')
    .option('-r, --rev <rev>', 'Git revision', 'HEAD')
    .option('-w, --workspace <dir>', 'Workspace directory', './canopy-workspace')
    .action(async (filePath, options) => {
      try {
        const client = new CanopyClient(options.workspace);
        const res = await client.why(filePath, options.rev);

        console.log(`\n🌲 Canopy Why: ${filePath} (${res.cached ? 'CACHE HIT' : 'COLD ANALYZED'})\n`);
        console.log(`Role:            ${res.data.role}`);
        console.log(`Architecture:    ${res.data.architecture}`);
        console.log(`Change Patterns: ${res.data.change_patterns}`);
        if (res.truncated) {
          console.log('\n(Note: Context was truncated to fit context limits)');
        }
      } catch (err: any) {
        console.error(`❌ Why error:`, err.message);
        process.exit(1);
      }
    });

  return program;
}

const isCliMain = () => {
  if (!process.argv[1]) return false;
  const p = path.resolve(process.argv[1]);
  return (
    p === path.resolve('src/cli/index.ts') ||
    p === path.resolve('dist/cli/index.js') ||
    p.endsWith(path.join('bin', 'canopy.js')) ||
    p.endsWith('canopy.js') ||
    p.endsWith('canopy')
  );
};

if (isCliMain()) {
  createCLI().parse(process.argv);
}
