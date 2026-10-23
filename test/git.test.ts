import { describe, it, expect, beforeAll } from 'vitest';
import { GitService, validateSafePath, validateSafeRev } from '../src/server/git.js';
import { seedRepository } from '../scripts/seed.js';
import fs from 'node:fs';

describe('GitService and Path Traversal Security', () => {
  const testDataDir = './test-data-git';

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    await seedRepository(testDataDir);
  }, 30000);

  it('blocks path traversal attacks', () => {
    expect(() => validateSafePath('../secrets.txt')).toThrow(/Path traversal/);
    expect(() => validateSafePath('/etc/passwd')).toThrow(/Path traversal/);
    expect(() => validateSafePath('..\\windows\\system32')).toThrow(/Path traversal/);
    expect(() => validateSafePath('foo/../../bar')).toThrow(/Path traversal/);
    expect(() => validateSafePath('~/.ssh/id_rsa')).toThrow(/Path traversal/);
    expect(() => validateSafePath('foo\0bar')).toThrow(/Path traversal/);
  });

  it('validates safe revisions', () => {
    expect(validateSafeRev('HEAD')).toBe('HEAD');
    expect(validateSafeRev('main')).toBe('main');
    expect(validateSafeRev('HEAD~1')).toBe('HEAD~1');
    expect(() => validateSafeRev('HEAD..other')).toThrow(/Invalid revision/);
    expect(() => validateSafeRev('; rm -rf /')).toThrow(/Invalid revision/);
  });

  it('lists root tree entries', async () => {
    const git = new GitService(`${testDataDir}/repo.git`);
    const root = await git.getTree();
    expect(root.length).toBeGreaterThan(0);
    const names = root.map((e) => e.name);
    expect(names).toContain('apps');
    expect(names).toContain('packages');
  });

  it('lists nested directory tree entries', async () => {
    const git = new GitService(`${testDataDir}/repo.git`);
    const entries = await git.getTree('apps/web/src');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.type === 'blob')).toBe(true);
  });

  it('reads file content and blob hash', async () => {
    const git = new GitService(`${testDataDir}/repo.git`);
    const tree = await git.getTree('apps/admin/src');
    const first = tree[0];
    const file = await git.getFile(first.path);
    expect(file.path).toBe(first.path);
    expect(file.hash).toBe(first.hash);
    expect(file.content.length).toBeGreaterThan(0);
  });

  it('fetches commit log', async () => {
    const git = new GitService(`${testDataDir}/repo.git`);
    const log = await git.getLog('HEAD', 10);
    expect(log.length).toBe(10);
    expect(log[0].hash).toMatch(/^[0-9a-f]{40}$/);
    expect(log[0].author).toContain('Canopy');
  });

  it('fetches blame for a file', async () => {
    const git = new GitService(`${testDataDir}/repo.git`);
    const tree = await git.getTree('apps/admin/src');
    const blame = await git.getBlame(tree[0].path);
    expect(blame.path).toBe(tree[0].path);
    expect(blame.lines.length).toBeGreaterThan(0);
    expect(blame.lines[0].author).toContain('Canopy');
  });
});
