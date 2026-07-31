import { strict as assert } from "node:assert";
import { canConsumeScrollDelta, resolvePopoverModal } from "@metaforge/ui";

assert.equal(canConsumeScrollDelta(0, 100, 300, -20), false, "đầu danh sách không thể cuộn lên");
assert.equal(canConsumeScrollDelta(0, 100, 300, 20), true, "đầu danh sách vẫn cuộn xuống được");
assert.equal(canConsumeScrollDelta(100, 100, 300, -20), true, "giữa danh sách cuộn lên được");
assert.equal(canConsumeScrollDelta(100, 100, 300, 20), true, "giữa danh sách cuộn xuống được");
assert.equal(canConsumeScrollDelta(200, 100, 300, 20), false, "cuối danh sách phải nhường wheel cho child grid");
assert.equal(canConsumeScrollDelta(0, 100, 100, 20), false, "không tràn thì không được giữ wheel");
assert.equal(canConsumeScrollDelta(0, 100, 300, 0), false, "delta bằng 0 không tạo scroll giả");

assert.equal(resolvePopoverModal(undefined, false), false, "popover ngoài dialog giữ non-modal");
assert.equal(resolvePopoverModal(undefined, true), true, "popover trong dialog phải modal để wheel không bị scroll-lock chặn");
assert.equal(resolvePopoverModal(false, true), false, "cấu hình modal tường minh phải được tôn trọng");
assert.equal(resolvePopoverModal(true, false), true, "cấu hình modal tường minh phải được tôn trọng");

console.log("  ✓ child-grid dropdown wheel boundary and dialog-modal regression");
