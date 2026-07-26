#!/usr/bin/env python
# -*- coding: utf-8 -*-
import frappe
frappe.init(site="metaforge.localhost")
frappe.connect()
log = []

# Stock Entry Type (ERPNext ship qua fixtures; site không setup-wizard nên thiếu)
for name, purpose in [("Material Transfer", "Material Transfer"),
                      ("Material Receipt", "Material Receipt"),
                      ("Material Issue", "Material Issue")]:
    try:
        if not frappe.db.exists("Stock Entry Type", name):
            frappe.get_doc({"doctype": "Stock Entry Type", "name": name, "purpose": purpose}).insert(ignore_permissions=True)
            log.append("OK Stock Entry Type " + name)
        else:
            log.append("skip " + name)
    except Exception as e:
        log.append("ERR " + name + ": " + str(e)[:160])
frappe.db.commit()

# GIAO 2 phiếu Draft bằng Administrator → In Transit
frappe.set_user("Administrator")
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

print("\n===== TYPES + ISSUE =====")
for l in log:
    print(" ", l)
by = {}
for r in frappe.get_all("Warehouse Transfer", fields=["status"]):
    by[r.status] = by.get(r.status, 0) + 1
print("status:", by)
