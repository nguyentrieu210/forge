/** @jsxImportSource react */
/**
 * TreeView (M09, presentational) — cây NestedSet lazy. Parent quản lý expanded + children đã nạp
 * (container gọi adapter.treeChildren khi mở). Đổi cha = updateDoc(parent_<dt>) (§10, container).
 */
import { useRef, type KeyboardEvent } from "react";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, FolderOpen, Folder, FolderPlus, Package } from "lucide-react";
import { cn, Button, useT } from "@metaforge/ui";

export interface TreeNodeItem {
  value: string;
  title?: string;
  /** có con (nhóm) → hiện mũi tên mở. */
  expandable?: boolean;
}

export interface TreeViewProps {
  /** node gốc. */
  roots: TreeNodeItem[];
  /** con đã nạp của 1 node (undefined = chưa nạp). */
  childrenOf: (value: string) => TreeNodeItem[] | undefined;
  expanded: Set<string>;
  onToggle: (value: string) => void;
  onSelect?: (value: string) => void;
  selected?: string;
  /** Thêm node con vào node này (chỉ hiện ở node NHÓM). */
  onAddChild?: (parent: TreeNodeItem) => void;
  /** Thêm một NHÓM con thay vì node lá. */
  onAddGroup?: (parent: TreeNodeItem) => void;
  /** Mở form sửa node. */
  onEdit?: (node: TreeNodeItem) => void;
  /** Xoá node. */
  onDelete?: (node: TreeNodeItem) => void;
  /** Đổi tên node. */
  onRename?: (node: TreeNodeItem) => void;
  /** Kéo node vào một nhóm khác; container vẫn reparent bằng API NestedSet chuẩn. */
  onMove?: (node: TreeNodeItem, newParent: TreeNodeItem) => void;
}

export function TreeView(props: TreeViewProps) {
  const typeahead = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTreeKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
    if (!current) return;
    const visible = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=treeitem]")];
    const index = visible.indexOf(current);
    if (index < 0) return;
    const focusAt = (next: number) => visible[Math.min(Math.max(next, 0), visible.length - 1)]?.focus();
    const value = current.dataset.treeValue ?? "";
    const node = findNode(props, value);
    const isOpen = props.expanded.has(value);
    const depth = Number(current.dataset.treeDepth ?? 0);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(visible.length - 1);
    } else if (event.key === "ArrowRight" && node?.expandable) {
      event.preventDefault();
      if (!isOpen) props.onToggle(node.value);
      else if (visible[index + 1] && Number(visible[index + 1]!.dataset.treeDepth ?? 0) > depth) focusAt(index + 1);
    } else if (event.key === "ArrowLeft") {
      if (node?.expandable && isOpen) {
        event.preventDefault();
        props.onToggle(node.value);
      } else {
        for (let at = index - 1; at >= 0; at -= 1) {
          if (Number(visible[at]!.dataset.treeDepth ?? 0) === depth - 1) {
            event.preventDefault();
            focusAt(at);
            break;
          }
        }
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeahead.current += event.key.toLocaleLowerCase("vi");
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => { typeahead.current = ""; }, 650);
      const ordered = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
      const match = ordered.find((item) => (item.dataset.treeLabel ?? "").startsWith(typeahead.current));
      if (match) {
        event.preventDefault();
        match.focus();
      }
    }
  };

  return (
    <div className="mf-tree-card mx-auto min-h-full w-full max-w-5xl overflow-auto rounded-md border bg-card p-2">
      <ul className="mf-tree" role="tree" onKeyDown={onTreeKeyDown}>
        {props.roots.map((n, index) => (
          <TreeNode key={n.value} node={n} depth={0} initialTabStop={index === 0} {...props} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode(props: TreeViewProps & { node: TreeNodeItem; depth: number; initialTabStop?: boolean }) {
  const t = useT();
  const { node, depth, childrenOf, expanded, onToggle, onSelect, selected } = props;
  const isOpen = expanded.has(node.value);
  const kids = isOpen ? childrenOf(node.value) : undefined;
  // Node NHÓM mới được thêm con — kho lá chứa hàng, không chứa kho khác.
  const isGroup = Boolean(node.expandable);
  const activateNode = () => {
    // Một lần bấm vào thư mục cha phải làm đủ hai việc: mở form chi tiết ở cột giữa
    // và bung nhánh con. Không tự đóng lại khi bấm dòng lần hai; thu gọn vẫn dành cho
    // nút mũi tên để tránh mất cây trong lúc người dùng đang sửa form.
    if (node.expandable && !isOpen) onToggle(node.value);
    onSelect?.(node.value);
  };

  return (
    <li className="mf-tree-li" role="none">
      <div
        className={cn(
          "group/node flex min-h-9 items-center gap-1 rounded px-2 py-1 hover:bg-accent/60 data-[drop-target=true]:bg-primary/10 data-[drop-target=true]:ring-1 data-[drop-target=true]:ring-primary",
          selected === node.value && "bg-accent font-medium shadow-[inset_2px_0_0_var(--primary)]",
        )}
        style={{ paddingLeft: depth * 16 }}
        role="treeitem"
        data-tree-value={node.value}
        data-tree-depth={depth}
        data-tree-label={(node.title ?? node.value).toLocaleLowerCase("vi")}
        aria-expanded={node.expandable ? isOpen : undefined}
        aria-selected={selected === node.value}
        aria-level={depth + 1}
        tabIndex={selected === node.value || (!selected && depth === 0 && props.initialTabStop) ? 0 : -1}
        onClick={(onSelect || node.expandable) ? activateNode : undefined}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateNode(); }
        }}
        draggable={Boolean(props.onMove)}
        onDragStart={props.onMove ? (event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-metaforge-tree-node", node.value);
        } : undefined}
        onDragOver={props.onMove && isGroup ? (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          event.currentTarget.dataset.dropTarget = "true";
        } : undefined}
        onDragLeave={props.onMove && isGroup ? (event) => {
          delete event.currentTarget.dataset.dropTarget;
        } : undefined}
        onDrop={props.onMove && isGroup ? (event) => {
          event.preventDefault();
          delete event.currentTarget.dataset.dropTarget;
          const sourceValue = event.dataTransfer.getData("application/x-metaforge-tree-node");
          const source = sourceValue === node.value ? undefined : findNode(props, sourceValue);
          if (source && !isDescendant(props, source.value, node.value)) props.onMove?.(source, node);
        } : undefined}
      >
        {node.expandable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-5"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.value);
            }}
            aria-label={isOpen ? t("tree.collapse") : t("tree.expand")}
          >
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        ) : (
          <span className="inline-block w-5" />
        )}
        {/* Biểu tượng phân biệt NHÓM với LÁ: nhìn cây kho phải thấy ngay chỗ nào chứa được hàng.
            Kho nhóm luôn có tồn = 0 (hàng nằm ở lá) — không phân biệt được thì người dùng chọn
            nhầm kho nhóm rồi tưởng kho trống. */}
        {isGroup
          ? (isOpen ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : <Folder className="size-3.5 shrink-0 text-muted-foreground" />)
          : <Package className="size-3.5 shrink-0 text-muted-foreground/70" />}
        <span
          className={cn("truncate text-sm", depth === 0 && "font-semibold", onSelect && "cursor-pointer hover:text-primary")}
        >
          {node.title ?? node.value}
        </span>

        {/* Hành động: ẩn cho tới khi rê chuột vào dòng — cây vài trăm node mà mỗi dòng ba nút thì
            rối không đọc nổi. Vẫn hiện khi focus bằng bàn phím. */}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/node:opacity-100">
          {props.onAddChild && isGroup ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6" onClick={(event) => { event.stopPropagation(); props.onAddChild!(node); }} aria-label={t("tree.add_child")} title={t("tree.add_child")}>
              <Plus className="size-3.5" />
            </Button>
          ) : null}
          {props.onAddGroup && isGroup ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6" onClick={(event) => { event.stopPropagation(); props.onAddGroup!(node); }} aria-label={t("tree.add_group", "Thêm nhóm con")} title={t("tree.add_group", "Thêm nhóm con")}>
              <FolderPlus className="size-3.5" />
            </Button>
          ) : null}
          {props.onRename ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6" onClick={(event) => { event.stopPropagation(); props.onRename!(node); }} aria-label={t("tree.rename")} title={t("tree.rename")}>
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
          {props.onDelete ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 text-muted-foreground hover:text-destructive" onClick={(event) => { event.stopPropagation(); props.onDelete!(node); }} aria-label={t("common.delete")} title={t("common.delete")}>
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </span>
      </div>
      {isOpen ? (
        kids === undefined ? (
          <div className="mf-tree-loading" style={{ paddingLeft: (depth + 1) * 16 }}>
            {t("common.loading")}
          </div>
        ) : (
          <ul className="mf-tree" role="group">
            {kids.map((c) => (
              <TreeNode key={c.value} {...props} node={c} depth={depth + 1} initialTabStop={false} />
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

function findNode(props: TreeViewProps, value: string): TreeNodeItem | undefined {
  const pending = [...props.roots];
  while (pending.length) {
    const item = pending.shift()!;
    if (item.value === value) return item;
    pending.push(...(props.childrenOf(item.value) ?? []));
  }
  return undefined;
}

function isDescendant(props: TreeViewProps, ancestor: string, candidate: string): boolean {
  const pending = [...(props.childrenOf(ancestor) ?? [])];
  while (pending.length) {
    const item = pending.shift()!;
    if (item.value === candidate) return true;
    pending.push(...(props.childrenOf(item.value) ?? []));
  }
  return false;
}
