# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `13a4fcf021ac51f36ccd04d8ffa66da262eaf563`.
- Working branch: `hotfix/sales-price-unicode-normalization-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Mục tiêu hiện tại

Sửa production case Sales Order đã hiện `TRỤC 114_1.8LY` và ĐVT `Mét` nhưng `Đơn giá` vẫn trống, sau đó release ngay lên tenant `alu` theo yêu cầu rõ của chủ dự án.

## Root cause được bao phủ

- UOM nhìn giống `Mét` có thể dùng dạng Unicode tổ hợp khác trong dữ liệu import.
- Exact Item Price probe `<price_list>:<item_code>:<uom>` có thể trả HTTP khác `404` và chặn field fallback.
- Preview và authoritative pricing trước đây chưa dùng cùng một canonical text rule.

## Thay đổi

- `server/apps-src/alumdoor-worker/src/sales-item-context.ts`
  - chuẩn hóa text NFC;
  - legacy lookup trước;
  - exact probe lỗi không chặn field fallback;
  - field fallback query Price List + Item rồi so UOM canonical trong code.
- `server/packages/clouderp-pricing/src/index.ts`
  - áp cùng Unicode normalization cho pricing lúc lưu/submit;
  - legacy trước exact;
  - field matching và UOM/currency validation dùng canonical text.
- `server/tests/sales-price-unicode-normalization.test.mjs`
  - legacy UOM Unicode tương đương;
  - exact probe HTTP 400 vẫn fallback được;
  - authoritative pricing trả `180000.00` và UOM `Mét`.

## Verification đã chạy cục bộ

- TypeScript parse cho hai file nguồn: PASS.
- Focused preview tests: 2/2 PASS.
- Focused authoritative pricing test: 1/1 PASS.
- Full repository CI chưa có kết quả; phải dùng exact final PR head.

## Việc tiếp theo

1. Mở PR.
2. Chờ đủ required CI PASS trên exact head.
3. Squash-merge theo lệnh sửa và deploy production hiện tại.
4. Cập nhật controlled release target vào exact merge SHA.
5. Chạy backup → migrations → tenant deploy → endpoint smoke → Worker evidence.
6. Cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` với final release evidence.
7. Người dùng hard refresh và xác minh child grid tự điền `180000 VND`.

## Safety

- Không sửa production secrets hoặc DNS.
- Không mutate Item Price hay dữ liệu nghiệp vụ.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
