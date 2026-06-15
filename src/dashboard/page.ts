import {
  DASHBOARD_CLIENT_SCRIPT_BLOCK,
  DASHBOARD_STYLE_BLOCK,
  DASHBOARD_THEME_BOOTSTRAP_BLOCK,
} from './page-assets.js';

export function dashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gana Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
${DASHBOARD_THEME_BOOTSTRAP_BLOCK}
${DASHBOARD_STYLE_BLOCK}
</head>
<body>
  <div class="shell">
    <header class="module-shell ops-topbar">
      <div class="brand">
        <p class="eyebrow">GANA V9</p>
        <h1>Ops Console</h1>
        <p class="lede">Fixtures · predicciones · parlays · validación · runs</p>
      </div>
      <div class="hero-actions">
        <span class="connection-pill" id="connection-status">Conectando...</span>
        <span id="updated" class="muted">Cargando</span>
        <button class="icon-btn" id="theme-toggle" title="Tema fijo oscuro" type="button">HUD</button>
      </div>
    </header>
    <main class="main">
      <form class="filters-surface module-shell" id="filters">
        <div class="filters-panel-head">
          <h2>Filtros</h2>
          <div class="filter-actions">
            <button class="icon-btn filters-toggle" id="filters-toggle" aria-controls="filters-body" aria-expanded="true" title="Mostrar u ocultar filtros" type="button">Ocultar</button>
            <button class="icon-btn" data-date-preset="yesterday" title="Filtrar ayer" type="button">Ayer</button>
            <button class="icon-btn" data-date-preset="today" title="Filtrar hoy" type="button">Hoy</button>
            <button class="icon-btn" data-date-preset="tomorrow" title="Filtrar mañana" type="button">Mañana</button>
            <button class="icon-btn primary" title="Actualizar" type="submit">Actualizar</button>
          </div>
        </div>
        <div class="filters-body" id="filters-body">
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
          <div class="quick-explore" id="quick-explore" aria-label="Exploración rápida">
            <h3>Explorar rápido</h3>
            <div class="quick-grid">
              <button class="icon-btn" data-quick-tab="predictions" type="button">Predicciones</button>
              <button class="icon-btn" data-quick-tab="parlays" type="button">Parlays</button>
              <button class="icon-btn" data-quick-tab="validations" type="button">Validaciones</button>
              <button class="icon-btn" data-quick-tab="runs" type="button">Runs</button>
              <button class="icon-btn" data-quick-tab="metrics" type="button">Métricas</button>
              <button class="icon-btn" data-quick-tab="daily" type="button">Daily</button>
            </div>
            <div class="quick-grid wide">
              <button class="icon-btn" data-quick-view="top-edge" type="button">Top edge</button>
              <button class="icon-btn" data-quick-view="high-confidence" type="button">Alta confianza</button>
              <button class="icon-btn" data-quick-view="parlay-ready" type="button">Parlays listos</button>
              <button class="icon-btn" data-quick-view="validation-watch" type="button">Validaciones abiertas</button>
            </div>
          </div>
        </div>
      </form>
      <section class="stats module-shell" id="stats"></section>
      <nav class="tabs module-shell" id="tabs">
        <button class="tab active" data-tab="fixtures">Partidos</button>
        <button class="tab" data-tab="predictions">Predicciones</button>
        <button class="tab" data-tab="parlays">Parlays</button>
        <button class="tab" data-tab="validations">Validaciones</button>
        <button class="tab" data-tab="runs">Runs</button>
        <button class="tab" data-tab="metrics">Métricas</button>
        <button class="tab" data-tab="daily">Daily</button>
      </nav>
      <section class="content">
        <div class="panel module-shell">
          <div class="panel-head">
            <h2 id="section-title">Partidos</h2>
            <span class="muted" id="section-count"></span>
          </div>
          <div class="exploration-strip" id="exploration-strip"></div>
          <div id="list" class="empty">Cargando…</div>
          <div class="pager">
            <div class="pager-group">
              <button class="icon-btn" id="page-prev">Anterior</button>
              <button class="icon-btn" id="page-next">Siguiente</button>
            </div>
            <span class="muted-inline" id="pager-meta">Página 1</span>
          </div>
        </div>
        <aside class="panel module-shell" id="detail-panel">
          <div class="panel-head"><h2>Detalle</h2></div>
          <div class="detail" id="detail"><span class="muted">Selecciona una fila para revisar el detalle.</span></div>
        </aside>
      </section>
    </main>
  </div>

${DASHBOARD_CLIENT_SCRIPT_BLOCK}
</body>
</html>`;
}
