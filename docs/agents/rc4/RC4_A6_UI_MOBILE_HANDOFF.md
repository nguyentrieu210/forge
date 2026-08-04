# RC4-A6 — Current V2 Browser / Mobile / Offline Evidence

Status: **BOOTSTRAPPED**
Branch: `agent/rc4-06-ui-mobile-offline`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **STANDARD**, escalating to **CRITICAL** if offline/session/OCC authority changes.
Owner stream: **WS14**

## Mission

Close current MetaForge **V2** browser/mobile/PWA release-confidence gaps. RC3 established V2 as current presentation authority; do not revive V3 by assumption.

## Read first

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/workstreams/WS14-frontend-runtime-mobile.md`
- `docs/agents/rc/RC3_A4_UI_MOBILE_RELEASE_EVIDENCE.md`
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`

## Primary scope

1. Exact-current V2 desktop/tablet/Android/360px browser matrix.
2. Accessibility, keyboard/focus, dark/reduced-motion and installable PWA evidence.
3. Device-path evidence for barcode/QR, geolocation and signature; do not promote Push without a real subscription/delivery path.
4. Production UI release evidence only when the exact UI fast-path is actually used: build -> deploy -> `/health` -> `/release.json` exact SHA/hash.
5. Offline read/write/background-sync/conflict work only after consuming authoritative tenant/session/OCC/release-freshness contracts from WS00/WS11/WS12. Do not create a client-only source of truth.

## Forbidden / avoid

- No broad V3 restoration or competing shell authority.
- No domain rule hard-coded into shared React views when metadata can express it.
- No fake RC from source-only device APIs; browser/device execution is required.
- No backend/auth/storage contract edits merely to unblock a UI test.

## Dependencies

- A1/WS11: session/auth-strength/privacy constraints.
- A2/WS12: release freshness/recovery/provider evidence.
- WS00: OCC/cache/tenant authority if offline contracts need shared changes.
- WS09/A7: metadata/AppAction contracts where generic renderer support is missing.

Record Dependency Requests and continue all independent browser/mobile/a11y/PWA work.

## Merge/deploy boundary

Pure UI-only changes that preserve authoritative behavior may follow the repository UI fast-path after verification and may merge/deploy automatically. Any backend/schema/session/offline-authority/business-contract change is non-UI and must stop before merge/deploy for explicit approval.
