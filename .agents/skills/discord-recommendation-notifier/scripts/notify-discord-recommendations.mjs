#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
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
const REQUIRED_GENERAL_HIGH_PROBABILITY_FLOOR = 0.7;
const GUATEMALA_TIMEZONE = 'America/Guatemala';
const GUATEMALA_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: GUATEMALA_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

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
  attachRequiredLeagueRecommendations(artifact, path);
  attachRequiredLeagueGeneralPredictions(artifact, path);
  const recommendations = selectRecommendations(artifact);
  return { artifact, recommendations };
}

export function buildDiscordPayload(artifact, options = {}) {
  const max = parseMax(String(options.max ?? DEFAULT_MAX_SELECTIONS));
  const requiredLeagueEmbeds = requiredLeagueDiscordEmbeds(artifact);
  const selectionLimit = Math.min(max, Math.max(1, DISCORD_EMBED_LIMIT - DISCORD_NON_SELECTION_EMBEDS - requiredLeagueEmbeds.length));
  const recommendations = hydrateRecommendationDisplayLabels(selectRecommendations(artifact).slice(0, selectionLimit));
  return buildDiscordPayloadPage(recommendations, { ...options, artifact, artifactDate: artifact?.date });
}

export function buildDiscordPayloads(artifact, options = {}) {
  const max = parseMax(String(options.max ?? DEFAULT_MAX_SELECTIONS));
  const recommendations = hydrateRecommendationDisplayLabels(selectRecommendations(artifact).slice(0, max));
  if (!recommendations.length) return [buildDiscordPayloadPage([], { ...options, artifact, artifactDate: artifact?.date })];
  const pages = paginateDiscordSelectionEmbeds(recommendations, artifact);
  return pages.map((pageRecommendations, index) => buildDiscordPayloadPage(pageRecommendations, {
    ...options,
    artifact,
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
  const hasRequiredSelections = hasRequiredLeagueSelections(artifact);
  const embeds = [{
    title: '🏆 Gana v9 · Recomendaciones',
    description: formatHeaderDescription(artifact, counts, artifact?.date),
    color: 0x2f80ed,
    footer: { text: 'Gana Hermes · Discord native embeds' },
    timestamp: new Date().toISOString(),
  }];

  if (!recommendations.length && !hasRequiredSelections) {
    embeds.push({
      title: 'Sin selecciones',
      description: '> El artifact no contiene selecciones para notificar.',
      color: 0x828282,
    });
  } else {
    const lines = recommendations.flatMap((recommendation, index) => formatCompactRecommendationLines(recommendation, index));
    const descriptions = chunkLinesByLimit(lines, DISCORD_DESCRIPTION_LIMIT - 200);
    const availableSelectionEmbeds = Math.max(1, DISCORD_EMBED_LIMIT - DISCORD_NON_SELECTION_EMBEDS - requiredLeagueDiscordEmbeds(artifact).length);
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

  embeds.push(...requiredLeagueDiscordEmbeds(artifact));
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
  const includeRequiredLeague = page === pageCount;
  const includeClosing = page === pageCount;
  const embeds = [];

  if (includeHeader) {
    embeds.push({
      title: '🏆 Gana v9 · Recomendaciones',
      description: formatHeaderDescription(options.artifact, totalCounts, options.artifactDate),
      color: 0x2f80ed,
      footer: { text: 'Gana Hermes · Discord native embeds' },
      timestamp: new Date().toISOString(),
    });
  }

  if (recommendations.length) {
    embeds.push(...recommendations.map((recommendation, index) => recommendationEmbed(recommendation, index)));
  } else if (!hasRequiredLeagueSelections(options.artifact)) {
    embeds.push({
      title: 'Sin selecciones',
      description: '> El artifact no contiene selecciones para notificar.',
      color: 0x828282,
    });
  }

  if (includeRequiredLeague) {
    embeds.push(...requiredLeagueDiscordEmbeds(options.artifact));
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

function formatHeaderDescription(artifact, dailyCounts, artifactDate) {
  const required = requiredLeagueCounts(artifact);
  const date = formatArtifactDate(artifactDate);
  const lines = [];
  if (required) {
    lines.push(`📅 Diario: ${recommendationCountLine(dailyCounts)}`);
    lines.push(`🌍 Obligatorio ${required.title}: ${required.statusIcon} 📦 ${required.selectedParlays} ${required.selectedParlays === 1 ? 'parlay' : 'parlays'} · 📌 ${required.atomic} ${required.atomic === 1 ? 'predicción' : 'predicciones'}`);
    lines.push(`📊 Total enviado: 📦 ${dailyCounts.parlay + required.selectedParlays} ${(dailyCounts.parlay + required.selectedParlays) === 1 ? 'parlay' : 'parlays'} · 📌 ${dailyCounts.atomic + required.atomic} ${(dailyCounts.atomic + required.atomic) === 1 ? 'predicción' : 'predicciones'}`);
  } else {
    lines.push(recommendationCountLine(dailyCounts));
  }
  if (date) lines.push(date);
  lines.push(...formatParlayApproachLines(artifact?.parlayApproaches, required ? '🎛️ Enfoques diarios' : '🎛️ Enfoques'));
  return lines.filter(Boolean).join('\n');
}

function formatGatewayHeaderLines(artifact, dailyCounts) {
  const required = requiredLeagueCounts(artifact);
  if (!required) return [recommendationCountLine(dailyCounts)];
  return [
    `📅 Diario: ${recommendationCountLine(dailyCounts)}`,
    `🌍 Obligatorio ${required.title}: ${required.statusIcon} 📦 ${required.selectedParlays} ${required.selectedParlays === 1 ? 'parlay' : 'parlays'} · 📌 ${required.atomic} ${required.atomic === 1 ? 'predicción' : 'predicciones'}`,
    `📊 Total enviado: 📦 ${dailyCounts.parlay + required.selectedParlays} ${(dailyCounts.parlay + required.selectedParlays) === 1 ? 'parlay' : 'parlays'} · 📌 ${dailyCounts.atomic + required.atomic} ${(dailyCounts.atomic + required.atomic) === 1 ? 'predicción' : 'predicciones'}`,
  ];
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
    ...formatGatewayHeaderLines(artifact, counts),
    ...formatParlayApproachLines(artifact?.parlayApproaches, requiredLeagueCounts(artifact) ? '🎛️ Enfoques diarios' : '🎛️ Enfoques'),
    ...formatRequiredLeagueLines(artifact),
    `🟡 ${status} · ${validation} · 💧 ${risk}`,
    '⚠️ Sin ejecución monetaria · Sin garantía',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
  ];

  if (!recommendations.length && !hasRequiredLeagueSelections(artifact)) {
    lines.push('> Sin selecciones: el artifact no contiene selecciones para notificar.', '');
  } else {
    for (const [index, recommendation] of recommendations.entries()) {
      lines.push(...formatCompactRecommendationLines(recommendation, index));
    }
    const requiredDetails = formatRequiredLeagueGatewayDetailLines(artifact);
    if (requiredDetails.length) lines.push(...requiredDetails);
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

export function attachRequiredLeagueRecommendations(artifact, artifactPath) {
  if (artifact.requiredLeagueRecommendations && typeof artifact.requiredLeagueRecommendations === 'object') return;
  const requiredPath = typeof artifact.requiredLeagueRecommendationsPath === 'string'
    ? artifact.requiredLeagueRecommendationsPath.trim()
    : '';
  if (!requiredPath) return;
  const resolved = isAbsolute(requiredPath)
    ? requiredPath
    : resolve(dirname(artifactPath), requiredPath);
  if (!existsSync(resolved)) return;
  try {
    const requiredLeagueRecommendations = JSON.parse(readFileSync(resolved, 'utf8'));
    if (requiredLeagueRecommendations && typeof requiredLeagueRecommendations === 'object') {
      artifact.requiredLeagueRecommendations = requiredLeagueRecommendations;
    }
  } catch {
    // Keep recommendation delivery resilient; the header still carries goal status.
  }
}

export function attachRequiredLeagueGeneralPredictions(artifact, artifactPath) {
  if (Array.isArray(artifact.requiredLeagueGeneralPredictions)) return;
  const data = requiredLeagueData(artifact);
  const fixtures = Array.isArray(data?.coverage?.fixtures) ? data.coverage.fixtures : [];
  if (!fixtures.length) return;
  const comparisonPath = typeof artifact.providerComparisonPath === 'string'
    ? artifact.providerComparisonPath.trim()
    : '';
  if (!comparisonPath) return;
  const resolved = isAbsolute(comparisonPath)
    ? comparisonPath
    : resolve(dirname(artifactPath), comparisonPath);
  if (!existsSync(resolved)) return;
  try {
    const comparison = JSON.parse(readFileSync(resolved, 'utf8'));
    const predictions = requiredLeagueGeneralPredictionsFromComparison(comparison, fixtures);
    if (predictions.length) artifact.requiredLeagueGeneralPredictions = predictions;
  } catch {
    // The required addendum remains deliverable without the optional general-analysis section.
  }
}

function requiredLeagueGeneralPredictionsFromComparison(comparison, fixtures) {
  const fixtureByKey = requiredLeagueFixtureMetaByKey(fixtures);
  const items = Array.isArray(comparison?.items) ? comparison.items : [];
  const predictions = [];
  for (const item of items) {
    const itemKeys = requiredLeagueFixtureKeys(item);
    const fixture = itemKeys.map((key) => fixtureByKey.get(key)).find(Boolean);
    if (!fixture) continue;
    const providers = Array.isArray(item?.providers) ? item.providers : [];
    for (const provider of providers) {
      const probability = firstFinite([provider?.modelProbability, provider?.probability]);
      const modelConfidence = Number.isFinite(provider?.confidence) ? provider.confidence : null;
      const displayConfidence = probability ?? modelConfidence;
      predictions.push({
        fixtureId: stringOrFallback(item?.fixtureId, fixture.fixtureId ?? ''),
        providerFixtureId: stringOrFallback(item?.providerFixtureId, fixture.providerFixtureId ?? ''),
        fixture: stringOrFallback(fixture.fixture, requiredLeagueFixtureLabel(fixture)),
        display: fixture.display,
        market: stringOrFallback(item?.market, ''),
        selection: stringOrFallback(provider?.selection, ''),
        line: Number.isFinite(provider?.line) ? provider.line : Number.isFinite(item?.line) ? item.line : null,
        odds: Number.isFinite(provider?.odds) ? provider.odds : null,
        confidence: displayConfidence,
        displayConfidence,
        probability: Number.isFinite(provider?.probability) ? provider.probability : null,
        modelProbability: Number.isFinite(provider?.modelProbability) ? provider.modelProbability : null,
        modelConfidence,
        expectedEdge: Number.isFinite(provider?.edge) ? provider.edge : null,
        provider: stringOrFallback(provider?.provider, 'provider'),
        status: stringOrFallback(provider?.status, 'review-required'),
      });
    }
  }
  return predictions;
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

function formatParlayApproachLines(approaches, label = '🎛️ Enfoques') {
  if (!Array.isArray(approaches) || !approaches.length) return [];
  const compact = approaches.slice(0, 3).map((approach) => {
    const profile = stringOrFallback(approach?.profile, 'unknown');
    const status = stringOrFallback(approach?.status, 'unknown');
    const statusIcon = status === 'selected' ? '✅' : status === 'blocked' ? '🚫' : '🟡';
    const odds = Number.isFinite(approach?.combinedOdds) ? ` @ ${formatNumber(approach.combinedOdds, 2)}` : '';
    return `${statusIcon} ${parlayProfileEmoji(profile)} ${profile}${odds}`;
  });
  return [`${label}: ${compact.join(' · ')}`];
}

export function requiredLeagueData(artifact) {
  const embedded = artifact?.requiredLeagueRecommendations;
  if (embedded && typeof embedded === 'object') return embedded;
  if (artifact?.requiredLeagueCoverage || artifact?.requiredLeagueGoalCheck) {
    return {
      coverage: artifact.requiredLeagueCoverage,
      goalCheck: artifact.requiredLeagueGoalCheck,
      parlayProjections: artifact.requiredLeagueParlayProjections,
      atomicProjections: artifact.requiredLeagueAtomicProjections,
    };
  }
  return undefined;
}

function requiredLeagueCounts(artifact) {
  const data = requiredLeagueData(artifact);
  if (!data) return undefined;
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  const atomicProjections = Array.isArray(data.atomicProjections) ? data.atomicProjections : [];
  const selectedParlays = parlayProjections.filter((projection) => projection?.status === 'selected').length;
  const status = requiredLeagueStatus(data);
  return {
    title: requiredLeagueTitle(data),
    status,
    statusIcon: status === 'passed' ? '✅' : status === 'blocked' ? '🚫' : '🟡',
    atomic: atomicProjections.length,
    parlays: parlayProjections.length,
    selectedParlays,
  };
}

function requiredLeagueFixtureMetaByKey(fixtures) {
  const byKey = new Map();
  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    for (const key of requiredLeagueFixtureKeys(fixture)) {
      if (key && !byKey.has(key)) byKey.set(key, fixture);
    }
  }
  return byKey;
}

function requiredLeagueFixtureOrder(fixtures) {
  const order = new Map();
  for (const [index, fixture] of (Array.isArray(fixtures) ? fixtures : []).entries()) {
    for (const key of requiredLeagueFixtureKeys(fixture)) {
      if (key && !order.has(key)) order.set(key, index);
    }
  }
  return order;
}

function requiredLeagueFixtureKeys(item) {
  return uniqueStrings([
    item?.fixtureId,
    item?.providerFixtureId,
    item?.fixture,
    item?.display?.fixtureLabel,
  ]);
}

function hasRequiredLeagueSelections(artifact) {
  const counts = requiredLeagueCounts(artifact);
  return Boolean(counts && (counts.atomic > 0 || counts.selectedParlays > 0));
}

function requiredLeagueDiscordEmbeds(artifact) {
  const data = requiredLeagueData(artifact);
  if (!data) return [];
  const summaryLines = formatRequiredLeagueSummaryLines(data);
  if (!summaryLines.length) return [];
  const embeds = [{
    title: `🌍 Obligatorio · ${requiredLeagueTitle(data)}`,
    description: truncate(summaryLines.map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
    color: requiredLeagueStatus(data) === 'passed' ? 0x27ae60 : 0xf2994a,
  }];
  const predictionLines = formatRequiredLeaguePredictionLines(data);
  if (predictionLines.length) {
    embeds.push({
      title: `📌 Predicciones obligatorias · ${requiredLeagueTitle(data)}`,
      description: truncate(predictionLines.map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: 0x9b51e0,
    });
  }
  const generalPredictionLines = formatRequiredLeagueGeneralPredictionLines(artifact, data);
  if (generalPredictionLines.length) {
    const descriptions = chunkLinesByLimit(generalPredictionLines.map((line) => `> ${line}`), DISCORD_DESCRIPTION_LIMIT);
    for (const [index, description] of descriptions.entries()) {
      embeds.push({
        title: index === 0
          ? `📋 Predicciones generales · ${requiredLeagueTitle(data)}`
          : `📋 Predicciones generales cont. ${index + 1} · ${requiredLeagueTitle(data)}`,
        description: truncate(description, DISCORD_DESCRIPTION_LIMIT),
        color: 0x56ccf2,
      });
    }
  }
  embeds.push(...requiredLeagueParlayDiscordEmbeds(data));
  return embeds;
}

function formatRequiredLeagueLines(artifact) {
  const data = requiredLeagueData(artifact);
  if (!data) return [];
  const title = requiredLeagueTitle(data);
  const status = requiredLeagueStatus(data);
  const statusIcon = status === 'passed' ? '✅' : status === 'blocked' ? '🚫' : '🟡';
  const fixtures = data.coverage?.fixtureCount;
  const covered = data.coverage?.coveredFixtures;
  const fixturePart = Number.isFinite(fixtures) && Number.isFinite(covered)
    ? ` · ${covered}/${fixtures} fixtures`
    : '';
  return [`🌍 Obligatorio ${title}: ${statusIcon} ${status}${fixturePart}`];
}

function formatRequiredLeagueGatewayDetailLines(artifact) {
  const data = requiredLeagueData(artifact);
  if (!data) return [];
  const title = requiredLeagueTitle(data);
  const lines = [];
  const summaryLines = formatRequiredLeagueSummaryLines(data);
  if (summaryLines.length) {
    lines.push(`🌍 Obligatorio · ${title}`);
    lines.push(...summaryLines.map((line) => `> ${line}`));
    lines.push('');
  }
  const predictionLines = formatRequiredLeaguePredictionLines(data);
  if (predictionLines.length) {
    lines.push(`📌 Predicciones obligatorias · ${title}`);
    lines.push(...predictionLines.map((line) => `> ${line}`));
    lines.push('');
  }
  const generalPredictionLines = formatRequiredLeagueGeneralPredictionLines(artifact, data);
  if (generalPredictionLines.length) {
    lines.push(`📋 Predicciones generales · ${title}`);
    lines.push(...generalPredictionLines.map((line) => `> ${line}`));
    lines.push('');
  }
  const parlayLines = formatRequiredLeagueParlayLines(data);
  if (parlayLines.length) {
    lines.push(`🎛️ Parlays obligatorios · ${title}`);
    lines.push(...parlayLines.map((line) => `> ${line}`));
    lines.push('');
  }
  return lines;
}

function formatRequiredLeagueSummaryLines(data) {
  const lines = [];
  const coverage = data.coverage && typeof data.coverage === 'object' ? data.coverage : {};
  const fixtures = Array.isArray(coverage.fixtures) ? coverage.fixtures : [];
  for (const fixture of fixtures.slice(0, 4)) {
    const status = stringOrFallback(fixture?.status, 'unknown');
    const icon = status === 'covered' ? '✅' : status === 'missing-predictions' ? '🚫' : '🟡';
    const predictionCount = Number.isFinite(fixture?.predictionCount) ? fixture.predictionCount : 0;
    const promotableCount = Number.isFinite(fixture?.promotableCount) ? fixture.promotableCount : 0;
    const detail = status === 'missing-predictions'
      ? 'sin predicción válida'
      : `${promotableCount} ${promotableCount === 1 ? 'proyección fuerte' : 'proyecciones fuertes'} / ${predictionCount} ${predictionCount === 1 ? 'predicción' : 'predicciones'}`;
    lines.push(`${icon} ${requiredLeagueFixtureLabelWithKickoff(fixture)}:`);
    lines.push(detail);
  }

  const atomic = Array.isArray(data.atomicProjections) ? data.atomicProjections : [];
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  const selectedParlays = parlayProjections.filter((projection) => projection?.status === 'selected').length;
  if (atomic.length || parlayProjections.length) {
    lines.push(`📌 ${atomic.length} ${atomic.length === 1 ? 'predicción obligatoria' : 'predicciones obligatorias'} · 🎛️ ${selectedParlays}/${parlayProjections.length} ${parlayProjections.length === 1 ? 'parlay seleccionado' : 'parlays seleccionados'}`);
  }
  const nextActions = Array.isArray(data.goalCheck?.nextActions) ? data.goalCheck.nextActions : [];
  if (nextActions.length) lines.push(`🛠️ Próximo: ${stringOrFallback(nextActions[0], 'revisión requerida')}`);
  return lines;
}

function formatRequiredLeaguePredictionLines(data) {
  const lines = [];
  const atomic = Array.isArray(data.atomicProjections) ? data.atomicProjections : [];
  for (const projection of atomic.slice(0, 4)) {
    const status = stringOrFallback(projection?.status, 'unknown');
    const icon = status === 'promotable' ? '✅' : status === 'blocked' ? '🚫' : '🟡';
    const confidence = Number.isFinite(projection?.confidence) ? ` · Conf ${formatIntegerPercent(projection.confidence)}` : '';
    lines.push(`${icon} ${requiredLeagueFixtureLabel(projection)}`);
    lines.push(`   ${formatRequiredPick(projection)} @ ${formatMetricNumber(projection?.odds, 2)}${confidence}`);
  }
  return lines;
}

function formatRequiredLeagueGeneralPredictionLines(artifact, data) {
  const predictions = requiredLeagueGeneralPredictionSource(artifact, data);
  if (!predictions.length) return [];
  const fixtures = Array.isArray(data?.coverage?.fixtures) ? data.coverage.fixtures : [];
  const fixtureByKey = requiredLeagueFixtureMetaByKey(fixtures);
  const fixtureOrder = requiredLeagueFixtureOrder(fixtures);
  const groupsByFixture = new Map();
  for (const group of groupRequiredLeagueGeneralPredictions(predictions)) {
    const key = requiredLeagueGeneralPredictionFixtureKey(group, fixtureByKey);
    if (!key) continue;
    if (!groupsByFixture.has(key)) groupsByFixture.set(key, []);
    groupsByFixture.get(key).push(group);
  }

  const orderedKeys = [...groupsByFixture.keys()].sort((a, b) =>
    numberOrFallback(fixtureOrder.get(a), 999) - numberOrFallback(fixtureOrder.get(b), 999)
    || requiredLeagueFixtureLabel(requiredLeagueGeneralFixtureForKey(a, fixtureByKey, groupsByFixture.get(a)?.[0])).localeCompare(requiredLeagueFixtureLabel(requiredLeagueGeneralFixtureForKey(b, fixtureByKey, groupsByFixture.get(b)?.[0]))),
  );
  const lines = [];
  for (const key of orderedKeys) {
    const groups = groupsByFixture.get(key) ?? [];
    const fixture = requiredLeagueGeneralFixtureForKey(key, fixtureByKey, groups[0]);
    lines.push(requiredLeagueFixtureLabel(fixture));
    const coherentGroups = cohereRequiredLeagueGeneralPredictionGroups(groups);
    const filteredGroups = filterRequiredLeagueGeneralPredictionGroups(coherentGroups)
      .sort(compareRequiredLeagueGeneralPredictionGroups);
    for (const group of filteredGroups.slice(0, 8)) {
      lines.push(`\t${formatRequiredLeagueGeneralPredictionGroup(group)}`);
    }
    if (filteredGroups.length > 8) lines.push(`\t+${filteredGroups.length - 8} predicciones adicionales`);
  }
  return lines;
}

function requiredLeagueGeneralPredictionSource(artifact, data) {
  const fromData = Array.isArray(data?.generalPredictions) ? data.generalPredictions : [];
  if (fromData.length) return fromData;
  return Array.isArray(artifact?.requiredLeagueGeneralPredictions) ? artifact.requiredLeagueGeneralPredictions : [];
}

function groupRequiredLeagueGeneralPredictions(predictions) {
  const groups = new Map();
  for (const prediction of predictions) {
    const market = stringOrFallback(prediction?.market, '');
    const selection = stringOrFallback(prediction?.selection, '');
    if (!market || !selection) continue;
    const line = Number.isFinite(prediction?.line) ? prediction.line : null;
    const key = [
      ...requiredLeagueFixtureKeys(prediction).slice(0, 1),
      market,
      selection,
      line === null ? '' : formatNumber(line, 2),
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        fixtureId: prediction.fixtureId,
        providerFixtureId: prediction.providerFixtureId,
        fixture: prediction.fixture,
        display: prediction.display,
        market,
        selection,
        line,
        predictions: [],
      });
    }
    groups.get(key).predictions.push(prediction);
  }
  return [...groups.values()];
}

function compareRequiredLeagueGeneralPredictionGroups(a, b) {
  return requiredLeagueMarketRank(a.market) - requiredLeagueMarketRank(b.market)
    || requiredLeagueStatusRank(b) - requiredLeagueStatusRank(a)
    || maxRequiredLeagueGeneralConfidence(b) - maxRequiredLeagueGeneralConfidence(a)
    || formatRequiredPick(a).localeCompare(formatRequiredPick(b));
}

function filterRequiredLeagueGeneralPredictionGroups(groups) {
  const bestGoalsGroup = groups
    .filter((group) => group?.market === 'goals_over_under')
    .sort((a, b) =>
      requiredLeagueStatusRank(b) - requiredLeagueStatusRank(a)
      || maxRequiredLeagueGeneralConfidence(b) - maxRequiredLeagueGeneralConfidence(a)
      || meanFinite(b.predictions?.map((prediction) => prediction?.expectedEdge)) - meanFinite(a.predictions?.map((prediction) => prediction?.expectedEdge)),
    )[0];
  const bestBinaryGroups = new Set();
  const binaryGroupsByKey = new Map();
  for (const group of groups) {
    if (!isRequiredLeagueBinaryDisplayMarket(group?.market)) continue;
    const key = `${group.market}|${Number.isFinite(group.line) ? formatNumber(group.line, 2) : ''}`;
    binaryGroupsByKey.set(key, [...(binaryGroupsByKey.get(key) ?? []), group]);
  }
  for (const binaryGroups of binaryGroupsByKey.values()) {
    const best = binaryGroups
      .sort((a, b) =>
        maxRequiredLeagueGeneralConfidence(b) - maxRequiredLeagueGeneralConfidence(a)
        || requiredLeagueStatusRank(b) - requiredLeagueStatusRank(a)
        || meanFinite(b.predictions?.map((prediction) => prediction?.expectedEdge)) - meanFinite(a.predictions?.map((prediction) => prediction?.expectedEdge)),
      )[0];
    if (best && maxRequiredLeagueGeneralConfidence(best) >= 0.5) bestBinaryGroups.add(best);
  }
  return groups.filter((group) => {
    if (group?.market === 'goals_over_under') return group === bestGoalsGroup;
    if (isRequiredLeagueBinaryDisplayMarket(group?.market)) return bestBinaryGroups.has(group);
    return true;
  });
}

function cohereRequiredLeagueGeneralPredictionGroups(groups) {
  const h2hConfidenceBySelection = new Map();
  for (const group of groups) {
    if (group?.market !== 'h2h') continue;
    const confidence = maxRequiredLeagueGeneralConfidence(group);
    if (!Number.isFinite(confidence)) continue;
    const current = h2hConfidenceBySelection.get(group.selection);
    if (!Number.isFinite(current) || confidence > current) h2hConfidenceBySelection.set(group.selection, confidence);
  }

  return groups.map((group) => {
    if (group?.market !== 'double_chance') return group;
    const floor = Math.max(...doubleChanceH2hSelections(group.selection)
      .map((selection) => h2hConfidenceBySelection.get(selection))
      .filter(Number.isFinite));
    if (!Number.isFinite(floor) || maxRequiredLeagueGeneralConfidence(group) >= floor) return group;
    return {
      ...group,
      predictions: (Array.isArray(group.predictions) ? group.predictions : []).map((prediction) => {
        const current = requiredLeagueGeneralPredictionDisplayConfidence(prediction);
        const displayConfidence = Math.max(Number.isFinite(current) ? current : 0, floor);
        return {
          ...prediction,
          displayConfidence,
          coherenceAdjusted: true,
        };
      }),
    };
  });
}

function doubleChanceH2hSelections(selection) {
  if (selection === 'home_or_draw') return ['home', 'draw'];
  if (selection === 'draw_or_away') return ['draw', 'away'];
  if (selection === 'home_or_away') return ['home', 'away'];
  return [];
}

function isRequiredLeagueBinaryDisplayMarket(market) {
  return market === 'corners_over_under' || market === 'btts';
}

function formatRequiredLeagueGeneralPredictionGroup(group) {
  const predictions = Array.isArray(group?.predictions) ? group.predictions : [];
  const statusIcon = requiredLeagueGeneralStatusIcon(predictions);
  const odds = formatNumberRange(predictions.map((prediction) => prediction?.odds), 2);
  const confidence = formatIntegerPercent(requiredLeagueGeneralGroupConfidence(group));
  const parts = [
    `${statusIcon} ${requiredLeagueGeneralMarketIcon(group.market)} ${formatRequiredPick(group)} @ ${odds}`,
    `Conf ${confidence}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

function requiredLeagueGeneralPredictionFixtureKey(group, fixtureByKey) {
  const keys = requiredLeagueFixtureKeys(group);
  return keys.find((key) => fixtureByKey.has(key)) ?? keys[0] ?? '';
}

function requiredLeagueGeneralFixtureForKey(key, fixtureByKey, group) {
  return fixtureByKey.get(key) ?? group ?? { fixture: key };
}

function requiredLeagueGeneralStatusIcon(predictions) {
  const statuses = predictions.map((prediction) => stringOrFallback(prediction?.status, 'review-required'));
  if (statuses.includes('promotable') || statuses.includes('selected')) return '✅';
  if (statuses.includes('review-required')) return '🟡';
  if (statuses.includes('blocked')) return requiredLeagueGeneralBlockedButHighProbability(predictions) ? '🟡' : '🚫';
  return '🟡';
}

function requiredLeagueGeneralBlockedButHighProbability(predictions) {
  const values = Array.isArray(predictions) ? predictions : [];
  return values.some((prediction) =>
    prediction?.market === 'double_chance'
    && requiredLeagueGeneralPredictionDisplayConfidence(prediction) >= REQUIRED_GENERAL_HIGH_PROBABILITY_FLOOR
  );
}

function requiredLeagueStatusRank(group) {
  const predictions = Array.isArray(group?.predictions) ? group.predictions : [];
  const statuses = predictions.map((prediction) => stringOrFallback(prediction?.status, 'review-required'));
  if (statuses.includes('promotable') || statuses.includes('selected')) return 3;
  if (statuses.includes('review-required')) return 2;
  if (statuses.includes('blocked')) return 1;
  return 0;
}

function maxRequiredLeagueGeneralConfidence(group) {
  const values = (Array.isArray(group?.predictions) ? group.predictions : [])
    .map(requiredLeagueGeneralPredictionDisplayConfidence)
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function requiredLeagueGeneralGroupConfidence(group) {
  return meanFinite((Array.isArray(group?.predictions) ? group.predictions : [])
    .map(requiredLeagueGeneralPredictionDisplayConfidence));
}

function requiredLeagueGeneralPredictionDisplayConfidence(prediction) {
  return firstFinite([
    prediction?.displayConfidence,
    prediction?.modelProbability,
    prediction?.probability,
    prediction?.confidence,
  ]);
}

function requiredLeagueGeneralMarketIcon(market) {
  if (market === 'double_chance') return '👥';
  if (market === 'goals_over_under') return '🥅';
  if (market === 'corners_over_under') return '⛳';
  if (market === 'btts') return '🤝🏻';
  return '⚽';
}

function requiredLeagueMarketRank(market) {
  const order = ['h2h', 'double_chance', 'goals_over_under', 'btts', 'corners_over_under'];
  const index = order.indexOf(market);
  return index === -1 ? order.length : index;
}

function formatRequiredLeagueParlayLines(data) {
  const lines = [];
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  const blockedDiagnostics = [];
  for (const [index, projection] of parlayProjections.slice(0, 3).entries()) {
    const formatted = formatRequiredLeagueParlayProjection(projection);
    if (formatted.diagnostic) blockedDiagnostics.push(formatted.diagnostic);
    lines.push(requiredLeagueParlayBlockTitle(projection, index));
    lines.push(...formatted.lines.map((line) => `   ${line}`));
  }
  const uniqueDiagnostics = uniqueRequiredLeagueBlockedDiagnostics(blockedDiagnostics);
  for (const diagnostic of uniqueDiagnostics.slice(0, 2)) {
    lines.push('🔎 Mejor combo evaluado');
    lines.push(...formatRequiredLeagueParlayDiagnosticLines(diagnostic).map((line) => `   ${line}`));
  }
  return lines;
}

function requiredLeagueParlayDiscordEmbeds(data) {
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  const embeds = [];
  const blockedDiagnostics = [];
  for (const [index, projection] of parlayProjections.slice(0, 3).entries()) {
    const formatted = formatRequiredLeagueParlayProjection(projection);
    if (formatted.diagnostic) blockedDiagnostics.push(formatted.diagnostic);
    embeds.push({
      title: requiredLeagueParlayBlockTitle(projection, index),
      description: truncate(formatted.lines.map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: requiredLeagueParlayEmbedColor(projection, index),
    });
  }
  const uniqueDiagnostics = uniqueRequiredLeagueBlockedDiagnostics(blockedDiagnostics);
  for (const diagnostic of uniqueDiagnostics.slice(0, 2)) {
    embeds.push({
      title: `🔎 Mejor combo evaluado · ${requiredLeagueTitle(data)}`,
      description: truncate(formatRequiredLeagueParlayDiagnosticLines(diagnostic).map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: 0xf2994a,
    });
  }
  return embeds;
}

function formatRequiredLeagueParlayProjection(projection) {
  const legs = Array.isArray(projection?.legs) ? projection.legs : [];
  const lines = [];
  for (const leg of legs.slice(0, 8)) {
    lines.push(formatRequiredLeagueParlayLeg(leg));
  }
  const metrics = formatRequiredLeagueParlayMetricLine(projection);
  if (metrics) lines.push(metrics);
  let diagnostic = null;
  if (!legs.length) {
    diagnostic = parseRequiredLeagueBlockedParlayDiagnostic(projection);
    lines.push(formatRequiredLeagueBlockedParlayReason(projection, diagnostic));
  }
  if (!lines.length) lines.push('Sin detalle de selecciones.');
  return { lines, diagnostic };
}

function requiredLeagueParlayBlockTitle(projection, index) {
  const status = stringOrFallback(projection?.status, 'unknown');
  const profile = stringOrFallback(projection?.profile, 'profile unknown');
  const statusPrefix = status === 'selected' ? '' : status === 'blocked' ? '🚫 ' : '🟡 ';
  const title = requiredLeagueParlayFixtureTitle(projection);
  return truncate([
    `${rankEmoji(index + 1)} ${statusPrefix}${parlayProfileEmoji(profile)} ${profile}`,
    title,
  ].filter(Boolean).join(' · '), 256);
}

function requiredLeagueParlayFixtureTitle(projection) {
  const legs = Array.isArray(projection?.legs) ? projection.legs : [];
  if (!legs.length) return '';
  const shown = legs.slice(0, 4)
    .map(displayFixtureName)
    .join(' + ');
  return legs.length > 4 ? `${shown} +${legs.length - 4}` : shown;
}

function requiredLeagueParlayEmbedColor(projection, index) {
  const status = stringOrFallback(projection?.status, 'unknown');
  if (status !== 'selected') return 0xf2994a;
  return index === 0 ? 0xf2c94c : 0x27ae60;
}

function formatRequiredLeagueParlayMetricLine(projection) {
  const metrics = [
    Number.isFinite(projection?.combinedOdds) ? `📊 Odds ${formatNumber(projection.combinedOdds, 2)}` : undefined,
    Number.isFinite(projection?.aggregateConfidence) ? `🍀 Conf ${formatPercent(projection.aggregateConfidence)}` : undefined,
  ].filter(Boolean);
  return metrics.join(' · ');
}

function formatRequiredLeagueParlayDiagnosticLines(diagnostic) {
  const lines = [];
  for (const leg of diagnostic.legs.slice(0, 8)) {
    lines.push(`${formatMarketIcon(leg)} ${requiredLeagueFixtureLabel(leg)}: ${formatRequiredPick(leg)} @ ${formatMetricNumber(leg.odds, 2)} · Conf ${formatPercent(diagnosticLegConfidence(leg))}`);
  }
  const metrics = [
    Number.isFinite(diagnostic.combinedOdds) ? `📊 Odds ${formatMetricNumber(diagnostic.combinedOdds, 2)}` : undefined,
    Number.isFinite(diagnostic.aggregateConfidence) ? `🍀 Conf ${formatPercent(diagnostic.aggregateConfidence)}` : undefined,
    Number.isFinite(diagnostic.expectedEdge) ? `📈 Edge ${formatPercent(diagnostic.expectedEdge)}` : undefined,
  ].filter(Boolean);
  if (metrics.length) lines.push(metrics.join(' · '));
  if (diagnostic.missedGate) lines.push(`🚧 No supera piso: ${diagnostic.missedGate}`);
  return lines;
}

function formatRequiredLeagueParlayLeg(leg) {
  return `${formatMarketIcon(leg)} ${requiredLeagueFixtureLabel(leg)}: ${formatRequiredPick(leg)} @ ${formatMetricNumber(leg?.odds, 2)}`;
}

function formatRequiredLeagueBlockedParlayReason(projection, diagnostic = undefined) {
  const reasons = Array.isArray(projection?.reasons) ? projection.reasons : [];
  const riskFlags = Array.isArray(projection?.riskFlags) ? projection.riskFlags : [];
  if (riskFlags.includes('required-league-confidence-floor')) {
    if (diagnostic) return 'No publicado: confianza agregada insuficiente.';
    const diagnosticReason = reasons.find((reason) => /^(best rejected combo|mejor combo rechazado):/i.test(String(reason)));
    if (diagnosticReason) return 'No publicado: confianza agregada insuficiente.';
    const confidenceReason = reasons.find((reason) => /confidence floor|confidence floors/i.test(String(reason)));
    const profile = stringOrFallback(projection?.profile, 'este enfoque');
    if (confidenceReason) return `No se publica ${profile}: no hay cupón único con edge positivo y pisos de confianza.`;
    return 'No se publica: no supera pisos de confianza y edge positivo.';
  }
  if (Array.isArray(projection?.riskFlags) && projection.riskFlags.includes('duplicate-required-league-parlay')) {
    const duplicateReason = reasons.find((reason) => /^duplicate of /i.test(String(reason)));
    const match = /^duplicate of ([^;]+)/i.exec(String(duplicateReason ?? ''));
    const profile = match?.[1] ? match[1].trim() : 'otro enfoque';
    return `Duplicado de ${profile}; no se publica cupón idéntico.`;
  }
  if (stringOrFallback(projection?.status, '') === 'blocked') return 'No publicado: sin cupón válido.';
  return stringOrFallback(reasons[0], 'sin legs publicados');
}

function parseRequiredLeagueBlockedParlayDiagnostic(projection) {
  const reasons = Array.isArray(projection?.reasons) ? projection.reasons : [];
  const raw = reasons.find((reason) => /^(best rejected combo|mejor combo rechazado):/i.test(String(reason)));
  if (!raw) return null;
  const text = String(raw);
  const body = text.replace(/^(best rejected combo|mejor combo rechazado):\s*/i, '');
  const [legsText = '', ...detailParts] = body.split(/\s*;\s*/);
  const details = detailParts.join('; ');
  const legs = legsText.split(/\s+\+\s+/)
    .map(parseRequiredLeagueBlockedDiagnosticLeg)
    .filter(Boolean);
  if (!legs.length) return null;
  const combinedOdds = numberFromMatch(details, /(?:cuota|combined odds)\s+([0-9.]+)/i);
  const aggregateConfidence = percentFromMatch(details, /(?:confianza agregada|aggregate confidence)\s+([0-9.]+)%/i);
  const expectedEdge = percentFromMatch(details, /(?:edge esperado|expected edge)\s+([+-]?[0-9.]+)%/i);
  const missedGate = missedRequiredLeagueParlayGate(details);
  return {
    legs,
    combinedOdds,
    aggregateConfidence,
    expectedEdge,
    missedGate,
    signature: JSON.stringify({
      legs: legs.map((leg) => [requiredLeagueFixtureLabel(leg), leg.market, leg.selection, leg.line, leg.odds]),
      combinedOdds,
      aggregateConfidence,
      expectedEdge,
      missedGate,
    }),
  };
}

function parseRequiredLeagueBlockedDiagnosticLeg(value) {
  const text = String(value).trim();
  const match = /^(.*)\s+(h2h|double_chance|goals_over_under|corners_over_under|btts)\s+([a-z_]+)(?:\s+([0-9.]+))?\s+@\s+([0-9.]+)\s+\(([0-9.]+)%\)$/i.exec(text);
  if (!match) return null;
  const [, fixture, market, selection, lineText, oddsText, confidenceText] = match;
  const line = lineText === undefined ? null : Number(lineText);
  const odds = Number(oddsText);
  const confidence = Number(confidenceText) / 100;
  return {
    fixture: fixture.trim(),
    display: { fixtureLabel: fixture.trim() },
    market: market.toLowerCase(),
    selection: selection.toLowerCase(),
    line: Number.isFinite(line) ? line : null,
    odds: Number.isFinite(odds) ? odds : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
  };
}

function uniqueRequiredLeagueBlockedDiagnostics(diagnostics) {
  const seen = new Set();
  const unique = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic?.signature || seen.has(diagnostic.signature)) continue;
    seen.add(diagnostic.signature);
    unique.push(diagnostic);
  }
  return unique;
}

function missedRequiredLeagueParlayGate(details) {
  const spanish = /no supera:\s*(.+)$/i.exec(details);
  const english = /missed gates:\s*(.+)$/i.exec(details);
  const raw = (spanish?.[1] ?? english?.[1] ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/\baggregate confidence\b/gi, 'confianza agregada')
    .replace(/\bmin leg confidence\b/gi, 'confianza mínima por leg')
    .replace(/\bexpected edge\b/gi, 'edge esperado');
}

function diagnosticLegConfidence(leg) {
  return Number.isFinite(leg?.confidence) ? leg.confidence : 0;
}

function numberFromMatch(value, pattern) {
  const match = pattern.exec(String(value));
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentFromMatch(value, pattern) {
  const parsed = numberFromMatch(value, pattern);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

export function formatRequiredPick(item) {
  const market = stringOrFallback(item?.market, 'market');
  const selection = stringOrFallback(item?.selection, 'selection');
  const line = Number.isFinite(item?.line) ? formatMetricNumber(item.line, 2) : '';
  const { home, away } = requiredLeagueTeams(item);
  if (market === 'h2h') {
    if (selection === 'home') return `${home ?? 'Local'} gana`;
    if (selection === 'away') return `${away ?? 'Visitante'} gana`;
    if (selection === 'draw') return 'Empate';
  }
  if (market === 'double_chance') {
    if (selection === 'home_or_draw') return `${home ?? 'Local'} o empate`;
    if (selection === 'draw_or_away') return `Empate o ${away ?? 'visitante'}`;
    if (selection === 'home_or_away') return `${home ?? 'Local'} o ${away ?? 'visitante'}`;
  }
  if (market === 'goals_over_under') {
    const direction = selection === 'over' ? 'Más' : selection === 'under' ? 'Menos' : selection;
    return `${direction} de ${line || 'linea'} goles`;
  }
  if (market === 'corners_over_under') {
    const direction = selection === 'over' ? 'Más' : selection === 'under' ? 'Menos' : selection;
    return `${direction} de ${line || 'linea'} corners`;
  }
  if (market === 'btts') {
    if (selection === 'yes') return 'Ambos anotan: Sí';
    if (selection === 'no') return 'Ambos anotan: No';
  }
  return formatCompactSelection(item);
}

function requiredLeagueTeams(item) {
  const display = item?.display && typeof item.display === 'object' ? item.display : {};
  const homeFromDisplay = typeof display.homeTeamName === 'string' && display.homeTeamName.trim()
    ? display.homeTeamName.trim()
    : undefined;
  const awayFromDisplay = typeof display.awayTeamName === 'string' && display.awayTeamName.trim()
    ? display.awayTeamName.trim()
    : undefined;
  if (homeFromDisplay || awayFromDisplay) return { home: homeFromDisplay, away: awayFromDisplay };
  const label = rawRequiredLeagueFixtureLabel(item);
  const parts = label.split(/\s+vs\s+/i);
  return parts.length === 2
    ? { home: parts[0]?.trim(), away: parts[1]?.trim() }
    : { home: undefined, away: undefined };
}

export function requiredLeagueTitle(data) {
  const leagues = Array.isArray(data.requiredLeagues)
    ? data.requiredLeagues
    : Array.isArray(data.goalCheck?.requiredLeagues)
      ? data.goalCheck.requiredLeagues
      : [];
  const fromLeague = leagues
    .map((league) => stringOrFallback(league?.name, ''))
    .find(Boolean);
  const fixtureLeague = data.coverage?.fixtures?.find?.((fixture) => fixture?.league?.name || fixture?.display?.leagueName);
  return fromLeague
    || stringOrFallback(fixtureLeague?.league?.name, '')
    || stringOrFallback(fixtureLeague?.display?.leagueName, '')
    || 'ligas requeridas';
}

export function requiredLeagueStatus(data) {
  return stringOrFallback(data.goalCheck?.status ?? data.coverage?.status ?? data.status, 'review-required');
}

export function requiredLeagueFixtureLabel(item) {
  return compactFixtureName(rawRequiredLeagueFixtureLabel(item));
}

export function requiredLeagueFixtureLabelWithKickoff(item) {
  return fixtureLabelWithKickoff(rawRequiredLeagueFixtureLabel(item), item);
}

function rawRequiredLeagueFixtureLabel(item) {
  return compactFixtureName(
    item?.fixture
    || item?.display?.fixtureLabel
    || buildLabelFromTeams(item?.display?.homeTeamName, item?.display?.awayTeamName)
    || buildLabelFromTeams(item?.homeTeamName, item?.awayTeamName)
    || stringOrFallback(item?.providerFixtureId, 'fixture unknown'),
  );
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
  const typePrefix = recommendationTypePrefix(recommendation);
  const includeLegKickoff = false;
  const legLines = Array.isArray(recommendation.legs) && recommendation.legs.length
    ? recommendation.legs.slice(0, 8).map((leg) => `> ${formatCompactLeg(leg, { includeKickoff: includeLegKickoff })}`)
    : ['> Sin detalle de selecciones.'];
  if (Array.isArray(recommendation.legs) && recommendation.legs.length > 8) {
    legLines.push(`> +${recommendation.legs.length - 8} selecciones adicionales`);
  }
  legLines.push(formatCompactMetricLine(recommendation));
  return {
    title: `${rankEmoji(rank)} ${typePrefix}${recommendationTitle(recommendation)}`,
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
  const includeLegKickoff = false;
  const lines = [`${rankEmoji(rank)} ${recommendationTypePrefix(recommendation)}${recommendationTitle(recommendation)}`];

  if (Array.isArray(recommendation.legs) && recommendation.legs.length) {
    for (const leg of recommendation.legs.slice(0, 8)) {
      lines.push(`> ${formatCompactLeg(leg, { includeKickoff: includeLegKickoff })}`);
    }
    if (recommendation.legs.length > 8) lines.push(`> +${recommendation.legs.length - 8} selecciones adicionales`);
  } else {
    lines.push('> Sin detalle de selecciones.');
  }

  lines.push(formatCompactMetricLine(recommendation));
  lines.push('');
  return lines;
}

export function recommendationTypePrefix(recommendation) {
  if (recommendationKind(recommendation) === 'atomic-prediction') return '📌 Simple · ';
  return `${parlayProfileEmoji(recommendation?.profile)} `;
}

export function parlayProfileEmoji(profile) {
  const key = stringOrFallback(profile, '').toLowerCase();
  if (key === 'principal') return '💎';
  if (key === 'resultados') return '⚽';
  if (key === 'totales') return '🥅';
  if (key === 'mixto-seguro') return '🧩';
  if (key === 'parlay-diamante') return '💎';
  if (key === 'parlay-refinado') return '🧠';
  if (key === 'low-variance') return '🛡️';
  if (key === 'low-odds-top') return '📉';
  if (key === 'parlay-all-in') return '🚀';
  if (key === 'parlay-oro') return '🥇';
  if (key === 'balanced') return '⚖️';
  if (key === 'high-conviction') return '🔥';
  if (key === 'market-diverse') return '🧩';
  if (key === 'totals') return '🥅';
  if (key === 'conservative') return '🔒';
  if (key === 'review') return '🔎';
  return '🎟️';
}

export function recommendationTitle(recommendation) {
  if (!Array.isArray(recommendation.legs) || !recommendation.legs.length) {
    return stringOrFallback(recommendation.parlayId, 'Parlay sin titulo');
  }
  if (recommendationKind(recommendation) === 'atomic-prediction') {
    const leg = recommendation.legs[0];
    return displayFixtureName(leg);
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
  return displayFixtureNameWithOptions(leg, { includeKickoff: true });
}

function displayFixtureNameWithOptions(leg, options = {}) {
  const includeKickoff = options.includeKickoff !== false;
  const display = leg?.display && typeof leg.display === 'object' ? leg.display : {};
  const fromDisplay = display.fixtureLabel
    || buildLabelFromTeams(display.homeTeamName, display.awayTeamName)
    || buildLabelFromTeams(leg?.homeTeamName, leg?.awayTeamName)
    || leg?.fixtureLabel;
  if (typeof fromDisplay === 'string' && fromDisplay.trim() && !isUuidFixtureLabel(fromDisplay)) {
    const compact = compactFixtureName(fromDisplay);
    return includeKickoff ? fixtureLabelWithKickoff(compact, leg) : compact;
  }

  const fixture = typeof leg?.fixture === 'string' ? leg.fixture.trim() : '';
  if (fixture && !isUuidFixtureLabel(fixture)) {
    const compact = compactFixtureName(fixture);
    return includeKickoff ? fixtureLabelWithKickoff(compact, leg) : compact;
  }

  const fixtureId = typeof leg?.fixtureId === 'string' ? leg.fixtureId.trim() : '';
  const fallback = fixtureId ? `Fixture ${shortId(fixtureId)}` : 'fixture unknown';
  return includeKickoff ? fixtureLabelWithKickoff(fallback, leg) : fallback;
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

function fixtureLabelWithKickoff(label, item) {
  const compact = compactFixtureName(label).replace(/\s·\s(\d{2}:\d{2})\sGT\b/g, ' · $1');
  if (/\s·\s\d{2}:\d{2}\b/.test(compact)) return compact;
  const kickoff = formatKickoffGuatemala(item);
  return kickoff ? `${compact} · ${kickoff}` : compact;
}

function formatKickoffGuatemala(item) {
  const display = item?.display && typeof item.display === 'object' ? item.display : {};
  const value = [
    display.kickoffLocal,
    display.scheduledAt,
    item?.kickoffLocal,
    item?.scheduledAt,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return GUATEMALA_TIME_FORMATTER.format(date);
}

export function formatCompactLeg(leg, options = {}) {
  return `${formatMarketIcon(leg)} ${displayFixtureNameWithOptions(leg, options)}: ${formatCompactSelection(leg)} @ ${formatMetricNumber(leg.odds, 2)}`;
}

export function formatMarketIcon(leg) {
  const market = stringOrFallback(leg?.market, 'market');
  if (market === 'corners_over_under') return '⛳';
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
  const confidence = recommendationMetricConfidence(recommendation);
  const parts = [
    `> 📊 Odds ${formatMetricNumber(recommendation.combinedOdds, 4)}`,
    Number.isFinite(confidence) ? `🍀 Conf ${formatPercent(confidence)}` : undefined,
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
  const confidence = recommendationMetricConfidence(recommendation);
  if (Number.isFinite(confidence)) {
    parts.push(`Confidence ${formatPercent(confidence)}`);
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

function recommendationMetricConfidence(recommendation) {
  const candidates = [
    recommendation?.displayConfidence,
    recommendation?.aggregateConfidence,
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
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

function uniqueStrings(values) {
  return [...new Set(values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean))];
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

function formatNumberRange(values, digits) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 'n/a';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 0.000001) return formatNumber(min, digits);
  return `${formatNumber(min, digits)}-${formatNumber(max, digits)}`;
}

function meanFinite(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return NaN;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function firstFinite(values) {
  return values.find(Number.isFinite) ?? null;
}

function formatIntegerPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'n/a';
}

function formatPercentRange(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 'n/a';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 0.000001) return formatPercent(min);
  if (min < 0 || max < 0) return `${formatPercent(min)} a ${formatPercent(max)}`;
  return `${formatNumber(min * 100, 2)}-${formatNumber(max * 100, 2)}%`;
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

function paginateDiscordSelectionEmbeds(recommendations, artifact) {
  const requiredLeagueEmbedCount = requiredLeagueDiscordEmbeds(artifact).length;
  const pages = [];
  let index = 0;
  while (index < recommendations.length) {
    const remaining = recommendations.length - index;
    const isFirst = pages.length === 0;
    const lastPageFixedEmbeds = (isFirst ? 1 : 0) + requiredLeagueEmbedCount + 1;
    const lastPageCapacity = Math.max(1, DISCORD_EMBED_LIMIT - lastPageFixedEmbeds);
    let capacity;
    if (remaining <= lastPageCapacity) {
      capacity = lastPageCapacity;
    } else {
      const nonLastFixedEmbeds = isFirst ? 1 : 0;
      capacity = Math.min(Math.max(1, DISCORD_EMBED_LIMIT - nonLastFixedEmbeds), remaining - 1);
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
