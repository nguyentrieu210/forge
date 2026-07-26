"""Gate 2E S5 (advanced) — group K: VALUATION oracle. Captures ERPNext's real
stock valuation (FIFO / Moving Average / LIFO layers, partial/full delivery,
multi-line, cancellation, return, negative stock, rounding) with SLE
valuation_rate / stock_value_difference, COGS GL and Stock Balance after each step.

  docker exec oracle-backend bench --site oracle.localhost execute frappe.val_o2c.run

Reuses the base seed from frappe.matrix_o2c; fresh valuation items with zero opening
stock so each fixture builds exact layers, rollback-isolated. Synthetic data only.
"""
import json
import frappe
import frappe.matrix_o2c as M

SAA = COGS = None
FIFO, MAVG, LIFO = "_OM-VFIFO", "_OM-VMAVG", "_OM-VLIFO"


def val_setup(out):
    global SAA, COGS
    SAA = frappe.db.get_value("Company", M.COMPANY, "stock_adjustment_account")
    COGS = M.ACC["cogs"]
    for code, method in [(FIFO, "FIFO"), (MAVG, "Moving Average"), (LIFO, "LIFO")]:
        if not frappe.db.exists("Item", code):
            frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": "Products",
                            "stock_uom": "Nos", "is_stock_item": 1, "valuation_method": method}).insert(ignore_permissions=True)
    frappe.db.commit()
    out["val_setup"] = {"saa": SAA, "cogs": COGS, "items": {FIFO: "FIFO", MAVG: "Moving Average", LIFO: "LIFO"}}


def receipt(item, qty, rate, ptime="09:00:00", pdate=None):
    se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": M.COMPANY,
                         "posting_date": pdate or M.PDATE, "posting_time": ptime,
                         "items": [{"item_code": item, "qty": qty, "t_warehouse": M.WH, "basic_rate": rate,
                                    "expense_account": SAA, "cost_center": M.CC}]})
    se.insert(ignore_permissions=True); se.submit()
    return se


def deliver(item, qty, ptime="10:00:00", pdate=None, is_return=False, return_against=None):
    doc = {"doctype": "Delivery Note", "customer": M.CUST, "company": M.COMPANY, "currency": "USD",
           "posting_date": pdate or M.PDATE, "posting_time": ptime, "selling_price_list": M.SPL,
           "items": [{"item_code": item, "qty": (-qty if is_return else qty), "rate": 150, "warehouse": M.WH,
                      "expense_account": COGS, "cost_center": M.CC}]}
    if is_return:
        doc["is_return"] = 1
        doc["return_against"] = return_against
    dn = frappe.get_doc(doc)
    dn.insert(ignore_permissions=True); dn.submit()
    return dn


def binv(item):
    b = frappe.db.get_value("Bin", {"item_code": item, "warehouse": M.WH},
                            ["actual_qty", "valuation_rate", "stock_value"], as_dict=True)
    return {"actual_qty": b.actual_qty, "valuation_rate": b.valuation_rate, "stock_value": b.stock_value} if b else None


def sle_of(voucher):
    return M.norm(frappe.get_all("Stock Ledger Entry", filters={"voucher_no": voucher, "is_cancelled": 0},
                  fields=["item_code", "actual_qty", "qty_after_transaction", "valuation_rate",
                          "stock_value_difference", "stock_value"], order_by="creation, item_code"))


def gl_of(voucher):
    return M.norm(frappe.get_all("GL Entry", filters={"voucher_no": voucher, "is_cancelled": 0},
                  fields=["account", "debit", "credit"], order_by="account, debit desc"))


def dn_cap(dn, item):
    return {"docstatus": dn.docstatus, "status": getattr(dn, "status", None),
            "sle": sle_of(dn.name), "gl": gl_of(dn.name), "bin_after": binv(item)}


def stock_report(item):
    from frappe.desk.query_report import run
    r = run("Stock Balance", filters={"company": M.COMPANY, "from_date": M.PDATE, "to_date": M.PDATE}, ignore_prepared_report=True)
    return [{k: row.get(k) for k in ("item_code", "bal_qty", "bal_val", "val_rate", "in_qty", "out_qty")}
            for row in (r.get("result") or []) if isinstance(row, dict) and row.get("item_code") == item]


# ---- K fixtures ----
def h_K_FIFO_LAYERS():
    receipt(FIFO, 10, 100); receipt(FIFO, 10, 120)
    dn = deliver(FIFO, 15)  # FIFO: 10@100 + 5@120 = 1600
    return {"dn": dn_cap(dn, FIFO), "note": "FIFO consumes 10@100 then 5@120 -> COGS 1600, 5@120 left"}

def h_K_MAVG_LAYERS():
    receipt(MAVG, 10, 100); receipt(MAVG, 10, 120)
    dn = deliver(MAVG, 15)  # avg 110 -> COGS 1650
    return {"dn": dn_cap(dn, MAVG), "note": "Moving Average rate 110 -> COGS 1650, 5@110 left"}

def h_K_LIFO_LAYERS():
    receipt(LIFO, 10, 100); receipt(LIFO, 10, 120)
    dn = deliver(LIFO, 15)  # LIFO: 10@120 + 5@100 = 1700
    return {"dn": dn_cap(dn, LIFO), "note": "LIFO consumes 10@120 then 5@100 -> COGS 1700"}

def h_K_PARTIAL_DELIVERY():
    receipt(FIFO, 20, 100)
    dn = deliver(FIFO, 5)
    return {"dn": dn_cap(dn, FIFO), "note": "partial: COGS 500, 15@100 left"}

def h_K_FULL_DELIVERY():
    receipt(FIFO, 10, 100)
    dn = deliver(FIFO, 10)
    return {"dn": dn_cap(dn, FIFO), "note": "full: COGS 1000, stock 0"}

def h_K_MULTI_LINE():
    receipt(FIFO, 10, 100); receipt(MAVG, 10, 50)
    dn = frappe.get_doc({"doctype": "Delivery Note", "customer": M.CUST, "company": M.COMPANY, "currency": "USD",
                         "posting_date": M.PDATE, "posting_time": "10:00:00", "selling_price_list": M.SPL,
                         "items": [{"item_code": FIFO, "qty": 4, "rate": 150, "warehouse": M.WH, "expense_account": COGS, "cost_center": M.CC},
                                   {"item_code": MAVG, "qty": 3, "rate": 80, "warehouse": M.WH, "expense_account": COGS, "cost_center": M.CC}]})
    dn.insert(ignore_permissions=True); dn.submit()
    return {"sle": sle_of(dn.name), "gl": gl_of(dn.name),
            "bin_fifo": binv(FIFO), "bin_mavg": binv(MAVG),
            "note": "FIFO 4@100=400 + MAVG 3@50=150 -> COGS 550"}

def h_K_DELIVERY_CANCEL():
    receipt(FIFO, 10, 100)
    dn = deliver(FIFO, 5)
    before = binv(FIFO)
    dn.cancel()
    return {"bin_after_delivery": before, "bin_after_cancel": binv(FIFO),
            "sle_incl_cancelled": M.norm(frappe.get_all("Stock Ledger Entry", filters={"voucher_no": dn.name},
                fields=["actual_qty", "is_cancelled", "valuation_rate", "stock_value_difference"], order_by="creation"))}

def h_K_RETURN_REVERSAL():
    receipt(FIFO, 10, 100)
    dn = deliver(FIFO, 5)
    ret = deliver(FIFO, 2, ptime="11:00:00", is_return=True, return_against=dn.name)
    return {"delivery": dn_cap(dn, FIFO), "return": dn_cap(ret, FIFO), "bin_after": binv(FIFO),
            "note": "sales return of 2 units brings stock back; capture return valuation"}

def h_K_NEGATIVE_STOCK():
    # deliver from zero stock with allow_negative_stock disabled
    return {"observed_error": M.observe(lambda: deliver(FIFO, 5)), "bin": binv(FIFO)}

def h_K_ROUNDING_BOUNDARY():
    receipt(FIFO, 3, 10.005); receipt(FIFO, 3, 10.015)
    dn = deliver(FIFO, 4)
    return {"dn": dn_cap(dn, FIFO), "note": "fractional valuation rates -> rounding at precision boundary"}

def h_K_STOCK_BALANCE_STEPS():
    steps = {}
    receipt(FIFO, 10, 100); steps["after_receipt1"] = binv(FIFO)
    receipt(FIFO, 10, 120); steps["after_receipt2"] = binv(FIFO)
    dn = deliver(FIFO, 15); steps["after_delivery"] = binv(FIFO)
    return {"steps": steps, "stock_balance_report": stock_report(FIFO), "dn_sle": sle_of(dn.name)}


HANDLERS = {
    "O2C-K-FIFO-LAYERS-087": h_K_FIFO_LAYERS,
    "O2C-K-MAVG-LAYERS-088": h_K_MAVG_LAYERS,
    "O2C-K-LIFO-LAYERS-089": h_K_LIFO_LAYERS,
    "O2C-K-PARTIAL-DELIVERY-090": h_K_PARTIAL_DELIVERY,
    "O2C-K-FULL-DELIVERY-091": h_K_FULL_DELIVERY,
    "O2C-K-MULTI-LINE-092": h_K_MULTI_LINE,
    "O2C-K-DELIVERY-CANCEL-093": h_K_DELIVERY_CANCEL,
    "O2C-K-RETURN-REVERSAL-094": h_K_RETURN_REVERSAL,
    "O2C-K-NEGATIVE-STOCK-095": h_K_NEGATIVE_STOCK,
    "O2C-K-ROUNDING-BOUNDARY-096": h_K_ROUNDING_BOUNDARY,
    "O2C-K-STOCK-BALANCE-STEPS-097": h_K_STOCK_BALANCE_STEPS,
}


def run():
    frappe.set_user("Administrator")
    out = {"provenance": {}, "val_setup": {}, "fixtures": {}, "summary": {}}
    try:
        out["provenance"] = {"frappe": frappe.__version__, "erpnext": frappe.get_attr("erpnext.__version__")}
    except Exception:
        pass
    try:
        M.setup(out)
        val_setup(out)
        frappe.db.commit()
    except Exception as exc:
        import traceback
        out["summary"] = {"setup_failed": True, "type": type(exc).__name__, "msg": str(exc)[:400],
                          "tb": traceback.format_exc()[-1200:]}
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
                "type": type(exc).__name__, "msg": str(exc)[:300], "tb": traceback.format_exc()[-600:]}}
            err += 1; print(f"FIX {fid} FAIL {type(exc).__name__}: {str(exc)[:130]}")
        finally:
            frappe.set_user("Administrator")
            try:
                frappe.db.rollback()
            except Exception:
                pass
    out["summary"] = {"total": len(HANDLERS), "captured": ok, "handler_failures": err}
    print(f"VAL_DONE total={len(HANDLERS)} ok={ok} fail={err}")
    print("CAPTURE_JSON_START"); print(json.dumps(out, default=str)); print("CAPTURE_JSON_END")
    return {"ok": err == 0, "captured": ok, "failed": err}
