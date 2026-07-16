-- CreateTable
CREATE TABLE `validation_artifacts` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `prediction_id` CHAR(36) NULL,
    `parlay_id` CHAR(36) NULL,
    `fixture_id` CHAR(36) NULL,
    `provider_snapshot_id` CHAR(36) NULL,
    `artifact_id` CHAR(36) NULL,
    `settlement_rule_version` VARCHAR(80) NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `reason` VARCHAR(120) NULL,
    `evaluated_at` DATETIME(3) NOT NULL,
    `result_input` JSON NULL,
    `outcome` JSON NULL,
    `evidence_ids` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `validation_artifacts_run_evaluated_at_idx`(`run_id`, `evaluated_at`),
    INDEX `validation_artifacts_prediction_evaluated_at_idx`(`prediction_id`, `evaluated_at`),
    INDEX `validation_artifacts_parlay_evaluated_at_idx`(`parlay_id`, `evaluated_at`),
    INDEX `validation_artifacts_fixture_evaluated_at_idx`(`fixture_id`, `evaluated_at`),
    INDEX `validation_artifacts_provider_snapshot_id_idx`(`provider_snapshot_id`),
    INDEX `validation_artifacts_artifact_id_idx`(`artifact_id`),
    INDEX `validation_artifacts_status_evaluated_at_idx`(`status`, `evaluated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `validation_artifacts` ADD CONSTRAINT `validation_artifacts_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_artifacts` ADD CONSTRAINT `validation_artifacts_prediction_id_fkey` FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_artifacts` ADD CONSTRAINT `validation_artifacts_parlay_id_fkey` FOREIGN KEY (`parlay_id`) REFERENCES `parlays`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_artifacts` ADD CONSTRAINT `validation_artifacts_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_artifacts` ADD CONSTRAINT `validation_artifacts_provider_snapshot_id_fkey` FOREIGN KEY (`provider_snapshot_id`) REFERENCES `provider_snapshots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_artifacts` ADD CONSTRAINT `validation_artifacts_artifact_id_fkey` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
