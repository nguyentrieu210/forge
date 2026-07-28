/** @jsxImportSource react */
/** Generic DocType workspace theo mô hình ERPNext Desk. */
import { useState, type ReactNode } from "react";
import { PanelRight, X } from "lucide-react";
import { Button, useT } from "@metaforge/ui";
import { useMeta } from "../container/hooks.js";
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
  const [contextOpen, setContextOpen] = useState(true);
  const titleMeta = useMeta(props.doctype);
  const { doctype, name, onNavigate, bridge } = props;
  const base = props.base ?? "/app";
  const printBase = props.printBase ?? "/print";
  const listPath = `${base}/${doctype}`;
  const isNew = name === "new";
  const decoded = name && !isNew ? decodeURIComponent(name) : undefined;
  const isTree = titleMeta.data?.is_tree === 1;

  if (isNew) {
    return (
      <div className="mf-doctype-page h-full overflow-hidden">
        <NewFormContainer
          doctype={doctype}
          presentation="page"
          onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
          onCancel={() => onNavigate(listPath)}
        />
      </div>
    );
  }

  if (decoded) {
    return (
      <div className="mf-document-workspace flex h-full min-w-0 overflow-hidden">
        <main className="min-w-0 flex-1">
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
            headerActions={!contextOpen ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setContextOpen(true)}>
                <PanelRight /> {t("split.activity")}
              </Button>
            ) : undefined}
          />
        </main>
        {contextOpen ? (
          <aside className="mf-form-sidebar hidden w-72 shrink-0 border-l bg-card xl:flex xl:flex-col">
            <div className="flex h-12 shrink-0 items-center border-b px-4">
              <span className="text-sm font-medium">{t("split.activity")}</span>
              <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setContextOpen(false)} aria-label={t("split.close_activity")}>
                <X />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <ContextContainer key={`ctx-${doctype}/${decoded}`} doctype={doctype} name={decoded} aiSlot={props.contextAiSlot} />
            </div>
          </aside>
        ) : null}
      </div>
    );
  }

  if (isTree) {
    return (
      <div className="mf-doctype-page h-full overflow-hidden">
        <TreeContainer
          doctype={doctype}
          title={titleMeta.data?.label ?? doctype}
          editable
          onSelect={(nodeName) => onNavigate(`${listPath}/${encodeURIComponent(nodeName)}`)}
        />
      </div>
    );
  }

  return (
    <div className="mf-doctype-page h-full overflow-hidden">
      <ListContainer
        doctype={doctype}
        bridge={bridge}
        onRowClick={(row) => onNavigate(`${listPath}/${encodeURIComponent(String(row.name))}`)}
        onCreate={() => onNavigate(`${listPath}/new`)}
        onSingle={() => onNavigate(`${listPath}/${encodeURIComponent(doctype)}`)}
      />
    </div>
  );
}
