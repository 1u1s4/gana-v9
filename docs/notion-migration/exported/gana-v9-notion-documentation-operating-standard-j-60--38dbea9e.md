---
source: notion
notion_id: 38dbea9e-4736-813a-bedd-fc901d9ac8cb
notion_url: https://app.notion.com/p/Gana-v9-Notion-Documentation-Operating-Standard-J-60-38dbea9e4736813abeddfc901d9ac8cb
title: "Gana v9 — Notion Documentation Operating Standard (J-60)"
---

# Gana v9 — Notion Documentation Operating Standard (J-60)

# Gana v9 — Notion Documentation Operating Standard (J-60)
Status: active standard for all departments
Implemented: 2026-06-28 America/Guatemala
Owner: Jo / Paperclip agent `ec397f93-f0a1-4687-ad41-53970798e660`
Review cadence: weekly department review, monthly company operating review, immediate review after launches/incidents
Source issue: [J-60](https://app.notion.com/J/issues/J-60)
## Summary
Every department must document work in Notion using one common operating standard so humans and agents can understand context, decisions, evidence, metrics, blockers, and next action without replaying a full Paperclip thread.
This standard applies to company strategy, department operations, agent work logs, issue execution, launches/specs, weekly status, and competitive intelligence. Paperclip remains the source of execution truth; Notion is the structured operating memory and narrative record.
## Page hierarchy
Use this hierarchy for every material work product:
1. Company page: `Gana v9`
2. Department page: `Gana v9 / <Department>`
3. Agent page: `Gana v9 / <Department> / <Agent>`
4. Issue page: `Gana v9 / <Department> / <Agent> / <Issue identifier> — <Issue title>`
Required page examples:
- `Gana v9 / Product / Jo / J-60 — Implement Notion documentation operating standard for all departments`
- `Gana v9 / Marketing / <Agent> / <Issue> — Competitive intelligence synthesis`
- `Gana v9 / Engineering / <Agent> / <Issue> — Launch readiness spec`
If a department does not exist yet, create it before creating agent or issue pages. If an agent works across departments, create separate department-scoped agent pages rather than mixing unrelated work.
## Required issue update template
Every Notion issue page and every final Paperclip issue comment must include these sections in this order:
```markdown
## Summary

One short paragraph explaining what changed and why it matters.

## Decisions

- Decision: ...
  Owner: ...
  Date: ...
  Rationale: ...

## Evidence/Links

- Paperclip issue: [ISSUE](/J/issues/ISSUE)
- Notion page: <Notion URL>
- Repo/artifact/report: <URL or path>
- Screenshots/data sources: <URL>

## Metrics

- Impact metric: current value / target / source
- Quality metric: current value / target / source
- Risk metric: current value / threshold / source

## Blockers

- Blocker: none
```
If blockers exist, name the unblock owner and the exact action required:
```markdown
- Blocker: <what is blocked>
  Owner: <human/agent/team>
  Required action: <specific next action>
  Due/trigger: <date or event>
```
```markdown
## Next Action

- Owner: <human/agent/team>
- Action: <single next concrete action>
- Due/trigger: <date or event>
```
## Weekly status template
Use this for department, agent, and company weekly updates.
```markdown
# Weekly Status — <Department or Agent> — <YYYY-MM-DD>

## Summary

- What moved this week:
- Why it matters:
- Overall status: green / yellow / red

## Decisions

- Decision:
  Owner:
  Date:
  Rationale:

## Evidence/Links

- Paperclip issues completed:
- Notion pages created/updated:
- Artifacts:
- Customer/user evidence:

## Metrics

- Delivery:
- Quality:
- Growth/revenue:
- Risk/compliance:

## Blockers

- Blocker:
  Owner:
  Required action:
  Due/trigger:

## Next Action

- Owner:
- Action:
- Due/trigger:
```
## Launch/spec template
Use this before public-facing launches, product changes, campaigns, or experiments.
```markdown
# Launch/Spec — <Name>

## Summary

What is launching, for whom, and what problem it solves.

## Decisions

- Scope included:
- Scope excluded:
- Launch owner:
- Approval owner:
- Rollback owner:

## Evidence/Links

- Paperclip launch issue:
- Product/spec docs:
- Design/artifacts:
- QA/evaluation evidence:
- Legal/compliance notes:

## Metrics

- Success metric:
- Guardrail metric:
- Launch-readiness metric:
- Review date:

## Blockers

- Blocker:
  Owner:
  Required action:
  Due/trigger:

## Next Action

- Owner:
- Action:
- Due/trigger:

## Responsible gambling disclaimer

For any public-facing betting, picks, odds, sports prediction, sportsbook, or wagering-adjacent content, include a visible disclaimer adapted to the channel:

> Gana v9 is for informational and entertainment purposes only. Predictions are not guarantees. Bet responsibly, only if legal in your jurisdiction, and never wager more than you can afford to lose. If gambling stops being fun or feels hard to control, seek local help and support.
```
## Competitive intelligence template
Use this when studying competitors, including gambling, sports media, sportsbook-adjacent, analytics, or affiliate products.
```markdown
# Competitive Intelligence — <Competitor/Market>

## Summary

What was observed and what strategic lesson matters for Gana v9.

## Decisions

- Strategy to adapt:
- Strategy to reject:
- Owner:
- Rationale:

## Evidence/Links

- Public source links:
- Screenshots/archives:
- Related Paperclip issue:
- Related Notion page:

## Metrics

- Competitor signal:
- Gana v9 opportunity metric:
- Risk/compliance metric:

## Blockers

- Blocker:
  Owner:
  Required action:
  Due/trigger:

## Next Action

- Owner:
- Action:
- Due/trigger:

## Originality and compliance rule

Do not copy gambeta.ai brand/assets/exact copy/code or any competitor brand assets, copy, protected design, proprietary data, or implementation. Extract strategic patterns only, then adapt into original Gana v9 naming, visual language, copy, UX, datasets, and code.

For public-facing wagering-adjacent output, include the responsible gambling disclaimer.
```
## Paperclip issue linking rule
1. Every Notion issue page must link back to its Paperclip issue near the top.
2. Every final Paperclip issue comment must link to every Notion output created or updated.
3. Mentioned Paperclip ticket identifiers must be clickable internal links in Paperclip comments, e.g. `[J-60](/J/issues/J-60)`.
4. Notion pages should include both the human-readable identifier and the Paperclip URL path.
5. If a Notion page summarizes multiple issues, list each linked issue under `Evidence/Links`.
## Owner and review cadence
- Company owner: CEO/board or delegated operating owner.
- Department owner: department lead or assigned agent manager.
- Agent owner: the agent assigned to the work.
- Issue owner: the current Paperclip assignee.
- Review cadence:
	- Issue pages: update before marking the Paperclip issue `done`, `blocked`, or `in_review`.
	- Agent pages: weekly rollup every Friday or after major milestones.
	- Department pages: weekly lead review.
	- Company standard: monthly review and whenever launch/compliance requirements change.
## Agent operating procedure
1. Before closing a Paperclip issue, create or update the matching Notion issue page.
2. Use the required issue update template exactly enough that all six sections are present: Summary, Decisions, Evidence/Links, Metrics, Blockers, Next Action.
3. Link the Notion page in the Paperclip final comment.
4. Link the Paperclip issue in the Notion page.
5. If the work is public-facing and wagering-adjacent, include the responsible gambling disclaimer.
6. If competitor research was used, document sources and strategic adaptation; do not copy competitor brand/assets/exact copy/code.
7. If blocked, name the unblock owner/action in both Notion and Paperclip.
## Metrics for adoption
- 100% of completed Paperclip issues with material output link at least one Notion page.
- 100% of Notion issue pages include the six required sections.
- 100% of public-facing wagering-adjacent docs include the responsible gambling disclaimer.
- 0 known cases of copied competitor brand/assets/exact copy/code.
- Weekly department status published by each active department.
## Blockers
None.
## Next Action
- Owner: all active agents and department leads
- Action: use this standard for every new Notion work product and final Paperclip issue comment
- Due/trigger: immediately for new work; weekly review cadence thereafter
