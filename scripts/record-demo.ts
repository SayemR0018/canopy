import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from '@hono/node-server';
import { createApp } from '../src/server/app.js';
import { GitService } from '../src/server/git.js';
import { openDatabase } from '../src/db/index.js';
import { DerivedService } from '../src/server/derived.js';
import { OpenAICompatibleClient } from '../src/server/llm.js';
import { seedRepository } from '../src/seed.js';

async function record() {
  console.log('🎬 Starting automated Playwright video recording for Canopy demo...');

  const dataDir = path.resolve('./data');
  const repoPath = path.join(dataDir, 'repo.git');

  if (!fs.existsSync(repoPath)) {
    console.log('Seeding synthetic repo...');
    await seedRepository(dataDir);
  }

  const gitService = new GitService(repoPath);
  const db = openDatabase(path.join(dataDir, 'cache.db'));
  const llmClient = new OpenAICompatibleClient();
  const derivedService = new DerivedService(db, llmClient);

  const app = createApp({
    gitService,
    db,
    derivedService,
    publicReadonly: false,
    rateLimitPerMin: 200,
  });

  const port = 3200;
  const server = serve({ fetch: app.fetch, port });
  console.log(`Canopy server ready on http://127.0.0.1:${port}`);

  const docsDir = path.resolve('./docs');
  const videoTempDir = path.join(docsDir, 'video-temp');
  fs.mkdirSync(docsDir, { recursive: true });
  if (fs.existsSync(videoTempDir)) fs.rmSync(videoTempDir, { recursive: true, force: true });
  fs.mkdirSync(videoTempDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: videoTempDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  try {
    console.log('1. Navigating to Canopy UI...');
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Toggle theme to show dark/light support
    console.log('2. Testing Theme Toggle...');
    await page.click('#themeToggle');
    await page.waitForTimeout(1500);
    await page.click('#themeToggle');
    await page.waitForTimeout(1500);

    // Lazy Tree Explorer: Expand apps -> apps/web/src -> module_001
    console.log('3. Interacting with Lazy Tree...');
    // Click on apps directory node
    const appsNode = page.locator('.tree-node:has-text("apps")').first();
    if (await appsNode.count() > 0) {
      await appsNode.click();
      await page.waitForTimeout(1500);

      // Expand web
      const webNode = page.locator('.tree-node:has-text("web")').first();
      if (await webNode.count() > 0) {
        await webNode.click();
        await page.waitForTimeout(1500);

        // Expand src
        const srcNode = page.locator('.tree-node:has-text("src")').first();
        if (await srcNode.count() > 0) {
          await srcNode.click();
          await page.waitForTimeout(2000);

          // Click first file
          const fileNode = page.locator('.tree-children .tree-node:has-text("module_")').first();
          if (await fileNode.count() > 0) {
            await fileNode.click();
            await page.waitForTimeout(4000);
          }
        }
      }
    }

    // Switch to Digest Tab
    console.log('4. Demonstrating AI Digest...');
    await page.click('button[data-tab="digest"]');
    await page.waitForTimeout(2000);

    // Run Digest in English
    await page.click('#runDigestBtn');
    await page.waitForTimeout(6000);

    // Run Digest in Bengali
    console.log('5. Demonstrating Bengali Digest (--lang bn)...');
    await page.selectOption('#digestLang', 'bn');
    await page.waitForTimeout(1000);
    await page.click('#runDigestBtn');
    await page.waitForTimeout(6000);

    // Switch to Why Tab
    console.log('6. Demonstrating Why Inspector...');
    await page.click('button[data-tab="why"]');
    await page.waitForTimeout(2000);
    await page.click('#runWhyBtn');
    await page.waitForTimeout(6000);

    // Switch to Metrics Tab
    console.log('7. Demonstrating Agent Trace & Metrics view...');
    await page.click('button[data-tab="metrics"]');
    await page.waitForTimeout(4000);

    // Scroll metrics down slightly to see trace
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(3000);

    // Back to files
    await page.click('button[data-tab="explorer"]');
    await page.waitForTimeout(3000);

    console.log('Recording sequence completed.');
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    server.close();
    db.close();
  }

  // Find recorded video and move to docs/demo.webm
  const files = fs.readdirSync(videoTempDir);
  const videoFile = files.find((f) => f.endsWith('.webm'));
  const destWebm = path.join(docsDir, 'demo.webm');

  if (videoFile) {
    const srcVideo = path.join(videoTempDir, videoFile);
    fs.copyFileSync(srcVideo, destWebm);
    console.log(`✅ Demo video saved to ${destWebm} (${(fs.statSync(destWebm).size / 1024 / 1024).toFixed(2)} MB)`);
    fs.rmSync(videoTempDir, { recursive: true, force: true });
  }

  // Convert to docs/demo.gif if ffmpeg is found
  const playwrightFfmpeg = 'C:\\Users\\Sayem\\AppData\\Local\\ms-playwright\\ffmpeg-1013\\ffmpeg-win64.exe';
  let ffmpegBin = '';
  if (fs.existsSync(playwrightFfmpeg)) {
    ffmpegBin = playwrightFfmpeg;
  }

  if (ffmpegBin && fs.existsSync(destWebm)) {
    console.log(`Converting ${destWebm} to docs/demo.gif using ${ffmpegBin}...`);
    const destGif = path.join(docsDir, 'demo.gif');
    try {
      // Generate optimized gif under 10MB: 640px width, 10fps
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegBin, [
          '-y',
          '-i', destWebm,
          '-vf', 'fps=10,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
          destGif,
        ]);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });
      });
      const gifSize = fs.statSync(destGif).size;
      console.log(`✅ Demo GIF created at ${destGif} (${(gifSize / 1024 / 1024).toFixed(2)} MB, target < 10MB: ${gifSize < 10 * 1024 * 1024})`);
    } catch (err: any) {
      console.warn(`Could not convert to GIF: ${err.message}`);
    }
  } else {
    console.log('ffmpeg binary not available in PATH; skipping demo.gif.');
  }

  console.log('🎉 Demo recording completed successfully!');
}

record().catch((err) => {
  console.error('Recording failed:', err);
  process.exit(1);
});
