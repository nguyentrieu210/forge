import { createElement, type ReactNode } from "react";
import { ICON_REGISTRY } from "./icon-registry.js";

/**
 * resolveIcon — tên chuỗi (manifest, serializable — P1-MANIFEST-01) → ReactNode lucide.
 *
 * Trước đây hàm này tra ĐỘNG qua `import * as LucideIcons from "lucide-react"`, để "gõ tên nào
 * cũng ra". Cái giá đo được trên app Kho: cả bộ ~1500 icon bị nhét vào bundle — 777 KB thô,
 * 135 KB sau gzip — chỉ để vẽ 36 cái icon. Tra động thì trình đóng gói không rung bỏ cây được.
 *
 * Nay tra qua danh bạ tĩnh (`icon-registry.ts`). Đổi lại phải khai tên icon mới trước khi dùng —
 * nhưng KHÔNG quay lại lỗi cũ mà review độc lập từng bắt (template CLI map tay 2 icon, tên khác
 * mất âm thầm, hiện rỗng không báo gì): ở đây tên lạ sẽ ghi cảnh báo rõ ràng ra console kèm
 * hướng dẫn sửa. Hỏng thì thấy ngay lúc phát triển thay vì lên tới người dùng.
 */
const warned = new Set<string>();

export function resolveIcon(name: string | undefined): ReactNode | undefined {
  if (!name) return undefined;

  const Comp = ICON_REGISTRY[name];
  if (Comp) return createElement(Comp);

  // Cảnh báo MỘT lần cho mỗi tên: nav vẽ lại nhiều lần, không làm ngập console.
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(
      `[MetaForge] Không có icon "${name}" trong danh bạ.\n` +
      `  Thêm vào packages/shell/src/icon-registry.ts:\n` +
      `    import { TenIconPascal } from "lucide-react";  →  "${name}": TenIconPascal`,
    );
  }
  return undefined;
}
