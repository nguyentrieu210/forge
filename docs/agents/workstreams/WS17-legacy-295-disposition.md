# WS17 — Legacy PR #295 exact disposition

Status: **COMPLETE FILE-BY-FILE AUDIT**  
Legacy PR: `#295 feat(purchase): complete Tiến Đạt FIFO delivery and payable operations`  
WS17 rule: secondary owner only. Shared Procurement/Kernel/UI ownership remains with WS03/WS00/WS09/WS14.

## Decision

**REJECT-AS-WHOLE / SELECTIVE-PORT ONLY.**

PR #295 mixed three different things in one branch:

1. valid Alumdoor vertical composition/read models;
2. generic Procurement/Kernel capability that belongs owner workstreams;
3. shared UI code that still knows Tiến Đạt/Alumdoor by literal name.

WS17 ports only category 1 and keeps categories 2-3 outside the vertical branch.

## File disposition

| File in #295 | WS17 disposition | Canonical owner / evidence |
|---|---|---|
| `client/packages/views/src/action/FriendlyActionScreen.tsx` | **REJECT code reuse** | WS14 renderer + WS09 metadata. Hard-coded action/method recognition is boundary debt. |
| `client/packages/views/src/action/SupplierDeliveryWorkspace.tsx` | **REJECT code reuse / UX evidence only** | WS14/WS09. A shared component named around supplier/Alumdoor policy would preserve reverse leakage. |
| `client/packages/views/src/action/SupplierDeliveryWorkspaceTables.tsx` | **REJECT code reuse / UX evidence only** | WS14/WS09. Tables must be rendered from generic action/workspace metadata. |
| `docs/ALUMDOOR-TIEN-DAT-PURCHASE-COMPLETION-20260803.md` | **REUSE as historical evidence** | Not canonical architecture; exact executable evidence from #295 remains useful. |
| `server/apps-src/alumdoor-worker/src/bulk-purchase-fifo-receipt.ts` | **SELECTIVE PORT — DONE** | WS17. Exact validated #295 executable blob ported; preserves user `posting_at` in fingerprint and created Purchase Receipt. |
| `server/apps-src/alumdoor-worker/src/entry.ts` | **SELECTIVE REIMPLEMENT — DONE** | WS17. Current entry keeps newer main routes and adds dashboard/settlement routing without replacing the whole file with stale branch state. |
| `server/apps-src/alumdoor-worker/src/purchase-supplier-dashboard.ts` | **SELECTIVE PORT — DONE** | WS17. Exact validated #295 app-worker blob ported: pagination, line drilldown, cây/mét/kg barem, weight variance, authoritative AP. |
| `server/apps-src/alumdoor-worker/src/purchase-supplier-settlement.ts` | **SELECTIVE REIMPLEMENT — DONE** | WS17. Uses canonical `Purchase Settlement`; WS17 version adds fail-closed PO pagination and localized operation input while forwarding caller identity. |
| `server/packages/clouderp-core/src/purchase-allocation-controllers.ts` | **REJECT in WS17 / owner extraction** | WS03. #305 carries the kg-vs-allocation invariant; DR-WS17-01 requires normalized allocation axis instead of `Nhôm cây/lá` literal. |
| `server/packages/document-kernel/src/purchase-supplier-debt-report.ts` | **REJECT in WS17 / generic dependency** | WS00. DR-WS17-03 requires generic material-measure projection, not Aluminium-specific columns in kernel. |
| `server/tests/purchase-receipt-submit-preview.test.mjs` | **OWNER EVIDENCE ONLY** | WS03 regression for canonical Procurement allocation semantics. |
| `server/tests/purchase-supplier-delivery-dashboard.test.mjs` | **SELECTIVE PORT — DONE** | WS17. Exact validated #295 regression blob ported with the dashboard implementation. |
| `server/tests/purchase-supplier-settlement.test.mjs` | **SELECTIVE REIMPLEMENT — DONE** | WS17. Regression locks Close/Reverse window selection, reason, canonical submit and caller identity forwarding. |
| `server/tests/tien-dat-purchase-bulk-fifo.test.mjs` | **SELECTIVE PORT — DONE** | WS17. Exact validated #295 regression blob ported with bulk FIFO executable. |

## Evidence inheritance boundary

PR #295 reports temporary exact-head validation commit `7d6cefa93ea69aa1c882eb2f9e5131cc5833e425`, workflow run `30767153983`:

- build PASS;
- typecheck PASS;
- focused Tiến Đạt regressions PASS;
- server suite: 1,586 tests, 1,542 pass, 44 skipped, 0 fail;
- client suite: 149 files / 932 tests / 0 fail.

WS17 may cite that evidence only for **identical executable/test blobs** ported above. It does not claim that historical run validates WS17-only Golden Order, lifecycle, settlement adaptations, boundary docs/tests or current branch head.

## Remaining #295 value

None unclassified.

Any future reuse request from #295 must point to a file above and respect its disposition. Do not merge/rebase the whole legacy branch into WS17.
