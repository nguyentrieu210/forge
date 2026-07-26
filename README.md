# Forge — nền ERP tương thích Frappe chạy trên Cloudflare

Monorepo gộp hai nguồn đã có, để đạt một mục tiêu: **nền chuẩn Frappe, cài app mới nhanh, có màn builder viết FE.**

| Thư mục | Nguồn | Vai trò |
|---|---|---|
| [server/](server/) | CloudForge v1.0.0 | Kernel chạy trên Cloudflare: Workers for Platforms, Durable Objects, D1 mỗi tenant, Queues/R2 |
| [client/](client/) | MetaForge v1.0.0-rc.1 | Desk meta-driven React + builder DocType/Workflow/Print/Dashboard |

## Vì sao gộp

MetaForge đã có sẵn thứ CloudForge thiếu (builder, Custom Field/Property Setter, safe-eval `depends_on`,
`fetch_from`, i18n, 17 loại view). CloudForge có sẵn thứ MetaForge thiếu (backend chạy được trên
Cloudflare, sổ cái đúng, guard ở tầng SQL). Nhưng MetaForge nói chuyện với **Frappe Python thật**, còn
CloudForge có API hình dạng riêng — hai bên chưa cắm được vào nhau.

Quyết định kiến trúc: **CloudForge mọc lớp vỏ API hình dạng Frappe** ([ADR-001](docs/ARCHITECTURE.md#adr-001)).
MetaForge FE chạy nguyên xi, không sửa một dòng. Đổi lại, mọi client Frappe khác (frappe-react-sdk…)
cũng cắm vào được.

## Trạng thái

| Pha | Nội dung | Trạng thái |
|---|---|---|
| 0 | Gộp repo, workspace, tài liệu | ✅ cổng xanh |
| 1 | Lớp vỏ Frappe Tier 1 + phiên cookie | ✅ source + test; **chưa chạy live** |
| 2 | Vá tầng framework (amend, rename, autoname, Dynamic Link, mandatory_depends_on, modified_by) | ✅ trừ `is_single`, `track_seen`, global search |
| 3 | Custom Field + Property Setter | ✅ source + test |
| 4 | Gói app + cài app | ◐ manifest + installer xong, chưa có endpoint/CLI |
| 5 | Hooks qua Workers for Platforms | ☐ |
| 6 | Bề rộng view + i18n | ☐ |
| 7 | Deploy + cổng phát hành | ☐ |

Cổng đã chạy thật trên máy: **238/238 test PASS**, SQL 6/6 gate PASS, typecheck
server + client exit 0.

**Chưa chạy end-to-end với FE, chưa deploy lần nào.** Xem [docs/ROADMAP.md](docs/ROADMAP.md)
cho lộ trình và [docs/API_SURFACE.md](docs/API_SURFACE.md) cho 68 endpoint.

## Chạy

```bash
corepack enable                 # pnpm@9.15.0 theo packageManager
pnpm install
pnpm run typecheck              # cả server và client
pnpm run test
```

Script `server:*` chạy trong [server/](server/), `client:*` chạy trong [client/](client/) — hai bên giữ
nguyên script gốc, không sửa.

## Nguồn đối chiếu

Frappe v16.19.0 (`ba18090b…`, MIT) và ERPNext v16.20.0 (`ff46d20b…`, GPL-3.0) — khoá full SHA trong
[server/source-lock.json](server/source-lock.json). Đây là **bản viết lại**, không dùng code Frappe.
