import type { ReactNode } from "react";
import type { ListRuntimeAction } from "../list/runtime-actions.js";
import type { UrlStateBridge } from "../list/useListState.js";

/**
 * Extension point for business workbenches that intentionally replace the canonical CRUD surface.
 * Generic CRUD remains the default; vertical behavior is registered at the composition edge.
 */
export interface DoctypeWorkspaceExtensionContext {
  doctype: string;
  isNew: boolean;
  decoded?: string;
  bridge: UrlStateBridge;
  base: string;
  printBase: string;
  listPath: string;
  closeRequest: number;
  onNavigate: (path: string) => void;
}

export interface DoctypeWorkspaceExtensionResolution {
  detail?: ReactNode;
  create?: ReactNode;
  hasDetail?: boolean;
  contextTitle?: string;
  onCloseDetail?: () => void;
  suppressBulk?: boolean;
  createSurface?: "quick" | "full";
  createDataSurface?: string;
  /** Business-specific actions injected into the canonical list selection runtime. */
  listActions?: ListRuntimeAction[];
}

export interface DoctypeWorkspaceExtension {
  id: string;
  /**
   * Ẩn nút "Bộ lọc nâng cao" trên MỌI màn danh sách của app đăng ký extension này.
   * Cờ đặt ở cấp app chứ không ở `resolve()` vì phạm vi là toàn app, không phải từng DocType —
   * để ở `resolve()` thì mọi DocType thường (vốn cố ý trả `undefined` để rơi về CRUD chuẩn)
   * sẽ phải trả về một object chỉ để mang cờ, làm hỏng ngữ nghĩa fall-through.
   */
  suppressAdvancedFilter?: boolean;
  resolve(context: DoctypeWorkspaceExtensionContext): DoctypeWorkspaceExtensionResolution | undefined;
}
