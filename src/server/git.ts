import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TreeEntry {
  mode: string;
  type: 'tree' | 'blob';
  hash: string;
  size: number;
  path: string;
  name: string;
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface BlameLine {
  commit: string;
  author: string;
  lineNo: number;
  content: string;
}

export function validateSafePath(p?: string): string {
  if (!p) return '';
  // Normalize forward slashes
  const clean = p.replace(/\\/g, '/').trim();

  // Block path traversal and dangerous characters
  if (
    clean.includes('..') ||
    clean.startsWith('/') ||
    clean.startsWith('~') ||
    clean.includes('\0') ||
    /[<>"|?*]/.test(clean)
  ) {
    throw new Error('Path traversal or invalid path detected');
  }

  // Remove trailing slashes
  return clean.replace(/\/+$/, '');
}

export function validateSafeRev(rev?: string): string {
  if (!rev) return 'HEAD';
  const clean = rev.trim();
  // Valid git revision: alphanumeric, hyphens, underscores, dots, slashes, carets, tildes
  if (!/^[a-zA-Z0-9_\-./~^]+$/.test(clean) || clean.includes('..')) {
    throw new Error('Invalid revision specification');
  }
  return clean;
}

export class GitService {
  private repoDir: string;

  constructor(repoDir: string = './data/repo.git') {
    this.repoDir = path.resolve(repoDir);
  }

  private async runGit(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['--git-dir=' + this.repoDir, ...args], {
        maxBuffer: 32 * 1024 * 1024, // 32MB max buffer
      });
      return stdout;
    } catch (err: any) {
      throw new Error(`Git error: ${err.stderr || err.message}`);
    }
  }

  public async getTree(dirParam?: string, revParam: string = 'HEAD', recursive: boolean = false): Promise<TreeEntry[]> {
    const dir = validateSafePath(dirParam);
    const rev = validateSafeRev(revParam);

    let target = rev;
    if (dir) {
      target = `${rev}:${dir}`;
    }

    const args = ['ls-tree', '-l'];
    if (recursive) {
      args.push('-r');
    }
    args.push(target);

    const raw = await this.runGit(args);
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const entries: TreeEntry[] = [];
    for (const line of lines) {
      // Format: <mode> <type> <hash> <size>\t<name>
      // e.g.: 100644 blob 28e6acd6d6816577042b9f1c5975e9943e7f6d63     289\tmodule_001.md
      // Or for tree: 040000 tree 55a3e25786566dd3f6491ba95590048aae1542b2       -\tapps
      const tabIdx = line.indexOf('\t');
      if (tabIdx === -1) continue;

      const meta = line.slice(0, tabIdx).trim().split(/\s+/);
      const name = line.slice(tabIdx + 1).trim();

      const mode = meta[0];
      const type = meta[1] as 'tree' | 'blob';
      const hash = meta[2];
      const sizeStr = meta[3];
      const size = sizeStr === '-' ? 0 : parseInt(sizeStr, 10) || 0;

      const fullPath = dir ? `${dir}/${name}` : name;

      entries.push({
        mode,
        type,
        hash,
        size,
        path: fullPath,
        name,
      });
    }

    return entries;
  }

  public async getFile(filePath: string, revParam: string = 'HEAD'): Promise<{
    path: string;
    rev: string;
    hash: string;
    size: number;
    content: string;
  }> {
    const safePath = validateSafePath(filePath);
    if (!safePath) {
      throw new Error('File path is required');
    }
    const rev = validateSafeRev(revParam);

    // Get content
    const content = await this.runGit(['cat-file', '-p', `${rev}:${safePath}`]);

    // Get blob hash
    const rawHash = await this.runGit(['rev-parse', `${rev}:${safePath}`]);
    const hash = rawHash.trim();

    return {
      path: safePath,
      rev,
      hash,
      size: Buffer.byteLength(content, 'utf8'),
      content,
    };
  }

  public async getLog(revParam: string = 'HEAD', limit: number = 50, filePath?: string): Promise<CommitInfo[]> {
    const rev = validateSafeRev(revParam);
    const safeLimit = Math.max(1, Math.min(200, limit));

    const args = ['log', `--pretty=format:%H|%an|%ad|%s`, '--date=iso-strict', `-n`, safeLimit.toString(), rev];

    if (filePath) {
      const safePath = validateSafePath(filePath);
      args.push('--', safePath);
    }

    const raw = await this.runGit(args);
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

    return lines.map((line) => {
      const parts = line.split('|');
      return {
        hash: parts[0] || '',
        author: parts[1] || '',
        date: parts[2] || '',
        message: parts.slice(3).join('|'),
      };
    });
  }

  public async getBlame(filePath: string, revParam: string = 'HEAD'): Promise<{
    path: string;
    rev: string;
    lines: BlameLine[];
  }> {
    const safePath = validateSafePath(filePath);
    if (!safePath) {
      throw new Error('File path is required');
    }
    const rev = validateSafeRev(revParam);

    const raw = await this.runGit(['blame', '--line-porcelain', rev, '--', safePath]);
    const porcelainLines = raw.split(/\r?\n/);

    const lines: BlameLine[] = [];
    let currentCommit = '';
    let currentAuthor = '';
    let currentLineNo = 0;

    for (const pl of porcelainLines) {
      if (pl.startsWith('\t')) {
        // Content line starts with a tab character
        const content = pl.slice(1);
        lines.push({
          commit: currentCommit.slice(0, 8),
          author: currentAuthor,
          lineNo: currentLineNo,
          content,
        });
      } else if (/^[0-9a-f]{40}\s+\d+\s+(\d+)/.test(pl)) {
        const match = pl.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
        if (match) {
          currentCommit = match[1];
          currentLineNo = parseInt(match[2], 10);
        }
      } else if (pl.startsWith('author ')) {
        currentAuthor = pl.slice('author '.length).trim();
      }
    }

    return {
      path: safePath,
      rev,
      lines,
    };
  }

  public async getDiff(rev1?: string, rev2: string = 'HEAD'): Promise<string> {
    const safeRev2 = validateSafeRev(rev2);
    const args = ['diff'];
    if (rev1) {
      args.push(validateSafeRev(rev1), safeRev2);
    } else {
      args.push(`${safeRev2}~1`, safeRev2);
    }
    return await this.runGit(args);
  }

  public async getRepoStats(): Promise<{
    totalCommits: number;
    totalFiles: number;
    totalBytes: number;
    headCommit: string;
  }> {
    const headCommit = (await this.runGit(['rev-parse', 'HEAD'])).trim();
    const countStr = (await this.runGit(['rev-list', '--count', 'HEAD'])).trim();
    const totalCommits = parseInt(countStr, 10) || 0;

    const tree = await this.getTree('', 'HEAD', true);
    const totalFiles = tree.length;
    const totalBytes = tree.reduce((acc, e) => acc + e.size, 0);

    return {
      totalCommits,
      totalFiles,
      totalBytes,
      headCommit,
    };
  }
}
