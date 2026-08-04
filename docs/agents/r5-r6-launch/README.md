# R5 / R6 AGENT LAUNCH PACK

Date: **2026-08-04**  
Status: **EXECUTION INSTRUCTIONS — docs only, non-UI merge/deploy gated**  
Planning branch seed: `main@fd3e79356d077d3cbf2033a4be0df83790abee80`.

> Agents must always re-read exact current `main` at execution time. The seed above is provenance only, not a permanent implementation base.

## Purpose

This directory tells the operator exactly **which agents to open, in what order, on which branch names, and what each agent owns** for the post-RC4 program.

The program sequence is:

`RC4 engineering closure -> R5 integrated convergence -> R5-GO -> R6 production certification -> PILOT-GO -> Alumdoor controlled pilot -> Pilot Exit -> GA`

## Files

- `OPEN_ORDER.md` — launch waves, dependency order, merge order, and stop gates.
- `AGENT_PROMPTS.md` — copy/paste prompts for every R5 and R6 agent.

## Current-main observation at launch-pack creation

Exact `main@fd3e79356d077d3cbf2033a4be0df83790abee80` already contains RC4 integration merges for at least:

- A1 IAM evidence;
- A2 SRE/provider/recovery audit evidence;
- A3 migration/cutover runtime;
- A4 Finance/VN statutory;
- A5 HCM/payroll statutory evidence;
- A6 UI/mobile/PWA evidence;
- A7 App Factory approval runtime;
- A9 architecture/kernel GL aggregate read boundary;
- A20 capability convergence baseline;
- A21 migration governance.

Therefore R5 agents must **audit exact current main first and must not replay RC4 branches merely because they exist**. Reuse/cherry-pick only an exact residual that is still absent from current main and has accepted evidence.

## Non-negotiable execution policy

1. Read `skills/forge-enterprise-completion/SKILL.md` first.
2. Read `CURRENT_STATUS.md`, `NEXT_TASKS.md`, North Star, capability map/status, and relevant workstream/RC4 evidence.
3. GitHub/exact source wins over stale prose.
4. Do not reopen a blanket 956-capability implementation wave.
5. Do not create competing domain authorities or customer-specific forks.
6. If blocked by another workstream, record a Dependency Request and continue all independent work.
7. Do not stop for ordinary technical choices; audit repo evidence and choose the best implementation.
8. UI-only changes may follow the repository fast path. Any backend/shared-contract/schema/migration/security/provider change stops before merge/deploy until explicitly authorized.
9. Production/provider mutation, destructive data operation, cutover, restore/PITR and non-UI deploy are separate explicit gates.

## Recommended operator flow

Open agents according to `OPEN_ORDER.md`. Give each agent the exact prompt from `AGENT_PROMPTS.md`. Do not combine two ownership lanes in one agent unless a documented Dependency Request proves they cannot be separated.