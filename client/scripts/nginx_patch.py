#!/usr/bin/env python3
# Chèn block /wms (site metaforge.localhost) TRƯỚC `location /` trong frappe.conf. Additive.
import sys

CONF = "/etc/nginx/conf.d/frappe.conf"
MARKER = "# --- MetaForge WMS (metaforge.localhost) ---"

BLOCK = '''\t''' + MARKER + '''
\tlocation /wms/api/ {
\t\tproxy_pass http://backend-server/api/;
\t\tproxy_set_header X-Frappe-Site-Name metaforge.localhost;
\t\tproxy_set_header Host $host;
\t\tproxy_set_header X-Forwarded-For $remote_addr;
\t\tproxy_set_header X-Forwarded-Proto $proxy_x_forwarded_proto;
\t\tproxy_read_timeout 120;
\t}
\tlocation /wms/files/ {
\t\tproxy_pass http://backend-server/files/;
\t\tproxy_set_header X-Frappe-Site-Name metaforge.localhost;
\t\tproxy_set_header Host $host;
\t}
\tlocation /wms/private/ {
\t\tproxy_pass http://backend-server/private/;
\t\tproxy_set_header X-Frappe-Site-Name metaforge.localhost;
\t\tproxy_set_header Host $host;
\t}
\tlocation /wms/ {
\t\talias /home/frappe/frappe-bench/sites/metaforge-wms/;
\t\ttry_files $uri /wms/index.html;
\t}

'''

with open(CONF, "r", encoding="utf-8") as f:
    src = f.read()

if MARKER in src:
    print("SKIP: block /wms đã tồn tại")
    sys.exit(0)

needle = "\tlocation / {"
idx = src.find(needle)
if idx == -1:
    print("FAIL: không tìm thấy 'location / {' — KHÔNG sửa")
    sys.exit(1)

out = src[:idx] + BLOCK + src[idx:]
with open(CONF, "w", encoding="utf-8") as f:
    f.write(out)
print("OK: đã chèn block /wms trước location /")
