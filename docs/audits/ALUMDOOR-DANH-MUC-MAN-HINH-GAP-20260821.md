# Alumdoor — audit bố cục & trải nghiệm màn Danh mục

*Lane DM-B của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`. Đọc-chỉ, không có phiên
D1 local khi audit. Đối chiếu với `docs/ALUMDOOR-BAN-DO-NANG-CAP-20260819.md` và
`docs/ALUMDOOR-DANH-MUC-HOI-TU-20260819.md` để không đo lại việc đã xong.*

> **Đính chính kiến trúc so với prompt gốc:** prompt vòng này giả định
> `client/packages/vertical-alumdoor/src/workspace-extension.tsx` là nơi đăng ký cấu trúc menu
> Danh mục. Không đúng — file đó chỉ override create/detail cho 8 DocType giao dịch. Màn Danh mục
> thật là `client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx` (737 dòng). Toàn bộ
> báo cáo dưới đây dựa trên file đúng, có trích đường lắp (import chain) làm bằng chứng.

---

Cấu trúc menu Danh mục thật nằm ở **`client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx`** (737 dòng, sửa lần cuối bởi commit `03f8c091b` 20/08 16:44 — sau cả hai tài liệu 19/08). Đường lắp xác nhận bằng grep + đọc chuỗi import (không suy đoán):

```
main-base.tsx:913  →  experience-registry.tsx:10 (lazy import "AlumdoorMasterDataWithImport.js")
                   →  AlumdoorMasterDataWithImport.tsx  →  AlumdoorMasterDataScreen.tsx (màn thật)
```

`readiness` (số đo tình trạng dữ liệu) đi qua `main-base.tsx:967-979`, gọi `alumdoor.catalog.readiness` (worker riêng). Toàn bộ phần dưới dựa trên file này, không phải file đề bài chỉ tới.

---

## 1. Bảng chính theo cấu trúc menu

8 nhóm, 31 mục khai (đếm bằng `grep -c 'key: "' AlumdoorMasterDataScreen.tsx` = 31, khớp `MASTER_DATA_DECLARED_KEYS`). Thứ tự dưới đây là `DISPLAY_ORDER` thật (dòng 397-406), **không phải** thứ tự khai trong mã nguồn.

| Bước | Nhóm | DocType | Vấn đề | Hạng |
|---|---|---|---|---|
| 01 | Vật tư & quy cách (10 mục) | Item | `measurement_profile` (dòng 5226-5231 brief) `required:true`, quyết định `inventory_mode` toàn mặt hàng qua `fetch_from` — không có `description` cho người khai | P2 |
| — | *(toàn nhóm)* | — | Badge cạnh tiêu đề nhóm **đã đổi thành số bước** (`StepMarker`, dòng 577-586, `String(step).padStart(2,"0")`) — đúng hướng BAN-DO doc 19/08 đề xuất. Xác nhận, không phải lỗi | — |
| 03 | Khách hàng & giá bán (6 mục) | Item Price | `area_tier` bắt buộc (dòng 5588-5595 brief) nhưng có `default:"MOI-DIEN-TICH"` — required chỉ chặn NULL, không chặn "chấp nhận mặc định câm lặng"; không có `description` hiển thị, toàn bộ lý do nằm trong `"//"` (nội bộ) | P1 |
| 03 | Khách hàng & giá bán | Pricing Rule | Chỉ 1/26 field bắt buộc (`title`, dòng 5641); không trường tác động nào (`rate`/`discount_percentage`/`adjustment_rate`/`effect_type`) hay trường phạm vi nào bắt buộc — lưu được "chính sách giá" không match ai và không tác động gì, không cảnh báo | P1 |
| 03 | Khách hàng & giá bán | Pricing Scope | `members` (Table, dòng 13474) **không** khai `required` dù comment ngay tại field (dòng 13473) nói "Phạm vi rỗng thành phần thì KHÔNG làm chính sách giá chạy — fail-closed, không im lặng bỏ qua" — fail-closed đó nằm ở tầng ÁP DỤNG (server), tầng LƯU (client) im lặng | P1 |
| 05 | Mua hàng & nhà cung cấp (2 mục khai, 1 ẩn) | Supplier Item | `menu:false` (brief dòng 5045) mâu thuẫn trực tiếp với quyết định "Giữ trên menu dù 0 bản ghi" của `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md` dòng 67 — chưa ai đồng bộ | P1 |
| 05 | Mua hàng & nhà cung cấp | Supplier Item | Field `last_purchase_rate` — tín hiệu "critical" DUY NHẤT cho cổng chặn "mua vật tư" ở cả Supplier lẫn Supplier Item — tự nó `"hidden": true` (brief dòng 5032). Bật lại `menu:true` không tự mở khoá nhập liệu | P2 |
| *(toàn màn)* | — | Mọi DocType Danh mục | `viewPolicy` (khoá cha của `validationMethod`, cơ chế validate nghiệp vụ trước lưu ở `document-validation.ts`) **không xuất hiện lần nào** trong `alumdoor-v2.json` (`grep -c "viewPolicy"` = 0) — cơ chế tồn tại, viết kỹ, nhưng 0/0 DocType Danh mục dùng | P1 |

Các nhóm 02 (Kho), 04 (Bán hàng & sản xuất), 06 (Địa bàn & giao lắp), 07 (Lý do vận hành), 08 (Kế toán): không phát hiện vấn đề mới đủ cụ thể/nguồn gốc để đưa vào bảng — không có nghĩa là sạch, có nghĩa là chưa đo được thứ mới.

---

## 2. Việc đã đo ở 19/08, không lặp lại

Đối chiếu `ALUMDOOR-BAN-DO-NANG-CAP-20260819.md` — các con số này giữ nguyên, không đo lại:

- 117 mã có dấu cách → 0; 118 trường tính toán thiếu mô tả tiếng Việt → 0.
- 16 liên kết treo → 2 còn lại (xung đột dữ liệu, cần chủ xưởng).
- 45 màn danh mục đáng ngờ → 38, trong đó 25 rỗng+không ai dùng đã ẩn khỏi menu (Brand, Manufacturer, Item Attribute, Material Grade... đều nằm trong nhóm này — xác nhận `menu:false` + `group:"Danh mục"` cho Brand dòng 4279/4304 và Manufacturer dòng 4310/4335, không tính là phát hiện mới).
- Badge cạnh nhóm: đường dẫn → số bước — đã sửa (commit `3b87bfb85`, gần như đồng thời với chính tài liệu 19/08).
- L3 `area_tier` = 0/558, L4 `sales_mode` = 0/349 — **con số** này không đo lại (không có D1); phần mới của tôi là *cơ chế UI* khiến con số đó không tự cải thiện (mục 3 dưới).
- Nối dây "Ngưỡng chọn Motor" + "Nguyên nhân cửa lỗi" — đã làm, đã lên menu (đúng nhóm 04/07 hiện tại).

## 3. Phát hiện mới từ 19/08 tới nay

**F1 — Supplier Item: quyết định và cấu hình lệch nhau (P1).** `HOI-TU-20260819.md:67` chốt *"Supplier Item — Giữ trên menu dù 0 bản ghi... Gỡ nó là mất đường đối chiếu mã theo NCC"*. Brief hiện tại (`alumdoor-v2.json:5045`) vẫn `"menu": false`. Không phải tôi tự phát hiện từ hai tài liệu rời — chính `AlumdoorMasterDataScreen.tsx:244-253` đã viết thẳng: *"MỤC NÀY HIỆN KHÔNG HIỆN RA — và đó là một mâu thuẫn dữ liệu chưa ai gỡ... Không tự chọn bên nào ở client: sửa `menu` là việc của brief."* Tức code đã tự phát hiện lỗi và cố ý không tự sửa — nhưng tới hôm nay (21/08) chưa ai sửa brief theo đúng quyết định đã chốt. Đo lại: `grep -n '"menu": false' -B50 server/briefs/alumdoor-v2.json | grep '"name": "Supplier Item"'`.

**F2 — `last_purchase_rate` tự khoá form, độc lập với F1 (P2).** Ngay cả khi brief bật `menu:true` lại, field cấp tín hiệu readiness duy nhất cho "giá nhập gần nhất" khai `"hidden": true` (`alumdoor-v2.json:5032`) — không sửa được qua form, chỉ qua import (comment cùng chỗ: *"Chỉ để tham khảo khi đặt hàng, máy không tự lấy làm giá"*). Hai lớp ẩn (menu + field) là hai quyết định độc lập, phải gỡ cả hai mới hết chặn.

**F3 — `area_tier`: required không bảo vệ được ý định nghiệp vụ (P1).** Trả lời trực tiếp ví dụ đề bài nêu: người khai giá **không được nhắc chọn đúng bậc**. `required:true` + `default:"MOI-DIEN-TICH"` (`alumdoor-v2.json:5588-5595`) khiến ràng buộc bắt buộc tự thoả bằng giá trị mặc định — dấu `*` đỏ hiện trên nhãn (generic, `FormView.tsx:735`) nhưng không có `description` giải thích 8 bậc diện tích là gì hay hệ quả bỏ qua nó. Toàn bộ lý do nghiệp vụ (đoạn giải thích dài về `resolveAutoname`, về 558/558 dòng) nằm trong `"//"` — quy ước của chính brief này (đối chiếu hàng chục field khác dùng `"description"` riêng biệt cho nội dung hiển thị-cho-người-dùng) là `"//"` viết cho người đọc mã nguồn, không phải người khai giá.

**F4 — Pricing Rule: lưu được "chính sách" rỗng ruột (P1, sát P0 nếu tính là hứa giảm giá không thật).** Đếm toàn bộ mảng `fields` của khối Pricing Rule (`alumdoor-v2.json:5640-5709`, 26 field): chỉ `title` bắt buộc. Không trường phạm vi nào (`price_list`/`item_code`/`party`/`customer_group`) và không trường tác động nào (`rate`/`discount_percentage`/`adjustment_rate`) bắt buộc. Kết quả: lưu được một Pricing Rule có tên nhưng không match ai và/hoặc không giảm/tăng gì — hợp lệ về schema, vô nghĩa nghiệp vụ, không một cảnh báo nào ở màn lưu.

**F5 — Pricing Scope: fail-closed được viết ra nhưng chỉ áp cho tầng sau (P1).** `members` (`alumdoor-v2.json:13472-13478`) không `required`, dù comment ngay tại field nói rõ hệ quả rỗng đã được xử lý fail-closed — **ở tầng khác**. Người tạo Pricing Scope không được cảnh báo lúc lưu rằng phạm vi họ vừa tạo hiện chưa áp cho mặt hàng nào; phát hiện chỉ lộ ra khi Pricing Rule tham chiếu nó không hoạt động — đúng khuôn mẫu "cho lưu rồi lỗi mới lộ ra ở màn tiêu thụ khác" mà đề bài trích dẫn nguyên tắc để kiểm.

**F6 — Cơ chế validate nghiệp vụ trước lưu: 0% Danh mục dùng (P1).** `document-validation.ts:36-90` bọc `createDoc`/`updateDoc`, gọi validator server qua `viewPolicy.form.validationMethod` — nhưng **opt-in**, "No validator is guessed from a DocType name" (comment dòng 33-34). `grep -c '"viewPolicy"' server/briefs/alumdoor-v2.json` = 0 trên toàn brief. Cơ chế được viết cẩn thận, đúng nguyên tắc fail-closed (dòng 70: bất kỳ `field_errors` nào cũng throw), nhưng không một DocType Danh mục nào kích hoạt nó. Cái ĐANG chạy fail-closed phổ quát chỉ là kiểm tra rỗng cơ bản (Zod, `FormView.tsx:105-108`, kể cả Table rỗng) — không có gì kiểm tra liên-trường (vd "spec_type = Nhôm cây/lá thì thickness_mm nên có", "Pricing Rule có is phạm vi thì phải có tác động").

**Đối chứng — không phải vi phạm, nêu để cân bằng bức tranh:**
- `main-base.tsx:950-979`: lỗi gọi `alumdoor.catalog.readiness` (mất mạng, chưa cài worker, thiếu quyền) → `readiness` giữ `undefined`, màn nói "chưa đo", **không** fallback `{}` (thứ sẽ khiến toàn chuỗi trông "đã đủ" sau 0 phép đo). Đây là ví dụ làm ĐÚNG nguyên tắc "thà từ chối" — nhất quán ở phần *đọc*, chưa nhất quán ở phần *ghi* (F4-F6).
- `Measurement Profile.weight_tolerance_pct` (`alumdoor-v2.json:5089-5090`): mô tả thẳng "Vượt ngưỡng thì cảnh báo lúc nhập, không chặn ghi sổ" — fail-open **có chủ đích và công bố ngay trên UI**, khác hẳn F4/F5 là fail-open ẩn trong `"//"` hoặc hoàn toàn im lặng.

## 4. Sống/chết code

- **`DoctypeWorkspace.tsx` vs `RuntimeDoctypeWorkspace.tsx`: cả hai đều sống, KHÔNG phải mẫu hình trùng-tên-một-bản-chết như Sales Order.** `views/src/index.ts:91` export public `DoctypeWorkspace` lấy từ `RuntimeDoctypeWorkspace.js`; `grep -rln "app/DoctypeWorkspace.js"` trong toàn `client` (trừ node_modules/dist) = 0 kết quả ngoài chính `RuntimeDoctypeWorkspace.tsx` (import dưới alias `CanonicalDoctypeWorkspace`). Chuỗi đủ, xác nhận bằng đọc trực tiếp: `vertical-alumdoor/src/index.ts:11` `registerVerticalWorkspace("alumdoor", alumdoorWorkspaceExtension)` → `views/src/app/vertical/registry.ts` (Map theo appId) → `RuntimeDoctypeWorkspace.tsx` tra Map theo app đang chạy (`localStorage`/URL/context) → truyền vào engine canonical làm `extension`. Vai trò: `DoctypeWorkspace.tsx` = engine CRUD chung; `RuntimeDoctypeWorkspace.tsx` = bộ định tuyến theo app runtime. Cả hai cần thiết, không cái nào thừa.
- **Tàn dư dist nhỏ (P2).** `client/packages/views/dist/app/vertical/alumdoor/workspace-extension.d.ts` tồn tại nhưng `src/app/vertical/` chỉ còn `registry.ts` — không có `alumdoor/` (đã dời sang package `vertical-alumdoor` ở commit `ce73510c3`, 19/08). Dấu hiệu `dist/` chưa rebuild sạch sau refactor; vô hại trừ khi có chỗ import thẳng path `dist` đó (chưa tìm thấy).
- **`workspace-navigation.ts` vẫn xếp "Danh mục" vào `GLOBAL_GROUPS` (dòng 9, xác nhận bằng code hiện tại, không phải suy từ comment cũ).** Hệ quả: `MASTER_GROUPS` trong `AlumdoorMasterDataScreen.tsx` là **điểm duy nhất** quyết định DocType nào lên được màn Danh mục — DocType đủ điều kiện (group Danh mục, không `menu:false`, không phải bảng con) bị bỏ sót khỏi đây thì **biến mất hoàn toàn**, không chỉ đếm sai, vì thanh bên cũng không tự xổ menu con cho nhóm này. Có test tự động canh việc này — `__tests__/alumdoor-master-data-screen.test.mjs:343` ("brief mọc thêm mục Danh mục nào thì màn này phải khai mục đó") — nhưng toàn bộ file `{ skip }` theo điều kiện *thiếu devDependency `tsx`* (dòng 66-68, tự skip kèm lý do, không pass im lặng — đúng nguyên tắc của chính nó). Tôi không chạy `node --test` (đọc-chỉ) nên **chưa xác minh được** CI hiện có chạy file này hay không.

## 5. Câu hỏi mở

**Suy được từ dữ liệu hiện có, chưa ai làm:**
- Đồng bộ `Supplier Item.menu` trong brief theo đúng quyết định đã chốt ở `HOI-TU-20260819.md:67` (F1) — chỉ cần sửa 1 dòng, không cần hỏi thêm vì quyết định đã có, chỉ chưa thực thi.
- Thêm `"description"` cho `Item Price.area_tier` (F3) và `Item.measurement_profile` — nội dung đã có sẵn trong `"//"`, chỉ cần chép/rút gọn sang `"description"` để tới được người dùng.

**Phải hỏi chủ xưởng:**
- `last_purchase_rate` (F2) nên mở form nhập tay hay giữ nguyên import-only khi Supplier Item bật lại menu?
- Pricing Rule/Pricing Scope thiếu phạm vi hoặc thiếu tác động (F4, F5) — nên CHẶN lưu (bắt buộc ít nhất 1 trường phạm vi + 1 trường tác động) hay chỉ cảnh báo mềm? Đánh đổi: chặn cứng có thể làm phiền vài rule cố ý rộng/placeholder đang tồn tại.
- `area_tier` mặc định `MOI-DIEN-TICH` (F3): có nên đổi UX thành bắt chọn tường minh (không default) hay giữ nguyên vì đa số mặt hàng đúng là "mọi diện tích" và ép chọn sẽ làm chậm 90% trường hợp bình thường?

**Dữ liệu/tài liệu tự mâu thuẫn:**
- F1: brief (`menu:false`) đối đầu trực tiếp với quyết định ghi trong `HOI-TU-20260819.md` — hai nguồn có thẩm quyền nói ngược nhau, chính code đã tự ghi nhận và từ chối tự chọn bên.
- Trong `AlumdoorMasterDataScreen.tsx:230-236`, ví dụ minh hoạ `{Supplier:{total:0}, "Supplier Item":{total:448}}` là **số dựng để giải thích lỗi thứ tự kiểm tra đã sửa**, không phải số đo thật hiện tại — nếu ai đó trích "448" ra khỏi ngữ cảnh này làm số liệu Supplier Item thật thì sẽ trích sai; cần chạy `alumdoor.catalog.readiness` thật hoặc đo D1 mới biết con số hiện tại (chưa đo được).
