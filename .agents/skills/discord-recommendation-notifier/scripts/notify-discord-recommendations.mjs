#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveDiscordTarget } from './discord-targets.mjs';

const DEFAULT_ARTIFACT_ROOT = '.artifacts/gana-v9/runs';
const DEFAULT_MAX_SELECTIONS = 14;
const DEFAULT_TRANSPORT = 'discord-native';
const DEFAULT_HERMES_PYTHON = '/Users/luisalvarado/.hermes/hermes-agent/venv/bin/python3';
const DISCORD_FIELD_LIMIT = 1024;
const DISCORD_DESCRIPTION_LIMIT = 4096;
const DISCORD_EMBED_LIMIT = 10;
const DISCORD_NON_SELECTION_EMBEDS = 2;
const DISCORD_SELECTION_EMBEDS_PER_MESSAGE = DISCORD_EMBED_LIMIT - DISCORD_NON_SELECTION_EMBEDS;
const DISCORD_PAGINATED_SELECTION_EMBEDS_PER_MESSAGE = DISCORD_EMBED_LIMIT - 1;

export function parseArgs(argv) {
  const args = {
    artifact: undefined,
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    transport: DEFAULT_TRANSPORT,
    gatewayTarget: undefined,
    hermesPython: process.env.HERMES_GATEWAY_PYTHON || DEFAULT_HERMES_PYTHON,
    dryRun: false,
    latest: false,
    singleMessage: false,
    max: DEFAULT_MAX_SELECTIONS,
    username: 'Gana Hermes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') args.artifact = requireValue(argv, ++index, arg);
    else if (arg === '--artifact-root') args.artifactRoot = requireValue(argv, ++index, arg);
    else if (arg === '--webhook-url') args.webhookUrl = requireValue(argv, ++index, arg);
    else if (arg === '--transport') args.transport = parseTransport(requireValue(argv, ++index, arg));
    else if (arg === '--gateway-target') args.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--hermes-python') args.hermesPython = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--latest') args.latest = true;
    else if (arg === '--single-message') args.singleMessage = true;
    else if (arg === '--max') args.max = parseMax(requireValue(argv, ++index, arg));
    else if (arg === '--username') args.username = requireValue(argv, ++index, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  args.gatewayTarget = resolveDiscordTarget('recommendations', { gatewayTarget: args.gatewayTarget });
  return args;
}

export function resolveArtifactPath(options) {
  if (options.artifact) return resolve(options.artifact);
  return findLatestRecommendationsArtifact(options.artifactRoot);
}

export function findLatestRecommendationsArtifact(root = DEFAULT_ARTIFACT_ROOT) {
  const absoluteRoot = resolve(root);
  const matches = [];
  collectRecommendationArtifacts(absoluteRoot, matches);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  if (!matches.length) {
    throw new Error(`No daily-parlay-recommendations.json artifacts found under ${absoluteRoot}`);
  }
  return matches[0].path;
}

export function loadRecommendations(path) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  if (!artifact || typeof artifact !== 'object') throw new Error(`Invalid recommendations artifact: ${path}`);
  const recommendations = selectRecommendations(artifact);
  return { artifact, recommendations };
}

export function buildDiscordPayload(artifact, options = {}) {
  const max = parseMax(String(options.max ?? DEFAULT_MAX_SELECTIONS));
  const selectionLimit = Math.min(max, DISCORD_SELECTION_EMBEDS_PER_MESSAGE);
  const recommendations = hydrateRecommendationDisplayLabels(selectRecommendations(artifact).slice(0, selectionLimit));
  return buildDiscordPayloadPage(recommendations, { ...options, artifactDate: artifact?.date });
}

export function buildDiscordPayloads(artifact, options = {}) {
  const max = parseMax(String(options.max ?? DEFAULT_MAX_SELECTIONS));
  const recommendations = hydrateRecommendationDisplayLabels(selectRecommendations(artifact).slice(0, max));
  if (!recommendations.length) return [buildDiscordPayloadPage([], options)];
  const pages = recommendations.length > DISCORD_SELECTION_EMBEDS_PER_MESSAGE
    ? paginateDiscordSelectionEmbeds(recommendations)
    : [recommendations];
  return pages.map((pageRecommendations, index) => buildDiscordPayloadPage(pageRecommendations, {
    ...options,
    artifactDate: artifact?.date,
    page: index + 1,
    pageCount: pages.length,
    totalRecommendations: recommendations,
  }));
}

export function buildDiscordSinglePayload(artifact, options = {}) {
  const max = parseMax(String(options.max ?? DEFAULT_MAX_SELECTIONS));
  const recommendations = hydrateRecommendationDisplayLabels(selectRecommendations(artifact).slice(0, max));
  const counts = recommendationCounts(recommendations);
  const embeds = [{
    title: '🏆 Gana v9 · Recomendaciones',
    description: [
      recommendationCountLine(counts),
      formatArtifactDate(artifact?.date),
    ].join('\n'),
    color: 0x2f80ed,
    footer: { text: 'Gana Hermes · Discord native embeds' },
    timestamp: new Date().toISOString(),
  }];

  if (!recommendations.length) {
    embeds.push({
      title: 'Sin selecciones',
      description: '> El artifact no contiene selecciones para notificar.',
      color: 0x828282,
    });
  } else {
    const lines = recommendations.flatMap((recommendation, index) => formatCompactRecommendationLines(recommendation, index));
    const descriptions = chunkLinesByLimit(lines, DISCORD_DESCRIPTION_LIMIT - 200);
    const availableSelectionEmbeds = DISCORD_EMBED_LIMIT - DISCORD_NON_SELECTION_EMBEDS;
    for (const [index, description] of descriptions.slice(0, availableSelectionEmbeds).entries()) {
      embeds.push({
        title: index === 0 ? 'Selecciones' : `Selecciones cont. ${index + 1}`,
        description: truncate(description, DISCORD_DESCRIPTION_LIMIT),
        color: 0x27ae60,
      });
    }
    if (descriptions.length > availableSelectionEmbeds) {
      embeds[embeds.length - 1].description = truncate(`${embeds[embeds.length - 1].description}\n> +selecciones truncadas por limite de Discord`, DISCORD_DESCRIPTION_LIMIT);
    }
  }

  embeds.push({
    description: '🛡️ Revisión manual requerida antes de promoción.',
    color: 0x56ccf2,
  });

  return {
    username: stringOrFallback(options.username, 'Gana Hermes'),
    allowed_mentions: { parse: [] },
    content: '',
    embeds,
  };
}

function buildDiscordPayloadPage(recommendations, options = {}) {
  const totalRecommendations = Array.isArray(options.totalRecommendations) ? options.totalRecommendations : recommendations;
  const totalCounts = recommendationCounts(totalRecommendations);
  const pageCount = Number.isInteger(options.pageCount) ? options.pageCount : 1;
  const page = Number.isInteger(options.page) ? options.page : 1;
  const includeHeader = page === 1;
  const includeClosing = page === pageCount;
  const embeds = [];

  if (includeHeader) {
    embeds.push({
      title: '🏆 Gana v9 · Recomendaciones',
      description: [
        recommendationCountLine(totalCounts),
        formatArtifactDate(options.artifactDate),
      ].filter(Boolean).join('\n'),
      color: 0x2f80ed,
      footer: { text: 'Gana Hermes · Discord native embeds' },
      timestamp: new Date().toISOString(),
    });
  }

  if (recommendations.length) {
    embeds.push(...recommendations.map((recommendation, index) => recommendationEmbed(recommendation, index)));
  } else {
    embeds.push({
      title: 'Sin selecciones',
      description: '> El artifact no contiene selecciones para notificar.',
      color: 0x828282,
    });
  }

  if (includeClosing) {
    embeds.push({
      description: '🛡️ Revisión manual requerida antes de promoción.',
      color: 0x56ccf2,
    });
  }

  return {
    username: stringOrFallback(options.username, 'Gana Hermes'),
    allowed_mentions: { parse: [] },
    content: '',
    embeds,
  };
}

function formatArtifactDate(value) {
  if (typeof value !== 'string') return undefined;
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(value.trim());
  if (!match?.groups) return undefined;
  return `${match.groups.day}/${match.groups.month}/${match.groups.year}`;
}

export function buildGatewayMessage(artifact, options = {}) {
  const max = parseMax(String(options.max ?? DEFAULT_MAX_SELECTIONS));
  const recommendations = hydrateRecommendationDisplayLabels(selectRecommendations(artifact).slice(0, max));
  const counts = recommendationCounts(recommendations);
  const status = commonRecommendationValue(recommendations, 'harnessStatus', 'review-required');
  const validation = commonRecommendationValue(recommendations, 'validationStatus', 'unvalidated');
  const risk = commonRiskFlag(recommendations, 'low-liquidity');

  const lines = [
    '🏆 Gana v9 · Recomendaciones en revisión',
    '',
    recommendationCountLine(counts),
    `🟡 ${status} · ${validation} · 💧 ${risk}`,
    '⚠️ Sin ejecución monetaria · Sin garantía',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
  ];

  if (!recommendations.length) {
    lines.push('> Sin selecciones: el artifact no contiene selecciones para notificar.', '');
  } else {
    for (const [index, recommendation] of recommendations.entries()) {
      lines.push(...formatCompactRecommendationLines(recommendation, index));
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━', '', '🛡️ Revisión manual requerida antes de promoción.');
  return lines.join('\n');
}

export async function sendDiscordPayload(webhookUrl, payload, fetchImpl = globalThis.fetch) {
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL or --webhook-url is required unless --dry-run is used.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available in this Node runtime.');

  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Discord webhook failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }

  return { status: response.status, body };
}

export function sendHermesGatewayMessage(target, message, options = {}, spawnImpl = spawnSync) {
  if (!target) throw new Error('--gateway-target is required for Hermes gateway transport.');
  if (!message) throw new Error('Cannot send an empty gateway message.');
  const hermesPython = options.hermesPython || process.env.HERMES_GATEWAY_PYTHON || DEFAULT_HERMES_PYTHON;

  const python = [
    'import json, os, sys',
    'from pathlib import Path',
    'env_path = Path.home() / ".hermes" / ".env"',
    'if env_path.exists():',
    '    for line in env_path.read_text().splitlines():',
    '        line = line.strip()',
    '        if not line or line.startswith("#") or "=" not in line:',
    '            continue',
    '        key, value = line.split("=", 1)',
    '        os.environ.setdefault(key.strip(), value.strip().strip("\\\'\\""))',
    'from tools.send_message_tool import send_message_tool',
    'payload = json.load(sys.stdin)',
    'result = send_message_tool({"action": "send", "target": payload["target"], "message": payload["message"]})',
    'print(result)',
  ].join('\n');
  const env = {
    ...process.env,
    PYTHONPATH: [
      '/Users/luisalvarado/.hermes/hermes-agent',
      process.env.PYTHONPATH,
    ].filter(Boolean).join(':'),
  };
  const child = spawnImpl(hermesPython, ['-c', python], {
    input: JSON.stringify({ target, message }),
    encoding: 'utf8',
    env,
  });

  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Hermes gateway send failed with exit ${child.status}: ${(child.stderr || child.stdout || '').trim()}`);
  }

  const raw = String(child.stdout ?? '').trim();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(`Hermes gateway returned non-JSON output: ${raw.slice(0, 300)}`);
  }
  if (result?.error) throw new Error(`Hermes gateway send failed: ${result.error}`);
  return result;
}

export function sendDiscordNativePayload(target, payload, options = {}, spawnImpl = spawnSync) {
  if (!target) throw new Error('--gateway-target is required for Discord native transport.');
  const hermesPython = options.hermesPython || process.env.HERMES_GATEWAY_PYTHON || DEFAULT_HERMES_PYTHON;
  const python = [
    'import asyncio, json, os, re, sys',
    'from pathlib import Path',
    'env_path = Path.home() / ".hermes" / ".env"',
    'if env_path.exists():',
    '    for line in env_path.read_text().splitlines():',
    '        line = line.strip()',
    '        if not line or line.startswith("#") or "=" not in line:',
    '            continue',
    '        key, value = line.split("=", 1)',
    '        os.environ.setdefault(key.strip(), value.strip().strip("\\\'\\""))',
    'from gateway.config import load_gateway_config, Platform',
    'from gateway.platforms.base import resolve_proxy_url, proxy_kwargs_for_aiohttp',
    'import aiohttp',
    'payload = json.load(sys.stdin)',
    'target = payload["target"]',
    'message_payload = payload["payload"]',
    'config = load_gateway_config()',
    'pconfig = config.platforms.get(Platform.DISCORD)',
    'if not pconfig or not pconfig.enabled or not pconfig.token:',
    '    raise SystemExit("Discord platform is not configured in Hermes gateway")',
    'target_ref = target.split(":", 1)[1] if ":" in target else ""',
    'chat_id = None',
    'thread_id = None',
    'if target_ref:',
    '    m = re.fullmatch(r"(\\d+)(?::(\\d+))?", target_ref)',
    '    if m:',
    '        chat_id, thread_id = m.group(1), m.group(2)',
    '    else:',
    '        from gateway.channel_directory import resolve_channel_name',
    '        resolved = resolve_channel_name("discord", target_ref)',
    '        if resolved:',
    '            m = re.fullmatch(r"(\\d+)(?::(\\d+))?", resolved)',
    '            if m:',
    '                chat_id, thread_id = m.group(1), m.group(2)',
    'if not chat_id:',
    '    home = config.get_home_channel(Platform.DISCORD)',
    '    if home:',
    '        chat_id = home.chat_id',
    'if not chat_id:',
    '    raise SystemExit("Could not resolve Discord target")',
    'async def main():',
    '    proxy = resolve_proxy_url(platform_env_var="DISCORD_PROXY")',
    '    sess_kw, req_kw = proxy_kwargs_for_aiohttp(proxy)',
    '    channel_id = thread_id or chat_id',
    '    url = f"https://discord.com/api/v10/channels/{channel_id}/messages"',
    '    headers = {"Authorization": f"Bot {pconfig.token}", "Content-Type": "application/json"}',
    '    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30), **sess_kw) as session:',
    '        async with session.post(url, headers=headers, json=message_payload, **req_kw) as resp:',
    '            body = await resp.text()',
    '            if resp.status not in {200, 201}:',
    '                raise SystemExit(f"Discord API error ({resp.status}): {body[:500]}")',
    '            data = json.loads(body)',
    '            print(json.dumps({"success": True, "platform": "discord", "chat_id": chat_id, "thread_id": thread_id, "message_id": data.get("id"), "embeds": len(message_payload.get("embeds", []))}))',
    'asyncio.run(main())',
  ].join('\n');
  const env = {
    ...process.env,
    PYTHONPATH: [
      '/Users/luisalvarado/.hermes/hermes-agent',
      process.env.PYTHONPATH,
    ].filter(Boolean).join(':'),
  };
  const child = spawnImpl(hermesPython, ['-c', python], {
    input: JSON.stringify({ target, payload }),
    encoding: 'utf8',
    env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Discord native send failed with exit ${child.status}: ${(child.stderr || child.stdout || '').trim()}`);
  }
  const raw = String(child.stdout ?? '').trim();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(`Discord native send returned non-JSON output: ${raw.slice(0, 300)}`);
  }
  if (result?.error) throw new Error(`Discord native send failed: ${result.error}`);
  return result;
}

function collectRecommendationArtifacts(dir, matches) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRecommendationArtifacts(path, matches);
      continue;
    }
    if (entry.isFile() && basename(path) === 'daily-parlay-recommendations.json') {
      matches.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
}

export function selectRecommendations(artifact) {
  if (Array.isArray(artifact?.recommendations)) return artifact.recommendations;
  return [
    ...(Array.isArray(artifact?.parlayRecommendations) ? artifact.parlayRecommendations : []),
    ...(Array.isArray(artifact?.atomicRecommendations) ? artifact.atomicRecommendations : []),
  ];
}

export function recommendationCounts(recommendations) {
  return recommendations.reduce((counts, recommendation) => {
    if (recommendationKind(recommendation) === 'atomic-prediction') counts.atomic += 1;
    else counts.parlay += 1;
    return counts;
  }, { parlay: 0, atomic: 0 });
}

function recommendationCountLine(counts) {
  return `📦 ${counts.parlay} ${counts.parlay === 1 ? 'parlay' : 'parlays'} · 📌 ${counts.atomic} ${counts.atomic === 1 ? 'simple' : 'simples'}`;
}

export function recommendationKind(recommendation) {
  return recommendation?.kind === 'atomic-prediction' ? 'atomic-prediction' : 'parlay';
}

function recommendationField(recommendation, index) {
  const rank = numberOrFallback(recommendation.rank, index + 1);
  const nameParts = [
    `#${rank}`,
    recommendationKind(recommendation) === 'atomic-prediction' ? 'simple' : undefined,
    stringOrFallback(recommendation.profile, 'profile unknown'),
    Number.isFinite(recommendation.combinedOdds) ? `odds ${formatNumber(recommendation.combinedOdds, 2)}` : undefined,
  ].filter(Boolean);

  const legLines = Array.isArray(recommendation.legs)
    ? recommendation.legs.slice(0, 8).map(formatLeg)
    : [];
  const hiddenLegs = Array.isArray(recommendation.legs) && recommendation.legs.length > 8
    ? `+${recommendation.legs.length - 8} legs adicionales`
    : undefined;

  const value = [
    formatMetricLine(recommendation),
    recommendation.harnessStatus ? `Status: ${recommendation.harnessStatus}` : undefined,
    recommendation.validationStatus ? `Validation: ${recommendation.validationStatus}` : undefined,
    legLines.length ? `Legs:\n${legLines.map((line) => `- ${line}`).join('\n')}` : undefined,
    hiddenLegs,
    Array.isArray(recommendation.riskFlags) && recommendation.riskFlags.length
      ? `Risk flags: ${recommendation.riskFlags.slice(0, 5).join(', ')}`
      : undefined,
  ].filter(Boolean).join('\n');

  return {
    name: truncate(nameParts.join(' | '), 256),
    value: truncate(value || 'Sin detalle disponible.', DISCORD_FIELD_LIMIT),
    inline: false,
  };
}

function recommendationEmbed(recommendation, index) {
  const rank = numberOrFallback(recommendation.rank, index + 1);
  const kind = recommendationKind(recommendation);
  const legLines = Array.isArray(recommendation.legs) && recommendation.legs.length
    ? recommendation.legs.slice(0, 8).map((leg) => `> ${formatCompactLeg(leg)}`)
    : ['> Sin detalle de selecciones.'];
  if (Array.isArray(recommendation.legs) && recommendation.legs.length > 8) {
    legLines.push(`> +${recommendation.legs.length - 8} selecciones adicionales`);
  }
  legLines.push(formatCompactMetricLine(recommendation));
  return {
    title: `${rankEmoji(rank)} ${kind === 'atomic-prediction' ? '📌 Simple · ' : ''}${recommendationTitle(recommendation)}`,
    description: truncate(legLines.join('\n'), DISCORD_DESCRIPTION_LIMIT),
    color: kind === 'atomic-prediction' ? 0x9b51e0 : rank === 1 ? 0xf2c94c : 0x27ae60,
  };
}

function formatRecommendationLines(recommendation, index) {
  const rank = numberOrFallback(recommendation.rank, index + 1);
  const header = [
    `#${rank}`,
    stringOrFallback(recommendation.profile, 'profile unknown'),
    Number.isFinite(recommendation.combinedOdds) ? `odds ${formatNumber(recommendation.combinedOdds, 2)}` : undefined,
  ].filter(Boolean).join(' | ');
  const lines = ['', header];
  const metrics = formatMetricLine(recommendation);
  if (metrics) lines.push(metrics);
  if (recommendation.harnessStatus) lines.push(`Status: ${recommendation.harnessStatus}`);
  if (recommendation.validationStatus) lines.push(`Validation: ${recommendation.validationStatus}`);
  if (Array.isArray(recommendation.legs) && recommendation.legs.length) {
    lines.push('Legs:');
    for (const leg of recommendation.legs.slice(0, 8)) lines.push(`- ${formatLeg(leg)}`);
    if (recommendation.legs.length > 8) lines.push(`+${recommendation.legs.length - 8} legs adicionales`);
  }
  if (Array.isArray(recommendation.riskFlags) && recommendation.riskFlags.length) {
    lines.push(`Risk flags: ${recommendation.riskFlags.slice(0, 5).join(', ')}`);
  }
  return lines;
}

function formatCompactRecommendationLines(recommendation, index) {
  const rank = numberOrFallback(recommendation.rank, index + 1);
  const kind = recommendationKind(recommendation);
  const lines = [`${rankEmoji(rank)} ${kind === 'atomic-prediction' ? '📌 Simple · ' : ''}${recommendationTitle(recommendation)}`];

  if (Array.isArray(recommendation.legs) && recommendation.legs.length) {
    for (const leg of recommendation.legs.slice(0, 8)) {
      lines.push(`> ${formatCompactLeg(leg)}`);
    }
    if (recommendation.legs.length > 8) lines.push(`> +${recommendation.legs.length - 8} selecciones adicionales`);
  } else {
    lines.push('> Sin detalle de selecciones.');
  }

  lines.push(formatCompactMetricLine(recommendation));
  lines.push('');
  return lines;
}

export function recommendationTitle(recommendation) {
  if (!Array.isArray(recommendation.legs) || !recommendation.legs.length) {
    return stringOrFallback(recommendation.parlayId, 'Parlay sin titulo');
  }
  if (recommendationKind(recommendation) === 'atomic-prediction') {
    const leg = recommendation.legs[0];
    return `${displayFixtureName(leg)} · ${formatCompactSelection(leg)}`;
  }
  return recommendation.legs
    .slice(0, 3)
    .map(displayFixtureName)
    .join(' + ');
}

export function hydrateRecommendationDisplayLabels(recommendations) {
  if (!Array.isArray(recommendations) || !recommendations.length) return recommendations;
  const displayByFixtureId = recommendationDisplayMap(recommendations);
  if (!displayByFixtureId.size) return recommendations;

  const hydrateLeg = (leg) => {
    const fixtureId = typeof leg?.fixtureId === 'string' ? leg.fixtureId.trim() : '';
    const display = fixtureId ? displayByFixtureId.get(fixtureId) : undefined;
    if (!display) return leg;
    const fixture = shouldReplaceFixtureLabel(leg?.fixture)
      ? display.fixtureLabel
      : leg.fixture;
    return {
      ...leg,
      fixture,
      display: {
        ...(leg?.display && typeof leg.display === 'object' ? leg.display : {}),
        ...display,
      },
    };
  };

  return recommendations.map((recommendation) => ({
    ...recommendation,
    legs: Array.isArray(recommendation.legs) ? recommendation.legs.map(hydrateLeg) : recommendation.legs,
    bankerLegs: Array.isArray(recommendation.bankerLegs) ? recommendation.bankerLegs.map(hydrateLeg) : recommendation.bankerLegs,
  }));
}

function recommendationDisplayMap(recommendations) {
  const displayByFixtureId = new Map();
  for (const recommendation of recommendations) {
    for (const leg of [
      ...(Array.isArray(recommendation?.legs) ? recommendation.legs : []),
      ...(Array.isArray(recommendation?.bankerLegs) ? recommendation.bankerLegs : []),
    ]) {
      const fixtureId = typeof leg?.fixtureId === 'string' ? leg.fixtureId.trim() : '';
      if (!fixtureId || displayByFixtureId.has(fixtureId)) continue;
      const display = displayFromLeg(leg);
      if (display) displayByFixtureId.set(fixtureId, display);
    }
  }
  return displayByFixtureId;
}

function displayFromLeg(leg) {
  const display = leg?.display && typeof leg.display === 'object' ? leg.display : {};
  const fixtureLabel = display.fixtureLabel
    || buildLabelFromTeams(display.homeTeamName, display.awayTeamName)
    || buildLabelFromTeams(leg?.homeTeamName, leg?.awayTeamName)
    || leg?.fixtureLabel
    || (typeof leg?.fixture === 'string' ? leg.fixture : undefined);
  if (typeof fixtureLabel !== 'string' || !fixtureLabel.trim() || isUuidFixtureLabel(fixtureLabel)) return undefined;
  const homeTeamName = typeof display.homeTeamName === 'string' ? display.homeTeamName : undefined;
  const awayTeamName = typeof display.awayTeamName === 'string' ? display.awayTeamName : undefined;
  return {
    ...display,
    fixtureLabel: compactFixtureName(fixtureLabel),
    ...(homeTeamName ? { homeTeamName } : {}),
    ...(awayTeamName ? { awayTeamName } : {}),
  };
}

function displayFixtureName(leg) {
  const display = leg?.display && typeof leg.display === 'object' ? leg.display : {};
  const fromDisplay = display.fixtureLabel
    || buildLabelFromTeams(display.homeTeamName, display.awayTeamName)
    || buildLabelFromTeams(leg?.homeTeamName, leg?.awayTeamName)
    || leg?.fixtureLabel;
  if (typeof fromDisplay === 'string' && fromDisplay.trim() && !isUuidFixtureLabel(fromDisplay)) {
    return compactFixtureName(fromDisplay);
  }

  const fixture = typeof leg?.fixture === 'string' ? leg.fixture.trim() : '';
  if (fixture && !isUuidFixtureLabel(fixture)) return compactFixtureName(fixture);

  const fixtureId = typeof leg?.fixtureId === 'string' ? leg.fixtureId.trim() : '';
  return fixtureId ? `Fixture ${shortId(fixtureId)}` : 'fixture unknown';
}

function buildLabelFromTeams(homeTeamName, awayTeamName) {
  if (typeof homeTeamName !== 'string' || typeof awayTeamName !== 'string') return undefined;
  const home = homeTeamName.trim();
  const away = awayTeamName.trim();
  if (!home || !away || isUuidLike(home) || isUuidLike(away)) return undefined;
  return `${home} vs ${away}`;
}

function compactFixtureName(value) {
  const fixture = stringOrFallback(value, 'fixture unknown');
  return fixture
    .replace(/\s+vs\.?\s+/i, ' vs ')
    .replace(/\s+United\s+II\b/i, ' Utd II')
    .trim();
}

export function formatCompactLeg(leg) {
  return `${formatMarketIcon(leg)} ${displayFixtureName(leg)}: ${formatCompactSelection(leg)} @ ${formatMetricNumber(leg.odds, 2)}`;
}

function formatMarketIcon(leg) {
  const market = stringOrFallback(leg?.market, 'market');
  if (market === 'corners_over_under') return '🎯';
  if (market === 'goals_over_under' || market === 'btts') return '🥅';
  return '⚽';
}

export function formatCompactSelection(leg) {
  const market = stringOrFallback(leg.market, 'market');
  const selection = stringOrFallback(leg.selection, 'selection');
  const line = Number.isFinite(leg.line) ? ` ${formatMetricNumber(leg.line, 2)}` : '';
  if (market === 'btts') return `BTTS ${selection}`;
  if (market === 'goals_over_under') return `goals ${selection}${line}`;
  if (market === 'corners_over_under') return `corners ${selection}${line}`;
  if (market.endsWith('over_under')) return `${market.replace(/_over_under$/, '')} ${selection}${line}`;
  return `${market} ${selection}${line}`;
}

export function formatExposurePercent(recommendation) {
  const candidates = [
    recommendation.exposure?.percentOfAnalyticalBankroll,
    recommendation.stake?.percentOfBankroll,
    recommendation.exposurePercent,
  ];
  const value = candidates.find((candidate) => Number.isFinite(candidate));
  return Number.isFinite(value) ? formatPercent(value) : 'n/a';
}

export function formatStakeRecommendation(recommendation) {
  const stake = recommendation.stakeRecommendation
    ?? recommendation.recommendedStake
    ?? recommendation.bankrollAllocation;
  if (Number.isFinite(stake?.stake)) return String(Math.round(stake.stake));
  const percent = stake?.percentOfBankroll ?? stake?.percentOfAnalyticalBankroll;
  if (Number.isFinite(percent)) return String(nearestDisplayStake(Number(percent) * 100));
  return undefined;
}

function formatCompactMetricLine(recommendation) {
  const stake = formatStakeRecommendation(recommendation);
  const parts = [
    `> 📊 Odds ${formatMetricNumber(recommendation.combinedOdds, 4)}`,
    `🧠 Conf ${formatPercent(recommendation.aggregateConfidence)}`,
    `📈 Edge ${formatPercent(recommendation.expectedEdge)}`,
    stake ? `💵 Stake ${stake}` : undefined,
  ];
  if (!stake) parts.push(`📌 Expo ${formatExposurePercent(recommendation)}`);
  return parts.filter(Boolean).join(' · ');
}

function nearestDisplayStake(value) {
  const buckets = [1, 5, 10, 15, 20, 25];
  return buckets.reduce((best, bucket) =>
    Math.abs(bucket - value) < Math.abs(best - value) ? bucket : best,
  buckets[0]);
}

function commonRecommendationValue(recommendations, key, fallback) {
  const values = recommendations
    .map((recommendation) => recommendation?.[key])
    .filter((value) => typeof value === 'string' && value.trim());
  if (!values.length) return fallback;
  const first = values[0];
  return values.every((value) => value === first) ? first : 'mixed';
}

function commonRiskFlag(recommendations, fallback) {
  const values = recommendations
    .flatMap((recommendation) => Array.isArray(recommendation?.riskFlags) ? recommendation.riskFlags : [])
    .map(String)
    .filter(Boolean);
  if (!values.length) return fallback;
  const first = values[0];
  return values.every((value) => value === first) ? first : 'mixed-risk';
}

function formatMetricLine(recommendation) {
  const parts = [];
  if (Number.isFinite(recommendation.aggregateConfidence)) {
    parts.push(`Confidence ${formatPercent(recommendation.aggregateConfidence)}`);
  }
  if (Number.isFinite(recommendation.adjustedProbability)) {
    parts.push(`Adj prob ${formatPercent(recommendation.adjustedProbability)}`);
  }
  if (Number.isFinite(recommendation.expectedEdge)) {
    parts.push(`Edge ${formatPercent(recommendation.expectedEdge)}`);
  }
  const stake = formatStakeRecommendation(recommendation);
  if (stake) parts.push(`Stake ${stake}`);
  if (Number.isFinite(recommendation.score)) {
    parts.push(`Score ${formatNumber(recommendation.score, 3)}`);
  }
  return parts.join(' | ');
}

function formatLeg(leg) {
  const fixture = displayFixtureName(leg);
  const market = stringOrFallback(leg.market, 'market unknown');
  const selection = stringOrFallback(leg.selection, 'selection unknown');
  const line = Number.isFinite(leg.line) ? ` ${formatNumber(leg.line, 2)}` : '';
  const odds = Number.isFinite(leg.odds) ? ` @ ${formatNumber(leg.odds, 2)}` : '';
  const confidence = Number.isFinite(leg.confidence) ? ` | conf ${formatPercent(leg.confidence)}` : '';
  const banker = leg.banker ? ' | banker' : '';
  return `${fixture}: ${market} ${selection}${line}${odds}${confidence}${banker}`;
}

function isUuidFixtureLabel(value) {
  const normalized = value.trim();
  if (isUuidLike(normalized)) return true;
  const parts = normalized.split(/\s+vs\.?\s+/i);
  return parts.length === 2 && parts.every(isUuidLike);
}

function shouldReplaceFixtureLabel(value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  return isUuidFixtureLabel(value);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim());
}

function shortId(value) {
  const text = String(value).trim();
  return text.length > 8 ? `${text.slice(0, 8)}...` : text || 'unknown';
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseMax(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
    throw new Error('--max must be an integer between 1 and 25.');
  }
  return parsed;
}

function parseTransport(value) {
  if (value === 'discord-native' || value === 'hermes-gateway' || value === 'webhook') return value;
  throw new Error('--transport must be "discord-native", "hermes-gateway", or "webhook".');
}

function numberOrFallback(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

export function formatMetricNumber(value, digits) {
  return Number.isFinite(value) ? formatNumber(value, digits) : 'n/a';
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${formatNumber(Number(value) * 100, 2)}%` : 'n/a';
}

export function rankEmoji(rank) {
  const ranks = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  return ranks[rank] ?? `${rank}.`;
}

function truncate(value, limit) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function paginateDiscordSelectionEmbeds(recommendations) {
  const pages = [];
  let index = 0;
  while (index < recommendations.length) {
    const remaining = recommendations.length - index;
    const isFirst = pages.length === 0;
    let capacity;
    if (isFirst) {
      capacity = remaining <= DISCORD_PAGINATED_SELECTION_EMBEDS_PER_MESSAGE
        ? DISCORD_SELECTION_EMBEDS_PER_MESSAGE
        : DISCORD_PAGINATED_SELECTION_EMBEDS_PER_MESSAGE;
    } else {
      capacity = remaining <= DISCORD_EMBED_LIMIT
        ? DISCORD_PAGINATED_SELECTION_EMBEDS_PER_MESSAGE
        : DISCORD_EMBED_LIMIT;
    }
    pages.push(recommendations.slice(index, index + capacity));
    index += capacity;
  }
  return pages;
}

function chunkLinesByLimit(lines, limit) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    const addition = current.length ? line.length + 1 : line.length;
    if (current.length && length + addition > limit) {
      chunks.push(current.join('\n'));
      current = [];
      length = 0;
    }
    current.push(line);
    length += current.length === 1 ? line.length : addition;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

function usage() {
  return [
    'Usage:',
    '  notify-discord-recommendations.mjs --artifact PATH [--max 14] [--single-message] [--gateway-target discord] [--dry-run]',
    '  notify-discord-recommendations.mjs --artifact PATH --transport discord-native --gateway-target discord:CHANNEL_ID',
    '  notify-discord-recommendations.mjs --artifact PATH --transport hermes-gateway --gateway-target discord:CHANNEL_ID',
    '  notify-discord-recommendations.mjs --latest [--artifact-root .artifacts/gana-v9/runs] [--dry-run]',
    '  notify-discord-recommendations.mjs --artifact PATH --transport webhook [--max 14]',
    '',
    'Environment:',
    '  HERMES_GATEWAY_PYTHON may override the Python used for Hermes gateway delivery.',
    '  DISCORD_WEBHOOK_URL is required only for --transport webhook.',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const artifactPath = resolveArtifactPath(options);
  const { artifact, recommendations } = loadRecommendations(artifactPath);
  const payload = options.singleMessage ? buildDiscordSinglePayload(artifact, options) : buildDiscordPayload(artifact, options);
  const payloads = options.singleMessage ? [payload] : buildDiscordPayloads(artifact, options);
  const gatewayMessage = buildGatewayMessage(artifact, options);

  if (options.dryRun) {
    console.log(JSON.stringify({
      artifactPath,
      selectionCount: recommendations.length,
      transport: options.transport,
      gatewayTarget: options.gatewayTarget,
      hermesPython: options.hermesPython,
      payload,
      payloads,
      gatewayMessage,
    }, null, 2));
    return;
  }

  if (options.transport === 'hermes-gateway') {
    const result = sendHermesGatewayMessage(options.gatewayTarget, gatewayMessage, { hermesPython: options.hermesPython });
    console.log(JSON.stringify({
      artifactPath,
      selectionCount: recommendations.length,
      transport: options.transport,
      gatewayTarget: options.gatewayTarget,
      gatewayResult: result,
    }, null, 2));
    return;
  }

  if (options.transport === 'discord-native') {
    const results = payloads.map((item) => sendDiscordNativePayload(options.gatewayTarget, item, { hermesPython: options.hermesPython }));
    console.log(JSON.stringify({
      artifactPath,
      selectionCount: recommendations.length,
      transport: options.transport,
      gatewayTarget: options.gatewayTarget,
      discordResult: results[0],
      discordResults: results,
    }, null, 2));
    return;
  }

  const results = [];
  for (const item of payloads) {
    results.push(await sendDiscordPayload(options.webhookUrl, item));
  }
  console.log(JSON.stringify({
    artifactPath,
    selectionCount: recommendations.length,
    transport: options.transport,
    discordStatus: results[0]?.status,
    discordStatuses: results.map((result) => result.status),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
