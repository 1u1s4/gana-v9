import type { FilterCombineMode } from '../filters/types.js';
import { isMarketKey, MARKET_KEYS, type MarketKey } from '../domain/markets.js';
import type { ParlayConfig } from '../parlay/types.js';
import type { DailyE2EProvider, DailyParlayProfile, DailyRequiredLeagueInput } from '../daily/e2e.js';
import type { RunValidationInput } from '../validation/service.js';
import type { ResearchWebMode } from '../prediction/prompts.js';
import type { DashboardOptions } from '../dashboard/server.js';

export type CommandFlags = Record<string, string | true>;

const LOW_ODDS_SLASH_KEYS = new Set(['date', 'threshold', 'markets', 'leagues', 'teams', 'combine']);

export function parseFlags(args: string[]): CommandFlags {
  const flags: CommandFlags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function expandLowOddsSlashTokens(tokens: string[]): string[] {
  const expanded: string[] = [];
  let hasDate = false;

  for (const token of tokens) {
    if (token.startsWith('--')) {
      if (token === '--date') hasDate = true;
      expanded.push(token);
      continue;
    }

    const colonIndex = token.indexOf(':');
    if (colonIndex > 0) {
      const key = token.slice(0, colonIndex);
      const value = token.slice(colonIndex + 1);
      if (LOW_ODDS_SLASH_KEYS.has(key) && value) {
        if (key === 'date') hasDate = true;
        expanded.push(`--${key}`, value);
        continue;
      }
    }

    if (!hasDate && token === 'today') {
      expanded.push('--date', formatLocalDate(new Date()));
      hasDate = true;
      continue;
    }

    if (!hasDate && /^\d{4}-\d{2}-\d{2}$/.test(token)) {
      expanded.push('--date', token);
      hasDate = true;
      continue;
    }

    expanded.push(token);
  }

  return expanded;
}

export function parseLowOddsSlashFlags(args: string): CommandFlags {
  return parseFlags(expandLowOddsSlashTokens(args.split(' ').filter(Boolean)));
}

export function requireDateFlag(flags: CommandFlags): string {
  const date = flags.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('--date YYYY-MM-DD is required.');
  }
  return date;
}

export function optionalNumberFlag(flags: CommandFlags, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`--${key} must be an integer.`);
  return parsed;
}

export function requireStringFlag(flags: CommandFlags, key: string): string {
  const value = flags[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${key} is required.`);
  return value.trim();
}

export function optionalStringFlag(flags: CommandFlags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function optionalResearchWebMode(flags: CommandFlags): ResearchWebMode {
  return optionalResearchWebModeFlag(flags) ?? 'off';
}

export function optionalResearchWebModeFlag(flags: CommandFlags): ResearchWebMode | undefined {
  const value = optionalStringFlag(flags, 'web');
  if (value === undefined) return undefined;
  if (value === 'off' || value === 'cached' || value === 'live') return value;
  throw new Error('--web must be off, cached, or live.');
}

export function optionalFloatFlag(flags: CommandFlags, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number.`);
  return parsed;
}

export function optionalMarketsFlag(flags: CommandFlags): MarketKey[] | undefined {
  const value = flags.markets;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`--markets must be a comma-separated list of: ${MARKET_KEYS.join(', ')}.`);
  }

  const marketNames = value.split(',').map((market) => market.trim()).filter(Boolean);
  const invalid = marketNames.filter((market) => !isMarketKey(market));
  if (!marketNames.length || invalid.length) {
    throw new Error(`--markets contains unsupported market(s): ${invalid.join(', ') || value}. Use: ${MARKET_KEYS.join(', ')}.`);
  }

  return [...new Set(marketNames)] as MarketKey[];
}

export function optionalRunIdsFlag(flags: CommandFlags): string[] | undefined {
  const value = flags['run-ids'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('--run-ids must be a comma-separated list of run ids.');
  const runIds = value.split(',').map((runId) => runId.trim()).filter(Boolean);
  if (!runIds.length) throw new Error('--run-ids must include at least one run id.');
  return [...new Set(runIds)];
}

export function optionalParlayAnalysisProfileScope(flags: CommandFlags): 'core' | 'all' | undefined {
  const value = optionalStringFlag(flags, 'profile-scope');
  if (value === undefined) return undefined;
  if (value === 'core' || value === 'all') return value;
  throw new Error('--profile-scope must be core or all.');
}

export function optionalPositiveIntegerFlag(flags: CommandFlags, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${key} must be a positive integer.`);
  return parsed;
}

export function optionalPositiveFloatFlag(flags: CommandFlags, key: string): number | undefined {
  const value = optionalFloatFlag(flags, key);
  if (value === undefined) return undefined;
  if (value <= 0) throw new Error(`--${key} must be greater than 0.`);
  return value;
}

function optionalProbabilityFlag(flags: CommandFlags, key: string): number | undefined {
  const value = optionalFloatFlag(flags, key);
  if (value === undefined) return undefined;
  if (value < 0 || value > 1) throw new Error(`--${key} must be between 0 and 1.`);
  return value;
}

export function optionalParlayConfig(flags: CommandFlags): ParlayConfig {
  const config: ParlayConfig = {};
  const minLegs = optionalPositiveIntegerFlag(flags, 'min-legs');
  const maxLegs = optionalPositiveIntegerFlag(flags, 'max-legs');
  const minPredictionConfidence = optionalProbabilityFlag(flags, 'min-confidence');
  const maxCombinedOdds = optionalFloatFlag(flags, 'max-combined-odds');
  if (minLegs !== undefined) config.minLegs = minLegs;
  if (maxLegs !== undefined) config.maxLegs = maxLegs;
  if (flags['allow-multiple-legs-per-fixture'] === true) config.allowMultipleLegsPerFixture = true;
  if (minPredictionConfidence !== undefined) config.minPredictionConfidence = minPredictionConfidence;
  if (maxCombinedOdds !== undefined) config.maxCombinedOdds = maxCombinedOdds;
  return config;
}

export function requiredValidationTarget(flags: CommandFlags): RunValidationInput {
  const date = typeof flags.date === 'string' ? requireDateFlag(flags) : undefined;
  const predictionId = optionalStringFlag(flags, 'prediction-id');
  const parlayId = optionalStringFlag(flags, 'parlay-id');
  const count = [date, predictionId, parlayId].filter(Boolean).length;
  if (count !== 1) throw new Error('validate requires exactly one of --date, --prediction-id, or --parlay-id.');
  return {
    ...(date && { date }),
    ...(predictionId && { predictionId }),
    ...(parlayId && { parlayId }),
    ...(optionalStringFlag(flags, 'recommendation-artifact') && { recommendationArtifact: optionalStringFlag(flags, 'recommendation-artifact') }),
  };
}

export function optionalRunValidationMode(flags: CommandFlags): 'auto' | 'force' | false | undefined {
  const value = flags.validate;
  if (value === undefined) return undefined;
  if (value === true) return 'force';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'force') return normalized;
  if (normalized === 'off' || normalized === 'false' || normalized === 'disabled' || normalized === 'none') return false;
  throw new Error('--validate must be auto, force, or off.');
}

export function optionalDailyProvidersFlag(flags: CommandFlags): DailyE2EProvider[] | undefined {
  const value = optionalStringFlag(flags, 'providers');
  if (value === undefined) return undefined;
  const providers = value.split(',').map((provider) => provider.trim()).filter(Boolean);
  const invalid = providers.filter((provider) => provider !== 'codex');
  if (!providers.length || invalid.length) {
    throw new Error(`--providers must be codex. Invalid: ${invalid.join(',') || value}.`);
  }
  return [...new Set(providers)] as DailyE2EProvider[];
}

export function optionalDailyParlayProfileFlag(flags: CommandFlags): DailyParlayProfile | undefined {
  const value = optionalStringFlag(flags, 'parlay-profile');
  if (value === undefined) return undefined;
  if (
    value === 'safe-consensus'
    || value === 'balanced'
    || value === 'aggressive-analytical'
    || value === 'low-variance'
    || value === 'high-conviction'
    || value === 'market-diverse'
    || value === 'parlay-oro'
    || value === 'parlay-diamante'
    || value === 'parlay-all-in'
    || value === 'parlay-refinado'
    || value === 'portfolio-v2'
  ) {
    return value;
  }
  throw new Error('--parlay-profile must be safe-consensus, balanced, aggressive-analytical, low-variance, high-conviction, market-diverse, parlay-oro, parlay-diamante, parlay-all-in, parlay-refinado, or portfolio-v2.');
}

export function optionalDailyRequiredLeaguesFlag(flags: CommandFlags): DailyRequiredLeagueInput[] | undefined {
  const value = optionalStringFlag(flags, 'required-leagues');
  if (value === undefined) return undefined;
  if (/^(off|false|none|disabled|0)$/i.test(value)) return [];
  return value.split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [providerCompetitionId, name, country, seasonText] = token.split(':').map((part) => part.trim());
      if (!providerCompetitionId) throw new Error('--required-leagues entries must include a provider league id.');
      const season = seasonText ? Number(seasonText) : null;
      if (season !== null && (!Number.isInteger(season) || season < 1900)) {
        throw new Error('--required-leagues season must be a four-digit year.');
      }
      return {
        providerCompetitionId,
        ...(name ? { name } : {}),
        ...(country ? { country } : {}),
        ...(season !== null ? { season } : {}),
      };
    });
}

export function requiredRunInput(flags: CommandFlags): { date: string; runId?: string; validate?: 'auto' | 'force' | false; web?: ResearchWebMode; markets?: MarketKey[] } {
  return {
    date: requireDateFlag(flags),
    runId: optionalStringFlag(flags, 'run-id'),
    validate: optionalRunValidationMode(flags),
    web: optionalResearchWebModeFlag(flags),
    markets: optionalMarketsFlag(flags),
  };
}

export function requiredRunId(flags: CommandFlags): string {
  return requireStringFlag(flags, 'run-id');
}

export function optionalDailyProviderModelsFlag(flags: CommandFlags): Partial<Record<DailyE2EProvider, string>> | undefined {
  const models: Partial<Record<DailyE2EProvider, string>> = {};
  const codexModel = optionalStringFlag(flags, 'codex-model')?.trim();
  if (codexModel) models.codex = codexModel;
  return Object.keys(models).length ? models : undefined;
}

export function optionalCombineModeFlag(flags: CommandFlags): FilterCombineMode | undefined {
  const value = flags.combine;
  if (value === undefined) return undefined;
  const normalized = String(value).toUpperCase();
  if (normalized === 'OR' || normalized === 'AND') return normalized;
  throw new Error('--combine must be OR or AND.');
}

export function wantsDefault(flags: CommandFlags, key: string): boolean {
  return flags[key] === true || flags[key] === 'default';
}

export function optionalDashboardOptions(flags: CommandFlags): DashboardOptions {
  return {
    port: optionalPositiveIntegerFlag(flags, 'port'),
    host: optionalStringFlag(flags, 'host'),
  };
}
