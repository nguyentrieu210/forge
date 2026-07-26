# Deploy MetaForge (public) — module kho APHVH WMS

> Deploy công khai MetaForge (engine meta-driven) render module **APHVH WMS** thật, trên site cô lập
> `metaforge.localhost` (VPS 222.255.238.178), phục vụ qua path `/wms` của nginx site khách `frontend`.
> **URL:** http://222.255.238.178/wms/ · **Login demo:** `wms.demo@aphvh.local` / `Wms@Demo2026`.

## Kiến trúc
```
http://222.255.238.178/wms/            → nginx frontend (port 80) → static MetaForge SPA
http://222.255.238.178/wms/api/…       → backend:8000 (header X-Frappe-Site-Name: metaforge.localhost)
http://222.255.238.178/  (site khách)  → nginx frontend → site `frontend` (KHÔNG đụng)
```
- **Backend**: site cô lập `metaforge.localhost` = frappe + metaforge + **erpnext** + **aphvh** (WMS). Cài site-level (`bench install-app`), KHÔNG sửa code app dùng chung.
- **FE**: build `apps/demo` với `--base=/wms/` (VITE_LIVE=1 → LiveApp). Auth = **cookie-session** (login, KHÔNG token). Adapter base + router basename + login redirect lấy từ `import.meta.env.BASE_URL`. `globalThis.csrf_token = boot.csrf_token` cho write.
- **nginx**: block `location /wms/{api,files,private,}` chèn TRƯỚC `location /` trong `/etc/nginx/conf.d/frappe.conf` (container `frappe_docker-frontend-1`), set header site metaforge. `location /` (site khách) y nguyên. Static ở `sites/metaforge-wms/` (volume chung).

## Seed (multi-company, `scripts/seed_wms.py` — chạy qua bench python)
5 Company (group *Tập đoàn APHVH* + APH/VH/HKD01/HKD02) · 41 Warehouse (Receiving/Transit/Storage mỗi company + default ERPNext) · 6 Warehouse Kind · Warehouse Type *Transit* · 3 Item · 7 Reason · Fiscal Year 2026 · user `wms.demo@aphvh.local` · 2 Warehouse Transfer mẫu. **Chặn Frappe gặp:** Company mandatory `valuation_method`; ERPNext `create_default_warehouses` cần **Warehouse Type "Transit"** (site không chạy setup wizard).

## Verify (đã PASS — Playwright public)
guest→`/wms/login` · login→boot→CSRF · List **Warehouse Transfer** render metadata (WT-2026-00001/00002, cột ID/Trạng thái/Kho nguồn/Kho nhận) · **split 3 cột** (form + child *Dòng hàng* + context) · **WRITE CSRF** (post comment → timeline). Site khách `frontend` ping `pong` + `/login` 200 xuyên suốt. Ảnh: `screenshots/wms-{list,split,kind,write}.png`.

## ⚠️ Durability & Rollback
- **nginx block EPHEMERAL**: frappe_docker entrypoint regenerate `frappe.conf` khi container `frontend` **restart/recreate** → block `/wms` MẤT. Re-apply: `docker cp scripts/nginx_patch.py … && python3 … && nginx -t && nginx -s reload`. (Bền hơn: bake vào template/compose mount — TODO.)
- **Rollback nginx** (1 lệnh): `docker cp` phục hồi `frappe.conf.bak` (đã backup `/root/frappe.conf.bak.*` + trong container) → `nginx -t` → `nginx -s reload`. Site cô lập tách biệt nên gỡ = vô hại.
- **Backend**: site `metaforge.localhost` độc lập; muốn gỡ WMS = `bench --site metaforge.localhost uninstall-app aphvh` (không đụng site khách).

## App-mode (touch-first) — /wms/x/receive
Ngoài Desk-mode (auto-render List/Form), deploy này có **App-mode** — màn nghiệp vụ đóng gói tay, mobile/tablet, touch-first (khung `@metaforge/shell/app-mode`: `MobileShell` + touch primitives + experience registry).
- **URL:** http://222.255.238.178/wms/x/receive (hoặc nav Desk → *Kho (WMS) → Nhận/Giao (App 📱)*). Mở bằng điện thoại/tablet.
- **Kho: Nhận / Giao hàng** — thẻ phiếu to, chạm → dòng hàng + QtyStepper, nút **GIAO/NHẬN** đáy màn gọi `aphvh.api.wms.transfer_issue/transfer_receive` THẬT (tạo Stock Entry, ép người nhận≠giao). Verified phone (iPhone 12) + tablet (iPad).
- State demo cần: `scripts/seed_wms_{flow,types,stock}.py` (negative stock + Stock Entry Type + tồn kho + role Stock Manager cho user demo + phiếu In Transit/Draft).

## Caveat
- **Cookie `sid` cùng host**: `frontend` và `/wms` cùng IP path=/ → đăng nhập WMS có thể ghi đè session `frontend` trong CÙNG trình duyệt → dùng incognito/khác trình duyệt khi demo.
- **User demo = System Manager** (xem/ghi mọi thứ) → chưa minh hoạ fail-closed multi-company (cần seed User Permission + role WMS hẹp — Pha sau).
- **Luồng stock GIAO/NHẬN bespoke** (server hook aphvh) ngoài phạm vi MetaForge — MetaForge render doctype + CRUD tổng quát.
