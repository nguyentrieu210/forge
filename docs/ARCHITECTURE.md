# Kiến trúc Forge

## Hình dạng hệ thống

```
                    ┌─────────────────────────────────────────┐
                    │  client/  — MetaForge Desk + Builder    │
                    │  @metaforge/adapter-frappe (KHÔNG SỬA)  │
                    └───────────────────┬─────────────────────┘
                                        │ /api/method/*  /api/resource/*
                                        │ cookie sid + X-Frappe-CSRF-Token
                    ┌───────────────────▼─────────────────────┐
                    │  server/packages/frappe-api  ← MỚI      │
                    │  lớp vỏ dịch API Frappe ⇄ kernel        │
                    └───────────────────┬─────────────────────┘
                                        │
   gateway-worker ──► tenant-worker (Durable Object khoá aggregate) ──► D1 riêng mỗi tenant
                              │
                              ├──► outbox ──► jobs-worker (Queues)
                              └──► query-worker (báo cáo, đọc)
```

## ADR-001 — Vì sao chọn lớp vỏ Frappe thay vì viết adapter native {#adr-001}

**Bối cảnh.** MetaForge FE (19.238 dòng, builder đã verify live) gọi 68 endpoint hình dạng Frappe qua
`frappe-react-sdk`. CloudForge có API riêng sạch hơn (idempotency key, `expected_version` số nguyên,
cursor phân trang) nhưng khác hoàn toàn.

**Ba lựa chọn đã cân nhắc.**

1. Viết nốt `metaforge-cloudforge-adapter` cho đủ ~70 method của interface `Adapter`.
2. CloudForge mọc lớp vỏ hình dạng Frappe; MetaForge dùng `adapter-frappe` sẵn có, không sửa.
3. Làm cả hai bề mặt.

**Chọn (2).** Lý do:

- Interface `Adapter` của MetaForge **vốn đã hình dạng Frappe** (`getBoot`, `docinfo`, `searchLink`,
  `getdoctype`). Chọn (1) vẫn phải mô phỏng gần hết Frappe, nhưng mất luôn khả năng cắm client khác.
- `adapter-frappe` đã được test live với Frappe v16 thật. Giữ nguyên nó nghĩa là giữ nguyên toàn bộ
  bằng chứng đó; mọi lỗi mới phát sinh chắc chắn nằm ở lớp vỏ, không phải ở FE.
- Bề mặt cần làm là **hữu hạn và đã đếm được**: 47 endpoint Frappe + 21 endpoint `metaforge.api.*` +
  REST `/api/resource/*`. Xem [API_SURFACE.md](API_SURFACE.md).

**Cái giá phải trả — ghi rõ, không giấu.**

- Phải bắt chước cả những chỗ kỳ cục của Frappe: envelope `{message: …}`, `getdoc` trả `{docs:[…], docinfo}`,
  filter dạng mảng lồng `[[dt, field, op, value]]`, tham số JSON-trong-query-string.
- **Xung đột mô hình khoá lạc quan.** CloudForge dùng `version` số nguyên tăng dần; Frappe dùng timestamp
  `modified` và trả **HTTP 417 TimestampMismatch**. Lớp vỏ phải dịch hai chiều và giữ `modified` đủ
  chính xác để không bao giờ hai bản ghi khác nhau có cùng `modified`.
- Idempotency: CloudForge bắt buộc `command_id`; REST Frappe không có khái niệm đó. Lớp vỏ phải tự sinh
  `command_id` tất định từ (tenant, doctype, name, action, hash payload) để retry không tạo bút toán kép.

## Ranh giới các tầng

| Tầng | Ở đâu | Được phép biết gì |
|---|---|---|
| Desk/Builder | `client/packages/*` | Chỉ biết API Frappe. Không biết Cloudflare, D1, Durable Object |
| Lớp vỏ | `server/packages/frappe-api` | Dịch hình dạng. **Không** chứa logic nghiệp vụ |
| Kernel tài liệu | `server/packages/document-kernel`, `frappe-model` | Lifecycle, quyền, workflow, phiên bản |
| Nghiệp vụ | `server/packages/clouderp-*` | Sổ cái, kho, giá, sản xuất |
| Hạ tầng | `server/apps/*` | Worker, DO, D1, Queue, R2 |

Quy tắc bất di bất dịch: **tenant, actor, roles, tỉ giá, giá vốn, tài khoản kế toán do server quyết định**,
không bao giờ lấy từ header hay payload client. Lớp vỏ không được phá quy tắc này để chiều Frappe.

## Cơ chế cài app (mục tiêu "cài app mới nhanh")

App = **dữ liệu**, không phải code. Một gói app gồm:

```
app.json          — manifest (id, name, version, phụ thuộc, nav)
doctypes/*.json   — định nghĩa DocType
workflows/*.json  — workflow
prints/*.json     — mẫu in
reports/*.json    — báo cáo
roles.json        — vai trò + DocPerm
fixtures/*.json   — dữ liệu mồi (master records)
```

Cài = ghi metadata vào D1 của tenant, trong một giao dịch, có ghi `installed_apps` kèm version. Không
build lại, không deploy lại, không downtime.

**Logic riêng của app** — chỗ Frappe dùng `hooks.py` — không thể là Python trên Workers. Thay bằng
**Workers for Platforms**: mỗi app có thể kèm một Worker đẩy vào dispatch namespace (hạ tầng này
CloudForge đã có sẵn). Kernel phát sự kiện vòng đời qua outbox; Worker của app nhận và xử lý. Sandbox
mỗi app tách biệt, không sập lẫn nhau.

Xem [ROADMAP.md](ROADMAP.md) Pha 4–5. Nguồn app mẫu thật: [server/apps-src/visits/](../server/apps-src/visits/),
đóng gói bằng `npm run app:pack apps-src/visits`.

### Vì sao bộ ERP hiện tại KHÔNG thể là một app dữ liệu

Lộ trình ban đầu định "đóng gói lại `clouderp-*` thành app đầu tiên để tự chứng minh
cơ chế". Khi làm tới thì thấy điều đó **không đúng về bản chất**, nên ghi lại thay vì
làm cho có:

26 DocType của bộ ERP (Sales Order, Payment Entry, Stock Entry, Salary Slip…) không
phải metadata. Chúng là **controller TypeScript** trong kernel: `SalesOrderController`
tính thành tiền theo số nguyên scaled, dựng bút toán cân đối, trừ tồn theo FIFO, kiểm
khoá kỳ kế toán. Không có cách nào diễn đạt những thứ đó bằng JSON.

Nghĩa là ranh giới thật của mô hình app là:

| Loại | Cơ chế |
|---|---|
| DocType chỉ có dữ liệu + form + workflow + quyền | ✅ app dữ liệu, cài bằng một lần ghi metadata |
| Logic nghiệp vụ đứng ngoài (gửi mail, đồng bộ, tính toán phái sinh) | ✅ Worker của app qua hook (Pha 5) |
| Logic phải chạy **trong** giao dịch ghi — sổ cái, giá vốn, tồn kho, guard tính toàn vẹn | ❌ phải là controller trong kernel |

Cột thứ ba là lý do bộ `clouderp-*` ở lại trong kernel. Cố nhồi nó vào app dữ liệu sẽ
phải hoặc bịa ra một ngôn ngữ tính toán trong JSON, hoặc cho app chạy code tuỳ ý bên
trong đường ghi của aggregate — thứ mà [ADR về hook](#) đã bác vì một app chậm là treo
mọi lệnh ghi lên aggregate đó.

Nói cách khác: **app dữ liệu mở rộng được bề rộng, không mở rộng được tầng kế toán.**
Thêm một ngành mới (viếng thăm, bảo trì, tuyển sinh) là gói app. Thêm một cách tính giá
vốn mới thì phải sửa kernel.

## Tin tốt phát hiện lúc khảo sát

Kiểm toán CloudForge độc lập tìm ra một loạt metadata **khai báo nhưng không ai đọc**: `depends_on`,
`fetch_from`, `mandatory_depends_on`, `read_only_depends_on`. Nhưng MetaForge FE **đã hiện thực đủ**
những thứ này ở phía client (safe-eval allowlist cho `depends_on`, resolver cho `fetch_from`, đều đã
đóng gate). Vậy chỉ cần lớp vỏ **trả đúng metadata** là chúng sống dậy, không phải viết lại.

Còn `mandatory_depends_on` vẫn phải cưỡng chế **thêm ở server** — client-side validation không bao giờ
là hàng rào thật.
