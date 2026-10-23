export function renderCanopyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canopy - Lazy, AI-Assisted Layer Over Git</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --surface-border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --primary: #2ea043;
      --primary-hover: #3fb950;
      --accent: #58a6ff;
      --danger: #f85149;
      --warning: #d29922;
      --code-bg: #0b0e14;
      --font-mono: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    [data-theme="light"] {
      --bg: #ffffff;
      --surface: #f6f8fa;
      --surface-border: #d0d7de;
      --text: #1f2328;
      --text-muted: #656d76;
      --primary: #1f883d;
      --primary-hover: #1a7f37;
      --accent: #0969da;
      --danger: #cf222e;
      --warning: #9a6700;
      --code-bg: #f6f8fa;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    header {
      background: var(--surface);
      border-bottom: 1px solid var(--surface-border);
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 700;
      font-size: 1.25rem;
      color: var(--text);
      text-decoration: none;
    }

    .brand-icon {
      font-size: 1.5rem;
    }

    .nav-tabs {
      display: flex;
      gap: 0.5rem;
    }

    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }

    .tab-btn:hover {
      color: var(--text);
      background: var(--surface-border);
    }

    .tab-btn.active {
      color: var(--text);
      background: var(--surface-border);
      border-color: var(--primary);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .theme-toggle {
      background: transparent;
      border: 1px solid var(--surface-border);
      color: var(--text);
      padding: 0.4rem 0.7rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
    }

    main {
      flex: 1;
      padding: 1.5rem;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Explorer View */
    .explorer-layout {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 1.25rem;
      height: calc(100vh - 140px);
    }

    .tree-panel {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      overflow-y: auto;
      padding: 0.75rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }

    .tree-node {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      user-select: none;
      white-space: nowrap;
    }

    .tree-node:hover {
      background: var(--surface-border);
    }

    .tree-node.selected {
      background: var(--primary);
      color: #fff;
    }

    .tree-children {
      margin-left: 1.25rem;
      border-left: 1px solid var(--surface-border);
      padding-left: 0.25rem;
    }

    .content-panel {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .content-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--surface-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }

    .file-meta {
      display: flex;
      gap: 1rem;
      color: var(--text-muted);
    }

    .content-body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .ai-card {
      background: var(--code-bg);
      border: 1px solid var(--surface-border);
      border-left: 4px solid var(--accent);
      border-radius: 6px;
      padding: 1rem;
    }

    .ai-card-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .badge {
      display: inline-block;
      padding: 0.15rem 0.4rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-success { background: #238636; color: #fff; }
    .badge-cached { background: #1f6feb; color: #fff; }
    .badge-degraded { background: var(--warning); color: #000; }

    pre.code-view {
      background: var(--code-bg);
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      overflow-x: auto;
      white-space: pre;
    }

    /* Digest & Why Panels */
    .form-card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 1.5rem;
      max-width: 800px;
      margin: 0 auto 1.5rem auto;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.4rem;
      color: var(--text);
    }

    .form-control {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.9rem;
    }

    .form-control:focus {
      outline: none;
      border-color: var(--accent);
    }

    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.5rem 1rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    .btn:hover { background: var(--primary-hover); }

    .result-box {
      margin-top: 1.5rem;
      background: var(--code-bg);
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      padding: 1.25rem;
    }

    .result-line {
      font-size: 1rem;
      margin-bottom: 0.5rem;
      line-height: 1.6;
    }

    .risk-list {
      margin-top: 0.75rem;
      padding-left: 1.25rem;
    }

    .risk-item {
      color: var(--warning);
      margin-bottom: 0.25rem;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .metric-card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 1.25rem;
    }

    .metric-title {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .metric-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text);
      margin-top: 0.35rem;
    }

    .metric-sub {
      font-size: 0.8rem;
      color: var(--primary);
      margin-top: 0.25rem;
    }

    @media (max-width: 768px) {
      .explorer-layout { grid-template-columns: 1fr; height: auto; }
      .tree-panel { max-height: 300px; }
    }
  </style>
</head>
<body data-theme="dark">
  <header>
    <a href="#" class="brand">
      <span class="brand-icon">🌲</span>
      <span>Canopy</span>
    </a>
    <nav class="nav-tabs">
      <button class="tab-btn active" data-tab="explorer">📁 Files</button>
      <button class="tab-btn" data-tab="digest">⚡ Digest</button>
      <button class="tab-btn" data-tab="why">🔍 Why</button>
      <button class="tab-btn" data-tab="metrics">📊 Metrics & Traces</button>
    </nav>
    <div class="header-actions">
      <button class="theme-toggle" id="themeToggle" title="Toggle Light/Dark Theme">🌓 Theme</button>
    </div>
  </header>

  <main>
    <!-- TAB 1: EXPLORER -->
    <div id="explorerTab" class="tab-content active">
      <div class="explorer-layout">
        <div class="tree-panel" id="treeView">
          <div style="padding: 0.5rem; color: var(--text-muted);">Loading lazy file tree...</div>
        </div>
        <div class="content-panel">
          <div class="content-header">
            <span id="selectedFilePath">Select a file from the tree</span>
            <div class="file-meta">
              <span id="fileSize"></span>
              <span id="fileHash"></span>
            </div>
          </div>
          <div class="content-body">
            <div class="ai-card" id="summaryCard" style="display: none;">
              <div class="ai-card-title">
                <span>🤖 AI Blob Summary & Purpose</span>
                <span id="summaryBadge" class="badge badge-cached">CACHED</span>
              </div>
              <div id="summaryContent" style="font-size: 0.95rem; margin-bottom: 0.5rem;"></div>
              <div id="summaryPurpose" style="font-size: 0.85rem; color: var(--text-muted);"></div>
              <div id="summarySymbols" style="margin-top: 0.5rem; display: flex; gap: 0.4rem; flex-wrap: wrap;"></div>
            </div>
            <pre class="code-view" id="codeContent">Click any file in the monorepo tree to lazily fetch its blob and derived AI summary.</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: DIGEST -->
    <div id="digestTab" class="tab-content">
      <div class="form-card">
        <h2 style="margin-bottom: 1rem;">⚡ AI Repository Digest</h2>
        <p style="color: var(--text-muted); margin-bottom: 1.25rem; font-size: 0.9rem;">
          Summarizes repository changes into exactly two lines of dense context followed by risk flags. Cached once per revision range.
        </p>
        <div class="form-group">
          <label class="form-label" for="digestSince">Since Revision / Commit</label>
          <input type="text" id="digestSince" class="form-control" value="HEAD~5" placeholder="e.g. HEAD~5 or v0.1.0">
        </div>
        <div class="form-group">
          <label class="form-label" for="digestLang">Language</label>
          <select id="digestLang" class="form-control">
            <option value="en">English (en)</option>
            <option value="bn">Bengali (bn - বাংলা)</option>
          </select>
        </div>
        <button class="btn" id="runDigestBtn">Run Canopy Digest</button>

        <div class="result-box" id="digestResult" style="display: none;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
            <strong id="digestStatus" style="font-size: 0.85rem; color: var(--accent);"></strong>
            <span id="digestBadge" class="badge badge-cached"></span>
          </div>
          <p class="result-line" id="digestLine1" style="font-weight: 600;"></p>
          <p class="result-line" id="digestLine2"></p>
          <div style="margin-top: 0.75rem; font-weight: 600; font-size: 0.85rem; color: var(--warning);">Risk Flags:</div>
          <ul class="risk-list" id="digestRisks"></ul>
        </div>
      </div>
    </div>

    <!-- TAB 3: WHY -->
    <div id="whyTab" class="tab-content">
      <div class="form-card">
        <h2 style="margin-bottom: 1rem;">🔍 Why Inspector</h2>
        <p style="color: var(--text-muted); margin-bottom: 1.25rem; font-size: 0.9rem;">
          Explains why a file exists, its architectural responsibility, and evolution patterns by synthesizing git history and blame.
        </p>
        <div class="form-group">
          <label class="form-label" for="whyPath">File Path</label>
          <input type="text" id="whyPath" class="form-control" value="apps/web/src/module_001.ts" placeholder="e.g. apps/web/src/module_001.ts">
        </div>
        <button class="btn" id="runWhyBtn">Explain Architectural Role</button>

        <div class="result-box" id="whyResult" style="display: none;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
            <strong id="whyFileTitle" style="font-size: 0.9rem; color: var(--accent);"></strong>
            <span id="whyBadge" class="badge badge-cached"></span>
          </div>
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Role</div>
            <p id="whyRole" style="font-size: 0.95rem;"></p>
          </div>
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Architecture & Coupling</div>
            <p id="whyArch" style="font-size: 0.95rem;"></p>
          </div>
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Evolution & Change Patterns</div>
            <p id="whyPatterns" style="font-size: 0.95rem;"></p>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: METRICS & TRACES -->
    <div id="metricsTab" class="tab-content">
      <h2 style="margin-bottom: 1.25rem;">📊 Agent Trace & Performance Metrics</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-title">Cache Hit Rate</div>
          <div class="metric-value" id="metricCacheRate">0%</div>
          <div class="metric-sub" id="metricCacheSub">0 hits / 0 requests</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Bandwidth Saved (Lazy)</div>
          <div class="metric-value" id="metricSavings">81.0%</div>
          <div class="metric-sub">vs full git clone</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Cached Derived Blobs</div>
          <div class="metric-value" id="metricCachedBlobs">0</div>
          <div class="metric-sub" id="metricDegradedCount">0 degraded fallback</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Total Tokens Spent</div>
          <div class="metric-value" id="metricTokens">0</div>
          <div class="metric-sub" id="metricLatency">Avg Latency: 0 ms</div>
        </div>
      </div>

      <div class="form-card" style="max-width: 100%;">
        <h3 style="margin-bottom: 0.75rem;">System & Engine Trace</h3>
        <pre class="code-view" id="systemTrace">Loading system trace information...</pre>
      </div>
    </div>
  </main>

  <script>
    // Theme Management
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('canopy_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    themeToggle.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem('canopy_theme', next);
    });

    // Tab Management
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.getAttribute('data-tab');
        document.getElementById(target + 'Tab').classList.add('active');
        if (target === 'metrics') loadMetrics();
      });
    });

    // Lazy Tree Explorer
    const treeView = document.getElementById('treeView');
    const codeContent = document.getElementById('codeContent');
    const selectedFilePath = document.getElementById('selectedFilePath');
    const fileSize = document.getElementById('fileSize');
    const fileHash = document.getElementById('fileHash');
    const summaryCard = document.getElementById('summaryCard');
    const summaryContent = document.getElementById('summaryContent');
    const summaryPurpose = document.getElementById('summaryPurpose');
    const summarySymbols = document.getElementById('summarySymbols');
    const summaryBadge = document.getElementById('summaryBadge');

    async function loadTree(dir = '', parentContainer = treeView) {
      try {
        const res = await fetch('/api/tree?dir=' + encodeURIComponent(dir));
        const data = await res.json();
        parentContainer.innerHTML = '';

        if (!data.entries || data.entries.length === 0) {
          parentContainer.innerHTML = '<div style="color: var(--text-muted); padding: 0.25rem;">(empty directory)</div>';
          return;
        }

        data.entries.forEach(entry => {
          const item = document.createElement('div');
          item.className = 'tree-item';

          const node = document.createElement('div');
          node.className = 'tree-node';
          const icon = entry.type === 'tree' ? '📁' : '📄';
          node.innerHTML = '<span>' + icon + '</span><span>' + entry.name + '</span>';

          if (entry.type === 'tree') {
            const childContainer = document.createElement('div');
            childContainer.className = 'tree-children';
            childContainer.style.display = 'none';

            let expanded = false;
            node.addEventListener('click', async () => {
              expanded = !expanded;
              if (expanded) {
                node.firstChild.textContent = '📂';
                childContainer.style.display = 'block';
                if (!childContainer.dataset.loaded) {
                  childContainer.innerHTML = '<div style="color: var(--text-muted); padding: 0.2rem;">fetching slice...</div>';
                  await loadTree(entry.path, childContainer);
                  childContainer.dataset.loaded = 'true';
                }
              } else {
                node.firstChild.textContent = '📁';
                childContainer.style.display = 'none';
              }
            });

            item.appendChild(node);
            item.appendChild(childContainer);
          } else {
            node.addEventListener('click', () => loadFile(entry.path));
            item.appendChild(node);
          }

          parentContainer.appendChild(item);
        });
      } catch (err) {
        parentContainer.innerHTML = '<div style="color: var(--danger);">Failed to load tree: ' + err.message + '</div>';
      }
    }

    async function loadFile(filePath) {
      selectedFilePath.textContent = filePath;
      codeContent.textContent = 'Lazily fetching file blob from server...';
      summaryCard.style.display = 'none';

      document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('selected'));

      try {
        const res = await fetch('/api/file?path=' + encodeURIComponent(filePath));
        const data = await res.json();
        codeContent.textContent = data.content;
        fileSize.textContent = (data.size / 1024).toFixed(1) + ' KB';
        fileHash.textContent = 'Blob: ' + data.hash.slice(0, 8);

        // Fetch AI Summary asynchronously
        fetch('/api/derived/summary?path=' + encodeURIComponent(filePath))
          .then(r => r.json())
          .then(summaryData => {
            if (summaryData.data) {
              summaryCard.style.display = 'block';
              summaryContent.textContent = summaryData.data.summary;
              summaryPurpose.textContent = 'Responsibility: ' + summaryData.data.purpose;
              summaryBadge.textContent = summaryData.cached ? 'CACHED' : (summaryData.isDegraded ? 'DEGRADED' : 'GENERATED');
              summaryBadge.className = 'badge ' + (summaryData.cached ? 'badge-cached' : (summaryData.isDegraded ? 'badge-degraded' : 'badge-success'));

              summarySymbols.innerHTML = '';
              if (summaryData.data.key_symbols) {
                summaryData.data.key_symbols.forEach(sym => {
                  const tag = document.createElement('span');
                  tag.className = 'badge';
                  tag.style.background = 'var(--surface-border)';
                  tag.style.color = 'var(--text)';
                  tag.textContent = sym;
                  summarySymbols.appendChild(tag);
                });
              }
            }
          })
          .catch(() => {});
      } catch (err) {
        codeContent.textContent = 'Error loading file: ' + err.message;
      }
    }

    // Digest Panel Handler
    const runDigestBtn = document.getElementById('runDigestBtn');
    const digestSince = document.getElementById('digestSince');
    const digestLang = document.getElementById('digestLang');
    const digestResult = document.getElementById('digestResult');
    const digestStatus = document.getElementById('digestStatus');
    const digestBadge = document.getElementById('digestBadge');
    const digestLine1 = document.getElementById('digestLine1');
    const digestLine2 = document.getElementById('digestLine2');
    const digestRisks = document.getElementById('digestRisks');

    runDigestBtn.addEventListener('click', async () => {
      runDigestBtn.disabled = true;
      runDigestBtn.textContent = 'Generating Digest...';
      digestResult.style.display = 'none';

      try {
        const since = digestSince.value || 'HEAD~5';
        const lang = digestLang.value || 'en';
        const res = await fetch('/api/derived/digest?since=' + encodeURIComponent(since) + '&lang=' + encodeURIComponent(lang));
        const data = await res.json();

        digestResult.style.display = 'block';
        digestStatus.textContent = 'Digest since ' + since + ' (' + (data.latencyMs || 0) + ' ms)';
        digestBadge.textContent = data.cached ? 'CACHE HIT (0 LLM Calls)' : (data.isDegraded ? 'DEGRADED FALLBACK' : 'LIVE AI GENERATED');
        digestBadge.className = 'badge ' + (data.cached ? 'badge-cached' : (data.isDegraded ? 'badge-degraded' : 'badge-success'));

        digestLine1.textContent = data.data.line1;
        digestLine2.textContent = data.data.line2;

        digestRisks.innerHTML = '';
        if (data.data.risk_flags) {
          data.data.risk_flags.forEach(flag => {
            const li = document.createElement('li');
            li.className = 'risk-item';
            li.textContent = flag;
            digestRisks.appendChild(li);
          });
        }
      } catch (err) {
        alert('Digest failed: ' + err.message);
      } finally {
        runDigestBtn.disabled = false;
        runDigestBtn.textContent = 'Run Canopy Digest';
      }
    });

    // Why Panel Handler
    const runWhyBtn = document.getElementById('runWhyBtn');
    const whyPath = document.getElementById('whyPath');
    const whyResult = document.getElementById('whyResult');
    const whyFileTitle = document.getElementById('whyFileTitle');
    const whyBadge = document.getElementById('whyBadge');
    const whyRole = document.getElementById('whyRole');
    const whyArch = document.getElementById('whyArch');
    const whyPatterns = document.getElementById('whyPatterns');

    runWhyBtn.addEventListener('click', async () => {
      runWhyBtn.disabled = true;
      runWhyBtn.textContent = 'Analyzing Context...';
      whyResult.style.display = 'none';

      try {
        const path = whyPath.value.trim();
        const res = await fetch('/api/derived/why?path=' + encodeURIComponent(path));
        const data = await res.json();

        whyResult.style.display = 'block';
        whyFileTitle.textContent = path;
        whyBadge.textContent = data.cached ? 'CACHE HIT' : (data.isDegraded ? 'DEGRADED FALLBACK' : 'ANALYZED');
        whyBadge.className = 'badge ' + (data.cached ? 'badge-cached' : (data.isDegraded ? 'badge-degraded' : 'badge-success'));

        whyRole.textContent = data.data.role;
        whyArch.textContent = data.data.architecture;
        whyPatterns.textContent = data.data.change_patterns;
      } catch (err) {
        alert('Why inspection failed: ' + err.message);
      } finally {
        runWhyBtn.disabled = false;
        runWhyBtn.textContent = 'Explain Architectural Role';
      }
    });

    // Metrics Loader
    async function loadMetrics() {
      try {
        const [statsRes, derivedRes, healthRes] = await Promise.all([
          fetch('/api/stats').then(r => r.json()).catch(() => ({})),
          fetch('/api/derived/stats').then(r => r.json()).catch(() => ({})),
          fetch('/healthz').then(r => r.json()).catch(() => ({})),
        ]);

        const m = derivedRes.metrics || {};
        const db = derivedRes.database || {};

        document.getElementById('metricCacheRate').textContent = (m.cacheHitRate || 0).toFixed(1) + '%';
        document.getElementById('metricCacheSub').textContent = (m.cacheHits || 0) + ' hits / ' + (m.totalRequests || 0) + ' requests';
        document.getElementById('metricCachedBlobs').textContent = (db.totalCachedEntries || 0).toLocaleString();
        document.getElementById('metricDegradedCount').textContent = (db.totalDegradedEntries || 0) + ' degraded fallbacks';

        const totalTokens = (m.totalTokensIn || 0) + (m.totalTokensOut || 0);
        document.getElementById('metricTokens').textContent = totalTokens.toLocaleString();
        document.getElementById('metricLatency').textContent = 'Avg Latency: ' + (m.avgLatencyMs || 0) + ' ms';

        document.getElementById('systemTrace').textContent = JSON.stringify({
          serverStatus: healthRes.status || 'ok',
          uptimeSeconds: healthRes.uptime || 0,
          memoryUsageMb: Math.round((healthRes.memoryUsage?.rss || 0) / 1024 / 1024),
          llmModel: derivedRes.model || 'models/gemma-4-26b-a4b-it',
          promptVersions: derivedRes.promptVersions,
          repoStats: statsRes,
          traceMetrics: m,
          database: db,
        }, null, 2);
      } catch (err) {
        console.error('Failed to load metrics:', err);
      }
    }

    // Initial Load
    loadTree();
  </script>
</body>
</html>`;
}
