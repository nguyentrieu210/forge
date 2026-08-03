# Forge UI V3 Foundation — Release Evidence

Date: 2026-08-04
Owner: V3-01 FOUNDATION
Foundation merge: `64060ae1f08e8b6922828d4d27d8185073cf6697` / PR #453

## Delivered

- Canonical V3 stylesheet export: `@metaforge/ui/v3.css`.
- Red / graphite-black / white-neutral product identity.
- Semantic success / warning / destructive / info colors remain distinct.
- Light and dark token sets compatible with existing shared Tailwind/shadcn variables.
- ERP typography hierarchy, Geist/Geist Mono and tabular-number utilities.
- Exactly three V3 density intents: compact / standard / comfortable; legacy `touch` is a compatibility alias.
- Deterministic control, panel and overlay radii.
- Four surface/elevation levels L0-L3.
- Shared micro/navigation/workspace/overlay/data motion timing and easing tokens.
- Page fade/slide/workspace and status-highlight primitives.
- `prefers-reduced-motion` collapses motion and disables non-essential V3 keyframes.
- Existing apps remain on `@metaforge/ui/styles.css` until their V3 owner explicitly opts in.

## Accessibility audit

Reviewed representative normal-text token pairs:

| Pair | Contrast |
|---|---:|
| light primary `#E52521` / white | ~4.55:1 |
| light foreground `#15171A` / `#F6F7F8` | ~16.74:1 |
| light muted `#69707D` / white | ~4.98:1 |
| dark foreground `#F7F7F8` / `#131519` | ~17.07:1 |
| dark muted `#9CA3AF` / `#131519` | ~7.20:1 |
| dark primary foreground `#0B0C0E` / `#EF332D` | ~4.83:1 |
| dark focus `#FF5A54` / `#0B0C0E` | ~6.38:1 |

The dark primary foreground was changed from white after self-audit because white on `#EF332D` was only ~4.05:1.

## Source lock

Vben UX reference is locked in `docs/design/FORGE_UI_V3_UPSTREAM_SOURCE_LOCK_20260804.md` to v5.7.0 release commit `a4dd9d30ce1e51879e937d4fad4ec5b1d794fa50`.

No Vue runtime, copied Vben source file, or new animation library is introduced by V3-01.

## Release path

This file is intentionally under `client/**` so the follow-up merge is a pure client-path commit and exercises the repository's `ALU Build and Deploy` UI fast path. PR #453 itself also carried canonical V3 documentation outside the workflow's automatic UI whitelist, so its main-push deployment guard would reject that mixed documentation commit even though the code blast radius was UI-only.

The release workflow builds the current merged main UI, stages the client bundle, deploys the Cloudflare gateway, then verifies `alu.kairo.vn` against the exact release SHA.

## Open dependency

Release/SRE should restore the generic client CI and Cloudflare Preview QA workflow under repository-root `.github/workflows/`. The current `client/.github/workflows/ci.yml` is not a GitHub Actions discovery location, and the documented generic preview workflow is absent on current main.

This does not block V3-01 convergence because the foundation is opt-in and route-level visual evidence belongs to the consumer V3 branches plus V3-07 Mobile/QA.
