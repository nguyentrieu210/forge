/** @jsxImportSource react */
/**
 * Workspace riêng cho danh mục:
 *   CatalogNavigator | List/EntityTree | Form
 *
 * Không ghép CatalogNavigator vào TreeView. TreeView là cây dữ liệu NestedSet có lazy
 * loading + CRUD; CatalogNavigator chỉ điều hướng metadata. Hai thứ dùng chung ngôn ngữ
 * thị giác nhưng có vòng đời và hành vi hoàn toàn khác nhau.
 */
import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useT,
} from "@metaforge/ui";
import type { UrlStateBridge } from "../list/useListState.js";
import { useBreakpoint } from "../detail/SplitView.js";
import { useMeta } from "../container/hooks.js";
import { ListContainer } from "../container/ListContainer.js";
import { TreeContainer } from "../tree/TreeContainer.js";
import { FormContainer } from "../container/FormContainer.js";
import { NewFormContainer } from "../container/NewFormContainer.js";

export interface MasterDataWorkspaceProps {
  navigator: ReactNode;
  doctype?: string;
  name?: string;
  label?: string;
  bridge: UrlStateBridge;
  onNavigate: (path: string) => void;
  base?: string;
  printBase?: string;
}

export function MasterDataWorkspace(props: MasterDataWorkspaceProps) {
  const t = useT();
  const breakpoint = useBreakpoint();
  const [closeRequest, setCloseRequest] = useState(0);
  const { doctype, name, onNavigate, bridge } = props;
  const metaQ = useMeta(doctype ?? "");
  const base = props.base ?? "/master-data";
  const printBase = props.printBase ?? "/print";
  const listPath = doctype ? `${base}/${encodeURIComponent(doctype)}` : base;
  const isNew = name === "new";
  const decoded = name && !isNew ? decodeURIComponent(name) : undefined;
  const isTree = metaQ.data?.is_tree === 1;
  const title = props.label ?? metaQ.data?.label ?? doctype ?? "Danh mục";

  const emptyList = (
    <div className="grid h-full place-items-center bg-card px-6 text-center">
      <div>
        <p className="text-sm font-medium">Chọn một danh mục</p>
        <p className="mt-1 text-xs text-muted-foreground">Danh sách hoặc cây dữ liệu sẽ hiện tại đây.</p>
      </div>
    </div>
  );

  const records = doctype ? (
    isTree ? (
      <TreeContainer
        doctype={doctype}
        title={title}
        selected={decoded}
        editable
        renameField={metaQ.data?.title_field}
        onSelect={(nodeName) => onNavigate(`${listPath}/${encodeURIComponent(nodeName)}`)}
      />
    ) : (
      <ListContainer
        doctype={doctype}
        bridge={bridge}
        activeRow={decoded}
        onRowClick={(row) => onNavigate(`${listPath}/${encodeURIComponent(String(row.name))}`)}
        onCreate={() => onNavigate(`${listPath}/new`)}
        onSingle={() => {
          if (!decoded && !isNew) onNavigate(`${listPath}/${encodeURIComponent(doctype)}`);
        }}
      />
    )
  ) : emptyList;

  const detail = doctype ? (
    isNew ? (
      <NewFormContainer
        key={`new/${doctype}`}
        doctype={doctype}
        presentation="page"
        closeRequest={closeRequest}
        onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
        onCancel={() => onNavigate(listPath)}
      />
    ) : decoded ? (
      <FormContainer
        key={`${doctype}/${decoded}`}
        doctype={doctype}
        name={decoded}
        onSaved={() => {}}
        onDeleted={() => onNavigate(listPath)}
        onDuplicate={() => onNavigate(`${listPath}/new`)}
        onRenamed={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
        onPrint={() => onNavigate(`${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(decoded)}`)}
        onClose={() => onNavigate(listPath)}
      />
    ) : (
      <div className="grid h-full place-items-center bg-card px-6 text-center">
        <div>
          <p className="text-sm font-medium">Chọn một bản ghi</p>
          <p className="mt-1 text-xs text-muted-foreground">Form chi tiết sẽ mở tại cột này.</p>
        </div>
      </div>
    )
  ) : (
    <div className="grid h-full place-items-center bg-muted/15 px-6 text-center">
      <p className="text-xs text-muted-foreground">Sau khi chọn danh mục, hãy chọn một bản ghi để xem chi tiết.</p>
    </div>
  );

  if (breakpoint === "desktop") {
    return (
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="mf-master-data-workspace-v1"
        className="h-full overflow-hidden rounded-xl border bg-card shadow-sm"
      >
        <ResizablePanel defaultSize={24} minSize={18} maxSize={32} className="min-w-0">
          {props.navigator}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={34} minSize={25} maxSize={46} className="min-w-0">
          {records}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={42} minSize={30} className="min-w-0">
          {detail}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  if (breakpoint === "tablet") {
    return (
      <div className="flex h-full overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="w-[260px] shrink-0 border-r">{props.navigator}</div>
        <div className="min-w-0 flex-1">
          {name ? (
            <div className="flex h-full flex-col">
              <div className="shrink-0 border-b px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => onNavigate(listPath)}>
                  <ArrowLeft /> {t("split.list")}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{detail}</div>
            </div>
          ) : records}
        </div>
      </div>
    );
  }

  if (!doctype) return <div className="h-full overflow-hidden bg-card">{props.navigator}</div>;
  if (!name) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-card">
        <div className="shrink-0 border-b px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => onNavigate(base)}>
            <ArrowLeft /> Danh mục
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{records}</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="shrink-0 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (isNew) setCloseRequest((value) => value + 1);
            else onNavigate(listPath);
          }}
        >
          <ArrowLeft /> {t("split.list")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{detail}</div>
    </div>
  );
}
