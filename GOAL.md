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
