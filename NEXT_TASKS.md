# NEXT TASKS

Ngày cập nhật: **2026-08-16**.

Đây là active queue ngắn. Lịch sử implementation/convergence nằm trong Git/PR và retained evidence; không kéo các board/prompt/handoff cũ trở lại làm live plan.

## 1. Repository hygiene

Đợt hiện hành:

- hợp nhất documentation authority;
- xóa duplicate/stale coordination docs có final provenance thay thế;
- xóa temporary Sentrux trigger/probe/experiment artifacts đã hoàn thành;
- thêm `SENTRUX_MAP.md` để agent định vị ownership trước khi sửa;
- thêm `.sentrux/rules.toml` để bắt đầu codify architecture constraints;
- giữ release/audit/source-lock evidence khi chưa chứng minh được là disposable.

Không xóa file chỉ vì tên cũ. Chỉ xóa khi vai trò của nó đã được current authority, final evidence hoặc Git/PR history thay thế rõ ràng.

## 2. Sentrux convergence tiếp theo

Sau hygiene PR:

1. scan exact current `main`;
2. lưu gate baseline;
3. dùng `SENTRUX_MAP.md` để chọn đúng owner/hotspot;
4. ưu tiên root cause còn tệ nhất thay vì tối ưu một metric cô lập;
5. mỗi candidate phải không regression quality và phải pass compile/test của blast radius;
6. chỉ siết `.sentrux/rules.toml` khi current `main` đã pass rule mới.

Không dùng workflow experiment một lần như permanent architecture. Candidate thất bại phải bị remove sau khi rút được evidence.

## 3. Documentation maintenance

Khi topology/authority đổi:

- cập nhật `SENTRUX_MAP.md` và `docs/ARCHITECTURE.md` trong cùng PR;
- cập nhật `CURRENT_STATUS.md` chỉ khi checkpoint materially thay đổi;
- giữ `NEXT_TASKS.md` ngắn, không biến thành changelog;
- không tạo thêm architecture/status file song song ở root, `client/` hoặc `server/` nếu canonical doc đã tồn tại;
- program prompts/open-order/handoffs phải bị xóa sau convergence trừ khi chúng là final audit evidence.

## 4. Product work

Mọi product/domain work mới phải bắt đầu từ exact current `main`, xác định authority trong `SENTRUX_MAP.md`, rồi đọc BRD/spec/evidence đúng scope. Không tái sử dụng stale branch baseline hoặc stale agent board.

## 5. Production boundary

Release/deploy/migration/provider/customer-data work chỉ thực hiện khi user authorize rõ. Source cleanup hoặc Sentrux improvement không tự mở quyền production mutation.


## R7-A — Frappe 16 Platform Closure — CLOSED

Certified source/runtime contract: Frappe `v16.19.0` / `ba18090b141740e75d52aa97bfc525ff2f831f6c`. Implementation head `ce64f77f8c2a1991a6d88ced76592d44aecd23d5` passed R7 run `36984495200` with `GAP=0` and `UNRESOLVED=0`.

Follow-on work must consume the certified R7 contract rather than reopen it implicitly:

1. ERPNext/R8 business-domain comparison should build on these platform dispositions.
2. A later .NET implementation should port the language-neutral observable contracts and preserve Forge safety invariants, not clone Frappe internals.
3. Any proposed change to an R7 `INTENTIONAL_DIFFERENCE` must be an explicit architecture/product decision with new evidence.
4. Production deploy/migration/provider/customer-data mutation still requires separate authorization and release evidence.

## R8-B — still open after 2026-10-04 hardening

Do not merge or claim BUSINESS_CLOSED while `--certify` fails. Implement and verify:

1. Full downstream landed-cost transfer/manufacturing/delivery/non-FIFO propagation.
2. Canonical dual-currency monetary GL, bank/cash FX revaluation and consolidation.
3. Manufacturing WIP/variance/rework policy, phantom/substitute/alternate BOM and ATP.
4. Broader subcontracting process-loss/secondary/rejected/finished-good-return lifecycle.
5. Pinned ERPNext runtime differential and remaining assets/projects/support/commerce/regional
   module depth from the existing R8 matrix; historical close planning and large-ledger checks.

Budget historical revision intervals, chronological close cancellation, direct FIFO issue
correction and atomic supplier leftover-return entitlement now have executable evidence.
