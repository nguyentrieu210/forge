import type { DoctypeWorkspaceExtension } from "../workspace-extension.js";

/**
 * Bảng vertical cho màn làm việc.
 *
 * `RuntimeDoctypeWorkspace` là thành phần dùng chung, không được biết app nào tên gì —
 * và giờ cũng không được import code của vertical nữa, vì vertical đã là package riêng
 * phụ thuộc ngược lại vào package này.
 *
 * Nạp package vertical CHÍNH LÀ hành động đăng ký nó. Chỗ dễ hỏng của kiểu này là quên
 * import: app sẽ chạy mà không có phần mở rộng, im lặng. Hai test canh đúng chỗ đó —
 * `vertical-registration.test.mjs` (nạp package thì bảng phải có) và một kiểm tra tĩnh rằng
 * app runtime có nạp package vertical.
 */
const VERTICAL_WORKSPACES = new Map<string, DoctypeWorkspaceExtension>();

export function registerVerticalWorkspace(appId: string, extension: DoctypeWorkspaceExtension): void {
  VERTICAL_WORKSPACES.set(appId.trim().toLowerCase(), extension);
}

export function verticalWorkspaceExtension(appId?: string): DoctypeWorkspaceExtension | undefined {
  return appId ? VERTICAL_WORKSPACES.get(appId.trim().toLowerCase()) : undefined;
}

export function registeredVerticalAppIds(): string[] {
  return [...VERTICAL_WORKSPACES.keys()].sort();
}
