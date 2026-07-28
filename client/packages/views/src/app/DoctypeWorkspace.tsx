/** @jsxImportSource react */
/**
 * Generic DocType workspace: desktop dùng List | Form | Context,
 * mobile dùng một pane; tạo mới mở modal lớn.
 */
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
import { SplitView } from "../detail/SplitView.js";
import { ListContainer } from "../container/ListContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { ContextContainer } from "../container/ContextContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import type { UrlStateBridge } from "../list/useListState.js";

export interface DoctypeWorkspaceProps {
  doctype: string;
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
  const titleMeta = useMeta(props.doctype);
  const { doctype, name, onNavigate, bridge } = props;
  const base = props.base ?? "/app";
  const printBase = props.printBase ?? "/print";
  const listPath = `${base}/${doctype}`;
  const isNew = name === "new";
  const decoded = name && !isNew ? decodeURIComponent(name) : undefined;
  const isTree = titleMeta.data?.is_tree === 1;

  return (
    <>
      <SplitView
        autoSaveId={`mf-split-v3-${doctype}`}
        hasDetail={isTree || Boolean(decoded)}
        contextTitle={decoded}
        onCloseDetail={() => onNavigate(listPath)}
        list={isTree ? (
          <TreeContainer
            doctype={doctype}
            title={titleMeta.data?.label ?? doctype}
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
            onPrint={() => onNavigate(`${printBase}/${doctype}/${encodeURIComponent(decoded)}`)}
            onClose={() => onNavigate(listPath)}
          />
        ) : isTree ? (
          <div className="grid h-full place-items-center bg-card px-6 text-center text-sm text-muted-foreground">
            {t("common.choose_prefix")} {(titleMeta.data?.label ?? doctype).toLocaleLowerCase("vi")}
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

      <Dialog open={isNew} onOpenChange={(open) => { if (!open) setCloseRequest((value) => value + 1); }}>
        <DialogContent
          className="flex h-[min(92vh,900px)] w-[min(96vw,760px)] max-w-none flex-col overflow-hidden p-0"
          onInteractOutside={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
          onEscapeKeyDown={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
        >
          <DialogHeader className="shrink-0 border-b px-5 py-3">
            <DialogTitle>{t("form.create_title_prefix")} {(titleMeta.data?.label ?? doctype).toLocaleLowerCase("vi")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
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
