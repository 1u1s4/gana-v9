CREATE TABLE `daily_metrics` (
  `id` CHAR(36) NOT NULL,
  `metric_date` DATE NOT NULL,
  `timezone` VARCHAR(80) NOT NULL,
  `scope` VARCHAR(80) NOT NULL DEFAULT 'all',
  `source_window_start` DATETIME(3) NOT NULL,
  `source_window_end` DATETIME(3) NOT NULL,
  `prediction_metrics` JSON NULL,
  `parlay_metrics` JSON NULL,
  `chart_metrics` JSON NULL,
  `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `daily_metrics_date_timezone_scope_key` (`metric_date`, `timezone`, `scope`),
  INDEX `daily_metrics_metric_date_idx` (`metric_date`),
  INDEX `daily_metrics_generated_at_idx` (`generated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
