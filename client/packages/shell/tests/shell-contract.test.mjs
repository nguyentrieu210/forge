import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Ghim ranh giới shell sau khi chôn tầng UI V3.
 *
 * Bối cảnh: Forge từng ship trọn chương trình "UI V3" rồi revert bằng `cf5dd0da5`, nhưng phần
 * bị revert KHÔNG được gỡ khỏi cây code. Tới lúc rà soát vẫn còn `ShellV3Chrome.tsx` (716 dòng,
 * 0 nơi import, không export khỏi `index.ts`), `workspace-tab-state.ts` (148 dòng, 0 consumer)
 * và 13 prop V3 trên `AppShellProps` tự chú thích "V2 does not render these".
 *
 * Nguy hiểm hơn cả code chết: `AppShell.tsx` và `AppShellV2.tsx` KHAI ĐỘC LẬP cùng bốn kiểu
 * (`NavItem`, `Breadcrumb`, `NotificationItem`, `AppShellProps`) rồi nối nhau bằng
 * `<V2AppShell {...props} />`. TypeScript nhận theo cấu trúc nên hai bản trôi dạt bao nhiêu
 * cũng không ai báo — đúng họ với `resolveNavPath` chép thiếu `encodeURIComponent` trước đây.
 *
 * Test này giữ hai tính chất, không phải đếm dòng:
 *   1. Hợp đồng shell chỉ được khai ĐÚNG MỘT LẦN.
 *   2. Không tên nào của tầng V3 quay lại package.
 */

const SHELL_SRC = path.resolve(import.meta.dirname, "..", "src");

/** Tên chỉ tồn tại trong tầng V3 đã revert. Quay lại nghĩa là ai đó hồi sinh xác. */
const V3_ONLY_NAMES = [
  "ShellV3Chrome",
  "workspace-tab-state",
  "railNav",
  "activeRailKey",
  "onRailNavigate",
  "workspaceTabs",
  "workspaceActiveKey",
  "onWorkspaceTabNavigate",
  "onWorkspaceTabClose",
  "onWorkspaceTabPin",
  "onWorkspaceTabRefresh",
  "onWorkspaceTabReorder",
  "onWorkspaceTabDuplicate",
];

/** Hợp đồng công khai của shell — mỗi cái đúng một nhà. */
const CONTRACT_TYPES = ["AppShellProps", "NavItem", "Breadcrumb", "NotificationItem"];

function sources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push([path.relative(SHELL_SRC, full).split(path.sep).join("/"), readFileSync(full, "utf8")]);
      }
    }
  };
  walk(SHELL_SRC);
  return files;
}

test("hợp đồng shell chỉ được khai một lần, không có bản sao để trôi dạt", () => {
  const files = sources();
  for (const type of CONTRACT_TYPES) {
    const declaredIn = files
      .filter(([, code]) => new RegExp(`^export (interface|type) ${type}\\b`, "m").test(code))
      .map(([file]) => file);
    assert.deepEqual(
      declaredIn,
      ["AppShellV2.tsx"],
      `${type} phải khai đúng một lần ở AppShellV2.tsx, đang thấy ở: ${declaredIn.join(", ") || "(không đâu)"}`,
    );
  }
});

test("tầng V3 đã revert không quay lại package shell", () => {
  const found = [];
  for (const [file, code] of sources()) {
    for (const name of V3_ONLY_NAMES) {
      if (code.includes(name)) found.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(found, [], `tên của tầng V3 đã revert xuất hiện trở lại:\n  ${found.join("\n  ")}`);
});

test("mặt công khai của shell không rò tên V3", () => {
  const index = readFileSync(path.join(SHELL_SRC, "index.ts"), "utf8");
  assert.ok(!/\bWorkspaceTab\b/.test(index), "index.ts không được export kiểu WorkspaceTab của V3");
  assert.ok(/export \{ AppShell \}/.test(index), "index.ts vẫn phải export AppShell");
});
