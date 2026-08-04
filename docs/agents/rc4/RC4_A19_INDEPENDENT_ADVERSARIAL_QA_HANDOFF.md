# RC4-A19 — Independent Adversarial QA — Handoff

Status: **NO-GO / 18-of-18 worker heads reviewable**  
Branch: `agent/rc4-19-independent-adversarial-qa`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD evidence / CRITICAL inherited targets**

## Current release-confidence result

A19 now has immutable reviewable heads for every A1-A18 lane.

- Independent PASS: **A1, A2, A3, A5, A8, A9, A11, A12, A14, A15, A16, A17, A18**.
- BLOCKED: **A4, A6, A7, A10, A13**.
- Tally: **13 PASS / 5 BLOCKED / 18 total**.

## Newly closed dependency — A9

A9 PR #619 final head `32001d70a4ef87a5e14bd7df2dcc100cd0f8d243` is now independently replayed and PASS in A19 run `30870548500`:

- exact SHA pin;
- lane-owned TypeScript classification;
- GL aggregate regression;
- read-only aggregate/export guard;
- SQL safety.

The former A9 dependency request is closed.

## Newly corrected classification — A6

A6 final head moved to `422cc5ce7460a9e326e77ccdc20dac5a36a412ca`, making the earlier A19 green result on `00757226...` stale.

A6 own exact-final-head browser workflow run `30870225543` is red after successful install/build. Demo Playwright result: **45 pass / 6 skip / 5 fail**. The five failures are serious axe `color-contrast` violations on List, Form, Kanban, Calendar and Dashboard surfaces. Runtime/PWA verification is skipped after the demo gate fails.

A19 has repinned A6 and expanded its gate to execute both the final demo browser matrix and runtime/PWA matrix. Until A6 provides a corrected immutable head, its release-confidence disposition is **BLOCKED**, despite the worker lane itself being implementation-complete.

## Other confirmed blockers

- **A4:** VN statutory manifest violates canonical App Registry plain-method action contract.
- **A7:** App Factory effective-window/validation-order and revision-history evidence failures.
- **A10:** Customer 360 test file does not parse at exact head.
- **A13:** lane-owned Manufacturing/QMS TypeScript errors under `exactOptionalPropertyTypes`.

## Dependency Requests

1. **A4:** repair/resolve App Registry action-method contract mismatch; new immutable head.
2. **A6:** repair serious color-contrast failures; new immutable head; rerun demo + runtime/PWA browser evidence.
3. **A7:** repair App Factory definition/revision evidence failures; new immutable head.
4. **A10:** repair syntactically invalid Customer 360 test; new immutable head.
5. **A13:** repair lane-owned TypeScript errors; new immutable head.
6. **RC4 convergence:** replay the converged exact head before any maturity promotion.
7. **Migration governance:** read-only applied migration inventory before historical filename remediation.
8. **Provider/environment:** real non-production provider evidence before provider-state promotion.

## Authority / merge boundary

A19 owns QA workflow + evidence only. It does not patch another worker lane's runtime/business authority.

This is a **non-UI release-confidence lane**. Do not merge/deploy without explicit approval. No production/provider/schema/migration/customer-data mutation is authorized.
