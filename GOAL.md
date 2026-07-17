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

### Verification and pending production gate

- Focused dispatcher/runtime/workflow suite passes 60/60. It includes corrupt,
  null and status-less locks, impossible dates, read-only mutex inspection,
  resume-artifact date/missing checks, terminal-state previews and direct-Telegram
  suppression during `--dry-run`.
- All six live actions now have a zero-effect `--dry-run`: July 3/4/11/14 resolve
  to `validate-metrics-notify` with the exact published batch, while July 8/13
  resolve to `close-no-publication`. Every preview targets
  `discord:1510041125614915756`; lock hashes remained unchanged and no mutex was
  created.
- A no-publication closeout now fails closed unless the Daily lock is missing or
  has an exact-date `retryable`/`failed`/`blocked` state with no publication
  evidence. Invalid JSON roots, unknown states and mismatched dates cannot be
  converted into a closeout.
- `npm run typecheck`, `node --check`, `bash -n` and `git diff --check` pass. The
  full suite passes 605/609 inside the sandbox; the only four failures are the
  expected dashboard socket `listen EPERM` cases, and the dashboard suite passes
  27/27 with local ephemeral-socket permission.
- DB preflight is connected, PostgreSQL migrations are applied, and no validation
  process or mutex is active.
- The first live July 3 backfill was rejected by the production approval layer
  before process creation. No DB row, lock, mutex, or Discord message changed.
- Pending explicit production authorization: recompute/publish July 3 and 14;
  recompute/publish labelled corrections for July 4 and 11; publish no-publication
  closeouts (without mirrors) for July 8 and 13.

### Current external blocker

Status: blocked pending explicit production authorization.

- The same approval gate has remained unanswered for three consecutive goal
  turns. The production approval layer already rejected the first attempted
  July 3 run before process creation, and retrying without new authorization is
  prohibited.
- No live backfill, DB mutation, validation-lock rewrite, mutex creation or
  Discord send was performed after that rejection. The six exact dry-runs remain
  the authoritative execution plan.
- Resume condition: the user explicitly authorizes the six production actions.
  Then execute sequentially in this stop-on-uncertainty order: July 3, 4, 8, 11,
  13 and 14, verifying each lock, artifact, DB result and Discord message ID
  before starting the next date.
