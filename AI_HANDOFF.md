# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại snapshot: `b832b56a31a72fa30dc6397d12d81d42fb4a3eb1`.
- Working branch handoff: `docs/stop-agent-loop-20260801`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.

## Kết luận điều phối

Các agent đã chạy vòng ở Sales-to-Production và Purchase QA:

- nhiều PR trùng cùng epic;
- đổi/force-push head khi CI đang chạy;
- mỗi lần đổi head kích lại 6–8 workflow;
- dùng workflow/trigger one-shot để vận chuyển hoặc sửa code;
- chạy CI trên branch Purchase QA đã lệch default quá xa;
- PR body giữ SHA cũ nên không còn khớp head thật.

Đã dừng vòng lặp:

- PR #107 đã đóng, bị #119 thay thế;
- PR #103 đã đóng vì diverged, từng behind default 112 commit và mergeable=false;
- PR #119 đã đóng vì tiếp tục đổi head và đưa workflow/trigger one-shot vào final diff.

Không có PR nghiệp vụ canonical nào được phép chạy lúc snapshot này.

## Lỗi thật của Sales-to-Production

PR #119 head `4712d946c8020f4111a976ce117ae1490f895064` làm toàn bộ required workflow thất bại. Sales Feature CI run `30656395267`, job `91241708739` dừng ở server unit tests với 3 lỗi:

1. Brief version thực tế `2.0.35`, test vẫn khóa `2.0.34` trong `alumdoor-catalog-audit.test.mjs`.
2. Brief version thực tế `2.0.35`, test vẫn khóa `2.0.34` trong `alumdoor-item-model.test.mjs`.
3. Metadata thêm quyền `Production Request`, nhưng assertion danh sách quyền cũ chưa cập nhật.

Sau đó agent lại đổi head sang `73faad7c2ccb0007fa9bed8ce63ec98da6263d87` và thêm:

- `.github/workflows/fix-sales-production-tests-once.yml`;
- `server/scripts/.fix-sales-production-tests-trigger`.

PR bị đóng để không lặp lại lỗi transport của PR #115.

## Quy tắc bắt buộc từ giờ

1. Mỗi epic chỉ có một PR canonical.
2. Chỉ một epic nghiệp vụ ACTIVE cho tới khi Sales-to-Production ổn định.
3. Không tạo workflow/payload/trigger one-shot để sửa hoặc vận chuyển feature.
4. Không đổi head khi required CI đang chạy.
5. Trước khi mở PR phải chạy focused tests, build/typecheck liên quan và `git diff --check`.
6. PR body phải ghi exact head hiện tại; head đổi thì cập nhật body trước khi chạy lại.
7. Chỉ chạy full CI sau khi focused tests xanh và final diff không còn file tạm.
8. Không reformat toàn bộ brief nếu thay đổi chỉ là metadata semantic.

## Hàng đợi canonical

1. **Sales-to-Production** — `BLOCKED / CLEAN REBUILD`.
2. **Purchase authenticated QA** — `QUEUED / CLEAN REBUILD`.
3. **Finance** — `QUEUED / REBUILD`.
4. **Daily ledger** — `QUEUED`.
5. **Warranty / Capacity** — `QUEUED`.
6. **End-to-end acceptance** — `QUEUED`.

## Việc tiếp theo

### Sales-to-Production

- Dựng một branch mới từ default mới nhất.
- Chỉ mang code/test semantic từ #119; không mang workflow/trigger one-shot.
- Sửa trực tiếp ba contract test theo version/policy đã chốt.
- Giảm diff hai brief xuống thay đổi semantic cần thiết.
- Chạy server unit tests trước, rồi door formula, Sales production flow, Unicode pricing, server build và client typecheck.
- Chốt head, mở đúng một PR và chạy full CI đúng một lượt.

### Purchase QA

- Chỉ bắt đầu sau khi Sales-to-Production merge hoặc có head ổn định xanh.
- Dựng branch sạch từ current default.
- Mang đúng các file QA cần thiết từ #103, không merge nguyên lịch sử cũ.

## Safety

- Không deploy Cloudflare trong đợt điều phối này.
- Không sửa production secret hoặc DNS.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
