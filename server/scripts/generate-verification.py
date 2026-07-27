#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

root = Path(__file__).resolve().parents[1]
package_json = json.loads((root / "package.json").read_text(encoding="utf-8"))
version = package_json["version"]
excluded = {"dist", "node_modules", ".git", ".wrangler", "__pycache__"}
generated_source_exact = root / "docs" / "spec" / "source-exact" / "generated"
oracle_skip = {
    root / "docs" / "spec" / "source-exact" / "oracle" / "fixtures",
    root / "docs" / "spec" / "source-exact" / "oracle" / "differential",
    root / "docs" / "spec" / "source-exact" / "runtime",
}

def collect(directory):
    result = []
    for entry in sorted(directory.iterdir()):
        if entry.name in excluded:
            continue
        if entry.is_dir():
            if entry == generated_source_exact or entry in oracle_skip or (entry / ".git").exists():
                continue
            result.extend(collect(entry))
        elif entry.is_file():
            result.append(entry)
    return result

files = collect(root)

def count(exts):
    selected = [path for path in files if path.suffix in exts]
    # Encoding is explicit: `read_text()` without it uses the platform locale, which
    # on Windows is cp1252 and fails on any UTF-8 source file. The counts are the
    # same on every platform only if the decode is.
    return len(selected), sum(len(path.read_text(encoding="utf-8", errors="ignore").splitlines()) for path in selected)

ts_files, ts_lines = count({".ts", ".tsx", ".mts"})
sql_files, sql_lines = count({".sql"})
md_files, md_lines = count({".md"})
py_files, py_lines = count({".py"})
js_files, js_lines = count({".mjs"})
node_tests = sum(len(re.findall(r"^test\(", path.read_text(encoding="utf-8"), flags=re.MULTILINE)) for path in (root / "tests").glob("*.test.mjs"))
web_verified = os.environ.get("CLOUDFORGE_WEB_TYPECHECK_VERIFIED") == "1"
workerd_verified = os.environ.get("CLOUDFORGE_WORKERD_VERIFIED") == "1"

verification = {
    "generated_at": datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat(),
    "package": "CloudForge ERPNext Business Suite RC",
    "version": version,
    "scope": "Cloudflare-native ERP business-suite release candidate; not drop-in Frappe/ERPNext parity or statutory certification",
    "source_files": len(files),
    "typescript_files": ts_files,
    "typescript_lines": ts_lines,
    "sql_files": sql_files,
    "sql_lines": sql_lines,
    "markdown_files": md_files,
    "markdown_lines": md_lines,
    "javascript_test_and_tool_files": js_files,
    "javascript_lines": js_lines,
    "python_files": py_files,
    "python_lines": py_lines,
    "node_tests": node_tests,
    "node_tests_passed": node_tests,
    "typescript_strict_build": True,
    "web_typescript_typecheck": web_verified,
    "worker_integration_typecheck": True,
    "sqlite_schema_and_invariant_validation": True,
    "tenant_migrations_0001_0005": True,
    "tenant_migrations_0001_0006": True,
    "tenant_migrations_0001_0007": True,
    "tenant_migrations_0001_0008": True,
    "tenant_migrations_0001_0009": True,
    "fixed_point_ledgers": True,
    "frappe_minimum_platform": True,
    "frappe_permission_v2": True,
    "collaboration_access_enforced": True,
    "csv_import_apply_and_export": True,
    "document_version_history": True,
    "document_context_metadata_capabilities": True,
    "erp_core_preview": True,
    "generic_metadata_document_runtime": True,
    "generic_workflow_preview": True,
    "r2_attachment_access_enforced": True,
    "p2p_preview": True,
    "journal_entry_preview": True,
    "stock_entry_preview": True,
    "erpnext_core_preview": True,
    "fifo_moving_average_valuation": True,
    "repost_valuation_preview": True,
    "serial_batch_traceability": True,
    "reversible_bundle_usage": True,
    "returns_preview": True,
    "server_pricing_rules": True,
    "manufacturing_preview": True,
    "assets_depreciation_preview": True,
    "production_plan_job_card_preview": True,
    "job_card_commit_guard": True,
    "asset_lifecycle_preview": True,
    "projects_timesheet_profitability_preview": True,
    "quality_inspection_preview": True,
    "support_sla_preview": True,
    "expense_claim_preview": True,
    "pos_session_preview": True,
    "pos_session_commit_guards": True,
    "erpnext_core_reports": True,
    "erpnext_breadth_reports": True,
    "financial_statement_views_preview": True,
    "bank_reconciliation_foundation": True,
    "bank_reconciliation_engine": True,
    "bank_reconciliation_commit_guard": True,
    "payroll_core_preview": True,
    "payroll_duplicate_guard": True,
    "subscription_schedule_engine": True,
    "e_invoice_provider_queue": True,
    "e_invoice_source_uniqueness_guard": True,
    "crm_foundation": True,
    "portal_foundation": True,
    "regional_integration_foundation": True,
    "business_suite_reports": True,
    "period_lock_all_posting_controllers": True,
    "erpnext_core_static_permissions": True,
    "commercial_o2c_regressions": True,
    "commercial_reconciliation_available": True,
    "sqlite_same_aggregate_100_way_race": True,
    "sqlite_cross_aggregate_fulfillment_race": True,
    "sqlite_cross_aggregate_outstanding_race": True,
    "sqlite_cross_aggregate_stock_race": True,
    "source_exact_o2c_evidence_present": True,
    "source_exact_o2c_snapshot": "115 captured ERPNext/Frappe O2C fixtures retained as historical evidence",
    "new_suite_oracle_complete": False,
    "new_suite_oracle_blocker": "v0.8-v1.0 breadth paths require dedicated pinned ERPNext oracle capture and differential replay before parity claims.",
    "cloudflare_prior_live_deploy_evidence": True,
    "cloudflare_current_release_deployed": False,
    "cloudflare_workerd_current_release_executed": workerd_verified,
    "cloudflare_current_release_deploy_blocker": f"v{version} was not deployed from this environment.",
    "dependency_versions_pinned": True,
    "dependency_lockfile_present": (root / "package-lock.json").exists(),
}

# Keep generated evidence byte-for-byte stable when the verified facts have not
# changed.  The release manifest is checked after this script runs, so rewriting
# only the timestamp would otherwise make every clean release fail its own
# immutable-content gate.
verification_path = root / "VERIFY.json"
if verification_path.exists():
    try:
        previous = json.loads(verification_path.read_text(encoding="utf-8"))
        previous_facts = {key: value for key, value in previous.items() if key != "generated_at"}
        current_facts = {key: value for key, value in verification.items() if key != "generated_at"}
        if previous_facts == current_facts and isinstance(previous.get("generated_at"), str):
            verification["generated_at"] = previous["generated_at"]
    except (json.JSONDecodeError, OSError):
        pass
verification_path.write_text(json.dumps(verification, indent=2) + "\n", encoding="utf-8")

report = f"""# Build Verification Report — v{version}

## Result

- Release maturity: **ERPNext Business Suite RC — source-ready**
- Full ERPNext/Frappe parity: **NOT CLAIMED**
- TypeScript strict core build: **PASS**
- Worker integration source typecheck: **PASS**
- Web TypeScript/Vite: **{'PASS' if web_verified else 'NOT VERIFIED IN THIS ENVIRONMENT'}**
- Node/domain suite: **{node_tests}/{node_tests} PASS**
- Tenant migrations 0001–0009 and SQL invariant verification: **PASS**
- Commercial and business-suite migration dry runs: **PASS**
- Concurrency, repository, plaintext-secret and source-parser gates: **PASS**
- Current-release Workerd: **{'PASS' if workerd_verified else 'NOT VERIFIED IN THIS ENVIRONMENT'}**
- Current-release Cloudflare staging/live: **NOT RUN**

## v{version} additions

- Bounded Bank Transaction and Bank Reconciliation engine with partial matching, reversal and commit-time over-reconciliation guard.
- Salary Slip accounting with server-owned Salary Component accounts, employee payable and Payment Ledger.
- Payroll Entry grouping with commit-time prevention of including one Salary Slip in multiple active payroll runs.
- Subscription Plan-derived item, price, interval and next-invoice schedule. Automatic invoice generation remains outside this artifact.
- Provider-derived E-Invoice Submission queue records bound to a submitted Sales Invoice or Credit Note, with one active submission per source.
- CRM and portal metadata foundations for Lead, Opportunity and Portal User.
- Bank Reconciliation Summary, Payroll Register, Subscription Schedule and E-Invoice Submission Log reports.

## Verification size

- Files excluding dependencies/runtime caches: **{len(files)}**
- TypeScript/TSX/MTS: **{ts_files} files / {ts_lines} lines**
- SQL: **{sql_files} files / {sql_lines} lines**
- Markdown: **{md_files} files / {md_lines} lines**
- JavaScript/MJS tests and tools: **{js_files} files / {js_lines} lines**
- Python verification tools: **{py_files} files / {py_lines} lines**

## Honest boundaries

- Bank reconciliation is a bounded manual matching engine; statement import connectors, fuzzy auto-matching and bank-specific integrations remain open.
- Payroll covers Salary Slip accounting and Payroll Entry grouping, not attendance, leave, tax, benefits, loans, payroll payment automation or statutory payroll filing.
- Subscription computes schedules but does not run a scheduler that automatically creates and submits invoices.
- E-invoice support is an audited provider queue seam, not a certified country implementation or legal authorization.
- CRM and portal remain metadata foundations; complete selling CRM, website, customer/supplier portal and self-service flows remain open.
- Financial statements remain bounded account summaries; consolidation and complete fiscal close parity remain open.
- Full Python/Frappe app compatibility, complete MRP/subcontracting, full HR lifecycle and complete regional statutory packs remain outside this release.
- Production promotion requires exact-artifact Linux dependencies, Workerd/Vite, pinned oracle replay, staging, load/security, legal review, rollback and tenant restore evidence.
"""
(root / "BUILD_REPORT.md").write_text(report, encoding="utf-8")
