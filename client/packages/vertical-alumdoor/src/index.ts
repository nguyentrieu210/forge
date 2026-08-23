import { registerVerticalWorkspace } from "@metaforge/views";
import { alumdoorWorkspaceExtension } from "./combined-workspace-extension.js";

/**
 * Vertical AlumDoor: màn tác nghiệp riêng của xưởng nhôm (đơn bán, mua hàng, BOM, sản xuất)
 * cộng các Master Workbench chỉ dành cho những danh mục vượt quá CRUD thông thường.
 *
 * Generic runtime vẫn là mặc định. `combined-workspace-extension` chỉ compose hai lớp override:
 * master-workspaces trước, operational workspaces sau; cả hai đều fall-through về generic khi
 * không nhận route hiện tại.
 */
registerVerticalWorkspace("alumdoor", alumdoorWorkspaceExtension);

export { alumdoorWorkspaceExtension };

/**
 * Báo cáo công nợ KHÔNG gắn vào một DocType nào nên không đi qua `alumdoorWorkspaceExtension`;
 * nó là một experience do runtime tự mở. `package.json` chỉ mở đúng subpath `"."`, nên muốn
 * `client/apps/runtime` nạp được thì phải lộ ra ở đây.
 */
export { AlumdoorDebtWorkbench } from "./AlumdoorDebtWorkbench.js";
