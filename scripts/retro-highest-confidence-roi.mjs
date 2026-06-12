#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, '.artifacts/gana-v9/reports');
const RUNS_DIR = path.join(ROOT, '.artifacts/gana-v9/runs');
const INITIAL_BANKROLL = 100;
const AS_OF_DATE = '2026-06-09';

const dailyArtifacts = [
  ['2026-05-15', '.artifacts/gana-v9/runs/persisted-2026-05-15-discord/daily-parlay-recommendations.json'],
  ['2026-05-16', '.artifacts/gana-v9/runs/daily-2026-05-16-full/daily-parlay-recommendations.json'],
  ['2026-05-17', '.artifacts/gana-v9/runs/daily-2026-05-17-recovery-debug/daily-parlay-recommendations.json'],
  ['2026-05-18', '.artifacts/gana-v9/runs/daily-2026-05-18-full/daily-parlay-recommendations.json'],
  ['2026-05-19', '.artifacts/gana-v9/runs/daily-2026-05-19-corrected-local-date-bucket-stake/daily-parlay-recommendations.json'],
  ['2026-05-21', '.artifacts/gana-v9/runs/daily-2026-05-21-full/daily-parlay-recommendations.json'],
  ['2026-05-22', '.artifacts/gana-v9/runs/daily-2026-05-22-full/daily-parlay-recommendations.json'],
  ['2026-05-23', '.artifacts/gana-v9/runs/daily-2026-05-23-full/daily-parlay-recommendations.json'],
  ['2026-05-26', '.artifacts/gana-v9/runs/daily-2026-05-26-full/daily-parlay-recommendations.json'],
  ['2026-05-27', '.artifacts/gana-v9/runs/daily-2026-05-27-full/daily-parlay-recommendations.json'],
  ['2026-05-28', '.artifacts/gana-v9/runs/daily-2026-05-28-full/daily-parlay-recommendations.json'],
  ['2026-05-29', '.artifacts/gana-v9/runs/daily-2026-05-29-full/daily-parlay-recommendations.json'],
  ['2026-05-30', '.artifacts/gana-v9/runs/daily-2026-05-30-full/daily-parlay-recommendations.json'],
  ['2026-05-31', '.artifacts/gana-v9/runs/daily-2026-05-31-full/daily-parlay-recommendations.json'],
  ['2026-06-01', '.artifacts/gana-v9/runs/daily-2026-06-01-full/daily-parlay-recommendations.json'],
  ['2026-06-02', '.artifacts/gana-v9/runs/daily-2026-06-02-full/daily-parlay-recommendations.json'],
  ['2026-06-03', '.artifacts/gana-v9/runs/daily-2026-06-03-full/daily-parlay-recommendations.json'],
  ['2026-06-04', '.artifacts/gana-v9/runs/daily-2026-06-04-full/daily-parlay-recommendations.json'],
  ['2026-06-05', '.artifacts/gana-v9/runs/daily-2026-06-05-full/daily-parlay-recommendations.json'],
  ['2026-06-06', '.artifacts/gana-v9/runs/daily-2026-06-06-full/daily-parlay-recommendations.json'],
  ['2026-06-07', '.artifacts/gana-v9/runs/daily-2026-06-07-full/daily-parlay-recommendations.json'],
  ['2026-06-08', '.artifacts/gana-v9/runs/daily-2026-06-08-full/daily-parlay-recommendations.json'],
  ['2026-06-09', '.artifacts/gana-v9/runs/daily-2026-06-09-full/daily-parlay-recommendations.json'],
];

const noRecommendationDates = ['2026-05-14', '2026-05-20', '2026-05-24', '2026-05-25'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function num(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function confidenceOf(rec) {
  return num(rec.aggregateConfidence ?? rec.confidence ?? rec.adjustedProbability, 0);
}

function oddsOf(rec) {
  return num(rec.combinedOdds ?? rec.odds ?? rec.legs?.[0]?.odds, 0);
}

function idOf(rec) {
  return rec.kind === 'parlay'
    ? rec.parlayId
    : rec.predictionId ?? rec.predictionIds?.[0] ?? rec.legs?.[0]?.predictionId ?? rec.parlayId;
}

function stakePctOf(rec) {
  const recommendation = num(rec.stakeRecommendation?.percentOfBankroll);
  if (recommendation && recommendation > 0) return recommendation;
  const stake = num(rec.stake?.percentOfBankroll);
  if (stake && stake > 0) return stake;
  const exposure = num(rec.exposure?.percentOfAnalyticalBankroll);
  if (exposure && exposure > 0) return exposure;
  return 0.1;
}

function displayOf(rec) {
  const legs = Array.isArray(rec.legs) ? rec.legs : [];
  return legs
    .map((leg) => {
      const fixture = leg.display?.fixtureLabel ?? leg.fixture ?? leg.fixtureId ?? '';
      const market = leg.market ?? '';
      const selection = leg.selection ?? '';
      const line = leg.line === null || leg.line === undefined ? '' : ` ${leg.line}`;
      return `${fixture} | ${market} ${selection}${line}`.trim();
    })
    .filter(Boolean)
    .join(' ; ');
}

function normalizeStatus(status) {
  if (status === 'push' || status === 'voided') return 'voided';
  if (status === 'won' || status === 'lost' || status === 'pending' || status === 'blocked') return status;
  return status ? String(status) : 'unvalidated';
}

function pnlFor(status, stake, odds) {
  if (status === 'won') return stake * (odds - 1);
  if (status === 'lost') return -stake;
  return 0;
}

function findLatestValidationArtifacts() {
  const byArtifact = new Map();
  for (const dir of fs.readdirSync(RUNS_DIR)) {
    const file = path.join(RUNS_DIR, dir, 'validations.json');
    if (!fs.existsSync(file)) continue;
    let artifact;
    try {
      artifact = readJson(file);
    } catch {
      continue;
    }
    const target = artifact.target?.recommendationArtifact;
    if (!target) continue;
    const previous = byArtifact.get(target);
    const evaluatedAt = artifact.evaluatedAt ?? '';
    if (!previous || evaluatedAt > previous.evaluatedAt) {
      byArtifact.set(target, { ...artifact, artifactPath: file, evaluatedAt });
    }
  }
  return byArtifact;
}

function statusFromValidation(rec, validationArtifact) {
  if (!validationArtifact) return { status: 'unvalidated', validationArtifactPath: '' };
  const validations = Array.isArray(validationArtifact.validations) ? validationArtifact.validations : [];
  const recId = idOf(rec);
  const predictionIds = new Set([
    rec.predictionId,
    ...(Array.isArray(rec.predictionIds) ? rec.predictionIds : []),
    ...((Array.isArray(rec.legs) ? rec.legs : []).map((leg) => leg.predictionId)),
  ].filter(Boolean));

  const direct = validations.find((item) => (
    (rec.kind === 'parlay' && item.parlayId === recId)
    || (rec.kind !== 'parlay' && item.predictionId === recId)
    || (rec.kind !== 'parlay' && predictionIds.has(item.predictionId))
  ));

  if (direct) {
    return {
      status: normalizeStatus(direct.status ?? direct.outcome?.status),
      validationArtifactPath: validationArtifact.artifactPath,
    };
  }

  const legStatuses = (Array.isArray(rec.legs) ? rec.legs : [])
    .map((leg) => validations.find((item) => item.predictionId === leg.predictionId)?.status)
    .filter(Boolean)
    .map(normalizeStatus);
  if (legStatuses.includes('lost')) return { status: 'lost', validationArtifactPath: validationArtifact.artifactPath };
  if (legStatuses.includes('pending')) return { status: 'pending', validationArtifactPath: validationArtifact.artifactPath };
  if (legStatuses.length && legStatuses.every((status) => status === 'won' || status === 'voided')) {
    return { status: 'won', validationArtifactPath: validationArtifact.artifactPath };
  }
  return { status: 'unmatched', validationArtifactPath: validationArtifact.artifactPath };
}

function topRecommendationForArtifact(date, artifactPath, validationByArtifact) {
  const absolute = path.join(ROOT, artifactPath);
  const artifact = readJson(absolute);
  const recommendations = Array.isArray(artifact.recommendations) ? artifact.recommendations : [];
  if (!recommendations.length) return null;
  const top = [...recommendations].sort((a, b) => (
    confidenceOf(b) - confidenceOf(a)
    || num(a.rank, 9999) - num(b.rank, 9999)
    || num(b.score, 0) - num(a.score, 0)
  ))[0];
  const validation = validationByArtifact.get(artifactPath);
  const outcome = statusFromValidation(top, validation);
  return {
    date,
    source: 'daily-artifact',
    sourcePath: artifactPath,
    validationArtifactPath: outcome.validationArtifactPath,
    id: idOf(top),
    kind: top.kind ?? 'parlay',
    profile: top.profile ?? '',
    status: outcome.status,
    confidence: confidenceOf(top),
    odds: oddsOf(top),
    stakePct: stakePctOf(top),
    legs: Array.isArray(top.legs) ? top.legs.length : 1,
    selection: displayOf(top),
  };
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function loadBackfillSelections() {
  const csvPath = path.join(REPORT_DIR, 'parlays-2026-05-11-to-2026-05-13.csv');
  if (!fs.existsSync(csvPath)) return [];
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const header = parseCsvLine(lines.shift());
  const rows = lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
  });
  const byDate = new Map();
  for (const row of rows) {
    const date = row.fechaFixture.includes(',') ? row.fechaFixture.split(',').pop() : row.fechaFixture;
    if (!date) continue;
    const selection = {
      date,
      source: 'backfill-csv',
      sourcePath: '.artifacts/gana-v9/reports/parlays-2026-05-11-to-2026-05-13.csv',
      validationArtifactPath: '',
      id: row.id,
      kind: 'parlay',
      profile: row.perfil,
      status: normalizeStatus(row.validacion),
      confidence: num(row.confianza, 0),
      odds: num(row.cuota, 0),
      stakePct: 0.1,
      legs: num(row.piernas, 0),
      selection: row.fixtures,
    };
    const current = byDate.get(date);
    if (!current || selection.confidence > current.confidence) byDate.set(date, selection);
  }
  return [...byDate.values()];
}

function simulate(selections, mode) {
  let bankroll = INITIAL_BANKROLL;
  let totalStaked = 0;
  let net = 0;
  const rows = selections.map((selection) => {
    const settled = selection.status === 'won' || selection.status === 'lost' || selection.status === 'voided';
    const stake = !settled
      ? 0
      : mode === 'recommended_compounding'
        ? bankroll * selection.stakePct
        : 10;
    const pnl = settled ? pnlFor(selection.status, stake, selection.odds) : 0;
    bankroll += pnl;
    totalStaked += stake;
    net += pnl;
    return {
      ...selection,
      stake: round(stake),
      pnl: round(pnl),
      bankrollAfter: round(bankroll),
    };
  });
  return {
    mode,
    initialBankroll: INITIAL_BANKROLL,
    endingBankroll: round(bankroll),
    netProfit: round(net),
    totalStaked: round(totalStaked),
    roiOnInitialBankroll: roundPct((bankroll - INITIAL_BANKROLL) / INITIAL_BANKROLL),
    roiOnAmountStaked: totalStaked ? roundPct(net / totalStaked) : null,
    rows,
  };
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 100;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, rows) {
  const headers = [
    'date', 'source', 'kind', 'id', 'profile', 'status', 'confidence', 'odds',
    'stakePct', 'legs', 'flatStake', 'flatPnl', 'flatBankrollAfter',
    'recommendedStake', 'recommendedPnl', 'recommendedBankrollAfter',
    'sourcePath', 'validationArtifactPath', 'selection',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function writeMarkdown(filePath, selections, flat, recommended) {
  const settled = selections.filter((row) => ['won', 'lost', 'voided'].includes(row.status));
  const pending = selections.filter((row) => !['won', 'lost', 'voided'].includes(row.status));
  const won = settled.filter((row) => row.status === 'won').length;
  const lost = settled.filter((row) => row.status === 'lost').length;
  const voided = settled.filter((row) => row.status === 'voided').length;
  const hitRate = settled.length ? roundPct(won / (won + lost)) : null;
  const rows = selections.map((row, index) => {
    const flatRow = flat.rows[index];
    const recRow = recommended.rows[index];
    return `| ${row.date} | ${row.kind} | ${row.profile} | ${row.status} | ${row.confidence.toFixed(3)} | ${row.odds.toFixed(3)} | $${flatRow.stake.toFixed(2)} | $${flatRow.pnl.toFixed(2)} | $${recRow.stake.toFixed(2)} | $${recRow.pnl.toFixed(2)} | ${row.id} |`;
  });
  const md = [
    '# Retro ROI: top confianza diaria',
    '',
    `As of: ${AS_OF_DATE}`,
    '',
    '## Scope',
    '',
    '- Bankroll inicial: $100.',
    '- Seleccion: una sola recomendacion por fecha, la de mayor `aggregateConfidence`/`confidence` dentro del artefacto canonico elegido.',
    '- Incluye backfill CSV local para 2026-05-11 a 2026-05-13 y daily artifacts no vacios desde 2026-05-15 a 2026-06-09.',
    `- Fechas sin jugada local: ${noRecommendationDates.join(', ')}.`,
    '- 2026-06-09 se conserva como pendiente si el fixture aun no esta completado.',
    '',
    '## Summary',
    '',
    `- Selecciones analizadas: ${selections.length}.`,
    `- Settled: ${settled.length}; won: ${won}; lost: ${lost}; voided/push: ${voided}; pendientes/no liquidadas: ${pending.length}.`,
    `- Hit rate settled: ${hitRate === null ? 'n/a' : `${hitRate.toFixed(2)}%`}.`,
    `- Flat $10: bank final $${flat.endingBankroll.toFixed(2)}, net $${flat.netProfit.toFixed(2)}, ROI bank ${flat.roiOnInitialBankroll.toFixed(2)}%, ROI stake ${flat.roiOnAmountStaked.toFixed(2)}%.`,
    `- Recommended compounding: bank final $${recommended.endingBankroll.toFixed(2)}, net $${recommended.netProfit.toFixed(2)}, ROI bank ${recommended.roiOnInitialBankroll.toFixed(2)}%, ROI stake ${recommended.roiOnAmountStaked.toFixed(2)}%.`,
    '',
    '## Daily Top Picks',
    '',
    '| Fecha | Tipo | Perfil | Status | Conf. | Odds | Flat stake | Flat PnL | Rec stake | Rec PnL | ID |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|',
    ...rows,
    '',
    '## Artifact Selection',
    '',
    ...dailyArtifacts.map(([date, artifact]) => `- ${date}: ${artifact}`),
    '',
  ].join('\n');
  fs.writeFileSync(filePath, md);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const validationByArtifact = findLatestValidationArtifacts();
const dailySelections = dailyArtifacts
  .map(([date, artifactPath]) => topRecommendationForArtifact(date, artifactPath, validationByArtifact))
  .filter(Boolean);
const selections = [...loadBackfillSelections(), ...dailySelections]
  .sort((a, b) => a.date.localeCompare(b.date));

const flat = simulate(selections, 'flat_10');
const recommended = simulate(selections, 'recommended_compounding');
const byDate = new Map();
for (let i = 0; i < selections.length; i += 1) {
  byDate.set(selections[i].date, {
    ...selections[i],
    flatStake: flat.rows[i].stake,
    flatPnl: flat.rows[i].pnl,
    flatBankrollAfter: flat.rows[i].bankrollAfter,
    recommendedStake: recommended.rows[i].stake,
    recommendedPnl: recommended.rows[i].pnl,
    recommendedBankrollAfter: recommended.rows[i].bankrollAfter,
  });
}

const csvPath = path.join(REPORT_DIR, 'highest-confidence-roi-2026-06-09.csv');
const jsonPath = path.join(REPORT_DIR, 'highest-confidence-roi-2026-06-09.json');
const mdPath = path.join(REPORT_DIR, 'highest-confidence-roi-2026-06-09.md');
writeCsv(csvPath, [...byDate.values()]);
fs.writeFileSync(jsonPath, JSON.stringify({
  asOfDate: AS_OF_DATE,
  assumptions: {
    initialBankroll: INITIAL_BANKROLL,
    selectionRule: 'highest aggregateConfidence/confidence per canonical daily artifact date',
    noRecommendationDates,
  },
  summaries: { flat, recommended },
  selections: [...byDate.values()],
}, null, 2));
writeMarkdown(mdPath, [...byDate.values()], flat, recommended);

console.log(JSON.stringify({
  csvPath,
  jsonPath,
  mdPath,
  flat: {
    endingBankroll: flat.endingBankroll,
    netProfit: flat.netProfit,
    roiOnInitialBankroll: flat.roiOnInitialBankroll,
    roiOnAmountStaked: flat.roiOnAmountStaked,
  },
  recommended: {
    endingBankroll: recommended.endingBankroll,
    netProfit: recommended.netProfit,
    roiOnInitialBankroll: recommended.roiOnInitialBankroll,
    roiOnAmountStaked: recommended.roiOnAmountStaked,
  },
  selections: selections.length,
}, null, 2));
