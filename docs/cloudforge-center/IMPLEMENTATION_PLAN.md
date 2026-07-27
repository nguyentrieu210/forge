# IMPLEMENTATION PLAN — CloudForge Center

## Đã giao (Pha 0–2)

| Pha | Nội dung | Cách làm |
|---|---|---|
| 0 | Audit + tài liệu | đọc code, không đọc tài liệu cũ |
| 1 | 7 vai trò, nav, cách ly tenant | **khai báo** — `briefs/center.json` |
| 2 | 12 DocType master data + 3 workflow | **khai báo** |

Không sửa nền tảng nào cho Center (§4.5–4.7). Hai bản vá script phụ trợ ghi ở CHANGELOG.

## Còn lại — và vì sao KHÔNG khai báo được

| Pha | Việc | Cần gì | Vì sao không khai được |
|---|---|---|---|
| 3 | Học phí, công nợ, phiếu thu | **app Worker** | §10.1 đòi doanh thu ≠ tiền thu ≠ công nợ, payment posted bất biến, allocation ≤ outstanding, idempotent. Đó là **tính toán**, không phải trường dữ liệu |
| 4 | Điểm danh hàng loạt ≤2 thao tác | **loại Experience mới** `roster:` | runtime mới có `approval:` |
| 4 | Tiền dạy giáo viên | app Worker | một TeachingRecord → tối đa một earning, retry không nhân đôi |
| 5 | Học bù, bảo lưu | app Worker | credit không dùng hai lần, reserve/consume atomic |
| 2 | Chống trùng phòng/giáo viên | **validator** | là luật, không phải trường. Cơ chế có, chưa app nào khai |
| 6 | Dashboard, báo cáo | bề mặt report | brief chưa khai được report |
| 7 | Landing + lead form | trang tĩnh | gateway phục vụ được, chưa viết |
| — | Phạm vi theo bản ghi (GAP-1) | app Worker | cấp User Permission tự động khi phân công lớp |
| — | File đính kèm | **gắn R2** | chưa có bucket |

## Thứ tự đề xuất

1. **`roster:` + validator chống trùng lịch** — nới TỪ VỰNG của công xưởng, mọi app sau đều hưởng, và
   đóng luôn gate Pha 2 (§25) lẫn Pha 4 UX.
2. **App Worker đầu tiên: học phí.** Đây là lần đầu đường app Worker chạy end-to-end — đáng giá nhất
   về kiến trúc và rủi ro nhất. Không tuyên bố xong cho tới khi có hoá đơn thật, thu tiền thật, công
   nợ khớp.
3. Học bù/bảo lưu (dùng lại Worker ở bước 2), rồi dashboard, rồi landing.
