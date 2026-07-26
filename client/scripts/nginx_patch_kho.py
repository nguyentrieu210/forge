#!/usr/bin/env python3
# Chèn block /kho (site metaforge.localhost, app Kho) TRƯỚC `location /` trong frappe.conf. Additive.
# Cùng mẫu với nginx_patch.py (/wms) — xem docs/DEPLOY-WMS.md cho lý do block nginx là EPHEMERAL
# (frappe_docker entrypoint regenerate frappe.conf khi container frontend restart/recreate).
import sys

CONF = "/etc/nginx/conf.d/frappe.conf"
MARKER = "# --- MetaForge Kho (metaforge.localhost) ---"

BLOCK = '''\t''' + MARKER + '''
\tlocation /kho/api/ {
\t\tproxy_pass http://backend-server/api/;
\t\tproxy_set_header X-Frappe-Site-Name metaforge.localhost;
\t\tproxy_set_header Host $host;
\t\tproxy_set_header X-Forwarded-For $remote_addr;
\t\tproxy_set_header X-Forwarded-Proto $proxy_x_forwarded_proto;
\t\tproxy_read_timeout 120;
\t}
\tlocation /kho/files/ {
\t\tproxy_pass http://backend-server/files/;
\t\tproxy_set_header X-Frappe-Site-Name metaforge.localhost;
\t\tproxy_set_header Host $host;
\t}
\tlocation /kho/private/ {
\t\tproxy_pass http://backend-server/private/;
\t\tproxy_set_header X-Frappe-Site-Name metaforge.localhost;
\t\tproxy_set_header Host $host;
\t}
\tlocation /kho/ {
\t\talias /home/frappe/frappe-bench/sites/metaforge-kho/;
\t\ttry_files $uri /kho/index.html;
\t}

'''

with open(CONF, "r", encoding="utf-8") as f:
    src = f.read()

if MARKER in src:
    print("SKIP: block /kho đã tồn tại")
    sys.exit(0)

needle = "\tlocation / {"
idx = src.find(needle)
if idx == -1:
    print("FAIL: không tìm thấy 'location / {' — KHÔNG sửa")
    sys.exit(1)

out = src[:idx] + BLOCK + src[idx:]
with open(CONF, "w", encoding="utf-8") as f:
    f.write(out)
print("OK: đã chèn block /kho trước location /")
