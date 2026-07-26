/** @jsxImportSource react */
/**
 * TreeView (M09, presentational) — cây NestedSet lazy. Parent quản lý expanded + children đã nạp
 * (container gọi adapter.treeChildren khi mở). Đổi cha = updateDoc(parent_<dt>) (§10, container).
 */
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, FolderOpen, Folder, Package } from "lucide-react";
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
  /** Mở form sửa node. */
  onEdit?: (node: TreeNodeItem) => void;
  /** Xoá node. */
  onDelete?: (node: TreeNodeItem) => void;
  /** Đổi tên node. */
  onRename?: (node: TreeNodeItem) => void;
}

export function TreeView(props: TreeViewProps) {
  return (
    <div className="mf-view-card overflow-auto p-2">
      <ul className="mf-tree" role="tree">
        {props.roots.map((n) => (
          <TreeNode key={n.value} node={n} depth={0} {...props} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode(props: TreeViewProps & { node: TreeNodeItem; depth: number }) {
  const t = useT();
  const { node, depth, childrenOf, expanded, onToggle, onSelect, selected } = props;
  const isOpen = expanded.has(node.value);
  const kids = isOpen ? childrenOf(node.value) : undefined;
  // Node NHÓM mới được thêm con — kho lá chứa hàng, không chứa kho khác.
  const isGroup = Boolean(node.expandable);

  return (
    <li className="mf-tree-li" role="treeitem" aria-expanded={node.expandable ? isOpen : undefined}>
      <div
        className={cn(
          "group/node flex items-center gap-1 rounded-md px-1 py-1 hover:bg-accent/60",
          selected === node.value && "bg-accent",
        )}
        style={{ paddingLeft: depth * 16 }}
      >
        {node.expandable ? (
          <Button type="button" variant="ghost" size="icon-sm" className="size-5" onClick={() => onToggle(node.value)} aria-label={isOpen ? t("tree.collapse") : t("tree.expand")}>
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
          className={cn("truncate text-sm", onSelect && "cursor-pointer hover:text-primary")}
          onClick={onSelect ? () => onSelect(node.value) : undefined}
        >
          {node.title ?? node.value}
        </span>

        {/* Hành động: ẩn cho tới khi rê chuột vào dòng — cây vài trăm node mà mỗi dòng ba nút thì
            rối không đọc nổi. Vẫn hiện khi focus bằng bàn phím. */}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/node:opacity-100">
          {props.onAddChild && isGroup ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6" onClick={() => props.onAddChild!(node)} aria-label={t("tree.add_child")} title={t("tree.add_child")}>
              <Plus className="size-3.5" />
            </Button>
          ) : null}
          {props.onRename ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6" onClick={() => props.onRename!(node)} aria-label={t("tree.rename")} title={t("tree.rename")}>
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
          {props.onDelete ? (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => props.onDelete!(node)} aria-label={t("common.delete")} title={t("common.delete")}>
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
              <TreeNode key={c.value} {...props} node={c} depth={depth + 1} />
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}
