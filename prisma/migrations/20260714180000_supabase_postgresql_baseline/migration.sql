-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "gana_ops";

-- CreateTable
CREATE TABLE "sports_providers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "base_url" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sports_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "provider_competition_id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "country" VARCHAR(120),
    "type" VARCHAR(80),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "provider_team_id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "country" VARCHAR(120),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixtures" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "provider_fixture_id" VARCHAR(80) NOT NULL,
    "competition_id" UUID,
    "season" INTEGER,
    "home_team_id" UUID,
    "away_team_id" UUID,
    "scheduled_at" TIMESTAMPTZ(3),
    "status" VARCHAR(40) NOT NULL DEFAULT 'unknown',
    "score_home" INTEGER,
    "score_away" INTEGER,
    "included_by_filters" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_snapshots" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "endpoint_name" VARCHAR(120) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_hash" VARCHAR(64),
    "payload_hash" VARCHAR(64),
    "dedupe_key" VARCHAR(64),
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observation_count" INTEGER NOT NULL DEFAULT 1,
    "quota_metadata" JSONB,
    "request_metadata" JSONB,
    "raw_payload" JSONB,
    "run_id" VARCHAR(36),
    "task_id" UUID,
    "correlation_id" VARCHAR(80),
    "trace_id" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odds_snapshots" (
    "id" UUID NOT NULL,
    "fixture_id" UUID NOT NULL,
    "provider_snapshot_id" UUID,
    "provider_fixture_id" VARCHAR(80) NOT NULL,
    "bookmaker_count" INTEGER NOT NULL DEFAULT 0,
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" VARCHAR(64),
    "dedupe_key" VARCHAR(64),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observation_count" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odds_quotes" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "fixture_id" UUID NOT NULL,
    "bookmaker" VARCHAR(160) NOT NULL,
    "bookmaker_key" VARCHAR(120),
    "market_key" VARCHAR(80) NOT NULL,
    "selection_key" VARCHAR(120) NOT NULL,
    "line" DECIMAL(12,6),
    "price" DECIMAL(12,6) NOT NULL,
    "implied_probability" DECIMAL(12,6),
    "market_implied_probability" DECIMAL(12,6),
    "market_fair_probability" DECIMAL(12,6),
    "consensus_fair_odds" DECIMAL(12,6),
    "overround" DECIMAL(12,6),
    "market_efficiency_score" DECIMAL(12,6),
    "content_hash" VARCHAR(64),
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harness_runs" (
    "id" VARCHAR(36) NOT NULL,
    "runtime" VARCHAR(80) NOT NULL,
    "profile" VARCHAR(80) NOT NULL,
    "provider_sports" VARCHAR(80) NOT NULL,
    "provider_agentic" VARCHAR(80),
    "model" VARCHAR(160),
    "filter_preset_id" UUID,
    "status" VARCHAR(40) NOT NULL DEFAULT 'created',
    "verdict" VARCHAR(80),
    "artifact_dir" VARCHAR(700),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "harness_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harness_tasks" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "type" VARCHAR(120) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMPTZ(3),
    "lease_expires_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "last_error_redacted" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "harness_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" VARCHAR(80) NOT NULL,
    "run_id" VARCHAR(36),
    "task_id" UUID,
    "tool_call_id" VARCHAR(160) NOT NULL,
    "tool_name" VARCHAR(120) NOT NULL,
    "args_redacted" JSONB,
    "risk" VARCHAR(40) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" VARCHAR(120),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "name" VARCHAR(240) NOT NULL,
    "kind" VARCHAR(80) NOT NULL,
    "path" VARCHAR(700) NOT NULL,
    "sha256" VARCHAR(64),
    "size_bytes" BIGINT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "task_id" UUID,
    "event_type" VARCHAR(120) NOT NULL,
    "actor" VARCHAR(120) NOT NULL DEFAULT 'harness',
    "severity" VARCHAR(40) NOT NULL DEFAULT 'info',
    "correlation_id" VARCHAR(80),
    "trace_id" VARCHAR(80),
    "payload_redacted" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_quota_samples" (
    "id" UUID NOT NULL,
    "provider_id" UUID,
    "provider_code" VARCHAR(64) NOT NULL,
    "endpoint_name" VARCHAR(120),
    "status" VARCHAR(40) NOT NULL,
    "quota_limit" INTEGER,
    "quota_remaining" INTEGER,
    "reset_at" TIMESTAMPTZ(3),
    "response_ms" INTEGER,
    "error_redacted" TEXT,
    "metadata" JSONB,
    "sampled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_quota_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_quota_daily" (
    "id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "provider_id" UUID,
    "provider_code" VARCHAR(64) NOT NULL,
    "endpoint_name" VARCHAR(120) NOT NULL DEFAULT '',
    "status" VARCHAR(40) NOT NULL,
    "sample_count" BIGINT NOT NULL,
    "response_ms_sample_count" BIGINT NOT NULL,
    "avg_response_ms" DECIMAL(14,3),
    "min_response_ms" INTEGER,
    "max_response_ms" INTEGER,
    "quota_limit_sample_count" BIGINT NOT NULL,
    "avg_quota_limit" DECIMAL(16,3),
    "min_quota_limit" INTEGER,
    "max_quota_limit" INTEGER,
    "quota_remaining_sample_count" BIGINT NOT NULL,
    "avg_quota_remaining" DECIMAL(16,3),
    "min_quota_remaining" INTEGER,
    "max_quota_remaining" INTEGER,
    "first_sampled_at" TIMESTAMPTZ(3) NOT NULL,
    "last_sampled_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_quota_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_presets" (
    "id" UUID NOT NULL,
    "preset_key" VARCHAR(80) NOT NULL DEFAULT 'default',
    "provider_id" UUID NOT NULL,
    "provider_competition_id" VARCHAR(80) NOT NULL,
    "competition_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "country" VARCHAR(120),
    "season" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "league_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_presets" (
    "id" UUID NOT NULL,
    "preset_key" VARCHAR(80) NOT NULL DEFAULT 'default',
    "provider_id" UUID NOT NULL,
    "provider_team_id" VARCHAR(80) NOT NULL,
    "team_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "country" VARCHAR(120),
    "provider_league_id" VARCHAR(80),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_filter_presets" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "season" INTEGER,
    "markets" JSONB,
    "threshold" DECIMAL(12,6),
    "kickoff_window_hours" INTEGER,
    "include_live_fixtures" BOOLEAN NOT NULL DEFAULT false,
    "include_completed_fixtures" BOOLEAN NOT NULL DEFAULT false,
    "max_fixtures" INTEGER,
    "bookmaker_allowlist" JSONB,
    "combine_mode" VARCHAR(20) NOT NULL DEFAULT 'OR',
    "config_snapshot" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_filter_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "low_odds_scans" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "filter_preset_id" UUID,
    "query_snapshot" JSONB,
    "threshold" DECIMAL(12,6) NOT NULL,
    "comparison" VARCHAR(20) NOT NULL DEFAULT 'lte',
    "status" VARCHAR(40) NOT NULL DEFAULT 'created',
    "fixture_count" INTEGER NOT NULL DEFAULT 0,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "error_redacted" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "low_odds_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "low_odds_hits" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "fixture_id" UUID NOT NULL,
    "odds_quote_id" UUID,
    "market_key" VARCHAR(80) NOT NULL,
    "selection_key" VARCHAR(120) NOT NULL,
    "line" DECIMAL(12,6),
    "odds" DECIMAL(12,6) NOT NULL,
    "implied_probability" DECIMAL(12,6),
    "bookmaker" VARCHAR(160),
    "included_reasons" JSONB,
    "excluded_reasons" JSONB,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "low_odds_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_bundles" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "fixture_id" UUID,
    "provider_fixture_id" VARCHAR(80),
    "artifact_id" UUID,
    "status" VARCHAR(40) NOT NULL DEFAULT 'created',
    "gate_result" JSONB,
    "provider_agentic" VARCHAR(80),
    "model" VARCHAR(160),
    "prompt_version" VARCHAR(80),
    "warnings" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "research_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_records" (
    "id" VARCHAR(120) NOT NULL,
    "bundle_id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "fixture_id" UUID,
    "artifact_id" UUID,
    "provider_snapshot_id" UUID,
    "source_type" VARCHAR(80) NOT NULL,
    "url" VARCHAR(1000),
    "title" VARCHAR(500),
    "external_id" VARCHAR(240),
    "hash" VARCHAR(64),
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warnings" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" VARCHAR(120) NOT NULL,
    "bundle_id" UUID NOT NULL,
    "source_id" VARCHAR(120) NOT NULL,
    "fixture_id" UUID,
    "artifact_id" UUID,
    "kind" VARCHAR(80),
    "snippet_redacted" TEXT,
    "summary_redacted" TEXT,
    "confidence" DECIMAL(5,4),
    "claim_ids" JSONB,
    "warnings" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" VARCHAR(120) NOT NULL,
    "bundle_id" UUID NOT NULL,
    "fixture_id" UUID,
    "source_id" VARCHAR(120),
    "statement" TEXT NOT NULL,
    "subject_type" VARCHAR(80),
    "subject_key" VARCHAR(160),
    "market_key" VARCHAR(80),
    "selection_key" VARCHAR(120),
    "line" DECIMAL(12,6),
    "support_level" VARCHAR(40) NOT NULL DEFAULT 'unknown',
    "confidence" DECIMAL(5,4),
    "evidence_ids" JSONB,
    "conflict_status" VARCHAR(40) NOT NULL DEFAULT 'unknown',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "fixture_id" UUID NOT NULL,
    "odds_snapshot_id" UUID NOT NULL,
    "odds_quote_id" UUID NOT NULL,
    "research_bundle_id" UUID,
    "artifact_id" UUID,
    "market_key" VARCHAR(80) NOT NULL,
    "selection_key" VARCHAR(120) NOT NULL,
    "line" DECIMAL(12,6),
    "odds" DECIMAL(12,6) NOT NULL,
    "implied_probability" DECIMAL(12,6) NOT NULL,
    "estimated_probability" DECIMAL(12,6),
    "edge" DECIMAL(12,6),
    "confidence" DECIMAL(5,4) NOT NULL,
    "quality" VARCHAR(40) NOT NULL DEFAULT 'low',
    "rationale_redacted" TEXT NOT NULL,
    "warnings" JSONB,
    "evidence_ids" JSONB,
    "included_by_filters" JSONB,
    "provider_agentic" VARCHAR(80),
    "model" VARCHAR(160),
    "prompt_version" VARCHAR(80) NOT NULL,
    "scoring_rule_version" VARCHAR(80) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parlays" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "artifact_id" UUID,
    "combined_odds" DECIMAL(20,6),
    "aggregate_confidence" DECIMAL(5,4) NOT NULL,
    "aggregate_quality" DECIMAL(5,4) NOT NULL,
    "rationale_redacted" TEXT NOT NULL,
    "warnings" JSONB,
    "status" VARCHAR(40) NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parlays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parlay_legs" (
    "id" UUID NOT NULL,
    "parlay_id" UUID NOT NULL,
    "prediction_id" UUID NOT NULL,
    "fixture_id" UUID NOT NULL,
    "market_key" VARCHAR(80) NOT NULL,
    "selection_key" VARCHAR(120) NOT NULL,
    "line" DECIMAL(12,6),
    "odds" DECIMAL(12,6) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "leg_index" INTEGER NOT NULL,
    "inclusion_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parlay_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_artifacts" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "prediction_id" UUID,
    "parlay_id" UUID,
    "fixture_id" UUID,
    "provider_snapshot_id" UUID,
    "artifact_id" UUID,
    "settlement_rule_version" VARCHAR(80) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(120),
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
    "result_input" JSONB,
    "outcome" JSONB,
    "evidence_ids" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "validation_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_recommendation_publications" (
    "id" UUID NOT NULL,
    "daily_batch_id" VARCHAR(120) NOT NULL,
    "run_id" VARCHAR(36),
    "slate_date" DATE NOT NULL,
    "channel" VARCHAR(80) NOT NULL DEFAULT 'discord',
    "target" VARCHAR(120) NOT NULL DEFAULT 'recommendations',
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" VARCHAR(120) NOT NULL,
    "prediction_id" UUID,
    "parlay_id" UUID,
    "status" VARCHAR(40) NOT NULL DEFAULT 'published',
    "discord_target" VARCHAR(160),
    "discord_message_id" VARCHAR(120),
    "discord_message_ids" JSONB,
    "artifact_path" TEXT,
    "payload_path" TEXT,
    "payload_sha256" CHAR(64),
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_recommendation_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "id" UUID NOT NULL,
    "run_id" VARCHAR(36),
    "prompt_version" VARCHAR(120) NOT NULL,
    "model_id" VARCHAR(160) NOT NULL,
    "market" VARCHAR(80) NOT NULL,
    "league" VARCHAR(120) NOT NULL,
    "brier" DECIMAL(12,6) NOT NULL,
    "logloss" DECIMAL(12,6) NOT NULL,
    "clv_pct" DECIMAL(12,6),
    "hitrate" DECIMAL(12,6) NOT NULL,
    "n" INTEGER NOT NULL,
    "low_sample" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "scope" VARCHAR(80) NOT NULL DEFAULT 'all',
    "source_window_start" TIMESTAMPTZ(3) NOT NULL,
    "source_window_end" TIMESTAMPTZ(3) NOT NULL,
    "prediction_metrics" JSONB,
    "parlay_metrics" JSONB,
    "chart_metrics" JSONB,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gambeta_scrape_runs" (
    "id" BIGSERIAL NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "page_title" VARCHAR(255),
    "scraped_at" TIMESTAMPTZ(3) NOT NULL,
    "roi_percent" DECIMAL(8,2),
    "picks_realizados" INTEGER,
    "picks_count" INTEGER NOT NULL DEFAULT 0,
    "status_bar" VARCHAR(255),
    "raw_stats" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gambeta_scrape_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gambeta_pick_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "pick_hash" CHAR(64) NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "badge" VARCHAR(160),
    "league" VARCHAR(160),
    "sport_key" VARCHAR(120),
    "match_time_text" VARCHAR(120),
    "commence_at" TIMESTAMPTZ(3),
    "confidence_label" VARCHAR(80),
    "confidence_score" SMALLINT,
    "confidence_code" VARCHAR(32),
    "stake_amount" DECIMAL(10,2),
    "home_team" VARCHAR(160) NOT NULL,
    "away_team" VARCHAR(160) NOT NULL,
    "recommendation" VARCHAR(120),
    "recommended_odds" DECIMAL(10,2),
    "probability_home" DECIMAL(6,2),
    "probability_draw" DECIMAL(6,2),
    "probability_away" DECIMAL(6,2),
    "odds_home" DECIMAL(10,2),
    "odds_draw" DECIMAL(10,2),
    "odds_away" DECIMAL(10,2),
    "bookmaker_key" VARCHAR(80),
    "bookmaker_label" VARCHAR(120),
    "is_started" BOOLEAN NOT NULL DEFAULT false,
    "result" VARCHAR(40),
    "final_score" VARCHAR(40),
    "raw_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gambeta_pick_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gambeta_current_picks" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "pick_hash" CHAR(64) NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "badge" VARCHAR(160),
    "league" VARCHAR(160),
    "sport_key" VARCHAR(120),
    "match_time_text" VARCHAR(120),
    "commence_at" TIMESTAMPTZ(3),
    "confidence_label" VARCHAR(80),
    "confidence_score" SMALLINT,
    "confidence_code" VARCHAR(32),
    "stake_amount" DECIMAL(10,2),
    "home_team" VARCHAR(160) NOT NULL,
    "away_team" VARCHAR(160) NOT NULL,
    "recommendation" VARCHAR(120),
    "recommended_odds" DECIMAL(10,2),
    "probability_home" DECIMAL(6,2),
    "probability_draw" DECIMAL(6,2),
    "probability_away" DECIMAL(6,2),
    "odds_home" DECIMAL(10,2),
    "odds_draw" DECIMAL(10,2),
    "odds_away" DECIMAL(10,2),
    "bookmaker_key" VARCHAR(80),
    "bookmaker_label" VARCHAR(120),
    "is_started" BOOLEAN NOT NULL DEFAULT false,
    "result" VARCHAR(40),
    "final_score" VARCHAR(40),
    "raw_json" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gambeta_current_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gambeta_current_stats" (
    "id" SMALLINT NOT NULL,
    "run_id" BIGINT NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "page_title" VARCHAR(255),
    "scraped_at" TIMESTAMPTZ(3) NOT NULL,
    "roi_percent" DECIMAL(8,2),
    "picks_realizados" INTEGER,
    "picks_count" INTEGER NOT NULL DEFAULT 0,
    "status_bar" VARCHAR(255),
    "raw_stats" JSONB,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gambeta_current_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sports_providers_code_key" ON "sports_providers"("code");

-- CreateIndex
CREATE INDEX "competitions_provider_id_idx" ON "competitions"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitions_provider_provider_competition_id_key" ON "competitions"("provider_id", "provider_competition_id");

-- CreateIndex
CREATE INDEX "teams_provider_id_idx" ON "teams"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_provider_provider_team_id_key" ON "teams"("provider_id", "provider_team_id");

-- CreateIndex
CREATE INDEX "fixtures_status_scheduled_at_idx" ON "fixtures"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "fixtures_competition_season_scheduled_at_idx" ON "fixtures"("competition_id", "season", "scheduled_at");

-- CreateIndex
CREATE INDEX "fixtures_home_team_scheduled_at_idx" ON "fixtures"("home_team_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "fixtures_away_team_scheduled_at_idx" ON "fixtures"("away_team_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "fixtures_provider_provider_fixture_id_key" ON "fixtures"("provider_id", "provider_fixture_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_snapshots_dedupe_key_key" ON "provider_snapshots"("dedupe_key");

-- CreateIndex
CREATE INDEX "provider_snapshots_provider_endpoint_captured_at_idx" ON "provider_snapshots"("provider_id", "endpoint_name", "captured_at");

-- CreateIndex
CREATE INDEX "provider_snapshots_retention_last_seen_id_idx" ON "provider_snapshots"("last_seen_at", "id");

-- CreateIndex
CREATE INDEX "provider_snapshots_run_id_idx" ON "provider_snapshots"("run_id");

-- CreateIndex
CREATE INDEX "provider_snapshots_task_id_idx" ON "provider_snapshots"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "odds_snapshots_dedupe_key_key" ON "odds_snapshots"("dedupe_key");

-- CreateIndex
CREATE INDEX "odds_snapshots_fixture_captured_at_idx" ON "odds_snapshots"("fixture_id", "captured_at");

-- CreateIndex
CREATE INDEX "odds_snapshots_retention_last_seen_id_idx" ON "odds_snapshots"("last_seen_at", "id");

-- CreateIndex
CREATE INDEX "odds_snapshots_provider_snapshot_id_idx" ON "odds_snapshots"("provider_snapshot_id");

-- CreateIndex
CREATE INDEX "odds_quotes_fixture_market_captured_at_idx" ON "odds_quotes"("fixture_id", "market_key", "captured_at");

-- CreateIndex
CREATE INDEX "odds_quotes_fixture_market_selection_line_captured_at_idx" ON "odds_quotes"("fixture_id", "market_key", "selection_key", "line", "captured_at");

-- CreateIndex
CREATE INDEX "odds_quotes_snapshot_id_idx" ON "odds_quotes"("snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "odds_quotes_snapshot_content_hash_key" ON "odds_quotes"("snapshot_id", "content_hash");

-- CreateIndex
CREATE INDEX "harness_runs_status_created_at_idx" ON "harness_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "harness_runs_filter_preset_id_idx" ON "harness_runs"("filter_preset_id");

-- CreateIndex
CREATE INDEX "harness_tasks_queue_idx" ON "harness_tasks"("status", "scheduled_for", "priority", "created_at");

-- CreateIndex
CREATE INDEX "harness_tasks_running_lease_idx" ON "harness_tasks"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "harness_tasks_run_id_idx" ON "harness_tasks"("run_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_requested_idx" ON "approval_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "approval_requests_run_id_idx" ON "approval_requests"("run_id");

-- CreateIndex
CREATE INDEX "approval_requests_task_id_idx" ON "approval_requests"("task_id");

-- CreateIndex
CREATE INDEX "approval_requests_tool_call_id_idx" ON "approval_requests"("tool_call_id");

-- CreateIndex
CREATE INDEX "artifacts_run_created_at_idx" ON "artifacts"("run_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_run_created_at_idx" ON "audit_logs"("run_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_created_at_idx" ON "audit_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "provider_quota_samples_provider_sampled_at_idx" ON "provider_quota_samples"("provider_code", "sampled_at");

-- CreateIndex
CREATE INDEX "provider_quota_samples_provider_id_sampled_at_idx" ON "provider_quota_samples"("provider_id", "sampled_at");

-- CreateIndex
CREATE INDEX "provider_quota_samples_retention_sampled_id_idx" ON "provider_quota_samples"("sampled_at", "id");

-- CreateIndex
CREATE INDEX "provider_quota_daily_provider_metric_date_idx" ON "provider_quota_daily"("provider_code", "metric_date");

-- CreateIndex
CREATE INDEX "provider_quota_daily_provider_id_metric_date_idx" ON "provider_quota_daily"("provider_id", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "provider_quota_daily_natural_key" ON "provider_quota_daily"("metric_date", "provider_code", "endpoint_name", "status");

-- CreateIndex
CREATE INDEX "league_presets_enabled_preset_idx" ON "league_presets"("enabled", "preset_key");

-- CreateIndex
CREATE INDEX "league_presets_provider_id_idx" ON "league_presets"("provider_id");

-- CreateIndex
CREATE INDEX "league_presets_competition_id_idx" ON "league_presets"("competition_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_presets_preset_provider_competition_season_key" ON "league_presets"("preset_key", "provider_id", "provider_competition_id", "season");

-- CreateIndex
CREATE INDEX "team_presets_enabled_preset_idx" ON "team_presets"("enabled", "preset_key");

-- CreateIndex
CREATE INDEX "team_presets_provider_id_idx" ON "team_presets"("provider_id");

-- CreateIndex
CREATE INDEX "team_presets_team_id_idx" ON "team_presets"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_presets_preset_provider_team_key" ON "team_presets"("preset_key", "provider_id", "provider_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "search_filter_presets_key_key" ON "search_filter_presets"("key");

-- CreateIndex
CREATE INDEX "search_filter_presets_enabled_key_idx" ON "search_filter_presets"("enabled", "key");

-- CreateIndex
CREATE INDEX "low_odds_scans_status_created_at_idx" ON "low_odds_scans"("status", "created_at");

-- CreateIndex
CREATE INDEX "low_odds_scans_run_id_idx" ON "low_odds_scans"("run_id");

-- CreateIndex
CREATE INDEX "low_odds_scans_filter_preset_id_idx" ON "low_odds_scans"("filter_preset_id");

-- CreateIndex
CREATE INDEX "low_odds_hits_scan_odds_idx" ON "low_odds_hits"("scan_id", "odds");

-- CreateIndex
CREATE INDEX "low_odds_hits_fixture_id_idx" ON "low_odds_hits"("fixture_id");

-- CreateIndex
CREATE INDEX "low_odds_hits_odds_quote_id_idx" ON "low_odds_hits"("odds_quote_id");

-- CreateIndex
CREATE INDEX "research_bundles_run_created_at_idx" ON "research_bundles"("run_id", "created_at");

-- CreateIndex
CREATE INDEX "research_bundles_fixture_created_at_idx" ON "research_bundles"("fixture_id", "created_at");

-- CreateIndex
CREATE INDEX "research_bundles_provider_fixture_created_at_idx" ON "research_bundles"("provider_fixture_id", "created_at");

-- CreateIndex
CREATE INDEX "research_bundles_status_created_at_idx" ON "research_bundles"("status", "created_at");

-- CreateIndex
CREATE INDEX "research_bundles_artifact_id_idx" ON "research_bundles"("artifact_id");

-- CreateIndex
CREATE INDEX "source_records_bundle_captured_at_idx" ON "source_records"("bundle_id", "captured_at");

-- CreateIndex
CREATE INDEX "source_records_source_type_captured_at_idx" ON "source_records"("source_type", "captured_at");

-- CreateIndex
CREATE INDEX "source_records_fixture_captured_at_idx" ON "source_records"("fixture_id", "captured_at");

-- CreateIndex
CREATE INDEX "source_records_run_captured_at_idx" ON "source_records"("run_id", "captured_at");

-- CreateIndex
CREATE INDEX "source_records_artifact_id_idx" ON "source_records"("artifact_id");

-- CreateIndex
CREATE INDEX "source_records_provider_snapshot_id_idx" ON "source_records"("provider_snapshot_id");

-- CreateIndex
CREATE INDEX "source_records_hash_idx" ON "source_records"("hash");

-- CreateIndex
CREATE INDEX "evidence_items_bundle_created_at_idx" ON "evidence_items"("bundle_id", "created_at");

-- CreateIndex
CREATE INDEX "evidence_items_source_created_at_idx" ON "evidence_items"("source_id", "created_at");

-- CreateIndex
CREATE INDEX "evidence_items_fixture_created_at_idx" ON "evidence_items"("fixture_id", "created_at");

-- CreateIndex
CREATE INDEX "evidence_items_artifact_id_idx" ON "evidence_items"("artifact_id");

-- CreateIndex
CREATE INDEX "claims_bundle_created_at_idx" ON "claims"("bundle_id", "created_at");

-- CreateIndex
CREATE INDEX "claims_fixture_market_idx" ON "claims"("fixture_id", "market_key");

-- CreateIndex
CREATE INDEX "claims_source_id_idx" ON "claims"("source_id");

-- CreateIndex
CREATE INDEX "claims_support_conflict_idx" ON "claims"("support_level", "conflict_status");

-- CreateIndex
CREATE INDEX "predictions_fixture_status_generated_at_idx" ON "predictions"("fixture_id", "status", "generated_at");

-- CreateIndex
CREATE INDEX "predictions_run_generated_at_idx" ON "predictions"("run_id", "generated_at");

-- CreateIndex
CREATE INDEX "predictions_odds_snapshot_id_idx" ON "predictions"("odds_snapshot_id");

-- CreateIndex
CREATE INDEX "predictions_odds_quote_id_idx" ON "predictions"("odds_quote_id");

-- CreateIndex
CREATE INDEX "predictions_research_bundle_id_idx" ON "predictions"("research_bundle_id");

-- CreateIndex
CREATE INDEX "predictions_artifact_id_idx" ON "predictions"("artifact_id");

-- CreateIndex
CREATE INDEX "predictions_scoring_rule_generated_at_idx" ON "predictions"("scoring_rule_version", "generated_at");

-- CreateIndex
CREATE INDEX "parlays_run_generated_at_idx" ON "parlays"("run_id", "generated_at");

-- CreateIndex
CREATE INDEX "parlays_status_generated_at_idx" ON "parlays"("status", "generated_at");

-- CreateIndex
CREATE INDEX "parlays_artifact_id_idx" ON "parlays"("artifact_id");

-- CreateIndex
CREATE INDEX "parlay_legs_prediction_id_idx" ON "parlay_legs"("prediction_id");

-- CreateIndex
CREATE INDEX "parlay_legs_fixture_id_idx" ON "parlay_legs"("fixture_id");

-- CreateIndex
CREATE INDEX "parlay_legs_status_created_at_idx" ON "parlay_legs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "parlay_legs_parlay_leg_index_key" ON "parlay_legs"("parlay_id", "leg_index");

-- CreateIndex
CREATE UNIQUE INDEX "parlay_legs_parlay_prediction_key" ON "parlay_legs"("parlay_id", "prediction_id");

-- CreateIndex
CREATE INDEX "validation_artifacts_run_evaluated_at_idx" ON "validation_artifacts"("run_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "validation_artifacts_prediction_evaluated_at_idx" ON "validation_artifacts"("prediction_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "validation_artifacts_parlay_evaluated_at_idx" ON "validation_artifacts"("parlay_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "validation_artifacts_fixture_evaluated_at_idx" ON "validation_artifacts"("fixture_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "validation_artifacts_provider_snapshot_id_idx" ON "validation_artifacts"("provider_snapshot_id");

-- CreateIndex
CREATE INDEX "validation_artifacts_artifact_id_idx" ON "validation_artifacts"("artifact_id");

-- CreateIndex
CREATE INDEX "validation_artifacts_status_evaluated_at_idx" ON "validation_artifacts"("status", "evaluated_at");

-- CreateIndex
CREATE INDEX "validation_artifacts_retention_evaluated_id_idx" ON "validation_artifacts"("evaluated_at", "id");

-- CreateIndex
CREATE INDEX "public_rec_publications_batch_channel_idx" ON "public_recommendation_publications"("daily_batch_id", "channel", "published_at");

-- CreateIndex
CREATE INDEX "public_rec_publications_run_published_at_idx" ON "public_recommendation_publications"("run_id", "published_at");

-- CreateIndex
CREATE INDEX "public_rec_publications_prediction_id_idx" ON "public_recommendation_publications"("prediction_id");

-- CreateIndex
CREATE INDEX "public_rec_publications_parlay_id_idx" ON "public_recommendation_publications"("parlay_id");

-- CreateIndex
CREATE INDEX "public_rec_publications_status_published_at_idx" ON "public_recommendation_publications"("status", "published_at");

-- CreateIndex
CREATE INDEX "public_rec_publications_target_lookup_idx" ON "public_recommendation_publications"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_rec_publications_target_key" ON "public_recommendation_publications"("daily_batch_id", "channel", "target", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "leaderboard_entries_dimensions_idx" ON "leaderboard_entries"("prompt_version", "model_id", "market", "league");

-- CreateIndex
CREATE INDEX "leaderboard_entries_run_id_idx" ON "leaderboard_entries"("run_id");

-- CreateIndex
CREATE INDEX "leaderboard_entries_generated_at_idx" ON "leaderboard_entries"("generated_at");

-- CreateIndex
CREATE INDEX "leaderboard_entries_retention_generated_id_idx" ON "leaderboard_entries"("generated_at", "id");

-- CreateIndex
CREATE INDEX "daily_metrics_metric_date_idx" ON "daily_metrics"("metric_date");

-- CreateIndex
CREATE INDEX "daily_metrics_generated_at_idx" ON "daily_metrics"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_date_timezone_scope_key" ON "daily_metrics"("metric_date", "timezone", "scope");

-- CreateIndex
CREATE INDEX "idx_scraped_at" ON "gambeta_scrape_runs"("scraped_at");

-- CreateIndex
CREATE INDEX "idx_pick_hash" ON "gambeta_pick_snapshots"("pick_hash");

-- CreateIndex
CREATE INDEX "idx_match" ON "gambeta_pick_snapshots"("home_team", "away_team");

-- CreateIndex
CREATE UNIQUE INDEX "uq_run_pick" ON "gambeta_pick_snapshots"("run_id", "pick_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uq_current_pick" ON "gambeta_current_picks"("pick_hash");

-- CreateIndex
CREATE INDEX "idx_current_match" ON "gambeta_current_picks"("home_team", "away_team");

-- CreateIndex
CREATE INDEX "idx_current_run_id" ON "gambeta_current_picks"("run_id");

-- CreateIndex
CREATE INDEX "idx_current_stats_run_id" ON "gambeta_current_stats"("run_id");

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_snapshots" ADD CONSTRAINT "provider_snapshots_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_snapshots" ADD CONSTRAINT "provider_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_snapshots" ADD CONSTRAINT "provider_snapshots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "harness_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_provider_snapshot_id_fkey" FOREIGN KEY ("provider_snapshot_id") REFERENCES "provider_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_quotes" ADD CONSTRAINT "odds_quotes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "odds_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_quotes" ADD CONSTRAINT "odds_quotes_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_runs" ADD CONSTRAINT "harness_runs_filter_preset_id_fkey" FOREIGN KEY ("filter_preset_id") REFERENCES "search_filter_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_tasks" ADD CONSTRAINT "harness_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "harness_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_quota_samples" ADD CONSTRAINT "provider_quota_samples_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_quota_daily" ADD CONSTRAINT "provider_quota_daily_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_presets" ADD CONSTRAINT "league_presets_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_presets" ADD CONSTRAINT "league_presets_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_presets" ADD CONSTRAINT "team_presets_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sports_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_presets" ADD CONSTRAINT "team_presets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "low_odds_scans" ADD CONSTRAINT "low_odds_scans_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "low_odds_scans" ADD CONSTRAINT "low_odds_scans_filter_preset_id_fkey" FOREIGN KEY ("filter_preset_id") REFERENCES "search_filter_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "low_odds_hits" ADD CONSTRAINT "low_odds_hits_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "low_odds_scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "low_odds_hits" ADD CONSTRAINT "low_odds_hits_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "low_odds_hits" ADD CONSTRAINT "low_odds_hits_odds_quote_id_fkey" FOREIGN KEY ("odds_quote_id") REFERENCES "odds_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_bundles" ADD CONSTRAINT "research_bundles_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_bundles" ADD CONSTRAINT "research_bundles_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_bundles" ADD CONSTRAINT "research_bundles_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "research_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_provider_snapshot_id_fkey" FOREIGN KEY ("provider_snapshot_id") REFERENCES "provider_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "research_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "research_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_odds_snapshot_id_fkey" FOREIGN KEY ("odds_snapshot_id") REFERENCES "odds_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_odds_quote_id_fkey" FOREIGN KEY ("odds_quote_id") REFERENCES "odds_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_research_bundle_id_fkey" FOREIGN KEY ("research_bundle_id") REFERENCES "research_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_parlay_id_fkey" FOREIGN KEY ("parlay_id") REFERENCES "parlays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_parlay_id_fkey" FOREIGN KEY ("parlay_id") REFERENCES "parlays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_provider_snapshot_id_fkey" FOREIGN KEY ("provider_snapshot_id") REFERENCES "provider_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_recommendation_publications" ADD CONSTRAINT "public_recommendation_publications_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_recommendation_publications" ADD CONSTRAINT "public_recommendation_publications_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_recommendation_publications" ADD CONSTRAINT "public_recommendation_publications_parlay_id_fkey" FOREIGN KEY ("parlay_id") REFERENCES "parlays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harness_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gambeta_pick_snapshots" ADD CONSTRAINT "gambeta_pick_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "gambeta_scrape_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gambeta_current_picks" ADD CONSTRAINT "gambeta_current_picks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "gambeta_scrape_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gambeta_current_stats" ADD CONSTRAINT "gambeta_current_stats_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "gambeta_scrape_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
