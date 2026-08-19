/** @jsxImportSource react */
/**
 * Generic DocType workspace: desktop dùng List | Form | Context,
 * mobile dùng một pane; tạo mới mở modal lớn. DocType có canonical Bulk policy
 * được thêm tab Nhập hàng loạt dùng chung renderer, không sinh page riêng theo từng nghiệp vụ.
 */
import { useMemo, useState, type ReactNode } from "react";
import { List, Rows3, X } from "lucide-react";
import { Button, ConfirmDialog, chromeFill, chromeText, cn, Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
import { buildPrintPath, resolveBulkRenderPolicy, resolveCreateSurface, type UrlStateBridge } from "./doctype-workspace-support.js";
import type { DoctypeWorkspaceExtension } from "./workspace-extension.js";
import { SplitView } from "../detail/SplitView.js";
import { ListRuntimeContainer } from "../list/ListRuntimeContainer.js";
import { BulkGridContainer } from "../bulk/BulkGridContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { ContextContainer } from "../container/ContextContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import {
  V3_DATA_SURFACE_CLASS,
  V3_FULL_CREATE_DIALOG_CLASS,
  V3_QUICK_ENTRY_DIALOG_CLASS,
  V3_VIEW_SWITCHER_CLASS,
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
  const bulkPolicy = useMemo(() => titleMeta.data ? resolveBulkRenderPolicy(titleMeta.data) : undefined, [titleMeta.data]);
  const bulkEnabled = Boolean(bulkPolicy?.enabled && !isTree);
  const bulkOnly = Boolean(bulkPolicy?.rowSource);
  const bulkActive = !decoded && !isNew && !extensionHasDetail && !extension?.suppressBulk
    && bulkEnabled && (bulkOnly || bridge.get("view") === "bulk");

  const modeTabs = bulkEnabled && !bulkOnly && !decoded && !isNew && !extensionHasDetail && !extension?.suppressBulk ? (
    <div className={V3_VIEW_SWITCHER_CLASS} role="navigation" aria-label={t("common.view", "Chế độ xem")}>
      <Button variant={bulkActive ? "ghost" : "secondary"} size="sm" className="h-8 rounded-md" onClick={() => {
        if (bulkActive && bulkDirty) { setConfirmBulkExit(true); return; }
        bridge.set({ view: null });
      }}><List /> Danh sách</Button>
      <Button variant={bulkActive ? "secondary" : "ghost"} size="sm" className="h-8 rounded-md" onClick={() => bridge.set({ view: "bulk" })}><Rows3 /> Nhập hàng loạt</Button>
    </div>
  ) : null;

  const detail = extension?.detail ?? (decoded ? (
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
  ) : isTree ? (
    <div className="grid h-full place-items-center bg-card px-6 text-center text-sm text-muted-foreground">{t("common.choose_prefix")} {displayTitle.toLocaleLowerCase("vi")}</div>
  ) : null);

  const requestCreateClose = () => setCloseRequest((value) => value + 1);

  return (
    <>
      <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
        {modeTabs}
        <div className="min-h-0 flex-1">
          {bulkActive ? <BulkGridContainer doctype={doctype} bridge={bridge} title={displayTitle} onDirtyChange={setBulkDirty} /> : (
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

      <ConfirmDialog
        open={confirmBulkExit}
        onOpenChange={setConfirmBulkExit}
        title="Bỏ thay đổi chưa lưu?"
        description="Bulk View đang có thay đổi chưa lưu. Chuyển về danh sách sẽ bỏ các chỉnh sửa này."
        cancelLabel="Tiếp tục chỉnh"
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => { setBulkDirty(false); bridge.set({ view: null }); }}
      />

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
            <DialogTitle className="pr-14 text-xl font-semibold tracking-tight">{t("form.create_title_prefix")} {displayTitle.toLocaleLowerCase("vi")}</DialogTitle>
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