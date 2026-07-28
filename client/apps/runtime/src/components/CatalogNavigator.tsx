import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgeDollarSign,
  Boxes,
  FolderTree,
  Search,
  Users,
  Warehouse,
} from "lucide-react";
import { Button, Input } from "@metaforge/ui";

export interface CatalogNavigatorItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface CatalogNavigatorGroup {
  key: string;
  label: string;
  items: CatalogNavigatorItem[];
}

export interface CatalogNavigatorProps {
  groups: CatalogNavigatorGroup[];
  selectedKey?: string;
  onSelect: (item: CatalogNavigatorItem) => void;
}

const groupIcons: Record<string, ReactNode> = {
  "Hàng hoá & vật tư": <Boxes />,
  Kho: <Warehouse />,
  "Đối tác": <Users />,
  "Giá và chính sách": <BadgeDollarSign />,
  "Danh mục mở rộng": <FolderTree />,
};

function compactLabel(label: string): string {
  if (label === "Hàng hoá & vật tư") return "Vật tư";
  if (label === "Giá và chính sách") return "Giá";
  if (label === "Danh mục mở rộng") return "Khác";
  return label;
}

export function CatalogNavigator({ groups, selectedKey, onSelect }: CatalogNavigatorProps) {
  const selectedGroup = groups.find((group) => group.items.some((item) => item.key === selectedKey));
  const [activeGroup, setActiveGroup] = useState(selectedGroup?.key ?? groups[0]?.key ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (selectedGroup) setActiveGroup(selectedGroup.key);
  }, [selectedKey, selectedGroup?.key]);

  const current = groups.find((group) => group.key === activeGroup) ?? groups[0];
  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return current?.items ?? [];
    return (current?.items ?? []).filter((item) =>
      `${item.label} ${item.key}`.toLocaleLowerCase("vi").includes(normalized),
    );
  }, [current, query]);

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-card" aria-label="Điều hướng danh mục">
      <nav className="flex w-[76px] shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/25 p-2" aria-label="Nhóm danh mục">
        {groups.map((group) => {
          const active = current?.key === group.key;
          return (
            <Button
              key={group.key}
              type="button"
              variant={active ? "secondary" : "ghost"}
              className={`h-auto min-h-[58px] w-full flex-col gap-1 rounded-lg px-1 py-2 text-[11px] leading-tight ${
                active ? "bg-background text-primary shadow-sm" : "text-muted-foreground"
              }`}
              aria-pressed={active}
              title={group.label}
              onClick={() => {
                setActiveGroup(group.key);
                setQuery("");
              }}
            >
              <span className="[&_svg]:size-4">{groupIcons[group.label] ?? <FolderTree />}</span>
              <span className="line-clamp-2">{compactLabel(group.label)}</span>
            </Button>
          );
        })}
      </nav>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b px-3 py-3">
          <h1 className="truncate text-sm font-semibold">{current?.label ?? "Danh mục"}</h1>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-8 text-sm"
              placeholder="Tìm trong nhóm…"
              aria-label="Tìm trong nhóm danh mục"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" role="tree" aria-label={current?.label ?? "Danh mục"}>
          {items.map((item) => (
            <Button
              key={item.key}
              type="button"
              role="treeitem"
              variant={selectedKey === item.key ? "secondary" : "ghost"}
              className="mb-1 h-9 w-full justify-start gap-2 px-2.5 font-normal"
              aria-selected={selectedKey === item.key}
              onClick={() => onSelect(item)}
            >
              <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Button>
          ))}
          {!items.length ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">Không tìm thấy danh mục phù hợp.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
