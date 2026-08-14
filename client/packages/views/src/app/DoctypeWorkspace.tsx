/** @jsxImportSource react */
/**
 * Generic DocType workspace: desktop dùng List | Form | Context,
 * mobile dùng một pane; tạo mới mở modal lớn. DocType có canonical Bulk policy
 * được thêm tab Nhập hàng loạt dùng chung renderer, không sinh page riêng theo từng nghiệp vụ.
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { List, Rows3 } from "lucide-react";
import { resolveBulkRenderPolicy } from "@metaforge/core";
import { Button, chromeFill, chromeText, cn, Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
import { useMetaForge } from "../container/provider.js";
import { SplitView } from "../detail/SplitView.js";
import { ListContainer } from "../container/ListContainer.js";
import { BulkGridContainer } from "../bulk/BulkGridContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { ContextContainer } from "../container/ContextContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import type { UrlStateBridge } from "../list/useListState.js";
import { buildPrintPath } from "../print/printRoute.js";
import {
  V3_CONFIRM_DIALOG_CLASS,
  V3_DATA_SURFACE_CLASS,
  V3_FULL_CREATE_DIALOG_CLASS,
  V3_QUICK_ENTRY_DIALOG_CLASS,
  V3_VIEW_SWITCHER_CLASS,
} from "../data-surface/v3.js";

const AlumdoorSalesOrderCreate = lazy(() => import("./vertical/alumdoor/AlumdoorSalesOrderCreate.js").then((module) => ({ default: module.AlumdoorSalesOrderCreate })));
const AlumdoorProductionRequestDetail = lazy(() => import("./vertical/alumdoor/AlumdoorProductionRequestDetail.js").then((module) => ({ default: module.AlumdoorProductionRequestDetail })));
const AlumdoorWorkOrderDetail = lazy(() => import("./vertical/alumdoor/AlumdoorWorkOrderDetail.js").then((module) => ({ default: module.AlumdoorWorkOrderDetail })));
const AlumdoorManufacturingStockEntryCreate = lazy(() => import("./vertical/alumdoor/AlumdoorManufacturingStockEntryCreate.js").then((module) => ({ default: module.AlumdoorManufacturingStockEntryCreate })));

export interface DoctypeWorkspaceProps {
  doctype: string;
  /** Optional localized screen title when a route represents a richer business center. */
  title?: string;
  name?: string;
  onNavigate: (path: string) => void;
  bridge: UrlStateBridge;
  contextAiSlot?: ReactNode;
  base?: string;
  printBase?: string;
}

export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const t = useT();
  const { formProfiles } = useMetaForge();
  const [closeRequest, setCloseRequest] = useState(0);
  const [bulkDirty, setBulkDirty] = useState(false);
  const [confirmBulkExit, setConfirmBulkExit] = useState(false);
  const titleMeta = useMeta(props.doctype);
  const { doctype, name, onNavigate, bridge } = props;
  const base = props.base ?? "/app";
  const printBase = props.printBase ?? "/print";
  const displayTitle = props.title ?? titleMeta.data?.label ?? doctype;
  const listPath = `${base}/${doctype}`;
  const isNew = name === "new";
  const decoded = name && !isNew ? decodeURIComponent(name) : undefined;
  const isTree = titleMeta.data?.is_tree === 1;
  /**
   * AlumDoor được runtime đánh dấu bằng form profile riêng cho Item Group. Chỉ profile của
   * vertical này giữ `default_measurement_profile`; nhờ vậy generic workspace không chiếm
   * màn nghiệp vụ của app khác. Màn chuyên biệt vẫn lazy-load, nên app khác không tải code cửa.
   */
  const isAlumdoorProfile = Boolean(formProfiles?.["Item Group"]?.keep?.includes("default_measurement_profile"));
  const useAlumdoorSalesForm = doctype === "Sales Order" && isAlumdoorProfile;
  const useAlumdoorSalesCreate = isNew && useAlumdoorSalesForm;
  const useAlumdoorSalesDetail = Boolean(decoded) && useAlumdoorSalesForm;
  const useAlumdoorProductionRequestDetail = Boolean(decoded) && doctype === "Production Request" && isAlumdoorProfile;
  const useAlumdoorWorkOrderDetail = Boolean(decoded) && doctype === "Work Order" && isAlumdoorProfile;
  const manufacturingWorkOrder = bridge.get("f_work_order")?.trim() ?? "";
  const requestedStockPurpose = bridge.get("f_purpose");
  const manufacturingPurpose = requestedStockPurpose === "Material Transfer" || requestedStockPurpose === "Manufacture" ? requestedStockPurpose : undefined;
  const useAlumdoorManufacturingStockEntryContext = !isNew && !decoded && doctype === "Stock Entry" && isAlumdoorProfile && Boolean(manufacturingWorkOrder && manufacturingPurpose);
  /**
   * Kích cỡ màn tạo mới đi theo PHẠM VI của chứng từ, không phải theo khai báo riêng của từng app.
   *
   * Có bảng con nghĩa là người dùng sẽ nhập nhiều dòng, mỗi dòng nhiều cột — việc đó cần cả màn
   * hình. Không có bảng con thì chỉ vài ô, và một hộp thoại gọn giữ được ngữ cảnh danh sách phía
   * sau. Suy ra từ chính metadata nên không doctype nào phải khai thêm gì.
   */
  const hasChildTable = useMemo(
    () => (titleMeta.data?.fields ?? []).some((field) => field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect"),
    [titleMeta.data],
  );
  const bulkPolicy = useMemo(() => titleMeta.data ? resolveBulkRenderPolicy(titleMeta.data) : undefined, [titleMeta.data]);
  const bulkEnabled = Boolean(bulkPolicy?.enabled && !isTree);
  const bulkOnly = Boolean(bulkPolicy?.rowSource);
  const bulkActive = !decoded && !isNew && !useAlumdoorManufacturingStockEntryContext && bulkEnabled && (bulkOnly || bridge.get("view") === "bulk");

  const modeTabs = bulkEnabled && !bulkOnly && !decoded && !isNew && !useAlumdoorManufacturingStockEntryContext ? (
    <div className={V3_VIEW_SWITCHER_CLASS} role="navigation" aria-label={t("common.view", "Chế độ xem")}>
      <Button variant={bulkActive ? "ghost" : "secondary"} size="sm" className="h-8 rounded-md" onClick={() => {
        if (bulkActive && bulkDirty) { setConfirmBulkExit(true); return; }
        bridge.set({ view: null });
      }}><List /> Danh sách</Button>
      <Button variant={bulkActive ? "secondary" : "ghost"} size="sm" className="h-8 rounded-md" onClick={() => bridge.set({ view: "bulk" })}><Rows3 /> Nhập hàng loạt</Button>
    </div>
  ) : null;

  const detail = useAlumdoorManufacturingStockEntryContext && manufacturingPurpose ? (
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở phiếu kho sản xuất…</div>}>
      <AlumdoorManufacturingStockEntryCreate
        key={`alumdoor-stock-entry/${manufacturingWorkOrder}/${manufacturingPurpose}`}
        workOrder={manufacturingWorkOrder}
        purpose={manufacturingPurpose}
        onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
        onCancel={() => onNavigate(`${base}/${encodeURIComponent("Work Order")}/${encodeURIComponent(manufacturingWorkOrder)}`)}
        onNavigate={onNavigate}
      />
    </Suspense>
  ) : decoded ? (
    useAlumdoorSalesDetail ? (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở đơn hàng AlumDoor…</div>}>
        <AlumdoorSalesOrderCreate
          key={`${doctype}/${decoded}`}
          name={decoded}
          onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
          onSaved={() => {}}
          onPreviewCreated={(currentName) => onNavigate(printBase === "/print"
            ? buildPrintPath(doctype, currentName)
            : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(currentName)}`)}
          onCancel={() => onNavigate(listPath)}
        />
      </Suspense>
    ) : useAlumdoorProductionRequestDetail ? (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở yêu cầu sản xuất…</div>}>
        <AlumdoorProductionRequestDetail key={`alumdoor-production-request/${decoded}`} name={decoded} onNavigate={onNavigate} />
      </Suspense>
    ) : useAlumdoorWorkOrderDetail ? (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở phiếu sản xuất…</div>}>
        <AlumdoorWorkOrderDetail key={`alumdoor-work-order/${decoded}`} name={decoded} onNavigate={onNavigate} />
      </Suspense>
    ) : (
      <FormContainer
        key={`${doctype}/${decoded}`}
        doctype={doctype}
        name={decoded}
        onSaved={() => {}}
        onDeleted={() => onNavigate(listPath)}
        onDuplicate={() => onNavigate(`${listPath}/new`)}
        onRenamed={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
        onPrint={() => onNavigate(printBase === "/print" ? buildPrintPath(doctype, decoded) : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(decoded)}`)}
        onClose={() => onNavigate(listPath)}
      />
    )
  ) : isTree ? (
    <div className="grid h-full place-items-center bg-card px-6 text-center text-sm text-muted-foreground">{t("common.choose_prefix")} {displayTitle.toLocaleLowerCase("vi")}</div>
  ) : null;

  return (
    <>
      <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
        {modeTabs}
        <div className="min-h-0 flex-1">
          {bulkActive ? <BulkGridContainer doctype={doctype} bridge={bridge} title={displayTitle} onDirtyChange={setBulkDirty} /> : (
            <SplitView
              autoSaveId={`mf-split-v3-${doctype}`}
              hasDetail={isTree || Boolean(decoded) || useAlumdoorManufacturingStockEntryContext}
              contextTitle={decoded ?? (useAlumdoorManufacturingStockEntryContext ? manufacturingWorkOrder : undefined)}
              onCloseDetail={() => useAlumdoorManufacturingStockEntryContext
                ? onNavigate(`${base}/${encodeURIComponent("Work Order")}/${encodeURIComponent(manufacturingWorkOrder)}`)
                : onNavigate(listPath)}
              list={isTree ? (
                <TreeContainer doctype={doctype} title={displayTitle} selected={decoded} editable renameField={titleMeta.data?.title_field} onSelect={(nodeName) => onNavigate(`${listPath}/${encodeURIComponent(nodeName)}`)} />
              ) : (
                <ListContainer doctype={doctype} bridge={bridge} activeRow={decoded} onRowClick={(row) => onNavigate(`${listPath}/${encodeURIComponent(String(row.name))}`)} onCreate={() => onNavigate(`${listPath}/new`)} onSingle={() => { if (!decoded) onNavigate(`${listPath}/${encodeURIComponent(doctype)}`); }} />
              )}
              detail={detail}
              context={decoded ? (
                <ContextContainer key={`ctx-${doctype}/${decoded}`} doctype={doctype} name={decoded} aiSlot={props.contextAiSlot} onOpenConnection={(connection) => {
                  const filter = connection.fieldname && connection.value ? `?f_${encodeURIComponent(connection.fieldname)}=${encodeURIComponent(connection.value)}` : "";
                  onNavigate(`${base}/${encodeURIComponent(connection.doctype)}${filter}`);
                }} />
              ) : isTree ? <div className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">{t("common.empty")}</div> : null}
            />
          )}
        </div>
      </div>

      <Dialog open={confirmBulkExit} onOpenChange={setConfirmBulkExit}>
        <DialogContent className={V3_CONFIRM_DIALOG_CLASS}>
          <DialogHeader className="border-b border-border/70 bg-muted/30 px-5 py-4"><DialogTitle className="text-[15px] font-semibold tracking-tight">Bỏ thay đổi chưa lưu?</DialogTitle></DialogHeader>
          <div className="space-y-4 px-5 py-4"><p className="text-sm leading-6 text-muted-foreground">Bulk View đang có thay đổi chưa lưu. Chuyển về danh sách sẽ bỏ các chỉnh sửa này.</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setConfirmBulkExit(false)}>Tiếp tục chỉnh</Button><Button variant="destructive" onClick={() => { setConfirmBulkExit(false); setBulkDirty(false); bridge.set({ view: null }); }}>Bỏ thay đổi</Button></div></div>
        </DialogContent>
      </Dialog>

      <Dialog open={isNew} onOpenChange={(open) => { if (!open) setCloseRequest((value) => value + 1); }}>
        <DialogContent
          className={hasChildTable ? V3_FULL_CREATE_DIALOG_CLASS : V3_QUICK_ENTRY_DIALOG_CLASS}
          data-ui-version="v3"
          data-surface={useAlumdoorSalesCreate ? "alumdoor-sales-create" : hasChildTable ? "full-create" : "quick-entry"}
          onInteractOutside={(event) => {
            event.preventDefault();
            const target = event.detail?.originalEvent?.target;
            if (target instanceof Element && target.closest('[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]')) return;
            setCloseRequest((value) => value + 1);
          }}
          onEscapeKeyDown={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
        >
          <DialogHeader className={cn("shrink-0 border-b border-border/70 px-5 py-4", chromeFill, chromeText)}><DialogTitle className="text-xl font-semibold tracking-tight">{t("form.create_title_prefix")} {displayTitle.toLocaleLowerCase("vi")}</DialogTitle></DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            {useAlumdoorSalesCreate ? (
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn bán hàng AlumDoor…</div>}>
                <AlumdoorSalesOrderCreate closeRequest={closeRequest} onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)} onPreviewCreated={(newName) => onNavigate(printBase === "/print" ? buildPrintPath(doctype, newName) : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(newName)}`)} onCancel={() => onNavigate(listPath)} />
              </Suspense>
            ) : (
              <NewFormContainer doctype={doctype} fullWidth={hasChildTable} closeRequest={closeRequest} onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)} onPreviewCreated={(newName) => onNavigate(printBase === "/print" ? buildPrintPath(doctype, newName) : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(newName)}`)} onCancel={() => onNavigate(listPath)} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
