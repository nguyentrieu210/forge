#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one anchor in {path}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


root = Path(__file__).resolve().parents[1]
worker = root / "server/apps/tenant-worker/src/index.ts"
timeline = root / "client/packages/views/src/container/AllocationTimelineDialog.tsx"
report_dialog = root / "client/packages/views/src/container/PurchaseSupplierDebtReportDialog.tsx"

replace_once(
    worker,
    'import { D1CommercialReconciliationService, D1DocumentListStore, D1MutationStore, D1PurchaseAllocationTimelineService, D1RolloutPurchaseAllocationDomainStore, DocumentListService } from "../../../packages/document-kernel/src/index.js";',
    'import { D1CommercialReconciliationService, D1DocumentListStore, D1MutationStore, D1PurchaseAllocationTimelineService, D1PurchaseSupplierDebtReportService, D1RolloutPurchaseAllocationDomainStore, DocumentListService } from "../../../packages/document-kernel/src/index.js";',
)

report_route = '''
  if (request.method === "GET" && url.pathname === "/api/method/metaforge.api.get_purchase_supplier_debt_report") {
    const [purchaseOrderScope, purchaseReceiptScope] = await Promise.all([
      permissions.getReadScope(actor, tenantId, "Purchase Order"),
      permissions.getReadScope(actor, tenantId, "Purchase Receipt"),
    ]);
    const unrestricted = (scope: typeof purchaseOrderScope): boolean =>
      scope.mode === "all" && scope.user_permissions.length === 0;
    if (!unrestricted(purchaseOrderScope) || !unrestricted(purchaseReceiptScope)) {
      throw errors.permission("Supplier debt report requires unrestricted Purchase Order and Purchase Receipt read access");
    }

    const company = url.searchParams.get("company")?.trim() ?? "";
    const supplier = url.searchParams.get("supplier")?.trim() ?? "";
    const itemCode = url.searchParams.get("item_code")?.trim() ?? "";
    const windowId = url.searchParams.get("window_id")?.trim() ?? "";
    const statusValue = url.searchParams.get("status")?.trim() ?? "";
    if (statusValue && !["Open", "Settled", "Reversed"].includes(statusValue)) {
      throw errors.validation("status must be Open, Settled or Reversed");
    }
    const fromDate = url.searchParams.get("from_date")?.trim() ?? "";
    const toDate = url.searchParams.get("to_date")?.trim() ?? "";
    const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;
    if ((fromDate && !datePattern.test(fromDate)) || (toDate && !datePattern.test(toDate))) {
      throw errors.validation("from_date and to_date must use YYYY-MM-DD");
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw errors.validation("from_date must not be after to_date");
    }
    const limitText = url.searchParams.get("limit")?.trim() ?? "";
    const limit = limitText ? Number(limitText) : 250;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw errors.validation("limit must be an integer from 1 to 500");
    }

    const report = await new D1PurchaseSupplierDebtReportService(requestDb).run(
      tenantId,
      {
        ...(company ? { company } : {}),
        ...(supplier ? { supplier } : {}),
        ...(itemCode ? { item_code: itemCode } : {}),
        ...(windowId ? { window_id: windowId } : {}),
        ...(statusValue ? { status: statusValue as "Open" | "Settled" | "Reversed" } : {}),
        ...(fromDate ? { from_date: fromDate } : {}),
        ...(toDate ? { to_date: toDate } : {}),
        limit,
      },
      now(),
    );
    return jsonResponse({ message: report });
  }

'''
replace_once(
    worker,
    '  const installedApps = new AppInstaller(requestDb, metadata, users);\n',
    report_route + '  const installedApps = new AppInstaller(requestDb, metadata, users);\n',
)

replace_once(
    timeline,
    '} from "./PurchaseAllocationActionDialog.js";\n',
    '} from "./PurchaseAllocationActionDialog.js";\nimport { PurchaseSupplierDebtReportDialog } from "./PurchaseSupplierDebtReportDialog.js";\n',
)
replace_once(
    timeline,
    '  const [actionSaving, setActionSaving] = useState(false);\n',
    '  const [actionSaving, setActionSaving] = useState(false);\n  const [reportOpen, setReportOpen] = useState(false);\n  const [reportRefreshKey, setReportRefreshKey] = useState(0);\n',
)
replace_once(
    timeline,
    '      setAction(null);\n      return;\n',
    '      setAction(null);\n      setReportOpen(false);\n      return;\n',
)
replace_once(
    timeline,
    '      setDisplayTimeline(refreshed);\n',
    '      setDisplayTimeline(refreshed);\n      setReportRefreshKey((value) => value + 1);\n',
)
replace_once(
    timeline,
    '''          <div className="flex shrink-0 justify-end border-t px-5 py-3">
            <Button type="button" variant="outline" disabled={loading || actionSaving} onClick={onClose}>Đóng</Button>
          </div>''',
    '''          <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={loading || !effectiveTimeline}
              onClick={() => setReportOpen(true)}
            >
              Công nợ NCC
            </Button>
            <Button type="button" variant="outline" disabled={loading || actionSaving} onClick={onClose}>Đóng</Button>
          </div>''',
)
replace_once(
    timeline,
    '''      <PurchaseAllocationActionDialog
        target={action}
        saving={actionSaving}
        onCancel={() => setAction(null)}
        onSubmit={(submission) => { void submitAction(submission); }}
      />
    </>''',
    '''      <PurchaseAllocationActionDialog
        target={action}
        saving={actionSaving}
        onCancel={() => setAction(null)}
        onSubmit={(submission) => { void submitAction(submission); }}
      />
      <PurchaseSupplierDebtReportDialog
        open={reportOpen}
        refreshKey={reportRefreshKey}
        onClose={() => setReportOpen(false)}
      />
    </>''',
)

replace_once(
    report_dialog,
    '  const loadReport = async () => {\n',
    '  const loadReport = async (nextFilters: FilterState = filters) => {\n',
)
replace_once(
    report_dialog,
    '      for (const [key, value] of Object.entries(filters)) {\n',
    '      for (const [key, value] of Object.entries(nextFilters)) {\n',
)
replace_once(
    report_dialog,
    '''                  setFilters(EMPTY_FILTERS);
                  queueMicrotask(() => { void loadReport(); });''',
    '''                  setFilters(EMPTY_FILTERS);
                  void loadReport(EMPTY_FILTERS);''',
)

print("supplier debt integration patch applied")
