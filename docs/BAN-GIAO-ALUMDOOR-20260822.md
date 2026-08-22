# Bàn giao Alumdoor — 22/08/2026, cập nhật 23/08/2026

Trạng thái tenant `demo` cục bộ, app `alumdoor@2.26.0`.

```
CỔNG NHẬP        852 → 6 blocker      (6 ô Excel, CỐ Ý chặn — xem mục 5a)
AUDIT THEO TẦNG  2/7 → 5/7 tầng đạt
AUDIT CÔNG THỨC       0 lỗi
BỘ TEST          14 đỏ → 2712/2712 XANH
```

Sáu blocker còn lại **đều nằm ngoài cơ sở dữ liệu** — chúng là 2 ô hỏng trong file Excel của
xưởng (cộng 4 ô lan theo). Mọi loại blocker khác đã về 0.

## Làm thêm ngày 23/08

**BOM bán hàng xổ đúng.** Ba lỗi làm sai danh sách cấu kiện:

- Luật BOM khai theo `door_type` nên một cửa Đài Loan 1LY khớp cả lá 6D, 7D lẫn V4 kẽm của
  biến thể khác, và hệ thống bơm hết vào — một cửa ra ba độ dày lá cùng lúc. Nay **BOM tĩnh
  quyết định có cấu kiện nào, luật chỉ quyết định bao nhiêu**; chỉ dựng cấu kiện từ luật khi
  BOM trống hẳn.
- Một luật giấu dòng ĐẦU TIÊN thuộc nhóm "Nan/lá cửa". Cả 4 BOM có lá đều để lá ở dòng đầu nên
  mất lá 4/4, và BOM lá bán rời `DM-2026-0092` chỉ có đúng dòng lá nên xổ ra rỗng. Đã bỏ.
- Bốn BOM lá đáy **tham chiếu vòng**: LÁ ĐẦU khai làm bằng LÁ YẾM + TRUNG GIAN + ĐÁY LỚN, và ba
  cái kia khai ngược lại. Bung ra là lặp không dừng, mà kiểm tra "BOM tự chứa chính nó" không
  bắt được vì vòng đi qua ba mã khác. Nguồn không có ý đó — 29 BOM cửa Đức ăn thẳng cả bốn lá.
  Đã tắt (`DM-2026-0091/0097/0098/0099`).

**Số lượng vis đã điền, 38 dòng.** Quy luật thật không phải "kéo tay hay motor" mà **đi theo
loại puly**: PULY ÚC 34 → vis đầu dù 2 con, vis bắn lô 2P 11 con · PULY 114 → 6 con và 10 con.
Đọc ra được vì mục "CỬA ÚC KT 4.6D XR-CF" tuy mang chữ KT nhưng bên trong là kiểu lắp motor
trong, và nó ghi 6 con — trùng mọi mục MTN.

**Hai BOM TRỌN BỘ thiếu hẳn dòng lá** (`LA_DLK_1_2LY_TRONBO`, `LA_DLK_8D_TRONBO`) — bán ra là
hụt vật tư chính. Đã trả lại.

**Đảo lại một sửa sai của chính tôi.** Hôm 22/08 tôi đổi bản lá `AL71N` 0,055 → 0,057 và bật
trừ-một-lá cho AL71N/AL70, lấy theo bảng tra. Sai: ghi chú trong `slats.ts` nói rõ 0,055 là
quyết định ĐÃ ĐẢO LẠI 0,057, căn cứ sổ nhật ký thật (`TP LÁ RUỘT AL71N VK`: cao 0,495 m ÷ 9 lá
= 0,055). Tiền đã thu thắng bảng tra. Đã trả brief **và D1** về 0,055 / không trừ.

**QĐ-8 trong văn bản quyết định đã sửa.** Cách đọc "20,5 là SỐ LÁ" là sai — chính ba ví dụ của
xưởng bác bỏ: `52,18 → 51`, `"52,6 thì là 52"`, `"<52,5 thì là 51"`. Ở vùng 52 lá mà xưởng vẫn
trừ một lá, nên không thể có ngưỡng "trên 20,5 lá thì thôi không trừ". `20,5` vẫn chưa giải
nghĩa được và đã chuyển xuống mục "Còn treo".

**Bộ sinh brief nay bị chặn ghi đè** — xem mục 6.

---

## 1. Chạy lên như thế nào

```bat
cd C:\alumdoor\server
npm run dev:alumdoor-local
```
Rồi cửa sổ thứ hai:
```bat
cd C:\alumdoor\client\apps\runtime
pnpm run dev
```
Mở `http://localhost:5173`, đăng nhập `dev@example.com` / `local-dev-password-1`.

Backend chạy ở cổng **8799** (không phải 8787 — cổng đó là dự án khác trên cùng máy).

## 2. Ba lệnh kiểm tra

Cả ba **chỉ đọc**, từ chối mọi cờ ghi, chạy lúc nào cũng được.

```bat
cd C:\alumdoor\server
set D1=apps\tenant-worker\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite

node scripts\audit-alumdoor-import-gate-local.mjs --d1 %D1% --tenant demo
node scripts\audit-alumdoor-tung-tang.mjs        --d1 %D1% --tenant demo
node scripts\audit-alumdoor-cong-thuc.mjs        --d1 %D1% --tenant demo
```

| Lệnh | Trả lời câu gì |
|---|---|
| `import-gate` | Có an toàn để ghi đè dữ liệu không? (đã có sẵn từ trước) |
| `tung-tang` | Tầng nào còn thiếu gì? Đo 7 tầng, từ danh mục nền lên chứng từ. |
| `cong-thuc` | Công thức cắt khai ở hai nơi có khớp nhau không? |

**Cổng nhập báo 7 hay 6?** Chạy như trên, lúc server dev đang bật, nó báo **7** — cái thứ 7 là
`backup_unverified`, tức "chưa có bản sao để đối chiếu", không phải lỗi dữ liệu. Muốn thấy con
số thật **6** thì phải theo đúng trình tự: **dừng server → gộp WAL → chép D1 → chạy gate kèm
`--backup`**. Gate đòi bản sao khớp từng byte VÀ D1 đứng yên suốt lúc chạy, nên server còn bật
là không thể kiểm chứng được.

```bat
rem 1) dừng dev server (đóng cửa sổ npm run dev:alumdoor-local)
rem 2) gộp WAL rồi chép
node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec('PRAGMA wal_checkpoint(TRUNCATE)');d.close()" %D1%
copy %D1% C:\_BACKUP_ALUMDOOR_20260820\alumdoor-d1-hom-nay.sqlite
node scripts\audit-alumdoor-import-gate-local.mjs --d1 %D1% --backup C:\_BACKUP_ALUMDOOR_20260820\alumdoor-d1-hom-nay.sqlite
```

## 3. Dữ liệu đang có

```
    404  Item                 122  Bill of Materials (769 dòng cấu kiện)
    299  Item Price            34  BOM Rule
    256  Customer               6  Cutting Policy · 5 Geometry Profile
     16  Supplier              11  Geometry Field
     16  Supplier Item         19  Quy cách cửa
     89  Pricing Rule           4  Warehouse
```

Số BOM giảm từ 149 xuống 122 vì đã gộp bản trùng theo màu và tắt 4 BOM lá đáy tham chiếu vòng —
không mất định mức nào.

---

## 4. ⚠ SỐ ĐIỀN TẠM — phải thay trước khi tin

Theo yêu cầu "dùng được ngay", chỗ thiếu dữ liệu đã điền **1**. Tất cả đều mang dấu để lọc lại.

| Chỗ | Số lượng | Lọc bằng | Danh sách |
|---|---|---|---|
| Hệ số quy đổi | 66 mã · 71 dòng | `payload_json LIKE '%_tam_dien_1%'` trên `Item` | `work/HE-SO-DIEN-TAM-1.md` |
| Số lượng dòng BOM | 88 BOM · 257 dòng | `…` trên `Bill of Materials` | `work/BOM-DIEN-TAM-1.md` |
| Giá bán | 11 dòng | `payload_json LIKE '%_tam_dien%'` trên `Item Price` | — |

```sql
SELECT doctype, name FROM documents
 WHERE tenant_id='demo' AND payload_json LIKE '%_tam_dien%';
```

**Hậu quả nếu quên thay:**
- Hệ số quy đổi sai → mua theo Kg, dùng theo Mét, **tồn kho lệch mà không màn hình nào báo**.
  Trục 114 thật là 4,4–4,5 kg/m; để 1 thì nhập 1 tấn thành 1 mét.
- Số lượng BOM = 1 → định mức sai với mọi cỡ cửa. Phớt lông bán theo mét, lò xo theo cây.
- Giá 100.000 → đó là giá **bộ CON LĂN hoàn chỉnh** trong sheet DANH MỤC, bị chép xuống từng
  linh kiện. Không phải giá của từng mã.

**Một giá đã bị GỠ HẲN chứ không điền tạm:** `CKDL_CUAKEODL` (cửa kéo Đài Loan) để
100.000/m² trong khi cửa thật quanh 1.000.000/m². Báo giá nhầm là mất 900k mỗi mét vuông.
Hệ thống không báo giá được thì người ta còn hỏi; báo sai thì không ai biết mà hỏi.

---

## 5. Việc cần xưởng làm

### a. Sửa 2 ô trong `MS LIÊN BS.xlsx` — đây là 6 blocker còn lại

```
sheet "chi tiết nhập hàng ngày"

S323   đang là chữ "tính lại", phải là SỐ
       dòng đó: LÁ ĐÀI LOAN STĐ 8D · 4 × 5,18 = 20,72 m² · đã thu 6.630.400
       → đơn giá ≈ 320.000/m²

T491   đang là "=T491*8%" — ô tự trỏ vào chính nó
       dòng đó: RAY SẮT (KHÔNG RON) U70 · đã thu 497.245
       → chắc định gõ "=W491*8%"
```
T/V/X323 và V/X491 tự khỏi theo. Chi tiết: `docs/source-data/ALUMDOOR-O-CONG-THUC-HONG.md`

### b. Điền phiếu hệ số quy đổi

`work/CAN-DIEN-HE-SO-QUY-DOI.md` — đã tách sẵn: cần cân thực tế / chỉ cần đếm / lỗi mô hình.

### c. Bốn câu chưa có lời

| Câu hỏi | Vì sao cần |
|---|---|
| Mã bản lá `C`/`N` là **cong** / **nghiêng**? | 23 mã đi theo cặp, bản lá khác nhau. Đang đoán. |
| `AL71C` sao không có `-1 LÁ` như 22 mã kia? | Ngoại lệ thật hay chép sót? |
| Trục 114: **4,4** hay **4,5** kg/m? | Sheet DANH MỤC ghi 4,5; D1 đang 4,4. Ray hộp: 1,083 vs 1,1. |
| Cửa Đức có kèm trục không? | Luật `TRUC_DAI = PB_RAY_RONG + 0,02` **suy ra** từ ghi chú "GIỐNG ĐỨC" của cửa Lưới, chưa ai xác nhận. |

### d. 21 mã tự sản xuất chưa có định mức

Nguồn không có cấu kiện cho chúng: nhóm Siêu Trường, `INOX_6D/7D/8D/1LY`, `TON_DLM_*_K124`,
`LA_DAU/LA_YEM/LA_TRUNG_GIAN/LA_DAYLON`, `CLUOI_LUOI_MV_TM`, `CLUOI_LUOI_SNPHI19_INOX_TM`,
`CKDL_CUAKEODL`, `LA_DLK_*`, `LA_RUOT_AL71N`.

Trước 23/08 con số này báo là **114**, nhưng 93 trong đó là báo nhầm: kiểm tra hỏi định mức của
cả hàng **mua ngoài** — bulông, bạc đạn, bình lưu điện nhập về bán lại thì lấy đâu ra cấu kiện.
Đã lọc theo `supply_type`, nay chỉ hỏi hàng tự sản xuất, và cái thiếu thật không còn bị chôn
trong đống báo nhầm.

Cái CẦN để dựng nốt là **hệ số kg/m² của tôn theo từng độ dày**. Không tự điền được: nguồn ghi
4,4 · 5,6 · 5,7 · 6,32 kg/m² cho những dòng cùng một độ dày — đó là cân theo lô, không phải
bảng chuẩn. Cần xưởng chốt một bảng.

### đ. Cho giá `CKDL_CUAKEODL` (CỬA KÉO ĐL)

Đây là mã đã **gỡ giá có chủ đích** ở mục 4 — không phải sót. Kiểm lại ngày 23/08: ô giá bán
cũng **trống trong chính bảng giá của xưởng** (`HH-CUAKEODL`), trong khi tháng 5–6/2026 có
nhiều đơn bán thật (CỬA KÉO ĐL 6D, 1LY, 1,2LY). Nghĩa là mặt hàng này báo giá theo đơn. Vẫn
không điền đại — một mức giá sai trên hoá đơn tệ hơn là chưa có giá. Đây là mục duy nhất còn
làm tầng 6 chưa đạt.

### e. Bốn BOM khai HAI loại V4 cùng lúc

`DM-2026-0003` (ĐL6D: kẽm + sơn tĩnh điện) · `DM-2026-0054` · `DM-2026-0056` (kẽm + inox) ·
`DM-2026-0059` (kẽm + sơn tĩnh điện). Không tự cắt vì có thể cửa lưới dùng thật cả hai loại.
Xưởng xác nhận thì cắt bớt.

---

## 6. ⚠ Bẫy phải biết trước khi sửa gì

### Sửa `master_records` thẳng trong D1 là VÔ NGHĨA

255 trong 283 bản ghi `master_records` được khai trong `briefs/alumdoor-v2.json`. Trình cài
app upsert fixture từ manifest xuống, nên **bản sửa tay ở D1 bị ghi đè lặng lẽ ở lần cài kế
tiếp**. Hôm nay đã mất theo cách đó: luật trục cửa Lưới (0,02 → 0,2) và 8 bậc diện tích đã
xoá sống lại.

> **Sửa Cutting Policy, BOM Rule, Geometry Field/Profile, Warehouse, Item Color… thì sửa
> BRIEF rồi cài lại app.** Chỉ `Item`, `Item Price`, `Bill of Materials`, `Customer`,
> chứng từ… mới nằm ở `documents` và sửa thẳng được.

### Brief bị tách 6 sidecar, `integrations` ghép cuối và ĐÈ version

```
briefs/alumdoor-v2.json                 ← thân chính
        alumdoor-v2.prints.json
        alumdoor-v2.permissions.json
        alumdoor-v2.views.json
        alumdoor-v2.actions.json
        alumdoor-v2.fixtures.json        ← 13 fixture lý do huỷ / nguyên nhân chênh lệch
        alumdoor-v2.integrations.json    ← ghép SAU CÙNG, version của nó thắng
```
Bump version ở thân chính mà quên sidecar này là version không đổi.

### `build-alumdoor-v2-brief.mjs` nay TỪ CHỐI ghi đè brief

Trước đây chạy nó không kèm `--out` là ghi thẳng đè `briefs/alumdoor-v2.json` và **mất 73 quyết
định đã soạn tay, im lặng, không báo gì**. Cảnh báo chỉ nằm trong RUNBOOK, ai không đọc thì
dính. Từ 23/08 nó chặn thật:

```
TỪ CHỐI ghi đè briefs/alumdoor-v2.json.
Bộ sinh đang tụt lại 73 mục — xem briefs/alumdoor-v2.generator-drift.json.
```

`briefs/alumdoor-v2.generator-drift.json` liệt kê **đúng** phần lệch đang biết: 33 fixture bộ
sinh không đẻ ra, 39 fixture hai bên khác nội dung, 1 doctype. Test
`alumdoor-v2-generator-reproducibility` đối chiếu với bản kiểm kê đó — lệch đang biết thì im,
lệch **mới** thì đỏ kèm tên cụ thể. Trước đây test này đòi "không lệch một byte", đỏ triền miên
mà không ai đọc ra nó đỏ vì cái gì, nên lệch mới cũng chìm luôn.

> Danh sách kiểm kê phải **teo dần**. Chuyển được mục nào vào bộ sinh thì xoá khỏi đó. Khi rỗng
> thì mới lại ghi đè được an toàn (bằng cờ `--ghi-de-brief-da-soan`).

Cài bằng:
```bat
set FORGE_ADMIN_PASSWORD=local-dev-password-1
node scripts\forge-app.mjs briefs\alumdoor-v2.json --origin http://127.0.0.1:8799 --admin dev@example.com
```

### Cài xong phải chụp lại ảnh gói nguồn
```bat
node scripts\forge-app.mjs briefs\alumdoor-v2.json --dry-run --out ..\work\source-packages-current\alumdoor.json
```
Quên là cổng báo `app_source_stale`.

### Sổ cái tổng CẤM XOÁ

Trigger `finance_gl_entries_immutable_delete` chặn mọi `DELETE FROM gl_entries`, không điều
kiện. Đây là lý do 16 chứng từ mua hàng còn lại không xoá được — chúng có bút toán. Đừng gỡ
trigger; `DR-RC020-003` trong repo cấm tạo lối vòng đó.

---

## 7. Tài liệu đã viết hôm nay

| File | Nội dung |
|---|---|
| `docs/source-data/ALUMDOOR-QUY-DOI-LOT-LONG-PHU-BI.md` | Bảng quy đổi lọt lòng ↔ phủ bì cho 3 dòng cửa, bảng bản lá 23 loại. (Đoạn đọc ô GHI CHÚ!G5 thành ngưỡng 20,5 LÁ đã bị bác và sửa lại ngày 23/08 — xem QĐ-8.) **Trích từ sheet `GHI CHÚ` mà chưa đợt nhập nào đọc tới.** |
| `docs/source-data/ALUMDOOR-O-CONG-THUC-HONG.md` | 10 ô công thức hỏng, mở từng ô, phân loại |
| `docs/decisions/ALUMDOOR-QUYET-DINH-CHU-XUONG-20260822.md` | 8 quyết định của chủ xưởng, có băm SHA-256 để cổng kiểm |
| `work/CAN-DIEN-HE-SO-QUY-DOI.md` | Phiếu cân cho xưởng |
| `work/HE-SO-DIEN-TAM-1.md` · `work/BOM-DIEN-TAM-1.md` | Danh sách số điền tạm |

## 8. Việc lớn còn treo: quy đổi lọt lòng → phủ bì

Dữ liệu **đã có đủ** (sheet `GHI CHÚ`), hai trường `LOT_LONG_CAO`/`LOT_LONG_RONG` đã khai
trong brief. Kẹt ở engine:

- Chuỗi `RLL → RPBR → RPBN` cần **bắc cầu** qua một trường Tự tính, mà
  `evaluateGeometryRules` (`apps-src/alumdoor-worker/src/geometry-policy.ts`) **cố ý** chỉ
  cho nguồn là trường Nhập liệu.
- `billable_area_sqm` cần phép **nhân** (`CPB × RPBN`); engine chỉ có `COPY`/`SUBTRACT`/`ADD`.

Đây là sửa code, không phải nhập dữ liệu. File đó từng có người khác sửa dở — kiểm
`git status` trước khi đụng.

## 9. Sao lưu

```
C:/_BACKUP_ALUMDOOR_20260820/alumdoor-d1-20260823-ban-giao-cuoi.sqlite   ← MỐC BÀN GIAO, cổng nhập đã kiểm chứng
work/_backup/demo-d1-BANGIAO-20260822.sqlite     ← mốc 22/08
work/_backup/demo-d1-truoc-*.sqlite              ← trước từng bước, 12 mốc
work/_backup/alumdoor-v2-brief-truoc-*.json      ← brief trước khi sửa
```
