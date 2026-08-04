# RC4-A6 — UI / Mobile / PWA Progress

Date: 2026-08-04
Branch: `agent/rc4-06-ui-mobile-offline`
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **STANDARD evidence/test tooling**

## Exact authority decision

RC3-A4/A5 and exact current source agree that **MetaForge V2 is the current presentation authority**. V3 QA assets are reusable test infrastructure only; they are not evidence that V3 chrome is current.

## Completed independent slice

Added explicit RC4/current-V2 Playwright entrypoints without changing runtime/business authority:

- `client/apps/demo/playwright.rc4-v2-qa.config.ts`
  - desktop Chromium `1440x1000`;
  - tablet Chromium `834x1112`;
  - Pixel 7 emulation;
  - compact touch `360x800`;
  - dark + reduced-motion;
  - reuses existing list/form/dashboard/Builder, a11y, list-responsive and shell acceptance specs.
- `client/apps/demo/package.json`
  - adds `e2e:rc4:v2`.
- `client/e2e-forge/playwright.rc4-v2-mobile-qa.config.ts`
  - current runtime/login cross-device matrix with separate RC4 artifact paths.
- `client/e2e-forge/package.json`
  - adds `test:rc4:v2`.
- `client/e2e-forge/ui-tests/rc4-pwa-installability.spec.ts`
  - browser-loads the linked manifest and asserts root `id/start_url/scope`, `display=standalone`, and 192/512 icon declarations;
  - explicitly asserts that installability evidence does **not** imply a registered offline service worker.

No shared renderer, backend, schema, session, permission, storage, OCC or business rule was changed.

## Verification truth

This execution environment cannot resolve `github.com` from the shell, so a full checkout/dependency install/local Playwright execution is unavailable here. The new lane is therefore **NOT YET execution evidence**. A PR/workflow run or another environment with the repository checkout must execute the commands below before capability promotion:

```bash
pnpm --filter @metaforge/demo... run build
pnpm --filter @metaforge/demo run e2e:rc4:v2
pnpm --filter runtime... run build
pnpm --filter e2e-forge run test:rc4:v2
```

## Maturity impact

No maturity promotion is claimed from source-only test additions.

- `U01-001 Responsive PWA`: remains **Wired** pending exact-current browser execution.
- `U01-002 Installable PWA`: remains **Wired** pending exact-current browser/standalone installation proof.
- `U01-003..007`: remain **Missing**; no offline implementation was added.
- `U01-009..012`: retain current Wired candidates; physical/authorized device-path evidence remains missing.
- `U01-013 Push notifications`: remains **Missing**; no subscription/delivery path was invented.

## Dependencies / blockers

- A1/WS11: authoritative session/auth-strength/privacy constraints for offline access.
- A2/WS12: release-freshness/provider/recovery evidence and observable release proof.
- WS00: tenant/OCC/cache authority for offline data semantics.
- WS09/A7: metadata/AppAction ownership where generic renderer contracts are missing.

Offline read/write/background sync/conflict implementation remains intentionally blocked until these contracts are consumable on exact current main. Independent browser/mobile/a11y/PWA evidence work continues without crossing that boundary.
