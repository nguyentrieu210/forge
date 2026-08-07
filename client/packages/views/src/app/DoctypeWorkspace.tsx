/** @jsxImportSource react */
/**
 * Generic DocType workspace.
 *
 * The workspace now has one canonical operating surface: list/tree -> document form -> context.
 * There is no alternate Grid/Bulk view. Create uses quick-entry only when metadata explicitly
 * opts in; otherwise it opens the full document form.
 */
import { useMemo, useState, type ReactNode } from "react";
import { operationalViewPolicy } from "@metaforge/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, useT } from "@metaforge/ui";
import { useDoc, useMeta } from "../container/hooks.js";
import { useMetaForge } from "../container/provider.js";
import { SplitView } from "../detail/SplitView.js";
import { ListContainer } from "../container/ListContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";
import { ContextContainer } from "../container/ContextContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import type { UrlStateBridge } from "../list/useListState.js";
import { buildPrintPath } from "../print/printRoute.js";
import {
  V3_DATA_SURFACE_CLASS,
  V3_QUICK_ENTRY_DIALOG_CLASS,
} from "../data-surface/v3.js";

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
  const { adapter } = useMetaForge();
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
  const isSingle = titleMeta.data?.issingle === 1;
  const operationalPresentation = useMemo(
    () => titleMeta.data ? operationalViewPolicy(titleMeta.data)?.form?.presentation : undefined,
    [titleMeta.data],
  );
  const quickEntryEnabled = titleMeta.data?.viewPolicy?.quickEntry?.enabled === true
    && operationalPresentation !== "workspace"
    && operationalPresentation !== "full";

  const singleDocQ = useDoc(doctype, isSingle ? doctype : "");
  const singleError = singleDocQ.error ? adapter.mapError(singleDocQ.error) : null;
  const singleMissing = singleError?.kind === "not_found";

  if (isSingle) {
    if (singleDocQ.isLoading) {
      return (
        <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
          <div className="grid min-h-40 flex-1 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>
        </div>
      );
    }
    if (singleError && !singleMissing) {
      return (
        <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
          <div className="p-4 text-sm text-destructive" role="alert">{singleError.message}</div>
        </div>
      );
    }
    return (
      <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
        <div className="min-h-0 flex-1 overflow-auto">
          {singleMissing ? (
            <NewFormContainer
              doctype={doctype}
              presentation="page"
              onCreated={() => { void singleDocQ.refetch(); }}
            />
          ) : (
            <FormContainer
              key={`${doctype}/${doctype}`}
              doctype={doctype}
              name={doctype}
              onSaved={() => { void singleDocQ.refetch(); }}
            />
          )}
        </div>
      </div>
    );
  }

  if (isNew && !quickEntryEnabled) {
    return (
      <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
        <div className="min-h-0 flex-1 overflow-auto">
          <NewFormContainer
            doctype={doctype}
            presentation="page"
            onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
            onCancel={() => onNavigate(listPath)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={V3_DATA_SURFACE_CLASS} data-ui-version="v3" data-surface="doctype-workspace">
        <div className="min-h-0 flex-1">
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
        </div>
      </div>

      <Dialog open={isNew && quickEntryEnabled} onOpenChange={(open) => { if (!open) setCloseRequest((value) => value + 1); }}>
        <DialogContent
          className={V3_QUICK_ENTRY_DIALOG_CLASS}
          data-ui-version="v3"
          data-surface="quick-entry"
          onInteractOutside={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
          onEscapeKeyDown={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
        >
          <DialogHeader className="shrink-0 border-b border-border/70 bg-muted/30 px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold tracking-tight">{t("form.create_title_prefix")} {displayTitle.toLocaleLowerCase("vi")}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <NewFormContainer
              doctype={doctype}
              presentation="dialog"
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
