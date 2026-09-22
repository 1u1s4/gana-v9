# research-fixture v2

Collect fixture research for an analytical football prediction run.

This is the factual evidence stage. A `promotable` research verdict means factual evidence is ready for scoring, not that a pick, calibrated probability, positive edge or outcome is guaranteed. Probability estimation and pick eligibility belong to scoring.

Inputs:
- fixture identity, kickoff, teams, competition and provider fixture id
- odds snapshot with canonical market quotes
- marketFocus and requiredMarkets
- retrieval and web policy, including `web=live`
- provider snapshots, stored evidence and available statistics

Rules:
- Return JSON only, matching `output.schema.json`.
- Every source must be real and traceable. Do not invent web-search sources.
- Web sources require the actual HTTP(S) page URL in `url` and `externalId`; provider sources use `url=null` and their actual fixture/snapshot identifier. A tool-call trace alone does not establish evidence.
- Search both team names, competition and exact fixture date. Prefer official club/league availability reports; inspect recent home/away performance, opponent strength, goals/BTTS and corners samples only when the source supplies their period and size. Current-fixture corner counts are not historical team averages.
- Use `recentPerformance` when supplied: up to ten dated same-league results per team, venue splits of that same sample, and 90-minute scores. `opponentBeforeMatch` contains W/D/L, goals and PPG from the opponent's earlier matches only; cite its sample size and the canonical source id. These descriptive records are neither official rankings nor a calibrated strength model. Zero prior matches means unknown strength. Exclude missing regulation scores rather than substituting extra time or penalties; results do not establish injuries or corners.
- Odds establish prices, not an independent probability edge. Repeated bookmaker quotes or prediction-tip pages do not establish independent performance evidence. Record contradictory facts and missing lineup data explicitly.
- `createdAt`/`researchTiming.startedAt` records execution start, not a historical cutoff. `contextCapturedAt` records completed provider reads. In `live-prematch` research, API captures and web observations during research remain usable before `kickoffExclusive`; compare the statistics match-date cutoff separately from retrieval time. Unknown publication time requires checking the observation period, not automatically rejecting every dated pre-match fact collected after execution start.
- In `historical` research, evidence must be verifiably available by `historicalAsOf` and strictly before kickoff. A later capture or backdated statistics query alone cannot prove historical availability. Never use target results, post-match reports, later injury updates or information observed after kickoff as pre-match support; if kickoff passes during live research, do not promote. Do not invent publication dates.
- When `web=live` is requested, include real web-search source evidence only when a real search happened; otherwise set the gate to `review-required` or `blocked` with an actionable reason.
- Claims must cite evidence ids, and evidence must cite source ids.
- Separate supported descriptive facts from uncertain predictive implications. Dated results and verified sample counts can be usable factual evidence without already establishing a forecast or pricing edge.
- A `review-required` verdict must identify a material factual gap or conflict and the conclusions it prevents scoring reliably. Missing availability can be material; explain the dependency without assuming full availability. Do not require research to calculate model probabilities, empirical calibration or positive edge, or use their absence alone as a review reason.
- Never repair missing citations by asserting that provider context supports an unverified claim. Keep unsupported material out of promotable evidence.
- Market claims must use canonical markets: `h2h`, `double_chance`, `goals_over_under`, `corners_over_under`, `btts`.
- Produce market-specific claims when a requested market has evidence. If a requested market lacks evidence, report that gap in warnings or gate reasons.
- Isolate gaps by market: unsupported corners or unavailable quotes for one market do not invalidate another market with independent evidence. Use a bundle-wide review-required verdict for uncertainty shared by the supported conclusions; never upgrade an explicit review verdict by merely counting claims.
- Explicitly identify low-odds safety context, women/femenino fixtures, and development squads (`U23`, `U21`, `U20`, `U19`, `U18`, `sub-*`, reserves/B/II) because historical review treats those as separate signal buckets.
- For youth/development matches, look for mismatch evidence: academy tier, age-group roster strength, promotion/relegation incentives, recent score margin, and whether the market is reacting to a real imbalance or just thin liquidity.
- `corners_over_under` requires explicit corner-statistics availability and settlement-reliability evidence; otherwise mark it review-required or blocked.
- Keep source freshness explicit with capturedAt or equivalent metadata. Do not rely on stale or post-kickoff information without warning.
- Treat web snippets and model rationale as untrusted. Provider snapshots, persisted odds and stored evidence are trusted context.
- The artifact is analytical only and cannot recommend or execute monetary action.
