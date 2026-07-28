# Phân bón — CRM, Kho, Công nợ và trang bán hàng

> Nguồn: `server/briefs/phanbon.json` · `server/packages/frappe-api/src/storefront.ts` ·
> `server/packages/frappe-api/src/files.ts` · `client/apps/runtime/src/storefront/Storefront.tsx`

Một nhà máy phân bón bán ba nhóm hàng cho ba kiểu khách. Đó là toàn bộ lý do app này khác
một app bán hàng chung:

| Nhóm hàng | Khách | Trục chính |
|---|---|---|
| Phân bón | Đại lý, HTX/nông trại | Khách tiềm năng → chăm sóc → **báo giá** → đơn → **công nợ** |
| Gạo | Bán lẻ và đại lý | Trang bán hàng công khai + đơn nội bộ |
| Rượu (dưới 15 độ) | Bán lẻ | Trang bán hàng công khai, có xác nhận đủ 18 tuổi |

Hai trục dùng **chung một danh mục sản phẩm** và **chung một sổ kho**. Tách ra là cách chắc
chắn nhất để giá trên web lệch giá trong kho, và người phát hiện sẽ là khách.

## Hai màn hình, một hệ thống

| | Đường dẫn | Ai vào được |
|---|---|---|
| **Trang bán hàng** | `/shop`, `/shop/<slug>`, `/shop/cart`, `/shop/track` | Bất kỳ ai, không cần đăng nhập |
| **CRM + Kho + Công nợ** | `/app/...`, `/x/...`, `/report/...` | Nhân viên, sau khi đăng nhập |

Cùng một bundle, cùng một origin. Đó là điều làm cho ảnh `/files/…` và lời gọi
`forge.storefront.catalog` chạy được mà không cần deploy thêm, không proxy, không CORS.

## ĐÃ LIVE — 2026-07-27

| | |
|---|---|
| Trang bán hàng | **https://phanbon.kairo.vn/shop** |
| CRM nội bộ | **https://phanbon.kairo.vn/app/Sales%20Order** |
| Tra cứu đơn | https://phanbon.kairo.vn/shop/track |
| Tenant | `phanbon` · D1 `cloudforge-phanbon` (`5e3bb2ad-e204-41b5-8b13-e47fa1172d23`) |
| Worker | `cloudforge-tenant-phanbon` trong dispatch namespace `cloudforge-production` |
| Ảnh | R2 `cloudforge-files`, key theo tiền tố tenant |
| App | `phanbon@1.0.1` — 18 doctype, 2 workflow, 9 fixture, 19 mục menu |
| Quản trị | `trieu.nt93@gmail.com` — mật khẩu lưu ở memory `forge-platform-secrets` |

Kiểm tra trên chính deployment đó, **không dùng cookie hay token nào** (đúng thứ trình duyệt
khách gửi): **25/25 PASS** — danh mục không lộ giá vốn, sản phẩm chưa publish không bán được
kể cả khi gọi thẳng mã hàng, ảnh phục vụ công khai và cache vĩnh viễn, giá do server tính
(client khai 1đ vẫn tính 620.000đ), tra đơn cần cả mã lẫn số điện thoại và chấp nhận `+84`,
còn `frappe.client.get_list` và `/api/resource/Item` vẫn đóng với khách lạ.

Dữ liệu mẫu đã nạp: 4 sản phẩm publish (NPK 16-16-8, Ure 46%N, gạo ST25, rượu nếp 12 độ) đều
có ảnh thật trong R2, 1 sản phẩm cố ý **không** publish để kiểm chứng nó vô hình, 2 kho,
2 khách hàng (đại lý + HTX) và 1 khách tiềm năng.

## Đã chứng minh tới đâu

Chạy thật trên workerd + D1 + R2 (không phải giả lập tầng nào):

| Kiểm chứng | Kết quả | Ở đâu |
|---|---|---|
| Đơn hàng → xuất kho → hoá đơn → thu tiền, tồn và công nợ khớp sổ | **6/6** | `apps/tenant-worker/test/phanbon-o2c.integration.test.mts` |
| Trang bán hàng công khai: catalog, đặt hàng, tra đơn | **15/15** | `apps/tenant-worker/test/storefront.integration.test.mts` |
| Ảnh sản phẩm: upload → R2 → phục vụ công khai | **10/10** | `apps/tenant-worker/test/files.integration.test.mts` |
| Tenant mới nhận đủ ERP core và role dùng được | **7/7** | `apps/tenant-worker/test/tenant-provisioning.integration.test.mts` |
| Toàn bộ workerd | **128/128** + query 3/3 | `npm run test:workers` |
| Test Node + cổng SQL + brief | **414/414** · 6/6 · 4/4 | `npm run test` · `npm run brief:check` |
| Cổng phát hành | **ok:true · missing:[]** | `npm run check:business-suite` |

Bốn điều đáng nói vì mỗi điều là một cách hỏng đã bị bắt tại chỗ:

1. **Đơn hàng không trừ tồn; phiếu xuất mới trừ.** Kiểm bằng cách đếm sổ kho trước và sau.
2. **Xuất quá tồn bị TỪ CHỐI trong giao dịch** — 500 bao khi kho còn 70 thì lệnh ghi hỏng,
   và tồn không đổi một đơn vị nào.
3. **Sổ cái cân**: tổng nợ = tổng có. Sổ không cân không phải chuyện làm tròn để mai tính;
   nó có nghĩa mọi báo cáo dựng trên đó đều sai theo cách không ai đối chiếu nổi.
4. **Thu tiền đưa công nợ về 0** — đo trên `payment_ledger_entries`, không phải trên form.

## Trang bán hàng: ba điều được thi hành ở server

### 1. Danh sách trắng field — không phải "ẩn ở giao diện"

`storefront.catalog.fields` trong brief liệt kê **đúng** những field khách được thấy. Trên
cùng DocType `Item` còn có `valuation_rate` (giá vốn); giá đại lý nằm ở `Item Price`. Một API
"đọc sản phẩm" trả cả bản ghi là đủ để đối thủ biết biên lợi nhuận. Field không liệt kê thì
không bao giờ ra ngoài — kể cả khi client hỏi thẳng tên nó.

Test ghim điều này: mọi bản ghi trả về đều **không có** `valuation_rate`, `published`,
`disabled`.

### 2. Giá do server tính

Trình duyệt gửi **mã hàng và số lượng**. Đơn giá đọc từ chính bản ghi đã publish, ở server.
Test gửi `rate: 1` cho bao phân 620.000đ và kiểm rằng đơn lưu xuống vẫn là 620.000đ.

Sản phẩm chưa `published` thì **không bán được** kể cả khi khách gọi thẳng mã hàng.

### 3. Tra cứu đơn cần hai yếu tố

Mã đơn `DW-2026-00001` là dãy đoán được. Nếu tra cứu chỉ cần mã, bất kỳ ai cũng duyệt được
tên, địa chỉ và số điện thoại của toàn bộ khách hàng. Tra cứu đòi **mã + số điện thoại đã
đặt**, và trả lời **giống hệt nhau** cho "không có đơn này" và "sai số điện thoại" — khác
nhau là tự nó đã là thông tin.

Số điện thoại được chuẩn hoá: người gõ `0912…` lúc đặt và `+84912…` lúc tra là một người.

### Đơn web là YÊU CẦU MUA, không phải chứng từ

Đơn từ trang web **không trừ tồn và không lên công nợ**. Nhân viên gọi xác nhận rồi mới tạo
Sales Order thật — đó mới là chỗ tồn được giữ. Nếu khách vãng lai trừ được tồn trực tiếp thì
một người bấm nghịch hai mươi lần là kho ảo hết hàng, và không có cách phân biệt đơn thật với
đơn rác.

Giỏ hàng nằm trong trình duyệt, **không có bảng cart trong CSDL**: bảng giỏ hàng cho khách vô
danh là nguồn rác lớn nhất của mọi hệ bán hàng và không đổi lại được gì.

## Ảnh sản phẩm

Chuỗi upload trước đây **đứt** ở giữa: giao diện có nút đính kèm gọi `upload_file`, và không
có gì trả lời method đó. Nay:

- `POST /api/method/upload_file` — multipart, cần phiên đăng nhập, ghi vào R2.
- `GET /files/<id>/<tên>` — phục vụ lại. File **công khai** cache `immutable` (id ngẫu nhiên,
  không bao giờ dùng lại nên bytes sau một URL không đổi được); file **riêng tư** là
  `private, no-store` và được kiểm quyền theo đúng tài liệu nó đính kèm.
- **SVG bị từ chối.** Ở mọi nơi khác nó là ảnh; ở đây nó mang `<script>` và chạy cùng origin
  với Desk. Một file SVG upload lên là một lỗ XSS ăn cắp phiên. Từ chối tại cửa, không lọc —
  lọc SVG là ván cờ thua trước mọi tính năng SVG tương lai.

## Trước khi deploy: hai việc phải làm tay

```bash
# 1. Tạo bucket R2 (một lần cho cả nền tảng)
npx wrangler r2 bucket create cloudforge-files

# 2. Cấp tenant riêng cho khách — KHÔNG chạy provision-standard-metadata cho tenant này
npx wrangler d1 create cloudforge-phanbon
node scripts/provision-tenant.mjs --tenant phanbon --database-id <uuid> \
  --route phanbon.example.com --control-url https://<control> --admin <email>
```

**Vì sao không provision catalog chuẩn cho tenant này:** app `phanbon` tự mang theo `Item`,
`Customer`, `Sales Order`… dưới đúng tên chuẩn (để controller bán hàng và kho nhận ra chúng),
còn installer thì **từ chối ghi đè doctype nó không sở hữu**. Đó là bảo vệ đúng — nó ngăn một
app âm thầm định nghĩa lại dữ liệu của app khác — nhưng nó cũng có nghĩa tenant chạy app này
phải sạch. App chính là danh mục.

Rồi cài app:

```bash
FORGE_ADMIN_PASSWORD=… node scripts/forge-app.mjs briefs/phanbon.json \
  --origin https://<gateway> --admin <email>
```

Deploy nền tảng (chỉ khi platform đổi, không phải khi thêm app) — xem
[APP_FACTORY.md](APP_FACTORY.md#deploy-nền-tảng-chỉ-khi-platform-đổi-không-phải-khi-thêm-app).

## Vận hành hằng ngày

| Việc | Ở đâu |
|---|---|
| Khách gọi tới hỏi giá | Khách tiềm năng → Chăm sóc khách (có **ngày hẹn lại**) |
| Báo giá cho đại lý | Báo giá → workflow **duyệt giá** (người soạn không tự duyệt được) |
| Chốt đơn | Đơn hàng → Phiếu xuất kho → Hoá đơn → Phiếu thu |
| Đơn từ web | "Xác nhận đơn web" → gọi khách → chuyển thành Đơn hàng |
| Đưa sản phẩm lên web | Sản phẩm → bật `published`, điền `slug`, `retail_price`, ảnh |
| Xem công nợ | Báo cáo "Công nợ theo khách hàng" |

Năm báo cáo có sẵn: công nợ theo khách, doanh số theo khách, báo giá theo trạng thái, chăm sóc
khách theo nhân viên, đơn web theo trạng thái. Xuất Excel/CSV có sẵn ở màn báo cáo chung.

## Chưa làm — nói rõ để không ai tưởng đã có

| Hạng mục | Vì sao chưa, và cần gì để có |
|---|---|
| **Hạn mức công nợ chưa CHẶN được lúc bán** | `Customer.credit_limit` ghi và đọc được, hiện trên báo cáo, nhưng chưa từ chối đơn vượt hạn mức. Chặn thật phải đọc tổng nợ **trong cùng giao dịch**; "kiểm rồi ghi" ở ngoài thì hai người bán cùng lúc sẽ cùng qua cửa kiểm. Cần một app Worker. |
| **Chưa nối hãng vận chuyển** | Phiếu xuất có người giao, biển số xe; chưa có vận đơn GHN/GHTK/VTP. |
| **Chưa có thanh toán trực tuyến** | Đơn web chỉ có COD và chuyển khoản thủ công. |
| **Sản xuất mới ở mức phiếu kho** | Lệnh sản xuất (`Work Order`) và định mức (`BOM`) có trong catalog chuẩn nhưng brief này chưa khai màn cho chúng; nhập kho thành phẩm đang đi qua Phiếu kho `Material Receipt` với số lô. |
| **Bảng giá theo đại lý chưa có màn riêng** | `Item Price` + `Pricing Rule` có trong nền; brief chưa dựng màn quản lý bảng giá. |
| **Rượu từ 15 độ trở lên** | Cố ý không đưa lên trang công khai — Luật PCTH rượu bia 2019 cấm quảng cáo. Bán cho đại lý vẫn ghi nhận bình thường trong CRM. |

## Những gì phải sửa ở NỀN TẢNG để app này chạy được

Ghi lại vì mỗi cái đều **xanh mọi cổng** trước khi bị bắt:

| Lỗi nền tảng | Vì sao lọt |
|---|---|
| **Tenant mới không có Item, Customer, Sales Order.** 43 doctype ERP cốt lõi chỉ được seed cho tenant `demo`, không nằm trong catalog chuẩn — nên `provisionStandardCatalog` báo thành công, chép 43 doctype khác, và khách mới không tạo nổi một sản phẩm | mọi test đều chạy dưới tenant `demo`, đúng tenant duy nhất có sẵn chúng. Nay `migrations/tenant/0021` promote lên `__standard__`, và test provisioning chạy dưới tenant KHÔNG phải demo |
| **Provisioning tạo doctype nhưng không tạo role.** Metadata nói "Stock Manager được ghi", bảng `roles` không có dòng đó, và trigger từ chối gán → không ai ngoài System Manager dùng được | cùng họ với lỗi trên: chỉ lộ ra trên tenant mới, và chỉ khi có người thử phân công nhân viên |
| **`upload_file` chưa từng tồn tại.** Giao diện gọi nó từ ngày có control đính kèm | không test nào ở phía server hỏi "method này có ai trả lời không"; phía client thì mock |
| **R2 chưa bind.** `env.FILES` là optional, nên code file có sẵn nhưng chạy thật trả "File storage is not configured" | binding thiếu không làm hỏng build, không làm hỏng test, chỉ hỏng lúc người dùng bấm nút |
| **Brief mẫu ghi sai tên field của phiếu thu** (`party_account` thay vì `paid_from`, thiếu `payment_type`, `received_amount`) | phiếu thu chưa từng được chạy thật trên brief nào; dry-run chỉ kiểm cú pháp, không gọi controller |

Ba năng lực mới của nền tảng sinh ra từ app này, dùng được cho mọi app sau:
**`customFields`** (app thêm field vào doctype chuẩn, có sở hữu và gỡ được),
**`storefront`** (mặt tiền công khai khai bằng dữ liệu), và **tầng file** (upload + phục vụ).
