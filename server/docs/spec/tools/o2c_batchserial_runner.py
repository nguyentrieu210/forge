"""Gate 2E S5 (advanced) — group L: BATCH + SERIAL oracle. Captures ERPNext's real
batch/serial delivery behavior via the Serial and Batch Bundle mechanism (v16):
batch selection/FIFO, over-delivery, expiry, cancel restock, batch valuation; serial
uniqueness, missing/already-delivered serial, multi-serial, cancel rollback, downstream.

  docker exec oracle-backend bench --site oracle.localhost execute frappe.bs_o2c.run

Doctypes/fields taken from the pinned source probe (not guessed):
Delivery Note Item.{serial_and_batch_bundle,batch_no,serial_no,use_serial_batch_fields};
Serial and Batch Bundle.{entries,type_of_transaction}; Serial and Batch Entry.{serial_no,batch_no,qty,incoming_rate}.
Reuses base seed (frappe.matrix_o2c). Fresh items; capture uses the on-hand ledger. Synthetic.
"""
import json
import frappe
import frappe.matrix_o2c as M
import frappe.val_o2c as V

BATCH = "_OM-LBATCH2"
SERIAL = "_OM-LSERIAL2"
SAA = None


def bs_setup(out):
    global SAA
    SAA = frappe.db.get_value("Company", M.COMPANY, "stock_adjustment_account")
    # activate serial/batch handling + allow the legacy batch_no/serial_no fields
    ss = frappe.get_single("Stock Settings")
    ss.enable_serial_and_batch_no_for_item = 1
    ss.use_serial_batch_fields = 1
    ss.save(ignore_permissions=True)
    frappe.db.commit()
    if not frappe.db.exists("Item", BATCH):
        frappe.get_doc({"doctype": "Item", "item_code": BATCH, "item_name": BATCH, "item_group": "Products",
                        "stock_uom": "Nos", "is_stock_item": 1, "has_batch_no": 1, "create_new_batch": 1,
                        "batch_number_series": "_OMB-.####", "valuation_method": "FIFO"}).insert(ignore_permissions=True)
    if not frappe.db.exists("Item", SERIAL):
        frappe.get_doc({"doctype": "Item", "item_code": SERIAL, "item_name": SERIAL, "item_group": "Products",
                        "stock_uom": "Nos", "is_stock_item": 1, "has_serial_no": 1,
                        "serial_no_series": "_OMS-.####"}).insert(ignore_permissions=True)
    frappe.db.commit()
    out["bs_setup"] = {"batch_item": BATCH, "serial_item": SERIAL, "saa": SAA}


def batch_receipt(qty, rate, batch_no=None, expiry=None, ptime="09:00:00"):
    row = {"item_code": BATCH, "qty": qty, "t_warehouse": M.WH, "basic_rate": rate,
           "expense_account": SAA, "cost_center": M.CC, "use_serial_batch_fields": 1}
    if batch_no:
        if not frappe.db.exists("Batch", batch_no):
            d = {"doctype": "Batch", "batch_id": batch_no, "item": BATCH}
            if expiry:
                d["expiry_date"] = expiry
            frappe.get_doc(d).insert(ignore_permissions=True)
        row["batch_no"] = batch_no
    se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": M.COMPANY,
                         "posting_date": M.PDATE, "posting_time": ptime, "items": [row]})
    se.insert(ignore_permissions=True); se.submit()
    created = batch_no or frappe.db.get_value("Batch", {"item": BATCH}, "name", order_by="creation desc")
    return se, created


def batch_deliver(qty, batch_no, ptime="10:00:00"):
    dn = frappe.get_doc({"doctype": "Delivery Note", "customer": M.CUST, "company": M.COMPANY, "currency": "USD",
                         "posting_date": M.PDATE, "posting_time": ptime, "selling_price_list": M.SPL,
                         "items": [{"item_code": BATCH, "qty": qty, "rate": 150, "warehouse": M.WH,
                                    "expense_account": M.ACC["cogs"], "cost_center": M.CC,
                                    "use_serial_batch_fields": 1, "batch_no": batch_no}]})
    dn.insert(ignore_permissions=True); dn.submit()
    return dn


def serial_receipt(qty, rate, ptime="09:00:00"):
    se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": M.COMPANY,
                         "posting_date": M.PDATE, "posting_time": ptime,
                         "items": [{"item_code": SERIAL, "qty": qty, "t_warehouse": M.WH, "basic_rate": rate,
                                    "expense_account": SAA, "cost_center": M.CC, "use_serial_batch_fields": 1}]})
    se.insert(ignore_permissions=True); se.submit()
    se.reload()
    row = se.items[0]
    serials = []
    if row.get("serial_no"):
        serials = [s.strip() for s in row.serial_no.split("\n") if s.strip()]
    elif row.get("serial_and_batch_bundle"):
        serials = [e.serial_no for e in frappe.get_doc("Serial and Batch Bundle", row.serial_and_batch_bundle).entries if e.serial_no]
    return se, serials


def serial_deliver(serial_nos, ptime="10:00:00"):
    dn = frappe.get_doc({"doctype": "Delivery Note", "customer": M.CUST, "company": M.COMPANY, "currency": "USD",
                         "posting_date": M.PDATE, "posting_time": ptime, "selling_price_list": M.SPL,
                         "items": [{"item_code": SERIAL, "qty": len(serial_nos), "rate": 150, "warehouse": M.WH,
                                    "expense_account": M.ACC["cogs"], "cost_center": M.CC,
                                    "use_serial_batch_fields": 1, "serial_no": "\n".join(serial_nos)}]})
    dn.insert(ignore_permissions=True); dn.submit()
    return dn


def bundle_of(voucher):
    rows = frappe.get_all("Serial and Batch Bundle", filters={"voucher_no": voucher}, fields=["name", "type_of_transaction"])
    out = []
    for r in rows:
        entries = frappe.get_all("Serial and Batch Entry", filters={"parent": r.name},
                                 fields=["serial_no", "batch_no", "qty", "incoming_rate"], order_by="idx")
        out.append({"type": r.type_of_transaction, "entries": M.norm(entries)})
    return out


def batch_qty(batch_no):
    return frappe.db.get_value("Batch", batch_no, "batch_qty") if frappe.db.exists("Batch", batch_no) else None


def serial_status(sn):
    return frappe.db.get_value("Serial No", sn, ["status", "warehouse"], as_dict=True) if frappe.db.exists("Serial No", sn) else None


# ---- batch fixtures ----
def h_L_BATCH_DELIVERY():
    _, b = batch_receipt(10, 100)
    dn = batch_deliver(5, b)
    return {"batch": b, "bundle": bundle_of(dn.name), "sle": V.sle_of(dn.name),
            "batch_qty_after": batch_qty(b), "bin": V.binv(BATCH)}

def h_L_BATCH_MULTI():
    _, b1 = batch_receipt(10, 100)
    _, b2 = batch_receipt(10, 120)
    dn = batch_deliver(6, b1)
    return {"b1": b1, "b2": b2, "delivered_from": b1, "bundle": bundle_of(dn.name),
            "b1_qty_after": batch_qty(b1), "b2_qty_after": batch_qty(b2)}

def h_L_BATCH_OVER_DELIVERY():
    _, b = batch_receipt(5, 100)
    return {"observed_error": M.observe(lambda: batch_deliver(9, b)), "batch_qty": batch_qty(b)}

def h_L_BATCH_EXPIRED():
    # explicit batch with an expiry BEFORE the delivery posting date to force expiry behavior
    _, b = batch_receipt(10, 100, batch_no="_OM-BEXP2", expiry="2026-12-31")
    return {"batch": b, "observed_error_or_ok": M.observe(lambda: batch_deliver(3, b)), "batch_qty": batch_qty(b),
            "note": "batch expired 2026-12-31; delivery posting 2027-01-04 -> capture whether ERPNext blocks expired-batch delivery"}

def h_L_BATCH_CANCEL():
    _, b = batch_receipt(10, 100)
    dn = batch_deliver(4, b)
    before = batch_qty(b)
    dn.cancel()
    return {"batch_qty_after_delivery": before, "batch_qty_after_cancel": batch_qty(b), "bin": V.binv(BATCH)}

def h_L_BATCH_VALUATION():
    _, b1 = batch_receipt(10, 100)
    _, b2 = batch_receipt(10, 200)
    dn = batch_deliver(5, b2)  # deliver from the expensive batch specifically
    return {"delivered_from": b2, "bundle": bundle_of(dn.name), "sle": V.sle_of(dn.name),
            "note": "batch-specific valuation: delivering from B2@200 should COGS 1000, not FIFO 100"}


# ---- serial fixtures ----
def h_L_SERIAL_DELIVERY():
    _, serials = serial_receipt(5, 100)
    take = serials[:2]
    dn = serial_deliver(take)
    return {"received_serials": serials, "delivered": take, "bundle": bundle_of(dn.name),
            "serial_status_after": {s: serial_status(s) for s in take}, "bin": V.binv(SERIAL)}

def h_L_SERIAL_NONEXISTENT():
    serial_receipt(3, 100)
    return {"observed_error": M.observe(lambda: serial_deliver(["_OMS-NOPE-9999"]))}

def h_L_SERIAL_ALREADY_DELIVERED():
    _, serials = serial_receipt(5, 100)
    s = serials[0]
    serial_deliver([s])
    return {"serial": s, "observed_error": M.observe(lambda: serial_deliver([s])),
            "note": "re-delivering an already-delivered serial must fail"}

def h_L_SERIAL_MULTIPLE():
    _, serials = serial_receipt(5, 100)
    dn = serial_deliver(serials[:3])
    return {"delivered": serials[:3], "bundle": bundle_of(dn.name), "qty": len(serials[:3]), "bin": V.binv(SERIAL)}

def h_L_SERIAL_CANCEL():
    _, serials = serial_receipt(5, 100)
    s = serials[0]
    dn = serial_deliver([s])
    after_deliver = serial_status(s)
    dn.cancel()
    return {"serial": s, "status_after_delivery": after_deliver, "status_after_cancel": serial_status(s),
            "note": "cancel must return the serial to Active/in-warehouse"}

def h_L_SERIAL_DOWNSTREAM():
    _, serials = serial_receipt(3, 100)
    dn = serial_deliver(serials[:2])
    # v16 tracks serial movement via the Serial and Batch Bundle + Serial No status/warehouse
    # (the legacy delivery_document_* columns were removed).
    links = {s: serial_status(s) for s in serials[:2]}
    return {"delivered": serials[:2], "serial_status_after": M.norm(links), "delivery_bundle": bundle_of(dn.name),
            "note": "serial-to-voucher linkage is via the delivery's Serial and Batch Bundle entries; "
                    "Serial No.status flips out-of-warehouse on delivery"}


HANDLERS = {
    "O2C-L-BATCH-DELIVERY-104": h_L_BATCH_DELIVERY,
    "O2C-L-BATCH-MULTI-105": h_L_BATCH_MULTI,
    "O2C-L-BATCH-OVER-DELIVERY-106": h_L_BATCH_OVER_DELIVERY,
    "O2C-L-BATCH-EXPIRED-107": h_L_BATCH_EXPIRED,
    "O2C-L-BATCH-CANCEL-108": h_L_BATCH_CANCEL,
    "O2C-L-BATCH-VALUATION-109": h_L_BATCH_VALUATION,
    "O2C-L-SERIAL-DELIVERY-110": h_L_SERIAL_DELIVERY,
    "O2C-L-SERIAL-NONEXISTENT-111": h_L_SERIAL_NONEXISTENT,
    "O2C-L-SERIAL-ALREADY-DELIVERED-112": h_L_SERIAL_ALREADY_DELIVERED,
    "O2C-L-SERIAL-MULTIPLE-113": h_L_SERIAL_MULTIPLE,
    "O2C-L-SERIAL-CANCEL-114": h_L_SERIAL_CANCEL,
    "O2C-L-SERIAL-DOWNSTREAM-115": h_L_SERIAL_DOWNSTREAM,
}


def run():
    frappe.set_user("Administrator")
    out = {"provenance": {}, "bs_setup": {}, "fixtures": {}, "summary": {}}
    try:
        out["provenance"] = {"frappe": frappe.__version__, "erpnext": frappe.get_attr("erpnext.__version__")}
    except Exception:
        pass
    try:
        M.setup(out)
        V.val_setup(out)
        bs_setup(out)
        frappe.db.commit()
    except Exception as exc:
        import traceback
        out["summary"] = {"setup_failed": True, "type": type(exc).__name__, "msg": str(exc)[:400],
                          "tb": traceback.format_exc()[-1400:]}
        print("CAPTURE_JSON_START"); print(json.dumps(out, default=str)); print("CAPTURE_JSON_END")
        return {"ok": False}

    ok = err = 0
    for fid, fn in HANDLERS.items():
        try:
            out["fixtures"][fid] = {"captured": True, "data": fn()}
            ok += 1; print(f"FIX {fid} OK")
        except Exception as exc:
            import traceback
            out["fixtures"][fid] = {"captured": False, "handler_exception": {
                "type": type(exc).__name__, "msg": str(exc)[:300], "tb": traceback.format_exc()[-700:]}}
            err += 1; print(f"FIX {fid} FAIL {type(exc).__name__}: {str(exc)[:150]}")
        finally:
            frappe.set_user("Administrator")
            try:
                frappe.db.rollback()
            except Exception:
                pass
    out["summary"] = {"total": len(HANDLERS), "captured": ok, "handler_failures": err}
    print(f"BS_DONE total={len(HANDLERS)} ok={ok} fail={err}")
    print("CAPTURE_JSON_START"); print(json.dumps(out, default=str)); print("CAPTURE_JSON_END")
    return {"ok": err == 0, "captured": ok, "failed": err}
