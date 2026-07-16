-- CreateTable
CREATE TABLE `sports_providers` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `base_url` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sports_providers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competitions` (
    `id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `provider_competition_id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `country` VARCHAR(120) NULL,
    `type` VARCHAR(80) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `competitions_provider_id_idx`(`provider_id`),
    UNIQUE INDEX `competitions_provider_provider_competition_id_key`(`provider_id`, `provider_competition_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `provider_team_id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `country` VARCHAR(120) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `teams_provider_id_idx`(`provider_id`),
    UNIQUE INDEX `teams_provider_provider_team_id_key`(`provider_id`, `provider_team_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fixtures` (
    `id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `provider_fixture_id` VARCHAR(80) NOT NULL,
    `competition_id` CHAR(36) NULL,
    `season` INTEGER NULL,
    `home_team_id` CHAR(36) NULL,
    `away_team_id` CHAR(36) NULL,
    `scheduled_at` DATETIME(3) NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'unknown',
    `score_home` INTEGER NULL,
    `score_away` INTEGER NULL,
    `included_by_filters` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fixtures_status_scheduled_at_idx`(`status`, `scheduled_at`),
    INDEX `fixtures_competition_season_scheduled_at_idx`(`competition_id`, `season`, `scheduled_at`),
    INDEX `fixtures_home_team_scheduled_at_idx`(`home_team_id`, `scheduled_at`),
    INDEX `fixtures_away_team_scheduled_at_idx`(`away_team_id`, `scheduled_at`),
    UNIQUE INDEX `fixtures_provider_provider_fixture_id_key`(`provider_id`, `provider_fixture_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_snapshots` (
    `id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `endpoint_name` VARCHAR(120) NOT NULL,
    `request_hash` VARCHAR(64) NOT NULL,
    `response_hash` VARCHAR(64) NULL,
    `payload_hash` VARCHAR(64) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quota_metadata` JSON NULL,
    `request_metadata` JSON NULL,
    `raw_payload` JSON NULL,
    `run_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `correlation_id` VARCHAR(80) NULL,
    `trace_id` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `provider_snapshots_provider_endpoint_captured_at_idx`(`provider_id`, `endpoint_name`, `captured_at`),
    INDEX `provider_snapshots_run_id_idx`(`run_id`),
    INDEX `provider_snapshots_task_id_idx`(`task_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odds_snapshots` (
    `id` CHAR(36) NOT NULL,
    `fixture_id` CHAR(36) NOT NULL,
    `provider_snapshot_id` CHAR(36) NULL,
    `provider_fixture_id` VARCHAR(80) NOT NULL,
    `bookmaker_count` INTEGER NOT NULL DEFAULT 0,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payload_hash` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `odds_snapshots_fixture_captured_at_idx`(`fixture_id`, `captured_at`),
    INDEX `odds_snapshots_provider_snapshot_id_idx`(`provider_snapshot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odds_quotes` (
    `id` CHAR(36) NOT NULL,
    `snapshot_id` CHAR(36) NOT NULL,
    `fixture_id` CHAR(36) NOT NULL,
    `bookmaker` VARCHAR(160) NOT NULL,
    `bookmaker_key` VARCHAR(120) NULL,
    `market_key` VARCHAR(80) NOT NULL,
    `selection_key` VARCHAR(120) NOT NULL,
    `line` DECIMAL(12, 6) NULL,
    `price` DECIMAL(12, 6) NOT NULL,
    `implied_probability` DECIMAL(12, 6) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `odds_quotes_fixture_market_captured_at_idx`(`fixture_id`, `market_key`, `captured_at`),
    INDEX `odds_quotes_fixture_market_selection_line_captured_at_idx`(`fixture_id`, `market_key`, `selection_key`, `line`, `captured_at`),
    INDEX `odds_quotes_snapshot_id_idx`(`snapshot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `harness_runs` (
    `id` CHAR(36) NOT NULL,
    `runtime` VARCHAR(80) NOT NULL,
    `profile` VARCHAR(80) NOT NULL,
    `provider_sports` VARCHAR(80) NOT NULL,
    `provider_agentic` VARCHAR(80) NULL,
    `model` VARCHAR(160) NULL,
    `filter_preset_id` CHAR(36) NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'created',
    `verdict` VARCHAR(80) NULL,
    `artifact_dir` VARCHAR(700) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `harness_runs_status_created_at_idx`(`status`, `created_at`),
    INDEX `harness_runs_filter_preset_id_idx`(`filter_preset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `harness_tasks` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `type` VARCHAR(120) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'queued',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `scheduled_for` DATETIME(3) NULL,
    `lease_expires_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 3,
    `payload` JSON NULL,
    `last_error_redacted` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `harness_tasks_queue_idx`(`status`, `scheduled_for`, `priority`, `created_at`),
    INDEX `harness_tasks_running_lease_idx`(`status`, `lease_expires_at`),
    INDEX `harness_tasks_run_id_idx`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `artifacts` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `name` VARCHAR(240) NOT NULL,
    `kind` VARCHAR(80) NOT NULL,
    `path` VARCHAR(700) NOT NULL,
    `sha256` VARCHAR(64) NULL,
    `size_bytes` BIGINT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `artifacts_run_created_at_idx`(`run_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `event_type` VARCHAR(120) NOT NULL,
    `actor` VARCHAR(120) NOT NULL DEFAULT 'harness',
    `severity` VARCHAR(40) NOT NULL DEFAULT 'info',
    `correlation_id` VARCHAR(80) NULL,
    `trace_id` VARCHAR(80) NULL,
    `payload_redacted` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_run_created_at_idx`(`run_id`, `created_at`),
    INDEX `audit_logs_event_type_created_at_idx`(`event_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_quota_samples` (
    `id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NULL,
    `provider_code` VARCHAR(64) NOT NULL,
    `endpoint_name` VARCHAR(120) NULL,
    `status` VARCHAR(40) NOT NULL,
    `quota_limit` INTEGER NULL,
    `quota_remaining` INTEGER NULL,
    `reset_at` DATETIME(3) NULL,
    `response_ms` INTEGER NULL,
    `error_redacted` TEXT NULL,
    `metadata` JSON NULL,
    `sampled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `provider_quota_samples_provider_sampled_at_idx`(`provider_code`, `sampled_at`),
    INDEX `provider_quota_samples_provider_id_sampled_at_idx`(`provider_id`, `sampled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `league_presets` (
    `id` CHAR(36) NOT NULL,
    `preset_key` VARCHAR(80) NOT NULL DEFAULT 'default',
    `provider_id` CHAR(36) NOT NULL,
    `provider_competition_id` VARCHAR(80) NOT NULL,
    `competition_id` CHAR(36) NULL,
    `name` VARCHAR(200) NOT NULL,
    `country` VARCHAR(120) NULL,
    `season` INTEGER NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `league_presets_enabled_preset_idx`(`enabled`, `preset_key`),
    UNIQUE INDEX `league_presets_preset_provider_competition_season_key`(`preset_key`, `provider_id`, `provider_competition_id`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_presets` (
    `id` CHAR(36) NOT NULL,
    `preset_key` VARCHAR(80) NOT NULL DEFAULT 'default',
    `provider_id` CHAR(36) NOT NULL,
    `provider_team_id` VARCHAR(80) NOT NULL,
    `team_id` CHAR(36) NULL,
    `name` VARCHAR(200) NOT NULL,
    `country` VARCHAR(120) NULL,
    `provider_league_id` VARCHAR(80) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `team_presets_enabled_preset_idx`(`enabled`, `preset_key`),
    UNIQUE INDEX `team_presets_preset_provider_team_key`(`preset_key`, `provider_id`, `provider_team_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `search_filter_presets` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `season` INTEGER NULL,
    `markets` JSON NULL,
    `threshold` DECIMAL(12, 6) NULL,
    `kickoff_window_hours` INTEGER NULL,
    `include_live_fixtures` BOOLEAN NOT NULL DEFAULT false,
    `include_completed_fixtures` BOOLEAN NOT NULL DEFAULT false,
    `max_fixtures` INTEGER NULL,
    `bookmaker_allowlist` JSON NULL,
    `combine_mode` VARCHAR(20) NOT NULL DEFAULT 'OR',
    `config_snapshot` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `search_filter_presets_key_key`(`key`),
    INDEX `search_filter_presets_enabled_key_idx`(`enabled`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `low_odds_scans` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `filter_preset_id` CHAR(36) NULL,
    `query_snapshot` JSON NULL,
    `threshold` DECIMAL(12, 6) NOT NULL,
    `comparison` VARCHAR(20) NOT NULL DEFAULT 'lte',
    `status` VARCHAR(40) NOT NULL DEFAULT 'created',
    `fixture_count` INTEGER NOT NULL DEFAULT 0,
    `hit_count` INTEGER NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `error_redacted` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `low_odds_scans_status_created_at_idx`(`status`, `created_at`),
    INDEX `low_odds_scans_run_id_idx`(`run_id`),
    INDEX `low_odds_scans_filter_preset_id_idx`(`filter_preset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `low_odds_hits` (
    `id` CHAR(36) NOT NULL,
    `scan_id` CHAR(36) NOT NULL,
    `fixture_id` CHAR(36) NOT NULL,
    `odds_quote_id` CHAR(36) NULL,
    `market_key` VARCHAR(80) NOT NULL,
    `selection_key` VARCHAR(120) NOT NULL,
    `line` DECIMAL(12, 6) NULL,
    `odds` DECIMAL(12, 6) NOT NULL,
    `implied_probability` DECIMAL(12, 6) NULL,
    `bookmaker` VARCHAR(160) NULL,
    `included_reasons` JSON NULL,
    `excluded_reasons` JSON NULL,
    `eligible` BOOLEAN NOT NULL DEFAULT true,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `low_odds_hits_scan_odds_idx`(`scan_id`, `odds`),
    INDEX `low_odds_hits_fixture_id_idx`(`fixture_id`),
    INDEX `low_odds_hits_odds_quote_id_idx`(`odds_quote_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `competitions` ADD CONSTRAINT `competitions_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fixtures` ADD CONSTRAINT `fixtures_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fixtures` ADD CONSTRAINT `fixtures_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fixtures` ADD CONSTRAINT `fixtures_home_team_id_fkey` FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fixtures` ADD CONSTRAINT `fixtures_away_team_id_fkey` FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_snapshots` ADD CONSTRAINT `provider_snapshots_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_snapshots` ADD CONSTRAINT `provider_snapshots_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_snapshots` ADD CONSTRAINT `provider_snapshots_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `harness_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odds_snapshots` ADD CONSTRAINT `odds_snapshots_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odds_snapshots` ADD CONSTRAINT `odds_snapshots_provider_snapshot_id_fkey` FOREIGN KEY (`provider_snapshot_id`) REFERENCES `provider_snapshots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odds_quotes` ADD CONSTRAINT `odds_quotes_snapshot_id_fkey` FOREIGN KEY (`snapshot_id`) REFERENCES `odds_snapshots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odds_quotes` ADD CONSTRAINT `odds_quotes_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `harness_runs` ADD CONSTRAINT `harness_runs_filter_preset_id_fkey` FOREIGN KEY (`filter_preset_id`) REFERENCES `search_filter_presets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `harness_tasks` ADD CONSTRAINT `harness_tasks_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_quota_samples` ADD CONSTRAINT `provider_quota_samples_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `league_presets` ADD CONSTRAINT `league_presets_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `league_presets` ADD CONSTRAINT `league_presets_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_presets` ADD CONSTRAINT `team_presets_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `sports_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_presets` ADD CONSTRAINT `team_presets_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `low_odds_scans` ADD CONSTRAINT `low_odds_scans_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `low_odds_scans` ADD CONSTRAINT `low_odds_scans_filter_preset_id_fkey` FOREIGN KEY (`filter_preset_id`) REFERENCES `search_filter_presets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `low_odds_hits` ADD CONSTRAINT `low_odds_hits_scan_id_fkey` FOREIGN KEY (`scan_id`) REFERENCES `low_odds_scans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `low_odds_hits` ADD CONSTRAINT `low_odds_hits_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `low_odds_hits` ADD CONSTRAINT `low_odds_hits_odds_quote_id_fkey` FOREIGN KEY (`odds_quote_id`) REFERENCES `odds_quotes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

