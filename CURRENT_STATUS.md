# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch hiện tại: `hotfix/alumdoor-print-list-delete`.
- Default head trước đợt closeout: `76b71aab3c2eacf816986c247b25f564fc808a96`.
- GitHub là nguồn sự thật cho code, CI, PR và release evidence.

## PR tồn đọng — CLOSED

Đã đóng toàn bộ PR còn mở tại thời điểm kiểm tra:

- `#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.

Không PR nào trong nhóm trên được merge nguyên trạng vì tất cả đều đang `mergeable=false` và diverged từ `116` đến `351` commit so với current default. Các branch vẫn được giữ nguyên làm nguồn tham khảo, nên không mất code.

Phân loại:

- `#74` đã được thay thế bằng phiên bản Item Price lookup mới hơn trên default.
- `#35`, `#73`, `#79` là workflow/readiness cũ, không còn phù hợp current release path.
- `#36`, `#40`, `#109` là tmp/backup/duplicate branch.
- `#81`, `#103`, `#15` có source hữu ích nhưng phải dựng lại sạch từ current default.
- `#106` là audit tài liệu cũ, không được phép đè ba file handoff mới.

## Đã hoàn tất trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Sales Order → Production Request → Work Order → Paint Job → Delivery lineage đã có trên default.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Form đặt nhôm, FIFO theo ngày đơn, lịch sử nhận, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có trên default.
- Regression khóa ví dụ `200 + 100`, nhận `230`, phân bổ `200 + 30`, nợ danh nghĩa `70` cây / `504 m`, khoảng giao thêm `55–85` cây.

## Chưa được phép gọi là hoàn tất toàn quy trình

Tài liệu `25.7 QUY TRÌNH.docx` yêu cầu ba vùng nghiệp vụ chính: theo dõi chung, tồn kho vật tư và sổ chi tiết khóa theo ngày; đồng thời yêu cầu lịch sản xuất, chi tiết sơn, lỗi/bảo hành, công nợ và luồng xuất kho. Current default chưa có đủ authenticated acceptance cho toàn bộ chuỗi này.

Các phần còn thiếu hoặc chưa chứng minh:

1. Purchase authenticated QA sạch trên desktop và Pixel 7, gồm Tiến Đạt FIFO journey.
2. Finance hoàn chỉnh: AR/AP aging, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
3. Daily detailed ledger snapshot, freeze và adjustment theo vai trò.
4. Warranty/defect bốn nguyên nhân, supplier debt hold/offset và capacity/overtime.
5. End-to-end acceptance từ Sales Order đến production, inventory, delivery, debt, daily ledger, adjustment và warranty.

## Release boundary

- Không deploy Cloudflare trong đợt đóng PR tồn đọng này.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Generic FIFO production vẫn disabled.

## CI

- Current default head `76b71aab...` không có combined status được GitHub connector trả về.
- Không được coi các branch đã đóng là verified cho current default dù chúng từng có CI trên head cũ.

## Safety

- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
- Không merge branch stale/conflicted chỉ để làm sạch danh sách PR.
