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
    await page.waitForTimeout(3000);

    // Toggle theme to show dark/light support
    console.log('2. Testing Theme Toggle...');
    await page.click('#themeToggle');
    await page.waitForTimeout(2000);
    await page.click('#themeToggle');
    await page.waitForTimeout(2000);

    // Lazy Tree Explorer: Expand apps -> apps/web/src -> module_001
    console.log('3. Interacting with Lazy Tree...');
    const appsNode = page.locator('.tree-node:has-text("apps")').first();
    if (await appsNode.count() > 0) {
      await appsNode.click();
      await page.waitForTimeout(2000);

      const webNode = page.locator('.tree-node:has-text("web")').first();
      if (await webNode.count() > 0) {
        await webNode.click();
        await page.waitForTimeout(2000);

        const srcNode = page.locator('.tree-node:has-text("src")').first();
        if (await srcNode.count() > 0) {
          await srcNode.click();
          await page.waitForTimeout(2000);

          const file1Node = page.locator('.tree-children .tree-node:has-text("module_001")').first();
          if (await file1Node.count() > 0) {
            await file1Node.click();
            await page.waitForTimeout(5000);
          }

          const file2Node = page.locator('.tree-children .tree-node:has-text("module_002")').first();
          if (await file2Node.count() > 0) {
            await file2Node.click();
            await page.waitForTimeout(5000);
          }
        }
      }
    }

    // Expand packages tree slice
    const pkgNode = page.locator('.tree-node:has-text("packages")').first();
    if (await pkgNode.count() > 0) {
      await pkgNode.click();
      await page.waitForTimeout(2000);
      const uiNode = page.locator('.tree-node:has-text("ui")').first();
      if (await uiNode.count() > 0) {
        await uiNode.click();
        await page.waitForTimeout(2000);
        const compNode = page.locator('.tree-node:has-text("components")').first();
        if (await compNode.count() > 0) {
          await compNode.click();
          await page.waitForTimeout(2000);
          const compFile = page.locator('.tree-children .tree-node:has-text("module_")').first();
          if (await compFile.count() > 0) {
            await compFile.click();
            await page.waitForTimeout(4000);
          }
        }
      }
    }

    // Switch to Digest Tab
    console.log('4. Demonstrating AI Digest...');
    await page.click('button[data-tab="digest"]');
    await page.waitForTimeout(2500);

    // Run Digest in English
    await page.click('#runDigestBtn');
    await page.waitForTimeout(7000);

    // Run Digest in Bengali
    console.log('5. Demonstrating Bengali Digest (--lang bn)...');
    await page.selectOption('#digestLang', 'bn');
    await page.waitForTimeout(2000);
    await page.click('#runDigestBtn');
    await page.waitForTimeout(7000);

    // Switch to Why Tab
    console.log('6. Demonstrating Why Inspector...');
    await page.click('button[data-tab="why"]');
    await page.waitForTimeout(2500);
    await page.fill('#whyPath', 'apps/web/src/module_001.ts');
    await page.waitForTimeout(1000);
    await page.click('#runWhyBtn');
    await page.waitForTimeout(7000);

    await page.fill('#whyPath', 'apps/api/src/services/module_001.ts');
    await page.waitForTimeout(1000);
    await page.click('#runWhyBtn');
    await page.waitForTimeout(7000);

    // Switch to Metrics Tab
    console.log('7. Demonstrating Agent Trace & Metrics view...');
    await page.click('button[data-tab="metrics"]');
    await page.waitForTimeout(4000);

    // Scroll metrics down to inspect JSON trace
    await page.evaluate(() => window.scrollBy(0, 350));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    // Back to files for closing summary
    console.log('8. Returning to Explorer view...');
    await page.click('button[data-tab="explorer"]');
    await page.waitForTimeout(4000);

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

  // Locate ffmpeg with GIF support
  const possibleFfmpegPaths = [
    'C:\\Users\\Sayem\\AppData\\Local\\CapCut\\Apps\\9.5.0.4050\\ffmpeg.exe',
    'C:\\Users\\Sayem\\AppData\\Local\\CapCut\\Apps\\9.4.0.4015\\ffmpeg.exe',
    'C:\\Users\\Sayem\\AppData\\Local\\CapCut\\Apps\\9.3.0.3970\\ffmpeg.exe',
    'ffmpeg',
  ];
  let ffmpegBin = '';
  for (const p of possibleFfmpegPaths) {
    if (p === 'ffmpeg') {
      try {
        const { execSync } = await import('node:child_process');
        execSync('where.exe ffmpeg', { stdio: 'ignore' });
        ffmpegBin = 'ffmpeg';
        break;
      } catch {}
    } else if (fs.existsSync(p)) {
      ffmpegBin = p;
      break;
    }
  }

  if (ffmpegBin && fs.existsSync(destWebm)) {
    console.log(`Converting ${destWebm} to docs/demo.gif using ${ffmpegBin}...`);
    const destGif = path.join(docsDir, 'demo.gif');
    try {
      // Generate optimized gif under 10MB: 540px width, 8fps
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegBin, [
          '-y',
          '-i', destWebm,
          '-vf', 'fps=8,scale=540:-1:flags=lanczos',
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
    console.log('ffmpeg binary not available; skipping demo.gif.');
  }

  console.log('🎉 Demo recording completed successfully!');
}

record().catch((err) => {
  console.error('Recording failed:', err);
  process.exit(1);
});
