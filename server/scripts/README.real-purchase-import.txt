REAL DATA PURCHASE IMPORT

Final status: PURCHASE_IMPORT_PASS

Source disposition
- 14 explicit purchase rows audited.
- 11 rows are canonical importable receipt evidence.
- 3 rows are isolated, fail-closed source defects: 538 (non-canonical Item identity), 543 (unproven 2,834,000 Kg outlier), 544 (missing quantity).
- No Purchase Order is invented from receipt-only evidence.

Canonical local persistence
- Gate A prerequisite: 587/587 Item, created=0 on final run.
- Exact importable Suppliers: 5/5 resolved; reconciliation replay is idempotent.
- Historical Purchase Receipt drafts: 6 documents / 11 lines.
- docstatus=0; submit_forbidden=true.
- no warehouse is invented and no goods photo is fabricated.
- generated SQL write targets are restricted to documents and document_search only.
- stock write targets: 0.
- local D1 only; no remote Cloudflare mutation.

Idempotency evidence
- dedicated self-hosted workflow verifies the persisted local D1 state directly when the already-running API process has a stale file view.
- first verified projection: 6 receipts / 11 lines, duplicates=0, mismatches=0.
- second replay: 6 receipts / 11 lines, duplicates=0, mismatches=0, content stable.
- final gate marker: ALUMDOOR_REAL_PURCHASE_IMPORT_PASS.

Historical drafts remain intentionally non-submittable until separate authoritative warehouse/stock-cutoff evidence exists.
