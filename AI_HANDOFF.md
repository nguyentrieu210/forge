# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi đồng bộ branch sửa CI: `04c33c0193815196bd6f10492be77fe64d175bbe`.
- Working branch: `ci/stop-duplicate-builds-20260801`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.

## Kết luận nguyên nhân chạy vòng

Quy trình cũ kích nhiều bộ build cho cùng một push:

- `CI` chạy cả push trên feature branch và pull request;
- `PR Validation` lặp nguyên test, typecheck và build;
- Sales, Purchase, Inventory và UI đều dùng path quá rộng nên cùng chạy nặng;
- production observation tạo thêm một run bị skip trên mọi PR;
- workflow one-shot tự cherry-pick, amend và force-push làm đổi head khi CI đang chạy.

PR #103, #107 và #119 đã đóng. Không tự reopen. Branch của chúng chỉ được dùng làm nguồn tham khảo khi dựng PR sạch.

## Đợt sửa CI hiện tại

Branch `ci/stop-duplicate-builds-20260801` thực hiện:

1. `CI` chỉ chạy push trên default và pull request vào default; docs-only đi fast path.
2. `PR Validation` trở thành policy gate nhẹ, không cài dependency, không test/build lần hai và không deploy.
3. Sales, Purchase, Inventory/Manufacturing giữ tên required check nhưng chỉ chạy nặng khi đúng phạm vi.
4. UI/browser/auth QA chỉ chạy khi thay đổi liên quan UI, Gateway, tenant runtime hoặc browser QA.
5. Production smoke observation không còn trigger trên mọi PR.
6. Xóa `.github/workflows/sync-sales-production-clean-once.yml` và `server/scripts/.sync-sales-production-trigger`.
7. Production release vẫn nằm trong các dedicated release workflow; đợt này không gọi release và không deploy Cloudflare.

## Quy tắc bắt buộc sau khi merge

1. Một epic chỉ có một branch và một PR canonical.
2. Không push/amend/force-push khi exact-head CI đang chạy.
3. Sửa lỗi trực tiếp trên branch; cấm workflow `*once*`, transport/sync workflow và hidden trigger.
4. Focused test xanh trước khi push.
5. Một full CI chịu trách nhiệm test + typecheck + build toàn repo.
6. Feature workflow chỉ chạy focused regression đúng phạm vi.
7. Release chỉ chạy từ exact merged SHA qua dedicated release workflow.

## Hàng đợi nghiệp vụ

1. Sales-to-Production — rebuild sạch sau khi CI cleanup merge.
2. Purchase authenticated QA — rebuild sạch sau Sales; PR #103 chỉ là nguồn tham khảo.
3. Finance — rebuild từ current default; PR #15 chỉ dùng tham khảo.
4. Daily ledger.
5. Warranty / Capacity.
6. End-to-end acceptance.

## Việc tiếp theo

- Hoàn tất exact-head CI cho PR sửa CI.
- Review final diff, xác minh không có production secret, release trigger mới hoặc generated artifact.
- Merge CI cleanup khi required checks xanh.
- Dựng lại Sales-to-Production từ exact default mới, mang source/test thật và không mang workflow tạm.

## Safety

- Không deploy Cloudflare trong đợt sửa CI này.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
