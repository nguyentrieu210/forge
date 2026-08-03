# RC3-A4 — Frontend, Mobile, UX & Vertical Release Evidence

Date: 2026-08-04  
Agent: RC3-A4  
Branch: `agent/rc3-04-ui-mobile-release-evidence`  
Exact seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Exact main rechecked at conclusion: `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Risk: STANDARD audit/evidence. UI-only fixes discovered later belong to the separate FAST WS14/UI lane.  
Status: **READY — evidence audit complete; no runtime/source mutation; no production mutation.**

## 1. Executive result

The most important release-truth correction is that exact current `main` is **not running UI V3 as the production source presentation authority**.

Current source explicitly routes the shared shell back to V2:

- `client/packages/shell/src/AppShell.tsx` imports `AppShellV2` and states `Runtime authority is V2 again`;
- V3-only workspace props remain compatibility-only and are not rendered by the current production shell;
- `client/packages/ui/src/v3.css` is explicitly a `V2 runtime compatibility bridge` and says UI V3 is no longer the production presentation authority;
- merged PR `#544` is the deliberate UI-only rollback that restored V2 `AppShell` / `WorkspaceAppShell`, removed the V3 orange override and retained only V3 compatibility seams.

Therefore the correct current interpretation is:

> **V2 shared shell is authoritative on current source. V3-era charts/views/builder compatibility code and the V3 mobile QA harness remain useful evidence/assets, but V3 convergence/release documents are historical and cannot be treated as current presentation truth.**

Additional conclusions:

1. `U01-001 Responsive PWA` remains **Wired**, not RC: current V2 source retains responsive shell/mobile drawer/dynamic viewport/focus primitives, but no exact-current integrated cross-device browser run is observable.
2. `U01-002 Installable PWA` remains **Wired**, not RC: a valid web app manifest/installability source seam exists, but a real-browser installed/standalone acceptance on the exact current release is not proven.
3. `U01-003..U01-007` remain **Missing**. The offline contract is frozen, but private cache, offline queue, authenticated background replay and conflict UX are not implemented/proven.
4. `U01-009 Barcode scanner`, `U01-010 QR scanner`, `U01-011 GPS/geolocation` and `U01-012 Signature capture` now have meaningful connected client paths and are **Wired candidates** for A0 reconciliation, but remain below RC because exact browser/device/permission evidence is absent.
5. `U01-008 Camera capture` stays **Foundation**: image attachment/camera-adjacent browser paths exist, but no first-class general camera-capture contract with device evidence is established.
6. `U01-013 Push notifications` is a **Missing candidate**. This audit located no client `PushManager`, browser notification permission/subscription, service-worker push registration or FCM/APNS/web-push path. A0 should demote the historical blanket Foundation score unless another owner supplies concrete authoritative delivery evidence.
7. Current exact-production UI convergence is **UNPROVEN**. The repository has a correct exact-release verification mechanism, but the latest directly recorded production evidence is an older release `69b94ac1fe29a2ab39175e5442975a9197a0d39e` with bundle hash `ed328d88ad8242f5`, not current `main`.
8. No open UI/V3/mobile PR candidate was found in the current repo search. Relevant older UI PRs are merged, closed or explicitly superseded.

No capability is promoted to RC/Hardened by this worker. A0 owns registry convergence.

## 2. Exact current presentation authority

### 2.1 Current source

Exact `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7` shows:

- `client/packages/shell/src/AppShell.tsx` -> `AppShellV2`;
- V3 `WorkspaceTab`, App Rail and related props are retained only so newer source compiles;
- `client/packages/ui/src/v3.css` imports canonical `styles.css` and aliases V3-era tokens to V2 tokens;
- current V2 shell contains the responsive mobile drawer, `h-dvh`, skip-to-content, focus entry/restoration, Escape close, online/offline indication and current navigation behavior.

This is direct current-source evidence and wins over historical V3 program prose.

### 2.2 Relevant UI lineage

| Event | Exact evidence | Classification now |
|---|---|---|
| Historical ALU full production sync | `69b94ac1fe29a2ab39175e5442975a9197a0d39e`, bundle `ed328d88ad8242f5` | Valid historical production evidence only |
| UI V3 final convergence | PR `#495`, merge `fce46e468d2f08c8044bb611dd3e509cc1f6ec61` | Merged historical V3 source/evidence |
| UI V3 release trigger | PR `#521`, merge `f6f1905bd18e33ed87896b94ba10670b3b2c53b3` | Trigger/merge proven; deploy result not independently observable |
| Orange/black V3 presentation | PR `#529`, merge `c10e8d9ec5da740910c4b995e03ea9529fa726b4` | Historical; superseded by V2 restore |
| Restore V2 presentation authority | PR `#544`, merge `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2` | **Current source authority** |
| Exact current main | `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7` | Current audit baseline; contains later mixed workstreams |

The V3 QA harness is still reusable, but its expectations must be interpreted against the current V2 shell rather than used as proof that V3 chrome is live.

## 3. Browser/mobile evidence audit

### 3.1 Reusable V3-07 matrix

`docs/agents/ui-v3/V3-07-MOBILE-QA-REPORT.md` defines a strong reusable matrix:

- desktop Chromium `1440x1000`;
- tablet `834x1112`;
- Pixel 7;
- compact touch `360x800`;
- dark + reduced-motion;
- horizontal-overflow checks;
- list mobile-card adaptation;
- mobile drawer + Escape + focus restoration;
- keyboard/a11y gates;
- list/form/dashboard/Builder representative routes;
- screenshots;
- Forge and Alumdoor login/mobile acceptance.

This is executable test-source evidence. The report itself correctly states that final acceptance requires rerun after convergence and exact release proof.

### 3.2 Slice-level executable evidence

Useful historical/slice evidence exists:

- PR `#466` V3 shell records run `30841293437`, job `91778697489`, PASS for shell typecheck/build, runtime production build, shell mobile/a11y regression, workspace navigation, full client typecheck and client selfchecks.
- PR `#467` Builder records Builder typecheck PASS, demo build PASS, Playwright workspace `12/12` PASS and desktop/Pixel 7/iPhone 13 browser coverage with screenshots.
- Website/CMS had a targeted Chromium viewport regression on mobile `390x844`, tablet `834x1112` and desktop `1440x1000`.

These support individual implementations but do not prove the exact current V2 runtime as one integrated release.

### 3.3 Missing exact-current integrated evidence

PR `#495` correctly required a final integrated rerun after all V3 owner slices converged. The current GitHub evidence available to this audit does not expose an exact final V3-08 workflow result, and current source was later reverted to V2 presentation authority anyway.

For current `main`, this A4 audit found no exact browser artifact proving in one run:

- current V2 shell;
- desktop/tablet/Android/360px;
- Forge + Alumdoor login;
- List/Form/Dashboard/current Builder;
- keyboard/focus/Axe gates;
- dark/reduced-motion;
- production exact release marker.

Result: source is meaningfully wired; UI RC promotion remains blocked by exact-current browser evidence.

## 4. PWA and offline truth

### 4.1 Installable PWA

`client/apps/runtime/public/manifest.webmanifest` currently provides:

- root `id`, `start_url` and `scope`;
- `display: standalone`;
- Forge name/short name/language;
- 192/512 install icon declarations;
- theme/background metadata.

That is enough to retain **Wired** installability source maturity when combined with runtime HTML manifest wiring, but not enough for RC. A real browser must install the exact candidate and launch it in standalone mode.

### 4.2 Offline implementation

`docs/FORGE_OFFLINE_SYNC_CONTRACT.md` is intentionally a frozen contract, not implementation. It requires an authenticated Offline Access Context containing tenant/user/access revision/lease/schema/release SHA/bundle hash and defines cache isolation, purge, OCC, stable idempotency, deny-by-default offline writes and conflict handling.

Repo/source search and the canonical contract agree that Forge still does not claim:

- private IndexedDB offline read/cache;
- durable offline write queue;
- authenticated background replay;
- OCC conflict capture as an offline runtime path;
- conflict-resolution UI.

An empty service worker or generic retry loop would not satisfy the contract. `U01-003..007` therefore remain **Missing**.

## 5. U01 capability recommendations to A0

These are A4 evidence recommendations. A0 remains registry owner and should cross-check other agents before applying them.

| Capability | Historical RC-01 | A4 candidate | Evidence / blocker |
|---|---|---|---|
| `U01-001` Responsive PWA | Wired | **Wired** | Current V2 shell retains mobile drawer, `h-dvh`, responsive navigation/focus primitives; exact-current full browser matrix missing |
| `U01-002` Installable PWA | Wired | **Wired** | Manifest/install metadata present; real installed/standalone exact-release proof missing |
| `U01-003` Offline read/cache | Missing | **Missing** | Contract frozen; private cache implementation/evidence absent |
| `U01-004` Offline write queue | Missing | **Missing** | No safe queue preserving authenticated context/OCC/idempotency |
| `U01-005` Background sync | Missing | **Missing** | No authenticated browser replay/session-expiry/CSRF evidence |
| `U01-006` Conflict detection | Missing | **Missing** | Server OCC exists elsewhere, but offline conflict runtime is not implemented |
| `U01-007` Conflict resolution UX | Missing | **Missing** | No discard/rebase/domain-resolver browser path |
| `U01-008` Camera capture | Foundation | **Foundation** | Attach Image/media foundation and camera-adjacent paths exist; no first-class general capture + exact device evidence |
| `U01-009` Barcode scanner | Foundation | **Wired candidate** | `kho-vn` CameraScanner uses browser `BarcodeDetector` + rear camera and is consumed by `NhapNhanhScreen`; exact Android/browser evidence missing |
| `U01-010` QR scanner | Foundation | **Wired candidate** | Same integrated scanner explicitly requests `qr_code`; exact device evidence missing |
| `U01-011` GPS/geolocation | Foundation | **Wired candidate** | Generic registered `GeolocationControl` calls `navigator.geolocation` and writes GeoJSON; permission/device browser evidence missing |
| `U01-012` Signature capture | Foundation | **Wired candidate** | Generic registered canvas/pointer Signature control writes PNG data URL; touch/mobile browser evidence missing |
| `U01-013` Push notifications | Foundation | **Missing candidate** | No PushManager/browser subscription/service-worker push/provider delivery path located; ordinary in-app notifications do not prove push |

### Promotion ceiling

None of `U01-*` should be RC from current evidence. Browser/device evidence is material to these capabilities and exact-current production proof is absent.

## 6. Scanner, geolocation and signature evidence

### Barcode / QR

`client/apps/kho-vn/src/CameraScanner.tsx` implements an actual browser camera scanner:

- `navigator.mediaDevices.getUserMedia`;
- rear-facing camera preference;
- `BarcodeDetector`;
- formats include `qr_code`, `code_128`, `ean_13`, `ean_8`, `code_39`, `codabar`, `itf`;
- explicit unsupported/insecure-context handling;
- stream cleanup and scan feedback.

`client/apps/kho-vn/src/NhapNhanhScreen.tsx` consumes `CameraScanButton` in the real quick Purchase Receipt path, so this is more than a detached component. It does not bypass Purchase Receipt authority.

The blocker is evidence maturity, not absence of a connected source path: run it on a representative Android browser against the exact candidate and capture permission success/denial, scan success and unsupported-browser fallback.

### Geolocation / signature

`client/packages/controls/src/media.tsx` and `register.ts` prove generic runtime wiring:

- `Geolocation` is registered to `GeolocationControl`, uses `navigator.geolocation`, persists GeoJSON and exposes a view link;
- `Signature` is registered to a pointer-enabled canvas control and writes the captured PNG data URL through the normal field `onChange` path.

Again, exact mobile browser/touch/permission evidence is needed for RC.

## 7. Vertical / production release evidence

### Historical production proof

`deploy-evidence/alu-full-sync.json` is legitimate production evidence for:

- deployed/release SHA `69b94ac1fe29a2ab39175e5442975a9197a0d39e`;
- Gateway UI deployed;
- exact `/release.json` release SHA;
- bundle hash `ed328d88ad8242f5`;
- timestamp `2026-08-02T21:10:08.285Z`.

It is **not** evidence that current `main@98b5e1b...` or the current V2 presentation source is deployed.

### Current release mechanism

`.github/workflows/alu-build-deploy.yml` has the correct mechanism:

1. automatic `main` push path when `client/**` changes;
2. guard that refuses mixed non-UI changes for automatic UI production release;
3. exact `TARGET_SHA` / `VITE_FORGE_RELEASE_SHA`;
4. runtime/warehouse mobile build;
5. stage client bundle;
6. Wrangler Gateway deploy;
7. post-deploy `sre-health-snapshot.mjs` against `https://alu.kairo.vn`;
8. expected release SHA check and uploaded release-health artifact.

This proves the control path exists. It does not prove a specific current run succeeded.

### Why current exact production remains unproven

PR `#521` proves that a UI V3 release-trigger commit merged, but merge/trigger is not deployment evidence. Current source subsequently changed through `#529` and then the V2 rollback `#544`; exact current main advanced further through mixed backend/platform work including WS09.

The automatic UI workflow deliberately rejects mixed non-UI pushes. Therefore current-main ancestry cannot be converted into a current production claim without the actual release-health evidence.

A4 performed no provider or production mutation merely to close this gap.

## 8. UI PR disposition

Current repo search found **no open UI/V3/mobile PR candidate** requiring convergence.

Historical PR disposition relevant to current truth:

| PR | Disposition |
|---|---|
| `#452` | SUPERSEDED by merged V3 shell execution `#466` |
| `#489` | SUPERSEDED by exact-main V3 final replay `#495` |
| `#503` | CLOSED without merge; reusable V3-07 QA files were narrow-transplanted into final V3 release branch |
| `#495` | MERGED historical V3 convergence; no longer current presentation authority after `#544` |
| `#521` | MERGED historical V3 release trigger; does not prove current production |
| `#529` | MERGED then superseded by V2 rollback |
| `#544` | MERGED and **current presentation source authority** |

Do not reopen the old V3 branches to restore presentation by ancestry. Any future V3 reintroduction is a new UI decision/workstream from exact current main.

## 9. Minimal cross-device acceptance matrix for next UI promotion

The next release-confidence run should exercise **current V2 authority**, while reusing the strongest V3-07 test concepts.

### Required viewports/modes

| Project | Minimum viewport/device | Required |
|---|---|---|
| Desktop Chromium | `1440x1000` | Yes |
| Tablet Chromium | `834x1112` | Yes |
| Android | Pixel 7 or equivalent Chrome Android | Yes |
| Compact touch | `360x800` | Yes |
| Dark/reduced motion | desktop + `prefers-reduced-motion: reduce` | Yes where claimed |

### Required shared surfaces

- generic Forge login;
- Alumdoor login/brand boundary;
- current V2 shell and mobile drawer;
- List desktop table -> mobile card adaptation;
- Form;
- Dashboard/Overview;
- one current Builder surface;
- navigation longest-label reachability;
- no body/document horizontal overflow.

### Required interaction/a11y gates

- keyboard reachability;
- skip-to-content;
- mobile drawer focus entry, Escape close and trigger-focus restore;
- representative touch target sizing;
- serious/critical Axe gate on representative routes;
- dark theme where supported;
- reduced-motion behavior where claimed.

### Required PWA/device gates for U01

For `U01-002` promotion:

- browser recognizes the manifest;
- install succeeds on representative Android/Chromium;
- installed app launches in standalone display;
- exact release marker remains observable.

For `U01-009/010` promotion beyond Wired:

- real Android camera permission success;
- successful barcode and QR scan;
- permission denial/error path;
- unsupported-browser fallback path;
- resulting scan feeds the real quick-receipt flow without bypassing document authority.

For `U01-011/012` promotion beyond Wired:

- location permission success/denial and stored GeoJSON;
- touch/pointer signature draw, clear and persisted form value.

### Required production gate

After a UI-only candidate is merged/deployed:

1. record exact merged `TARGET_SHA`;
2. prove `/health` success;
3. prove `/release.json.releaseSha == TARGET_SHA`;
4. record `/release.json.bundleHash`;
5. retain the workflow release-health artifact;
6. perform representative post-deploy desktop + mobile browser smoke against that exact release.

No production maturity claim should rely only on successful merge, branch ancestry or a historical release marker.

## 10. Dependency Requests

### DR-RC3-A4-01 -> WS14 + RC3-A3 / release evidence

**Need:** execute the current V2 cross-device matrix on one exact candidate and retain screenshot/Playwright evidence. If production promotion is desired, consume the canonical release-health path and record exact deployed SHA + bundle hash + post-deploy smoke.

**Class:** executable locally/CI first; production verification is read-only evidence after an already-approved UI release.  
**Blocking:** `U01-001/002` RC and any current-production UI claim.  
**A4 action:** no production mutation.

### DR-RC3-A4-02 -> RC05/IAM + WS14

**Need:** implement the frozen Offline Access Context and access-revision/lease authority before private offline cache/write/sync. Then implement the WS14 cache/queue/conflict layer against the canonical OCC/idempotency/session contracts.

**Class:** shared security/runtime implementation; likely CRITICAL where session/tenant authority changes.  
**Blocking:** `U01-003..007` advancement from Missing.

### DR-RC3-A4-03 -> WS14 / mobile device evidence

**Need:** add/execute focused real-browser device acceptance for barcode/QR, geolocation and signature paths; keep browser support/fallback explicit.

**Class:** STANDARD evidence; any presentation-only test fix can stay FAST when it does not change authority.  
**Blocking:** `U01-009..012` RC recommendation.

### DR-RC3-A4-04 -> A0 / A2 or WS15 cross-check

**Need:** before applying `U01-013 Foundation -> Missing`, cross-check whether another workstream has a concrete web-push/device-push subscription + delivery path not indexed by the current UI search. In-app notification inbox/event records are insufficient.

**Class:** evidence reconciliation.  
**Blocking:** final `U01-013` registry score only; does not block other A4 findings.

## 11. A0 convergence handoff

A0 should ingest these exact findings:

1. Rewrite `E-UI` current evidence language to say **V2 runtime presentation authority + retained V3 compatibility/QA assets**, not “current UI V3”.
2. Keep `U01-001/002` at Wired until current exact browser/install evidence exists.
3. Keep `U01-003..007` Missing.
4. Consider `U01-009..012` Foundation -> Wired based on connected current source; do not promote to RC without device/browser evidence.
5. Keep `U01-008` Foundation.
6. Treat `U01-013` as a Missing candidate unless A2/WS15 supplies a real push-delivery path.
7. Do not use `69b94ac...` production evidence to claim current-main deployment.
8. Add exact-current browser matrix + exact release health as release-confidence blockers rather than opening another broad UI rewrite.

Suggested blocker wording:

> Current V2 runtime is source-wired for responsive/mobile use, but exact-current cross-device browser evidence and exact production SHA/bundle convergence are unproven; offline U01-003..007 remain unimplemented under the frozen security/OCC contract.

## 12. Validation / audit record

A4 is an evidence lane, not an implementation lane.

Completed:

- exact main rechecked and remained `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7` during audit;
- current `AppShell.tsx` and `v3.css` source authority inspected;
- PR `#544` V2 rollback and V3 history classified;
- V3-07/V3-08 QA/release requirements audited;
- current ALU release workflow inspected;
- historical `deploy-evidence/alu-full-sync.json` inspected;
- PWA manifest inspected;
- offline contract inspected;
- barcode/QR scanner source and real consumer inspected;
- generic geolocation/signature control wiring inspected;
- browser push implementation searches returned no matching current path;
- open UI/V3/mobile PR search returned no active candidate.

Not executed by A4:

- no repository runtime code change;
- no browser test run;
- no production probe claimed as PASS;
- no deploy;
- no provider mutation;
- no capability registry edit;
- no `CURRENT_STATUS.md` / `NEXT_TASKS.md` edit before A0 convergence.

Final worker status: **READY for RC3 convergence**.
