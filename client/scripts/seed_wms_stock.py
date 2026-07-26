#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Tồn kho mở đầu (có valuation) vào kho Nhận hàng → GIAO 2 phiếu → In Transit."""
import frappe
frappe.init(site="metaforge.localhost")
frappe.connect()
frappe.set_user("Administrator")
log = []

def src_wh(company):
    r = frappe.get_all("Warehouse", filters={"company": company, "warehouse_name": ["like", "Nhận hàng%"]}, pluck="name", limit=1)
    return r[0] if r else None

# 1. Material Receipt (opening stock + basic_rate) cho SP-002/SP-003 vào kho Nhận hàng APH/VH
for company in ["APH", "VH"]:
    wh = src_wh(company)
    if not wh:
        log.append("skip " + company + " (không có kho Nhận hàng)"); continue
    for item in ["SP-002", "SP-003"]:
        try:
            se = frappe.get_doc({
                "doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": company,
                "items": [{"item_code": item, "qty": 100, "t_warehouse": wh, "basic_rate": 10000, "uom": "Cái", "conversion_factor": 1}],
            })
            se.insert(ignore_permissions=True)
            se.submit()
            frappe.db.commit()
            log.append("OK tồn " + item + " x100 @ " + wh)
        except Exception as e:
            frappe.db.rollback()
            log.append("ERR tồn " + item + " " + company + ": " + str(e)[:180])

# 2. GIAO 2 phiếu Draft cũ nhất → In Transit (Admin)
try:
    from aphvh.api.wms import transfer_issue
    for t in frappe.get_all("Warehouse Transfer", filters={"status": "Draft"}, order_by="creation asc", pluck="name")[:2]:
        try:
            transfer_issue(t)
            frappe.db.commit()
            log.append("OK GIAO " + t + " → In Transit")
        except Exception as e:
            frappe.db.rollback()
            log.append("ERR GIAO " + t + ": " + str(e)[:200])
except Exception as e:
    log.append("ERR import: " + str(e)[:150])

print("\n===== STOCK + ISSUE =====")
for l in log:
    print(" ", l)
by = {}
for r in frappe.get_all("Warehouse Transfer", fields=["status"]):
    by[r.status] = by.get(r.status, 0) + 1
print("status:", by)
