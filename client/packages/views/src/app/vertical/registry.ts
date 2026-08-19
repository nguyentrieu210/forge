import type { DoctypeWorkspaceExtension } from "../workspace-extension.js";
import { alumdoorWorkspaceExtension } from "./alumdoor/workspace-extension.js";

/**
 * Điểm ráp vertical cho màn làm việc.
 *
 * `RuntimeDoctypeWorkspace` là thành phần dùng chung, không được biết app nào tên gì. Trước
 * đây nó import thẳng `alumdoorWorkspaceExtension` rồi so `runtimeApp === "alumdoor"` —
 * nghĩa là thêm vertical thứ hai phải sửa đúng file dùng chung đó.
 *
 * Ráp bằng import TĨNH chứ không để từng vertical tự gọi hàm đăng ký: kiểu tự đăng ký chỉ
 * chạy khi có ai đó nhớ import module vertical, quên một dòng là màn làm việc lặng lẽ mất
 * phần mở rộng mà không cổng nào đỏ. Bảng ở đây thì thiếu là hỏng lúc biên dịch.
 */
const VERTICAL_WORKSPACES: Record<string, DoctypeWorkspaceExtension> = {
  alumdoor: alumdoorWorkspaceExtension,
};

export function verticalWorkspaceExtension(appId?: string): DoctypeWorkspaceExtension | undefined {
  return appId ? VERTICAL_WORKSPACES[appId] : undefined;
}

export const verticalWorkspaceAppIds = Object.keys(VERTICAL_WORKSPACES);
