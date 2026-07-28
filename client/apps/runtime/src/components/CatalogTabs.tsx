import type { ReactNode } from "react";
import { Button } from "@metaforge/ui";

export interface CatalogTabItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface CatalogTabsProps {
  items: CatalogTabItem[];
  selectedKey?: string;
  onSelect: (item: CatalogTabItem) => void;
}

/**
 * Thanh danh mục treo ngay dưới topbar.
 *
 * Danh mục là đích điều hướng, không phải cây dữ liệu: mỗi mục là một tab trực tiếp,
 * không thêm lớp nhóm/dropdown. Khi không đủ ngang, cả thanh cuộn ngang nhưng tab đang
 * chọn vẫn giữ nguyên trạng thái.
 */
export function CatalogTabs({ items, selectedKey, onSelect }: CatalogTabsProps) {
  return (
    <div
      className="flex min-h-12 shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-3 py-1.5"
      role="tablist"
      aria-label="Danh mục"
    >
      <span className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Danh mục</span>
      {items.map((item) => (
        <Button
          key={item.key}
          type="button"
          role="tab"
          variant={selectedKey === item.key ? "secondary" : "ghost"}
          size="sm"
          className={`shrink-0 gap-1.5 ${selectedKey === item.key ? "text-primary shadow-sm" : ""}`}
          aria-selected={selectedKey === item.key}
          onClick={() => onSelect(item)}
        >
          <span className="shrink-0 [&_svg]:size-4">{item.icon}</span>
          {item.label}
        </Button>
      ))}
    </div>
  );
}
