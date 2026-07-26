app_name = "metaforge"
app_title = "MetaForge"
app_publisher = "MetaForge"
app_description = "Meta-driven React engine copy 1:1 Frappe/ERPNext Desk (headless)"
app_email = "brvt67337@gmail.com"
app_license = "MIT"

# Orchestration whitelisted method: metaforge.api.* (§11) — đã live trên site cô lập.
#
# Serve SPA publicly (PHA 7 path B — bật khi copy apps/demo/dist vào app + bench build):
#   website_route_rules = [{"from_route": "/metaforge/<path:app_path>", "to_route": "metaforge"}]
#   app_include_js = ["/assets/metaforge/js/metaforge.bundle.js"]
#   app_include_css = ["/assets/metaforge/css/metaforge.bundle.css"]
# LƯU Ý: nginx `frontend` hardcode site → phục vụ theo site header của nginx.
# Xem docs/DEPLOYMENT.md §5.
