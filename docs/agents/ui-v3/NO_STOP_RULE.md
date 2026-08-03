# Forge UI V3 — NO-STOP RULE

Date: 2026-08-04
Program: MetaForge UI V3 / Forge Vben Next
Canonical design spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`

## Purpose

UI V3 agents work autonomously inside their ownership boundary. Do not stop for normal technical decisions, local ambiguity, stale historical branches, missing cosmetic details, or a blocker that affects only part of the owned scope.

The default behavior is:

`audit exact state -> choose the best repo-evidenced design -> implement independent scope -> verify -> record evidence -> continue`

## Do not stop for

- ordinary React/Tailwind/Radix implementation choices;
- component decomposition, naming, local file organization, or refactor mechanics;
- spacing, density, typography, red/black/white token selection already bounded by the V3 spec;
- motion timing/easing choices that remain inside the shared motion contract;
- deciding which existing Forge primitive to reuse when repo evidence is sufficient;
- stale/superseded UI branches; classify `reuse / cherry-pick / supersede / reject` and continue;
- a local blocker when other independent acceptance items can still be completed;
- a missing optional Vben behavior that can be recorded as a parity gap and implemented independently later;
- normal UI-only merge/deploy decisions after blast-radius verification and required checks pass.

## Stop only when

1. a product/business decision cannot be inferred from the V3 spec, Forge Skill, North Star, current code, or canonical metadata;
2. the task requires changing a shared authoritative contract owned by another workstream and the dependency cannot be isolated behind an adapter/seam;
3. the operation is destructive or mutates production/customer data, secrets, DNS, migrations, or other protected production state;
4. a non-UI/backend/schema/business-rule/shared-contract change is ready to merge or deploy and explicit approval is required by Forge policy.

## Dependency Request rule

If another owner is needed, write a Dependency Request and keep going on every independent item.

```text
Dependency Request
Owner: <agent/workstream>
Need: <exact contract / file / behavior>
Why: <why current owner cannot safely own it>
Blocked scope: <only the blocked slice>
Can continue independently: yes/no
Next independent work: <what this agent will continue doing>
```

A Dependency Request is not permission to stop unless all owned work is genuinely blocked.

## Shared hotspot rule

Never edit another agent's hotspot merely to unblock yourself. Prefer adapters, local view-models, fixtures, compatibility seams, or dependency requests.

If the same pattern appears in multiple surfaces, raise it to the owner of the shared primitive rather than cloning it.

## Vben parity rule

Vben is the UX completeness baseline, not the runtime authority. Each useful upstream behavior must be classified as:

- `PORT`: reproduce behavior faithfully in React/Forge;
- `ADAPT`: preserve user outcome but adapt to Forge metadata/runtime;
- `REPLACE_WITH_FORGE`: Forge already has a stronger authoritative primitive;
- `REJECT_WITH_REASON`: intentionally excluded with documented reason.

Do not import Vue runtime into Forge.

## Merge/deploy rule

UI-only presentation/runtime work may use the project's UI fast path after verifying blast radius, targeted typecheck/build/tests, responsive behavior, accessibility, and visual evidence appropriate to the slice.

Any backend/schema/migration/business-rule/authoritative metadata contract change must be isolated in a separate non-UI branch and must not be auto-merged/deployed.

## Completion record

Before finishing a slice, record:

- exact base/main observed;
- files changed;
- Vben parity items closed/open;
- tests/typecheck/build evidence actually run;
- desktop/tablet/mobile evidence where relevant;
- a11y/reduced-motion evidence where relevant;
- dependency requests;
- merge/deploy/release evidence if performed;
- remaining gaps without inflating maturity.
