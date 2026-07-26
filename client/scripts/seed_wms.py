#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Seed WMS demo (multi-company) cho metaforge.localhost. Idempotent, defensive."""
import frappe

frappe.init(site="metaforge.localhost")
frappe.connect()
frappe.flags.in_import = True
frappe.local.lang = "vi"

log = []
def ok(m): log.append("  OK  " + m)
def skip(m): log.append(" skip " + m)
def err(m, e): log.append(" ERR  " + m + " :: " + str(e)[:160])

# ---- 0. Fiscal Year (ERPNext cần trước khi tạo Company) --------------------
try:
    if not frappe.db.exists("Fiscal Year", "2026"):
        frappe.get_doc({"doctype": "Fiscal Year", "year": "2026",
                        "year_start_date": "2026-01-01", "year_end_date": "2026-12-31"}).insert(ignore_permissions=True)
        ok("Fiscal Year 2026")
    else:
        skip("Fiscal Year 2026")
except Exception as e:
    err("Fiscal Year", e)

# ---- 1. Warehouse Kind ----------------------------------------------------
for k in ["Receiving", "Quarantine", "Transit", "WIP", "Damaged", "Storage"]:
    try:
        if not frappe.db.exists("Warehouse Kind", k):
            frappe.get_doc({"doctype": "Warehouse Kind", "kind_name": k}).insert(ignore_permissions=True)
            ok("Warehouse Kind " + k)
        else:
            skip("Warehouse Kind " + k)
    except Exception as e:
        err("Warehouse Kind " + k, e)

# ---- 2. Reasons -----------------------------------------------------------
for dt, vals in [("Discrepancy Reason", ["Hư hỏng", "Thất lạc", "Đếm sai", "Nhập nhầm"]),
                 ("Lot Hold Reason", ["Chờ QA", "Nghi ngờ chất lượng", "Hết hạn cận date"])]:
    for v in vals:
        try:
            if not frappe.db.exists(dt, v):
                frappe.get_doc({"doctype": dt, "reason_name": v}).insert(ignore_permissions=True)
                ok(dt + " " + v)
            else:
                skip(dt + " " + v)
        except Exception as e:
            err(dt + " " + v, e)

# ---- 2b. Warehouse Type (ERPNext create_default_warehouses cần "Transit") --
for wt in ["Transit"]:
    try:
        if not frappe.db.exists("Warehouse Type", wt):
            frappe.get_doc({"doctype": "Warehouse Type", "name": wt}).insert(ignore_permissions=True)
            ok("Warehouse Type " + wt)
        else:
            skip("Warehouse Type " + wt)
    except Exception as e:
        err("Warehouse Type " + wt, e)

# ---- 3. Companies: group + 4 con ------------------------------------------
frappe.db.commit()  # chốt masters (Kind/Reason/FiscalYear/WhType) TRƯỚC company (rollback company không cuốn)
def make_company(name, abbr, parent=None, is_group=0, unit_type=None):
    try:
        if frappe.db.exists("Company", name):
            skip("Company " + name); return
        doc = {"doctype": "Company", "company_name": name, "abbr": abbr,
               "default_currency": "VND", "country": "Vietnam", "is_group": is_group,
               "valuation_method": "FIFO"}
        if parent:
            doc["parent_company"] = parent
        d = frappe.get_doc(doc)
        if unit_type and d.meta.has_field("aphvh_unit_type"):
            d.aphvh_unit_type = unit_type
        d.insert(ignore_permissions=True)
        frappe.db.commit()
        ok("Company " + name)
    except Exception as e:
        frappe.db.rollback()
        err("Company " + name, e)

make_company("Tập đoàn APHVH", "APHVH", is_group=1)
make_company("APH", "APH", parent="Tập đoàn APHVH", unit_type="Công ty")
make_company("VH", "VH", parent="Tập đoàn APHVH", unit_type="Công ty")
make_company("HKD01", "HKD01", parent="Tập đoàn APHVH", unit_type="Hộ kinh doanh")
make_company("HKD02", "HKD02", parent="Tập đoàn APHVH", unit_type="Hộ kinh doanh")

# ---- 4. Warehouses per company (leaf) -------------------------------------
def make_wh(company, wname, kind, barcode):
    full = wname + " - " + frappe.get_cached_value("Company", company, "abbr")
    try:
        if frappe.db.exists("Warehouse", full):
            skip("Warehouse " + full); return full
        d = frappe.get_doc({"doctype": "Warehouse", "warehouse_name": wname, "company": company})
        if d.meta.has_field("aphvh_warehouse_kind") and frappe.db.exists("Warehouse Kind", kind):
            d.aphvh_warehouse_kind = kind
        if d.meta.has_field("aphvh_location_barcode"):
            d.aphvh_location_barcode = barcode
        if d.meta.has_field("aphvh_location_status"):
            d.aphvh_location_status = "Active"
        d.insert(ignore_permissions=True)
        frappe.db.commit()
        ok("Warehouse " + full)
        return d.name
    except Exception as e:
        frappe.db.rollback()
        err("Warehouse " + full, e)
        return None

wh_map = {}
for comp in ["APH", "VH", "HKD01", "HKD02"]:
    if not frappe.db.exists("Company", comp):
        continue
    ab = frappe.get_cached_value("Company", comp, "abbr")
    wh_map[comp] = {
        "recv": make_wh(comp, "Nhận hàng " + comp, "Receiving", "BC-" + comp + "-RECV"),
        "transit": make_wh(comp, "Trung chuyển " + comp, "Transit", "BC-" + comp + "-TRAN"),
        "st1": make_wh(comp, "Lưu trữ A " + comp, "Storage", "BC-" + comp + "-ST1"),
        "st2": make_wh(comp, "Lưu trữ B " + comp, "Storage", "BC-" + comp + "-ST2"),
    }

# ---- 5. Item Group + UOM + Items ------------------------------------------
try:
    if not frappe.db.exists("Item Group", "Sản phẩm WMS"):
        parent_ig = "All Item Groups" if frappe.db.exists("Item Group", "All Item Groups") else None
        ig = {"doctype": "Item Group", "item_group_name": "Sản phẩm WMS"}
        if parent_ig:
            ig["parent_item_group"] = parent_ig
        frappe.get_doc(ig).insert(ignore_permissions=True)
        ok("Item Group Sản phẩm WMS")
except Exception as e:
    err("Item Group", e)

for uom in ["Cái", "Thùng"]:
    try:
        if not frappe.db.exists("UOM", uom):
            frappe.get_doc({"doctype": "UOM", "uom_name": uom}).insert(ignore_permissions=True)
            ok("UOM " + uom)
    except Exception as e:
        err("UOM " + uom, e)

def make_item(code, name, batch=0):
    try:
        if frappe.db.exists("Item", code):
            skip("Item " + code); return
        ig = "Sản phẩm WMS" if frappe.db.exists("Item Group", "Sản phẩm WMS") else frappe.db.get_value("Item Group", {}, "name")
        uom = "Cái" if frappe.db.exists("UOM", "Cái") else "Nos"
        d = frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name,
                            "item_group": ig, "stock_uom": uom, "is_stock_item": 1, "has_batch_no": batch})
        if d.meta.has_field("aphvh_external_code"):
            d.aphvh_external_code = "EXT-" + code
        d.insert(ignore_permissions=True)
        frappe.db.commit()
        ok("Item " + code)
    except Exception as e:
        frappe.db.rollback()
        err("Item " + code, e)

make_item("SP-001", "Sản phẩm có lô", batch=1)
make_item("SP-002", "Sản phẩm thường", batch=0)
make_item("SP-003", "Vật tư đóng gói", batch=0)

# ---- 6. Users + roles -----------------------------------------------------
def make_user(email, first, roles, pwd=None):
    try:
        if frappe.db.exists("User", email):
            skip("User " + email); return
        d = frappe.get_doc({"doctype": "User", "email": email, "first_name": first,
                            "send_welcome_email": 0, "enabled": 1})
        if pwd:
            d.new_password = pwd
        d.insert(ignore_permissions=True)
        for r in roles:
            if frappe.db.exists("Role", r):
                d.add_roles(r)
        frappe.db.commit()
        ok("User " + email)
    except Exception as e:
        frappe.db.rollback()
        err("User " + email, e)

# role WMS của aphvh (nếu có) — lấy các role bắt đầu bằng APHVH
aphvh_roles = [r.name for r in frappe.get_all("Role", filters={"name": ["like", "%APHVH%"]})]
demo_roles = ["System Manager"] + aphvh_roles
make_user("wms.demo@aphvh.local", "WMS Demo", demo_roles, pwd="Wms@Demo2026")

# ---- 7. Record mẫu: Warehouse Transfer draft (best-effort) ----------------
def make_transfer(company, item_code):
    wh = wh_map.get(company)
    if not wh or not (wh.get("recv") and wh.get("transit") and wh.get("st1")):
        skip("WT " + company + " (thiếu warehouse)"); return
    try:
        d = frappe.get_doc({
            "doctype": "Warehouse Transfer", "company": company,
            "source_warehouse": wh["recv"], "transit_warehouse": wh["transit"],
            "target_warehouse": wh["st1"],
            "items": [{"item_code": item_code, "qty_issued": 10, "uom": "Cái"}],
        })
        d.insert(ignore_permissions=True)
        frappe.db.commit()
        ok("Warehouse Transfer " + d.name + " (" + company + ")")
    except Exception as e:
        frappe.db.rollback()
        err("Warehouse Transfer " + company, e)

if frappe.db.exists("Company", "APH"):
    make_transfer("APH", "SP-002")
if frappe.db.exists("Company", "VH"):
    make_transfer("VH", "SP-003")

frappe.db.commit()
print("\n===== SEED WMS RESULT =====")
for l in log:
    print(l)
print("counts:",
      "Company", frappe.db.count("Company"),
      "Warehouse", frappe.db.count("Warehouse"),
      "Warehouse Kind", frappe.db.count("Warehouse Kind"),
      "Item", frappe.db.count("Item"),
      "Warehouse Transfer", frappe.db.count("Warehouse Transfer"))
