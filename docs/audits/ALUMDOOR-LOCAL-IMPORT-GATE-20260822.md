# Alumdoor local — audit, preflight và lộ trình import

Ngày chốt: 22/08/2026 (Asia/Bangkok)  
Phạm vi: frontend `127.0.0.1:5173`, backend `127.0.0.1:8799`, tenant `demo`  
Chế độ audit: đọc-only; chưa import, chưa migrate, chưa deploy, chưa sửa D1.

## Kết luận điều hành

**NO-GO. Chưa được import.** Cổng hiện ghi nhận 1.860 blocker. Source hash, SQLite integrity và
foreign key vật lý đều đạt, nhưng dữ liệu/căn cứ chưa đạt định nghĩa “đã dùng được”; full server
regression còn 142/2.687 test đỏ. Import ở trạng thái này sẽ hợp thức hóa giá giả, BOM chưa giải
được, reference treo và hệ số quy đổi không có căn cứ.

D1 runtime chính xác:

`C:\alumdoor\server\apps\tenant-worker\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite`

- App Alumdoor thực cài trong D1: `2.11.1`; content hash
  `f00ca8e0f857d800cba7bfc3f4ed2e11016256801ecd9d54c912f1975ef22b53`.
- SHA-256 D1 lúc chạy gate cuối: `7E0BE3FF47F9286F269A56472ED7C1AB8FA6F3F503F5B3A9205625791F00F8D8`.
- `PRAGMA quick_check = ok`; `PRAGMA foreign_key_check = 0`.
- Backup ngày 21/08 khỏe và đúng app revision, nhưng không còn byte-match D1 sau khi runtime chạy
  lại. Cổng đã được siết để bắt buộc dừng runtime và tạo backup mới khớp byte trước import.

Nguồn máy đã khóa đúng SHA-256 cho 5 file trong
`C:\Users\Admin\Downloads\New folder (3)`; production `cloudforge-alu` không được dùng cho bất kỳ
kết luận nào ở đây.

## Các kết luận cũ bị sửa

| Kết luận cũ/giả định | Kết luận đã kiểm chứng |
|---|---|
| App local là 2.31 | D1 runtime cài Alumdoor **2.11.1**. “2.31” không phải installed-app version của tenant `demo`. |
| Đã import/xong nghiệp vụ | **Chưa import**. Importer bị chặn fail-closed và gate là NO-GO. |
| Backup đúng version là đủ | Sai. Backup phải khỏe, cùng app revision **và byte-match D1 ổn định ngay trước import**. |
| Chỉ đọc bảng `documents` là toàn bộ danh mục | Sai. Runtime có hai tầng `documents` + `master_records`; phải đọc union với `documents` precedence/tombstone. |
| So exact-code rồi kết luận mã thiếu | Sai. Phải đi qua ledger source identity → canonical → D1 current; 5 cascade chắc chắn và nhiều ca chưa đủ căn cứ. |
| Nguồn danh mục có 292 dòng | Nguồn hiện khóa hash có 287 dòng, 278 mã; artifact 292 là từ phiên bản nguồn khác. |
| Có đúng 21 quy đổi | Chưa chứng minh. Nguồn có 16 chênh purchase/sales UOM trong 63 dòng; payload có 11; các audit cũ lần lượt nói 20/21/31. |
| Giá 100.000 là giá chuẩn | Sai. 16 dòng `TAM_CHUA_CHOT` là placeholder, không được dùng làm `STANDARD`. |
| NCC và khách phải gộp thành một vai trò | Sai theo quyết định chủ xưởng: một đối tác có thể đồng thời là Supplier và Customer; giữ hai vai trò/chứng từ, liên kết cùng party identity nếu có. |
| Tặng ray từ 10 m² hoặc từ 8 m² bao gồm cận | Sai. Quyết định chủ xưởng là **diện tích một bộ > 8 m²**; đúng 8,000 m² không được tặng. |
| Comment/override trong code là quyết định chủ xưởng | Sai nếu không có artifact, ID và SHA-256 bằng chứng. Override `RPBRAY+20CM → +2cm` vẫn chưa được xác minh. |
| D1 có dữ liệu thì API/UI tự dùng được | Sai. Trước sửa, generic API chỉ nhìn một tầng và wrapper UI nuốt trạng thái readiness. |

## Ma trận nguồn → canonical → D1 → API → TSX → nghiệp vụ

| Miền | Nguồn/canonical | D1 hiện tại | API/backend | TSX/UI thật | Nghiệp vụ | Trạng thái |
|---|---|---|---|---|---|---|
| Runtime/app | 5 source hash khóa đúng | 2.11.1, D1 exact path đã xác định | health 8799/tenant demo đạt | 5173 chạy và đăng nhập được | Nền kiểm thử local | PARTIAL: không phải 2.31, full regression đỏ |
| Item/mã | 287 dòng/278 mã; `docs/alumdoor-item-code-mapping.json` | 404 Item ở `documents`; union phải xét thêm fixture | Generic list/get đã sửa union và precedence | Danh mục hiển thị số thật sau readiness | Chọn/lưu/reload chưa được chứng minh cho toàn bộ mã | PARTIAL |
| UOM/quy đổi | Số “21” chưa có authority; cần cân/nguồn | 49 factor không dương; 72 default UOM thiếu factor | Validator/importer đã fail-closed | UI báo thiếu hệ số 0/21 theo phạm vi nó đo | PO→Receipt→stock/FIFO có nguy cơ sai lượng | BROKEN |
| Giá/bậc giá | Bậc diện tích có nguồn; 16 giá giả bị loại | 16 `TAM_CHUA_CHOT` × 100.000 | Resolver có cận; chưa được phép coi placeholder là chuẩn | Có đường Item Price/Area Tier | Báo giá chưa đáng tin cho mã bị ảnh hưởng | BROKEN |
| Geometry/Cutting | Canonical dùng `PB_CAO`, `PB_RAY_RONG`… | Fixture cũ còn alias dấu gạch | Backend chuẩn hóa alias, xung đột fail-closed | BOM Rule editor mở thật và chọn `PB_CAO` | Cửa Đức/Úc/tấm liền đã qua 42 test tập trung | WORKING/PARTIAL |
| Tặng ray | Quyết định trực tiếp `> 8 m²` | Rule hiện có provenance note | Điều kiện strict GT đã khóa bằng test | Rule mở được; công thức hiển thị | 8,000 không tặng; >8 tặng | WORKING ở code, chưa E2E chứng từ |
| BOM | 232 BOM/1.279 component | Có BOM/BOM Template cũ và reference treo | Importer bắt `pending=0` | Có đường BOM/BOM Rule | 921 component PENDING, không thể phát hành sản xuất | BROKEN |
| BOM Rule | Mapping mới không tự nhận override thiếu bằng chứng | 3 rule master fixture nhìn thấy qua union | Resolver/reader đã dùng canonical field | List hiện 3, editor mở/reload được | 640 pending trong artifact gate; scratch mới 643 | BROKEN |
| Supplier/Customer | NCC có thể đồng thời là khách | Supplier Item active = 0 | Reader/validator có đường | Có menu Supplier và Supplier Item | Không đối chiếu được mã/giá nhập theo NCC | BROKEN |
| Reference/child rows | Ledger phải cascade mã hiện hành | 78 missing, 6 inactive, 40 child mismatch | Generic reader sửa; dữ liệu vẫn treo | UI có thể mở danh mục nhưng không chữa integrity | Save/submit/E2E có thể fail hoặc dùng mã nghỉ | BROKEN |
| E2E | Authority chưa đủ để chốt tất cả nhánh | Chưa import | Focused flow xanh, full suite đỏ | UI smoke đạt cho Danh mục/BOM Rule | Quote→SO→Production và PO→Receipt→FIFO chưa đạt DoD | NOT PROVEN |

## Findings

### Lỗi dữ liệu

| ID | Mức | Số lượng | Bằng chứng | Tác động | Cách sửa/acceptance |
|---|---:|---:|---|---|---|
| DATA-P0-001 | P0 | 921 | `local-imports/alumdoor-canonical-bom-payload.json`; gate `bom_pending` | BOM có thành phần chưa có qty/căn cứ, không thể phát hành WO an toàn | Giải từng dòng về RESOLVED, qty > 0, đúng UOM; importer phải báo pending=0 |
| DATA-P0-002 | P0 | 78 missing + 6 inactive | `work/alumdoor-import-gate-current.json:d1.link_findings` | Link treo ở BOM, HR và lịch sử Sales Order; save/submit/search không đồng nhất | Cascade 5 mã chắc chắn; sửa historical Employee link; 12 BOM còn lại phải có quyết định; gate về 0 |
| DATA-P0-003 | P0 | 49 + 72 | report `invalid_conversions`, `missing_default_conversions` | PO/Receipt/stock/FIFO có thể nhân sai hoặc ngầm factor=1 | Chỉ nhận factor có nguồn/cân; `LKMT_COT Cây→Cây` =1 hoặc xóa dòng; mọi cross-UOM >0 |
| DATA-P0-004 | P0 | 16 | report `placeholder_prices` | Báo giá có thể dùng giá giả 100.000 | Disable placeholder; nhập giá thật, bảng giá, biến thể, bậc và ngày hiệu lực; không đổi nhãn giả thành STANDARD |
| DATA-P1-005 | P1 | 14 conflict / 87 overlap | report `d1.conflicts`; counts 4.799/251/4.963 | Cùng identity có hai payload authority khác nhau | Chốt payload thắng theo nguồn rồi converge; documents giữ precedence cho tới khi conflict=0 |
| DATA-P1-006 | P1 | 40 | report `child_mismatches` | Parent payload và `document_children` reload ra hai hình dạng khác nhau | Reconcile bằng canonical save path, sau đó payload_count=child_count cho toàn bộ Table |
| DATA-P1-007 | P1 | 1 trạng thái | report `supplier_items=0` | Không có supplier SKU/giá nhập để tạo/đối chiếu PO | Tạo Supplier Item từ 51 purchase price dương/20 dòng có NCC sau khi canonical party được chốt |

### Lỗi nguồn/công thức và quyết định chủ xưởng

| ID | Mức | Số lượng | Bằng chứng | Tác động | Cách sửa/acceptance |
|---|---:|---:|---|---|---|
| SRC-P0-001 | P0 | 10 ô | `MS LIÊN BS.xlsx`: T/V/X323, T/V/X491; `ĐM!C1925,C1983`; `BCKQKD!M21,M24` | `#VALUE!/#REF!/#N/A` không được biến thành 0 | Sửa workbook hoặc lập quyết định có ngày; hash lại nguồn; parser không còn formula error |
| SRC-P0-002 | P0 | 6 cặp | `ĐM!G/I`: 1088,1089,1184,1192,1212,1254 | Hai mã cạnh nhau cạnh tranh authority cho cùng thành phần | Chủ xưởng chọn/giải thích từng cặp; ledger ghi merge/alias/rename/retire/add |
| SRC-P1-003 | P1 | 5 dòng | TP-PULYDEN 114N/114L, LONG ĐỀN, HOA KHẾ, CỐT TRỤC 140 | Không biết bổ sung, alias hay retire | Chốt lifecycle và mã canonical; không tự sinh mã |
| SRC-P0-004 | P0 | 1 override | `local-imports/alumdoor-bom-rules/owner-overrides.json` | `RPBRAY+20CM → +2cm` hiện chỉ có comment/metadata, thiếu bằng chứng gốc | Cần decision ID + artifact + SHA-256; nếu không thì giữ PENDING |
| SRC-P0-005 | P0 | nhiều factor/giá | Source agent: 16 chênh UOM/63 dòng; 51 giá mua dương | Không đủ căn cứ cho 49 factor và 16 giá bán giả | Cung cấp cân kg/m/cây, quy cách đóng gói và bảng giá bán có ngày hiệu lực |

Quyết định đã khóa và không hỏi lại:

- `OWNER-20260822-001`: một NCC có thể đồng thời là khách; không xóa vai trò Supplier khi tạo Customer.
- `OWNER-20260822-002`: tặng ray khi diện tích **một bộ > 8 m²**, toán tử `GT`; 8,000 m² không đạt.

### Lỗi backend/metadata/TSX

| ID | Mức | Số lượng | Bằng chứng | Tác động | Tình trạng/cách sửa |
|---|---:|---:|---|---|---|
| BE-P1-001 | P1 | 2 tầng | `document-list.ts:556-586`, `d1-store.ts:189`, `document-access.ts:17` | API trước đây không thấy fixture master hoặc list/get lệch nhau | Đã sửa union + documents precedence/tombstone; 28 test tập trung xanh |
| BE-P1-002 | P1 | 1 namespace | `geometry-policy.ts:46-57`, `sales-production-core.ts:692` | `CAO-PB` và `PB_CAO` làm rule không match | Đã alias về canonical; alias xung đột fail-closed; 42 test geometry/BOM/sales xanh |
| UI-P1-001 | P1 | 1 mount chain | `AlumdoorMasterDataWithImport.tsx:34-54` | Wrapper lazy nuốt loading/error/retry; màn nói “chưa đo” giả | Đã sửa/đã kiểm UI thật; 34 test UI và client typecheck xanh |
| META-P1-001 | P1 | 142 test | `node --test server/tests/*.test.mjs` ngày 22/08 | Không thể tuyên bố toàn bộ ERP regression-safe | 2.545 pass/142 fail; phân nhóm và sửa về 0 trước bàn giao toàn nghiệp vụ |
| META-P1-002 | P1 | 3 dòng lệch | gate artifact 640 pending; scratch rebuild 643 | Artifact BOM Rule có thể stale so với builder mới | Rebuild canonical/audit sau mọi decision; gate chỉ đọc artifact cùng hash/run ID |
| API-P1-003 | P1 | 1 phép đo chậm | UI readiness mất khoảng 10 giây trên D1 hiện tại | Người dùng tưởng app treo nếu thiếu trạng thái | Loading đã hiện; cần tối ưu scan/caching có invalidation, giữ retry/error rõ ràng |

### Cổng an toàn đã triển khai

- `server/scripts/audit-alumdoor-import-gate-local.mjs` chỉ đọc, bắt buộc exact `--d1`, source
  hash, two-layer conflict, link, child, UOM, giá, BOM/BOM Rule, Supplier Item và backup byte-match.
- `import-alumdoor-canonical-bom-local.mjs` từ chối `pending_value_count != 0`, qty không dương và
  cross-UOM thiếu factor.
- `import-alumdoor-bom-rule-local.mjs` từ chối pending, thiếu mapping và owner override không có
  evidence ID/artifact/SHA-256.
- Các đường cũ `nhap/gop-ma-trung.mjs`, `nhap/nhap-qua-api.mjs`, raw-D1 writer và layer-converge
  mutation đã khóa; không còn đường DELETE/factor-10 chạy nhầm.

## Bằng chứng truy vấn D1

Chạy read-only trên exact D1 path:

```sql
SELECT version, content_hash
FROM installed_apps
WHERE tenant_id='demo' AND app_id='alumdoor';

SELECT COUNT(*) FROM documents WHERE tenant_id='demo';       -- 4799
SELECT COUNT(*) FROM master_records WHERE tenant_id='demo';  -- 251

SELECT COUNT(*)
FROM (
  SELECT doctype, name FROM documents WHERE tenant_id='demo'
  UNION
  SELECT record_type, name FROM master_records WHERE tenant_id='demo'
);                                                           -- 4963

PRAGMA quick_check;                                          -- ok
PRAGMA foreign_key_check;                                    -- 0 row
```

Đếm list/get/count/Link search phải dùng cùng semantics: bản `documents` cùng key thắng; document
cancelled/disabled là tombstone, không được để fixture `master_records` sống lại.

## Lộ trình xử lý theo phụ thuộc

### Giai đoạn A — chốt authority nguồn

1. Sửa/chốt 10 ô lỗi công thức.
2. Chốt 6 cặp BOM conflict và lifecycle 5 dòng.
3. Xác minh hoặc loại override `RPBRAY+20CM → +2cm` bằng decision artifact có hash.
4. Cung cấp factor UOM và giá thật có ngày hiệu lực.

Acceptance: zero source formula error, zero source authority conflict, zero lifecycle gap, zero
unverified override; 5 source file hash được khóa lại có chủ đích.

### Giai đoạn B — dựng lại canonical artifact, chưa ghi D1

1. Rebuild item identity ledger với loại hành động merge/alias/rename/retire/add.
2. Cascade toàn bộ reference trong BOM, giá, tồn, lô và chứng từ lịch sử sang mã hiện hành.
3. Rebuild Item/UOM/Price/Supplier Item/BOM/BOM Rule payload cùng run ID và source hashes.
4. Dry validator kiểm tra qty, UOM, area tier, effective date và child rows.

Acceptance: BOM pending=0, BOM Rule pending=0, placeholder=0, invalid/missing conversion=0,
Supplier Item có dữ liệu có nguồn, mọi mapping coverage=100%.

### Giai đoạn C — preflight D1 và backup

1. Tạo repair plan cho 14 authority conflict, 78 missing, 6 inactive và 40 child mismatch.
2. Chỉ khi source authority đã sạch mới chạy repair được kiểm soát trên local D1.
3. Dừng frontend/backend; chạy gate trên D1 ổn định.
4. Tạo backup mới; verify quick/FK/app revision và **SHA-256 backup = SHA-256 runtime D1**.

Acceptance: toàn bộ key trong `blockers` bằng 0; report ghi `decision=GO`; backup_verified=true.

### Giai đoạn D — import local, có rollback

1. Chạy một orchestrator duy nhất với exact D1/tenant/source/run ID/backup.
2. Mỗi phase idempotent, ghi before/after checksum; lỗi bất kỳ phase nào thì dừng, không báo PASS
   một phần.
3. Không deploy và không chạm production.

Acceptance: chạy lại cùng input cho `created=0`, `updated=0`, `unchanged=N`; D1 quick/FK vẫn sạch.

### Giai đoạn E — post-import và E2E

1. Đối soát source→canonical→D1→API cùng payload/hash.
2. UI: đường tới, chọn, lưu, reload toàn bộ căn cứ tính; mobile/touch/error/retry.
3. E2E: Quote→SO→Production Request/BOM/WO; PO→Receipt→UOM→lot/FIFO; Cut→offcut→return;
   Delivery; công nợ/sổ ngày/báo cáo.
4. Chạy client test/typecheck và full server suite về 0 fail.

Acceptance cuối: mọi dữ liệu active, reference hợp lệ, API thấy, UI tới/chọn/lưu/reload được, nghiệp
vụ dùng thật và có test chống tái phát.

## Trạng thái test đã chạy

- Focused backend/công thức/two-layer: 64/64 pass.
- Geometry/BOM/Sales Production riêng: 42/42 pass.
- UI Danh mục: 34/34 pass; client typecheck pass; client selfcheck pass.
- Server build pass.
- Full server: 2.545/2.687 pass, 142 fail — vì vậy toàn bộ nghiệp vụ **chưa hoàn tất**.

