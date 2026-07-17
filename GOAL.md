# Goal: recover and harden the Daily E2E catch-up

## Outcome

Produce and publish a valid, non-empty Daily E2E recommendation artifact for the
`2026-07-16` slate, and make the canonical dispatcher recover a still-retryable
Daily from the prior target date after midnight instead of silently orphaning it.

## Baseline

- Local time at diagnosis: `2026-07-15 22:39` in `America/Guatemala`.
- The only active scheduler is Codex Automation `gana-daily-e2e`, named
  `Gana · operaciones diarias`, with checkpoints at 07:15, 10:15, 13:15, 18:15,
  and 22:15.
- Batch `daily-2026-07-16-full` was attempted five times on July 15. The latest
  attempt ran from `2026-07-16T04:16:47Z` to `04:17:03Z` and exited 1.
- Every attempt produced zero recommendations because API-Football returned a
  per-minute rate-limit error from the fixtures endpoint.
- The current lock is `retryable` until `2026-07-16T06:17:08.501Z`, equivalent
  to July 16 at 00:17 Guatemala. There is no checkpoint then.
- The dispatcher derives only `today + 1`; after midnight it will target July 17
  and will no longer inspect the still-retryable July 16 lock. This is the
  catch-up rollover defect to fix.
- There is no live Daily E2E process and no publication ledger/message for the
  empty July 16 artifact.

## Constraints

- Do not expose `.env` secrets or provider credentials.
- Do not delete unrelated runs, locks, artifacts, or user changes.
- Do not duplicate a Discord publication; inspect artifact and ledger state
  before each publish attempt.
- Keep recommendations analytical only; do not add betting execution, payment,
  or bookmaker actions.
- Do not weaken gates, fabricate selections, substitute mocks, or treat an empty
  artifact as success.
- A retry may reuse the canonical batch only after confirming no live process or
  prior publication. Any cleanup must be limited to that exact batch.

## Primary verifier

The final `daily-2026-07-16` recommendation artifact passes the notifier dry-run,
contains at least one publishable selection, has counts equal to its parlays plus
atomic predictions, contains no raw UUID or `Fixture ...` label where metadata
exists, and the requested Discord delivery returns message IDs or a ledger readback
proves the same payload was already published.

## Supporting checks

- Add a deterministic regression test showing that a retryable prior target is
  recovered after midnight/on the next checkpoint before a new Daily is started.
- Preserve the one-heavy-flow-per-checkpoint rule, terminal-state idempotency,
  strategy priority, maintenance pause, and global lock behavior.
- Run focused dispatcher/wrapper tests, `node --check` for changed scripts,
  `bash -n` if a shell wrapper changes, `pnpm typecheck`, and the full test suite
  when shared scheduling or publication behavior changes.

## Iteration loop

1. Reconstruct scheduler, lock, provider, artifact, and ledger evidence.
2. Change one deterministic catch-up or rate-limit behavior at a time.
3. Run the focused failing/regression test.
4. Confirm no live process or prior publication, then run the guarded Daily for
   `2026-07-16`.
5. Inspect progress and provider artifacts while long phases run.
6. Validate and dry-run the final recommendation artifact before publication.
7. Record exact batch, counts, message IDs, commands, and remaining risks.

## Approval gates

- The user's request to run the canonical Daily E2E authorizes its normal
  recommendation publication to the configured Discord channel for this slate.
- Changing credentials, provider subscriptions, repository remotes, branches,
  or unrelated schedules requires separate user approval.
- A second/corrective Discord send after a confirmed publication requires
  separate approval.

## Blocker standard

Do not mark the goal blocked for a transient provider limit or a failed attempt.
It is blocked only after the same external condition recurs for the required goal
turn threshold, safe retries/alternatives are exhausted, and no code or scheduling
work can make meaningful progress. Record the smallest external action needed.

## Completion proof

Status: achieved on `2026-07-16T05:16:00Z`.

- Batch `daily-2026-07-16-full` completed with 244 predictions, 4 promotable
  candidates, and 3 review-required daily-focus parlay recommendations.
- The notifier dry-run rendered one native Discord payload with 3 selections,
  human fixture labels, and no raw UUID/`Fixture ...` labels.
- Discord recommendations message: `1527181985456328791`.
- The publication ledger contains 6/6 published prediction-leg rows with one
  payload hash and the same Discord message ID; the Daily lock is `published`.
- The current dispatcher reports `nothing-due`. At the next-day 10:15 rollover,
  the published July 16 lock is terminal and the dispatcher selects the July 17
  initial Daily rather than retrying or blocking it.
- `pnpm typecheck` and the full `pnpm test` suite pass (566/566).

## Continuation: recover July 17 and clear stuck scheduled work

### Outcome

On `2026-07-16`, recover the missing Daily E2E for the `2026-07-17` slate,
identify why the scheduled catch-up did not produce recommendations, and review
the Codex Automation runs that appeared stuck without duplicating an existing
publication.

### Findings

- The 07:15 Automation thread disconnected before it invoked the dispatcher.
  The 10:15 checkpoint did perform the catch-up, but all 83 initial agentic
  research requests failed with HTTP 400 because the `gpt-5.6-terra` model
  required a newer Codex CLI.
- Scheduled shells prioritized `/opt/homebrew/bin/codex` (`0.136.0`) over the
  user-updatable CLI. Even the stable user CLI (`0.144.5`) was too old for the
  model at the time of the incident.
- Two later Automation threads completed their operational command but then
  waited 87-223 seconds while trying to archive their own active thread. This
  made completed work appear hung.
- The July 15 validation job used a stale `dist/cli.js`. That build passed
  synthetic `daily-focus-*` parlay identifiers to Prisma UUID queries, so both
  validation and metrics exited 1.
- Retention's July 16 `review-required` state is a completed safety gate, not a
  live or abandoned process. Strategy review completed and published normally.

### Changes

- Upgraded both CLI resolution paths to `codex-cli 0.145.0-alpha.18` and proved
  `gpt-5.6-terra` works through both paths with live canaries.
- Daily and strategy shell wrappers now prefer `$HOME/.local/bin`, with
  `GANA_CODEX_BIN_DIR` as an explicit override, before Homebrew paths.
- Validation/metrics now use `dist/cli.js` only when it is at least as current
  as `src`; otherwise they execute `src/cli.ts` through `tsx`.
- The Automation prompt no longer calls `set_thread_archived` from inside its
  own active turn. The three affected scheduled threads were archived after
  their terminal state was audited.

### Completion proof

Status: achieved on `2026-07-16T21:29:26Z`.

- Batch `daily-2026-07-17-full` ran for 34 minutes and published 5 selections:
  3 parlays and 2 atomic predictions.
- The final artifact passed the deterministic Discord dry-run in one payload,
  with human fixture labels and no raw UUID/`Fixture ...` placeholders.
- Discord recommendations message: `1527426418856820974`.
- The publication ledger contains 8/8 `published` prediction rows with one
  payload hash and the same Discord message ID; the Daily lock is `published`.
- Provider run `b42b4c24-d726-4c09-97ce-6c7ab773c0bb` finished with all 9/9
  durable tasks `succeeded` in both local artifacts and the database. No Daily,
  scoring, research, or notifier process remained alive.
- The July 15 validation catch-up completed with 12 validation rows, one daily
  metric snapshot, and Discord statistics message `1527426926120271984`; its
  lock is now `published`.
- A post-publication 18:15 dispatcher simulation reports `nothing-due`, with
  the July 17 Daily and July 15 validation both terminal and idempotent.
- Focused runtime checks pass 16/16; `pnpm typecheck` passes. The full suite
  passes 565/569 inside the sandbox, with only four dashboard socket tests
  blocked by `listen EPERM`; the affected dashboard suite passes 20/20 when
  rerun with local socket permission.

### Reviewed historical state debt

The database also contains 13 old `HarnessRun` rows and 209 old `HarnessTask`
rows marked nonterminal even though no matching process is alive. They predate
this incident and are internal lifecycle residue, not active Codex Automation
threads. They were intentionally not bulk-mutated: nested services can currently
mark a parent run terminal while its synchronous pipeline is still active, so a
safe cleanup requires a compare-and-set reconciler and a separate lifecycle fix.

## Continuation: repair previous-day validation and historical catch-up

### Outcome

Repair the validation scheduler so every checkpoint accounts for the previous
day and safely catches up older omissions. Audit validation dates 2026-07-02
through 2026-07-15, reuse already-proven deliveries, and resolve only dates that
are missing, source-misaligned, or have no published Daily.

### Audit result

- Exact successful validation and current-channel Discord delivery already exist
  for July 2, 5, 6, 7, 9, 10, 12, and 15; they must not be duplicated.
- July 3 and 14 have a published Daily but validation failed before publication.
- July 4 and 11 published validation messages against a newer/different artifact,
  not the Daily batch that was actually published; they require visibly labelled
  corrections against `daily-2026-07-04-full` and
  `daily-2026-07-11-sol-high`.
- July 8 and 13 have Daily locks in `retryable`, not `published`. They must be
  closed explicitly as no-publication days and must not mirror picks that users
  never received.
- Historical validation logs resolve to the same configured validation target,
  `discord:1510041125614915756`; existing message IDs are delivery evidence,
  not a reason to resend every correct date.

### Implemented safety contract

- The dispatcher scans yesterday plus a 14-day backlog, prioritizes yesterday,
  then the oldest safe historical date, and runs at most one validation per tick.
- A validation is runnable only from a `published` Daily lock and the exact
  `runs/<dailyBatchId>/daily-parlay-recommendations.json` with aligned date/batch.
- The wrapper uses an atomic per-date mutex and phase state. `--force` is rejected;
  a backfill requires a visible `--test-label`.
- Validate must succeed before metrics, and both must succeed before Discord.
- Payloads are frozen before send. The lock stores target, hashes, stats ID,
  every mirror ID, and each delivery entry. Any possible partial delivery becomes
  `publication-uncertain` and is never retried automatically.
- Pre-publication retryable work resumes by phase; v2 `review-required` remains
  manual so a partial validation cannot silently duplicate stored history.

### Verification and production completion

Status: achieved after explicit production authorization on `2026-07-16`.

- The six authorized actions ran sequentially in the approved stop-on-uncertainty
  order. July 3 and 14 were visibly labelled backfills; July 4 and 11 were visibly
  labelled corrections against their exact published Daily; July 8 and 13 were
  no-publication closeouts with no recommendation mirrors.
- July 3 used `daily-2026-07-03-full`, persisted 32 validations plus the
  `daily-2026-07-03` metric, and sent Discord IDs `1527551696463597579`,
  `1527551710807986177`, and `1527551724850511969`.
- July 4 used `daily-2026-07-04-full`, persisted 34 validations plus the
  `daily-2026-07-04` metric, and sent Discord IDs `1527552514340294768`,
  `1527552527879372820`, and `1527552541796077653`.
- July 8 closed as `not-applicable` with one no-publication message,
  `1527552659509346455`; no mirror or validation artifact was created.
- July 11 used `daily-2026-07-11-sol-high`, persisted 13 validations plus the
  `daily-2026-07-11` metric, and sent Discord IDs `1527553200381628447`,
  `1527553216110268530`, and `1527553234829316099`.
- July 13 closed as `not-applicable` with one no-publication message,
  `1527553355097051187`; no mirror or validation artifact was created.
- July 14 used `daily-2026-07-14-full`, persisted 7 validations plus the
  `daily-2026-07-14` metric, and sent Discord IDs `1527554597487382539`,
  `1527554615338602498`, and `1527554631805173773`.
- Provider burst limits stopped the first July 4 and July 14 attempts before any
  publication. Both remained safely retryable with no message ID or mutex. The
  published-artifact validation path now serializes result fetches at concurrency
  one; its regression test deliberately throws `rate_limited` on any overlap.
- The final audit accounts for all 14 dates from July 2 through July 15: 12 exact
  published validations and only July 8/13 as exact `not-applicable` closeouts.
  Every state is source-aligned, all published command exits are 0/0, notification
  hashes and message IDs match, and no validation mutex remains.
- The pre-midnight live dispatcher dry-run reports the historical
  `validationBacklog: []`. After midnight, July 16 appears as the sole runnable
  candidate but remains correctly skipped as `before-07:15`; a July 17 07:15
  simulation selects that exact previous day from `daily-2026-07-16-full` and
  its canonical recommendation artifact.
- Direct database readback confirms validation counts 32/34/13/7 and one scoped
  daily metric each for July 3/4/11/14. PostgreSQL migrations remain applied.
- Focused dispatcher/runtime/workflow checks pass 60/60, validation service checks
  pass 16/16, `pnpm typecheck`, syntax checks and `git diff --check` pass, and the
  final unrestricted full suite passes 610/610.
- An independent lock/artifact/notification audit passed with no blocker.

### Post-completion correction: validation Discord routing

Status: corrected and reverified on `2026-07-17`.

- The original catch-up messages were real Discord deliveries, but
  `GANA_DISCORD_VALIDATION_TARGET` incorrectly pointed to the restricted
  `#gana-alertas` channel (`1510041125614915756`) instead of the dedicated
  `#gana-validaciones` channel (`1510041050255855616`). Direct Discord GETs
  proved all original IDs existed; this was a routing/visibility defect, not a
  false-positive gateway response.
- The deployment environment, Hermes cron installer default, and notifier guide
  now route validation to `discord:1510041050255855616`.
- Frozen, hash-verified payloads were rerouted idempotently to the correct channel
  with per-date receipts under `.artifacts/gana-v9/cron/reroutes/`:
  July 3 `1527558102398931036`, `1527558130664210525`, `1527558157449035783`;
  July 4 `1527558197236469841`, `1527558219310960813`, `1527558241507086356`;
  July 8 `1527558259471290559`; July 11 `1527558279893618890`,
  `1527558297786519613`, `1527558316014833730`; July 13
  `1527558332821405739`; and July 14 `1527558347992203407`,
  `1527558365054767244`, `1527558385497673817`.
- The legacy July 15 result was regenerated from its exact validation, metrics,
  and recommendation artifacts with a visible channel-correction label and sent
  as `1527558872250716254`, `1527558895386493009`, and
  `1527558912759304272`.
- At the user's explicit request, July 16 was validated immediately from
  `daily-2026-07-16-full`: 6 validations (5 won, 1 voided), one scoped metric,
  exits 0/0, and correct-channel Discord IDs `1527559008062542016` and
  `1527559023824736303`.
- Discord history readback found all 19 corrected-channel messages and no missing
  ID. All reroute receipts and the July 16 lock are terminal, with no mutex left.
- The existing Codex automation `Gana · operaciones diarias` remains active at
  07:15/10:15/13:15/18:15/22:15 Guatemala. Its prompt now explicitly requires
  the 07:15 checkpoint to validate exactly the previous day from the published
  Daily and canonical artifact, then send stats plus mirror to the configured
  validation target.
- A July 17 07:15 simulation skips July 16 as already published; a July 18 07:15
  simulation selects exactly July 17 from `daily-2026-07-17-full`. Current
  `validationBacklog` is empty.
