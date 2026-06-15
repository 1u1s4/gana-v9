export const GANA_TELEGRAM_RICH_FOOTER = '🛡️ Review humano antes de promocionar · sin ejecución monetaria';

export function renderCronRichSummary({
  title,
  status = 'ok',
  date,
  timezone = 'America/Guatemala',
  rows = [],
  bullets = [],
  artifacts = [],
  footer = GANA_TELEGRAM_RICH_FOOTER,
} = {}) {
  const icon = statusIcon(status);
  const lines = [
    `## ${icon} ${title || 'Gana v9'}`,
    '',
  ];
  if (date) lines.push(`**Fecha:** ${date}${timezone ? ` · ${timezone}` : ''}`, '');

  const normalizedRows = rows
    .map(([key, value]) => [String(key ?? '').trim(), formatValue(value)])
    .filter(([key, value]) => key && value);
  if (normalizedRows.length) {
    lines.push('| Métrica | Valor |', '|---|---|');
    for (const [key, value] of normalizedRows) lines.push(`| ${escapeTableCell(key)} | ${escapeTableCell(value)} |`);
    lines.push('');
  }

  const normalizedBullets = bullets.map(formatValue).filter(Boolean);
  if (normalizedBullets.length) {
    for (const bullet of normalizedBullets) lines.push(`- ${bullet}`);
    lines.push('');
  }

  const normalizedArtifacts = artifacts
    .map((artifact) => typeof artifact === 'string' ? artifact : artifact?.path)
    .map(formatValue)
    .filter(Boolean);
  if (normalizedArtifacts.length) {
    lines.push('### Artifacts');
    for (const artifact of normalizedArtifacts) lines.push(`- \`${artifact}\``);
    lines.push('');
  }

  if (footer) lines.push(footer);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseJsonObject(raw) {
  if (!raw) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
    }
  }
  return undefined;
}

export function compactPath(path) {
  if (!path) return undefined;
  const text = String(path);
  const marker = '/.artifacts/gana-v9/';
  const index = text.indexOf(marker);
  if (index >= 0) return `.artifacts/gana-v9/${text.slice(index + marker.length)}`;
  return text;
}

export function statusIcon(status) {
  if (status === true || status === 'ok' || status === 0) return '✅';
  if (status === 'skipped') return '⏭️';
  if (status === 'blocked' || status === 'warning' || status === 'review') return '⚠️';
  return '❌';
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (Number.isFinite(value.hour) && Number.isFinite(value.minute)) {
      const hh = String(value.hour).padStart(2, '0');
      const mm = String(value.minute).padStart(2, '0');
      const ss = Number.isFinite(value.second) ? `:${String(value.second).padStart(2, '0')}` : '';
      return `${hh}:${mm}${ss}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeTableCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
