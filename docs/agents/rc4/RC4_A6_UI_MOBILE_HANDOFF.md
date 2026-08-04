# RC4-A6 — Current V2 Browser / Mobile / PWA Evidence

Status: **COMPLETE — browser evidence captured; capability recommendations recorded**
Branch: `agent/rc4-06-ui-mobile-offline`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **STANDARD evidence/test + UI-only accessibility fixes**
Owner stream: **WS14**

## Mission result

RC4-A6 closed the exact-current MetaForge **V2** browser/mobile release-confidence gap without reviving V3 presentation authority and without inventing offline/session/OCC semantics.

The decisive acceptance run is GitHub Actions **RC4 A6 Browser Evidence #12**, run `30871503111`, job `91874277369`.

- branch head executed: `67b4e71fa245eec2a16e075b3a5c388de45ff7ed`;
- PR merge candidate executed: `51e4787017563356081278457bf7106013c2d6e2`;
- demo dependency graph build: **PASS**;
- current-V2 demo browser matrix: **50 passed / 6 intentionally skipped**;
- runtime dependency graph build: **PASS**;
- runtime/login/PWA matrix: **19 passed / 11 intentionally skipped**;
- artifact: `rc4-a6-browser-evidence`, artifact id `8878084897`;
- artifact digest: `sha256:a1e97b86677ff64abbf70f700a2aa207a13fbdf61d274ddf168a1124714700bb`;
- artifact expiry: `2026-11-02T02:20:40Z`.

The matrix exercised desktop Chromium `1440x1000`, tablet `834x1112`, Pixel 7, compact touch `360x800`, dark mode and reduced-motion coverage. It covered current V2 shell behavior, List/Form/Dashboard/Builder viewport containment, mobile drawer Escape/focus restoration, long localized navigation reachability, list renderer adaptation, keyboard paths and Axe serious/critical accessibility gates. Runtime evidence covered Forge login viewport/keyboard behavior, Alumdoor mobile brand seam where applicable, manifest/installability checks and explicit proof that installability is **not** being misrepresented as offline service-worker support.

## UI defects found and corrected by real browser execution

The first evidence runs were intentionally allowed to fail and exposed real/stale issues. RC4-A6 corrected them rather than weakening the acceptance gate:

1. first-run Theme Welcome state made historical tests inspect an aria-hidden shell; a11y/list tests now dismiss only the real first-run dialog before asserting the application;
2. the RC4 matrix now targets a dedicated current-V2 mobile acceptance spec instead of treating historical V3 presentation expectations as current authority;
3. shared Input placeholder rendering is explicitly opaque so the semantic muted token is not further weakened by browser placeholder opacity;
4. success/status badge tint was reduced where necessary so small semantic text retains WCAG AA contrast;
5. the V2 sidebar search rail cascade was corrected so Tailwind `bg-background` cannot pair a light background with the rail's light text;
6. the demo now loads the same V2 compatibility CSS surface as runtime, so browser evidence represents current source authority rather than a divergent demo-only cascade.

No backend, schema, tenant, permission, session, storage, ledger, OCC or business-rule contract was changed.

## Capability recommendation

A0 remains the enterprise capability registry owner. RC4-A6 supplies the following evidence recommendation only:

| Capability | A6 recommendation | Reason |
|---|---|---|
| `U01-001 Responsive PWA` | **RC candidate** | The exact blocker identified by RC3-A4 — an integrated exact-current cross-device browser run — is now closed with a passing V2 matrix and retained artifact. |
| `U01-002 Installable PWA` | **Wired** | Real browser proves the linked root-scoped standalone manifest and install metadata, but RC4-A6 does not prove an actually installed app launched in browser standalone display mode. |
| `U01-003..007` offline read/write/sync/conflict | **Missing** | No private cache, durable offline queue, authenticated background replay or offline conflict UX was added. These remain blocked on authoritative offline/session/OCC contracts and implementation. |
| `U01-008 Camera capture` | **Foundation** | No new first-class device capture evidence in A6. |
| `U01-009..012` barcode/QR/GPS/signature | **retain Wired candidates** | Connected source paths exist from prior audit, but A6 does not add physical/permissioned device-path proof. |
| `U01-013 Push notifications` | **Missing** | No PushManager/subscription/service-worker/provider delivery path was added or claimed. |

`U01-001` is not a Hardened candidate from this run alone. Production exact-release evidence, broader field-device evidence and remaining semantic/accessibility hardening still matter at the Hardened ceiling.

## Dependencies intentionally not crossed

- A1/WS11: session/auth-strength/privacy constraints for offline access.
- A2/WS12: release freshness/recovery/provider evidence.
- WS00: authoritative tenant/OCC/cache semantics for offline data.
- WS09/A7: metadata/AppAction ownership where generic renderer contracts are missing.

These dependencies did not block the independent browser/mobile/a11y/PWA slice, so A6 completed that slice and left the offline authority boundary intact.

## Release boundary

The passing run is browser/release-candidate evidence, **not production deployment evidence**. Runtime build emitted the expected non-production warning that `VITE_FORGE_RELEASE_SHA` was not populated in this CI browser lane. Exact production promotion still requires the repository UI release path to prove `/health` and `/release.json` against the deployed SHA/hash.

## Follow-up hardening

`DashboardBuilder` still contains its own semantic `<main>` inside the shell's authoritative main landmark. Current RC4 viewport acceptance passes, but this should be normalized to a section/region in the next UI semantic-hardening slice before claiming broad UI Hardened maturity.
