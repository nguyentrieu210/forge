# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `13a4fcf021ac51f36ccd04d8ffa66da262eaf563`.
- Working branch: `hotfix/sales-price-unicode-normalization-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Bán hàng — follow-up production cho đơn giá trống

- Functional evidence trên `alu.kairo.vn`: chọn `TRỤC 114_1.8LY`, ĐVT `Mét` hiển thị nhưng `Đơn giá` vẫn trống.
- Production đã chạy sales hotfix trước đó, nên đây không phải lỗi chưa cập nhật Worker.
- Khoảng trống còn lại:
  - dữ liệu import có thể lưu cùng chữ `Mét` bằng dạng Unicode tổ hợp khác;
  - probe exact `<price_list>:<item_code>:<uom>` trả lỗi khác `404` đang chặn field fallback.
- Nhánh hiện tại:
  - chuẩn hóa Price List, Item, UOM, Currency và Warehouse về Unicode NFC trước so khớp;
  - đọc legacy Item Price trước;
  - cho field fallback tiếp tục khi exact-name probe lỗi;
  - field fallback chỉ lọc server theo Price List + Item rồi so UOM đã chuẩn hóa trong code;
  - áp cùng quy tắc cho preview và pricing authoritative lúc lưu/submit.
- Regression mới: `server/tests/sales-price-unicode-normalization.test.mjs`.
- Focused local verification:
  - preview legacy với `Mét` dạng Unicode khác: PASS;
  - preview fallback sau exact probe HTTP 400: PASS;
  - authoritative pricing với UOM Unicode tương đương: PASS.
- Chưa merge hoặc deploy thay đổi follow-up này; GitHub CI exact-head là gate tiếp theo.

## Bán hàng — hotfix trước đã release production

- Feature PR `#78` squash-merge SHA `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Release run `30646396613`, job `91208710455`: **SUCCESS**.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.
- Deployment time: `2026-07-31T16:17:08.332Z`.
- Backup, recorded migrations, deploy và endpoint smoke: PASS.
- `/health = 200`; guest boot = `403`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO rollout vẫn **disabled**.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` đã merge checksum lock cho mọi staging/production write mode.
- Merge SHA PR `#77`: `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.

## Production smoke

Workflow `Cloudflare Production Smoke Observation` chỉ chạy read-only:

- `GET https://alu.kairo.vn/health` phải trả `200`;
- `GET https://alu.kairo.vn/` phải trả `200`;
- guest boot phải trả `403`;
- evidence được upload ngoài repository.

## Gate hiện tại

1. Mở PR cho hotfix Unicode normalization.
2. Required CI phải PASS trên exact final head.
3. Squash-merge theo yêu cầu sửa và deploy production của chủ dự án.
4. Cập nhật release target vào exact merge SHA.
5. Chạy controlled tenant release: backup → recorded migrations → deploy → smoke → Worker version evidence.
6. Functional authenticated smoke vẫn cần người dùng xác minh trực tiếp child grid sau hard refresh.

## Safety

- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1 ngoài controlled release workflow.
- Không bật FIFO.
