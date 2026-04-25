import type { Fixture } from '../domain/fixtures.js';
import type { ProviderSnapshotId } from '../domain/ids.js';
import type { MarketSelection } from '../domain/markets.js';

export type ValidationStatus =
  | 'pending'
  | 'won'
  | 'lost'
  | 'push'
  | 'voided'
  | 'error'
  | 'blocked';

export type SettlementRuleVersion = 'settlement-v1';

export type SettlementReason =
  | 'fixture-not-completed'
  | 'fixture-cancelled'
  | 'fixture-status-unknown'
  | 'final-score-unavailable'
  | 'line-required'
  | 'line-forbidden'
  | 'invalid-market'
  | 'invalid-selection'
  | 'invalid-odds'
  | 'invalid-implied-probability'
  | 'invalid-line'
  | 'corners-statistics-unavailable';

export interface FixtureStatistics {
  fixtureId: string;
  cornersHome?: number;
  cornersAway?: number;
  sourceSnapshotId?: ProviderSnapshotId;
  capturedAt?: string;
}

export interface SettlementInput {
  selection: MarketSelection;
  fixture: Fixture;
  statistics?: FixtureStatistics;
  evaluatedAt?: string;
}

export interface SettlementOutcome {
  status: ValidationStatus;
  settlementRuleVersion: SettlementRuleVersion;
  evaluatedAt: string;
  reason?: SettlementReason;
}
