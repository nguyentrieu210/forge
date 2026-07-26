# Kho — app quản lý kho cho doanh nghiệp Việt

Dựng trên MetaForge + Frappe/ERPNext, theo **BRD-APHVH-ERP-001 v1.4**
(§9 tổ chức & dữ liệu nền · §10 quản lý kho · §19 dashboard & báo cáo).

```
pnpm --filter kho-vn dev     # http://localhost:8093
```

```
VITE_FRAPPE_BACKEND=http://localhost:8000
VITE_FRAPPE_SITE=metaforge.localhost
```

---

## 1. Bốn thứ làm nên khác biệt

### 1.1 Form không còn rừng field ERPNext

`Purchase Receipt` chuẩn có ~150 field (ngoại tệ, thuế nhiều bậc, subcontracting, chi phí nhập
khẩu, điều khoản thanh toán, địa chỉ giao/xuất hoá đơn…). Thủ kho chỉ cần: nhà cung cấp, ngày,
kho nhận, danh sách hàng.

`src/form-profiles.ts` khai báo field nào được hiện cho từng chứng từ. **Không sửa DocType phía
server** (BRD §6 nguyên tắc #2) — chỉ lọc lúc render.

Cơ chế nằm ở `applyFormProfile()` trong `@metaforge/core`, với **ba quy tắc an toàn tự động**:

| Quy tắc | Vì sao bắt buộc |
|---|---|
| Field `reqd: 1` **luôn hiện**, kể cả khi profile ghi ẩn | Ẩn field bắt buộc = form không lưu được, mà lỗi lại trỏ tới field không nhìn thấy → bế tắc |
| Field bị `depends_on` của field đang hiện tham chiếu → **tự kéo vào** | Thiếu nó thì biểu thức điều kiện đọc `undefined` và ẩn/hiện sai |
| Section/Column/Tab rỗng sau khi lọc → **tự dọn** | Không dọn thì form đầy tiêu đề mục trống, còn xấu hơn lúc chưa lọc |

Nên `keep` trong profile là "field nghiệp vụ tôi muốn thấy", không phải danh sách đầy đủ sẽ render.
Site có custom field bắt buộc riêng thì nó vẫn tự xuất hiện.

### 1.2 Đa công ty · đa kho (§9 ORG-001…008)

Thanh chọn **Công ty / Kho** nằm ngay dưới topbar, áp cho mọi màn.
Danh sách lựa chọn do **server** trả về theo Role + User Permission của chính user đó — client chỉ
hiển thị và gửi kèm truy vấn, không tự suy diễn quyền.

Một quyết định có chủ ý trong `app-manifest.ts`:

> Chỉ **lọc danh sách** theo `company`; `warehouse` chỉ dùng để **điền sẵn khi tạo mới**.

Vì kho trên chứng từ có thể khai ở **từng dòng hàng**, không chỉ ở field kho mặc định trên đầu
phiếu. Lọc danh sách theo kho mặc định sẽ **giấu mất** phiếu nhập hàng vào đúng kho đó nhưng khai
ở dòng — người dùng tưởng mất phiếu. Lọc theo company thì luôn chính xác.

### 1.3 Hai màn riêng cho công nhân kho

`kind: "experience"` → chạy trong `MobileShell`: nút cao 56px, quét mã là thao tác chính, một tay dùng được.

- **Quét tra tồn** — chỉ đọc. Quét mã → còn bao nhiêu, ở kho nào, đang bị giữ bao nhiêu.
- **Chuyển kho nhanh** — quét mã + kho đi/đến + số lượng → tạo `Stock Entry` (Material Transfer).

Hai chi tiết cố ý:

- Danh sách "Kho đi" **chỉ liệt kê kho đang có hàng** của mã đó. Chọn kho rỗng rồi mới biết không
  lấy được là kiểu lỗi tốn thời gian nhất ở hiện trường.
- Phiếu tạo ra **để nháp, không submit thẳng**. WMS-008 yêu cầu hai người xác nhận giao/nhận, nên
  công nhân chỉ lập phiếu, người có quyền mới duyệt.

### 1.4 Phân quyền menu theo role

`NAV_ROLES` trong `app-manifest.ts` — thủ kho không thấy Danh mục/Báo cáo, quản lý kho thì thấy.

> ⚠️ **Đây chỉ là lớp giao diện.** Ranh giới quyền thật ở server: Frappe kiểm DocPerm +
> User Permission trên mọi request, kể cả khi gõ thẳng URL hay gọi API. Ẩn menu không bảo vệ được gì.
> Route vẫn đăng ký đầy đủ để deep-link không gãy; không có quyền thì server trả lỗi và màn hiện đúng lỗi đó.

---

## 2. Bản đồ màn hình

| Nhóm | Màn hình | Loại | Role thấy được |
|---|---|---|---|
| Hằng ngày | **Tồn kho** *(trang chủ)* | route | mọi người |
| Hằng ngày | Nhập hàng | `Purchase Receipt` | mọi người |
| Hằng ngày | Chuyển kho | `Stock Entry` | mọi người |
| Hằng ngày | Xuất hàng | `Delivery Note` | mọi người |
| Hằng ngày | Yêu cầu vật tư | `Material Request` | mọi người |
| Ngoài kho | Quét tra tồn | experience | mọi người |
| Ngoài kho | Chuyển kho nhanh | experience | mọi người |
| Lô & Chất lượng | Lô hàng | `Batch` | mọi người |
| Lô & Chất lượng | Kiểm tra chất lượng | `Quality Inspection` | mọi người |
| Lô & Chất lượng | Kiểm kê | `Stock Reconciliation` | Stock Manager |
| Báo cáo | Tồn kho chi tiết | `Stock Balance` | Stock Manager |
| Báo cáo | Sổ kho | `Stock Ledger` | Stock Manager |
| Báo cáo | Tồn dự kiến | `Stock Projected Qty` | Stock Manager |
| Báo cáo | Tồn theo lô | `Batch-Wise Balance History` | Stock Manager |
| Danh mục | Vật tư, Nhóm vật tư, Thương hiệu, ĐVT | doctype | Stock/Item Manager |
| Danh mục | Kho hàng | `Warehouse` | Stock Manager |
| Danh mục | Nhà cung cấp, Khách hàng | doctype | Stock/Purchase/Sales |

Báo cáo dùng **Query Report chuẩn** của ERPNext qua `ReportContainer` — không tự tính lại số liệu.

---

## 3. Ánh xạ yêu cầu BRD

| Mã | Yêu cầu | Đáp ứng ở đâu |
|---|---|---|
| ORG-001…008 | 4 Company, kho thuộc 1 Company, user chỉ thấy phần được giao | Thanh chọn Công ty/Kho + User Permission phía site |
| WMS-001 | Tồn theo Company / kho lá / Item | Màn **Tồn kho** (đọc `Bin`), lọc chỉ kho lá |
| WMS-002 | Vị trí có barcode, trạng thái active/disabled | `Warehouse`; bộ lọc bỏ kho `disabled` |
| WMS-003 | Phân loại Receiving/Quarantine/Transit/WIP/Damaged | Cây `Warehouse` — **cần cấu hình lúc go-live** |
| WMS-004 | Purchase Receipt tăng tồn đúng kho nhận | **Nhập hàng** |
| WMS-005 | Item cần QC không available-for-pick trước khi đạt | Kho Quarantine + **Kiểm tra chất lượng** |
| WMS-007 | Chuyển kho 2 bước qua Transit | **Chuyển kho** (`Stock Entry`) |
| WMS-008 | Hai người xác nhận giao/nhận | Phiếu từ màn công nhân để **nháp**; duyệt bằng workflow — **cần cấu hình** |
| WMS-010 | Outbound reservation/pick/pack | **Xuất hàng** |
| WMS-011 | Không pick vượt khả dụng | Cột **Khả dụng**; màn Chuyển kho nhanh **chặn tại nút** |
| WMS-012 | Return về Quarantine | Bản trả hàng của Purchase Receipt / Delivery Note |
| WMS-013 | Kiểm kê tách người đếm ↔ duyệt | **Kiểm kê**, giới hạn role Stock Manager |
| WMS-014 | Barcode nhận diện Item/UOM | `barcodes` giữ trong profile Item; màn công nhân quét mã |
| WMS-015 | Truy được người/thời điểm/chứng từ | Stock Ledger + audit của Frappe |
| WMS-016 | Item cần truy xuất phải có Batch | `Batch`; `has_batch_no` giữ trong profile Item |
| WMS-017 | Cấm tồn âm với Item Batch/Serial | `Stock Settings` phía site |
| WMS-018 | Lot Hold/Quarantine không được pick | `Batch.disabled` giữ trong profile |
| §19 DSH-002 | Dashboard kho: tồn, chờ nhận/xuất, expiry | Màn Tồn kho + 4 báo cáo |

Tuân thủ §6: **#2** không sửa lõi ERPNext · **#3/#4** không có sổ kho thứ hai, mọi thay đổi tồn đi
qua chứng từ chuẩn (màn Tồn kho **chỉ đọc**) · **#9** tách Company/kho bằng User Permission.

---

## 4. Chưa làm — nói rõ để không ai tưởng đã xong

| Việc | Vì sao |
|---|---|
| **WMS-009** Inventory Discrepancy | BRD đòi luồng quy trách nhiệm + phê duyệt. ERPNext **không có** DocType này — phải tạo mới + workflow, là một đợt riêng |
| **WMS-006** Putaway theo rule | ERPNext có `Putaway Rule` nhưng cần chốt quy tắc sắp xếp trước |
| **WMS-008 / WMS-013** tách vai trò 2 người | Là **Workflow + Role** cấu hình phía site, không phải code frontend |
| Vị trí/kệ trong kho | BRD nói "kho, khu, kệ, vị trí"; ERPNext chuẩn dừng ở Warehouse — sâu hơn cần DocType riêng |
| §11 Sản xuất · §12 Nhập khẩu · §13 CRM · §14 Công nợ · §15 Phê duyệt · §16 Công việc · §17 Nhân sự/3P · §18 MISA | Ngoài phạm vi "app Kho" |

---

## 5. Đã deploy & đối chiếu dữ liệu thật (2026-07-25)

**LIVE: http://222.255.238.178/kho/** — VPS 222.255.238.178, container `frappe_docker-frontend-1`,
thư mục static `sites/metaforge-kho`, API proxy sang site `metaforge.localhost`
(frappe + erpnext + hrms + aphvh + metaforge).

Đăng nhập thử: `wms.demo@aphvh.local` / `Wms@Demo2026`

### Đã xác minh trên site thật

| Kiểm tra | Kết quả |
|---|---|
| `/kho/` + asset + `/kho/api/method/frappe.ping` | 200 |
| Site khách `/` và app demo `/wms/` sau khi deploy | 200 — không ảnh hưởng |
| `Bin` trả tồn thật | ✅ SP-002/SP-003 tại "Nhận hàng APH - APH", "Lưu trữ B APH - APH"… |
| Lọc kho lá (`is_group:0, disabled:0`) | ✅ 5+ kho |
| Business context đa công ty | ✅ APH · VH · HKD01 · HKD02 |
| 4 Query Report chuẩn tồn tại | ✅ cả 4 |
| **14 form profile đối chiếu meta thật** | **13 đúng hoàn toàn, 1 sai — đã sửa** |

Mức rút gọn form thực đo trên site:

| DocType | Field trong meta | Profile giữ |
|---|---:|---:|
| Delivery Note | 164 | 13 |
| Purchase Receipt | 149 | 13 |
| Item | 133 | 22 |
| Stock Entry | 87 | 12 |
| Warehouse | 38 | 10 |

> **Lỗi đã bắt được nhờ đối chiếu:** `Delivery Note` **không có** field `remarks` (khác Purchase
> Receipt / Stock Entry) — trường ghi chú của nó tên là `instructions`. Đã sửa và redeploy.
> Field sai tên không gây lỗi, chỉ lặng lẽ không hiện — nên bước đối chiếu này là bắt buộc mỗi khi
> đổi profile.

### Quy trình deploy lại

```bash
cd apps/kho-vn && npx vite build --base=/kho/     # PHẢI chạy qua PowerShell — MSYS làm hỏng --base
tar -czf /tmp/kho-vn-dist.tgz -C dist .
scp -i ~/.ssh/id_rsa /tmp/kho-vn-dist.tgz root@222.255.238.178:/tmp/
# trên VPS: docker cp → chown frappe → chmod a+rX → atomic mv (giữ .bak.<timestamp>)
```

**Rollback:** đổi tên `metaforge-kho.bak.<timestamp>` về `metaforge-kho` (không cần restart
container — static thuần). Các bản backup còn trên VPS: `20260725-051933` (app kho cũ),
`084512`, `084803`.

**Không đụng nginx** — block `location /kho/` đã có sẵn từ trước. Lưu ý nginx của container này
**ephemeral**, mất khi container recreate; nếu mất thì re-apply `scripts/nginx_patch_kho.py`.

### Còn phải kiểm bằng tay trên trình duyệt

- Tên role trong `NAV_ROLES` khớp role thật của site (user demo là System Manager nên thấy hết menu).
- Hai màn công nhân `/kho/x/tra-ton` và `/kho/x/chuyen-nhanh` với máy quét mã thật.
- Luồng ghi: "Chuyển kho nhanh" tạo `Stock Entry` nháp — mới verify được API, chưa bấm thật trên UI.
