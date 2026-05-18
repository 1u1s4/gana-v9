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
      color-scheme: dark;
      --background: oklch(0.09 0.005 260);
      --foreground: oklch(0.95 0.01 260);
      --card: oklch(0.12 0.008 260);
      --card-strong: oklch(0.14 0.01 260);
      --secondary: oklch(0.16 0.005 260);
      --muted: oklch(0.2 0.005 260);
      --muted-foreground: oklch(0.55 0.02 260);
      --primary: oklch(0.72 0.14 185);
      --primary-soft: color-mix(in oklab, var(--primary) 14%, transparent);
      --positive: oklch(0.68 0.17 155);
      --negative: oklch(0.58 0.2 25);
      --warning: oklch(0.75 0.14 75);
      --info: oklch(0.68 0.13 235);
      --accent-purple: oklch(0.6 0.2 300);
      --border: oklch(0.25 0.01 260);
      --border-dim: oklch(0.18 0.005 260);
      --input: oklch(0.14 0.005 260);
      --radius: 4px;
      --shell-gap: 6px;
      --font-sans: "Geist", "Inter", ui-sans-serif, system-ui, sans-serif;
      --font-mono: "Geist Mono", "JetBrains Mono", Consolas, ui-monospace, monospace;

      --bg: var(--background);
      --panel: var(--card);
      --panel-soft: var(--secondary);
      --control: var(--input);
      --table-head: var(--card);
      --table-line: color-mix(in oklab, var(--border-dim) 82%, transparent);
      --row-selected: color-mix(in oklab, var(--primary) 12%, transparent);
      --row-hover: color-mix(in oklab, var(--secondary) 54%, transparent);
      --line: var(--border-dim);
      --text: var(--foreground);
      --muted: var(--muted-foreground);
      --accent: var(--primary);
      --accent-2: var(--accent-purple);
      --good: var(--positive);
      --warn: var(--warning);
      --info-line: var(--info);
      --bad: var(--negative);
      --chip: var(--secondary);
      --good-bg: color-mix(in oklab, var(--positive) 13%, transparent);
      --warn-bg: color-mix(in oklab, var(--warning) 13%, transparent);
      --bad-bg: color-mix(in oklab, var(--negative) 13%, transparent);
      --tag-bg: var(--primary-soft);
      --tag-text: var(--foreground);
      --shadow: none;
    }

    html,
    html[data-theme="dark"],
    html[data-theme="light"] {
      color-scheme: dark;
      --background: oklch(0.09 0.005 260);
      --foreground: oklch(0.95 0.01 260);
      --card: oklch(0.12 0.008 260);
      --card-strong: oklch(0.14 0.01 260);
      --secondary: oklch(0.16 0.005 260);
      --muted: oklch(0.2 0.005 260);
      --muted-foreground: oklch(0.55 0.02 260);
      --primary: oklch(0.72 0.14 185);
      --positive: oklch(0.68 0.17 155);
      --negative: oklch(0.58 0.2 25);
      --warning: oklch(0.75 0.14 75);
      --info: oklch(0.68 0.13 235);
      --accent-purple: oklch(0.6 0.2 300);
      --border: oklch(0.25 0.01 260);
      --border-dim: oklch(0.18 0.005 260);
      --input: oklch(0.14 0.005 260);
      --bg: var(--background);
      --panel: var(--card);
      --panel-soft: var(--secondary);
      --control: var(--input);
      --table-head: var(--card);
      --table-line: color-mix(in oklab, var(--border-dim) 82%, transparent);
      --row-selected: color-mix(in oklab, var(--primary) 12%, transparent);
      --row-hover: color-mix(in oklab, var(--secondary) 54%, transparent);
      --line: var(--border-dim);
      --text: var(--foreground);
      --muted: var(--muted-foreground);
      --accent: var(--primary);
      --accent-2: var(--accent-purple);
      --good: var(--positive);
      --warn: var(--warning);
      --info-line: var(--info);
      --bad: var(--negative);
      --chip: var(--secondary);
      --good-bg: color-mix(in oklab, var(--positive) 13%, transparent);
      --warn-bg: color-mix(in oklab, var(--warning) 13%, transparent);
      --bad-bg: color-mix(in oklab, var(--negative) 13%, transparent);
      --tag-bg: color-mix(in oklab, var(--primary) 14%, transparent);
      --tag-text: var(--foreground);
      --shadow: none;
    }

    * { box-sizing: border-box; }
    button, input, select { font: inherit; }
    html { min-height: 100%; background: var(--background); }
    body {
      margin: 0;
      min-height: 100vh;
      overflow: hidden;
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans);
      font-size: 12px;
      line-height: 1.35;
    }
    body::before { content: none; }
    ::selection { background: color-mix(in oklab, var(--primary) 28%, transparent); }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border-dim); border-radius: 999px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--border); }

    .shell {
      width: 100vw;
      height: 100vh;
      min-height: 100vh;
      padding: 6px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: var(--shell-gap);
      overflow: hidden;
    }
    .main {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(250px, 0.72fr) minmax(0, 2.3fr) minmax(300px, 0.98fr);
      grid-template-rows: auto 1fr;
      gap: var(--shell-gap);
      overflow: hidden;
      padding: 0;
    }

    .module-shell,
    .filters-surface,
    .stats,
    .tabs,
    .panel,
    header {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border-dim);
      border-radius: var(--radius);
      background: var(--card);
      box-shadow: none;
    }
    .module-shell::before,
    .filters-surface::before,
    .stats::before,
    .tabs::before,
    .panel::before,
    header::before { content: none; }

    header {
      min-height: 34px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 8px;
      border-bottom-color: var(--border);
      background: var(--card);
    }
    .brand {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand::before {
      content: '';
      width: 14px;
      height: 14px;
      border: 1px solid var(--primary);
      border-radius: 3px;
      background: linear-gradient(135deg, transparent 42%, var(--primary) 42% 58%, transparent 58%);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent);
      flex: 0 0 auto;
    }
    .eyebrow {
      margin: 0;
      color: var(--primary);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .brand h1 {
      margin: 0;
      display: inline;
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .lede {
      margin: 0 0 0 10px;
      display: inline;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .hero-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      min-width: 0;
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .connection-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 18px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .connection-pill::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
    }
    .connection-pill.ok { color: var(--positive); }
    .connection-pill.warn { color: var(--warning); }
    .connection-pill.error { color: var(--negative); }
    #updated { font-family: var(--font-mono); font-size: 10px; color: var(--muted-foreground); }

    .filters-surface {
      grid-column: 1;
      grid-row: 1 / span 2;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .filters-panel-head,
    .panel-head {
      min-height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border-dim);
      background: var(--card);
    }
    .filters-panel-head h2,
    .panel-head h2 {
      margin: 0;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .filters-panel-head h2::before,
    .panel-head h2::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-right: 6px;
      border-radius: 999px;
      background: var(--muted-foreground);
      opacity: 0.6;
      vertical-align: 1px;
    }
    .filter-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 4px; }
    .quick-explore {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border-dim);
      display: grid;
      gap: 6px;
    }
    .quick-explore h3 {
      margin: 0;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
    .quick-grid.wide { grid-template-columns: 1fr; }
    .entity-actions { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 4px; }
    .json-card {
      max-height: 180px;
      overflow: auto;
      margin: 0;
      padding: 7px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .filters-body { min-height: 0; overflow: auto; padding: 8px; }
    .filters-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 7px;
      align-items: start;
    }
    label,
    .filters-grid .filter-multi,
    .filters-grid .filter-number {
      display: grid;
      gap: 3px;
      min-width: 0;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .filters-grid .filter-number .range {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    input,
    select {
      width: 100%;
      min-width: 0;
      height: 25px;
      padding: 0 7px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: color-mix(in oklab, var(--input) 82%, transparent);
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 10px;
      outline: none;
    }
    select[multiple] { height: 46px; padding: 3px 5px; }
    input:focus,
    select:focus { border-color: var(--primary); box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 25%, transparent); }

    .stats {
      grid-column: 2 / span 2;
      grid-row: 1;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
      padding: 0;
      overflow: visible;
      border: 0;
      background: transparent;
    }
    .stat {
      min-height: 54px;
      padding: 8px;
      border: 1px solid var(--border-dim);
      border-radius: var(--radius);
      background: var(--card);
      cursor: pointer;
    }
    .stat:hover,
    .stat.active { background: color-mix(in oklab, var(--secondary) 58%, transparent); border-color: var(--border); }
    .stat.active { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 34%, transparent); }
    .stat .muted {
      display: block;
      margin: 0 0 6px;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .stat b {
      display: block;
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 22px;
      font-weight: 600;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .tabs {
      grid-column: 2;
      grid-row: 2;
      align-self: start;
      z-index: 3;
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 2px;
      padding: 2px;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      background: var(--card);
    }
    .tab {
      height: 24px;
      border: 0;
      border-radius: 2px;
      background: transparent;
      color: var(--muted-foreground);
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }
    .tab.active { background: var(--secondary); color: var(--primary); }
    .tab:hover { color: var(--foreground); background: color-mix(in oklab, var(--secondary) 60%, transparent); }

    .metric-charts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      min-width: 520px;
    }
    .metric-chart {
      min-width: 0;
      padding: 8px;
      border: 1px solid var(--border-dim);
      border-radius: var(--radius);
      background: color-mix(in oklab, var(--secondary) 38%, transparent);
    }
    .metric-chart h4 {
      margin: 0 0 8px;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .bar-row {
      display: grid;
      grid-template-columns: minmax(84px, 0.8fr) minmax(80px, 1fr) 42px;
      gap: 6px;
      align-items: center;
      margin: 4px 0;
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .bar-track {
      height: 6px;
      overflow: hidden;
      border-radius: 2px;
      background: var(--border-dim);
    }
    .bar-fill {
      height: 100%;
      background: var(--primary);
    }

    .content {
      grid-column: 2 / span 2;
      grid-row: 2;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 0.46fr);
      gap: 6px;
      padding-top: 30px;
      overflow: hidden;
    }
    .panel {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-radius: var(--radius);
    }
    .exploration-strip {
      min-height: 38px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border-dim);
      background:
        linear-gradient(90deg, color-mix(in oklab, var(--primary) 7%, transparent), transparent 46%),
        var(--card);
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .active-chips,
    .explore-actions {
      min-width: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }
    .explore-actions { justify-content: flex-end; }
    .context-chip {
      min-height: 20px;
      max-width: 100%;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 7px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: color-mix(in oklab, var(--secondary) 64%, transparent);
      color: var(--muted-foreground);
      overflow-wrap: anywhere;
    }
    .context-chip strong {
      color: var(--foreground);
      font-weight: 600;
    }
    .context-chip button {
      width: 14px;
      height: 14px;
      padding: 0;
      display: inline-grid;
      place-items: center;
      border: 0;
      color: var(--muted-foreground);
      line-height: 1;
    }
    .table-wrap { min-height: 0; overflow: auto; flex: 1; }
    .table-host {
      min-height: 0;
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    table {
      width: 100%;
      min-width: 860px;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: 10px;
    }
    th,
    td {
      padding: 5px 7px;
      border-bottom: 1px solid var(--table-line);
      text-align: left;
      vertical-align: top;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--card);
      color: var(--muted-foreground);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    th button {
      all: unset;
      cursor: pointer;
      display: inline-flex;
      width: 100%;
      align-items: center;
      gap: 4px;
    }
    th button:hover { color: var(--primary); }
    tbody tr { cursor: pointer; }
    tbody tr:hover { background: var(--row-hover); }
    tbody tr.selected { background: var(--row-selected); }

    .pager {
      min-height: 29px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 6px;
      border-top: 1px solid var(--border-dim);
      background: var(--card);
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .pager-group { display: flex; align-items: center; gap: 4px; }

    button,
    .icon-btn,
    .chip-btn {
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: transparent;
      color: var(--foreground);
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .icon-btn {
      min-height: 22px;
      padding: 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .icon-btn.primary {
      border-color: color-mix(in oklab, var(--primary) 42%, var(--border-dim));
      background: color-mix(in oklab, var(--primary) 14%, transparent);
      color: var(--primary);
    }
    button:hover,
    .icon-btn:hover,
    .chip-btn:hover { background: var(--secondary); border-color: var(--border); color: var(--primary); }
    button:disabled,
    .icon-btn:disabled { cursor: not-allowed; opacity: 0.42; }

    .detail {
      min-height: 0;
      overflow: auto;
      display: grid;
      align-content: start;
      gap: 8px;
      padding: 8px;
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .detail h3 { margin: 0; color: var(--foreground); font-size: 12px; font-weight: 600; }
    .detail h4 {
      margin: 0 0 5px;
      color: var(--muted-foreground);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .detail-card,
    .detail-line {
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: color-mix(in oklab, var(--secondary) 42%, transparent);
    }
    .detail-card { padding: 7px; display: grid; gap: 6px; }
    .detail-line { padding: 6px; display: grid; gap: 3px; }
    .detail-list { display: grid; gap: 5px; }
    .kv {
      display: grid;
      grid-template-columns: 90px minmax(0, 1fr);
      gap: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid color-mix(in oklab, var(--border-dim) 58%, transparent);
    }
    .kv span:first-child { color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.06em; }
    .insight-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
    .insight { border: 1px solid var(--border-dim); border-radius: 3px; padding: 6px; background: var(--background); }
    .insight span { display: block; margin-bottom: 4px; color: var(--muted-foreground); font-size: 9px; text-transform: uppercase; }
    .insight b { display: block; color: var(--foreground); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

    .badge,
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 17px;
      max-width: 100%;
      padding: 1px 5px;
      border: 1px solid var(--border-dim);
      border-radius: 2px;
      background: var(--secondary);
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      overflow-wrap: anywhere;
    }
    .badge.good { color: var(--positive); background: var(--good-bg); }
    .badge.warn { color: var(--warning); background: var(--warn-bg); }
    .badge.info { color: var(--info-line); background: color-mix(in oklab, var(--info-line) 13%, transparent); }
    .badge.bad { color: var(--negative); background: var(--bad-bg); }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip-btn { min-height: 18px; padding: 1px 6px; color: var(--muted-foreground); }
    .crosslink { color: var(--primary); text-decoration: none; cursor: pointer; }
    .crosslink:hover { color: var(--foreground); }
    .match { color: var(--foreground); font-weight: 600; }
    .sub,
    .muted,
    .muted-inline { color: var(--muted-foreground); }
    .sub { margin-top: 2px; font-size: 9px; }
    .muted-inline { font-size: 9px; }
    .mono { font-family: var(--font-mono); font-size: 9px; overflow-wrap: anywhere; }
    .scoreline { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }
    .scoreline span { min-width: 18px; padding: 1px 4px; border-radius: 2px; background: var(--secondary); text-align: center; }
    .rationale { white-space: pre-wrap; line-height: 1.5; color: var(--foreground); }
    .card-grid {
      width: 100%;
      min-height: 0;
      overflow: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(286px, 1fr));
      align-content: start;
      gap: 8px;
      padding: 8px;
    }
    .entity-card {
      min-width: 0;
      min-height: 206px;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border-dim);
      border-radius: var(--radius);
      background: var(--card);
      cursor: pointer;
    }
    .entity-card:hover,
    .entity-card.selected { background: color-mix(in oklab, var(--secondary) 42%, transparent); border-color: var(--border); }
    .entity-card.selected { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 36%, transparent); }
    .card-head,
    .card-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px;
    }
    .card-head { border-bottom: 1px solid var(--border-dim); }
    .card-foot { margin-top: auto; border-top: 1px solid var(--border-dim); }
    .team-row,
    .metric-row,
    .leg-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .team-stack,
    .leg-list,
    .card-body { display: grid; gap: 6px; padding: 8px; }
    .team-name { min-width: 0; display: flex; align-items: center; gap: 7px; color: var(--foreground); font-weight: 600; }
    .team-name span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crest,
    .flag {
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid var(--border-dim);
      background: var(--background);
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
    }
    .crest { width: 26px; height: 26px; border-radius: 4px; }
    .flag { width: 18px; height: 13px; border-radius: 2px; }
    .crest img,
    .flag img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .market-chip {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 6px;
      border: 1px solid color-mix(in oklab, var(--primary) 28%, var(--border-dim));
      border-radius: 3px;
      background: color-mix(in oklab, var(--primary) 10%, transparent);
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .metric-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
    .metric-box {
      min-width: 0;
      padding: 6px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: var(--background);
    }
    .metric-box span { display: block; margin-bottom: 3px; color: var(--muted-foreground); font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; }
    .metric-box b { color: var(--foreground); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .meter { height: 4px; overflow: hidden; border-radius: 2px; background: var(--border-dim); }
    .meter span { display: block; height: 100%; background: var(--primary); }
    .parlay-card { min-height: 244px; }
    .leg-row {
      padding: 6px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: color-mix(in oklab, var(--secondary) 42%, transparent);
    }
    .leg-row .team-name { font-size: 10px; }
    .leg-meta { text-align: right; font-variant-numeric: tabular-nums; }
    .metric-card,
    .daily-card,
    .recommendation-card {
      min-width: 0;
      border: 1px solid var(--border-dim);
      border-radius: var(--radius);
      background: var(--card);
    }
    .metric-card,
    .daily-card { display: grid; gap: 8px; padding: 8px; }
    .metric-card-head,
    .daily-card-head,
    .recommendation-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .recommendation-card {
      display: grid;
      gap: 7px;
      padding: 8px;
      cursor: pointer;
    }
    .recommendation-card:hover { border-color: var(--border); background: color-mix(in oklab, var(--secondary) 42%, transparent); }
    .recommendation-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
    .daily-grid { width: 100%; display: grid; gap: 8px; padding: 8px; overflow: auto; }
    .daily-host { overflow: auto; display: block; }
    .daily-meta,
    .recommendation-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 5px;
    }
    .daily-meta span,
    .recommendation-meta span {
      min-width: 0;
      padding: 6px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: var(--background);
      color: var(--muted-foreground);
      font-size: 9px;
      overflow-wrap: anywhere;
    }
    .daily-meta b,
    .recommendation-meta b { display: block; color: var(--foreground); font-size: 13px; font-variant-numeric: tabular-nums; }
    .rec-leg-list { display: grid; gap: 4px; }
    .rec-leg {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      padding: 5px;
      border: 1px solid var(--border-dim);
      border-radius: 3px;
      background: color-mix(in oklab, var(--secondary) 40%, transparent);
    }
    .rec-leg b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty,
    .loading,
    .error {
      display: grid;
      place-items: center;
      min-height: 120px;
      flex: 1;
      padding: 16px;
      color: var(--muted-foreground);
      font-family: var(--font-mono);
      font-size: 10px;
      text-align: center;
    }
    .error { color: var(--negative); }

    @keyframes dashboard-module {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .module-shell,
    .stat { animation: dashboard-module 0.18s ease both; }

    @media (max-width: 1180px) {
      body { overflow: auto; }
      .shell { height: auto; min-height: 100vh; overflow: visible; }
      .main { grid-template-columns: 1fr; grid-template-rows: auto auto auto; overflow: visible; }
      .filters-surface,
      .stats,
      .content,
      .tabs { grid-column: 1; grid-row: auto; }
      .filters-surface { max-height: none; }
      .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tabs { align-self: auto; }
      .content { padding-top: 0; grid-template-columns: 1fr; overflow: visible; }
      .exploration-strip { grid-template-columns: 1fr; align-items: stretch; }
      .explore-actions { justify-content: flex-start; }
      .panel { min-height: 320px; }
    }
    @media (max-width: 680px) {
      header,
      .brand,
      .hero-actions { align-items: flex-start; flex-direction: column; }
      .brand { gap: 4px; }
      .lede { display: block; margin: 2px 0 0; }
      .filters-grid,
      .stats,
      .tabs { grid-template-columns: 1fr; }
      .shell { padding: 4px; }
    }
  </style>
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
            <button class="icon-btn" data-date-preset="yesterday" title="Filtrar ayer" type="button">Ayer</button>
            <button class="icon-btn" data-date-preset="today" title="Filtrar hoy" type="button">Hoy</button>
            <button class="icon-btn" data-date-preset="tomorrow" title="Filtrar mañana" type="button">Mañana</button>
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
        <aside class="panel module-shell">
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
        metrics: 'Métricas',
        daily: 'Daily',
      };
      const KIND_TO_TAB = {
        fixture: 'fixtures',
        prediction: 'predictions',
        parlay: 'parlays',
        validation: 'validations',
        run: 'runs',
        metric: 'metrics',
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
        metrics: [
          ['Fecha', 'metricDate'],
          ['Scope', 'scope'],
          ['Zona', 'timezone'],
          ['Generado', 'generatedAt'],
        ],
        daily: [
          ['Creado', 'createdAt'],
          ['Estado', 'status'],
          ['Veredicto', 'verdict'],
          ['Inicio', 'startedAt'],
          ['Fin', 'completedAt'],
        ],
      };
      const ALLOWED_TABS = ['fixtures', 'predictions', 'parlays', 'validations', 'runs', 'metrics', 'daily'];
      const DEFAULT_SORT_BY = {
        fixtures: 'scheduledAt',
        predictions: 'generatedAt',
        parlays: 'generatedAt',
        validations: 'evaluatedAt',
        runs: 'createdAt',
        metrics: 'metricDate',
        daily: 'createdAt',
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
          targetId: '',
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
      const fmtRate = (value, digits = 1) => value == null || Number.isNaN(Number(value)) ? 'n/a' : Number(value).toFixed(digits) + '%';
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
      const initials = (value, fallback = '?') => {
        const text = String(value || '').trim();
        if (!text) return fallback;
        const parts = text.split(/\s+/).filter(Boolean);
        return (parts.length > 1 ? parts[0][0] + parts[1][0] : text.slice(0, 2)).toUpperCase();
      };
      const assetBadge = (url, label, className) => {
        const fallback = initials(label);
        return '<span class="' + esc(className) + '" title="' + esc(label || '') + '">' +
          (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="' + esc(fallback) + '" onerror="this.replaceWith(document.createTextNode(this.dataset.fallback || \'\'))">' : esc(fallback)) +
          '</span>';
      };
      const teamName = (team, fallback) => team?.name || fallback;
      const teamLine = (team, fallback) => {
        const name = teamName(team, fallback);
        return '<div class="team-name">' + assetBadge(team?.logoUrl, name, 'crest') + '<span title="' + esc(name) + '">' + esc(name) + '</span></div>';
      };
      const countryLine = (fixture) => {
        const competition = fixture?.competition;
        if (!competition) return '';
        const country = competition.country || competition.name || '';
        return '<div class="sub">' + (competition.flagUrl ? assetBadge(competition.flagUrl, country, 'flag') + ' ' : '') +
          esc([competition.name, competition.country].filter(Boolean).join(' · ')) + '</div>';
      };
      const matchBlock = (fixture) => {
        if (!fixture) return '<div class="team-stack"><div class="team-name">' + assetBadge(null, 'Sin fixture', 'crest') + '<span>Sin fixture</span></div></div>';
        return '<div class="team-stack">' +
          '<div class="team-row">' + teamLine(fixture.homeTeam, 'Local') + '<span class="sub">' + esc(fixture.scoreHome ?? '') + '</span></div>' +
          '<div class="team-row">' + teamLine(fixture.awayTeam, 'Visita') + '<span class="sub">' + esc(fixture.scoreAway ?? '') + '</span></div>' +
          countryLine(fixture) +
        '</div>';
      };
      const selectionLabel = (row) => esc(row.selectionKey) + (row.line == null ? '' : ' ' + esc(row.line));
      const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
      const metricBox = (label, value, meterValue) => '<div class="metric-box"><span>' + esc(label) + '</span><b>' + value + '</b>' +
        (meterValue == null ? '' : '<div class="meter"><span style="width:' + (clamp01(meterValue) * 100).toFixed(1) + '%"></span></div>') + '</div>';
      const warningCount = (value) => Array.isArray(value) ? value.length : value ? 1 : 0;
      const selectedClass = (kind, id) => state.selectedKind === kind && state.selectedId === id ? ' selected' : '';
      const hasText = (value) => String(value ?? '').trim().length > 0;

      function sanitizeText(value) {
        return hasText(value) ? String(value).trim() : '';
      }

      function localDateString(offsetDays) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
      }

      function applyDatePreset(preset) {
        const offset = preset === 'tomorrow' ? 1 : preset === 'yesterday' ? -1 : 0;
        const date = localDateString(offset);
        state.page = 1;
        state.selectedKind = null;
        state.selectedId = null;
        state.filters.dateFrom = date;
        state.filters.dateTo = date;
        writeForm();
        load();
      }

      function applyTheme(theme) {
        state.theme = 'dark';
        document.documentElement.dataset.theme = 'dark';
        const toggle = $('#theme-toggle');
        if (toggle) {
          toggle.textContent = 'HUD';
          toggle.title = 'Tema GANA V7 fijo';
        }
        try {
          localStorage.setItem('gana-dashboard-theme', 'dark');
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
        if (['scheduled', 'live', 'candidate', 'draft', 'created', 'queued'].includes(normalized)) return 'info';
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
        if (state.filters.targetId) params.set('targetId', state.filters.targetId);
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
        const maxTake = state.metadata?.takeOptions?.length ? Math.max(...state.metadata.takeOptions) : 200;
        state.take = Math.min(state.take, maxTake);

        state.sort = params.get('sort') || '';
        state.direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
        const availableSorts = state.metadata?.sortOptions?.[state.tab];
        if (availableSorts && availableSorts.length && !availableSorts.includes(state.sort)) {
          state.sort = availableSorts[0] || '';
        }

        state.filters.dateFrom = params.get('dateFrom') || '';
        state.filters.dateTo = params.get('dateTo') || '';
        state.filters.validationTarget = normalizeValidationTarget(params.get('validationTarget'));
        state.filters.targetId = sanitizeText(params.get('targetId'));
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
        $('#list').className = 'table-host';
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
          const totalPages = Math.max(1, Number(body.pagination?.totalPages) || 1);
          state.page = Number(body.page) || state.page;

          if (state.page > totalPages) {
            state.page = totalPages;
            state.loading = false;
            return load();
          }

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
          $('#list').className = 'empty';
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
        renderExplorationStrip();
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
            const active = state.filters.status.includes(status) ? ' active' : '';
            return '<article class="stat' + active + '" data-metric-kind="status" data-metric-value="' + esc(status) + '">' +
              '<span class="muted">' + esc(status) + '</span><b>' + count + '</b></article>';
          }));
        } else {
          cards.push('<article class="stat' + (state.tab === 'fixtures' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="fixtures"><span class="muted">Partidos</span><b>' + state.data.counts.fixtures + '</b></article>');
          cards.push('<article class="stat' + (state.tab === 'predictions' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="predictions"><span class="muted">Predicciones</span><b>' + state.data.counts.predictions + '</b></article>');
          cards.push('<article class="stat' + (state.tab === 'parlays' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="parlays"><span class="muted">Parlays</span><b>' + state.data.counts.parlays + '</b></article>');
          cards.push('<article class="stat' + (state.tab === 'validations' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="validations"><span class="muted">Validaciones</span><b>' + state.data.counts.validations + '</b></article>');
          cards.push('<article class="stat' + (state.tab === 'runs' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="runs"><span class="muted">Runs</span><b>' + state.data.counts.runs + '</b></article>');
          cards.push('<article class="stat' + (state.tab === 'metrics' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="metrics"><span class="muted">Métricas</span><b>' + state.data.counts.metrics + '</b></article>');
          cards.push('<article class="stat' + (state.tab === 'daily' ? ' active' : '') + '" data-metric-kind="tab" data-metric-value="daily"><span class="muted">Daily</span><b>' + state.data.counts.daily + '</b></article>');
        }
        $('#stats').innerHTML = cards.join('');
      }

      function optionLabel(name, value) {
        if (!value) return '';
        const input = document.querySelector('[name=' + JSON.stringify(name) + ']');
        if (input instanceof HTMLSelectElement) {
          const option = [...input.options].find((item) => item.value === value);
          return option?.textContent || value;
        }
        return value;
      }

      function compactId(id) {
        const text = String(id || '');
        return text.length > 18 ? text.slice(0, 8) + '…' + text.slice(-6) : text;
      }

      function activeFilterChips() {
        const chips = [];
        const chip = (key, label, value) => {
          if (!hasText(value)) return;
          chips.push('<span class="context-chip" data-filter-key="' + esc(key) + '">' +
            esc(label) + ': <strong>' + esc(value) + '</strong><button title="Quitar filtro" data-clear-filter="' + esc(key) + '" type="button">×</button></span>');
        };
        if (state.filters.dateFrom || state.filters.dateTo) {
          chip('date', 'Fecha', (state.filters.dateFrom || '…') + ' → ' + (state.filters.dateTo || '…'));
        }
        chip('run', 'Run', compactId(state.filters.runId));
        if (state.filters.status.length) chip('status', 'Status', state.filters.status.join(', '));
        chip('market', 'Mercado', optionLabel('market', state.filters.market));
        chip('team', 'Equipo', optionLabel('team', state.filters.team));
        chip('competition', 'Competencia', optionLabel('competition', state.filters.competition));
        if (state.filters.quality.length) chip('quality', 'Calidad', state.filters.quality.join(', '));
        if (state.filters.minConfidence || state.filters.maxConfidence) {
          chip('confidence', 'Conf.', (state.filters.minConfidence || '0') + ' - ' + (state.filters.maxConfidence || '1'));
        }
        if (state.filters.minEdge || state.filters.maxEdge) {
          chip('edge', 'Edge', (state.filters.minEdge || 'min') + ' - ' + (state.filters.maxEdge || 'max'));
        }
        if (state.filters.validationTarget !== 'all') {
          const target = state.filters.validationTarget === 'prediction' ? 'Atómica' : 'Parlay';
          chip('target', 'Objetivo', state.filters.targetId ? target + ' ' + compactId(state.filters.targetId) : target);
        }
        return chips;
      }

      function renderExplorationStrip() {
        const container = $('#exploration-strip');
        if (!container) return;
        const chips = activeFilterChips();
        const chipHtml = chips.length
          ? chips.join('')
          : '<span class="context-chip">Vista <strong>' + esc(TAB_LABELS[state.tab] || state.tab) + '</strong></span>';
        container.innerHTML = '<div class="active-chips">' + chipHtml + '</div>' +
          '<div class="explore-actions">' +
            '<button class="icon-btn" data-quick-view="top-edge" type="button">Top edge</button>' +
            '<button class="icon-btn" data-quick-view="high-confidence" type="button">Alta confianza</button>' +
            '<button class="icon-btn" data-quick-view="validation-watch" type="button">Validar</button>' +
            '<button class="icon-btn" data-clear-filter="all" type="button">Limpiar</button>' +
          '</div>';
      }

      function clearFilter(key) {
        if (key === 'all') {
          state.filters = {
            validationTarget: 'all',
            targetId: '',
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
          };
        }
        if (key === 'date') {
          state.filters.dateFrom = '';
          state.filters.dateTo = '';
        }
        if (key === 'run') state.filters.runId = '';
        if (key === 'status') state.filters.status = [];
        if (key === 'market') state.filters.market = '';
        if (key === 'team') state.filters.team = '';
        if (key === 'competition') state.filters.competition = '';
        if (key === 'quality') state.filters.quality = [];
        if (key === 'confidence') {
          state.filters.minConfidence = '';
          state.filters.maxConfidence = '';
        }
        if (key === 'edge') {
          state.filters.minEdge = '';
          state.filters.maxEdge = '';
        }
        if (key === 'target') {
          state.filters.validationTarget = 'all';
          state.filters.targetId = '';
        }
        state.page = 1;
        state.selectedKind = null;
        state.selectedId = null;
        writeForm();
        renderExplorationStrip();
        load();
      }

      function setScopedStatuses(tab, candidates) {
        const allowed = state.metadata?.statuses?.[tab] || [];
        state.filters.status = candidates.filter((status) => allowed.includes(status));
      }

      function applyQuickView(view) {
        state.page = 1;
        state.selectedKind = null;
        state.selectedId = null;
        state.filters.targetId = '';
        if (view === 'top-edge') {
          state.tab = 'predictions';
          state.sort = 'edge';
          state.direction = 'desc';
          state.filters.status = [];
          state.filters.minEdge = '0.03';
          state.filters.minConfidence = '';
          state.filters.validationTarget = 'all';
        }
        if (view === 'high-confidence') {
          state.tab = 'predictions';
          state.sort = 'confidence';
          state.direction = 'desc';
          state.filters.status = [];
          state.filters.minConfidence = '0.75';
          state.filters.minEdge = '';
          state.filters.validationTarget = 'all';
        }
        if (view === 'parlay-ready') {
          state.tab = 'parlays';
          state.sort = 'aggregateQuality';
          state.direction = 'desc';
          setScopedStatuses('parlays', ['promotable', 'candidate', 'review-required']);
          state.filters.validationTarget = 'all';
        }
        if (view === 'validation-watch') {
          state.tab = 'validations';
          state.sort = 'evaluatedAt';
          state.direction = 'desc';
          state.filters.validationTarget = 'all';
          setScopedStatuses('validations', ['pending', 'error', 'blocked', 'lost']);
        }
        renderFiltersByTab();
        writeForm();
        load();
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
        const sortInput = $('[name="sort"]');
        if (sortInput instanceof HTMLSelectElement) {
          const sortOptions = state.metadata.sortOptions[state.tab] || [];
          sortInput.innerHTML = sortOptions.map((value) => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
          if (!sortOptions.includes(state.sort)) state.sort = sortOptions[0] || DEFAULT_SORT_BY[state.tab];
        }
        writeForm();
      }

      function renderList() {
        if (!state.data) {
          $('#list').className = 'empty';
          $('#list').innerHTML = '<div class="empty">Sin datos para mostrar</div>';
          return;
        }

        const rows = rowsForActiveTab();
        const total = state.data.pagination?.total || 0;
        $('#section-count').textContent = rows.length + ' visibles de ' + total;
        if (!rows.length) {
          $('#list').className = 'empty';
          $('#list').innerHTML = '<div class="empty">No hay datos para los filtros actuales.</div>';
          return;
        }
        $('#list').className = 'table-host';
        if (state.tab === 'fixtures') return renderFixtureRows(rows);
        if (state.tab === 'predictions') return renderPredictionRows(rows);
        if (state.tab === 'parlays') return renderParlayRows(rows);
        if (state.tab === 'validations') return renderValidationRows(rows);
        if (state.tab === 'runs') return renderRunRows(rows);
        if (state.tab === 'metrics') return renderMetricRows(rows);
        if (state.tab === 'daily') return renderDailyRows(rows);
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
        if (state.tab === 'metrics') return state.data.metrics || [];
        if (state.tab === 'daily') return state.data.daily || [];
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
        $('#list').className = 'card-grid';
        $('#list').innerHTML = rows.map((row) => {
          const validation = row.latestValidation ? badge(row.latestValidation.status) : '<span class="muted-inline">Sin validación</span>';
          const warningLabel = warningCount(row.warnings) ? '<span class="badge warn">' + warningCount(row.warnings) + ' warnings</span>' : '';
          return '<article class="entity-card' + selectedClass('prediction', row.id) + '" data-kind="prediction" data-id="' + esc(row.id) + '">' +
            '<div class="card-head"><div><span class="market-chip">' + esc(row.marketKey) + ' · ' + selectionLabel(row) + '</span><div class="sub">' + esc(row.quality || 'quality') + ' · ' + fmtDate(row.generatedAt) + '</div></div>' +
            '<div>' + badge(row.status) + '</div></div>' +
            matchBlock(row.fixture) +
            '<div class="card-body">' +
              '<div class="metric-strip">' +
                metricBox('Odds', esc(fmtNum(row.odds)), null) +
                metricBox('Edge', esc(fmtPct(row.edge, 1)), row.edge) +
                metricBox('Conf.', esc(fmtPct(row.confidence, 1)), row.confidence) +
              '</div>' +
              '<div class="metric-row"><span class="sub">Implied ' + esc(fmtPct(row.impliedProbability, 1)) + ' · Modelo ' + esc(fmtPct(row.estimatedProbability, 1)) + '</span>' + validation + '</div>' +
            '</div>' +
            '<div class="card-foot"><span class="mono">' + esc(row.id) + '</span><span>' + warningLabel + '</span></div>' +
          '</article>';
        }).join('');
      }

      function renderParlayRows(rows) {
        $('#list').className = 'card-grid';
        $('#list').innerHTML = rows.map((row) => {
          const validation = row.latestValidation ? badge(row.latestValidation.status) : '<span class="muted-inline">Sin validación</span>';
          const legs = row.legs.slice(0, 4).map((leg) => '<div class="leg-row">' +
            '<div>' + teamLine(leg.fixture?.homeTeam, 'Local') + '<div class="sub">' + esc(matchName(leg.fixture)) + '</div></div>' +
            '<div class="leg-meta"><b>' + esc(fmtNum(leg.odds)) + '</b><div class="sub">' + esc(leg.marketKey) + ' · ' + selectionLabel(leg) + '</div>' +
            '<button class="chip-btn crosslink" data-kind="prediction" data-id="' + esc(leg.predictionId) + '" type="button">Abrir</button></div>' +
          '</div>').join('');
          return '<article class="entity-card parlay-card' + selectedClass('parlay', row.id) + '" data-kind="parlay" data-id="' + esc(row.id) + '">' +
            '<div class="card-head"><div><span class="market-chip">' + esc(row.legs.length) + ' legs · parlay</span><div class="sub">' + fmtDate(row.generatedAt) + '</div></div><div>' + badge(row.status) + '</div></div>' +
            '<div class="card-body">' +
              '<div class="metric-strip">' +
                metricBox('Odds', esc(fmtNum(row.combinedOdds)), null) +
                metricBox('Conf.', esc(fmtPct(row.aggregateConfidence, 1)), row.aggregateConfidence) +
                metricBox('Calidad', esc(fmtPct(row.aggregateQuality, 1)), row.aggregateQuality) +
              '</div>' +
              '<div class="metric-row"><span class="sub mono">' + esc(row.id) + '</span>' + validation + '</div>' +
            '</div>' +
            '<div class="leg-list">' + legs + (row.legs.length > 4 ? '<span class="muted-inline">+' + (row.legs.length - 4) + ' legs más</span>' : '') + '</div>' +
            '<div class="card-foot"><span class="sub">' + esc((row.rationale || '').slice(0, 96)) + '</span></div>' +
          '</article>';
        }).join('');
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

      function renderMetricRows(rows) {
        $('#list').className = 'card-grid';
        $('#list').innerHTML = rows.map((row) => {
          const pred = row.predictionMetrics || {};
          const parlay = row.parlayMetrics || {};
          const charts = row.chartMetrics || {};
          return '<article class="metric-card" data-kind="metric" data-id="' + esc(row.id) + '">' +
            '<div class="metric-card-head"><div><span class="market-chip">' + esc(row.metricDate) + ' · ' + esc(row.scope) + '</span><div class="sub">' + esc(row.timezone) + ' · generado ' + fmtDate(row.generatedAt) + '</div></div></div>' +
            '<div class="detail-card"><h4>Predicciones</h4>' + compactMetricSummary(pred) + '</div>' +
            '<div class="detail-card"><h4>Parlays</h4>' + compactMetricSummary(parlay) + '</div>' +
            renderMetricCharts(charts) +
          '</article>';
        }).join('');
      }

      function metricSummary(metrics) {
        return '<div><b>' + esc(metrics.total ?? 0) + '</b> total</div>' +
          '<div class="sub">' + esc(metrics.won ?? 0) + '-' + esc(metrics.lost ?? 0) + ' · hit ' + fmtRate(metrics.hitRate) + '</div>' +
          '<div class="sub">odds ' + fmtNum(metrics.avgOdds) + ' · conf. ' + fmtPct(metrics.avgConfidence, 1) + '</div>';
      }

      function compactMetricSummary(metrics) {
        return '<div class="metric-strip">' +
          metricBox('Total', esc(metrics.total ?? 0), null) +
          metricBox('Hit', esc(fmtRate(metrics.hitRate)), (Number(metrics.hitRate) || 0) / 100) +
          metricBox('Conf.', esc(fmtPct(metrics.avgConfidence, 1)), metrics.avgConfidence) +
        '</div><div class="sub">W-L ' + esc(metrics.won ?? 0) + '-' + esc(metrics.lost ?? 0) + ' · odds ' + fmtNum(metrics.avgOdds) + '</div>';
      }

      function renderMetricCharts(charts) {
        return '<div class="metric-charts">' +
          renderBarChart('Parlay perfil', charts.parlayHitRateByProfile || []) +
          renderBarChart('Parlay provider', charts.parlayHitRateByProvider || []) +
          renderBarChart('Parlay odds', charts.parlayHitRateByOddsBucket || []) +
          renderBarChart('Pred. provider', charts.predictionHitRateByProvider || []) +
          renderBarChart('Pred. mercado', charts.predictionHitRateByMarket || []) +
          '</div>';
      }

      function legDisplayName(leg) {
        const display = leg?.display || {};
        return display.fixtureLabel || leg?.fixture || [display.homeTeamName, display.awayTeamName].filter(Boolean).join(' vs ') || 'Leg';
      }

      function exposureSummary(exposure) {
        if (!exposure || typeof exposure !== 'object') return 'n/a';
        const units = exposure.units == null ? 'n/a' : fmtNum(exposure.units, 2);
        const pct = exposure.percentOfAnalyticalBankroll ?? exposure.percentOfBankroll;
        return units + 'u' + (pct == null ? '' : ' · ' + fmtPct(pct, 1));
      }

      function renderRecommendationCard(rec) {
        const targetAttrs = rec.parlayId ? ' data-kind="parlay" data-id="' + esc(rec.parlayId) + '"' : '';
        const legs = (rec.legs || []).slice(0, 3).map((leg) => '<div class="rec-leg">' +
          '<div><b title="' + esc(legDisplayName(leg)) + '">' + esc(legDisplayName(leg)) + '</b><div class="sub">' +
            esc([leg.market, leg.selection, leg.line == null ? '' : leg.line].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div class="leg-meta"><b>' + esc(fmtNum(leg.odds)) + '</b><div class="sub">' + esc(leg.banker ? 'banker' : leg.validationStatus || '') + '</div></div>' +
        '</div>').join('');
        const bankers = (rec.bankerLegs || []).slice(0, 2).map((leg) => legDisplayName(leg)).join(' · ');
        return '<article class="recommendation-card"' + targetAttrs + '>' +
          '<div class="recommendation-head"><div><span class="market-chip">#' + esc(rec.rank) + ' ' + esc(rec.profile || rec.family || 'parlay') + '</span><div class="sub mono">' + esc(rec.parlayId || rec.sourceRunId || '') + '</div></div>' + badge(rec.status || 'review-required') + '</div>' +
          '<div class="recommendation-meta">' +
            '<span>odds <b>' + esc(fmtNum(rec.combinedOdds)) + '</b></span>' +
            '<span>conf <b>' + esc(fmtPct(rec.aggregateConfidence, 1)) + '</b></span>' +
            '<span>edge <b>' + esc(fmtPct(rec.expectedEdge, 1)) + '</b></span>' +
            '<span>score <b>' + esc(fmtNum(rec.score, 2)) + '</b></span>' +
          '</div>' +
          '<div class="sub">Prob. ajustada ' + esc(fmtPct(rec.adjustedProbability, 1)) + ' · exposición ' + esc(exposureSummary(rec.exposure)) + '</div>' +
          (bankers ? '<div class="sub">Bankers: ' + esc(bankers) + '</div>' : '') +
          '<div class="rec-leg-list">' + (legs || '<span class="muted-inline">Sin legs en artifact</span>') + '</div>' +
          '<div class="sub">' + esc((rec.reasons || []).slice(0, 2).join(' · ') || (rec.riskFlags || []).slice(0, 3).join(' · ') || 'sin razones') + '</div>' +
        '</article>';
      }

      function renderDailyRows(rows) {
        const headers = TAB_SORT_HEADERS.daily;
        const sort = state.sort;
        $('#list').className = 'table-host daily-host';
        $('#list').innerHTML = '<div class="daily-grid">' + rows.map((row) => {
          const counts = row.counts || {};
          const comparison = row.providerComparison?.summary || {};
          const consensus = row.providerConsensus || {};
          const recs = row.recommendations || [];
          const familyCounts = counts.parlayFamilies || {};
          const familyText = Object.entries(familyCounts).map(([family, value]) => family + ': ' + ((value && value.persistedParlays) || 0)).join(' · ');
          const cards = recs.slice(0, 6).map(renderRecommendationCard).join('');
          return '<article class="daily-card" data-kind="run" data-id="' + esc(row.id) + '">' +
            '<div class="daily-card-head"><div><b>' + esc(row.date || row.id) + '</b><div class="sub mono">' + esc(row.id) + '</div></div><div>' + badge(row.status) + ' ' + esc(row.verdict || '') + '</div></div>' +
            '<div class="daily-meta">' +
              '<span>providers <b>' + esc(row.providerAgentic || 'n/a') + '</b></span>' +
              '<span>consenso <b>' + esc(consensus.consensusPredictions ?? 0) + '</b></span>' +
              '<span>agreement <b>' + fmtRate(comparison.agreementRate == null ? null : comparison.agreementRate * 100) + '</b></span>' +
              '<span>recs <b>' + esc(recs.length) + '</b></span>' +
            '</div>' +
            '<div class="sub">' + esc(familyText || 'sin familias de parlay') + '</div>' +
            '<div class="recommendation-grid">' + (cards || '<span class="muted-inline">Sin recomendaciones</span>') + '</div>' +
            '<div class="sub">Artifact analítico. No ejecuta apuestas ni garantiza resultados.</div>' +
          '</article>';
        }).join('') + '</div><div class="table-wrap daily-table"><table><thead><tr>' +
          headers.map(([label, field]) => '<th><button class="sort" data-sort="' + esc(field) + '"><span>' + esc(label) + '</span><span>' +
            (sort === field ? (state.direction === 'asc' ? '▲' : '▼') : '') + '</span></button></th>').join('') +
          '<th>Batch</th><th>Comparación</th></tr></thead><tbody>' +
          rows.map((row) => {
            const comparison = row.providerComparison?.summary || {};
            return '<tr data-kind="run" data-id="' + esc(row.id) + '"><td>' + fmtDate(row.createdAt) + '</td><td>' + badge(row.status) +
              '</td><td>' + esc(row.verdict || '—') + '</td><td>' + fmtDate(row.startedAt) + '</td><td>' + fmtDate(row.completedAt) +
              '</td><td><div>' + esc(row.date || '—') + '</div><div class="sub">' + esc(row.providerAgentic || '—') + '</div></td><td>' +
              esc((comparison.sameSelection ?? 0) + ' same · ' + (comparison.materialDisagreements ?? comparison.sameMarketDifferentSelection ?? 0) + ' discrep · ' + (comparison.onlyCodex ?? 0) + '/' + (comparison.onlyGemini ?? 0) + ' solo') +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }

      function renderBarChart(title, rows) {
        const bars = rows.slice(0, 6).map((row) => {
          const value = Number(row.hitRate ?? 0);
          const width = Math.max(0, Math.min(100, value));
          const label = row.label || row.key || 'n/a';
          return '<div class="bar-row"><span title="' + esc(label) + '">' + esc(compactText(label, 14)) + '</span>' +
            '<span class="bar-track"><span class="bar-fill" style="width:' + width.toFixed(1) + '%"></span></span>' +
            '<span>' + fmtRate(row.hitRate, 0) + '</span></div>';
        }).join('');
        return '<div class="metric-chart"><h4>' + esc(title) + '</h4>' + (bars || '<span class="muted-inline">Sin datos</span>') + '</div>';
      }

      function compactText(value, max) {
        const text = String(value || '');
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
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

      function formatJsonBlock(value) {
        if (value == null || value === '') return '';
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      }

      function normalizeWarnings(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean).map((item) => typeof item === 'string' ? item : formatJsonBlock(item));
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed || trimmed === '[]') return [];
          try {
            const parsed = JSON.parse(trimmed);
            return normalizeWarnings(parsed);
          } catch {
            return [trimmed];
          }
        }
        if (typeof value === 'object') return [formatJsonBlock(value)];
        return [String(value)];
      }

      function renderWarningsCard(data) {
        const warnings = normalizeWarnings(data?.warnings);
        if (!warnings.length) return '';
        return '<div class="detail-card"><h4>Warnings auditados</h4><div class="detail-list">' + warnings.map((warning) =>
          '<div class="detail-line"><span class="sub">' + esc(warning) + '</span></div>'
        ).join('') + '</div></div>';
      }

      function renderOutcomeCard(data) {
        if (!data?.outcome) return '';
        return '<div class="detail-card"><h4>Outcome / settlement</h4><pre class="json-card">' + esc(formatJsonBlock(data.outcome)) + '</pre></div>';
      }

      function renderEntityActions(kind, data) {
        if (!data) return '';
        const actions = [];
        if (data.runId) actions.push('<button class="chip-btn" data-scope-filter="run" data-run-id="' + esc(data.runId) + '" type="button">Filtrar run</button>');
        if (kind === 'fixture') {
          actions.push('<button class="chip-btn" data-scope-filter="fixture" data-kind="fixture" data-id="' + esc(data.id) + '" type="button">Explorar partido</button>');
        }
        if (kind === 'prediction') {
          if (data.fixture?.id) actions.push('<button class="chip-btn crosslink" data-kind="fixture" data-id="' + esc(data.fixture.id) + '" type="button">Ver partido</button>');
          actions.push('<button class="chip-btn" data-open-validations-target="prediction" data-target-id="' + esc(data.id) + '" type="button">Validaciones</button>');
        }
        if (kind === 'parlay') {
          actions.push('<button class="chip-btn" data-open-validations-target="parlay" data-target-id="' + esc(data.id) + '" type="button">Validaciones</button>');
        }
        if (kind === 'validation') {
          const target = validationTargetForRow(data);
          if (target.kind && target.id) actions.push('<button class="chip-btn crosslink" data-kind="' + esc(target.kind) + '" data-id="' + esc(target.id) + '" type="button">Ver ' + esc(target.label) + '</button>');
        }
        return actions.length ? '<div class="entity-actions">' + actions.join('') + '</div>' : '';
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
        sections.push(renderEntityActions(kind, data));
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
          if (Array.isArray(data.validationHistory) && data.validationHistory.length) {
            sections.push('<div class="detail-card"><h4>Historial de validación</h4><div class="detail-list">' + data.validationHistory.map(renderMiniValidation).join('') + '</div></div>');
          }
          if (data.rationale) sections.push('<div class="detail-card"><h4>Rationale</h4><div class="rationale">' + esc(data.rationale) + '</div></div>');
        }
        if (kind === 'parlay') {
          sections.push('<div class="insight-grid">' +
            '<div class="insight"><span>Odds combinadas</span><b>' + esc(fmtNum(data.combinedOdds)) + '</b></div>' +
            '<div class="insight"><span>Confianza</span><b>' + esc(fmtPct(data.aggregateConfidence, 1)) + '</b></div>' +
            '<div class="insight"><span>Calidad</span><b>' + esc(fmtPct(data.aggregateQuality, 1)) + '</b></div>' +
            '</div>');
          if (data.latestValidation) sections.push(kv('Última validación', badge(data.latestValidation.status) + ' ' + esc(data.latestValidation.reason || '')));
          if (Array.isArray(data.validationHistory) && data.validationHistory.length) {
            sections.push('<div class="detail-card"><h4>Historial de validación</h4><div class="detail-list">' + data.validationHistory.map(renderMiniValidation).join('') + '</div></div>');
          }
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
        if (kind === 'metric') {
          const pred = data.predictionMetrics || {};
          const parlay = data.parlayMetrics || {};
          sections.push('<div class="insight-grid">' +
            '<div class="insight"><span>Pred hit</span><b>' + esc(fmtRate(pred.hitRate)) + '</b></div>' +
            '<div class="insight"><span>Parlay hit</span><b>' + esc(fmtRate(parlay.hitRate)) + '</b></div>' +
            '<div class="insight"><span>Scope</span><b>' + esc(data.scope || 'all') + '</b></div>' +
            '</div>');
          sections.push(kv('Fecha métrica', esc(data.metricDate || '—')));
          sections.push(kv('Ventana', esc(fmtDate(data.sourceWindowStart) + ' → ' + fmtDate(data.sourceWindowEnd))));
          sections.push('<div class="detail-card"><h4>Predicciones</h4>' + compactMetricSummary(pred) + '</div>');
          sections.push('<div class="detail-card"><h4>Parlays</h4>' + compactMetricSummary(parlay) + '</div>');
          sections.push('<div class="detail-card"><h4>Charts</h4>' + renderMetricCharts(data.chartMetrics || {}) + '</div>');
        }
        if (kind === 'validation') {
          const target = validationTarget || validationTargetForRow(data);
          sections.push(kv('Pertenece a', esc(target.summary || '—')));
          sections.push(kv('ID objetivo', target.id && target.kind
            ? '<span class=\"crosslink mono\" data-kind=\"' + esc(target.kind) + '\" data-id=\"' + esc(target.id) + '\">' + esc(target.id) + '</span>'
            : '—'));
        }
        if (data.status) sections.push(kv('Estado', badge(data.status)));
        sections.push(renderWarningsCard(data));
        sections.push(renderOutcomeCard(data));
        if (data.runId) sections.push(kv('Run', '<span class=\"crosslink\" data-kind=\"run\" data-id=\"' + esc(data.runId) + '\">' + esc(data.runId) + '</span>'));
        if (links && links.length) {
          sections.push('<div class=\"muted\" style=\"margin-top:6px\">Relaciones</div>' + links);
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
        if (Array.isArray(body.validationHistory)) {
          entity.validationHistory = body.validationHistory;
        }
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

      async function applyRunScopeFilter(runId) {
        if (!runId) return;
        state.filters.runId = runId;
        state.page = 1;
        state.selectedKind = null;
        state.selectedId = null;
        writeForm();
        await load();
      }

      async function openValidationsForTarget(targetKind, targetId) {
        state.tab = 'validations';
        state.page = 1;
        state.selectedKind = null;
        state.selectedId = null;
        state.filters.validationTarget = normalizeValidationTarget(targetKind);
        state.filters.targetId = sanitizeText(targetId);
        state.filters.market = '';
        state.filters.quality = [];
        state.filters.minConfidence = '';
        state.filters.maxConfidence = '';
        state.filters.minEdge = '';
        state.filters.maxEdge = '';
        state.sort = 'evaluatedAt';
        state.direction = 'desc';
        renderFiltersByTab();
        await load();
      }

      async function openFixtureExploration(fixtureId) {
        if (!fixtureId) return;
        state.tab = 'predictions';
        state.page = 1;
        state.selectedKind = 'fixture';
        state.selectedId = fixtureId;
        state.sort = 'generatedAt';
        state.direction = 'desc';
        renderFiltersByTab();
        await load();
        await loadEntity('fixture', fixtureId).catch(() => {});
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
        if (state.filters.validationTarget === 'all') state.filters.targetId = '';
        state.filters.status = readSelectValues('status');
        state.filters.quality = readSelectValues('quality');
        state.filters.minConfidence = sanitizeText(readText('minConfidence'));
        state.filters.maxConfidence = sanitizeText(readText('maxConfidence'));
        state.filters.minEdge = sanitizeText(readText('minEdge'));
        state.filters.maxEdge = sanitizeText(readText('maxEdge'));
        state.sort = readText('sort') || state.sort;
        const nextTake = Number(readText('take'));
        if (Number.isFinite(nextTake)) {
          const maxTake = state.metadata?.takeOptions?.length ? Math.max(...state.metadata.takeOptions) : 200;
          state.take = Math.min(Math.max(1, Math.trunc(nextTake)), maxTake);
        } else {
          state.take = 50;
        }
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
        state.filters.targetId = '';
        if (tab !== 'validations') state.filters.validationTarget = 'all';
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
        const maxTake = state.metadata?.takeOptions?.length ? Math.max(...state.metadata.takeOptions) : 200;
        state.take = Number.isFinite(nextTake) ? Math.min(Math.max(1, Math.trunc(nextTake)), maxTake) : state.take;
      });

      $('#theme-toggle').addEventListener('click', () => {
        applyTheme('dark');
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

      $('#filters').addEventListener('click', (event) => {
        const quick = event.target.closest('[data-quick-tab]');
        if (quick instanceof HTMLElement && quick.dataset.quickTab) {
          setTab(quick.dataset.quickTab);
          return;
        }
        const quickView = event.target.closest('[data-quick-view]');
        if (quickView instanceof HTMLElement && quickView.dataset.quickView) {
          applyQuickView(quickView.dataset.quickView);
          return;
        }
        const button = event.target.closest('[data-date-preset]');
        if (!(button instanceof HTMLElement) || !button.dataset.datePreset) return;
        applyDatePreset(button.dataset.datePreset);
      });

      $('#exploration-strip').addEventListener('click', (event) => {
        const quickView = event.target.closest('[data-quick-view]');
        if (quickView instanceof HTMLElement && quickView.dataset.quickView) {
          applyQuickView(quickView.dataset.quickView);
          return;
        }
        const clear = event.target.closest('[data-clear-filter]');
        if (clear instanceof HTMLElement && clear.dataset.clearFilter) {
          clearFilter(clear.dataset.clearFilter);
        }
      });

      $('#list').addEventListener('click', async (event) => {
        const link = event.target.closest('.crosslink[data-kind][data-id], .chip-btn[data-kind][data-id]');
        if (link instanceof HTMLElement && link.dataset.kind && link.dataset.id) {
          await openRelatedEntity(link.dataset.kind, link.dataset.id);
          return;
        }

        const row = event.target.closest('tr[data-kind][data-id], article[data-kind][data-id]');
        if (!row || !(row instanceof HTMLElement)) return;
        const kind = row.dataset.kind;
        const id = row.dataset.id;
        if (!kind || !id) return;
        const rows = rowsForActiveTab();
        rows.forEach((item) => {
          const r = document.querySelector('[data-id="' + CSS.escape(item.id) + '"][data-kind]');
          if (r) r.classList.remove('selected');
        });
        row.classList.add('selected');
        state.selectedKind = kind;
        state.selectedId = id;
        try {
          await loadEntity(kind, id);
        } catch {
          $('#detail').innerHTML = '<span class="error">No se pudo cargar el detalle solicitado.</span>';
        }
        syncUrl();
      });

      $('#detail').addEventListener('click', async (event) => {
        const scoped = event.target.closest('[data-scope-filter]');
        if (scoped instanceof HTMLElement && scoped.dataset.scopeFilter === 'run' && scoped.dataset.runId) {
          await applyRunScopeFilter(scoped.dataset.runId);
          return;
        }
        if (scoped instanceof HTMLElement && scoped.dataset.scopeFilter === 'fixture' && scoped.dataset.id) {
          await openFixtureExploration(scoped.dataset.id);
          return;
        }
        const validations = event.target.closest('[data-open-validations-target]');
        if (validations instanceof HTMLElement && validations.dataset.openValidationsTarget) {
          await openValidationsForTarget(validations.dataset.openValidationsTarget, validations.dataset.targetId);
          return;
        }
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
            const maxTake = Math.max(...metadata.takeOptions);
            state.take = Math.min(Math.max(1, Math.trunc(state.take)), maxTake);
            if (state.page > Number.MAX_SAFE_INTEGER) state.page = 1;
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
      }

      boot().catch(() => {});
    })();
  </script>
</body>
</html>`;
}
