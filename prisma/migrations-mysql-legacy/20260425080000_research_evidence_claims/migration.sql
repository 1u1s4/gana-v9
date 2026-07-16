-- CreateTable
CREATE TABLE `research_bundles` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `fixture_id` CHAR(36) NULL,
    `provider_fixture_id` VARCHAR(80) NULL,
    `artifact_id` CHAR(36) NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'created',
    `gate_result` JSON NULL,
    `provider_agentic` VARCHAR(80) NULL,
    `model` VARCHAR(160) NULL,
    `prompt_version` VARCHAR(80) NULL,
    `warnings` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `research_bundles_run_created_at_idx`(`run_id`, `created_at`),
    INDEX `research_bundles_fixture_created_at_idx`(`fixture_id`, `created_at`),
    INDEX `research_bundles_provider_fixture_created_at_idx`(`provider_fixture_id`, `created_at`),
    INDEX `research_bundles_status_created_at_idx`(`status`, `created_at`),
    INDEX `research_bundles_artifact_id_idx`(`artifact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `source_records` (
    `id` VARCHAR(120) NOT NULL,
    `bundle_id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `fixture_id` CHAR(36) NULL,
    `artifact_id` CHAR(36) NULL,
    `provider_snapshot_id` CHAR(36) NULL,
    `source_type` VARCHAR(80) NOT NULL,
    `url` VARCHAR(1000) NULL,
    `title` VARCHAR(500) NULL,
    `external_id` VARCHAR(240) NULL,
    `hash` VARCHAR(64) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `warnings` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `source_records_bundle_captured_at_idx`(`bundle_id`, `captured_at`),
    INDEX `source_records_source_type_captured_at_idx`(`source_type`, `captured_at`),
    INDEX `source_records_fixture_captured_at_idx`(`fixture_id`, `captured_at`),
    INDEX `source_records_run_captured_at_idx`(`run_id`, `captured_at`),
    INDEX `source_records_artifact_id_idx`(`artifact_id`),
    INDEX `source_records_provider_snapshot_id_idx`(`provider_snapshot_id`),
    INDEX `source_records_hash_idx`(`hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence_items` (
    `id` VARCHAR(120) NOT NULL,
    `bundle_id` CHAR(36) NOT NULL,
    `source_id` VARCHAR(120) NOT NULL,
    `fixture_id` CHAR(36) NULL,
    `artifact_id` CHAR(36) NULL,
    `kind` VARCHAR(80) NULL,
    `snippet_redacted` TEXT NULL,
    `summary_redacted` TEXT NULL,
    `confidence` DECIMAL(5, 4) NULL,
    `claim_ids` JSON NULL,
    `warnings` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `evidence_items_bundle_created_at_idx`(`bundle_id`, `created_at`),
    INDEX `evidence_items_source_created_at_idx`(`source_id`, `created_at`),
    INDEX `evidence_items_fixture_created_at_idx`(`fixture_id`, `created_at`),
    INDEX `evidence_items_artifact_id_idx`(`artifact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `claims` (
    `id` VARCHAR(120) NOT NULL,
    `bundle_id` CHAR(36) NOT NULL,
    `fixture_id` CHAR(36) NULL,
    `source_id` VARCHAR(120) NULL,
    `statement` TEXT NOT NULL,
    `subject_type` VARCHAR(80) NULL,
    `subject_key` VARCHAR(160) NULL,
    `market_key` VARCHAR(80) NULL,
    `selection_key` VARCHAR(120) NULL,
    `line` DECIMAL(12, 6) NULL,
    `support_level` VARCHAR(40) NOT NULL DEFAULT 'unknown',
    `confidence` DECIMAL(5, 4) NULL,
    `evidence_ids` JSON NULL,
    `conflict_status` VARCHAR(40) NOT NULL DEFAULT 'unknown',
    `critical` BOOLEAN NOT NULL DEFAULT false,
    `warnings` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `claims_bundle_created_at_idx`(`bundle_id`, `created_at`),
    INDEX `claims_fixture_market_idx`(`fixture_id`, `market_key`),
    INDEX `claims_source_id_idx`(`source_id`),
    INDEX `claims_support_conflict_idx`(`support_level`, `conflict_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `research_bundles` ADD CONSTRAINT `research_bundles_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_bundles` ADD CONSTRAINT `research_bundles_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_bundles` ADD CONSTRAINT `research_bundles_artifact_id_fkey` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `source_records` ADD CONSTRAINT `source_records_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `research_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `source_records` ADD CONSTRAINT `source_records_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `source_records` ADD CONSTRAINT `source_records_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `source_records` ADD CONSTRAINT `source_records_artifact_id_fkey` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `source_records` ADD CONSTRAINT `source_records_provider_snapshot_id_fkey` FOREIGN KEY (`provider_snapshot_id`) REFERENCES `provider_snapshots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_items` ADD CONSTRAINT `evidence_items_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `research_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_items` ADD CONSTRAINT `evidence_items_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `source_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_items` ADD CONSTRAINT `evidence_items_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_items` ADD CONSTRAINT `evidence_items_artifact_id_fkey` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claims` ADD CONSTRAINT `claims_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `research_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claims` ADD CONSTRAINT `claims_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claims` ADD CONSTRAINT `claims_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `source_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
