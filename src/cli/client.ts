import fs from 'node:fs';
import path from 'node:path';

export interface CanopyConfig {
  serverUrl: string;
  mountRev: string;
  mountedAt: string;
}

export interface ManifestEntry {
  mode: string;
  type: 'tree' | 'blob';
  hash: string;
  size: number;
  path: string;
  name: string;
}

export interface CanopyStats {
  manifestBytes: number;
  totalRepoFiles: number;
  totalRepoBytes: number;
  fetchedBlobs: number;
  fetchedBytes: number;
  cacheHits: number;
  cacheMisses: number;
}

export class CanopyClient {
  private workspaceDir: string;
  private canopyDir: string;
  private cacheDir: string;
  private slicesDir: string;
  private configFile: string;
  private manifestFile: string;
  private statsFile: string;

  constructor(workspaceDir: string = './canopy-workspace') {
    this.workspaceDir = path.resolve(workspaceDir);
    this.canopyDir = path.join(this.workspaceDir, '.canopy');
    this.cacheDir = path.join(this.canopyDir, 'cache');
    this.slicesDir = path.join(this.canopyDir, 'slices');
    this.configFile = path.join(this.canopyDir, 'config.json');
    this.manifestFile = path.join(this.canopyDir, 'manifest.json');
    this.statsFile = path.join(this.canopyDir, 'stats.json');
  }

  public isMounted(): boolean {
    return fs.existsSync(this.configFile) && fs.existsSync(this.manifestFile);
  }

  public getConfig(): CanopyConfig {
    if (!this.isMounted()) {
      throw new Error('Workspace is not mounted. Run "canopy mount <server_url>" first.');
    }
    return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
  }

  public getManifest(): ManifestEntry[] {
    if (!this.isMounted()) {
      throw new Error('Workspace is not mounted. Run "canopy mount <server_url>" first.');
    }
    return JSON.parse(fs.readFileSync(this.manifestFile, 'utf8'));
  }

  public getStats(): CanopyStats {
    if (!fs.existsSync(this.statsFile)) {
      return {
        manifestBytes: 0,
        totalRepoFiles: 0,
        totalRepoBytes: 0,
        fetchedBlobs: 0,
        fetchedBytes: 0,
        cacheHits: 0,
        cacheMisses: 0,
      };
    }
    return JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
  }

  private saveStats(stats: CanopyStats): void {
    fs.writeFileSync(this.statsFile, JSON.stringify(stats, null, 2), 'utf8');
  }

  public async mount(serverUrl: string, rev: string = 'HEAD'): Promise<{
    entriesCount: number;
    manifestBytes: number;
    totalRepoBytes: number;
  }> {
    // Normalize serverUrl (remove trailing slash)
    const cleanUrl = serverUrl.replace(/\/+$/, '');

    // Fetch root slice manifest (non-recursive: only top-level directory entries)
    const res = await fetch(`${cleanUrl}/api/tree?rev=${encodeURIComponent(rev)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch manifest from ${cleanUrl}: ${res.status} ${res.statusText}`);
    }
    const rawText = await res.text();
    const manifestBytes = Buffer.byteLength(rawText, 'utf8');
    const data = JSON.parse(rawText);
    const entries: ManifestEntry[] = data.entries || [];

    // Also fetch repository stats for total baseline uncompressed bytes and files
    let totalRepoBytes = 0;
    let totalRepoFiles = 0;
    try {
      const statsRes = await fetch(`${cleanUrl}/api/stats`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        totalRepoBytes = statsData.totalBytes || 0;
        totalRepoFiles = statsData.totalFiles || 0;
      }
    } catch {
      // Fallback if /api/stats unreachable
    }
    if (totalRepoBytes === 0) {
      totalRepoBytes = entries.reduce((acc, e) => acc + (e.type === 'blob' ? e.size : 0), 0);
      totalRepoFiles = entries.filter((e) => e.type === 'blob').length;
    }

    // Ensure directories exist
    fs.mkdirSync(this.workspaceDir, { recursive: true });
    fs.mkdirSync(this.canopyDir, { recursive: true });
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.mkdirSync(this.slicesDir, { recursive: true });

    // Save config
    const config: CanopyConfig = {
      serverUrl: cleanUrl,
      mountRev: rev,
      mountedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), 'utf8');

    // Save initial root slice & manifest
    fs.writeFileSync(path.join(this.slicesDir, 'root.json'), rawText, 'utf8');
    fs.writeFileSync(this.manifestFile, JSON.stringify(entries, null, 2), 'utf8');

    // Initialize stats
    const stats: CanopyStats = {
      manifestBytes,
      totalRepoFiles,
      totalRepoBytes,
      fetchedBlobs: 0,
      fetchedBytes: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.saveStats(stats);

    return {
      entriesCount: entries.length,
      manifestBytes,
      totalRepoBytes,
    };
  }

  public async getTree(dirParam: string = ''): Promise<ManifestEntry[]> {
    const config = this.getConfig();
    const stats = this.getStats();

    const normalizedDir = dirParam.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    const sliceKey = normalizedDir === '' ? 'root' : normalizedDir.replace(/\//g, '__');
    const sliceFile = path.join(this.slicesDir, `${sliceKey}.json`);

    // Check if slice already cached locally
    if (fs.existsSync(sliceFile)) {
      try {
        const raw = fs.readFileSync(sliceFile, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed.entries || [];
      } catch {
        // Corrupt cache file, fallback to network
      }
    }

    // Fetch directory slice from server
    const fetchUrl = `${config.serverUrl}/api/tree?dir=${encodeURIComponent(normalizedDir)}&rev=${encodeURIComponent(config.mountRev)}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch directory slice from ${fetchUrl}: ${res.status} ${res.statusText}`);
    }

    const rawText = await res.text();
    const sliceBytes = Buffer.byteLength(rawText, 'utf8');
    const data = JSON.parse(rawText);
    const newEntries: ManifestEntry[] = data.entries || [];

    // Cache slice locally
    fs.mkdirSync(this.slicesDir, { recursive: true });
    fs.writeFileSync(sliceFile, rawText, 'utf8');

    // Update manifest by merging new entries
    const currentManifest = this.getManifest();
    const existingPaths = new Set(currentManifest.map((e) => e.path));
    let added = false;
    for (const entry of newEntries) {
      if (!existingPaths.has(entry.path)) {
        currentManifest.push(entry);
        existingPaths.add(entry.path);
        added = true;
      }
    }
    if (added) {
      fs.writeFileSync(this.manifestFile, JSON.stringify(currentManifest, null, 2), 'utf8');
    }

    // Track slice network transfer in stats
    stats.manifestBytes += sliceBytes;
    this.saveStats(stats);

    return newEntries;
  }

  public async cat(filePath: string): Promise<{
    content: string;
    fromCache: boolean;
    hash: string;
    size: number;
  }> {
    const config = this.getConfig();
    let manifest = this.getManifest();
    const stats = this.getStats();

    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    let entry = manifest.find((e) => e.path === normalized && e.type === 'blob');

    // If file is not in current manifest, expand parent directory slice on demand
    if (!entry) {
      const parentDir = path.posix.dirname(normalized);
      if (parentDir && parentDir !== '.') {
        await this.getTree(parentDir);
        manifest = this.getManifest();
        entry = manifest.find((e) => e.path === normalized && e.type === 'blob');
      }
    }

    if (!entry) {
      throw new Error(`File '${filePath}' not found in mounted tree manifest`);
    }

    const cachePath = path.join(this.cacheDir, entry.hash);

    // Check local blob cache
    if (fs.existsSync(cachePath)) {
      const content = fs.readFileSync(cachePath, 'utf8');
      stats.cacheHits += 1;
      this.saveStats(stats);
      return {
        content,
        fromCache: true,
        hash: entry.hash,
        size: entry.size,
      };
    }

    // Cache MISS: Fetch from server on first read
    const fetchUrl = `${config.serverUrl}/api/file?path=${encodeURIComponent(normalized)}&rev=${encodeURIComponent(config.mountRev)}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch file from ${fetchUrl}: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const content = data.content as string;

    // Cache locally
    fs.writeFileSync(cachePath, content, 'utf8');

    // Also write to local working directory tree mirror so user can open/edit it locally
    const localFilePath = path.join(this.workspaceDir, normalized);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.writeFileSync(localFilePath, content, 'utf8');

    // Update stats
    stats.cacheMisses += 1;
    stats.fetchedBlobs += 1;
    stats.fetchedBytes += entry.size;
    this.saveStats(stats);

    return {
      content,
      fromCache: false,
      hash: entry.hash,
      size: entry.size,
    };
  }

  public getSummaryStats(): {
    manifestBytes: number;
    fetchedBytes: number;
    totalBytesTransferred: number;
    fullRepoBytes: number;
    bytesSaved: number;
    savingsPercent: number;
    fetchedBlobs: number;
    totalRepoFiles: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
  } {
    const stats = this.getStats();
    const totalBytesTransferred = stats.manifestBytes + stats.fetchedBytes;
    const fullRepoBytes = stats.totalRepoBytes || 1;
    const bytesSaved = Math.max(0, fullRepoBytes - totalBytesTransferred);
    const savingsPercent = Math.max(0, Math.min(100, (bytesSaved / fullRepoBytes) * 100));

    const totalAccesses = stats.cacheHits + stats.cacheMisses;
    const cacheHitRate = totalAccesses > 0 ? (stats.cacheHits / totalAccesses) * 100 : 0;

    return {
      manifestBytes: stats.manifestBytes,
      fetchedBytes: stats.fetchedBytes,
      totalBytesTransferred,
      fullRepoBytes,
      bytesSaved,
      savingsPercent,
      fetchedBlobs: stats.fetchedBlobs,
      totalRepoFiles: stats.totalRepoFiles,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      cacheHitRate,
    };
  }

  public async digest(since: string = 'HEAD~5', lang: string = 'en'): Promise<any> {
    const config = this.getConfig();
    const url = `${config.serverUrl}/api/derived/digest?since=${encodeURIComponent(since)}&lang=${encodeURIComponent(lang)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Digest failed (${res.status}): ${err}`);
    }
    return await res.json();
  }

  public async commitMessage(diffText: string): Promise<any> {
    const config = this.getConfig();
    const url = `${config.serverUrl}/api/derived/commit`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff: diffText }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Commit message generation failed (${res.status}): ${err}`);
    }
    return await res.json();
  }

  public async why(filePath: string, rev: string = 'HEAD'): Promise<any> {
    const config = this.getConfig();
    const url = `${config.serverUrl}/api/derived/why?path=${encodeURIComponent(filePath)}&rev=${encodeURIComponent(rev)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Why query failed (${res.status}): ${err}`);
    }
    return await res.json();
  }
}
