import { spawnSync } from 'node:child_process';

export const GANA_TELEGRAM_RICH_FOOTER = '🛡️ Review humano antes de promocionar · sin ejecución monetaria';

export function renderCronRichSummary(input = {}) {
  const format = input.format || process.env.GANA_TELEGRAM_SUMMARY_FORMAT || 'markdown-console';
  if (format === 'telegram-html') return renderCronTelegramHtml(input);
  return renderCronMarkdownSummary(input);
}

export function emitCronRichSummary(input = {}) {
  const direct = isDirectTelegramEnabled();
  const message = direct
    ? renderCronTelegramHtml({ ...input, format: 'telegram-html' })
    : renderCronRichSummary(input);
  if (!direct) {
    console.log(message);
    return { delivered: false, target: undefined };
  }
  const target = process.env.GANA_CRON_TELEGRAM_TARGET || 'telegram';
  const result = sendViaHermesGateway(target, message);
  if (result.success) return { delivered: true, target, result };
  const botResult = sendViaTelegramBotApi(target, message);
  if (botResult.success) return { delivered: true, target, result: botResult };
  console.error(`direct telegram delivery failed: ${botResult.error || result.error || JSON.stringify(botResult)}`);
  console.log(renderCronRichSummary(input));
  return { delivered: false, target, result: botResult };
}

export function renderCronMarkdownSummary({
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

export function renderCronTelegramHtml({
  title,
  status = 'ok',
  date,
  timezone = 'America/Guatemala',
  rows = [],
  bullets = [],
  artifacts = [],
  footer = GANA_TELEGRAM_RICH_FOOTER,
  maxChars = 3800,
} = {}) {
  const icon = statusIcon(status);
  const lines = [`<b>${escapeHtml(`${icon} ${title || 'Gana v9'}`)}</b>`];
  if (date) lines.push(`Fecha: <code>${escapeHtml(date)}</code>${timezone ? ` · ${escapeHtml(timezone)}` : ''}`);

  const normalizedRows = normalizeRows(rows);
  if (normalizedRows.length) {
    lines.push('');
    for (const [key, value] of normalizedRows) lines.push(`${escapeHtml(key)}: <code>${escapeHtml(value)}</code>`);
  }

  const normalizedBullets = bullets.map(formatValue).filter(Boolean);
  if (normalizedBullets.length) {
    lines.push('');
    for (const bullet of normalizedBullets) lines.push(`- ${escapeHtml(bullet)}`);
  }

  const normalizedArtifacts = normalizeArtifacts(artifacts);
  if (normalizedArtifacts.length) {
    lines.push('', '<b>Artifacts</b>');
    for (const artifact of normalizedArtifacts) {
      const label = artifact.label ? `${escapeHtml(artifact.label)}: ` : '';
      lines.push(`- ${label}<code>${escapeHtml(artifact.path)}</code>`);
    }
  }

  if (footer) lines.push('', escapeHtml(formatValue(footer)));
  return truncateSummary(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), maxChars);
}

export function formatDurationMs(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return undefined;
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function durationBetween(startedAt, completedAt = new Date()) {
  const startedMs = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt);
  const completedMs = completedAt instanceof Date ? completedAt.getTime() : Date.parse(completedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) return undefined;
  return formatDurationMs(completedMs - startedMs);
}

export function buildCronOutcome({
  flow,
  status,
  date,
  timezone = 'America/Guatemala',
  batchId,
  startedAt,
  completedAt,
  command = [],
  exitStatus,
  signal,
  reason,
  counts = {},
  notifications = {},
  artifacts = [],
  retryAfter,
} = {}) {
  const started = startedAt instanceof Date ? startedAt.toISOString() : startedAt;
  const completed = completedAt instanceof Date ? completedAt.toISOString() : completedAt;
  return {
    schemaVersion: 1,
    flow: formatValue(flow),
    status: formatValue(status),
    date: formatValue(date),
    timezone: formatValue(timezone),
    batchId: formatValue(batchId),
    startedAt: started,
    completedAt: completed,
    duration: durationBetween(started, completed),
    command: Array.isArray(command) ? command.map(formatValue).filter(Boolean) : [],
    exit: {
      status: exitStatus ?? null,
      signal: signal ?? null,
    },
    reason: formatValue(reason),
    counts,
    notifications,
    artifacts: normalizeArtifacts(artifacts).map((artifact) => artifact.label ? artifact : artifact.path),
    retryAfter: formatValue(retryAfter),
    updatedAt: new Date().toISOString(),
  };
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
    return redactSensitiveText(JSON.stringify(value));
  }
  return redactSensitiveText(String(value));
}

function escapeTableCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function normalizeRows(rows) {
  return rows
    .map(([key, value]) => [String(key ?? '').trim(), formatValue(value)])
    .filter(([key, value]) => key && value);
}

function normalizeArtifacts(artifacts) {
  return artifacts
    .map((artifact) => {
      if (typeof artifact === 'string') return { path: formatValue(artifact) };
      return {
        label: formatValue(artifact?.label),
        path: formatValue(artifact?.path),
      };
    })
    .filter((artifact) => artifact.path);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncateSummary(text, maxChars) {
  const limit = Number(maxChars);
  if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 16)).trimEnd()}\n... truncado`;
}

export function redactSensitiveText(value) {
  return String(value)
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted-token]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|sk|xoxb|xoxp|glpat)-[A-Za-z0-9_=-]{16,}\b/g, '[redacted-token]')
    .replace(/([?&](?:token|key|secret|api_key|apikey|access_token)=)[^&\s]+/gi, '$1[redacted]');
}

function isDirectTelegramEnabled() {
  return /^(1|true|yes)$/i.test(process.env.GANA_CRON_DIRECT_TELEGRAM || '');
}

function sendViaHermesGateway(target, message) {
  const hermesHome = process.env.HERMES_HOME || `${process.env.HOME}/.hermes`;
  const python = process.env.HERMES_GATEWAY_PYTHON || `${hermesHome}/hermes-agent/venv/bin/python3`;
  const agentRoot = process.env.HERMES_AGENT_ROOT || `${hermesHome}/hermes-agent`;
  const payload = JSON.stringify({ action: 'send', target, message });
  const script = [
    'import json, sys',
    'from tools.send_message_tool import send_message_tool',
    'payload=json.loads(sys.stdin.read())',
    'print(send_message_tool(payload))',
  ].join('\n');
  const result = spawnSync(python, ['-c', script], {
    input: payload,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPATH: `${agentRoot}${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ''}`,
    },
    maxBuffer: 1024 * 1024,
  });
  if (result.error) return { success: false, error: result.error.message };
  if (result.status !== 0) return { success: false, error: result.stderr || `exit ${result.status}` };
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return { success: false, error: `invalid gateway response: ${result.stdout}` };
  }
}

function sendViaTelegramBotApi(target, message) {
  const hermesHome = process.env.HERMES_HOME || `${process.env.HOME}/.hermes`;
  const python = process.env.HERMES_GATEWAY_PYTHON || `${hermesHome}/hermes-agent/venv/bin/python3`;
  const payload = JSON.stringify({ target, message, envPath: `${hermesHome}/.env` });
  const script = [
    'import json, os, sys, urllib.parse, urllib.request',
    'payload=json.loads(sys.stdin.read())',
    'env={}',
    'try:',
    '    data=open(payload["envPath"], encoding="utf-8").read().splitlines()',
    'except FileNotFoundError:',
    '    data=[]',
    'for line in data:',
    '    line=line.strip()',
    '    if not line or line.startswith("#") or "=" not in line: continue',
    '    k,v=line.split("=",1)',
    '    v=v.strip()',
    '    if len(v)>=2 and v[0]==v[-1] and v[0] in ("\\\'", "\\\""): v=v[1:-1]',
    '    env.setdefault(k.strip(), v)',
    'token=os.environ.get("TELEGRAM_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN")',
    'target=payload.get("target") or "telegram"',
    'chat=os.environ.get("TELEGRAM_HOME_CHANNEL") or env.get("TELEGRAM_HOME_CHANNEL")',
    'if isinstance(target, str) and target.startswith("telegram:"):',
    '    parts=target.split(":",1)',
    '    if len(parts)>1 and parts[1]: chat=parts[1]',
    'if not token or not chat:',
    '    print(json.dumps({"success":False,"error":"missing TELEGRAM_BOT_TOKEN or TELEGRAM_HOME_CHANNEL"}))',
    '    raise SystemExit(0)',
    'body=urllib.parse.urlencode({"chat_id":chat,"text":payload["message"],"parse_mode":"HTML","disable_web_page_preview":"true"}).encode()',
    'try:',
    '    with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", body, timeout=20) as r:',
    '        raw=r.read().decode("utf-8", "replace")',
    '    result=json.loads(raw)',
    '    print(json.dumps({"success":bool(result.get("ok")),"platform":"telegram","chat_id":chat,"message_id":result.get("result",{}).get("message_id"),"raw_ok":result.get("ok")}))',
    'except Exception as e:',
    '    print(json.dumps({"success":False,"error":str(e)}))',
  ].join('\n');
  const result = spawnSync(python, ['-c', script], {
    input: payload,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) return { success: false, error: result.error.message };
  if (result.status !== 0) return { success: false, error: result.stderr || `exit ${result.status}` };
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return { success: false, error: `invalid telegram bot response: ${result.stdout}` };
  }
}
