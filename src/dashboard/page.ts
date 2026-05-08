export function dashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gana Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    (function () {
      try {
        const saved = localStorage.getItem('gana-dashboard-theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = saved || (prefersDark ? 'dark' : 'light');
      } catch {
        document.documentElement.dataset.theme = 'light';
      }
    })();
  </script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe7;
      --panel: rgba(255, 252, 247, 0.86);
      --panel-soft: #fffdf8;
      --control: rgba(255, 255, 255, 0.88);
      --table-head: rgba(255, 252, 247, 0.6);
      --table-line: rgba(37, 50, 61, 0.10);
      --row-selected: rgba(191, 79, 44, 0.08);
      --row-hover: rgba(244, 231, 216, 0.5);
      --line: rgba(37, 50, 61, 0.12);
      --text: #23323d;
      --muted: #62727f;
      --accent: #bf4f2c;
      --accent-2: #8b3217;
      --good: #1f7a54;
      --warn: #b76b1c;
      --bad: #a73929;
      --chip: rgba(244, 231, 216, 0.6);
      --good-bg: rgba(31, 122, 84, 0.1);
      --warn-bg: rgba(183, 107, 28, 0.1);
      --bad-bg: rgba(167, 57, 41, 0.1);
      --tag-bg: rgba(239, 224, 204, 0.5);
      --tag-text: #23323d;
      --bg-accent: #efe0cc;
      --shadow: 0 18px 50px rgba(35, 50, 61, 0.08);
      --radius: 22px;
      --font-sans: "IBM Plex Sans", "Avenir Next", ui-sans-serif, system-ui, sans-serif;
      --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    html[data-theme="dark"] {
      color-scheme: dark;
      --bg: #1a1612;
      --panel: rgba(42, 36, 28, 0.86);
      --panel-soft: #2a2420;
      --control: rgba(30, 26, 20, 0.88);
      --table-head: rgba(42, 36, 28, 0.6);
      --table-line: rgba(255, 248, 240, 0.08);
      --row-selected: rgba(191, 79, 44, 0.15);
      --row-hover: rgba(244, 231, 216, 0.06);
      --line: rgba(255, 248, 240, 0.1);
      --text: #ede5d8;
      --muted: #a0937f;
      --accent: #e0714e;
      --accent-2: #ff9b70;
      --good: #5cc88a;
      --warn: #e0a040;
      --bad: #e06050;
      --chip: rgba(191, 79, 44, 0.12);
      --good-bg: rgba(31, 122, 84, 0.15);
      --warn-bg: rgba(183, 107, 28, 0.15);
      --bad-bg: rgba(167, 57, 41, 0.15);
      --tag-bg: rgba(239, 224, 204, 0.08);
      --tag-text: #c8bfb0;
      --bg-accent: #2a2218;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
      --radius: 22px;
      --font-sans: "IBM Plex Sans", "Avenir Next", ui-sans-serif, system-ui, sans-serif;
      --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(191, 79, 44, 0.16), transparent 30%),
        radial-gradient(circle at top right, rgba(51, 120, 94, 0.12), transparent 34%),
        linear-gradient(180deg, #f7f1e8 0%, #f1e7d8 100%);
      font-family: var(--font-sans);
      font-size: 14px;
    }
    html[data-theme="dark"] body {
      background:
        radial-gradient(circle at top left, rgba(191, 79, 44, 0.10), transparent 30%),
        radial-gradient(circle at top right, rgba(51, 120, 94, 0.07), transparent 34%),
        linear-gradient(180deg, #1a1612 0%, #14110d 100%);
    }
    button, input, select { font: inherit; }
    .shell {
      width: min(1400px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 24px 0 48px;
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 18px;
    }
    header {
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: calc(var(--radius) + 4px);
      background: linear-gradient(135deg, rgba(255, 253, 248, 0.96), rgba(244, 231, 216, 0.92));
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
    }
    html[data-theme="dark"] header {
      background: linear-gradient(135deg, rgba(42, 36, 28, 0.96), rgba(30, 26, 20, 0.92));
    }
    .eyebrow {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .brand { display: flex; flex-direction: column; min-width: 0; }
    .brand h1 { margin: 0; font-size: clamp(2rem, 5vw, 3.2rem); line-height: 0.95; }
    .lede {
      margin: 12px 0 0;
      max-width: 520px;
      font-size: 1rem;
      color: var(--muted);
    }
    .hero-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: flex-end;
      flex-shrink: 0;
    }
    .connection-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.72);
      font-size: 0.82rem;
      font-weight: 600;
    }
    html[data-theme="dark"] .connection-pill {
      background: rgba(42, 36, 28, 0.72);
    }
    .connection-pill::before {
      content: '';
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .connection-pill.ok { color: var(--good); }
    .connection-pill.warn { color: var(--warn); }
    .connection-pill.error { color: var(--bad); }
    .filters-surface {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .filters-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
    }
    .filters-panel-head h2 { margin: 0; font-size: 15px; font-weight: 700; }
    .filter-actions { display: flex; align-items: center; gap: 12px; }
    .filters-body { padding: 14px 18px; }
    label { color: var(--muted); display: grid; gap: 4px; font-size: 12px; }
    input, select {
      height: 34px;
      border: 1px solid var(--line);
      background: var(--control);
      color: var(--text);
      border-radius: 12px;
      padding: 0 9px;
      min-width: 132px;
    }
    .btn {
      height: 34px;
      border: 1px solid var(--line);
      background: var(--control);
      color: var(--text);
      border-radius: 999px;
      padding: 0 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { border-color: var(--accent); }
    .icon-btn {
      height: 34px;
      border: 1px solid var(--line);
      background: var(--control);
      color: var(--text);
      border-radius: 999px;
      padding: 0 14px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab {
      height: 34px;
      border: 1px solid var(--line);
      background: var(--control);
      color: var(--text);
      border-radius: 999px;
      padding: 0 14px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .icon-btn:hover, .tab:hover { border-color: var(--accent); }
    .icon-btn.primary {
      background: var(--accent);
      color: #fff8f3;
      border-color: var(--accent);
      box-shadow: 0 12px 26px rgba(191, 79, 44, 0.24);
    }
    .icon-btn.primary:hover { background: var(--accent-2); border-color: var(--accent-2); }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(130px, 1fr));
      gap: 8px;
      align-items: end;
    }
    .filters-grid .filter-multi {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;
    }
    .filters-grid .filter-multi select,
    .filters-grid .filter-number input { min-width: 100%; width: 100%; }
    .filters-grid .filter-number { display: flex; flex-direction: column; gap: 4px; }
    .filters-grid .filter-number .range {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    .main { padding: 0; display: grid; gap: 16px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
    .stat {
      background: var(--panel-soft);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      min-height: 82px;
      cursor: pointer;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .stat:hover {
      border-color: rgba(191, 79, 44, 0.45);
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(191, 79, 44, 0.12);
    }
    .stat .muted {
      display: block;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .stat b { display: block; font-size: 1.9rem; line-height: 1.1; margin-top: 4px; }
    .muted { color: var(--muted); }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .tab.active {
      background: var(--accent);
      color: #fff8f3;
      border-color: var(--accent);
      box-shadow: 0 6px 16px rgba(191, 79, 44, 0.18);
    }
    .content { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 14px; align-items: start; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      min-width: 0;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .panel-head {
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .panel-head h2 { margin: 0; font-size: 16px; font-weight: 700; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 940px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--table-line); vertical-align: top; }
    th {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: var(--table-head);
      position: relative;
    }
    th button { all: unset; cursor: pointer; display: inline-flex; width: 100%; align-items: center; gap: 6px; }
    th button:hover { color: var(--accent); }
    tbody tr { cursor: pointer; }
    tbody tr.selected { background: var(--row-selected); }
    tbody tr:hover { background: var(--row-hover); }
    .match { font-weight: 700; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .badge {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      min-height: 24px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--chip);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
    }
    .badge.good { color: var(--good); background: var(--good-bg); }
    .badge.warn { color: var(--warn); background: var(--warn-bg); }
    .badge.bad { color: var(--bad); background: var(--bad-bg); }
    .pager {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border-top: 1px solid var(--table-line);
      gap: 10px;
    }
    .pager-group { display: inline-flex; gap: 8px; }
    .detail { padding: 18px; display: grid; gap: 14px; max-height: 80vh; overflow: auto; }
    .detail h3 { margin: 0; font-size: 18px; line-height: 1.25; }
    .detail h4 {
      margin: 0 0 8px;
      font-size: 0.78rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .kv { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px; }
    .kv span:first-child { color: var(--muted); }
    .mono { font-family: var(--font-mono); font-size: 12px; overflow-wrap: anywhere; }
    .empty, .loading, .error { padding: 28px; color: var(--muted); text-align: center; }
    .error { color: var(--bad); }
    .section-title { display: flex; align-items: center; gap: 8px; }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 999px; background: var(--tag-bg); color: var(--tag-text); font-size: 11px; margin-right: 6px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip-btn { cursor: pointer; border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 11px; background: var(--control); color: var(--text); transition: all 0.15s ease; }
    .chip-btn:hover { border-color: var(--accent); }
    .muted-inline { color: var(--muted); font-size: 12px; }
    .crosslink {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-color: rgba(191, 79, 44, 0.3);
      text-underline-offset: 2px;
      cursor: pointer;
      transition: text-decoration-color 0.15s;
    }
    .crosslink:hover { text-decoration-color: var(--accent); }
    .scoreline { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; }
    .scoreline span { min-width: 22px; text-align: center; padding: 2px 6px; border-radius: 8px; background: var(--chip); }
    .insight-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .insight { border: 1px solid var(--table-line); border-radius: 14px; padding: 10px; min-width: 0; background: var(--panel-soft); }
    .insight span { display: block; color: var(--muted); font-size: 11px; margin-bottom: 4px; }
    .insight b { display: block; font-size: 1.3rem; overflow-wrap: anywhere; }
    .detail-card { border: 1px solid var(--table-line); border-radius: 16px; padding: 14px; background: var(--control); display: grid; gap: 8px; }
    .detail-list { display: grid; gap: 8px; }
    .detail-line { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--table-line); border-radius: 14px; background: var(--panel-soft); }
    .rationale { white-space: pre-wrap; line-height: 1.45; }
    @media (max-width: 980px) {
      header { align-items: stretch; flex-direction: column; }
      .hero-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .content { grid-template-columns: 1fr; }
      aside { position: static; }
      .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) {
      .shell { padding: 12px 0 32px; }
      .main { gap: 12px; }
      .stats { grid-template-columns: 1fr; }
      .filters-grid { grid-template-columns: 1fr; }
      input, select { width: 100%; min-width: 0; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand">
        <p class="eyebrow">Harness de Predicciones</p>
        <h1>Gana Dashboard</h1>
        <p class="lede">Partidos, predicciones, parlays, validaciones y runs en un solo lugar.</p>
      </div>
      <div class="hero-actions">
        <span class="connection-pill" id="connection-status">Conectando...</span>
        <span id="updated" class="muted">Cargando</span>
        <button class="icon-btn" id="theme-toggle" title="Cambiar modo oscuro" type="button">Oscuro</button>
      </div>
    </header>
    <main class="main">
      <form class="filters-surface" id="filters">
        <div class="filters-panel-head">
          <h2>Filtros</h2>
          <div class="filter-actions">
            <button class="icon-btn primary" title="Actualizar" type="submit">Actualizar</button>
          </div>
        </div>
        <div class="filters-body">
          <div class="filters-grid">
            <label>Fecha desde <input type="date" name="dateFrom"></label>
            <label>Fecha hasta <input type="date" name="dateTo"></label>
            <label>Run ID <input name="runId" placeholder="run id"></label>
            <label class="validation-target-filter">Tipo
              <select name="validationTarget">
                <option value="all">Todas</option>
                <option value="prediction">Atómicas</option>
                <option value="parlay">Parlays</option>
              </select>
            </label>
            <label class="filter-multi">Status
              <select name="status" multiple size="2"></select>
            </label>
            <label>Mercado <select name="market"><option value="">Todos</option></select></label>
            <label>Equipo <select name="team"><option value="">Todos</option></select></label>
            <label>Competencia <select name="competition"><option value="">Todas</option></select></label>
            <label class="filter-multi">Calidad
              <select name="quality" multiple size="2"></select>
            </label>
            <label class="filter-number">Confianza
              <div class="range">
                <input name="minConfidence" placeholder="min">
                <input name="maxConfidence" placeholder="max">
              </div>
            </label>
            <label class="filter-number">Edge
              <div class="range">
                <input name="minEdge" placeholder="min">
                <input name="maxEdge" placeholder="max">
              </div>
            </label>
            <label>Límite
              <select name="take">
                <option>25</option>
                <option>50</option>
                <option>100</option>
                <option>200</option>
              </select>
            </label>
            <label>Orden
              <select name="sort"></select>
            </label>
            <label>Dir.
              <select name="direction">
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </label>
          </div>
        </div>
      </form>
      <section class="stats" id="stats"></section>
      <nav class="tabs" id="tabs">
        <button class="tab active" data-tab="fixtures">Partidos</button>
        <button class="tab" data-tab="predictions">Predicciones</button>
        <button class="tab" data-tab="parlays">Parlays</button>
        <button class="tab" data-tab="validations">Validaciones</button>
        <button class="tab" data-tab="runs">Runs</button>
      </nav>
      <section class="content">
        <div class="panel">
          <div class="panel-head">
            <h2 id="section-title">Partidos</h2>
            <span class="muted" id="section-count"></span>
          </div>
          <div id="list" class="empty">Cargando…</div>
          <div class="pager">
            <div class="pager-group">
              <button class="icon-btn" id="page-prev">Anterior</button>
              <button class="icon-btn" id="page-next">Siguiente</button>
            </div>
            <span class="muted-inline" id="pager-meta">Página 1</span>
          </div>
        </div>
        <aside class="panel">
          <div class="panel-head"><h2>Detalle</h2></div>
          <div class="detail" id="detail"><span class="muted">Selecciona una fila para revisar el detalle.</span></div>
        </aside>
      </section>
    </main>
  </div>

  <script>
    (function () {
      const TAB_LABELS = {
        fixtures: 'Partidos',
        predictions: 'Predicciones',
        parlays: 'Parlays',
        validations: 'Validaciones',
        runs: 'Runs',
      };
      const KIND_TO_TAB = {
        fixture: 'fixtures',
        prediction: 'predictions',
        parlay: 'parlays',
        validation: 'validations',
        run: 'runs',
      };
      const TAB_SORT_HEADERS = {
        fixtures: [
          ['partido', 'scheduledAt'],
          ['estado', 'status'],
          ['predicción', 'updatedAt'],
          ['resultado', 'updatedAt'],
          ['actividad', 'createdAt'],
        ],
        predictions: [
          ['partido', 'marketKey'],
          ['pick', 'selectionKey'],
          ['odds', 'odds'],
          ['implied', 'impliedProbability'],
          ['edge', 'edge'],
          ['confianza', 'confidence'],
          ['estado', 'status'],
          ['generado', 'generatedAt'],
        ],
        parlays: [
          ['Generado', 'generatedAt'],
          ['Odds', 'combinedOdds'],
          ['Confianza', 'aggregateConfidence'],
          ['Calidad', 'aggregateQuality'],
          ['Estado', 'status'],
        ],
        validations: [
          ['Evaluado', 'evaluatedAt'],
          ['Estado', 'status'],
          ['Creado', 'createdAt'],
        ],
        runs: [
          ['Creado', 'createdAt'],
          ['Estado', 'status'],
          ['Veredicto', 'verdict'],
          ['Inicio', 'startedAt'],
          ['Fin', 'completedAt'],
        ],
      };
      const ALLOWED_TABS = ['fixtures', 'predictions', 'parlays', 'validations', 'runs'];
      const DEFAULT_SORT_BY = {
        fixtures: 'scheduledAt',
        predictions: 'generatedAt',
        parlays: 'generatedAt',
        validations: 'evaluatedAt',
        runs: 'createdAt',
      };
      const state = {
        tab: 'fixtures',
        take: 50,
        page: 1,
        sort: '',
        direction: 'desc',
        loading: false,
        filters: {
          validationTarget: 'all',
          dateFrom: '',
          dateTo: '',
          runId: '',
          status: [],
          market: '',
          team: '',
          competition: '',
          quality: [],
          minConfidence: '',
          maxConfidence: '',
          minEdge: '',
          maxEdge: '',
        },
        data: null,
        selectedKind: null,
        selectedId: null,
        metadata: null,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      };

      const $ = (selector) => document.querySelector(selector);
      const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '\"': '&quot;',
        '\'': '&#39;',
      }[char]));
      const fmtPct = (value, digits = 1) => value == null ? '—' : (Number(value) * 100).toFixed(digits) + '%';
      const fmtNum = (value, digits = 3) => value == null ? '—' : Number(value).toFixed(digits);
      const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
      const fmtScore = (fixture) => {
        if (!fixture || fixture.scoreHome == null || fixture.scoreAway == null) return '—';
        return '<span class="scoreline"><span>' + esc(fixture.scoreHome) + '</span><b>-</b><span>' + esc(fixture.scoreAway) + '</span></span>';
      };
      const matchName = (fixture) => {
        if (!fixture) return 'Sin fixture';
        const home = fixture.homeTeam?.name ?? 'Local';
        const away = fixture.awayTeam?.name ?? 'Visita';
        return home + ' vs ' + away;
      };
      const marketLabel = (row) => {
        if (!row) return '—';
        const line = row.line == null ? '' : ' ' + row.line;
        return String(row.marketKey || 'mercado') + ' · ' + String(row.selectionKey || 'pick') + line;
      };
      const fixtureMeta = (fixture) => {
        if (!fixture) return '—';
        const parts = [
          fixture.competition?.name || '',
          fixture.competition?.country || '',
          fixture.scheduledAt ? fmtDate(fixture.scheduledAt) : '',
          fixture.providerFixtureId ? 'provider ' + fixture.providerFixtureId : '',
        ].filter(Boolean);
        return parts.join(' · ') || '—';
      };
      const hasText = (value) => String(value ?? '').trim().length > 0;

      function sanitizeText(value) {
        return hasText(value) ? String(value).trim() : '';
      }

      function applyTheme(theme) {
        state.theme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = state.theme;
        const toggle = $('#theme-toggle');
        if (toggle) {
          toggle.textContent = state.theme === 'dark' ? 'Claro' : 'Oscuro';
          toggle.title = state.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
        }
        try {
          localStorage.setItem('gana-dashboard-theme', state.theme);
        } catch {}
      }

      function setConnectionStatus(text, tone) {
        const pill = $('#connection-status');
        if (!pill) return;
        pill.textContent = text;
        pill.className = 'connection-pill' + (tone ? ' ' + tone : '');
      }

      const badgeClass = (status) => {
        const normalized = String(status ?? '').toLowerCase();
        if (['promotable', 'succeeded', 'won'].includes(normalized)) return 'good';
        if (['blocked', 'failed', 'lost', 'error'].includes(normalized)) return 'bad';
        if (['review-required', 'pending', 'running'].includes(normalized)) return 'warn';
        return '';
      };
      const badge = (value) => '<span class="badge ' + badgeClass(value) + '">' + esc(value ?? 'none') + '</span>';
      const normalizeValidationTarget = (value) => {
        if (value === 'prediction' || value === 'parlay') return value;
        return 'all';
      };

      const validationTargetForRow = (row) => {
        if (row?.target) {
          const target = row.target;
          if (target.kind === 'prediction' || target.kind === 'parlay') {
            return {
              kind: target.kind,
              label: target.label || (target.kind === 'prediction' ? 'Atómica' : 'Parlay'),
              id: target.id || '',
              summary: target.summary || null,
            };
          }
          return {
            kind: '',
            label: target.label || 'Sin objetivo',
            id: target.id || '',
            summary: target.summary || null,
          };
        }
        if (row?.parlayId) return { kind: 'parlay', label: 'Parlay', id: row.parlayId };
        if (row?.predictionId) return { kind: 'prediction', label: 'Atómica', id: row.predictionId };
        return { kind: '', label: 'Sin objetivo', id: '', summary: null };
      };

      function toParams() {
        const params = new URLSearchParams();
        params.set('tab', state.tab);
        params.set('page', String(state.page));
        params.set('take', String(state.take));
        params.set('sort', state.sort);
        params.set('direction', state.direction);
        if (state.filters.validationTarget && state.filters.validationTarget !== 'all') {
          params.set('validationTarget', state.filters.validationTarget);
        }
        if (state.filters.dateFrom) params.set('dateFrom', state.filters.dateFrom);
        if (state.filters.dateTo) params.set('dateTo', state.filters.dateTo);
        if (state.filters.runId) params.set('runId', state.filters.runId);
        if (state.filters.market) params.set('market', state.filters.market);
        if (state.filters.team) params.set('team', state.filters.team);
        if (state.filters.competition) params.set('competition', state.filters.competition);
        if (state.filters.status.length) params.set('status', state.filters.status.join(','));
        if (state.filters.quality.length) params.set('quality', state.filters.quality.join(','));
        if (state.filters.minConfidence !== '') params.set('minConfidence', state.filters.minConfidence);
        if (state.filters.maxConfidence !== '') params.set('maxConfidence', state.filters.maxConfidence);
        if (state.filters.minEdge !== '') params.set('minEdge', state.filters.minEdge);
        if (state.filters.maxEdge !== '') params.set('maxEdge', state.filters.maxEdge);
        if (state.selectedKind && state.selectedId) {
          params.set('focus', state.selectedKind + ':' + encodeURIComponent(state.selectedId));
        }
        return params;
      }

      function syncUrl() {
        const params = toParams();
        const path = window.location.pathname + '?' + params.toString();
        history.replaceState(null, '', path);
      }

      function readSelectValues(name) {
        const select = document.querySelector('[name=' + JSON.stringify(name) + ']');
        if (!select || !(select instanceof HTMLSelectElement)) return [];
        return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
      }

      function readText(name) {
        const input = document.querySelector('[name=' + JSON.stringify(name) + ']');
        return input && 'value' in input ? input.value.trim() : '';
      }

      function normalizeTab(value) {
        return ALLOWED_TABS.includes(value) ? value : state.tab;
      }

      function syncStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab) state.tab = normalizeTab(tab);

        const page = Number(params.get('page') || '1');
        state.page = Number.isNaN(page) ? 1 : Math.max(1, page);
        state.take = Number(params.get('take') || '50');
        if (Number.isNaN(state.take) || state.take < 1) state.take = 50;

        state.sort = params.get('sort') || '';
        state.direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
        const availableSorts = state.metadata?.sortOptions?.[state.tab];
        if (availableSorts && availableSorts.length && !availableSorts.includes(state.sort)) {
          state.sort = availableSorts[0] || '';
        }

        state.filters.dateFrom = params.get('dateFrom') || '';
        state.filters.dateTo = params.get('dateTo') || '';
        state.filters.validationTarget = normalizeValidationTarget(params.get('validationTarget'));
        state.filters.runId = sanitizeText(params.get('runId'));
        state.filters.market = sanitizeText(params.get('market'));
        state.filters.team = sanitizeText(params.get('team'));
        state.filters.competition = sanitizeText(params.get('competition'));
        state.filters.status = params.get('status') ? params.get('status').split(',').filter(Boolean) : [];
        state.filters.quality = params.get('quality') ? params.get('quality').split(',').filter(Boolean) : [];
        state.filters.minConfidence = params.get('minConfidence') || '';
        state.filters.maxConfidence = params.get('maxConfidence') || '';
        state.filters.minEdge = params.get('minEdge') || '';
        state.filters.maxEdge = params.get('maxEdge') || '';

        const focus = params.get('focus');
        if (focus && focus.includes(':')) {
          const [kind, id] = focus.split(':', 2);
          const mappedTab = KIND_TO_TAB[kind];
          if (mappedTab) {
            state.selectedKind = kind;
            state.selectedId = decodeURIComponent(id);
            state.tab = KIND_TO_TAB[kind];
          } else {
            state.selectedKind = null;
            state.selectedId = null;
          }
        } else {
          state.selectedKind = null;
          state.selectedId = null;
        }
      }

      function writeForm() {
        const statusInput = $('[name="status"]');
        if (statusInput instanceof HTMLSelectElement) {
          [...statusInput.options].forEach((option) => {
            option.selected = state.filters.status.includes(option.value);
          });
        }
        const qualityInput = $('[name="quality"]');
        if (qualityInput instanceof HTMLSelectElement) {
          [...qualityInput.options].forEach((option) => {
            option.selected = state.filters.quality.includes(option.value);
          });
        }
        $('[name="dateFrom"]').value = state.filters.dateFrom;
        $('[name="dateTo"]').value = state.filters.dateTo;
        $('[name="runId"]').value = state.filters.runId;
        $('[name="market"]').value = state.filters.market;
        $('[name="team"]').value = state.filters.team;
        $('[name="competition"]').value = state.filters.competition;
        $('[name="minConfidence"]').value = state.filters.minConfidence;
        $('[name="maxConfidence"]').value = state.filters.maxConfidence;
        $('[name="minEdge"]').value = state.filters.minEdge;
        $('[name="maxEdge"]').value = state.filters.maxEdge;
        $('[name="validationTarget"]').value = state.filters.validationTarget || 'all';
        $('[name="take"]').value = String(state.take);
        $('[name="sort"]').value = state.sort;
        $('[name="direction"]').value = state.direction;
      }

      function hydrateMetadataOptions(metadata) {
        state.metadata = metadata;
        if (Array.isArray(metadata.statuses?.[state.tab])) {
          state.filters.status = state.filters.status.filter((status) => metadata.statuses[state.tab].includes(status));
        }
        if (Array.isArray(metadata.qualities)) {
          state.filters.quality = state.filters.quality.filter((quality) => metadata.qualities.includes(quality));
        }
        if (Array.isArray(metadata.validationTargets)) {
          const allowedTargets = metadata.validationTargets.filter(Boolean);
          if (!allowedTargets.includes(state.filters.validationTarget)) {
            state.filters.validationTarget = 'all';
          }
        }
        const statusInput = $('[name="status"]');
        if (statusInput instanceof HTMLSelectElement) {
          const options = metadata.statuses[state.tab] ?? [];
          statusInput.innerHTML = '<option value="">Todos</option>' + options.map((item) => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('');
        }
        const validationTargetInput = $('[name="validationTarget"]');
        if (validationTargetInput instanceof HTMLSelectElement) {
          const options = metadata.validationTargets || ['all', 'prediction', 'parlay'];
          validationTargetInput.innerHTML = options.map((option) => {
            const label = option === 'all' ? 'Todas' : option === 'prediction' ? 'Atómicas' : 'Parlays';
            return '<option value="' + esc(option) + '">' + esc(label) + '</option>';
          }).join('');
          if (!options.includes(state.filters.validationTarget)) state.filters.validationTarget = 'all';
        }
        const marketInput = $('[name="market"]');
        if (marketInput instanceof HTMLSelectElement) {
          marketInput.innerHTML = '<option value="">Todos</option>' + metadata.markets.map((item) => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('');
        }
        const qualityInput = $('[name="quality"]');
        if (qualityInput instanceof HTMLSelectElement) {
          const unique = [...new Set((metadata.qualities || ['low', 'medium', 'high']).filter(Boolean))];
          qualityInput.innerHTML = '<option value="">Todos</option>' + unique.map((item) => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('');
        }
        const teamInput = $('[name="team"]');
        if (teamInput instanceof HTMLSelectElement) {
          const teamOptions = (metadata.teams || []).map((team) => '<option value="' + esc(team.id) + '">' + esc(team.name) + '</option>').join('');
          teamInput.innerHTML = '<option value="">Todos</option>' + teamOptions;
        }
        const competitionInput = $('[name="competition"]');
        if (competitionInput instanceof HTMLSelectElement) {
          const competitionOptions = (metadata.competitions || []).map((competition) => '<option value="' + esc(competition.id) + '">' + esc(competition.name) + '</option>').join('');
          competitionInput.innerHTML = '<option value="">Todas</option>' + competitionOptions;
        }
        const sortInput = $('[name="sort"]');
        if (sortInput instanceof HTMLSelectElement) {
          const options = metadata.sortOptions[state.tab] ?? [];
          sortInput.innerHTML = options.map((item) => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('');
          if (!options.includes(state.sort)) state.sort = options[0] || DEFAULT_SORT_BY[state.tab];
        }
      }

      async function loadMetadata() {
        const response = await fetch('/api/metadata');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'No fue posible cargar metadata.');
        hydrateMetadataOptions(payload);
      }

      async function load() {
        if (state.loading) return;
        state.loading = true;
        setConnectionStatus('Actualizando\u2026', 'warn');
        $('#list').innerHTML = '<div class="loading">Cargando\u2026</div>';
        $('#detail').innerHTML = '<span class="muted">Cargando\u2026</span>';
        $('#updated').textContent = 'Actualizando\u2026';
        syncUrl();
        const pagerPrev = $('#page-prev');
        const pagerNext = $('#page-next');
        pagerPrev.disabled = true;
        pagerNext.disabled = true;

        try {
          const params = toParams();
          params.delete('focus');

          const response = await fetch('/api/overview?' + params.toString());
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || 'Error al cargar el resumen.');
          state.page = Number(body.page) || state.page;
          state.sort = body.sort || state.sort;
          state.direction = body.direction || state.direction;
          if (body?.activeTab && ALLOWED_TABS.includes(body.activeTab) && body.activeTab !== state.tab) {
            state.tab = body.activeTab;
            renderFiltersByTab();
          }
          state.data = body;
          render();
          setConnectionStatus('Conectado', 'ok');
        } catch (err) {
          setConnectionStatus('Error de conexi\u00f3n', 'error');
          $('#list').innerHTML = '<div class="error">' + esc(err.message) + '</div>';
          $('#detail').innerHTML = '<span class="error">No se pudo cargar la vista principal.</span>';
        } finally {
          state.loading = false;
          const params = new URLSearchParams(window.location.search);
          const current = state.data?.pagination?.page || Number(params.get('page') || 1);
          const totalPages = state.data?.pagination?.totalPages || 1;
          const normalizedPage = Math.max(1, Number(current));
          $('#page-prev').disabled = normalizedPage <= 1;
          $('#page-next').disabled = normalizedPage >= totalPages;
        }
      }

      function renderTabs() {
        document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === state.tab));
        $('#section-title').textContent = TAB_LABELS[state.tab] || 'Resumen';
        $('#section-count').textContent = '';
      }

      function render() {
        const updated = state.data ? new Date(state.data.generatedAt).toLocaleString() : '—';
        $('#updated').textContent = 'Actualizado ' + updated;
        renderTabs();
        renderStats();
        renderFiltersByTab();
        renderList();
        renderPager();
        if (state.selectedKind && state.selectedId) {
          loadEntity(state.selectedKind, state.selectedId).catch(() => {
            $('#detail').innerHTML = '<span class="muted">No se pudo cargar el detalle.</span>';
          });
        } else {
          $('#detail').innerHTML = '<span class="muted">Selecciona una fila para revisar el detalle.</span>';
        }
        syncUrl();
      }

      function renderStats() {
        if (!state.data) return;
        const facets = state.data.statusFacets ? Object.entries(state.data.statusFacets) : [];
        const totalByStatus = facets.map(([status, count]) => ({ status, count: Number(count) }));
        const cards = [];
        if (totalByStatus.length > 0) {
          cards.push(...totalByStatus.slice(0, 4).map(({ status, count }) => {
            return '<article class="stat" data-metric-kind="status" data-metric-value="' + esc(status) + '">' +
              '<span class="muted">' + esc(status) + '</span><b>' + count + '</b></article>';
          }));
        } else {
          cards.push('<article class="stat" data-metric-kind="tab" data-metric-value="fixtures"><span class="muted">Partidos</span><b>' + state.data.counts.fixtures + '</b></article>');
          cards.push('<article class="stat" data-metric-kind="tab" data-metric-value="predictions"><span class="muted">Predicciones</span><b>' + state.data.counts.predictions + '</b></article>');
          cards.push('<article class="stat" data-metric-kind="tab" data-metric-value="parlays"><span class="muted">Parlays</span><b>' + state.data.counts.parlays + '</b></article>');
          cards.push('<article class="stat" data-metric-kind="tab" data-metric-value="validations"><span class="muted">Validaciones</span><b>' + state.data.counts.validations + '</b></article>');
          cards.push('<article class="stat" data-metric-kind="tab" data-metric-value="runs"><span class="muted">Runs</span><b>' + state.data.counts.runs + '</b></article>');
        }
        $('#stats').innerHTML = cards.join('');
      }

      function renderFiltersByTab() {
        if (!state.metadata) return;
        const targetFilter = document.querySelector('.validation-target-filter');
        if (targetFilter) {
          targetFilter.style.display = state.tab === 'validations' ? 'grid' : 'none';
        }
        const statusInput = $('[name="status"]');
        if (!(statusInput instanceof HTMLSelectElement)) return;
        const options = state.metadata.statuses[state.tab] || [];
        statusInput.innerHTML = '<option value=\"\">Todos</option>' + options.map((value) => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
        writeForm();
      }

      function renderList() {
        if (!state.data) {
          $('#list').innerHTML = '<div class="empty">Sin datos para mostrar</div>';
          return;
        }

        const rows = rowsForActiveTab();
        const total = state.data.pagination?.total || 0;
        $('#section-count').textContent = rows.length + ' visibles de ' + total;
        if (!rows.length) {
          $('#list').innerHTML = '<div class="empty">No hay datos para los filtros actuales.</div>';
          return;
        }
        if (state.tab === 'fixtures') return renderFixtureRows(rows);
        if (state.tab === 'predictions') return renderPredictionRows(rows);
        if (state.tab === 'parlays') return renderParlayRows(rows);
        if (state.tab === 'validations') return renderValidationRows(rows);
        if (state.tab === 'runs') return renderRunRows(rows);
      }

      function renderPager() {
        if (!state.data) return;
        const pagination = state.data.pagination || {};
        const totalPages = Number(pagination.totalPages || 1);
        const current = Number(pagination.page || 1);
        const count = Number(pagination.total || 0);
        $('#pager-meta').textContent = 'Página ' + current + ' / ' + Math.max(1, totalPages) + ' · total ' + count;
        $('#page-prev').disabled = current <= 1;
        $('#page-next').disabled = current >= totalPages;
      }

      function rowsForActiveTab() {
        if (!state.data) return [];
        if (state.tab === 'fixtures') return state.data.fixtures || [];
        if (state.tab === 'predictions') return state.data.predictions || [];
        if (state.tab === 'parlays') return state.data.parlays || [];
        if (state.tab === 'validations') return state.data.validations || [];
        return state.data.runs || [];
      }

      function renderFixtureRows(rows) {
        const sort = state.sort;
        const headers = TAB_SORT_HEADERS.fixtures;
        $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr>' +
          headers.map(([label, field]) => '<th><button class="sort" data-sort="' + esc(field) + '"><span>' + esc(label) + '</span><span>' +
            (sort === field ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>').join('') +
          '</tr></thead><tbody>' +
          rows.map((row) => {
            const latest = row.latestPrediction;
            const validation = row.latestValidation;
            const activity = [
              (row.predictionCount ?? 0) + ' pred.',
              (row.parlayLegCount ?? 0) + ' legs',
              (row.validationCount ?? 0) + ' val.',
            ].join(' · ');
            return '<tr data-kind="fixture" data-id="' + esc(row.id) + '"><td><div class="match">' + esc(matchName(row)) +
              '</div><div class="sub">' + esc(fixtureMeta(row)) + '</div></td><td>' + badge(row.status) +
              '</td><td>' + (latest ? '<b>' + esc(marketLabel(latest)) + '</b><div class="sub">odds ' + fmtNum(latest.odds) + ' · edge ' + fmtPct(latest.edge, 1) + ' · conf. ' + fmtPct(latest.confidence, 1) + '</div>' : '<span class="muted-inline">Sin predicción</span>') +
              '</td><td>' + fmtScore(row) + '<div class="sub">' + (validation ? badge(validation.status) + ' ' + esc(validation.reason || '') : 'Sin validación') + '</div>' +
              '</td><td><div>' + esc(activity) + '</div><div class="sub mono">' + esc(row.id) + '</div></td></tr>';
          }).join('') +
          '</tbody></table></div>';
      }

      function renderPredictionRows(rows) {
        const sort = state.sort;
        const headers = TAB_SORT_HEADERS.predictions;
        $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr>' +
          headers.map(([label, field]) => '<th><button class="sort" data-sort="' + esc(field) + '"><span>' + esc(label) + '</span><span>' +
            (sort === field ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>').join('') +
          '</tr></thead><tbody>' +
          rows.map((row) => '<tr data-kind="prediction" data-id="' + esc(row.id) + '"><td><div class="match">' + esc(matchName(row.fixture)) +
            '</div><div class="sub">' + esc(row.fixture?.competition?.name || '') + ' · ' + esc(row.fixture ? fmtDate(row.fixture.scheduledAt) : '') +
            '</div><div class="sub">' + fmtScore(row.fixture) + ' ' + (row.latestValidation ? badge(row.latestValidation.status) : '') +
            '</div></td><td><b>' + esc(row.marketKey) + '</b><div class="sub">' + esc(row.selectionKey) + (row.line ? ' ' + esc(row.line) : '') +
            '</div></td><td>' + fmtNum(row.odds) + '</td><td>' + fmtPct(row.impliedProbability, 1) + '</td><td>' + fmtPct(row.edge, 1) + '</td><td>' +
            fmtPct(row.confidence, 1) + '</td><td>' + badge(row.status) + '</td><td>' + fmtDate(row.generatedAt) +
            '</td></tr>').join('') +
          '</tbody></table></div>';
      }

      function renderParlayRows(rows) {
        const headers = TAB_SORT_HEADERS.parlays;
        const sort = state.sort;
        $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr>' +
          headers.map(([label, field]) => '<th><button class="sort" data-sort="' + esc(field) + '"><span>' + esc(label) + '</span><span>' +
            (sort === field ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>').join('') +
          '<th>Legs</th>' +
          '</tr></thead><tbody>' +
          rows.map((row) => '<tr data-kind="parlay" data-id="' + esc(row.id) + '"><td><div class="mono">' + esc(row.id) + '</div><div class="sub">' +
            fmtDate(row.generatedAt) + '</div><div class="sub">' + (row.latestValidation ? badge(row.latestValidation.status) : 'Sin validación') + '</div></td><td>' + fmtNum(row.combinedOdds) + '</td><td>' + fmtPct(row.aggregateConfidence, 1) + '</td><td>' +
            fmtPct(row.aggregateQuality, 1) + '</td><td>' + badge(row.status) + '</td><td><div class="chips">' +
            row.legs.slice(0, 2).map((leg) => '<button class="chip-btn crosslink" data-kind="prediction" data-id="' + esc(leg.predictionId) + '">' + esc(matchName(leg.fixture)) + '</button>').join('') +
            (row.legs.length > 2 ? '<span class="muted-inline">+' + (row.legs.length - 2) + '</span>' : '') +
            '</div></td></tr>').join('') +
          '</tbody></table>';
      }

      function renderValidationRows(rows) {
        const sort = state.sort;
        $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr>' +
          '<th><button class="sort" data-sort="evaluatedAt"><span>Evaluado</span><span>' +
          (sort === 'evaluatedAt' ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>' +
          '<th><button class="sort" data-sort="status"><span>Estado</span><span>' +
          (sort === 'status' ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>' +
          '<th>Motivo</th>' +
          '<th>Tipo</th>' +
          '<th>Objetivo</th>' +
          '<th><button class="sort" data-sort="createdAt"><span>Creado</span><span>' +
          (sort === 'createdAt' ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>' +
          '</tr></thead><tbody>' +
          rows.map((row) => {
            const target = validationTargetForRow(row);
            const hasTarget = target.kind;
            const summary = target.summary || target.id || '—';
            return '<tr data-kind="validation" data-id="' + esc(row.id) + '"><td>' + fmtDate(row.evaluatedAt || row.createdAt) +
              '</td><td>' + badge(row.status) + '</td><td>' + esc(row.reason || '—') + '</td><td><span class="tag">' + esc(target.label) +
              '</span></td><td><div>' + esc(summary) + '</div>' +
              (hasTarget && target.id ? '<div class="sub mono"><span class="crosslink" data-kind="' + esc(target.kind) + '" data-id="' + esc(target.id) + '">' + esc(target.id) +
                '</span></div>' : '') + '</td><td>' + fmtDate(row.createdAt) + '</td></tr>';
          }).join('') +
          '</tbody></table>';
      }

      function renderRunRows(rows) {
        const headers = TAB_SORT_HEADERS.runs;
        const sort = state.sort;
        $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr>' +
          headers.map(([label, field]) => '<th><button class="sort" data-sort="' + esc(field) + '"><span>' + esc(label) + '</span><span>' +
            (sort === field ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>').join('') +
          '<th>Proveedor</th><th>Actividad</th>' +
          '</tr></thead><tbody>' +
          rows.map((row) => '<tr data-kind="run" data-id="' + esc(row.id) + '"><td>' + fmtDate(row.createdAt) +
            '</td><td>' + badge(row.status) + '</td><td>' + esc(row.verdict || '—') +
            '</td><td>' + fmtDate(row.startedAt) + '</td><td>' + fmtDate(row.completedAt) +
            '</td><td>' + esc(row.providerAgentic || '—') + ' · ' + esc(row.profile) + ' · ' + esc(row.runtime) + '</td><td>' +
            esc((row.predictionCount ?? 0) + ' pred. · ' + (row.parlayCount ?? 0) + ' parlays · ' + (row.validationCount ?? 0) + ' val.') +
            '</td></tr>').join('') +
          '</tbody></table>';
      }

      function renderMiniPrediction(row) {
        return '<div class="detail-line"><b>' + esc(marketLabel(row)) + '</b><span class="sub">odds ' + fmtNum(row.odds) +
          ' · edge ' + fmtPct(row.edge, 1) + ' · conf. ' + fmtPct(row.confidence, 1) + ' · ' + esc(row.quality || 'n/a') +
          '</span><span>' + badge(row.status) + ' <span class="crosslink mono" data-kind="prediction" data-id="' + esc(row.id) + '">' + esc(row.id) + '</span></span></div>';
      }

      function renderMiniValidation(row) {
        const target = validationTargetForRow(row);
        return '<div class="detail-line"><span>' + badge(row.status) + ' ' + esc(row.reason || '') + '</span><span class="sub">' +
          esc(target.summary || target.label || 'Validación') + ' · ' + fmtDate(row.evaluatedAt || row.createdAt) +
          '</span><span class="crosslink mono" data-kind="validation" data-id="' + esc(row.id) + '">' + esc(row.id) + '</span></div>';
      }

      function renderDetail(kind, data, links) {
        if (!data) {
          $('#detail').innerHTML = '<span class=\"muted\">Sin detalle disponible.</span>';
          return;
        }
        const title = kind === 'fixture' ? matchName(data) : data.fixture ? matchName(data.fixture) : data.id || '';
        const sections = [];
        const kv = (label, value) => '<div class=\"kv\"><span>' + esc(label) + '</span><span>' + value + '</span></div>';
        const validationTarget = kind === 'validation' ? validationTargetForRow(data) : null;
        sections.push('<h3>' + esc(title) + '</h3>');
        sections.push(kv('Tipo', esc(kind === 'validation' ? (validationTarget?.label || 'Sin objetivo') : kind)));
        sections.push(kv('ID', '<span class=\"mono\">' + esc(data.id || '') + '</span>'));
        if (kind === 'fixture') {
          sections.push('<div class="insight-grid">' +
            '<div class="insight"><span>Resultado</span><b>' + fmtScore(data) + '</b></div>' +
            '<div class="insight"><span>Predicciones</span><b>' + esc(data.predictionCount ?? 0) + '</b></div>' +
            '<div class="insight"><span>Parlay legs</span><b>' + esc(data.parlayLegCount ?? 0) + '</b></div>' +
            '</div>');
          sections.push(kv('Competencia', esc(data.competition?.name || '—')));
          sections.push(kv('Programado', esc(fmtDate(data.scheduledAt))));
          sections.push(kv('Estado', badge(data.status)));
          if (data.latestPrediction) {
            sections.push('<div class="detail-card"><h4>Última predicción</h4>' + renderMiniPrediction(data.latestPrediction) + '</div>');
          }
          if (Array.isArray(data.recentPredictions) && data.recentPredictions.length) {
            sections.push('<div class="detail-card"><h4>Predicciones recientes</h4><div class="detail-list">' + data.recentPredictions.map(renderMiniPrediction).join('') + '</div></div>');
          }
          if (Array.isArray(data.recentValidations) && data.recentValidations.length) {
            sections.push('<div class="detail-card"><h4>Resultados y settlement</h4><div class="detail-list">' + data.recentValidations.map(renderMiniValidation).join('') + '</div></div>');
          }
        }
        if (kind === 'prediction') {
          sections.push('<div class="insight-grid">' +
            '<div class="insight"><span>Odds</span><b>' + esc(fmtNum(data.odds)) + '</b></div>' +
            '<div class="insight"><span>Edge</span><b>' + esc(fmtPct(data.edge, 1)) + '</b></div>' +
            '<div class="insight"><span>Confianza</span><b>' + esc(fmtPct(data.confidence, 1)) + '</b></div>' +
            '</div>');
          sections.push(kv('Pick', esc(marketLabel(data))));
          sections.push(kv('Probabilidad', esc('impl. ' + fmtPct(data.impliedProbability, 1) + ' · modelo ' + fmtPct(data.estimatedProbability, 1))));
          if (data.fixture) sections.push(kv('Partido', '<span class="crosslink" data-kind="fixture" data-id="' + esc(data.fixture.id) + '">' + esc(matchName(data.fixture)) + '</span>'));
          if (data.latestValidation) sections.push(kv('Última validación', badge(data.latestValidation.status) + ' ' + esc(data.latestValidation.reason || '')));
          if (data.rationale) sections.push('<div class="detail-card"><h4>Rationale</h4><div class="rationale">' + esc(data.rationale) + '</div></div>');
        }
        if (kind === 'parlay') {
          sections.push('<div class="insight-grid">' +
            '<div class="insight"><span>Odds combinadas</span><b>' + esc(fmtNum(data.combinedOdds)) + '</b></div>' +
            '<div class="insight"><span>Confianza</span><b>' + esc(fmtPct(data.aggregateConfidence, 1)) + '</b></div>' +
            '<div class="insight"><span>Calidad</span><b>' + esc(fmtPct(data.aggregateQuality, 1)) + '</b></div>' +
            '</div>');
          if (data.latestValidation) sections.push(kv('Última validación', badge(data.latestValidation.status) + ' ' + esc(data.latestValidation.reason || '')));
          if (Array.isArray(data.legs) && data.legs.length) {
            sections.push('<div class="detail-card"><h4>Legs</h4><div class="detail-list">' + data.legs.map((leg) =>
              '<div class="detail-line"><b>' + esc(matchName(leg.fixture)) + '</b><span class="sub">' + esc(marketLabel(leg)) +
              ' · odds ' + fmtNum(leg.odds) + ' · edge ' + fmtPct(leg.edge, 1) + ' · conf. ' + fmtPct(leg.confidence, 1) +
              '</span><span>' + badge(leg.status) + ' <span class="crosslink mono" data-kind="prediction" data-id="' + esc(leg.predictionId) + '">' + esc(leg.predictionId) + '</span></span></div>'
            ).join('') + '</div></div>');
          }
          if (data.rationale) sections.push('<div class="detail-card"><h4>Rationale</h4><div class="rationale">' + esc(data.rationale) + '</div></div>');
        }
        if (kind === 'run') {
          sections.push('<div class="insight-grid">' +
            '<div class="insight"><span>Predicciones</span><b>' + esc(data.predictionCount ?? 0) + '</b></div>' +
            '<div class="insight"><span>Parlays</span><b>' + esc(data.parlayCount ?? 0) + '</b></div>' +
            '<div class="insight"><span>Validaciones</span><b>' + esc(data.validationCount ?? 0) + '</b></div>' +
            '</div>');
          sections.push(kv('Perfil', esc(data.profile || '—')));
          sections.push(kv('Proveedor/modelo', esc((data.providerAgentic || '—') + ' · ' + (data.model || 'sin modelo'))));
          sections.push(kv('Ventana', esc(fmtDate(data.startedAt) + ' → ' + fmtDate(data.completedAt))));
          if (data.artifactDir) sections.push(kv('Artifacts', '<span class="mono">' + esc(data.artifactDir) + '</span>'));
          if (Array.isArray(data.recentPredictions) && data.recentPredictions.length) {
            sections.push('<div class="detail-card"><h4>Predicciones del run</h4><div class="detail-list">' + data.recentPredictions.slice(0, 5).map(renderMiniPrediction).join('') + '</div></div>');
          }
          if (Array.isArray(data.recentParlays) && data.recentParlays.length) {
            sections.push('<div class="detail-card"><h4>Parlays del run</h4><div class="detail-list">' + data.recentParlays.slice(0, 5).map((parlay) =>
              '<div class="detail-line"><b>Parlay ' + esc(parlay.id) + '</b><span class="sub">odds ' + fmtNum(parlay.combinedOdds) + ' · ' + (parlay.legs?.length || 0) + ' legs · conf. ' + fmtPct(parlay.aggregateConfidence, 1) + '</span><span>' + badge(parlay.status) + ' <span class="crosslink mono" data-kind="parlay" data-id="' + esc(parlay.id) + '">' + esc(parlay.id) + '</span></span></div>'
            ).join('') + '</div></div>');
          }
          if (Array.isArray(data.recentValidations) && data.recentValidations.length) {
            sections.push('<div class="detail-card"><h4>Validaciones del run</h4><div class="detail-list">' + data.recentValidations.slice(0, 5).map(renderMiniValidation).join('') + '</div></div>');
          }
        }
        if (kind === 'validation') {
          const target = validationTarget || validationTargetForRow(data);
          sections.push(kv('Pertenece a', esc(target.summary || '—')));
          sections.push(kv('ID objetivo', target.id && target.kind
            ? '<span class=\"crosslink mono\" data-kind=\"' + esc(target.kind) + '\" data-id=\"' + esc(target.id) + '\">' + esc(target.id) + '</span>'
            : '—'));
        }
        if (data.status) sections.push(kv('Estado', badge(data.status)));
        if (data.runId) sections.push(kv('Run', '<span class=\"crosslink\" data-kind=\"run\" data-id=\"' + esc(data.runId) + '\">' + esc(data.runId) + '</span>'));
        if (links && links.length) {
          sections.push('<div class=\"muted\" style=\"margin-top:6px\">Relaciones</div>' + links);
        }
        if (kind === 'validation' && data.outcome) {
          sections.push(kv('Outcome', esc(JSON.stringify(data.outcome))));
        }
        $('#detail').innerHTML = sections.join('');
      }

      async function loadEntity(kind, id) {
        if (!kind || !id) return;
        const response = await fetch('/api/entity/' + encodeURIComponent(kind) + '/' + encodeURIComponent(id));
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'No fue posible cargar el detalle.');
        const body = payload || {};
        state.selectedKind = kind;
        state.selectedId = id;
        $('#detail').innerHTML = '<span class=\"muted\">Cargando\u2026</span>';

        const entity = body.entity || body;
        let links = '';
        if (kind === 'parlay' && Array.isArray(entity.legs)) {
          const items = entity.legs
            .map((leg) => '<span class=\"chip-btn crosslink\" data-kind=\"prediction\" data-id=\"' + esc(leg.predictionId) + '\">Predicción ' + esc(leg.predictionId) + '</span>')
            .join('');
          links = '<div class=\"chips\">' + items + '</div>';
        }
        if (kind === 'validation') {
          const target = validationTargetForRow(entity);
          if (target.id) {
            links += '<div class=\"chips\"><span class=\"chip-btn crosslink\" data-kind=\"' + esc(target.kind) + '\" data-id=\"' + esc(target.id) + '\">Ver ' + esc(target.label) + '</span></div>';
          }
          if (entity.parlayId && target.kind !== 'parlay') {
            links += '<div class=\"chips\"><span class=\"chip-btn crosslink\" data-kind=\"parlay\" data-id=\"' + esc(entity.parlayId) + '\">Parlay</span></div>';
          }
          if (entity.predictionId && target.kind !== 'prediction') {
            links += '<div class=\"chips\"><span class=\"chip-btn crosslink\" data-kind=\"prediction\" data-id=\"' + esc(entity.predictionId) + '\">Predicción</span></div>';
          }
          if (entity.runId) {
            links += '<div class=\"chips\"><span class=\"chip-btn crosslink\" data-kind=\"run\" data-id=\"' + esc(entity.runId) + '\">Run</span></div>';
          }
        }
        renderDetail(kind, entity, links);
      }

      async function openRelatedEntity(kind, id) {
        if (!kind || !id) return;
        const mappedTab = KIND_TO_TAB[kind];
        if (!mappedTab) return;
        state.tab = mappedTab;
        state.page = 1;
        state.selectedKind = kind;
        state.selectedId = id;
        const availableSorts = state.metadata?.sortOptions?.[mappedTab];
        state.sort = availableSorts && availableSorts.length ? (availableSorts[0] || DEFAULT_SORT_BY[mappedTab]) : DEFAULT_SORT_BY[mappedTab];
        state.direction = 'desc';
        if (Array.isArray(state.metadata?.statuses?.[mappedTab])) {
          state.filters.status = state.filters.status.filter((status) => state.metadata?.statuses?.[mappedTab].includes(status));
        }
        renderFiltersByTab();
        await load();
      }

      function applyFiltersFromForm() {
        state.page = 1;
        state.filters.dateFrom = sanitizeText(readText('dateFrom'));
        state.filters.dateTo = sanitizeText(readText('dateTo'));
        state.filters.runId = sanitizeText(readText('runId'));
        state.filters.market = sanitizeText(readText('market'));
        state.filters.team = sanitizeText(readText('team'));
        state.filters.competition = sanitizeText(readText('competition'));
        state.filters.validationTarget = normalizeValidationTarget(readText('validationTarget'));
        state.filters.status = readSelectValues('status');
        state.filters.quality = readSelectValues('quality');
        state.filters.minConfidence = sanitizeText(readText('minConfidence'));
        state.filters.maxConfidence = sanitizeText(readText('maxConfidence'));
        state.filters.minEdge = sanitizeText(readText('minEdge'));
        state.filters.maxEdge = sanitizeText(readText('maxEdge'));
        state.sort = readText('sort') || state.sort;
        const nextTake = Number(readText('take'));
        state.take = Number.isFinite(nextTake) ? Math.max(1, nextTake) : state.take;
        if (!state.filters.quality.length && (state.metadata?.qualities ?? []).length) {
          state.filters.quality = [];
        }
        state.direction = readText('direction') === 'asc' ? 'asc' : 'desc';
        const validSorts = state.metadata?.sortOptions?.[state.tab];
        if (validSorts && validSorts.length && !validSorts.includes(state.sort)) {
          state.sort = validSorts[0] || DEFAULT_SORT_BY[state.tab];
        }
      }

      function setTab(tab) {
        if (!ALLOWED_TABS.includes(tab)) return;
        state.tab = tab;
        state.page = 1;
        state.selectedKind = null;
        state.selectedId = null;
        const defaults = state.metadata?.sortOptions?.[tab];
        if (defaults?.length) state.sort = defaults[0] || DEFAULT_SORT_BY[tab];
        state.direction = 'desc';
        if (Array.isArray(state.metadata?.statuses?.[tab])) {
          state.filters.status = state.filters.status.filter((status) => state.metadata?.statuses?.[tab]?.includes(status));
        }
        renderFiltersByTab();
        load().catch(() => {});
      }

      function onSortClick(sortField) {
        const validSorts = state.metadata?.sortOptions?.[state.tab];
        if (validSorts && validSorts.length && !validSorts.includes(sortField)) return;
        if (state.sort === sortField) {
          state.direction = state.direction === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort = sortField;
          state.direction = 'desc';
        }
        state.page = 1;
        writeForm();
        load();
      }

      $('[name="take"]').addEventListener('change', () => {
        const nextTake = Number(readText('take'));
        state.take = Number.isFinite(nextTake) && nextTake > 0 ? nextTake : state.take;
      });

      $('#theme-toggle').addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
      });

      document.getElementById('tabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (button) {
          setTab(button.dataset.tab);
        }
      });

      $('#filters').addEventListener('submit', (event) => {
        event.preventDefault();
        applyFiltersFromForm();
        load();
      });

      $('#list').addEventListener('click', async (event) => {
        const link = event.target.closest('.crosslink[data-kind][data-id], .chip-btn[data-kind][data-id]');
        if (link instanceof HTMLElement && link.dataset.kind && link.dataset.id) {
          await openRelatedEntity(link.dataset.kind, link.dataset.id);
          return;
        }

        const row = event.target.closest('tr[data-kind][data-id]');
        if (!row || !(row instanceof HTMLElement)) return;
        const kind = row.dataset.kind;
        const id = row.dataset.id;
        if (!kind || !id) return;
        const rows = rowsForActiveTab();
        rows.forEach((item) => {
          const r = document.querySelector('tr[data-id="' + CSS.escape(item.id) + '"]');
          if (r) r.classList.remove('selected');
        });
        row.classList.add('selected');
        state.selectedKind = kind;
        state.selectedId = id;
        await loadEntity(kind, id);
        syncUrl();
      });

      $('#detail').addEventListener('click', async (event) => {
        const link = event.target.closest('.crosslink[data-kind][data-id], .chip-btn[data-kind][data-id]');
        if (!(link instanceof HTMLElement) || !link.dataset.kind || !link.dataset.id) return;
        await openRelatedEntity(link.dataset.kind, link.dataset.id);
      });

      $('#stats').addEventListener('click', (event) => {
        const card = event.target.closest('[data-metric-kind][data-metric-value]');
        if (!card) return;
        const metricKind = card.dataset.metricKind;
        const value = card.dataset.metricValue;
        if (!metricKind || !value) return;

        if (metricKind === 'status') {
          state.filters.status = [value];
          state.selectedKind = null;
          state.selectedId = null;
          state.page = 1;
          writeForm();
          load();
          return;
        }

        if (metricKind === 'tab') {
          setTab(value);
          return;
        }
      });

      $('#page-prev').addEventListener('click', () => {
        if (state.page > 1) {
          state.page -= 1;
          load();
        }
      });

      $('#page-next').addEventListener('click', () => {
        const totalPages = Number(state.data?.pagination?.totalPages || 1);
        if (state.page < totalPages) {
          state.page += 1;
          load();
        }
      });

      $('#list').addEventListener('click', (event) => {
        const sortButton = event.target.closest('.sort');
        if (!sortButton) return;
        const field = sortButton.dataset.sort;
        if (!field) return;
        onSortClick(field);
      });

      window.addEventListener('popstate', () => {
        syncFromLocation();
        load();
      });

      function syncFromLocation() {
        syncStateFromUrl();
        const tabInput = '#tabs button[data-tab="' + state.tab + '"]';
        const btn = document.querySelector(tabInput);
        const current = document.querySelector('.tab.active');
        if (btn && state.metadata && current !== btn) {
          current?.classList.remove('active');
          btn.classList.add('active');
        }
        const sortInput = $('[name="sort"]');
        if (sortInput) sortInput.value = state.sort;
        writeForm();
      }

      async function boot() {
        applyTheme(state.theme);
        syncStateFromUrl();
        try {
          await loadMetadata();
          const metadata = state.metadata;
          if (metadata) {
            const defaults = metadata.sortOptions[state.tab] ?? ['createdAt'];
            state.sort = defaults.includes(state.sort) ? state.sort : defaults[0];
            if (state.page < 1) state.page = 1;
            if (state.take < 1) state.take = 50;
          }
        } catch (err) {
          $('#list').innerHTML = '<div class=\"error\">No se pudo cargar metadata.</div>';
          return;
        }
        writeForm();
        renderTabs();
        await load();
        if (state.selectedKind && state.selectedId) {
          await loadEntity(state.selectedKind, state.selectedId).catch(() => {});
        }
        window.setInterval(function() {
          if (!state.loading) load().catch(function() {});
        }, 30000);
      }

      boot().catch(() => {});
    })();
  </script>
</body>
</html>`;
}
