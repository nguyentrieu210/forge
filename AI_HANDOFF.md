# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `fix/purchase-readiness-symlink-docs-20260731`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated report.

## Mục tiêu nhánh

Forward-fix hậu merge PR `#75`:

1. Chặn evidence output đi qua symlink ngoài repository nhưng trỏ vào source tree.
2. Thêm regression filesystem cho trường hợp symlink.
3. Phục hồi handoff/status/tasks ở phạm vi toàn repository thay vì Purchase-only.
4. Không deploy, không backfill tenant và không bật FIFO.

## Thay đổi hiện tại

- `server/scripts/prepare-purchase-fifo-activation.mjs`
  - resolve physical path bằng existing ancestor + `realpathSync`;
  - kiểm repository và output theo đường dẫn vật lý;
  - vẫn giữ read-only và chặn write/activate flags.
- `server/tests/purchase-fifo-activation-readiness.test.mjs`
  - tạo symlink ngoài repository trỏ vào `server/work/evidence`;
  - yêu cầu output guard từ chối cả thư mục con chưa tồn tại dưới symlink.
- `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`
  - khôi phục trạng thái Purchase, Sales, UI, Inventory/Manufacturing, RBAC và release automation.

## Trạng thái domain cần giữ

- Purchase/FIFO lifecycle correction đã release; FIFO vẫn **disabled**.
- Sales multi-UOM, filtering và price autofill đã có code/release nhưng còn functional acceptance.
- UI dropdown wheel hotfix đã release Gateway nhưng còn production smoke có đăng nhập.
- Inventory/Manufacturing Slice A đạt review `96/100`; các Slice sau là luồng riêng.
- RBAC merge xong code nền, staging/browser QA vẫn riêng.

## Việc tiếp theo

1. Chạy exact-head CI cho nhánh forward-fix.
2. Kiểm focused Purchase test, repository tests, typecheck và build.
3. Mở PR vào default, mô tả rõ đây là post-merge safety/docs correction.
4. Chỉ merge khi required checks xanh trên exact final head.
5. Không deploy Cloudflare hoặc kích hoạt FIFO nếu chưa có yêu cầu rõ và staging evidence đầy đủ.

## Safety

- D1 migrations append-only.
- Không mutate tenant `alu`.
- Không sửa Cloudflare secret hoặc DNS.
- Không commit generated evidence, database export hoặc credential.
