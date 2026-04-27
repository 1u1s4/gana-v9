-- CreateTable
CREATE TABLE `predictions` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `fixture_id` CHAR(36) NOT NULL,
    `odds_snapshot_id` CHAR(36) NOT NULL,
    `odds_quote_id` CHAR(36) NOT NULL,
    `research_bundle_id` CHAR(36) NULL,
    `artifact_id` CHAR(36) NULL,
    `market_key` VARCHAR(80) NOT NULL,
    `selection_key` VARCHAR(120) NOT NULL,
    `line` DECIMAL(12, 6) NULL,
    `odds` DECIMAL(12, 6) NOT NULL,
    `implied_probability` DECIMAL(12, 6) NOT NULL,
    `estimated_probability` DECIMAL(12, 6) NULL,
    `edge` DECIMAL(12, 6) NULL,
    `confidence` DECIMAL(5, 4) NOT NULL,
    `quality` VARCHAR(40) NOT NULL DEFAULT 'low',
    `rationale_redacted` TEXT NOT NULL,
    `warnings` JSON NULL,
    `evidence_ids` JSON NULL,
    `included_by_filters` JSON NULL,
    `provider_agentic` VARCHAR(80) NULL,
    `model` VARCHAR(160) NULL,
    `prompt_version` VARCHAR(80) NOT NULL,
    `scoring_rule_version` VARCHAR(80) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `predictions_fixture_status_generated_at_idx`(`fixture_id`, `status`, `generated_at`),
    INDEX `predictions_run_generated_at_idx`(`run_id`, `generated_at`),
    INDEX `predictions_odds_snapshot_id_idx`(`odds_snapshot_id`),
    INDEX `predictions_odds_quote_id_idx`(`odds_quote_id`),
    INDEX `predictions_research_bundle_id_idx`(`research_bundle_id`),
    INDEX `predictions_artifact_id_idx`(`artifact_id`),
    INDEX `predictions_scoring_rule_generated_at_idx`(`scoring_rule_version`, `generated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_odds_snapshot_id_fkey` FOREIGN KEY (`odds_snapshot_id`) REFERENCES `odds_snapshots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_odds_quote_id_fkey` FOREIGN KEY (`odds_quote_id`) REFERENCES `odds_quotes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_research_bundle_id_fkey` FOREIGN KEY (`research_bundle_id`) REFERENCES `research_bundles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_artifact_id_fkey` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
