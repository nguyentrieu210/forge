/** @jsxImportSource react */
/**
 * DoctypeWorkspace (Gate 7) — màn làm việc GENERIC cho 1 DocType: SplitView(list | form | context)
 * driven bởi doctype + name. Đây là phần điều phối tái dùng cho MỌI app (demo + app sinh ra),
 * KHÔNG copy: app chỉ cấp doctype/name + hàm điều hướng + bridge URL-state + (tuỳ chọn) slot AI.
 * Routing/shell do app quyết; đây thuần orchestration container.
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
  /** undefined = chỉ list · "new" = form tạo mới · còn lại = form + context của record. */
  name?: string;
  /** điều hướng: nhận path tuyệt đối ("/app/<dt>", "/app/<dt>/<name>", "/app/<dt>/new"). */
  onNavigate: (path: string) => void;
  bridge: UrlStateBridge;
  /** slot AI cho context panel (app-specific, tuỳ chọn). */
  contextAiSlot?: ReactNode;
  /** prefix route (mặc định "/app"). */
  base?: string;
  /** prefix route xem bản in (mặc định "/print") — app phải tự đăng ký Route + PrintContainer. */
  printBase?: string;
}

export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const t = useT();
  const [closeRequest, setCloseRequest] = useState(0);
  // Tiêu đề modal lấy LABEL đã dịch của doctype (getMeta chạy label qua frappe._), không dùng tên
  // kỹ thuật — trước đây hiện "Tạo Purchase Receipt" giữa giao diện tiếng Việt.
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
        autoSaveId={`mf-split-${doctype}`}
        hasDetail={Boolean(decoded)}
        contextTitle={decoded}
        onCloseDetail={() => onNavigate(listPath)}
        list={
          isTree ? (
            <div className="h-full overflow-auto rounded-lg border bg-card p-3">
              <TreeContainer
                doctype={doctype}
                selected={decoded}
                editable
                onSelect={(nodeName) => onNavigate(`${listPath}/${encodeURIComponent(nodeName)}`)}
              />
            </div>
          ) : (
            <ListContainer
              doctype={doctype}
              bridge={bridge}
              activeRow={decoded}
              onRowClick={(r) => onNavigate(`${listPath}/${encodeURIComponent(String(r.name))}`)}
              onCreate={() => onNavigate(`${listPath}/new`)}
              onSingle={() => { if (!decoded) onNavigate(`${listPath}/${encodeURIComponent(doctype)}`); }}
            />
          )
        }
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
        ) : null}
        context={decoded ? <ContextContainer key={`ctx-${doctype}/${decoded}`} doctype={doctype} name={decoded} aiSlot={props.contextAiSlot} /> : null}
      />

      {/* Bấm ra ngoài / Esc / nút X đều ĐÓNG được. preventDefault ở đây KHÔNG phải để chặn đóng mà
          để nhường quyền quyết định cho NewFormContainer: chưa nhập gì thì nó đóng luôn, đang nhập
          dở thì nó hỏi xác nhận. Nếu để Radix tự đóng thì dữ liệu đang gõ mất trắng không báo. */}
      <Dialog open={isNew} onOpenChange={(open) => { if (!open) setCloseRequest((n) => n + 1); }}>
        <DialogContent
          /**
           * Rộng theo MÀN HÌNH, không theo một con số cố định.
           *
           * 920px vừa đủ cho một form chỉ có ô nhập, nhưng chứng từ mua bán nào cũng có
           * BẢNG DÒNG HÀNG: sáu bảy cột nhét vào 920px trừ đi lề thì cột nào cũng chật, mã
           * hàng bị cắt, và người nhập phải cuộn ngang cho một việc làm mỗi ngày. Màn hình
           * làm việc thật rộng 1440–1920px — dùng chỗ đó. `min()` giữ nguyên hành vi trên
           * máy nhỏ: hẹp hơn 1400px thì vẫn là 96% bề ngang như trước.
           */
          className="flex h-[min(92vh,900px)] w-[min(94vw,1180px)] max-w-none flex-col overflow-hidden p-0"
          onInteractOutside={(e) => { e.preventDefault(); setCloseRequest((n) => n + 1); }}
          onEscapeKeyDown={(e) => { e.preventDefault(); setCloseRequest((n) => n + 1); }}
        >
          <DialogHeader className="shrink-0 border-b px-5 py-3">
            <DialogTitle>{t("form.create_title_prefix")} {(titleMeta.data?.label ?? doctype).toLocaleLowerCase("vi")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <NewFormContainer
              doctype={doctype}
              closeRequest={closeRequest}
              onCreated={(n) => onNavigate(`${listPath}/${encodeURIComponent(n)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
