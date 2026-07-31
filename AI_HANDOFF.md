# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head sau CI cleanup: `60e19f0a6f498a2471a14210ec6939b3bdf1a0fd`.
- CI cleanup PR: #127.
- Working branch tài liệu: `docs/record-ci-cleanup-merge-20260801`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.

## CI cleanup — MERGED

PR #127 đã squash-merge.

- Exact PR head: `a2dd1fe684b17eb7acf71f0413c96143fcf540e7`.
- Merge SHA: `60e19f0a6f498a2471a14210ec6939b3bdf1a0fd`.
- Exact-head workflows:
  - CI `30658270361`: SUCCESS;
  - PR Validation `30658270951`: SUCCESS;
  - Sales Feature CI `30658272023`: SUCCESS;
  - Purchase Feature CI `30658271484`: SUCCESS;
  - Inventory and Manufacturing CI `30658270984`: SUCCESS;
  - UI Pull Request Validation `30658270824`: SUCCESS.
- Không có Cloudflare Production Smoke Observation hoặc release workflow chạy trên PR.
- Không deploy Cloudflare, không sửa secret/DNS, không migration và không mutate tenant data.

## Kiến trúc CI hiện tại

1. `CI` là nơi duy nhất chạy full test + typecheck + build.
2. Push feature branch không còn tạo thêm full CI ngoài PR run.
3. Docs-only đi fast path, không cài dependencies.
4. `PR Validation` chỉ kiểm changed-file policy; không test/build/deploy lần hai.
5. Sales, Purchase và Inventory/Manufacturing chỉ chạy focused regression đúng phạm vi hoặc PASS nhanh.
6. UI/browser/auth chỉ chạy khi thay đổi liên quan.
7. Production observation không còn trigger trên mọi PR.
8. Release chỉ chạy từ exact merged SHA qua dedicated release workflow.

## File tạm đã loại bỏ

- `.github/workflows/sync-sales-production-clean-once.yml`.
- `server/scripts/.sync-sales-production-trigger`.

Cấm workflow `*once*`, transport/sync workflow, hidden trigger hoặc workflow tự amend/force-push feature branch.

## Quy tắc làm việc

1. Một epic chỉ có một branch và một PR canonical.
2. Focused test xanh trước khi push.
3. Sau khi mở PR, khóa exact head; không push/amend/force-push khi CI đang chạy.
4. Nếu CI fail, đọc log và sửa đúng lỗi trên cùng branch; không tạo PR thay thế.
5. Chỉ merge khi exact-head checks xanh, branch mergeable và final diff sạch.
6. Release production là bước riêng sau merge và chỉ thực hiện khi phạm vi công việc yêu cầu.

## Hàng đợi nghiệp vụ

1. **Sales-to-Production** — next active clean rebuild.
2. **Purchase authenticated QA** — clean rebuild sau Sales; PR #103 chỉ dùng tham khảo.
3. **Finance** — rebuild từ current default; PR #15 chỉ dùng tham khảo.
4. **Daily ledger**.
5. **Warranty / Capacity**.
6. **End-to-end acceptance**.

PR #103, #107, #119 và #122 đã đóng; không reopen.

## Việc tiếp theo

- Dựng một branch Sales-to-Production từ exact current default.
- Chỉ mang source/test thật từ nhánh cũ; không mang workflow/trigger tạm.
- Chạy door formulas, Sales production flow và Unicode pricing trước khi push.
- Mở một PR, khóa head và dùng scoped CI mới.

## Safety

- Không deploy Cloudflare hoặc sửa production secret/DNS nếu chưa có lệnh rõ.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
