CREATE TABLE `public_recommendation_publications` (
  `id` CHAR(36) NOT NULL,
  `daily_batch_id` VARCHAR(120) NOT NULL,
  `run_id` CHAR(36) NULL,
  `slate_date` DATE NOT NULL,
  `channel` VARCHAR(80) NOT NULL DEFAULT 'discord',
  `target` VARCHAR(120) NOT NULL DEFAULT 'recommendations',
  `target_type` VARCHAR(40) NOT NULL,
  `target_id` VARCHAR(120) NOT NULL,
  `prediction_id` CHAR(36) NULL,
  `parlay_id` CHAR(36) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'published',
  `discord_target` VARCHAR(160) NULL,
  `discord_message_id` VARCHAR(120) NULL,
  `discord_message_ids` JSON NULL,
  `artifact_path` TEXT NULL,
  `payload_path` TEXT NULL,
  `payload_sha256` CHAR(64) NULL,
  `published_at` DATETIME(3) NOT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `public_rec_publications_target_key` (`daily_batch_id`, `channel`, `target`, `target_type`, `target_id`),
  INDEX `public_rec_publications_batch_channel_idx` (`daily_batch_id`, `channel`, `published_at`),
  INDEX `public_rec_publications_run_published_at_idx` (`run_id`, `published_at`),
  INDEX `public_rec_publications_prediction_id_idx` (`prediction_id`),
  INDEX `public_rec_publications_parlay_id_idx` (`parlay_id`),
  INDEX `public_rec_publications_status_published_at_idx` (`status`, `published_at`),
  CONSTRAINT `public_rec_publications_run_id_fkey`
    FOREIGN KEY (`run_id`) REFERENCES `harness_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `public_rec_publications_prediction_id_fkey`
    FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `public_rec_publications_parlay_id_fkey`
    FOREIGN KEY (`parlay_id`) REFERENCES `parlays`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
