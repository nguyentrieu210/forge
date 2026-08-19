import { registerVerticalWorkspace } from "@metaforge/views";
import { alumdoorWorkspaceExtension } from "./workspace-extension.js";

/**
 * Vertical AlumDoor: màn tác nghiệp riêng của xưởng nhôm (đơn bán, mua hàng, BOM, sản xuất).
 *
 * Trước đây 7325 dòng này nằm trong `@metaforge/views`, tức là app thứ hai dựng từ package
 * dùng chung vẫn kéo theo cả xưởng nhôm. Nay là package riêng, và nạp package NÀY chính là
 * hành động bật vertical lên — app nào cần thì import, app nào không thì không mang theo.
 */
registerVerticalWorkspace("alumdoor", alumdoorWorkspaceExtension);

export { alumdoorWorkspaceExtension };
