/** @jsxImportSource react */
/**
 * TreeContainer — nối TreeView vào backend thật: adapter.treeChildren → frappe.desk.treeview.get_children.
 * Lazy đúng nghĩa: chỉ gọi server khi người dùng MỞ 1 node (cây tài khoản/kho nhiều nghìn node không
 * thể nạp hết một lần). Con đã nạp giữ trong state + cache react-query (fetchQuery) nên đóng/mở lại
 * không gọi server thêm lần nữa.
 *
 * Sửa cây (thêm/đổi tên/xoá) đi qua đúng API chuẩn của Frappe — không tự ghi thẳng vào bảng:
 * NestedSet giữ `lft`/`rgt` cho mỗi node, ghi tay là cây hỏng và mọi truy vấn "con cháu của X"
 * trả sai vĩnh viễn.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button, ConfirmDialog, Input, PromptDialog, toast, useT } from "@metaforge/ui";
import type { TreeNode } from "@metaforge/adapter-frappe";
import { useMetaForge } from "../container/provider.js";
import { TreeView, type TreeNodeItem } from "./TreeView.js";

export interface TreeContainerProps {
  doctype: string;
  title?: string;
  onSelect?: (name: string) => void;
  selected?: string;
  /** hiện cả node đã disable (mặc định ẩn, giống treeview chuẩn Frappe). */
  includeDisabled?: boolean;
  /** cho phép thêm/đổi tên/xoá node ngay trên cây. */
  editable?: boolean;
  /** giá trị điền sẵn khi tạo node mới (vd { company: "APH" }). */
  createDefaults?: Record<string, unknown>;
}

function toItem(n: TreeNode): TreeNodeItem {
  return { value: String(n.value), title: n.title, expandable: Boolean(n.expandable) };
}

type Pending =
  | { kind: "add"; parent: string; isRoot: boolean; asGroup: boolean }
  | { kind: "rename"; node: TreeNodeItem }
  | { kind: "delete"; node: TreeNodeItem };

type TreeUiState = {
  expanded: Set<string>;
  childrenMap: Record<string, TreeNodeItem[]>;
};

// SplitView chuyển từ list-only sang 3 cột khi chọn một node, nên nhánh list được
// remount. Giữ trạng thái cây theo DocType trong vòng đời ứng dụng để cú bấm đầu
// tiên vừa mở form vừa giữ nguyên nhánh vừa xổ.
const treeUiState = new Map<string, TreeUiState>();

export function TreeContainer({
  doctype, title, onSelect, selected, includeDisabled = false, editable = false, createDefaults,
}: TreeContainerProps) {
  const t = useT();
  const { adapter, scopeKey } = useMetaForge();
  const qc = useQueryClient();
  const stateKey = `${scopeKey}:${doctype}:${includeDisabled ? "all" : "active"}`;
  const cachedState = treeUiState.get(stateKey);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(cachedState?.expanded));
  const [childrenMap, setChildrenMap] = useState<Record<string, TreeNodeItem[]>>(
    () => ({ ...(cachedState?.childrenMap ?? {}) }),
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  // parent="" ⇒ get_children trả về node gốc (quy ước của treeview Frappe).
  const rootQ = useQuery({
    queryKey: [scopeKey, "tree", doctype, "", includeDisabled],
    queryFn: () => adapter.treeChildren(doctype, "", includeDisabled),
    enabled: Boolean(doctype),
  });

  const loadChildren = useCallback(async (value: string) => {
    try {
      const kids = await qc.fetchQuery({
        queryKey: [scopeKey, "tree", doctype, value, includeDisabled],
        queryFn: () => adapter.treeChildren(doctype, value, includeDisabled),
      });
      const latest = treeUiState.get(stateKey);
      const next = { ...(latest?.childrenMap ?? childrenMap), [value]: kids.map(toItem) };
      treeUiState.set(stateKey, {
        expanded: new Set(latest?.expanded ?? expanded).add(value),
        childrenMap: next,
      });
      setChildrenMap(next);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
      // Thu node lại khi nạp lỗi — nếu để mở, childrenOf() vẫn undefined và TreeView kẹt ở
      // "Đang tải…" vĩnh viễn, người dùng không biết là đã hỏng.
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(value);
        treeUiState.set(stateKey, { expanded: next, childrenMap });
        return next;
      });
    }
  }, [adapter, qc, scopeKey, doctype, includeDisabled, stateKey, expanded, childrenMap]);

  // Khi SplitView vừa chuyển sang 3 cột, TreeContainer mới phải nối tiếp request
  // lazy của nhánh đã mở thay vì chỉ hiện "Đang tải…" rồi đứng im.
  useEffect(() => {
    for (const value of expanded) {
      if (!childrenMap[value]) void loadChildren(value);
    }
  }, [expanded, childrenMap, loadChildren]);

  const onToggle = useCallback((value: string) => {
    const isOpen = expanded.has(value);
    const next = new Set(expanded);
    if (isOpen) next.delete(value); else next.add(value);
    treeUiState.set(stateKey, { expanded: next, childrenMap });
    setExpanded(next);
    // Gọi NGOÀI updater của setState: updater phải thuần (StrictMode chạy 2 lần ⇒ 2 request).
    // Đã có con rồi thì thôi — mở lại dùng luôn bản đã nạp.
    if (!isOpen && !childrenMap[value]) void loadChildren(value);
  }, [expanded, childrenMap, loadChildren, stateKey]);

  /** Nạp lại đúng nhánh vừa đổi, không nạp lại cả cây (cây kho có thể vài nghìn node). */
  const refreshBranch = useCallback(async (parent: string) => {
    await qc.invalidateQueries({ queryKey: [scopeKey, "tree", doctype] });
    if (parent) {
      setChildrenMap((m) => {
        const n = { ...m };
        delete n[parent];
        treeUiState.set(stateKey, { expanded, childrenMap: n });
        return n;
      });
      await loadChildren(parent);
    } else {
      await rootQ.refetch();
    }
  }, [qc, scopeKey, doctype, loadChildren, rootQ, stateKey, expanded]);

  const doAdd = async (name: string) => {
    if (pending?.kind !== "add") return;
    setBusy(true);
    try {
      await adapter.addTreeNodeReturning!({
        doctype,
        parent: pending.parent,
        is_root: pending.isRoot,
        // Frappe make_tree_args đọc `<doctype>_name` làm tên hiển thị của node mới.
        [`${doctype.toLowerCase().replace(/ /g, "_")}_name`]: name,
        // Tạo NHÓM hay LÁ. Nhóm chứa node con, lá chứa dữ liệu thật (hàng trong kho).
        is_group: pending.asGroup ? 1 : 0,
        ...createDefaults,
      });
      toast.success(t("tree.added"));
      // mở node cha ra để thấy ngay thứ vừa tạo
      if (pending.parent) {
        setExpanded((prev) => {
          const next = new Set(prev).add(pending.parent);
          treeUiState.set(stateKey, { expanded: next, childrenMap });
          return next;
        });
      }
      await refreshBranch(pending.parent);
      setPending(null);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally { setBusy(false); }
  };

  const doRename = async (newName: string) => {
    if (pending?.kind !== "rename") return;
    setBusy(true);
    try {
      await adapter.rename(doctype, pending.node.value, newName);
      toast.success(t("tree.renamed"));
      await refreshBranch("");
      setPending(null);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (pending?.kind !== "delete") return;
    setBusy(true);
    try {
      await adapter.deleteDoc(doctype, pending.node.value);
      toast.success(t("tree.deleted"));
      await refreshBranch("");
      setPending(null);
    } catch (e) {
      // Frappe chặn xoá node CÒN CON hoặc ĐÃ PHÁT SINH chứng từ — đó là bảo vệ đúng, hiện nguyên
      // thông báo của server thay vì diễn giải lại thành câu chung chung vô nghĩa.
      toast.error(adapter.mapError(e).message);
    } finally { setBusy(false); }
  };

  if (rootQ.isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (rootQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(rootQ.error).message}</div>;

  return (
    <div className="mf-tree-page flex h-full flex-col overflow-hidden bg-card">
      <div className="mf-page-head flex min-h-14 shrink-0 items-center gap-3 border-b px-5 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{title ?? doctype}</h1>
          <p className="text-xs text-muted-foreground">{t("tree.hint")}</p>
        </div>
        {editable ? (
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            onClick={() => setPending({ kind: "add", parent: "", isRoot: true, asGroup: true })}
          >
            <Plus className="mr-1 size-3.5" /> {t("tree.add_root")}
          </Button>
        ) : null}
      </div>

      <div className="mf-tree-toolbar flex shrink-0 items-center border-b px-4 py-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 w-full pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.search")}
            aria-label={t("common.search")}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <TreeView
          roots={(rootQ.data ?? [])
            .map(toItem)
            .filter((node) => !query.trim() || (node.title ?? node.value).toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")))}
          childrenOf={(value) => childrenMap[value]}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selected={selected}
          onAddChild={editable ? (parent) => setPending({ kind: "add", parent: parent.value, isRoot: false, asGroup: false }) : undefined}
          onRename={editable ? (node) => setPending({ kind: "rename", node }) : undefined}
          onDelete={editable ? (node) => setPending({ kind: "delete", node }) : undefined}
        />
      </div>

      <PromptDialog
        open={pending?.kind === "add"}
        onOpenChange={(o) => { if (!o && !busy) setPending(null); }}
        title={t("tree.add_title")}
        description={pending?.kind === "add" && pending.parent ? `${t("tree.add_under")} ${pending.parent}` : t("tree.add_root_desc")}
        label={t("tree.name_label")}
        confirmLabel={t("common.create")}
        onConfirm={(v) => void doAdd(v)}
      />
      <PromptDialog
        open={pending?.kind === "rename"}
        onOpenChange={(o) => { if (!o && !busy) setPending(null); }}
        title={t("tree.rename")}
        description={t("tree.rename_desc")}
        label={t("tree.name_label")}
        defaultValue={pending?.kind === "rename" ? pending.node.value : ""}
        confirmLabel={t("common.save")}
        onConfirm={(v) => void doRename(v)}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(o) => { if (!o && !busy) setPending(null); }}
        title={t("tree.delete_title")}
        description={pending?.kind === "delete" ? `${pending.node.title ?? pending.node.value} — ${t("tree.delete_desc")}` : ""}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}
