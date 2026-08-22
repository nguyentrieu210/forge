# Prompt — Audit màn Danh mục, mở rộng theo đúng khung Bán hàng 21/08

*Soạn 2026-08-21. Kế thừa trực tiếp `docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` +
`ALUMDOOR-BAN-HANG-TSX-GAP-20260821.md` (nhánh `feat/ban-hang-danh-muc`, cùng ngày). Vòng 1 và
vòng 2 (`docs/ALUMDOOR-PROMPT-AUDIT-VONG-2.md`) đã đóng tính nhất quán nội bộ và độ đủ theo chuỗi
của DỮ LIỆU danh mục. Vòng này hỏi câu khác: **màn hình** — cả màn Danh mục lẫn bốn màn nghiệp vụ
còn lại — có ĐỌC hết những gì danh mục đã biết không, hay danh mục đang "ngủ"?*

---

## 0. Vì sao vòng này tồn tại, và nó khác gì vòng 2 / hội tụ 19/08

Ba tài liệu nền đã trả lời: danh mục có gì (audit nền tảng 19/08), danh mục có đủ cho toàn chuỗi
không (vòng 2, 20/08), và quyết định nào đã chốt/hoãn có chủ đích (hội tụ 19/08). Cả ba đều nhìn
từ phía **dữ liệu**.

Hôm nay (21/08), làn `feat/ban-hang-danh-muc` đổi góc nhìn sang phía **màn hình tiêu thụ**: màn
Bán hàng đọc tới đâu trong những gì danh mục đã biết. Kết quả là 17 khoảng trống xếp hạng P0/P1,
trong đó **4 luật đang "ngủ im lặng"** — dữ liệu/logic đã tồn tại, đã chạy đúng, nhưng không màn
nào gọi tới nên trông như tính năng chưa làm. Đây là loại hỏng tệ nhất trong repo này.

**Vòng này làm đúng việc đó, theo hai hướng:**

1. **Soi ngược lại chính màn Danh mục** — màn hình nơi người ta KHAI danh mục có tự đọc hết những
   gì nó chứa không, hay chính nó cũng để sót?
2. **Mở rộng sang bốn mắt xích còn lại** mà vòng 2 §4 đã liệt kê nhưng chưa ai làm bằng đúng độ
   sâu của làn Bán hàng: **Mua hàng, Kho, Sản xuất, Kế toán**. Mỗi mắt xích hỏi đúng một câu:

   > **Danh mục đã biết điều gì mà màn này không được nghe?**

Gộp cả năm mắt xích (Bán hàng đã xong hôm nay + bốn mắt xích vòng này) là phủ hết "toàn chuỗi vận
hành" mà vòng 2 đặt ra làm tiêu chí xong. Đây là bước để tích luỹ về quy mô nghìn điểm nâng cấp mà
chủ dự án đặt mục tiêu — xem §5 về cách cộng dồn qua nhiều vòng, không phải một lượt.

---

## 1. Nguyên tắc bắt buộc — đúc kết từ tất cả các vòng trước, không được bỏ qua

Đây không phải gợi ý phong cách. Ba tài liệu nền đã chỉ ra: phá luật nào trong đây đều từng dẫn
tới kết luận sai thật (xem các hộp "⚠️ Đính chính" trong `ALUMDOOR-AUDIT-VONG-2-KET-QUA.md`).

1. **Nguồn gốc thắng bản trích.** Mọi số liệu phải truy được về file/schema/mã nguồn gốc, không
   phải về JSON đã trích hay tài liệu tóm tắt. Nhiều nguồn đồng ý không phải bằng chứng nếu chúng
   cùng một gốc phái sinh.
2. **Đọc-chỉ trước, ghi sau.** Vòng này ra bản đồ/báo cáo. Không đổi mã hàng, không đổi schema,
   không chạy importer, không ghi D1.
3. **Mỗi phát hiện phải có SỐ.** "Nhiều nơi không đọc trường này" là vô dụng. "`grep` trên
   `client/**` = 0 nơi gọi" hoặc "16/227 mã không có Item Price" mới dùng được. Số phải kèm cách
   đo (lệnh, file, ngày) để người sau chạy lại kiểm tra được.
4. **Săn "luật ngủ" như mục tiêu chính, không phải phụ phẩm.** Với mỗi năng lực danh mục có thật
   (field, method, computed value), phải trả lời: *có ít nhất một nơi trong client/** đọc và HIỂN
   THỊ nó không?* Method đã đăng ký + đã có test KHÔNG có nghĩa là có người gọi. Cách đo chuẩn:
   `grep` tên method/field trên toàn `client/**`, đếm số nơi gọi ngoài chính file định nghĩa.
5. **`null` ≠ vắng mặt ≠ `0`.** Khi đề xuất field mới cho payload: khoá vắng mặt = server chưa đo
   được/không áp dụng; giá trị `null` = đã đo nhưng danh mục CHƯA KHAI; `0` là số thật. Đừng gộp
   ba trạng thái này.
6. **Có thì hiện, không có thì ẩn. Trường cũ không đổi nghĩa.** Mọi đề xuất field mới trên payload
   là OPTIONAL, THÊM MỚI. Không phá hợp đồng đang chạy.
7. **Xếp hạng theo mức chạm tiền trước, tiện dụng sau.** Dùng lưới `P0` (sai/thiếu ra một con số
   tiền sai, hoặc hứa với khách điều không có thật trong kho) / `P1` (không sai tiền nhưng người
   dùng không giải trình được, hoặc phải mở màn khác) / `P2` (tiện dụng thuần tuý). Nếu thấy hợp
   với ngữ cảnh hơn, dùng biến thể `T`(tiền)/`K`(tồn kho — giao được hay không)/`O`(số thao tác) như
   làn TSX bán hàng đã dùng — miễn nhất quán trong một tài liệu và nói rõ đang dùng lưới nào.
8. **Kiểm live-vs-dead bằng import graph thật, không suy đoán.** Trước khi kết luận "màn X không
   đọc field Y", xác nhận màn X **có đang được mount thật** không (theo đúng cách làn TSX bán hàng
   đã lật ra: `AlumdoorSalesOrderWorkbenchComplete.tsx` sống, `AlumdoorSalesOrderWorkbench.tsx`
   (không có hậu tố Complete) đã chết — chỉ vì tên "đầy đủ hơn" không có nghĩa nó thắng). Có ít
   nhất hai cặp sống/chết kiểu này trong `vertical-alumdoor/src` theo quan sát vòng này; đừng giả
   định file đang mở là file đang chạy.
9. **Nói rõ chỗ không biết.** Không suy luận khi nguồn không nói, không đoán một hệ số/mã/ánh xạ.
   Phân loại câu hỏi mở thành ba nhóm: *suy được từ dữ liệu, chưa làm* / *phải hỏi chủ xưởng* /
   *dữ liệu tự mâu thuẫn*.
10. **Việc cố ý không làm phải ghi lại kèm điều kiện mở lại**, không phải im lặng bỏ qua. Theo
    đúng khuôn `hội tụ 19/08` (bảng H1–H7) và `TSX-GAP` (bảng N1–N6): cột *Không làm* · *Vì sao* ·
    *Mở lại khi nào*.
11. **Sai thì sửa công khai, không âm thầm.** Nếu một phát hiện của vòng này sau bị chứng minh sai
    (ví dụ do đọc bản trích thay vì nguồn), sửa theo đúng khuôn hộp `⚠️ Đính chính`: giữ nguyên câu
    sai để đối chiếu, nêu bằng chứng mới, nêu test neo giữ kết luận đúng.

---

## 2. Phạm vi vòng này — năm lane chạy song song

Mỗi lane trả lời đúng một câu hỏi trung tâm, có anchor file thật (đã xác nhận tồn tại trong repo
21/08/2026) để không phải dò lại từ đầu. Anchor không phải danh sách đóng — mở rộng khi lần theo
import graph ra chỗ khác.

### Lane DM-A — Danh mục: năng lực đang "ngủ" ở tầng server

**Câu hỏi:** Với mọi field/method danh mục có thật ở server, có ít nhất một nơi trong `client/**`
đọc và hiển thị nó không?

Anchor: `server/apps-src/alumdoor-worker/src/catalog-readiness.ts`,
`server/apps-src/alumdoor-worker/src/item-catalog-invariants.ts`, `color-scopes.ts`
(`finishColorContextForItem`), `server/packages/clouderp-pricing/src/index.ts`,
`server/packages/clouderp-selling/src/commercial-line-resolver.ts`,
`server/packages/clouderp-stock/**`, `server/briefs/alumdoor-v2.json` (100 DocType, nguồn field
thật — dùng để liệt kê hết field trước khi đi tìm nơi đọc). Đã biết trước ít nhất bốn luật ngủ ở
lát Bán hàng (`resolveServerPrice` vứt `uom`/`source_uom`, `area_tier` không tự khai,
`finish_color_context` đã đăng ký chưa ai gọi, `default_color` đã gỡ khỏi brief mà 3 chỗ vẫn đọc)
— lane này KHÔNG lặp lại bốn cái đó, mà quét **phần còn lại** của brief 100 DocType.

### Lane DM-B — Danh mục: bố cục màn hình / workspace

**Câu hỏi:** Chính màn Danh mục (nơi khai báo, không phải nơi tiêu thụ) có tổ chức đúng, có nói
đúng những gì nó chứa không?

Anchor: `client/packages/vertical-alumdoor/src/workspace-extension.tsx` (đăng ký workspace/menu
riêng của Alumdoor — đây là nơi hội tụ 19/08 đã sửa "đếm đường dẫn" thành "đếm bước"),
`client/packages/views/src/workspace/WorkspaceView.tsx`,
`client/packages/views/src/app/DoctypeWorkspace.tsx` +
`client/packages/views/src/app/RuntimeDoctypeWorkspace.tsx` +
`doctype-workspace-support.ts` (khung workspace dùng chung, generic list/form theo metadata — màn
Danh mục KHÔNG phải một TSX viết tay như Sales Order, mà là cấu hình trên nền chung này). Việc
phải làm: liệt kê từng DocType danh mục đang lên menu (Item, Item Group, Item Price, Pricing Rule,
Pricing Scope, UOM, Material Specification, Measurement Profile, Geometry Profile, Geometry Field,
Supplier Item, Bậc diện tích, Quy cách cửa, Ngưỡng chọn Motor, Nguyên nhân cửa lỗi, …), rồi với
từng DocType: field nào thiếu mô tả tiếng Việt, field nào tính toán mà không giải thích công thức,
validate fail-open hay fail-closed, danh mục nào **có dữ liệu mà ẩn khỏi menu** (đã có tiền lệ:
`Supplier Item` từng bị ẩn dù là master hợp lệ — audit nền tảng 19/08 mục 4). Đối chiếu với
`docs/ALUMDOOR-BAN-DO-NANG-CAP-20260819.md` để không lặp lại việc đã đo.

### Lane PUR — Mua hàng ↔ Danh mục

**Câu hỏi:** Danh mục đã biết điều gì mà màn Mua hàng không được nghe?

Anchor: `AlumdoorPurchaseOrderCreate.tsx`, `AlumdoorPurchaseOrderCreateStable.tsx` (xác nhận bản
nào đang sống theo nguyên tắc §1.8 trước khi audit — có hai bản y hệt tình huống Sales Order),
`AlumdoorPurchaseOrderItemsGrid.tsx`, `AlumdoorPurchaseReceiptCreate.tsx`, `purchase-receipt-fifo/`,
`purchase-preview-coordinator.ts`. Đối chiếu với vòng 2 §4.1 (mắt xích hụt nặng nhất): giá nhập +
ĐVT nhập từ `DANH-MỤC.md`, `Supplier Item` (từng rỗng/ẩn), hệ số quy đổi nhập→tồn
(`uom_conversions`), công nợ NCC. Đối chiếu với tài liệu nghiệp vụ đã có
`ALUMDOOR-MUA-HANG-HDSD.md` và `ALUMDOOR-MUA-HANG-THIET-KE.md` — coi đây là "danh mục nghiệp vụ"
(đặc tả ý định) để so với việc màn đang thực làm, không phải chép lại.

### Lane WH — Kho ↔ Danh mục

**Câu hỏi:** Danh mục đã biết điều gì mà nghiệp vụ Kho không được nghe?

Anchor: `AlumdoorManufacturingStockEntryCreate.tsx`, `delivery-note-v2/` (đã có `StockSnapshot`,
`ShortageInfo` theo `ALUMDOOR-BAN-HANG-TSX-GAP` §6 — đây chính là "khâu xuất kho" mà làn Bán hàng
hôm nay đã CHUYỂN trách nhiệm kiểm tồn sang, audit lane này phải xác nhận điểm chuyển giao đó thực
sự khép kín), `purchase-receipt-fifo/` (khâu nhập). Đối chiếu vòng 2 §4.3 — mắt xích "chưa chạy
lần nào": `stock_ledger_entries` 0 dòng tại thời điểm đo 20/08; **đo lại xem còn đúng không**, vì
đây là con số dễ đổi nhất trong toàn bộ audit. Kiểm tra Batch/lô (`length_m`, `color`, `condition`,
`is_offcut`, `intake_kg`), ngưỡng đầu thừa (`scrap_threshold_m` — hội tụ 19/08 mục H1 cố ý để
trống, điều kiện mở lại là "khi xưởng bắt đầu nhập chiều dài đầu thừa" — kiểm xem điều kiện đó đã
tới chưa).

### Lane MFG-ACC — Sản xuất + Kế toán ↔ Danh mục

**Câu hỏi:** Danh mục đã biết điều gì mà nghiệp vụ Sản xuất và Kế toán không được nghe?

Anchor sản xuất: `AlumdoorBomActualEditor.tsx`, `AlumdoorBomRuleEditor.tsx`,
`AlumdoorProductionPlanCreate.tsx`, `AlumdoorProductionRequestDetail.tsx`,
`AlumdoorWorkOrderDetail.tsx`, `work-order-v2/`. Đối chiếu vòng 2 §4.4 và §3 (ranh giới ba loại
BOM), `formula_explanation` (đã biết là luật ngủ ở lát Bán hàng — kiểm xem lát Sản xuất có đọc nó
không, vì đây mới là nơi công thức thật sự cần được giải trình cho người cắt/lắp), `Cutting
Policy`, `Paint Job` (0 bản ghi tại 20/08 — sơn thuê ngoài chưa có chỗ ghi, kiểm màn Sản xuất có
lối nhập không). Anchor kế toán: `AlumdoorDebtWorkbench.tsx`, `cong-no/`. Đối chiếu vòng 2 §4.5 —
mắt xích gần như chưa audit (`BCKQKD.md`, `CNO-NCC.md`, `CHI-TIẾT-CNO-KH.md` "chưa đọc" tại 20/08):
VAT 8%, giá vốn (`DANH-MỤC.md` có cột GIÁ VỐN riêng — hệ tính từ đâu vẫn là câu hỏi mở từ vòng 2,
CHƯA có ai trả lời — đây là ứng viên P0 rõ nhất của lane này nếu vẫn còn mở).

---

## 3. Sản phẩm phải giao — mỗi lane một file, đúng khuôn `BAN-HANG-DANH-MUC-GAP`

Mỗi lane giao **một file Markdown** tại `docs/audits/`, đặt tên theo đúng quy ước đã dùng hôm nay
(`ALUMDOOR-<CHỦ ĐỀ>-20260821.md`):

- `ALUMDOOR-DANH-MUC-SERVER-NGU-20260821.md` (Lane DM-A)
- `ALUMDOOR-DANH-MUC-MAN-HINH-GAP-20260821.md` (Lane DM-B)
- `ALUMDOOR-MUA-HANG-DANH-MUC-GAP-20260821.md` (Lane PUR)
- `ALUMDOOR-KHO-DANH-MUC-GAP-20260821.md` (Lane WH)
- `ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md` (Lane MFG-ACC)

Mỗi file bắt buộc có:

1. Bảng đối chiếu chính, xếp hạng P0/P1/P2 (hoặc T/K/O), cột "ngủ?" đánh dấu luật đang ngủ.
2. Mục riêng liệt kê **luật đang ngủ** kèm bằng chứng grep/số dòng/commit.
3. Mục "việc cố ý không làm trong lane này" kèu lý do + điều kiện mở lại.
4. Nếu lane đề xuất field payload mới: hình dạng JSON cụ thể, tuân luật `null`≠vắng mặt≠`0`.
5. Câu hỏi còn treo cho chủ xưởng, chia ba nhóm (§1.9).
6. Không tự bịa số khi không đo được thật (DB cục bộ hiện KHÔNG chạy — xem §6) — ghi rõ "chưa đo
   được, cần chạy lại khi có D1 local" thay vì suy diễn con số.

---

## 4. Ràng buộc khi làm — thừa hưởng nguyên vẹn từ AGENTS.md

1. Đọc-chỉ. Không sửa code, không sửa schema, không chạy importer, không ghi D1, không tự chạy
   `forge-live apply`.
2. Không tự push, không tự xoá nhánh, không tự tạo migration.
3. Mọi agent chạy lane trong vòng này **trả kết quả dưới dạng nội dung** (không tự ghi file vào
   working tree), để một điểm ghi duy nhất tổng hợp — tránh đúng rủi ro "hai agent chung một cây
   làm việc giẫm nhau" mà AGENTS.md đã cảnh báo, vì các lane này không chạy trong worktree riêng.
4. Không bootstrap runtime local để "xem thật" trong vòng này (cùng lý do làn Bán hàng đã nêu:
   cây đang có thay đổi chưa commit từ vòng này; STALE_WORKTREE có thể chặn). Kiểm chứng bằng đọc
   mã nguồn + brief JSON + tài liệu đã có, không phải bằng chạy UI. Khi nào cây sạch và có phiên
   riêng để bật local (xem `server/RUNBOOK_LOCAL.md`), trải nghiệm sống là bước xác nhận thêm,
   không thay được bước đọc mã.

---

## 5. Lộ trình cộng dồn tới quy mô nghìn điểm — không giả vờ xong trong một lượt

Mục tiêu "~1.000 điểm nâng cấp" là quy mô **tích luỹ nhiều vòng**, đúng cách vòng 1 → vòng 2 →
hội tụ 19/08 → Bán hàng 21/08 đã cộng dồn. Ép ra 1.000 dòng trong một lượt sẽ phá nguyên tắc §1.3
(mỗi phát hiện phải có số thật) — thà 150 phát hiện có bằng chứng còn hơn 1.000 dòng đoán mò.

Trình tự đề xuất sau vòng này:

1. **Vòng này (21/08):** 5 lane trên → ước lượng thực tế 80–200 phát hiện có bằng chứng, tuỳ độ
   sâu mỗi lane đào được trong ngân sách thời gian của nó.
2. **Vòng kế:** với mỗi P0 đã tìm thấy ở vòng này, một lane "đóng khoảng trống" — hình dạng payload
   cụ thể (theo đúng khuôn `ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md`) rồi lane TSX nối dây.
   Đây là lúc số phát hiện tăng nhanh nhất, vì mỗi gap sinh ra ít nhất hai việc: hợp đồng dữ liệu +
   nơi hiển thị.
3. **Vòng sau nữa:** quét chéo — một field/luật ngủ tìm thấy ở một lane (vd `formula_explanation`)
   rất có thể lặp lại ở lane khác (Mua hàng, Kho) vì cùng chia sẻ tầng `clouderp-*`. Kiểm tra chéo
   toàn bộ danh sách luật ngủ đã gom được qua các vòng, không chỉ trong phạm vi lane phát hiện ra.
4. **Toàn hệ thống:** ngoài 5 mắt xích ERP lõi, còn HR/Payroll (`ALUMDOOR-HR-PAYROLL-LITE-*`),
   Social Commerce SaaS, App Factory — mỗi cụm đã có tài liệu domain riêng trong `docs/`; áp đúng
   khung P0/P1/P2 + luật ngủ cho từng cụm khi tới lượt.

Sau mỗi vòng, cập nhật một bảng đếm cộng dồn (số phát hiện theo P0/P1/P2, số đã đóng, số còn mở)
đặt ở đầu `docs/audits/README.md` — không tạo thêm file trạng thái song song mới ở root (đúng kỷ
luật tài liệu của `NEXT_TASKS.md` mục 3).

---

## 6. Giới hạn đã biết của vòng này — nói trước để khỏi hiểu nhầm là thiếu sót

- **D1 cục bộ hiện không chạy** (`localhost:5173`/`:8799` không nghe tại thời điểm soạn prompt
  này, 21/08/2026). Mọi con số trong 5 báo cáo lane phải lấy từ mã nguồn/brief JSON/tài liệu đã
  có, không phải từ query D1 sống. Chỗ nào bắt buộc cần số đo trên D1 thật (như các vòng trước đã
  làm) thì ghi rõ là "đo lại khi có phiên D1 local", không tự bịa theo số cũ của vòng 2 nếu dữ liệu
  có thể đã đổi từ 20/08 tới nay (đổi mã hàng 19/08, điền giá tạm 16 mã 21/08 đều là ví dụ số vừa
  đổi thật trong tài liệu vừa đọc).
- **Trình duyệt sống chưa mở được ở phiên này** (tiện ích Claude in Chrome chưa kết nối). Yêu cầu
  "trải nghiệm thật" của chủ dự án sẽ cần một bước riêng — kết nối tiện ích hoặc bật local — độc
  lập với 5 lane đọc-mã ở trên.
