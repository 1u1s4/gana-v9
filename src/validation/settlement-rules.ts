import {
  getTotalGoals,
  hasFinalScore,
  isPendingFixtureStatus,
  type FixtureWithFinalScore,
} from '../domain/fixtures.js';
import {
  isMarketKey,
  isValidMarketSelection,
  marketRequiresLine,
  type MarketSelection,
} from '../domain/markets.js';
import {
  isValidDecimalOdds,
  isValidImpliedProbability,
  isValidLine,
  validateOddsQuote as validateDomainOddsQuote,
  type OddsQuote,
} from '../domain/odds.js';
import type {
  FixtureStatistics,
  SettlementInput,
  SettlementOutcome,
  SettlementReason,
  SettlementRuleVersion,
  ValidationStatus,
} from './types.js';

export const SETTLEMENT_RULE_VERSION = 'settlement-v1' satisfies SettlementRuleVersion;

export interface MarketSelectionValidationResult {
  valid: boolean;
  reasons: SettlementReason[];
}

export interface OddsQuoteValidationResult {
  valid: boolean;
  reasons: SettlementReason[];
}

export function validateMarketSelection(selection: MarketSelection): MarketSelectionValidationResult {
  const reasons: SettlementReason[] = [];

  if (!isMarketKey(selection.market)) {
    reasons.push('invalid-market');
    return { valid: false, reasons };
  }

  if (!isValidMarketSelection(selection.market, selection.selection)) {
    reasons.push('invalid-selection');
  }

  const requiresLine = marketRequiresLine(selection.market);
  if (requiresLine && !Number.isFinite(selection.line)) reasons.push('line-required');
  if (!requiresLine && selection.line !== undefined) reasons.push('line-forbidden');
  if (selection.line !== undefined && !isValidLine(selection.line)) reasons.push('invalid-line');
  if (!isValidDecimalOdds(selection.odds)) reasons.push('invalid-odds');
  if (!isValidImpliedProbability(selection.impliedProbability)) reasons.push('invalid-implied-probability');

  return { valid: reasons.length === 0, reasons };
}

export function validateOddsQuote(quote: OddsQuote): OddsQuoteValidationResult {
  const reasons = validateDomainOddsQuote(quote).map((reason): SettlementReason => {
    if (reason === 'invalid-price') return 'invalid-odds';
    return reason;
  });

  const selectionResult = validateMarketSelection({
    market: quote.market,
    selection: quote.selection,
    line: quote.line,
    odds: quote.price,
    impliedProbability: quote.impliedProbability,
    sourceSnapshotId: quote.sourceSnapshotId,
  });

  reasons.push(...selectionResult.reasons);

  return { valid: reasons.length === 0, reasons };
}

export function validateSettlementInput(input: SettlementInput): MarketSelectionValidationResult {
  return validateMarketSelection(input.selection);
}

export function settleMarket(input: SettlementInput): SettlementOutcome {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const invalid = validateSettlementInput(input);
  if (!invalid.valid) return outcome('blocked', evaluatedAt, invalid.reasons[0] ?? 'invalid-selection');

  if (isPendingFixtureStatus(input.fixture.status)) {
    return outcome('pending', evaluatedAt, 'fixture-not-completed');
  }

  if (input.fixture.status === 'cancelled') {
    return outcome('voided', evaluatedAt, 'fixture-cancelled');
  }

  if (input.fixture.status === 'unknown') {
    return outcome('blocked', evaluatedAt, 'fixture-status-unknown');
  }

  if (!hasFinalScore(input.fixture)) {
    return outcome('blocked', evaluatedAt, 'final-score-unavailable');
  }

  switch (input.selection.market) {
    case 'h2h':
      return outcome(settleH2H(input.selection.selection, input.fixture), evaluatedAt);
    case 'double_chance':
      return outcome(settleDoubleChance(input.selection.selection, input.fixture), evaluatedAt);
    case 'goals_over_under':
      return outcome(settleGoalsOverUnder(input.selection.selection, input.selection.line, getTotalGoals(input.fixture)), evaluatedAt);
    case 'corners_over_under':
      return settleCornersOverUnder(input.selection.selection, input.selection.line, input.statistics, evaluatedAt);
    case 'btts':
      return outcome(settleBtts(input.selection.selection, input.fixture), evaluatedAt);
  }
}

export function settleH2H(selection: string, fixture: FixtureWithFinalScore): ValidationStatus {
  if (fixture.scoreHome > fixture.scoreAway) return selection === 'home' ? 'won' : 'lost';
  if (fixture.scoreHome < fixture.scoreAway) return selection === 'away' ? 'won' : 'lost';
  return selection === 'draw' ? 'won' : 'lost';
}

export function settleDoubleChance(selection: string, fixture: FixtureWithFinalScore): ValidationStatus {
  const homeWon = fixture.scoreHome > fixture.scoreAway;
  const awayWon = fixture.scoreAway > fixture.scoreHome;
  const draw = fixture.scoreHome === fixture.scoreAway;

  if (selection === 'home_or_draw') return homeWon || draw ? 'won' : 'lost';
  if (selection === 'home_or_away') return homeWon || awayWon ? 'won' : 'lost';
  if (selection === 'draw_or_away') return draw || awayWon ? 'won' : 'lost';

  return 'error';
}

export function settleGoalsOverUnder(selection: string, line: number | undefined, totalGoals: number): ValidationStatus {
  return settleOverUnder(selection, line, totalGoals);
}

export function settleCornersOverUnder(
  selection: string,
  line: number | undefined,
  statistics: FixtureStatistics | undefined,
  evaluatedAt = new Date().toISOString(),
): SettlementOutcome {
  const cornersHome = statistics?.cornersHome;
  const cornersAway = statistics?.cornersAway;

  if (
    typeof cornersHome !== 'number'
    || typeof cornersAway !== 'number'
    || !Number.isFinite(cornersHome)
    || !Number.isFinite(cornersAway)
  ) {
    return outcome('blocked', evaluatedAt, 'corners-statistics-unavailable');
  }

  return outcome(settleOverUnder(selection, line, cornersHome + cornersAway), evaluatedAt);
}

export function settleBtts(selection: string, fixture: FixtureWithFinalScore): ValidationStatus {
  const bothTeamsScored = fixture.scoreHome > 0 && fixture.scoreAway > 0;
  if (selection === 'yes') return bothTeamsScored ? 'won' : 'lost';
  if (selection === 'no') return bothTeamsScored ? 'lost' : 'won';
  return 'error';
}

function settleOverUnder(selection: string, line: number | undefined, total: number): ValidationStatus {
  const numericLine = line;
  if (typeof numericLine !== 'number' || !Number.isFinite(numericLine)) return 'error';
  if (total === numericLine) return 'push';
  if (selection === 'over') return total > numericLine ? 'won' : 'lost';
  if (selection === 'under') return total < numericLine ? 'won' : 'lost';
  return 'error';
}

function outcome(status: ValidationStatus, evaluatedAt: string, reason?: SettlementReason): SettlementOutcome {
  return {
    status,
    settlementRuleVersion: SETTLEMENT_RULE_VERSION,
    evaluatedAt,
    ...(reason && { reason }),
  };
}
