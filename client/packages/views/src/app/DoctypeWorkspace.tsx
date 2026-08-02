/** @jsxImportSource react */
/**
 * Generic DocType workspace: desktop dùng List | Form | Context,
 * mobile dùng một pane; tạo mới mở modal lớn. DocType có canonical Bulk policy
 * được thêm tab Nhập hàng loạt dùng chung renderer, không sinh page riêng theo từng nghiệp vụ.
 */
import { useMemo, useState, type ReactNode } from "react";
import { List, Rows3 } from "lucide-react";
import { resolveBulkRenderPolicy } from "@metaforge/core";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
import { SplitView } from "../detail/SplitView.js";
import { ListContainer } from "../container/ListContainer.js";
import { BulkGridContainer } from "../bulk/BulkGridContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { ContextContainer } from "../container/ContextContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import type { UrlStateBridge } from "../list/useListState.js";
import { buildPrintPath } from "../print/printRoute.js";

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
  const bulkPolicy = useMemo(() => titleMeta.data ? resolveBulkRenderPolicy(titleMeta.data) : undefined, [titleMeta.data]);
  const bulkEnabled = Boolean(bulkPolicy?.enabled && !isTree);
  const isPriceListManager = doctype === "Item Price";
  const bulkActive = !decoded && !isNew && (isPriceListManager || (bulkEnabled && bridge.get("view") === "bulk"));

  const modeTabs = bulkEnabled && !decoded && !isNew && !isPriceListManager ? (
    <div className="flex shrink-0 items-center gap-1 border-b bg-card px-3 py-2">
      <Button
        variant={bulkActive ? "ghost" : "secondary"}
        size="sm"
        className="h-8"
        onClick={() => {
          if (bulkActive && bulkDirty) {
            setConfirmBulkExit(true);
            return;
          }
          bridge.set({ view: null });
        }}
      >
        <List /> Danh sách
      </Button>
      <Button
        variant={bulkActive ? "secondary" : "ghost"}
        size="sm"
        className="h-8"
        onClick={() => bridge.set({ view: "bulk" })}
      >
        <Rows3 /> Nhập hàng loạt
      </Button>
    </div>
  ) : null;

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        {modeTabs}
        <div className="min-h-0 flex-1">
          {bulkActive ? (
            <BulkGridContainer doctype={doctype} bridge={bridge} title={displayTitle} onDirtyChange={setBulkDirty} />
          ) : (
            <SplitView
              autoSaveId={`mf-split-v3-${doctype}`}
              hasDetail={isTree || Boolean(decoded)}
              contextTitle={decoded}
              onCloseDetail={() => onNavigate(listPath)}
              list={isTree ? (
                <TreeContainer
                  doctype={doctype}
                  title={displayTitle}
                  selected={decoded}
                  editable
                  renameField={titleMeta.data?.title_field}
                  onSelect={(nodeName) => onNavigate(`${listPath}/${encodeURIComponent(nodeName)}`)}
                />
              ) : (
                <ListContainer
                  doctype={doctype}
                  bridge={bridge}
                  activeRow={decoded}
                  onRowClick={(row) => onNavigate(`${listPath}/${encodeURIComponent(String(row.name))}`)}
                  onCreate={() => onNavigate(`${listPath}/new`)}
                  onSingle={() => { if (!decoded) onNavigate(`${listPath}/${encodeURIComponent(doctype)}`); }}
                />
              )}
              detail={decoded ? (
                <FormContainer
                  key={`${doctype}/${decoded}`}
                  doctype={doctype}
                  name={decoded}
                  onSaved={() => {}}
                  onDeleted={() => onNavigate(listPath)}
                  onDuplicate={() => onNavigate(`${listPath}/new`)}
                  onRenamed={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
                  onPrint={() => onNavigate(printBase === "/print"
                    ? buildPrintPath(doctype, decoded)
                    : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(decoded)}`)}
                  onClose={() => onNavigate(listPath)}
                />
              ) : isTree ? (
                <div className="grid h-full place-items-center bg-card px-6 text-center text-sm text-muted-foreground">
                  {t("common.choose_prefix")} {displayTitle.toLocaleLowerCase("vi")}
                </div>
              ) : null}
              context={decoded ? (
                <ContextContainer
                  key={`ctx-${doctype}/${decoded}`}
                  doctype={doctype}
                  name={decoded}
                  aiSlot={props.contextAiSlot}
                  onOpenConnection={(connection) => {
                    const filter = connection.fieldname && connection.value
                      ? `?f_${encodeURIComponent(connection.fieldname)}=${encodeURIComponent(connection.value)}`
                      : "";
                    onNavigate(`${base}/${encodeURIComponent(connection.doctype)}${filter}`);
                  }}
                />
              ) : isTree ? (
                <div className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">
                  {t("common.empty")}
                </div>
              ) : null}
            />
          )}
        </div>
      </div>

      <Dialog open={confirmBulkExit} onOpenChange={setConfirmBulkExit}>
        <DialogContent className="w-[min(92vw,430px)] max-w-none">
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            Bulk View đang có thay đổi chưa lưu. Chuyển về danh sách sẽ bỏ các chỉnh sửa này.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmBulkExit(false)}>Tiếp tục chỉnh</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmBulkExit(false);
                setBulkDirty(false);
                bridge.set({ view: null });
              }}
            >
              Bỏ thay đổi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isNew} onOpenChange={(open) => { if (!open) setCloseRequest((value) => value + 1); }}>
        <DialogContent
          className="top-6 md:top-10 flex max-h-[calc(100dvh-4rem)] w-[min(96vw,920px)] max-w-none !translate-y-0 flex-col overflow-y-auto rounded-2xl border shadow-2xl p-0"
          onInteractOutside={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
          onEscapeKeyDown={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
        >
          <DialogHeader className="sticky top-0 z-30 shrink-0 border-b bg-card px-5 py-3.5">
            <DialogTitle className="text-base font-semibold">{t("form.create_title_prefix")} {displayTitle.toLocaleLowerCase("vi")}</DialogTitle>
          </DialogHeader>
          <div className="w-full min-w-0">
            <NewFormContainer
              doctype={doctype}
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
