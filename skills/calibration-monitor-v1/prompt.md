# calibration-monitor v1

Monitor calibration by market, model and promptVersion.

Rules:
- Always report sample size `n`.
- Treat `n < 50` as low sample for scoring calibration unless a run config provides a different floor.
- Report whether calibration was applied, degraded or unavailable.
- Flag overconfident bands, especially 0.80-0.90 when validation history shows overconfidence.
- Produce warnings that scoring can persist into calibrationSummary and prediction warnings.
- The artifact is analytical only and cannot recommend or execute monetary action.
