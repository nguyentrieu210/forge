# MetaForge — Deployment & Run Guide

Backend = Frappe v16 **headless** trên VPS 222.255.238.178 (bench `frappe_docker-*`, mariadb). Site cô lập demo = **`metaforge.localhost`** (KHÔNG đụng site `frontend` đang chạy).

## 0. Ràng buộc VPS (đã đo)
- 1 site đang chạy: **`frontend`** (apps: erpnext/hrms/crm/insights/erpnextvn/aphvh). **KHÔNG có Kairo/OngXanh** ở đây (đã migrate/gỡ).
- RAM: available ~4GB, **swap 4GB** đã bật + persist (`/etc/fstab` `/swapfile`). `free` "free" thấp là buff/cache — bình thường.
- nginx `frontend` **hardcode** `FRAPPE_SITE_NAME_HEADER=frontend` + `default_site=frontend` ⇒ public :80 chỉ vào site `frontend`.
- mariadb root pw = `admin`. backend container IP (docker bridge) = `172.18.0.8`.

## 1. Dựng site cô lập (đã thực hiện)
```bash
# swap (một lần)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# site
docker exec frappe_docker-backend-1 bench new-site metaforge.localhost \
  --no-mariadb-socket --mariadb-root-password admin --admin-password Admin@123

# app metaforge (orchestration §11)
scp -r frappe-app/metaforge root@222.255.238.178:/tmp/metaforge_app
docker cp /tmp/metaforge_app frappe_docker-backend-1:/home/frappe/frappe-bench/apps/metaforge
docker exec -u root frappe_docker-backend-1 chown -R frappe:frappe /home/frappe/frappe-bench/apps/metaforge
docker exec frappe_docker-backend-1 bash -lc "cd /home/frappe/frappe-bench && env/bin/pip install -e apps/metaforge"
docker exec frappe_docker-backend-1 bench --site metaforge.localhost install-app metaforge

# ⚠️ BẮT BUỘC restart backend sau khi cài app (workers cũ chưa import được → 500 mọi request site có app đó)
docker restart frappe_docker-backend-1
# verify frontend hồi phục: curl http://localhost/api/method/frappe.ping  → {"message":"pong"} (~1-3s)
```

## 2. API token (Administrator)
```bash
docker exec frappe_docker-backend-1 bench --site metaforge.localhost execute \
  frappe.core.doctype.user.user.generate_keys --kwargs '{"user":"Administrator"}'
# → {"api_key":"...","api_secret":"..."}
```

## 3. Gọi API site cô lập (vì nginx hardcode `frontend`)
Phải chỉ định site qua header **`X-Frappe-Site-Name: metaforge.localhost`** + token, gọi thẳng gunicorn `backend:8000`:
```bash
curl http://localhost:8000/api/method/frappe.auth.get_logged_user \
  -H "X-Frappe-Site-Name: metaforge.localhost" \
  -H "Authorization: token <api_key>:<api_secret>"
```

## 4. Run demo SPA LIVE (dev)
```bash
# SSH tunnel: local:8000 → backend container (từ máy dev)
ssh -N -L 8000:172.18.0.8:8000 root@222.255.238.178

# chạy demo live (vite proxy tự tiêm site header + token)
VITE_LIVE=1 \
VITE_FRAPPE_BACKEND=http://localhost:8000 \
VITE_FRAPPE_SITE=metaforge.localhost \
VITE_FRAPPE_TOKEN=<api_key>:<api_secret> \
pnpm --filter @metaforge/demo dev
# → http://localhost:8090  (LiveApp: MetaForgeProvider + ListContainer + FormContainer, data thật)
```
Mock mode (không cần backend): `pnpm --filter @metaforge/demo dev` (không `VITE_LIVE`).

## 5. Serve SPA publicly (còn lại — cần maintenance window)
Vì nginx hardcode site `frontend`, để phục vụ `metaforge.localhost` công khai cần **1 trong 2**:
- **A. nginx route riêng**: thêm server block cho host `metaforge.localhost` (hoặc path) proxy `backend:8000` với `X-Frappe-Site-Name: metaforge.localhost` + serve SPA `dist/`. (Chỉnh config frontend container → cần verify `frontend` không hỏng.)
- **B. bundle vào app**: bật `website_route_rules` + `app_include_js/css` trong `frappe-app/metaforge/hooks.py`, copy `apps/demo/dist` vào app, `bench build --app metaforge` — SPA phục vụ **trong** site (nhưng site phục vụ theo nginx site header).

> ⚠️ KHÔNG dùng `dc.sh` (nếu bench chuyển postgres). Mọi thay đổi nginx phải verify `frontend` sống sau đó (`frappe.ping`→pong).

## 6. Test tại chỗ (không cần browser)
```bash
# selfcheck (logic + render, esbuild→node)
pnpm --filter @metaforge/demo run selfcheck
# smoke adapter TS thật (cần tunnel + env như §4)
FRAPPE_SITE_URL=http://localhost:8000 FRAPPE_TOKEN=<key:secret> \
  FRAPPE_SITE_HEADER=metaforge.localhost pnpm --filter @metaforge/demo run smoke
```
