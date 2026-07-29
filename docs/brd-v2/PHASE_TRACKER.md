# THEO DÕI PHA — ALUMDOOR V2

> Cập nhật: 2026-07-30 · nhánh `feat/platform-design-screens` · gói `alumdoor@2.0.0`

| Pha | Trạng thái | Bằng chứng |
|---|---|---|
| 1 — Research | ✅ Qua cổng | `docs/ALUMDOOR-V2-PHA1-RESEARCH.md` |
| 2 — BRD | ✅ Qua cổng, giữ nguyên 2 cảnh báo đã công khai | `BRD.md` §11 |
| 3 — Thiết kế kỹ thuật | ✅ Qua cổng | `TECHNICAL_DESIGN.md` §9 |
| 4 — Brief/cổng biên dịch | ✅ Qua cổng | `server/briefs/alumdoor-v2.json`; dry-run đạt, 69 DocType, 57 fixture, 67 mục điều hướng |
| 5 — Build | ✅ Hoàn tất theo spec | Các lát cắt nghiệp vụ và nền tảng bên dưới |
| 6 — Verify/QA trước release | ✅ Qua cổng cục bộ | Full server/SQL, Worker, typecheck, client build/selfcheck và Browser QA desktop/mobile đều đạt |
| 7 — Release production | 🟡 Đã go-live và nhập dữ liệu thật, còn pilot ledger theo kg | Backup + restore drill + migration + deploy + import 3.562 hồ sơ + smoke đạt; production là Alumdoor 2.0.0 |

## Pha 5 — phạm vi đã hoàn tất

- [x] Sổ kho hai đơn vị: số cây/lá và `actual_weight_micros`; định giá theo kg thực cân; huỷ đảo đủ số lượng, kg và giá trị.
- [x] Vị trí lô luôn lấy từ sổ hiện hành, không lấy kho nhận ban đầu đã lỗi thời.
- [x] `Cut Order`: đề xuất lô, kerf, kg tiêu hao, ưu tiên đầu thừa, chặn ăn giữ chỗ của chứng từ khác, ghi sổ atomic và idempotent.
- [x] Sinh lô đầu thừa ở kho đầu thừa con; cắt tiếp đầu thừa đúng kho; hoàn cắt/trả hàng không phục hồi sai lô mẹ.
- [x] Giữ chỗ tồn theo ngưỡng chiều dài, tự nhả khi hết hạn qua lệnh aggregate có audit.
- [x] Kiểm kê hai đơn vị: snapshot, chênh lệch cây/kg, bắt buộc nguyên nhân, cảnh báo phát sinh sau thời điểm chốt và điều chỉnh theo đúng `snapshot_at`.
- [x] Báo cáo `Tồn nhôm theo khổ`, availability theo ngưỡng, báo cáo lệch cân/hao hụt/giữ chỗ/chênh kiểm kê.
- [x] Khóa/mở kỳ có kiểm quyền hai lớp và nhật ký bất biến.
- [x] `Hỏi trợ lý` chỉ đọc trong quyền người gọi; câu trả lời thành công ghi `ai_logs`.
- [x] Lịch nền tảng: nhả giữ chỗ hết hạn, nhắc kiểm kê tháng/quý, báo cáo cuối ngày gồm nhập/xuất/cắt và cảnh báo lệch cân.
- [x] QR trong mẫu in; trình render và kiểu trường đã có test.
- [x] Trình cài gói hỗ trợ đúng quy mô V2 mà vẫn giữ một `D1 batch` atomic dưới giới hạn 100 câu lệnh.
- [x] Danh bạ icon frontend phủ các icon V2; Browser QA không còn cảnh báo icon ở bundle hiện hành.

## Pha 6 — bằng chứng gần nhất

- Full server: **520/520 unit PASS**; toàn bộ SQL PASS, gồm 25 migration và các bài đua 100 request.
- Worker Workerd/D1: **132/132 tenant PASS + 3/3 query PASS**; test cài gói chạy đúng quy mô V2 **69 DocType + 57 fixture**.
- `typecheck:workers`, client `typecheck`, 83 nhóm selfcheck và production build: PASS.
- Brief/schema/verify: PASS; gói cục bộ `alumdoor@2.0.0` cài nâng cấp thành công, client manifest có 67 mục và home `Tồn nhôm theo khổ`.
- Browser QA: đăng nhập thật vào runtime cục bộ, kiểm report/action trên desktop và viewport 390×844; không có console error.
- Chi tiết lệnh và phạm vi: `IMPLEMENTATION_EVIDENCE.md`.

## Pha 7 — trạng thái release

- [x] Tạo backup D1 production mới, kiểm checksum và tạo bản mã hoá DPAPI ngoài Cloudflare.
- [x] Restore drill lần 1 vào D1 mới, không đổi route.
- [x] Restore drill lần 2 vào một D1 mới khác, không tái sử dụng đích lần 1.
- [x] Chạy migration tới `0025_alumdoor_inventory_views.sql` và nâng gói production.
- [ ] Pilot nhập — giữ chỗ — cắt/đầu thừa — kiểm kê; đối chiếu ledger, báo cáo và `/health`.
- [x] Có phê duyệt rõ ràng từ người dùng để nhập nhánh design và deploy production.
- [x] Deploy gateway/client, tenant Worker, app Worker và `alumdoor@2.0.0`.
- [x] Hậu kiểm D1/HTTP/Browser production không ghi dữ liệu đạt.
- [x] Backup mới + restore drill trước import; xác minh import idempotent hai lần trên drill.
- [x] Nhập production 3.562 hồ sơ thật và đối chiếu count/search/key/integrity; không tạo ledger giả.

Pha 7 giữ màu vàng cho tới khi có pilot giao dịch thật có kg cân hoặc staging chuyên dụng.
Workbook tồn không có kg nên không tạo số dư ledger giả chỉ để đánh dấu checklist.
