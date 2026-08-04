# RC4-A6 — UI / Mobile / PWA Progress

Date: 2026-08-04
Branch: `agent/rc4-06-ui-mobile-offline`
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **STANDARD evidence/test tooling + UI-only accessibility fixes**
Status: **COMPLETE**

## Exact authority decision

RC3-A4/A5 and exact current source agree that **MetaForge V2 is the current presentation authority**. Historical V3 QA assets remain reusable infrastructure only; they are not evidence that V3 chrome is current.

RC4-A6 therefore created a dedicated current-V2 acceptance spec and kept the compatibility bridge explicitly subordinate to canonical V2 tokens.

## Completed implementation / evidence slice

### Browser matrix

- `client/apps/demo/playwright.rc4-v2-qa.config.ts`
  - desktop Chromium `1440x1000`;
  - tablet Chromium `834x1112`;
  - Pixel 7 emulation;
  - compact touch `360x800`;
  - dark + reduced-motion.
- `client/apps/demo/e2e/ui-v2-mobile-qa.spec.ts`
  - List/Form/Dashboard/Builder document containment;
  - mobile list renderer adaptation;
  - mobile drawer Escape + focus restoration;
  - longest localized navigation item remains reachable;
  - reduced-motion transition clamp.
- existing Axe/keyboard/list-responsive acceptance was made first-run-safe without weakening serious/critical gates.

### Runtime / PWA matrix

- `client/e2e-forge/playwright.rc4-v2-mobile-qa.config.ts`;
- `client/e2e-forge/ui-tests/rc4-pwa-installability.spec.ts`;
- browser acceptance for root-scoped manifest, `display=standalone`, 192/512 icons;
- explicit assertion that installability evidence does **not** imply a registered offline service worker;
- Forge login and Alumdoor brand/mobile seams reused from the existing runtime QA harness.

### UI defects corrected from failed browser runs

- first-run Theme Welcome interaction no longer creates false a11y/list failures;
- shared Input placeholder opacity is explicit;
- semantic success/status badge tint no longer pushes small text below AA contrast;
- V2 sidebar search background/text cascade is restored through the compatibility CSS surface;
- demo and runtime now evaluate the same V2 compatibility CSS surface for release-confidence QA.

No backend/schema/session/permission/storage/OCC/ledger/business-rule authority changed.

## Final browser evidence

GitHub Actions workflow: **RC4 A6 Browser Evidence #12**

- run: `30871503111`;
- job: `91874277369`;
- executed branch head: `67b4e71fa245eec2a16e075b3a5c388de45ff7ed`;
- executed PR merge candidate: `51e4787017563356081278457bf7106013c2d6e2`;
- demo build: **PASS**;
- demo current-V2 browser matrix: **50 passed, 6 skipped**;
- runtime build: **PASS**;
- runtime/login/PWA matrix: **19 passed, 11 skipped**;
- evidence artifact id: `8878084897`;
- artifact digest: `sha256:a1e97b86677ff64abbf70f700a2aa207a13fbdf61d274ddf168a1124714700bb`;
- artifact expiry: `2026-11-02T02:20:40Z`.

The intentionally skipped tests are project-inapplicable variants (for example mobile-only drawer checks on desktop/tablet or keyboard-only checks outside their target project), not disabled failing assertions.

## Maturity impact

A0 remains registry owner; A6 records evidence recommendations:

- `U01-001 Responsive PWA`: **RC candidate**. The exact-current integrated cross-device browser blocker from RC3-A4 is now closed.
- `U01-002 Installable PWA`: remains **Wired**. Manifest/installability is browser-proven, but actual installed standalone-launch evidence is still absent.
- `U01-003..007`: remain **Missing**. No offline implementation was added.
- `U01-008`: remains **Foundation**.
- `U01-009..012`: retain **Wired candidates**; physical/authorized device evidence remains missing.
- `U01-013 Push notifications`: remains **Missing**; no subscription/delivery path exists in this slice.

No capability is promoted to Hardened by A6.

## Dependencies / blockers that remain

- A1/WS11: authoritative session/auth-strength/privacy constraints for offline access.
- A2/WS12: release-freshness/provider/recovery evidence and production observable release proof.
- WS00: tenant/OCC/cache authority for offline data semantics.
- WS09/A7: metadata/AppAction ownership where generic renderer contracts are missing.

These dependencies block offline/mobile authority expansion, not the completed responsive browser slice.

## Production truth

This lane is release-candidate browser evidence, not production deployment evidence. The runtime build warning for missing `VITE_FORGE_RELEASE_SHA` is expected in this non-production CI lane. Production UI truth still requires the repository's guarded UI deploy flow and exact `/health` + `/release.json` SHA/hash evidence.

## Non-blocking hardening follow-up

`DashboardBuilder` currently renders an inner semantic `<main>` beneath the shell's authoritative main landmark. Current RC4 viewport/browser gates pass, but normalize that inner landmark to a section/region before claiming broad frontend Hardened maturity.
