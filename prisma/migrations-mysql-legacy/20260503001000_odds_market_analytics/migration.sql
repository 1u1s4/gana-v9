ALTER TABLE `odds_quotes`
  ADD COLUMN `market_implied_probability` DECIMAL(12, 6) NULL,
  ADD COLUMN `market_fair_probability` DECIMAL(12, 6) NULL,
  ADD COLUMN `consensus_fair_odds` DECIMAL(12, 6) NULL,
  ADD COLUMN `overround` DECIMAL(12, 6) NULL,
  ADD COLUMN `market_efficiency_score` DECIMAL(12, 6) NULL;
