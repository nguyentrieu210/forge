# Alumdoor — hội tụ danh mục 2026-08-19

Bản ghi quyết định cho đợt chuẩn hoá danh mục. Giữ vì nó trả lời hai câu mà code không trả lời
được: **cái gì cố ý không làm**, và **điều kiện nào thì mở lại**.

Điều kiện chi phối toàn đợt: **xưởng sản xuất sẽ không dùng phần mềm này nhiều.** Thợ cắt, lò
sơn, tổ lắp đặt không ngồi nhập liệu — người dùng thật là bán hàng và kế toán. Vì vậy mọi thứ
chạm **tiền** hoặc **danh tính mặt hàng** làm chắc; mọi thứ chỉ phục vụ thao tác tại xưởng làm
mức tối thiểu-an-toàn hoặc hoãn. Tối thiểu-an-toàn ở đây nghĩa là **thà từ chối và báo lỗi còn
hơn tính ra một con số sai trong im lặng**.

---

## 1. Đã làm

| # | Việc | Vì sao thuộc nhóm bắt buộc |
|---|---|---|
| M1a | `Pricing Scope` + `BOM Rule` khai vào `server/briefs/alumdoor-v2.json` | Cả hai đang sống ngoài brief ⇒ dựng lại tenant là mất. Pricing Scope còn tệ hơn: engine giá đọc nó mỗi lần tính đơn mà chủ xưởng không sửa được qua giao diện |
| M1b | Bản lá ra khỏi `slats.ts` thành danh mục `Quy cách cửa` | `chiều cao tính tiền = tổng số lá × bản lá của mã`. Sai bản lá là sai m², là sai hoá đơn — chạm tiền, không chạm máy cắt |
| M1c | Màn hình Danh mục mở thêm 4 mục; 4 doctype rỗng nhận `menu: false` | Phường Xã 3.321 và Tỉnh Thành 34 bản ghi là dữ liệu thật không ai vào xem được |
| M4 | `ray_type` vào khoá phân giải chính sách cắt | Rộng cắt lá tham gia cơ sở tính tiền khi bán tách món ⇒ chạm tiền |
| M5 | Bảng màu về một nguồn; `Nguyên nhân cửa lỗi` | Hai bản ghi cho cùng một màu là chẻ tồn kho; bên chịu trách nhiệm là dữ liệu của nỗi đau #1 |

Chi tiết nằm trong ba commit trên `agent-live`, không chép lại ở đây.

### Một chỗ suýt hỏng, ghi lại để không tái diễn

`readDoorPolicies` **không lấy trường `ray_type`**. Ngay khi resolver bắt đầu lọc theo loại ray,
mọi chính sách đọc về đều không mang loại ray ⇒ một dòng có khai ray sẽ không khớp được chính
sách nào — hỏng **cả U75 lẫn U100**, không riêng loại thiếu dữ liệu. Đường dự phòng trong
`sales-production-core.ts` thiếu đúng trường đó.

Bài học: đổi khoá phân giải thì phải soi **mọi projection đọc bảng đó**, không chỉ hàm chọn.

---

## 2. Cố ý hoãn — và điều kiện mở lại

Tất cả đều là cụm sản xuất. Đầu tư vào đây là đầu tư vào màn hình không ai mở.

| # | Hoãn | Điều kiện mở lại |
|---|---|---|
| H1 | Kho `Đầu thừa` chạy thật + `scrap_threshold_m` | Khi xưởng bắt đầu nhập chiều dài đầu thừa. Brief đã có `K36-DT`/`K12-DT` với `stock_role: Kho đầu thừa`; ngưỡng vẫn **để trống, chặn cắt** đúng Giả định A2 — không bịa số |
| H2 | Danh mục `Loại lá` (yếm 0,02 · trung gian 0,05 · đáy lớn 0,09 · lá 75MM 0,085 · yếm siêu trường 0,5) | Khi cần lệnh cắt chi tiết. Nó phục vụ chiều cao **vật lý**, không phải chiều cao tính tiền |
| H3 | Bù 106/338 hàng bán chưa có BOM | Khi mở trừ kho sản xuất. BOM vẫn là nháp có chủ đích theo audit 16/08 |
| H4 | Gom 900 dòng applicability BOM Rule từ `ITEM` sang `DOOR_TYPE`/`ITEM_GROUP` | Khi số mặt hàng tăng tới mức nhập tay không kham nổi. Đây là việc tối ưu, không phải việc đúng/sai |
| H5 | `Production Standard` mở rộng | Khi làm lịch sản xuất |
| H6 | Màn hình nhập cửa lỗi **tại xưởng** | DocType và 11 nguyên nhân đã tạo; chủ hoặc kế toán nhập sau khi nghe báo |
| H7 | Bộ danh mục bảng giá: Độ dày (LY) · Bậc diện tích · Chất liệu lưới · Kiểu vận hành · ngưỡng Motor/UPS theo diện tích | Đợt sau. Thuộc scope đầy đủ của `apps/alumdoor/docs/BRD.md`, ngoài phạm vi QĐ-4 |

⚠️ **Ràng buộc kéo theo H7:** khi đặt mã hàng, **không** nhồi độ dày–bậc diện tích–kiểu vận hành
trở lại vào mã chỉ vì chưa có danh mục cho chúng. Thà thiếu còn hơn nhồi — mã hàng là khoá bản
ghi, gỡ ra sau tốn gấp bội.

---

## 3. Giả định đã tự quyết

Theo nguyên tắc "được quyết thay, đừng đứng chờ" của đợt này.

| Điểm | Quyết | Đổi thì sửa ở đâu |
|---|---|---|
| `scrap_threshold_m` | Để trống. BRD chốt trống thì **chặn cắt** — mà cắt thì xưởng không dùng phần mềm, nên nó tự hết là vấn đề | `Measurement Profile` / Settings |
| `Batch.condition` | Giữ enum cứng Thô/Đã sơn/Lỗi | `docs/brd-v2/BRD.md` §4.2 rồi mới tới brief |
| Màu `4004` | Không nạp. BRD ghi chưa xác nhận, nghi ĐỎ ĐÔ | `lib/alumdoor-color-catalog.mjs` |
| Phạm vi `CỬA ÚC` trong Pricing Scope | Không nạp — `docs/ALUMDOOR_PRICING_SCOPE.md` chỉ khai 3 phạm vi | Tài liệu trước, dữ liệu sau |
| `Supplier Item` | **Giữ** trên menu dù 0 bản ghi | Đây là master mua hàng hợp lệ, chỉ chưa seed. Gỡ nó là mất đường đối chiếu mã theo NCC |
| `Cửa Úc` không có Item Group nào | **Giữ chính sách**, không xoá | Không phải chính sách chết: `Kiểu Úc` (`CPB÷0,465+k`) và `Kiểu tấm liền Úc` (`(CPB−0,13)÷0,068`) là hai công thức chia lá khác hẳn nhau. Nguồn xưởng liệt ÚC là một dòng sản xuất thật; danh mục hiện chỉ bán biến thể tấm liền |
| `Cửa kéo Đài Loan` chưa Geometry Profile nào phủ | Để nguyên, ghi lại | `inferDoorType` đã map nhóm này về `Cửa Đài Loan`, nên công thức vẫn chạy. Chỉ thiếu bộ quy cách hình học riêng — 1 mặt hàng |

### Một chỗ CHƯA KHỚP NGUỒN, cố ý không tự sửa

`AL552`. Ba nguồn nói ba kiểu:

- sheet `GHI CHÚ`: `AL552C` = 0,05 · `AL552N` = 0,057
- bảng đang thi hành (`SLAT_PROFILES`): chỉ có `AL552 (CŨ)` = **0,057**, không khai đời MỚI
- `BRD §4.1`: liệt `AL552` là 56/0,057

Nghĩa là đời CŨ đang mang giá trị của đời MỚI, và `profileKey("AL552","")` sẽ ném lỗi vì không
có khoá đời MỚI. Sửa một ước số chia là đổi số lá thật, nên **giữ nguyên giá trị đang tính tiền**
và chờ chủ xưởng chốt. Ghi trong `lib/alumdoor-slat-catalog.mjs`.

---

## 4. Đang chặn — cần một quyết định

**Các pha dữ liệu (xoá sạch danh mục demo, dựng lại mã hàng theo quy ước 29/07, nạp lại danh
mục, nối dữ liệu) CHƯA chạy được.**

Không phải vì thiếu thời gian, mà vì cổng nguồn của runner canonical:

```
run-local-import-core.mjs
  → STALE_WORKTREE: Local main has N commit(s) not on origin/main; refusing to overwrite
```

`skills/forge-local-runner-import/SKILL.md` đặt "exact clean `main` matching `origin/main`" làm
thẩm quyền mutation. Hiện `agent-live` đi trước `origin/main` 78 commit và chưa push. Lách cổng
này là **weaken đúng cái guard mà đợt này được yêu cầu giữ** — nó chặn việc chạy importer từ một
cây nguồn chưa ai review.

Ba đường mở, theo thứ tự em đề nghị:

1. **Push `agent-live` rồi promote lên `main`** — đường sạch nhất, importer chạy đúng hợp đồng.
2. **Bật lại live-sync** để `forge-live apply <adapter>` bắc cầu: nó trình commit live cho
   importer như một `main` local-only, giữ nguyên lock/backup/verify. Cần push trước.
3. Chạy tay với cờ bỏ qua cổng nguồn — **không đề nghị**, và nếu chọn thì phải là quyết định
   tường minh của chủ dự án, không phải mặc định.

Trước khi chạy pha dữ liệu, còn một việc bắt buộc: `scripts/local-runner/bom-rule-adapter.mjs`
đang **fail ở bước idempotency** — pass hai vẫn ghi lại 330 template + 780 rule thay vì đứng yên
(`assertSecondPass`, dòng 204). Nạp lại BOM Rule khi bước này chưa xanh là nạp mà không biết đã
hội tụ chưa.

---

## 5. Việc chưa đụng tới, có chủ ý

Mã hàng. Quy ước `docs/ALUMDOOR-QUY-UOC-MA.md` chốt 29/07 hiện **chưa được áp dụng chút nào**:
0% dùng 10 tiền tố chuẩn, 39% nhồi màu vào mã, 96 mã nhồi cả cách bán lẫn bậc diện tích. 587 mã
thực chất chỉ là 433 mặt hàng.

Đây là việc chạm **danh tính** nên thuộc nhóm bắt buộc, nhưng nó phải đi cùng pha dữ liệu ở §4:
đổi mã mà không dựng lại dữ liệu là tạo ra tầng ánh xạ thứ ba giữa mã cũ và mã mới. Làm một lượt
khi được xoá sạch thì rẻ hơn nhiều lần.

Riêng `TRONBO` trong mã cần nói rõ: nhồi cách bán vào mã hàng chính là **dựng lại `Sales Option`
qua cửa sau** — thứ đã bị xoá ở `46cff213` và audit 16/08 cấm đưa lại. Nằm ở khoá bản ghi là
hình thức khó gỡ nhất.
