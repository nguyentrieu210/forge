# Forge UI V3 — Upstream Source Lock

Date: 2026-08-04
Owner: V3-01 FOUNDATION
Program: MetaForge UI V3 / Forge Vben Next

## Forge baseline observed

- Program baseline / branch merge-base: `main@7819ade8cdb1213d9f99ae92f144ae8aee82b054`.
- Exact current `main` observed before implementation: `7626576feb67a4428e3c9bbfd41ad40e1f0c4641`.
- Drift from the program baseline is finance/inventory/RC validation work only; no `client/packages/ui/**` file changed in that drift window.
- Therefore V3-01 can implement its exclusive UI-package scope without importing backend drift or changing authoritative contracts.

## Vben lock

Canonical upstream repository: `vbenjs/vue-vben-admin`

Locked reference for UI V3 implementation:

- release/tag intent: `v5.7.0`;
- release commit used as immutable reference: `a4dd9d30ce1e51879e937d4fad4ec5b1d794fa50` (`chore: release 5.7.0`);
- upstream license: MIT;
- runtime policy: reference/translate behavior only; Forge stays React/Tailwind/Radix.

No Vue runtime code is imported into Forge by V3-01.

## V3-01 reuse classification

| Area | Decision | Notes |
|---|---|---|
| Theme completeness | ADAPT | Keep Forge theme/session implementation; converge presentation to one V3 identity. |
| Multi-palette theme zoo | REJECT_WITH_REASON | V3 has one canonical Forge identity; legacy palettes remain behind the non-V3 stylesheet during staged rollout. |
| Typography hierarchy | ADAPT | Use existing Geist/Geist Mono and expose ERP-oriented hierarchy/numeric behavior. |
| Density preferences | ADAPT | V3 contract is exactly compact / standard / comfortable; legacy `touch` remains a compatibility alias. |
| Radius preference zoo | REPLACE_WITH_FORGE | V3 uses deterministic control/panel/overlay geometry. |
| Motion primitives | ADAPT | Implement CSS-native timing/easing/page/status primitives; no animation library dependency. |
| Reduced motion | PORT | All V3 motion contracts collapse to near-zero and non-essential keyframes are disabled. |
| Permission/auth/business behavior | REPLACE_WITH_FORGE | Existing Forge server/runtime authority remains untouched. |

## Licensing / copied-source statement

V3-01 does not copy Vben Vue source files or assets. It translates UX contracts described in the Forge V3 technical spec into Forge-owned CSS variables and utilities. No additional third-party license file is required by this slice beyond the repository's existing notices.

If a later V3 branch copies or substantially derives upstream source, that branch must append the exact upstream path(s), SHA and required copyright/license notice here or in its own source-lock extension before merge.
