# Công xưởng app — mô tả một app, ra một URL sống

> Nguồn: `server/scripts/forge-app.mjs` · `server/scripts/lib/compile-brief.mjs` ·
> `server/briefs/` · `client/apps/runtime/` · `server/apps/gateway-worker/`

Một app mới **không cần build, không cần deploy, không cần host gì thêm.** Viết một brief,
chạy một lệnh, mở URL.

```bash
FORGE_ADMIN_PASSWORD=… node scripts/forge-app.mjs briefs/assets.json \
  --origin https://<gateway> --admin <user>
```

```
1 compiled   app=assets@1.0.1 doctypes=2 workflows=1 roles=2 fixtures=1 nav=3
2 validated  through the server's own parser
3 installing  https://…workers.dev as forge@kairo.vn … installed
4 verifying   client manifest resolves … ok (3 nav entries, home /x/approval%3AAsset%20Request)
5 verifying   context dimensions have data … ok (company:2)

LIVE  https://…workers.dev/x/approval%3AAsset%20Request
```

## Vì sao trước đây chưa phải công xưởng

Backend đã sinh app được từ lâu: khai DocType bằng JSON → có ngay ~60 method + REST, per-tenant,
không deploy lại. **Nhưng giao diện thì không.** Mỗi app phải có một bản build React riêng, vì
`src/app-manifest.ts` — brand, màn chủ, nav, chiều dữ liệu — là TypeScript biên dịch cứng vào bundle.
Và bundle đó **không có chỗ ở trên Cloudflare**: nó chỉ chạy sau một proxy loopback trên máy lập
trình viên, vì cookie phiên là `Secure`+`SameSite=Lax` nên trình duyệt không gửi qua origin khác.

Nên "cài app" chỉ làm được nửa việc, và hai nửa có thể lệch nhau.

Ba mắt xích đã nối:

| | Trước | Nay |
|---|---|---|
| Giao diện ở đâu | máy lập trình viên, sau proxy | gateway phục vụ tĩnh, **cùng origin** với API |
| Manifest client | file TS biên dịch cứng mỗi app | `metaforge.api.get_app_manifest` — server dựng từ app đã cài |
| Màn tác nghiệp | React viết tay cho từng DocType | suy từ workflow hoặc khai `screens` (`screen:<name>`) |

Kết quả: **một bundle duy nhất phục vụ mọi app**, và thêm app là một lệnh ghi dữ liệu.

## Brief: khai cái gì

Brief là mô tả nhỏ nhất mà từ đó suy ra được một app chạy được. Xem `server/briefs/assets.json`
(~70 dòng → 2 DocType, 1 workflow, 2 vai trò, ma trận quyền, màn duyệt, nav, manifest client).

```jsonc
{
  "id": "assets", "name": "Quản lý tài sản CNTT",
  "domain": "assets", "brand": "warm",
  "dimensions": ["company"],
  "roles": ["Nhân viên IT", "Trưởng phòng IT"],
  "home": "approval:Asset Request",
  "fixtures": [{ "type": "Company", "name": "Kairo", "data": { … } }],
  "doctypes": [{
    "name": "Asset Request", "label": "Yêu cầu cấp tài sản",
    "naming": "YC-.YYYY.-#####", "title": "requested_for",
    "list": ["requested_for", "category", "needed_by", "workflow_state"],
    "fields": [
      "requested_for:Data! Cấp cho",
      "category:Select(Máy tính,Màn hình,Khác)! Nhóm tài sản",
      "quantity:Int! Số lượng",
      "company:Link(Company)! Công ty",
      "notes:Small Text Ghi chú"
    ],
    "permissions": { "Nhân viên IT": "rwcs", "Trưởng phòng IT": "rwcsxa" },
    "workflow": {
      "states": { "Nháp": 0, "Chờ duyệt": 0, "Đã duyệt": 1, "Từ chối": 2 },
      "transitions": [
        ["Nháp", "Gửi duyệt", "Chờ duyệt", "Nhân viên IT"],
        ["Chờ duyệt", "Duyệt", "Đã duyệt", "Trưởng phòng IT"]
      ]
    }
  }]
}
```

### Ngôn ngữ trường

`<fieldname>:<Kiểu>[(tuỳ chọn)][modifier][=mặc định][ Nhãn]` — modifier: `!` bắt buộc · `*` duy nhất
· `~` chỉ đọc. Mặc định có dấu cách thì đặt trong ngoặc: `=(Đang liên hệ)`. Nhãn thiếu thì suy từ
fieldname. Kiểu hai từ (`Small Text`, `Text Editor`, `Attach Image`) khớp **dài nhất trước** — cắt ở
dấu cách đầu sẽ đọc `Small Text` thành kiểu `Small`, và với Frappe đó là trường hợp thường chứ không
phải ngoại lệ.

### Chữ quyền

`r` đọc · `w` ghi · `c` tạo · `s` submit · `x` cancel · `a` amend.

**Không có `d`, và nó bị TỪ CHỐI chứ không bị bỏ qua.** Trong nhân này xoá là hành vi hạng "write"
(`deleteDocument` xác thực qua đường ghi), nên viết `"rwc"` mà tưởng đã chặn xoá là **sai** — vai trò
đó xoá được. Chấp nhận `d` sẽ để tác giả mã hoá một chính sách platform không thi hành và không bao
giờ biết.

`r` tự kéo theo `print`, `email`, `report`, `export`. Giữ lại mấy quyền đó là chính sách rất riêng;
lấy nó làm mặc định chỉ tạo ra app có nút in bấm vào không làm gì.

### Workflow

`allow_self_approval` mặc định **false** trên mọi transition làm tăng docstatus. Đây là lý do chính
để biên dịch thay vì viết tay: phân lập trách nhiệm chính là mục đích của workflow duyệt, và workflow
viết tay quên cờ này sẽ âm thầm cho người tạo tự duyệt đơn của mình. Muốn ngược lại thì phải ghi rõ:
`["Chờ duyệt","Duyệt","Đã duyệt","Quản lý","self"]`.

Trường trạng thái được **tự thêm** (Select, read-only, options = danh sách state). Quên nó thì
workflow ghi vào cột DocType không có, và hỏng ngay ở transition đầu tiên.

## Design Contract và màn riêng cài cùng app

`brand` chỉ chọn bảng màu. App có thể điều chỉnh ngôn ngữ hình khối và nhịp giao diện mà không
fork CSS:

```json
"brand": "aurora",
"design": {
  "density": "compact",
  "radius": "soft",
  "contentWidth": "wide"
}
```

| Thuộc tính | Giá trị |
|---|---|
| `density` | `compact` · `comfortable` · `touch` |
| `radius` | `square` · `soft` · `round` |
| `contentWidth` | `contained` · `wide` · `fluid` |

App cần một bàn điều hành riêng không còn phải nhét React của một khách vào bundle dùng chung.
Khai `screens` trong brief; compiler sinh `screen:<name>`, server lọc theo quyền và runtime chung
dựng màn:

```json
"home": "screen:sales-cockpit",
"screens": [{
  "name": "sales-cockpit",
  "label": "Bàn điều hành bán hàng",
  "permission": "Lead",
  "mode": "focus",
  "columns": 2,
  "group": "Điều hành",
  "blocks": [
    {
      "id": "open-leads",
      "type": "metric",
      "label": "Khách tiềm năng",
      "doctype": "Lead",
      "filters": { "status": "Open" },
      "tone": "info",
      "route": "/app/Lead"
    },
    {
      "id": "latest-leads",
      "type": "list",
      "label": "Mới cập nhật",
      "doctype": "Lead",
      "fields": ["name", "lead_name", "status"],
      "orderBy": "modified desc",
      "limit": 8
    },
    {
      "id": "send-quote",
      "type": "action",
      "label": "Gửi báo giá",
      "action": "gui-bao-gia",
      "span": 2
    }
  ]
}]
```

Ba block đầu tiên cố ý hẹp:

- `metric`: đếm một DocType với bộ lọc đã kiểm field.
- `list`: đọc các field đã khai, có sắp xếp và giới hạn tối đa 50 dòng.
- `action`: nhúng một action đã khai trong chính app.

Không nhận HTML, JavaScript hay endpoint tuỳ ý. Mọi dữ liệu vẫn đi qua adapter, context nghiệp vụ
và quyền DocType hiện hữu; action vẫn cần Worker và quyền ghi. Tên DocType, field, filter, action,
`span` và route được kiểm cả lúc biên dịch brief lẫn lúc server nhận package. Ranh giới này giữ
được hai điều cùng lúc: app có màn thật sự riêng, nhưng “cài app” vẫn là cài dữ liệu chứ không biến
thành một lần deploy code.

`mode` nhận `desk`, `focus`, `touch`; nó là ý định bố cục của màn, tách khỏi `design.density` là nhịp
chung của toàn app. `menu: false` giữ màn có thể mở bằng URL hoặc làm home nhưng không chiếm chỗ
trong sidebar. Tên trong brief là tên cục bộ; compiler tự thêm namespace app vào package và route
(`screen:sales-cockpit` của app `crm` thành `screen:crm-sales-cockpit`) để hai app cài chung không
thể giành cùng một URL.

## Màn tác nghiệp suy từ metadata

Khai một workflow là có luôn màn duyệt (`kind: "experience"`, key `approval:<DocType>`), không viết
dòng code nào:

| Màn hỏi gì | Lấy từ đâu |
|---|---|
| state nào còn việc | `__workflow_docs[0].transitions[].state` — suy từ đồ thị, không cấu hình |
| hồ sơ nào đang chờ | `get_list` lọc theo state field của chính workflow |
| nút nào bật cho user này | `get_workflow_transitions` — **SERVER quyết**, không đoán ở client |
| thẻ hiện trường gì | `in_list_view` của DocType |

Đoán bất kỳ mục nào ở client đều tạo ra nút bấm vào thì lỗi: user này có được duyệt hay không phụ
thuộc vai trò và `allow_self_approval`, chỉ server biết.

## Báo cáo — app tự khai, không phải phát hành nền tảng

Báo cáo từng là bảng cứng trong nền tảng, trên các SQL view kế toán. Nay khai trong brief:

```json
"reports": [{
  "name": "Ghi danh theo lớp",
  "doctype": "Enrollment",
  "columns": ["class_group:Link(Class Group) Lớp học", "count(name):Int Số ghi danh",
              "sum(discount_amount):Currency Tổng giảm giá"],
  "groupBy": "class_group",
  "orderBy": "count(name) desc",
  "filters": ["class_group", "tuition_plan", "workflow_state"]
}]
```

Mỗi báo cáo thành một mục menu (nhóm "Báo cáo"), gắn `permission_doctype` để **không mời** người
không đọc được dữ liệu vào một màn sẽ từ chối họ. Xuất Excel/CSV do màn báo cáo chung lo — không
khai gì thêm.

Cột viết gọn `<field>:<Type> Nhãn`, hoặc `<agg>(<field>):<Type> Nhãn` với `count/sum/avg/min/max`.
`count(name)` đếm **bản ghi** — đếm một field JSON sẽ âm thầm bỏ qua bản ghi thiếu field đó, và
"bao nhiêu" thì không bao giờ có nghĩa như vậy.

**Bốn ràng buộc, mỗi cái chặn một con số sai chứ không phải một lỗi cú pháp:**

| Ràng buộc | Không có thì |
|---|---|
| có cột gộp ⇒ bắt buộc `groupBy` | SQLite trả một dòng tuỳ ý cho mỗi cột trần, không báo lỗi — báo cáo hiện số **sai mà hợp lý** |
| đã `groupBy` ⇒ cột trần phải chính là field gộp | như trên |
| `Link` ⇒ phải nêu doctype đích | cột khoá in ra `LOP-2026-0001` thay vì tên lớp |
| field phải là tên thuần, giá trị lọc luôn tham số ràng buộc | tên field đi thẳng vào SQL, và nó sẽ được biên dịch lại ở **mọi** lần chạy sau |

App không nêu được bảng (luôn là `documents`, lọc đúng một doctype), không với sang tenant khác
(`tenant_id` luôn là tham số thứ nhất), không với sang app khác (doctype phải là của chính nó).
Bản ghi đã huỷ (`docstatus=2`) bị loại — để lại thì mọi tổng đều âm thầm lớn hơn thực tế.

## Bước kiểm 4 và 5 — vì sao có

Cài xong sạch mà app vẫn không mở được là chuyện đã xảy ra thật, nên lệnh không báo thành công khi:

- **home không tới được** → router rơi vào catch-all, catch-all lại điều hướng về home: vòng lặp.
- **user không thấy nav nào** → ma trận quyền trong brief sai.
- **chiều dữ liệu bắt buộc không có master data** → shell chặn ở "Cần chọn phạm vi dữ liệu" trên một
  selector không bao giờ có tuỳ chọn. App cài hoàn hảo, manifest hoàn hảo, và không ai qua nổi màn
  đầu. Brief sửa bằng cách kèm `fixtures`.

"Lệnh chạy xong" và "người dùng mở được" phải là một câu.

## Deploy nền tảng (chỉ khi platform đổi, không phải khi thêm app)

```bash
# client bundle
cd client/apps/runtime && npx vite build
cd ../../../server && node scripts/stage-client-bundle.mjs
npx wrangler deploy --config apps/gateway-worker/wrangler.jsonc

# tenant workers
node scripts/deploy-tenant.mjs --all

# tenant mới (một lệnh)
node scripts/provision-tenant.mjs --tenant <id> --database-id <uuid> --route <host> …
```

`apps/gateway-worker/public/` là **sinh ra**, không commit. `not_found_handling: "none"` là cố ý:
`"single-page-application"` sẽ trả index.html cho cả `/api/method/login`, tức toàn bộ API hoá HTML.

## Đã chứng minh tới đâu

Trên deployment thật, hai tenant (`demo` và `hrm`):

| | |
|---|---|
| brief → cài → URL sống | ✅ một lệnh, `assets@1.0.1` |
| **một bundle, hai app khác nhau** | ✅ cùng `index-DgFEryiM.js` phục vụ "Quản lý tài sản CNTT" và "Quản lý nhân sự" |
| nghiệp vụ đầu-cuối qua đường cookie | ✅ **13/13** — tạo, đặt tên tự động, gửi duyệt, chặn tự duyệt (403 *"You cannot approve a document you created"*) |
| trình duyệt thật, desktop + mobile, **không proxy** | ✅ **10/10** |
| test Node | ✅ **395/395** |
| Workerd | ✅ **90/90** |

Trên tenant `edu` (CloudForge Center), thêm hai thứ mà brief một mình không nói được:

| | |
|---|---|
| **app Worker chạy đủ vòng** | ✅ nền tảng gọi tới, Worker gọi ngược, đọc **và ghi** với danh tính người dùng đã gọi |
| luật chống trùng lịch | ✅ 4 ca: không trùng · trùng phòng · trùng giáo viên · **kề nhau vẫn cho qua** |
| **báo cáo do app tự khai** | ✅ 4 báo cáo, đối chiếu được (tổng chuyên cần = 288 = số bản ghi trong CSDL) |
| xuất Excel từ báo cáo và từ danh sách | ✅ tải về `.xlsx` thật |
| nhập CSV/Excel trong runtime | ✅ |
| trình duyệt thật, desktop + mobile | ✅ **9/9** (1 skip: danh sách mobile là thẻ, không có chọn hàng loạt) |

App HRM cũng đã chuyển sang bundle chung — bản build React riêng của nó không còn cần.

## Lỗi bắt được khi làm việc này

Ghi lại vì mỗi lỗi đều **xanh mọi cổng** trước khi bị bắt:

| Lỗi | Vì sao lọt |
|---|---|
| **Nâng cấp app chỉ được đúng một lần.** Installer mang theo revision đang lưu cho DocType nhưng không cho workflow/print format, nên lần nâng cấp thứ hai vỡ với `The document changed after it was loaded` | phải nâng cấp **hai lần** mới thấy; mọi test đều chỉ nâng cấp một lần. Nay ghim ở `frappe-facade.integration.test.mts` |
| **Server và client mã hoá route khác nhau.** `resolveNavPath` dùng `encodeURIComponent`, còn bộ kiểm manifest giữ **bản sao riêng** không mã hoá → app đầu tiên sinh từ brief mở ra "Không dựng được giao diện", do chính cái guard chống-vòng-lặp bắn nhầm | luật viết hai lần và trôi dạt; **không có test nào cho `validateManifest`**. Nay gộp về `resolveNavPath` và ghim bằng test liên-codebase `nav-path-contract.test.mjs` |
| **App HRM chưa từng chạy typecheck.** Dùng tên trường theo wire Frappe (`order_by`, `limit_page_length`) thay vì tên adapter (`orderBy`, `pageLength`) | E2E vẫn xanh: bộ lọc đúng, dữ liệu ít nên thứ tự và giới hạn trang bị bỏ âm thầm |
| **App cài xong vẫn không mở được** vì chiều `company` không có master data | install PASS, manifest PASS, nav PASS. Nay là bước kiểm 5 |
| **Cùng một env dựng ở hai chỗ, và bản thứ hai trôi mất `PUBLIC_ORIGIN`.** Validator gọi ngược được, app method thì không — cùng cơ chế, hai kết quả | không test nào chạy CẢ HAI đường trên một deployment. Nay dùng chung một object |
| **Tầng Frappe chưa từng nhìn danh tính nền tảng ký.** Nó xác thực bằng cookie, mà app callback cố ý không có cookie → mọi lời gọi ngược `403 Login to access this resource` dù chữ ký chạy suốt | mỗi tầng đúng phần của nó; **không tầng nào chịu trách nhiệm cho cả đường** |
| **"Idempotent" chỉ là chú thích.** `count` được hiểu là "thêm bấy nhiêu", nên chạy hai lần để lại gấp đôi số buổi — đúng hậu quả chú thích nói đã ngăn | chỉ lộ ở lần chạy **thứ hai**, và chỉ khi có người đếm |
| **Cột báo cáo trả về theo từ vựng của máy báo cáo** (`field`/`type`) chứ không phải của client (`fieldname`/`fieldtype`) | bảng đúng tiêu đề, đúng số dòng, **mọi ô trống**. Không gì báo lỗi, nên nó đọc ra như "không có dữ liệu" |
| **Cài lại app bị coi là "không đổi" theo hash gói.** Nền tảng nâng cấp đọc thêm được `reports`, gói y nguyên → bản parse CŨ ở lại, mọi báo cáo "Unknown report", lệnh cài báo thành công | hash so gói với gói, không so **cách nền tảng đọc gói**. Nay so cả bản parse |
| **Nút "Xuất" của danh sách chưa từng hiện.** Nó chỉ render khi cha truyền `onExport`, và không cha nào truyền | grep mã nguồn thì thấy; dùng app thì không. Nay ghim bằng test trình duyệt tải file thật |
| **Màn nhập dữ liệu nằm trong app demo**, nên mọi app khác giao ra không có đường nhập Excel | không phải chưa xây — xây rồi, để nhầm thư mục |

## Thêm field vào DocType CHUẨN — `customFields`

Một app ngành hiếm khi cần doctype sản phẩm riêng; nó cần `Item` chuẩn có thêm ảnh và quy
cách. Danh mục riêng là danh mục **thứ hai** mà sổ kho, bảng giá và mọi controller bán hàng
không nhìn thấy.

```json
"customFields": {
  "Item": ["image:Attach Image Ảnh sản phẩm", { "field": "published:Check Hiện trên web", "after": "item_name" }]
}
```

App **sở hữu** những field này: cài lại thì cập nhật, gỡ app thì gỡ đúng chúng — không đụng
field khách tự thêm trên cùng doctype. Khai custom field lên doctype do chính brief khai thì
bị TỪ CHỐI: ở đó field thuộc về `fields`, và phủ thêm một lớp overlay lên chính mình khiến
định nghĩa DocType không còn mô tả đúng thứ được cài.

## Mặt tiền công khai — `storefront`

Khách không đăng nhập đọc được gì, và đặt hàng thế nào. **Không phải** "mở `get_list` cho
guest" — chỉ cách một bộ lọc bị quên là phục vụ luôn bảng khách hàng.

```json
"storefront": {
  "catalog": {
    "doctype": "Item", "publishedField": "published", "slugField": "slug",
    "priceField": "retail_price", "facetField": "item_group",
    "fields": ["item_name", "retail_price", "image", "slug"],
    "search": ["item_name"]
  },
  "order": {
    "doctype": "Web Order", "role": "Chăm sóc khách hàng", "lines": "items",
    "placedAt": "order_date", "total": "total_amount", "trackBy": "phone",
    "buyerFields": ["buyer_name", "phone", "ship_address"], "maxPerDay": 20
  }
}
```

| Ràng buộc | Không có thì |
|---|---|
| `fields` là danh sách trắng | giá vốn nằm ngay cạnh giá bán trên cùng doctype, và một API "đọc sản phẩm" công bố nó |
| giá tính từ `priceField` ở SERVER | trình duyệt tự khai giá — không còn là cửa hàng |
| `search` phải nằm trong `fields` | tìm được field không hiện = đọc được nó bằng cách thử |
| `trackBy` là yếu tố thứ hai | mã đơn là dãy đoán được; chỉ cần mã là duyệt được toàn bộ khách hàng |
| đơn web KHÔNG trừ tồn | một người bấm nghịch làm kho ảo hết hàng |

Bốn method công khai: `forge.storefront.catalog` · `.product` · `.place_order` · `.track_order`.
Giao diện `/shop` do runtime dựng sẵn, không cần app viết gì thêm.

## Ảnh và tệp đính kèm

`POST /api/method/upload_file` (multipart, cần phiên) và `GET /files/<id>/<tên>`. File công
khai cache `immutable`; file riêng tư `no-store` và kiểm quyền theo tài liệu nó đính kèm.
SVG bị từ chối — nó là ảnh ở mọi nơi khác và là `<script>` chạy cùng origin ở đây.

Cần bucket R2 bind vào tenant worker (`FILES`). Thiếu binding thì `upload_file` trả 404 thay
vì ghi một dòng CSDL trỏ tới bytes chưa bao giờ được lưu.

### Chưa làm

- Experience mới có `approval:` và `calendar:`. Điểm danh hàng loạt (`roster:`) chưa có.
- Brief chưa khai được print format và hook (validator, worker, report thì khai được rồi).
- Nghiệp vụ TIỀN (học phí, công nợ, phiếu thu) chưa làm — §10.1 đặt ra bất biến tiền tệ mà
  check-then-act ngoài transaction của app Worker **không** thi hành nổi.
- `hrm.kairo.vn` vẫn chặn: token thiếu quyền `Zone.DNS: Edit`.
