import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { URL } from 'url';
import type { AgentConfig } from '../config.js';
import { getPrismaClient } from '../storage/db.js';

export interface DashboardOptions {
  host?: string;
  port?: number;
}

export interface DashboardServer {
  server: Server;
  url: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4317;
const MAX_TAKE = 200;

export async function startDashboardServer(
  config: AgentConfig,
  options: DashboardOptions = {},
): Promise<DashboardServer> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const db = getPrismaClient();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

      if (url.pathname === '/') return sendHtml(res, dashboardHtml());
      if (url.pathname === '/api/overview') {
        const data = await readOverview(db, config, url.searchParams);
        return sendJson(res, 200, data);
      }
      if (url.pathname === '/api/health') {
        await db.$queryRaw`SELECT 1`;
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (err: any) {
      return sendJson(res, 500, {
        error: 'dashboard_error',
        message: err?.message ?? String(err),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return { server, url: `http://${host}:${port}` };
}

type DashboardDb = ReturnType<typeof getPrismaClient>;

async function readOverview(db: DashboardDb, config: AgentConfig, params: URLSearchParams) {
  const take = clampTake(params.get('take'));
  const runId = cleanParam(params.get('runId'));
  const status = cleanParam(params.get('status'));
  const date = cleanDate(params.get('date'));
  const range = date ? dateRange(date) : undefined;

  const fixtureDateWhere = range
    ? { fixture: { scheduledAt: { gte: range.start, lt: range.end } } }
    : {};
  const legDateWhere = range
    ? { legs: { some: { fixture: { scheduledAt: { gte: range.start, lt: range.end } } } } }
    : {};
  const validationDateWhere = range
    ? { evaluatedAt: { gte: range.start, lt: range.end } }
    : {};

  const predictionWhere = compact({
    runId,
    status,
    ...fixtureDateWhere,
  });
  const parlayWhere = compact({
    runId,
    status,
    ...legDateWhere,
  });
  const validationWhere = compact({
    runId,
    status,
    ...validationDateWhere,
  });
  const runWhere = compact({ id: runId, status });

  const [predictions, parlays, validations, runs, counts] = await Promise.all([
    db.prediction.findMany({
      where: predictionWhere,
      orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
      take,
      include: {
        fixture: { include: { competition: true, homeTeam: true, awayTeam: true } },
        validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      },
    }),
    db.parlay.findMany({
      where: parlayWhere,
      orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
      take,
      include: {
        legs: {
          orderBy: { legIndex: 'asc' },
          include: {
            fixture: { include: { competition: true, homeTeam: true, awayTeam: true } },
            prediction: true,
          },
        },
        validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      },
    }),
    db.validationArtifact.findMany({
      where: validationWhere,
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'asc' }],
      take,
      include: {
        fixture: { include: { competition: true, homeTeam: true, awayTeam: true } },
        prediction: true,
        parlay: true,
      },
    }),
    db.harnessRun.findMany({
      where: runWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: Math.min(take, 50),
    }),
    Promise.all([
      db.prediction.count({ where: predictionWhere }),
      db.parlay.count({ where: parlayWhere }),
      db.validationArtifact.count({ where: validationWhere }),
      db.harnessRun.count({ where: runWhere }),
    ]),
  ]);

  return toPlain({
    generatedAt: new Date(),
    filters: { date, runId, status, take },
    config: {
      timezone: config.apiFootball.timezone,
      artifactRoot: config.artifactRoot,
      providerSports: 'api-football',
      providerAgentic: config.provider,
      model: config.model,
    },
    counts: {
      predictions: counts[0],
      parlays: counts[1],
      validations: counts[2],
      runs: counts[3],
    },
    predictions: predictions.map(mapPrediction),
    parlays: parlays.map(mapParlay),
    validations: validations.map(mapValidation),
    runs: runs.map(mapRun),
  });
}

function mapPrediction(row: any) {
  return {
    id: row.id,
    runId: row.runId,
    fixture: mapFixture(row.fixture),
    marketKey: row.marketKey,
    selectionKey: row.selectionKey,
    line: row.line,
    odds: row.odds,
    impliedProbability: row.impliedProbability,
    estimatedProbability: row.estimatedProbability,
    edge: row.edge,
    confidence: row.confidence,
    quality: row.quality,
    status: row.status,
    rationale: row.rationaleRedacted,
    warnings: row.warnings,
    generatedAt: row.generatedAt,
    latestValidation: row.validationArtifacts?.[0] ? mapValidation(row.validationArtifacts[0]) : null,
  };
}

function mapParlay(row: any) {
  return {
    id: row.id,
    runId: row.runId,
    combinedOdds: row.combinedOdds,
    aggregateConfidence: row.aggregateConfidence,
    aggregateQuality: row.aggregateQuality,
    status: row.status,
    rationale: row.rationaleRedacted,
    warnings: row.warnings,
    generatedAt: row.generatedAt,
    latestValidation: row.validationArtifacts?.[0] ? mapValidation(row.validationArtifacts[0]) : null,
    legs: (row.legs ?? []).map((leg: any) => ({
      id: leg.id,
      legIndex: leg.legIndex,
      predictionId: leg.predictionId,
      fixture: mapFixture(leg.fixture),
      marketKey: leg.marketKey,
      selectionKey: leg.selectionKey,
      line: leg.line,
      odds: leg.odds,
      status: leg.status,
      inclusionReason: leg.inclusionReason,
      predictionStatus: leg.prediction?.status ?? null,
      confidence: leg.prediction?.confidence ?? null,
      edge: leg.prediction?.edge ?? null,
    })),
  };
}

function mapValidation(row: any) {
  return {
    id: row.id,
    runId: row.runId,
    predictionId: row.predictionId,
    parlayId: row.parlayId,
    fixture: row.fixture ? mapFixture(row.fixture) : null,
    status: row.status,
    reason: row.reason,
    evaluatedAt: row.evaluatedAt,
    outcome: row.outcome,
    settlementRuleVersion: row.settlementRuleVersion,
  };
}

function mapRun(row: any) {
  return {
    id: row.id,
    runtime: row.runtime,
    profile: row.profile,
    providerSports: row.providerSports,
    providerAgentic: row.providerAgentic,
    model: row.model,
    status: row.status,
    verdict: row.verdict,
    artifactDir: row.artifactDir,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

function mapFixture(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    providerFixtureId: row.providerFixtureId,
    scheduledAt: row.scheduledAt,
    status: row.status,
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    competition: row.competition ? {
      id: row.competition.id,
      name: row.competition.name,
      country: row.competition.country,
    } : null,
    homeTeam: row.homeTeam ? { id: row.homeTeam.id, name: row.homeTeam.name } : null,
    awayTeam: row.awayTeam ? { id: row.awayTeam.id, name: row.awayTeam.name } : null,
  };
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(toPlain(body)));
}

function clampTake(value: string | null): number {
  const parsed = value ? Number(value) : 50;
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(MAX_TAKE, Math.trunc(parsed)));
}

function cleanParam(value: string | null): string | undefined {
  const clean = value?.trim();
  return clean ? clean : undefined;
}

function cleanDate(value: string | null): string | undefined {
  const clean = cleanParam(value);
  return clean && /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : undefined;
}

function dateRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object' && typeof item.toString === 'function' && item.constructor?.name === 'Decimal') {
      return Number(item.toString());
    }
    return item;
  }));
}

function dashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gana Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --line: #d7dde3;
      --text: #17202a;
      --muted: #66717d;
      --accent: #126b61;
      --accent-2: #b53f2f;
      --good: #137a4a;
      --warn: #9a6500;
      --bad: #b42318;
      --chip: #eef3f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
    }
    button, input, select { font: inherit; }
    .shell { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .brand { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
    .brand h1 { margin: 0; font-size: 20px; line-height: 1.2; letter-spacing: 0; }
    .brand span { color: var(--muted); white-space: nowrap; }
    .toolbar { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    label { color: var(--muted); display: grid; gap: 4px; font-size: 12px; }
    input, select {
      height: 34px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      border-radius: 6px;
      padding: 0 9px;
      min-width: 132px;
    }
    .icon-btn, .tab {
      height: 34px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      border-radius: 6px;
      padding: 0 10px;
      cursor: pointer;
    }
    .icon-btn:hover, .tab:hover { border-color: var(--accent); }
    .icon-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    main { padding: 18px 20px 28px; display: grid; gap: 16px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 82px;
    }
    .stat b { display: block; font-size: 26px; line-height: 1.1; margin-top: 8px; }
    .muted { color: var(--muted); }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .tab.active { background: var(--text); color: #fff; border-color: var(--text); }
    .content { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-width: 0;
    }
    .panel-head {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .panel-head h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 880px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #edf0f2; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 600; background: #fafbfc; }
    tr { cursor: pointer; }
    tr:hover { background: #f8fbfb; }
    .match { font-weight: 700; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .badge {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      min-height: 24px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--chip);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .badge.good { color: var(--good); background: #eaf6ef; }
    .badge.warn { color: var(--warn); background: #fff4df; }
    .badge.bad { color: var(--bad); background: #fdeceb; }
    .cards { display: grid; gap: 10px; padding: 12px; }
    .parlay {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      background: #fff;
    }
    .parlay:hover { border-color: var(--accent); }
    .parlay-top { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .legs { display: grid; gap: 8px; margin-top: 10px; }
    .leg { border-left: 3px solid var(--accent); padding-left: 8px; }
    aside { position: sticky; top: 82px; }
    .detail { padding: 14px; display: grid; gap: 12px; }
    .detail h3 { margin: 0; font-size: 16px; line-height: 1.25; }
    .kv { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px; }
    .kv span:first-child { color: var(--muted); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .empty { padding: 28px; color: var(--muted); text-align: center; }
    .error { color: var(--bad); padding: 12px 14px; }
    @media (max-width: 980px) {
      header { align-items: stretch; flex-direction: column; }
      .toolbar { justify-content: flex-start; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .content { grid-template-columns: 1fr; }
      aside { position: static; }
    }
    @media (max-width: 620px) {
      main { padding: 12px; }
      .stats { grid-template-columns: 1fr; }
      input, select { width: 100%; min-width: 0; }
      label { flex: 1 1 150px; }
      .toolbar { align-items: stretch; }
      .icon-btn { flex: 1 1 80px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand">
        <h1>Gana Dashboard</h1>
        <span id="updated">Cargando</span>
      </div>
      <form class="toolbar" id="filters">
        <label>Fecha <input type="date" name="date"></label>
        <label>Run ID <input name="runId" placeholder="run id"></label>
        <label>Estado <input name="status" placeholder="promotable"></label>
        <label>Limite
          <select name="take">
            <option>50</option>
            <option>100</option>
            <option>200</option>
          </select>
        </label>
        <button class="icon-btn primary" title="Actualizar" type="submit">↻</button>
      </form>
    </header>
    <main>
      <section class="stats" id="stats"></section>
      <nav class="tabs" id="tabs">
        <button class="tab active" data-tab="predictions">Predicciones</button>
        <button class="tab" data-tab="parlays">Parlays</button>
        <button class="tab" data-tab="validations">Validaciones</button>
        <button class="tab" data-tab="runs">Runs</button>
      </nav>
      <section class="content">
        <div class="panel">
          <div class="panel-head">
            <h2 id="section-title">Predicciones</h2>
            <span class="muted" id="section-count"></span>
          </div>
          <div id="list"></div>
        </div>
        <aside class="panel">
          <div class="panel-head"><h2>Detalle</h2></div>
          <div class="detail" id="detail"><span class="muted">Selecciona una fila para revisar el detalle.</span></div>
        </aside>
      </section>
    </main>
  </div>
  <script>
    const state = { tab: 'predictions', data: null, selected: null };
    const $ = (sel) => document.querySelector(sel);
    const fmt = (v, digits = 3) => v === null || v === undefined ? '—' : Number(v).toFixed(digits);
    const pct = (v) => v === null || v === undefined ? '—' : (Number(v) * 100).toFixed(1) + '%';
    const dateTime = (v) => v ? new Date(v).toLocaleString() : '—';
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const matchName = (fixture) => {
      if (!fixture) return 'Sin fixture';
      const home = fixture.homeTeam?.name ?? 'Local';
      const away = fixture.awayTeam?.name ?? 'Visita';
      return home + ' vs ' + away;
    };
    const badgeClass = (status) => {
      const s = String(status ?? '').toLowerCase();
      if (['promotable', 'succeeded', 'won'].includes(s)) return 'good';
      if (['blocked', 'failed', 'lost', 'error'].includes(s)) return 'bad';
      if (['review-required', 'pending', 'running'].includes(s)) return 'warn';
      return '';
    };
    const badge = (status) => '<span class="badge ' + badgeClass(status) + '">' + esc(status ?? 'none') + '</span>';

    async function load() {
      const params = new URLSearchParams(new FormData($('#filters')));
      for (const [key, value] of [...params.entries()]) if (!value) params.delete(key);
      const res = await fetch('/api/overview?' + params.toString());
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? body.error ?? 'Error');
      state.data = body;
      state.selected = null;
      render();
    }

    function render() {
      $('#updated').textContent = 'Actualizado ' + dateTime(state.data.generatedAt);
      renderStats();
      renderList();
      renderDetail();
    }

    function renderStats() {
      const c = state.data.counts;
      $('#stats').innerHTML = [
        ['Predicciones', c.predictions],
        ['Parlays', c.parlays],
        ['Validaciones', c.validations],
        ['Runs', c.runs],
      ].map(([label, value]) => '<article class="stat"><span class="muted">' + label + '</span><b>' + value + '</b></article>').join('');
    }

    function setTab(tab) {
      state.tab = tab;
      state.selected = null;
      document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
      renderList();
      renderDetail();
    }

    function renderList() {
      const title = { predictions: 'Predicciones', parlays: 'Parlays', validations: 'Validaciones', runs: 'Runs' }[state.tab];
      const rows = state.data[state.tab] ?? [];
      $('#section-title').textContent = title;
      $('#section-count').textContent = rows.length + ' visibles';
      if (!rows.length) {
        $('#list').innerHTML = '<div class="empty">No hay datos para los filtros actuales.</div>';
        return;
      }
      if (state.tab === 'predictions') return renderPredictions(rows);
      if (state.tab === 'parlays') return renderParlays(rows);
      if (state.tab === 'validations') return renderValidations(rows);
      return renderRuns(rows);
    }

    function rowAttrs(type, id) {
      return 'data-type="' + type + '" data-id="' + esc(id) + '"';
    }

    function renderPredictions(rows) {
      $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Partido</th><th>Pick</th><th>Odds</th><th>Edge</th><th>Confianza</th><th>Estado</th><th>Generado</th></tr></thead><tbody>' +
        rows.map((p) => '<tr ' + rowAttrs('predictions', p.id) + '><td><div class="match">' + esc(matchName(p.fixture)) + '</div><div class="sub">' + esc(p.fixture?.competition?.name ?? '') + ' · ' + dateTime(p.fixture?.scheduledAt) + '</div></td><td><b>' + esc(p.marketKey) + '</b><div class="sub">' + esc(p.selectionKey) + (p.line ? ' ' + esc(p.line) : '') + '</div></td><td>' + fmt(p.odds) + '</td><td>' + pct(p.edge) + '</td><td>' + pct(p.confidence) + '</td><td>' + badge(p.status) + '</td><td>' + dateTime(p.generatedAt) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }

    function renderParlays(rows) {
      $('#list').innerHTML = '<div class="cards">' + rows.map((p) => '<article class="parlay" ' + rowAttrs('parlays', p.id) + '><div class="parlay-top"><div><b>' + esc(p.id) + '</b><div class="sub">' + p.legs.length + ' legs · ' + dateTime(p.generatedAt) + '</div></div><div>' + badge(p.status) + '</div></div><div class="sub">Odds ' + fmt(p.combinedOdds) + ' · Confianza ' + pct(p.aggregateConfidence) + ' · Calidad ' + pct(p.aggregateQuality) + '</div><div class="legs">' + p.legs.map((l) => '<div class="leg"><b>' + esc(matchName(l.fixture)) + '</b><div class="sub">' + esc(l.marketKey) + ' · ' + esc(l.selectionKey) + ' · ' + fmt(l.odds) + '</div></div>').join('') + '</div></article>').join('') + '</div>';
    }

    function renderValidations(rows) {
      $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Objetivo</th><th>Partido</th><th>Resultado</th><th>Motivo</th><th>Evaluado</th></tr></thead><tbody>' +
        rows.map((v) => '<tr ' + rowAttrs('validations', v.id) + '><td><div class="mono">' + esc(v.predictionId ?? v.parlayId ?? v.id) + '</div></td><td>' + esc(matchName(v.fixture)) + '</td><td>' + badge(v.status) + '</td><td>' + esc(v.reason ?? '—') + '</td><td>' + dateTime(v.evaluatedAt) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }

    function renderRuns(rows) {
      $('#list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Run</th><th>Estado</th><th>Veredicto</th><th>Provider</th><th>Creado</th></tr></thead><tbody>' +
        rows.map((r) => '<tr ' + rowAttrs('runs', r.id) + '><td><div class="mono">' + esc(r.id) + '</div></td><td>' + badge(r.status) + '</td><td>' + esc(r.verdict ?? '—') + '</td><td>' + esc(r.providerAgentic ?? '—') + '</td><td>' + dateTime(r.createdAt) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }

    function renderDetail() {
      const item = state.selected;
      if (!item) {
        $('#detail').innerHTML = '<span class="muted">Selecciona una fila para revisar el detalle.</span>';
        return;
      }
      const title = item.fixture ? matchName(item.fixture) : item.id;
      const body = [];
      body.push('<h3>' + esc(title) + '</h3>');
      body.push(kv('ID', '<span class="mono">' + esc(item.id) + '</span>'));
      if (item.runId) body.push(kv('Run', '<span class="mono">' + esc(item.runId) + '</span>'));
      if (item.status) body.push(kv('Estado', badge(item.status)));
      if (item.marketKey) body.push(kv('Mercado', esc(item.marketKey) + ' · ' + esc(item.selectionKey)));
      if (item.odds) body.push(kv('Odds', fmt(item.odds)));
      if (item.edge !== undefined) body.push(kv('Edge', pct(item.edge)));
      if (item.confidence !== undefined) body.push(kv('Confianza', pct(item.confidence)));
      if (item.combinedOdds !== undefined) body.push(kv('Odds combo', fmt(item.combinedOdds)));
      if (item.verdict !== undefined) body.push(kv('Veredicto', esc(item.verdict ?? '—')));
      if (item.artifactDir) body.push(kv('Artifact', '<span class="mono">' + esc(item.artifactDir) + '</span>'));
      if (item.rationale) body.push('<div><span class="muted">Racional</span><p>' + esc(item.rationale) + '</p></div>');
      if (item.reason) body.push(kv('Motivo', esc(item.reason)));
      if (item.latestValidation) body.push(kv('Validacion', badge(item.latestValidation.status)));
      if (item.legs) body.push('<div><span class="muted">Legs</span><div class="legs">' + item.legs.map((l) => '<div class="leg"><b>' + esc(matchName(l.fixture)) + '</b><div class="sub">' + esc(l.marketKey) + ' · ' + esc(l.selectionKey) + ' · ' + fmt(l.odds) + '</div></div>').join('') + '</div></div>');
      $('#detail').innerHTML = body.join('');
    }

    function kv(k, v) {
      return '<div class="kv"><span>' + esc(k) + '</span><span>' + v + '</span></div>';
    }

    $('#filters').addEventListener('submit', (event) => {
      event.preventDefault();
      load().catch((err) => $('#list').innerHTML = '<div class="error">' + esc(err.message) + '</div>');
    });
    $('#tabs').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-tab]');
      if (btn) setTab(btn.dataset.tab);
    });
    $('#list').addEventListener('click', (event) => {
      const row = event.target.closest('[data-id]');
      if (!row) return;
      const rows = state.data[row.dataset.type] ?? [];
      state.selected = rows.find((item) => item.id === row.dataset.id);
      renderDetail();
    });

    load().catch((err) => $('#list').innerHTML = '<div class="error">' + esc(err.message) + '</div>');
  </script>
</body>
</html>`;
}
