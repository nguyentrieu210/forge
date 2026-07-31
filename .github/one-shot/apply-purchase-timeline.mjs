import fs from "node:fs";
import { execFileSync } from "node:child_process";

const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (branch !== "feat/purchase-receipt-complete-20260731") {
  throw new Error(`Refusing to edit unexpected branch ${branch}`);
}

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Anchor not found in ${path}: ${before.slice(0, 80)}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Anchor is not unique in ${path}: ${before.slice(0, 80)}`);
  }
  fs.writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

const workerPath = "server/apps/tenant-worker/src/index.ts";
replaceOnce(
  workerPath,
  'import { D1CommercialReconciliationService, D1DocumentListStore, D1MutationStore, D1RolloutPurchaseAllocationDomainStore, DocumentListService } from "../../../packages/document-kernel/src/index.js";',
  'import { D1CommercialReconciliationService, D1DocumentListStore, D1MutationStore, D1PurchaseAllocationTimelineService, D1RolloutPurchaseAllocationDomainStore, DocumentListService } from "../../../packages/document-kernel/src/index.js";',
);
replaceOnce(
  workerPath,
  "\n  const installedApps = new AppInstaller(requestDb, metadata, users);",
  `
  if (request.method === "GET" && url.pathname === "/api/method/metaforge.api.get_purchase_allocation_timeline") {
    const requestedDoctype = requireShortText(url.searchParams.get("doctype"), "doctype", 160);
    const name = requireShortText(url.searchParams.get("name"), "name", 320);
    if (requestedDoctype !== "Purchase Order" && requestedDoctype !== "Purchase Receipt") {
      return jsonResponse({ message: null });
    }

    const document = await documents.getDocument(tenantId, requestedDoctype, name);
    if (!document) throw errors.notFound(requestedDoctype + " " + name + " was not found");
    await permissions.assert({
      actor,
      tenantId,
      doctype: requestedDoctype,
      name,
      owner: document.owner,
      data: document.data,
      action: "read",
    });
    const timeline = await new D1PurchaseAllocationTimelineService(requestDb)
      .getTimeline(tenantId, requestedDoctype, name);
    return jsonResponse({ message: timeline });
  }

  const installedApps = new AppInstaller(requestDb, metadata, users);`,
);

const formPath = "client/packages/views/src/container/FormContainer.tsx";
replaceOnce(
  formPath,
  'import { ConfirmDialog, PromptDialog, toast, useT } from "@metaforge/ui";',
  'import { Button, ConfirmDialog, PromptDialog, toast, useT } from "@metaforge/ui";',
);
replaceOnce(
  formPath,
  'import { SubmitPreviewDialog, type SubmitPreview } from "./SubmitPreviewDialog.js";',
  'import { SubmitPreviewDialog, type SubmitPreview } from "./SubmitPreviewDialog.js";\nimport { AllocationTimelineDialog, type AllocationTimeline } from "./AllocationTimelineDialog.js";',
);
replaceOnce(
  formPath,
  "  const [submitPreview, setSubmitPreview] = useState<SubmitPreview | null>(null);",
  `  const [submitPreview, setSubmitPreview] = useState<SubmitPreview | null>(null);
  const [allocationTimelineOpen, setAllocationTimelineOpen] = useState(false);
  const [allocationTimeline, setAllocationTimeline] = useState<AllocationTimeline | null>(null);
  const [allocationTimelineLoading, setAllocationTimelineLoading] = useState(false);
  const [allocationTimelineError, setAllocationTimelineError] = useState<string | null>(null);
  const supportsAllocationTimeline = doctype === "Purchase Order" || doctype === "Purchase Receipt";`,
);
replaceOnce(
  formPath,
  "  const doDelete = async () => {",
  `  const openAllocationTimeline = async () => {
    setAllocationTimelineOpen(true);
    setAllocationTimelineLoading(true);
    setAllocationTimelineError(null);
    try {
      const timeline = await adapter.callGet<AllocationTimeline | null>(
        "metaforge.api.get_purchase_allocation_timeline",
        { doctype, name },
      );
      setAllocationTimeline(timeline);
    } catch (error) {
      setAllocationTimeline(null);
      setAllocationTimelineError(adapter.mapError(error).message);
    } finally {
      setAllocationTimelineLoading(false);
    }
  };

  const doDelete = async () => {`,
);
replaceOnce(
  formPath,
  "        headerActions={props.headerActions}",
  `        headerActions={(
          <>
            {props.headerActions}
            {supportsAllocationTimeline && Number(doc.docstatus ?? 0) !== 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={allocationTimelineLoading}
                onClick={() => void openAllocationTimeline()}
              >
                {allocationTimelineLoading ? "Đang tải…" : "Phân bổ"}
              </Button>
            ) : null}
          </>
        )}`,
);
replaceOnce(
  formPath,
  `      <SubmitPreviewDialog
        preview={submitPreview}
        saving={saving}
        onCancel={() => setSubmitPreview(null)}
        onConfirm={() => void confirmSubmit()}
      />`,
  `      <SubmitPreviewDialog
        preview={submitPreview}
        saving={saving}
        onCancel={() => setSubmitPreview(null)}
        onConfirm={() => void confirmSubmit()}
      />
      <AllocationTimelineDialog
        open={allocationTimelineOpen}
        timeline={allocationTimeline}
        loading={allocationTimelineLoading}
        error={allocationTimelineError}
        onClose={() => setAllocationTimelineOpen(false)}
      />`,
);

fs.rmSync(".github/one-shot/apply-purchase-timeline.mjs");
execFileSync("git", ["checkout", "HEAD^", "--", ".github/workflows/purchase-feature-ci.yml"]);
