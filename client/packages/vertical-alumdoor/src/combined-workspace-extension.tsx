/** @jsxImportSource react */
import type { DoctypeWorkspaceExtension } from "@metaforge/views";
import { resolveAlumdoorMasterWorkspace } from "./master-workspaces/registry.js";
import { alumdoorWorkspaceExtension as operationalWorkspaceExtension } from "./workspace-extension.js";

/**
 * Composition edge của vertical Alumdoor.
 *
 * Danh mục phức tạp được thử trước. Nếu registry không nhận DocType/route đó thì toàn bộ
 * workbench giao dịch cũ vẫn chạy nguyên trạng; cuối cùng chính extension cũ tiếp tục trả
 * undefined cho DocType CRUD bình thường để runtime generic xử lý.
 *
 * Nhờ vậy có đúng MỘT extension đăng ký với @metaforge/views, nhưng bên trong chia được hai
 * trách nhiệm rõ ràng: master workbench và operational workbench.
 */
export const alumdoorWorkspaceExtension: DoctypeWorkspaceExtension = {
  id: operationalWorkspaceExtension.id,
  suppressAdvancedFilter: operationalWorkspaceExtension.suppressAdvancedFilter,
  resolve(context) {
    return resolveAlumdoorMasterWorkspace(context) ?? operationalWorkspaceExtension.resolve(context);
  },
};
