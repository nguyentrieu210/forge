# Source Scan Specification

Scanner `docs/tools/build_source_manifest.py` chạy trên checkout đã pin. Sau đó enrichment pass phải parse:

- DocType JSON: fields, permissions, links, autoname, indexes, states.
- Python/JS/TS/Vue symbols: controllers, whitelisted methods, hooks, routes, scheduled jobs.
- Reports/pages/workspaces/dashboards/fixtures/patches/tests.
- Dependencies từ imports, hooks và Link fields.

Manifest thô không tự chứng minh business parity. Mỗi discovered controller/report/page phải map đến rule ledger, implementation và oracle hoặc waiver.

## CI commands

```bash
python docs/tools/build_source_manifest.py --app erpnext --root ../erpnext --commit "$ERP_SHA" --license GPL-3.0 --out docs/parity/erpnext-manifest.json
python docs/tools/verify_brd.py
```

## Gate

- `SOURCE_SCAN_PENDING > 0`: không được tuyên bố source-exact full parity.
- `UNMAPPED_BEHAVIOR > 0` trên critical artifact: chặn build.
- Source hash đổi: invalidate ORACLE_GREEN của artifact liên quan cho đến khi diff được duyệt.
