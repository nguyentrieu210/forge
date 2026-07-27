# AUDIT — nền tảng CloudForge, đọc từ code chứ không từ tài liệu

> Spec §5. Mọi dòng dưới đây tra được về file thật. Chỗ nào runtime khác tài liệu, runtime thắng (§4.9).

## Bản đồ tái sử dụng

| Hạng mục | Thực tế trong repo | Center dùng lại được? |
|---|---|---|
| Frontend | React 18 + react-router-dom, Vite. **Một bundle chung** `client/apps/runtime` | ✅ nguyên vẹn |
| Design system | `@metaforge/ui` (Tailwind v4), `@metaforge/views`, `@metaforge/shell` | ✅ |
| Backend | Cloudflare Workers. `gateway-worker` (định tuyến + phục vụ bundle), `tenant-worker` trong dispatch namespace, `query-worker`, `jobs-worker`, `control-plane-worker` | ✅ |
| Monorepo | pnpm workspace: `server/` (npm workspaces) + `client/` (pnpm) | ✅ |
| Phân giải tenant | `routeKeyFromRequest` theo **hostname**, tra KV `ROUTES` → `{tenant_id, worker_name, status, plan}`. `?tenant=` chỉ có tác dụng ở AUTH_MODE=development | ✅ đúng §7 |
| Auth | Cookie `sid` (`Secure`+`SameSite=Lax`) + CSRF header `x-frappe-csrf-token`. Bearer JWT cho máy-tới-máy | ✅ |
| Quyền | DocPerm theo vai trò + User Permission theo bản ghi. `getReadScope` ở tầng server | ◐ xem GAP-1 |
| CSDL | **D1 riêng mỗi tenant**. Migration `server/migrations/tenant/0001…0017` | ✅ |
| Migration | `scripts/d1-migrate-remote.mjs` (KHÔNG dùng `wrangler d1 migrations apply --remote` — nó không áp được migration của repo này) | ✅ |
| File | R2 — **chưa gắn bucket**; upload trả "File storage is not configured" | ✗ GAP-4 |
| Queue | `cloudforge-outbox` + Durable Object `AggregateCoordinator` (một DO mỗi tài liệu = khoá ghi) | ✅ |
| Cron | **Không** ở tenant worker: Worker trong dispatch namespace không bao giờ chạy cron của chính nó. `jobs-worker` điều phối | ✅ |
| Audit | bảng `document_versions` + outbox event | ◐ GAP-3 |
| Workflow engine | `validateWorkflow`, `apply_workflow`, `get_workflow_transitions`, `blocksSelfApproval` | ✅ |
| Metadata engine | DocType/Custom Field/Property Setter, 43/43 fieldtype | ✅ |
| Đồng thời | token `modified` gói version vào chữ số micro giây; ghi lệch version bị từ chối | ✅ |
| App registry | `forge.apps.install/uninstall`, app = DỮ LIỆU | ✅ đây là cơ chế Center dùng |
| Provisioning | `scripts/provision-tenant.mjs` — một lệnh ra một tenant | ✅ |
| Test | `npm run test:unit` (366), `npx vitest --config apps/tenant-worker/vitest.config.mts` (88), Playwright ở `client/e2e-forge` | ✅ |

## Kết luận kiến trúc

**Center KHÔNG cần sửa nền tảng.** App được khai bằng dữ liệu (`briefs/center.json` → `forge.apps.install`),
chạy trên bundle client chung, tenant riêng, không deploy thêm gì. Theo §4.5–4.7, mọi thay đổi nền
tảng phải có lỗi cụ thể + reproduction + regression test — trong phạm vi Pha 0–2 **không có thay đổi
nền tảng nào**, ngoài hai bản vá script ghi ở CHANGELOG.

## GAP thật — đo được, không phỏng đoán

**GAP-1 · Phạm vi theo bản ghi chưa tự động.** DocPerm chặn theo VAI TRÒ (§12 chạy được ở mức đó),
nhưng "giáo viên chỉ thấy lớp được giao" (§12.7) và "quản lý cơ sở không thấy cơ sở khác" (§12.4) cần
**User Permission theo bản ghi**. Nền tảng có API (`metaforge.api.add_user_permission`) nhưng việc
CẤP tự động khi phân công lớp là tự động hoá ⇒ cần app Worker. Hiện phải cấp thủ công.

**GAP-2 · Tiền là code, không phải khai báo.** §10.1 đòi: doanh thu ≠ tiền đã thu ≠ công nợ; không
dùng float; payment đã posted bất biến; allocation không vượt outstanding; mutation idempotent. Nền có
sổ cái (`packages/ledger`, `packages/money`) **đã đối chiếu ERPNext 115/115**, nhưng nối vào app sinh
từ brief cần app Worker — **chưa app nào chạy đường đó end-to-end**.

**GAP-3 · Audit chưa đủ trường §10.6.** `document_versions` có tenant/actor/thời điểm/bản ghi, nhưng
**không có correlation ID** trên mỗi dòng. Trace ID có ở tầng HTTP, chưa gắn vào bản ghi audit.

**GAP-4 · R2 chưa gắn** ⇒ `StudentDocument`/`TeacherDocument` (§9.3, §9.5) chưa làm được.

**GAP-5 · Màn hình chỉ có một loại.** Runtime mới có `approval:<DocType>`. Điểm danh hàng loạt (§9.9
"Tất cả có mặt", ≤2 thao tác) cần loại Experience mới; lịch tuần/tháng (§9.6) cũng vậy.

**GAP-6 · Chống trùng lịch (§10.5) chưa có.** Cần validator — cơ chế có từ Pha 1–2 của nền, chưa app
nào khai.

**GAP-7 · Báo cáo (§9.13) chưa khai được bằng brief.** Bề mặt `frappe.desk.query_report.run` có sẵn.

## GAP-8 · `status` là tên nhân chiếm — tìm ra khi chạy thật, không phải khi đọc code

Nhân suy ra một cột `status` từ docstatus/workflow. Tên đó **không** nằm trong `SYSTEM_FIELDS`, nên
DocType vẫn khai được trường `status` — rồi mất im lặng ở **ba** chỗ cùng lúc:

| Đường | Hành vi sai |
|---|---|
| ghi | giá trị client gửi bị bỏ, áp mặc định của trường |
| `toFrappeDoc` | ghi đè bằng `"Draft"/"Submitted"/"Cancelled"` |
| list projection | bỏ hẳn trường |

Hệ quả trên tenant sống: **cả 120 học viên mang `status='Đang'`** — một giá trị chính DocType không
có trong options — và **cùng một trường đọc ra hai kết quả khác nhau tuỳ endpoint**. Không có lỗi nào
được ném ra ở bất kỳ đâu.

**Đã sửa (bản vá nhỏ nhất, §4.7):**
1. `toFrappeDoc` đặt `status` suy diễn **TRƯỚC** spread ⇒ trường của app thắng. Doctype không khai
   `status` giữ nguyên hành vi cũ. 2 test hồi quy ở `tests/frappe-api.test.mjs`.
2. Thêm `status` vào `SYSTEM_FIELDS` ⇒ **từ chối to** thay vì hỏng im. Guard này bắt luôn app `assets`
   đã cài trước đó — nó cũng đang hỏng mà không ai biết.
3. Đổi tên trong cả 3 app: `student_status`, `teacher_status`, `branch_status`, `room_status`,
   `program_status`, `plan_status`, `class_status`, `employee_status`, `asset_status`.
4. Nạp lại giá trị cho dữ liệu cũ.

**CÒN NỢ:** làm `status` thành trường nghiệp vụ dùng được (Frappe/ERPNext dùng nó ở Sales Order, Task,
Issue). Việc đó phải sửa cả ba đường trong nhân dùng chung ⇒ là thay đổi document engine, cần
reproduction + bộ test riêng, không phải bản vá.

## GAP-9 · Mọi biểu đồ ở mọi app đều vẽ màu ĐEN

`OverviewView` tô biểu đồ bằng `hsl(var(--chart-1..5))`. Hai chỗ sai cùng lúc:

1. **`--chart-1..5` không được khai ở BẤT KỲ đâu** trong toàn bộ client.
2. Ngay cả khi có, cách gọi vẫn sai: `styles.css` ghi rõ ở đầu file *"Token = HEX; @theme map thẳng
   `var()` (không `hsl()`)"* — code biểu đồ viết theo quy ước shadcn (HSL triplet), design system này
   dùng HEX.

Biến CSS không tồn tại ⇒ màu không hợp lệ ⇒ trình duyệt vẽ đen. Biểu đồ cột, đường và donut đều dính,
ở mọi app, từ trước tới nay — và không có lỗi nào được báo.

**Đã sửa:** khai `--chart-1..5` (HEX, riêng cho light và dark) trong `packages/ui/src/styles.css`; bỏ
`hsl()` ở cả 3 chỗ; donut thêm `<Cell>` mỗi lát (trước đó `fill` trên `<Pie>` chỉ đặt được MỘT màu cho
cả bánh). Kiểm bằng `getComputedStyle`: `rgb(37,99,235)` + `rgb(22,163,74)`, `allBlack: false`.

## GAP-10 · Form tạo mới KHÔNG dùng được — hai lỗi độc lập chồng lên nhau

Người dùng báo "form không gõ được". Thật ra là hai lỗi riêng biệt, mỗi cái đủ để chặn hoàn toàn.

### 10a · Mọi trường render chỉ-đọc

Server cho System Manager ghi mọi thứ (`isPlatformAdmin` short-circuit). Client thì quyết định
sửa-được **chỉ từ DocPerm khớp vai trò người dùng**. Brief chỉ khai 7 vai trò nghiệp vụ, không có
System Manager ⇒ `perms.write` rỗng ⇒ `readOnly: true` trên **mọi** field. API nhận document qua curl
bình thường, còn giao diện không cho gõ một chữ.

**Đã sửa:** bộ biên dịch brief **luôn** phát sinh một DocPerm cho System Manager. Metadata nói ra
đúng thứ server vốn thi hành, nên hai nửa quyết định từ một nguồn. Giải pháp thay thế — dạy client
biết tên vai trò đặc biệt — đặt chính sách vào UI, nơi nó sẽ trôi dạt. 2 test ghim.

### 10b · Ô Link không bao giờ trả kết quả

`adapterServices.searchLink` có **danh sách tên DocType cứng**:

```
["Warehouse", "Account", "Cost Center", "Branch", "Project", "Asset", "Employee"]
```

— tức là giả định mọi thứ TÊN `Branch` đều là Branch của ERPNext nên có field `company`. App tự khai
DocType `Branch` không có `company` (chuyện bình thường khi app là dữ liệu) sẽ bị client gắn thêm
`filters={"company":…}`; server từ chối **đúng luật** (`Filter field is not allowed: company`); ô Link
rỗng vĩnh viễn. Trường Link bắt buộc ⇒ **không lưu được bản ghi nào**, và thông báo duy nhất người
dùng thấy là "Bắt buộc".

Đây là đoán schema từ TÊN — chính điều mà comment ngay bên trên nó tuyên bố không làm.

**Đã sửa:** hỏi `getMeta(doctype)` và chỉ áp `company` khi DocType đích THỰC SỰ có field đó. Đọc
metadata không được thì **không lọc** — ô Link rộng hơn cần thiết vẫn dùng được, lọc nhầm thì rỗng
mãi mãi.

**Kiểm trên tenant sống:** tạo học viên từ giao diện — gõ tiếng Việt, chọn Link `CS-0001`, lưu →
`HV-2026-00125` với `branch=CS-0001`, `student_status='Đang học'`.

## GAP-11 · Deploy code KHÔNG kèm migration → sập đăng nhập

`deploy-tenant.mjs` đẩy code nhưng **không chạy migration**. Code mới có rate-limit đăng nhập, truy
vấn bảng `login_rate_limits` (migration 0018). Tenant `edu` được tạo lúc mới có 17 migration ⇒ bảng
không tồn tại ⇒ **mọi lần đăng nhập trả 500 "Internal error"**.

Triệu chứng đánh lạc hướng: `hrm` (code cũ) vẫn trả 401 sạch, nên trông như lỗi riêng của `edu`.
Thứ tự chẩn đoán đúng là so hai tenant rồi đối chiếu danh sách bảng với thư mục migration.

**Đã khắc phục:** áp 0018 cho cả ba tenant, đăng nhập trở lại 200 và sai mật khẩu ra 401.

**CÒN NỢ:** `deploy-tenant.mjs` phải chạy migration TRƯỚC khi đẩy code, hoặc từ chối deploy khi
tenant thiếu migration. Đây là bản vá quy trình, không phải bản vá code — và nó đã gây gián đoạn
thật một lần.

## GAP-12 · `between` được khai trong hợp đồng client nhưng server không cài

`FilterOperator` phía client liệt kê `"between"`. Server trả `Filter operator is not supported:
between`. Màn lịch dùng nó và hỏng trắng. Đã đổi sang hai điều kiện `>=`/`<=`; hợp đồng vẫn còn lệch.

## GAP-13 · App Worker: ĐÃ THÔNG cả bốn chặng (đóng)

Đường app-Worker nay chạy đủ vòng trên tenant sống. Bốn chặng, và cả bốn đều hỏng theo một
kiểu khác nhau trước khi thông:

| Chặng | Kết quả |
|---|---|
| Deploy Worker vào dispatch namespace | ✅ `cloudforge-app-center` |
| Khai `worker` + `validators` trong brief | ✅ compiler + schema + parser đều nhận |
| Nền tảng GỌI TỚI Worker | ✅ |
| Worker gọi NGƯỢC qua `/_app/` | ✅ đọc **và** ghi với danh tính người gọi |

### Năm lỗi phải sửa, không phải một

1. **`DISPATCHER` thiếu trong config tenant** — tenant Worker không có binding dispatch
   namespace nên không gọi nổi app Worker. Nền tảng fail-closed đúng, nhưng đó là lý do đường
   này chưa từng chạy trên deployment nào.
2. **`PUBLIC_ORIGIN` thiếu** — nền tảng dùng nó báo app gọi ngược về đâu. Nay suy từ bảng
   route KV chứ không đoán theo id tenant.
3. **`PUBLIC_ORIGIN` có nhưng không tới nơi** — tenant dựng env cho app method ở MỘT CHỖ KHÁC
   với env cho validator, và bản sao thứ hai đã trôi mất `PUBLIC_ORIGIN`. Hệ quả: validator
   gọi ngược được còn app method thì không, cùng một cơ chế mà hai kết quả. Nay dùng chung
   một object.
4. **522 khi `fetch` qua mạng** — app Worker gọi chính hostname custom-domain trong cùng zone
   nó đang chạy sau. Thay bằng **service binding** tới gateway: không DNS, không zone, và
   **không bỏ qua lớp xác thực nào** — gateway vẫn đòi credential theo (tenant, app) và danh
   tính đã ký, y như khi đi qua mạng. Chỉ chặng mạng biến mất.
5. **Tầng Frappe của tenant chưa từng nhìn danh tính nền tảng** — nó xác thực bằng cookie
   phiên, mà app callback thì cố ý KHÔNG có cookie (app không được cầm phiên của người dùng).
   Nên mọi lời gọi ngược trả `403 Login to access this resource` dù danh tính đã ký chạy suốt
   từ đầu đến cuối. Nay có `x-cloudforge-app-callback` — header **chỉ gateway đặt được**, sau
   khi đã tước mọi bản sao do bên ngoài gửi, và chỉ đặt khi đã xác minh xong cả hai bằng
   chứng. Tenant vẫn tự kiểm lại chữ ký, tenant, hạn và trace trước khi dùng.

### Đã chứng thực trên tenant sống

- 4 ca xếp lịch: không trùng ✅ tạo được · trùng phòng ❌ từ chối, nêu đúng phòng · trùng giáo
  viên ❌ từ chối, nêu đúng người · **kề nhau (08:30 bắt đầu đúng lúc 08:30 kết thúc) ✅ tạo
  được** — ca cuối để luật không thể "đúng" bằng cách từ chối mọi thứ.
- Vượt sĩ số: từ chối, nêu đúng con số.
- `center.sessions.generate`: chạy được, ghi thật.

### Một lỗi nữa lộ ra nhờ chạy thật

Chú thích trong Worker nói phương thức sinh buổi là *idempotent*. **Nó không.** `count` được
hiểu là "thêm bấy nhiêu", nên chạy hai lần để lại gấp đôi số buổi — đúng cái hậu quả mà chú
thích tuyên bố đã ngăn. Đo được, không phải suy đoán: hai lần `count: 2` ra bốn buổi. Nay
`count` là **tổng số buổi lớp phải có** kể từ ngày bắt đầu; ba lần chạy `count: 3` để lại đúng
3 buổi.

Toàn bộ đã đóng vào `scripts/verify-center.mjs` §9 — validator không kêu khi nó ngừng chạy, nó
chỉ ngừng từ chối, và dấu hiệu đầu tiên là một phòng học bị xếp trùng.

## GAP-14 · Báo cáo: app không tự khai được (đã đóng)

Báo cáo từng là một **bảng cứng trong nền tảng** (`packages/query` → `DEFINITIONS`) trên các
SQL view kế toán dựng sẵn. Đúng cho sổ cái, sai cho mọi thứ khác: một app giao bằng dữ liệu
không thể có nổi một báo cáo, nên mỗi khách hỏi "doanh thu theo lớp" là một lần phải phát hành
nền tảng.

Nay app khai báo cáo trong chính brief của mình. Không phải SQL tuỳ ý: báo cáo nêu **một**
doctype, các field của doctype đó, nhiều nhất **một** phép gộp — trình biên dịch dựng câu lệnh.
App không với sang được dữ liệu của app khác, không join được, và không nói được điều gì mà
lớp phân quyền vốn đã không cho phép đọc.

Bốn thứ phải sửa để nó chạy được đến màn hình:

1. **Cột trả về sai hợp đồng.** Máy báo cáo mô tả cột là `{field,label,type}` — từ vựng của
   chính nó. Mọi client Frappe đọc `{fieldname,label,fieldtype,options}` và **tra ô theo
   `fieldname`**. Kết quả: bảng đúng tiêu đề, đúng số dòng, **mọi ô trống** — client hỏi mỗi
   dòng lấy `row[undefined]`. Không có gì báo lỗi, nên nó đọc ra như "không có dữ liệu".
2. **`options` của cột Link bị rơi mất** trên đường biên dịch, nên cột khoá in ra `LOP-2026-0001`
   thay vì tên lớp — đúng lỗi mà danh sách và lịch mỗi cái đã phải sửa một lần.
3. **Shell gắn phạm vi dữ liệu vào mọi lời gọi báo cáo.** `Enrollment` không có `company`, nên
   bộ lọc đó bị từ chối và mọi báo cáo của app trả về bảng rỗng. Nay: chiều dữ liệu mà doctype
   **không mang** thì bỏ qua; field doctype **có mang** mà app quên khai thì vẫn từ chối, vì
   im lặng nới phạm vi là để một quản lý cơ sở đọc số của mọi cơ sở.
4. **Cài lại app bị coi là "không đổi".** Nền tảng nâng cấp để đọc thêm được `reports`, gói cài
   y nguyên nên hash trùng, và bản parse CŨ ở lại — mọi báo cáo trả "Unknown report" trong khi
   lệnh cài báo thành công. Nay "không đổi" nghĩa là gói giống nhau **và** nền tảng hiện tại
   đọc ra cùng một kết quả.

Center có 4 báo cáo chạy trên dữ liệu thật, xuất Excel/CSV bằng màn báo cáo chung. Đối chiếu
được: tổng của "Chuyên cần theo buổi" = 288 = đúng số bản ghi điểm danh trong CSDL.
