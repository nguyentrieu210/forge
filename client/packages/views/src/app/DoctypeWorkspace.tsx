/** @jsxImportSource react */
/**
 * Generic DocType workspace: desktop dùng List | Form | Context,
 * mobile dùng một pane; tạo mới mở modal lớn. DocType có canonical Bulk policy
 * được thêm tab Nhập hàng loạt dùng chung renderer, không sinh page riêng theo từng nghiệp vụ.
 */
import { useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { chromeFill, chromeText, cn, Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
import { buildPrintPath, resolveCreateSurface, type UrlStateBridge } from "./doctype-workspace-support.js";
import type { DoctypeWorkspaceExtension } from "./workspace-extension.js";
import { SplitView } from "../detail/SplitView.js";
import { ListRuntimeContainer } from "../list/ListRuntimeContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { ContextContainer } from "../container/ContextContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import {
  V3_DATA_SURFACE_CLASS,
  V3_FULL_CREATE_DIALOG_CLASS,
  V3_QUICK_ENTRY_DIALOG_CLASS,
} from "../data-surface/v3.js";

export interface DoctypeWorkspaceProps {
  doctype: string;
  title?: string;
  name?: string;
  onNavigate: (path: string) => void;
  bridge: UrlStateBridge;
  contextAiSlot?: ReactNode;
  base?: string;
  printBase?: string;
  /** Optional business extension; canonical List/Form remains the default. */
  extension?: DoctypeWorkspaceExtension;
}

export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const t = useT();
  const [closeRequest, setCloseRequest] = useState(0);
  const titleMeta = useMeta(props.doctype);
  const { doctype, name, onNavigate, bridge } = props;
  const base = props.base ?? "/app";
  const printBase = props.printBase ?? "/print";
  const displayTitle = props.title ?? titleMeta.data?.label ?? doctype;
  const listPath = `${base}/${doctype}`;
  const isNew = name === "new";
  const decoded = name && !isNew ? decodeURIComponent(name) : undefined;
  const isTree = titleMeta.data?.is_tree === 1;
  const extension = props.extension?.resolve({
    doctype,
    isNew,
    decoded,
    bridge,
    base,
    printBase,
    listPath,
    closeRequest,
    onNavigate,
  });
  const extensionHasDetail = Boolean(extension?.hasDetail || extension?.detail);

  const metadataCreateSurface = useMemo(() => resolveCreateSurface(titleMeta.data), [titleMeta.data]);
  const createSurface = extension?.createSurface ?? metadataCreateSurface;
  const useFullCreate = createSurface === "full";
  /**
   * THANH TAB "Danh sách / Nhập hàng loạt" ĐÃ GỠ — chủ dự án không dùng (2026-08-20).
   *
   * Gỡ ở đây chứ không chỉ tắt `viewPolicy.mobile.bulk.enabled`: chủ dự án yêu cầu bỏ hẳn khỏi
   * giao diện. `BulkGridContainer` vẫn còn nguyên trong repo — nó là code dùng chung, app khác
   * có thể đang cần; cái bị bỏ là LỐI VÀO từ màn doctype này.
   */

  /**
   * `?master_ui=generic` là cửa thoát MỘT CHIỀU do các workbench nghiệp vụ tự thêm nút để vào
   * (xem `resolveAlumdoorMasterWorkspace`). Form generic ở đây không biết workbench nào tồn tại
   * cho doctype hiện tại, nên chỉ cần trả `bridge` về trạng thái sạch — nếu có workbench, nó tự
   * xuất hiện lại; nếu không, đây là no-op vô hại.
   */
  const isGenericEscapeHatch = bridge.get("master_ui") === "generic";

  const detail = extension?.detail ?? (decoded ? (
    <div className="flex h-full min-h-0 flex-col">
      {isGenericEscapeHatch ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
          <span className="text-muted-foreground">Đang xem form đầy đủ.</span>
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => bridge.set({ master_ui: null })}
          >
            Quay lại giao diện rút gọn
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  ) : isTree ? (
    <div className="grid h-full place-items-center bg-card px-6 text-center text-sm text-muted-foreground">{t("common.choose_prefix")} {displayTitle.toLocaleLowerCase("vi")}</div>
  ) : null);

  const requestCreateClose = () => setCloseRequest((value) => value + 1);

  return (
    <>
      <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
        <div className="min-h-0 flex-1">
          {(
            <SplitView
              autoSaveId={`mf-split-v3-${doctype}`}
              hasDetail={isTree || Boolean(decoded) || extensionHasDetail}
              contextTitle={extension?.contextTitle ?? decoded}
              onCloseDetail={extension?.onCloseDetail ?? (() => onNavigate(listPath))}
              list={isTree ? (
                <TreeContainer doctype={doctype} title={displayTitle} selected={decoded} editable renameField={titleMeta.data?.title_field} onSelect={(nodeName) => onNavigate(`${listPath}/${encodeURIComponent(nodeName)}`)} />
              ) : (
                <ListRuntimeContainer
                  doctype={doctype}
                  bridge={bridge}
                  activeRow={decoded}
                  actions={extension?.listActions}
                  showAdvancedFilter={!props.extension?.suppressAdvancedFilter}
                  onRowClick={(row) => onNavigate(`${listPath}/${encodeURIComponent(String(row.name))}`)}
                  onCreate={() => onNavigate(`${listPath}/new`)}
                  onSingle={() => { if (!decoded) onNavigate(`${listPath}/${encodeURIComponent(doctype)}`); }}
                />
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

      <Dialog open={isNew} onOpenChange={(open) => { if (!open) requestCreateClose(); }}>
        <DialogContent
          hideClose={useFullCreate}
          className={useFullCreate ? V3_FULL_CREATE_DIALOG_CLASS : V3_QUICK_ENTRY_DIALOG_CLASS}
          data-ui-version="v3"
          data-surface={extension?.createDataSurface ?? (useFullCreate ? "full-create" : "quick-entry")}
          onInteractOutside={(event) => {
            event.preventDefault();
            const target = event.detail?.originalEvent?.target;
            if (target instanceof Element && target.closest('[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]')) return;
            requestCreateClose();
          }}
          onEscapeKeyDown={(event) => { event.preventDefault(); requestCreateClose(); }}
        >
          <DialogHeader className={cn("relative shrink-0 border-b border-border/70 px-5 py-4", chromeFill, chromeText)}>
            <DialogTitle className="pr-14 text-xl font-semibold tracking-tight">{t("form.create_title_prefix")} {(extension?.createTitle ?? displayTitle).toLocaleLowerCase("vi")}</DialogTitle>
            {useFullCreate ? (
              <button
                type="button"
                aria-label={t("common.close")}
                className="pointer-events-auto absolute right-4 top-1/2 z-[100] grid size-9 -translate-y-1/2 place-items-center rounded-md bg-background/80 text-foreground shadow-sm ring-1 ring-border/70 transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={requestCreateClose}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            ) : null}
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            {extension?.create ?? (
              <NewFormContainer doctype={doctype} fullWidth={useFullCreate} presentation={useFullCreate ? "page" : "dialog"} closeRequest={closeRequest} onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)} onPreviewCreated={(newName) => onNavigate(printBase === "/print" ? buildPrintPath(doctype, newName) : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(newName)}`)} onCancel={() => onNavigate(listPath)} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
