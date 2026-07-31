import type { NavItem } from "./AppShell.js";

export interface WorkspaceModule {
  key: string;
  label: string;
  items: NavItem[];
}

const DEFERRED_GROUPS = new Map<string, number>([
  ["Điều hành", 90],
  ["Hệ thống", 100],
]);

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
    if (!label) return;
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
      weight: DEFERRED_GROUPS.get(label) ?? 0,
    }))
    .sort((a, b) => a.weight - b.weight || a.sourceIndex - b.sourceIndex)
    .map(({ key, label, items }) => ({ key, label, items }));
}

export function findWorkspaceModule(modules: WorkspaceModule[], activeKey: string): WorkspaceModule | undefined {
  return modules.find((module) => module.items.some((item) => item.key === activeKey));
}

export function workspaceItemsForTabs(module: WorkspaceModule): NavItem[] {
  return module.items.filter((item) => item.key !== "__overview");
}
