import type { NavItem } from "./AppShell.js";

export interface WorkspaceModule {
  key: string;
  label: string;
  items: NavItem[];
}

const GLOBAL_GROUPS = new Set(["dieu hanh", "he thong", "bao cao", "danh muc"]);

function normalizedGroup(label: string): string {
  return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
}

export function isBusinessWorkspaceGroup(label: string | undefined): boolean {
  return Boolean(label?.trim()) && !GLOBAL_GROUPS.has(normalizedGroup(label!));
}

export function workspaceModuleKey(label: string): string {
  return `workspace-module:${label}`;
}

/**
 * Chuyển menu phẳng có `group` thành danh sách phân hệ.
 *
 * Thứ tự nghiệp vụ được giữ nguyên từ manifest. Hai nhóm nền tảng Điều hành/Hệ thống
 * được đặt sau các phân hệ nghiệp vụ để người dùng nhìn thấy công việc hằng ngày trước.
 */
export function buildWorkspaceModules(nav: NavItem[]): WorkspaceModule[] {
  const groups = new Map<string, { index: number; items: NavItem[] }>();
  nav.forEach((item, index) => {
    const label = item.group?.trim();
    if (!label || !isBusinessWorkspaceGroup(label)) return;
    const current = groups.get(label);
    if (current) current.items.push(item);
    else groups.set(label, { index, items: [item] });
  });

  return [...groups.entries()]
    .map(([label, value]) => ({
      key: workspaceModuleKey(label),
      label,
      items: value.items,
      sourceIndex: value.index,
    }))
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(({ key, label, items }) => ({ key, label, items }));
}

export function findWorkspaceModule(modules: WorkspaceModule[], activeKey: string): WorkspaceModule | undefined {
  return modules.find((module) => module.items.some((item) => item.key === activeKey));
}

export function workspaceItemsForTabs(module: WorkspaceModule): NavItem[] {
  return module.items.filter((item) => item.key !== "__overview");
}
