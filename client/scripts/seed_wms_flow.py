#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Chuẩn bị state demo App-mode: negative stock + 2 phiếu In Transit (Admin giao) + 2 Draft."""
import frappe

frappe.init(site="metaforge.localhost")
frappe.connect()
log = []

# 1. Allow Negative Stock (để Stock Entry GIAO/NHẬN post dù chưa có tồn)
try:
    ss = frappe.get_single("Stock Settings")
    if not ss.allow_negative_stock:
        ss.allow_negative_stock = 1
        ss.save(ignore_permissions=True)
        frappe.db.commit()
        log.append("OK allow_negative_stock=1")
    else:
        log.append("skip allow_negative_stock (đã bật)")
except Exception as e:
    log.append("ERR stock settings: " + str(e)[:150])

# helper tạo Draft transfer
def make_transfer(company, src, transit, tgt, item, qty=10):
    d = frappe.get_doc({
        "doctype": "Warehouse Transfer", "company": company,
        "source_warehouse": src, "transit_warehouse": transit, "target_warehouse": tgt,
        "items": [{"item_code": item, "qty_issued": qty, "uom": "Cái"}],
    })
    d.insert(ignore_permissions=True)
    return d.name

# lấy warehouse APH
def wh(company, kw):
    rows = frappe.get_all("Warehouse", filters={"company": company, "warehouse_name": ["like", kw + "%"]}, pluck="name", limit=1)
    return rows[0] if rows else None

# 2. Tạo thêm 2 Draft cho GIAO demo (nếu chưa đủ)
try:
    for comp in ["APH", "VH"]:
        src, transit, tgt = wh(comp, "Nhận hàng"), wh(comp, "Trung chuyển"), wh(comp, "Lưu trữ B")
        if src and transit and tgt:
            n = make_transfer(comp, src, transit, tgt, "SP-003", 8)
            frappe.db.commit()
            log.append("OK Draft mới " + n + " (" + comp + ")")
except Exception as e:
    frappe.db.rollback()
    log.append("ERR tạo Draft: " + str(e)[:150])

# 3. GIAO 2 phiếu Draft cũ nhất bằng Administrator → In Transit (để wms.demo NHẬN được)
frappe.set_user("Administrator")
try:
    from aphvh.api.wms import transfer_issue
    drafts = frappe.get_all("Warehouse Transfer", filters={"status": "Draft"}, order_by="creation asc", pluck="name")
    for t in drafts[:2]:
        try:
            transfer_issue(t)
            frappe.db.commit()
            log.append("OK GIAO (Admin) " + t + " → In Transit")
        except Exception as e:
            frappe.db.rollback()
            log.append("ERR GIAO " + t + ": " + str(e)[:180])
except Exception as e:
    log.append("ERR import transfer_issue: " + str(e)[:150])

print("\n===== FLOW SEED =====")
for l in log:
    print(" ", l)
# tổng hợp trạng thái
by_status = {}
for r in frappe.get_all("Warehouse Transfer", fields=["status"]):
    by_status[r.status] = by_status.get(r.status, 0) + 1
print("Warehouse Transfer theo status:", by_status)
