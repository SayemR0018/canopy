import { Command } from 'commander';
import { CanopyClient } from './client.js';

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

  return program;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('src/cli/index.ts')) {
  createCLI().parse(process.argv);
}
