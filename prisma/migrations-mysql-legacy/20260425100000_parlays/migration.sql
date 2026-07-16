-- CreateTable
CREATE TABLE `parlays` (
    `id` CHAR(36) NOT NULL,
    `run_id` CHAR(36) NULL,
    `artifact_id` CHAR(36) NULL,
    `combined_odds` DECIMAL(12, 6) NULL,
    `aggregate_confidence` DECIMAL(5, 4) NOT NULL,
    `aggregate_quality` DECIMAL(5, 4) NOT NULL,
    `rationale_redacted` TEXT NOT NULL,
    `warnings` JSON NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `parlays_run_generated_at_idx`(`run_id`, `generated_at`),
    INDEX `parlays_status_generated_at_idx`(`status`, `generated_at`),
    INDEX `parlays_artifact_id_idx`(`artifact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parlay_legs` (
    `id` CHAR(36) NOT NULL,
    `parlay_id` CHAR(36) NOT NULL,
    `prediction_id` CHAR(36) NOT NULL,
    `fixture_id` CHAR(36) NOT NULL,
    `market_key` VARCHAR(80) NOT NULL,
    `selection_key` VARCHAR(120) NOT NULL,
    `line` DECIMAL(12, 6) NULL,
    `odds` DECIMAL(12, 6) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
    `leg_index` INTEGER NOT NULL,
    `inclusion_reason` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `parlay_legs_parlay_leg_index_key`(`parlay_id`, `leg_index`),
    UNIQUE INDEX `parlay_legs_parlay_prediction_key`(`parlay_id`, `prediction_id`),
    INDEX `parlay_legs_prediction_id_idx`(`prediction_id`),
    INDEX `parlay_legs_fixture_id_idx`(`fixture_id`),
    INDEX `parlay_legs_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `parlays` ADD CONSTRAINT `parlays_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parlays` ADD CONSTRAINT `parlays_artifact_id_fkey` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parlay_legs` ADD CONSTRAINT `parlay_legs_parlay_id_fkey` FOREIGN KEY (`parlay_id`) REFERENCES `parlays`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parlay_legs` ADD CONSTRAINT `parlay_legs_prediction_id_fkey` FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parlay_legs` ADD CONSTRAINT `parlay_legs_fixture_id_fkey` FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
