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
| 2 | Vá tầng framework (amend, rename, autoname, Dynamic Link, mandatory_depends_on, modified_by, is_single) | ✅ trừ `track_seen` |
| 3 | Custom Field + Property Setter | ✅ source + test |
| 4 | Gói app + cài app + endpoint install/uninstall | ✅ (chưa có CLI đóng gói) |
| 5 | Hooks qua Workers for Platforms | ✅ |
| 6 | Tier 2 + i18n + search + Tier 4 | ✅ — phần còn lại **cố ý không làm**, lý do ở API_SURFACE.md |
| 7 | Deploy + cổng phát hành | ◐ xem bảng dưới |

Cổng đã chạy thật trên máy — chi tiết ở [docs/VERIFICATION.md](docs/VERIFICATION.md):

| | |
|---|---|
| Test Node/domain | **248/248 PASS** |
| Gate SQL (migration 0001–0013) | **6/6 PASS** |
| Workerd tenant-worker / query-worker | **70/70 · 3/3 PASS** — gồm 47 E2E lớp vỏ |
| Web typecheck + Vite production build | exit 0 |
| Client build production (7 package + 2 app) | exit 0 |
| Client selfcheck | 74 nhóm assert xanh |

Ba hạng mục bản CloudForge gốc ghi `NOT VERIFIED` / `NOT RUN` — Workerd, web
typecheck, Vite build — **nay đã chạy và xanh**.

Lớp vỏ Frappe **đã chạy end-to-end trên workerd + D1 + Durable Object thật**.
Chưa render trên trình duyệt, chưa deploy lần nào — deploy cần API token Cloudflare
của bạn. Xem [docs/ROADMAP.md](docs/ROADMAP.md) và
[docs/API_SURFACE.md](docs/API_SURFACE.md).

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
