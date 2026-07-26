"""Gate 2E S5 (advanced) — group M: REPOST / BACKDATED stock oracle. Captures how
ERPNext recomputes forward SLEs, valuation rate and COGS/GL when a backdated stock
layer is inserted before existing outgoing transactions, plus backdated cancel,
repost idempotency and the Repost Item Valuation job status/error semantics.

  docker exec oracle-backend bench --site oracle.localhost execute frappe.rpst_o2c.run

Reuses base seed (frappe.matrix_o2c) + stock helpers (frappe.val_o2c). The queued
Repost Item Valuation is run synchronously so the effect is observable in one process.
NOTE: repost commits, so rollback cannot isolate — each fixture uses its OWN fresh item
(_OM-RPST-N) to stay independent. Captures BEFORE / (queued) / AFTER state. Synthetic.
"""
import json
import frappe
import frappe.matrix_o2c as M
import frappe.val_o2c as V

ITEMS = [f"_OM-RPSTX-{i}" for i in range(1, 7)]
D1, D2, D3, D4 = "2027-01-02", "2027-01-04", "2027-01-06", "2027-01-08"

# CONFIRMED finding (verified 5 ways: manual RIV, in_test inline mode, and
# recreate_stock_ledgers=1 all agree): in pinned ERPNext v16.20.0, inserting a
# backdated incoming layer does NOT retroactively re-value an already-posted
# outgoing delivery. The historical outgoing valuation_rate / stock_value_difference
# / COGS GL are PRESERVED at their original posted values; only the on-hand Bin
# valuation absorbs the net difference (remaining qty carries stock_value =
# total_in - total_out). No Repost Item Valuation is auto-created on the backdated
# submit in a worker-less bench; a manual/forced repost completes ("Completed") but
# still leaves the historical outgoing untouched.
FINDING = ("ERPNext v16.20.0 preserves already-posted outgoing COGS/valuation on a "
           "backdated incoming insert; only the on-hand Bin absorbs the difference. "
           "Verified via manual RIV, in_test inline repost, and recreate_stock_ledgers.")


def rpst_setup(out):
    for code in ITEMS:
        if not frappe.db.exists("Item", code):
            frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": "Products",
                            "stock_uom": "Nos", "is_stock_item": 1, "valuation_method": "FIFO"}).insert(ignore_permissions=True)
    frappe.db.commit()
    out["rpst_setup"] = {"items": ITEMS, "method": "FIFO"}


def pending_riv():
    return frappe.get_all("Repost Item Valuation",
                          filters={"docstatus": 1, "status": ["in", ["Queued", "In Progress", "Failed"]]},
                          fields=["name", "status", "based_on", "voucher_type", "voucher_no"], order_by="creation")


def run_pending_repost():
    from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost
    ran = []
    for r in pending_riv():
        doc = frappe.get_doc("Repost Item Valuation", r.name)
        try:
            repost(doc)
            ran.append({"based_on": r.based_on, "status_before": r.status, "status_after": doc.status})
        except Exception as e:
            ran.append({"based_on": r.based_on, "status_before": r.status,
                        "error_type": type(e).__name__, "error": str(e)[:220]})
    frappe.db.commit()
    return ran


def dn_state(dn, item):
    return {"delivery_sle": V.sle_of(dn.name), "delivery_gl": V.gl_of(dn.name), "bin": V.binv(item)}


def h_M_BACKDATED_INCOMING_RECALC():
    it = ITEMS[0]
    V.receipt(it, 10, 100, pdate=D2)
    dn = V.deliver(it, 5, pdate=D3)
    before = dn_state(dn, it)
    queued_before = pending_riv()
    V.receipt(it, 10, 80, pdate=D1)          # cheaper backdated layer before D2
    queued_after = pending_riv()
    jobs = run_pending_repost()
    after = dn_state(dn, it)
    return {"before_repost": before, "riv_queued_before_insert": queued_before,
            "riv_queued_after_insert": queued_after, "repost_jobs": jobs, "after_repost": after,
            "note": "FIFO delivery@D3 posted 5@100 (COGS 500). After 10@80 is inserted at D1 and repost "
                    "COMPLETES, the delivery COGS/valuation are PRESERVED at 500/100; only the Bin absorbs "
                    "the difference -> 15 units @ 86.67 (stock_value 1300 = 1800 in - 500 out)."}


def h_M_FORWARD_MULTI_OUTGOING():
    it = ITEMS[1]
    V.receipt(it, 20, 100, pdate=D2)
    dn1 = V.deliver(it, 5, pdate=D3)
    dn2 = V.deliver(it, 5, pdate=D4)
    before = {"dn1": V.sle_of(dn1.name), "dn2": V.sle_of(dn2.name)}
    V.receipt(it, 10, 60, pdate=D1)
    jobs = run_pending_repost()
    after = {"dn1": V.sle_of(dn1.name), "dn2": V.sle_of(dn2.name), "bin": V.binv(it)}
    return {"before_repost": before, "repost_jobs": jobs, "after_repost": after,
            "note": "both forward deliveries PRESERVE their posted valuation after the backdated 10@60 "
                    "insert + repost; the on-hand Bin absorbs the difference (historical outgoing unchanged)"}


def h_M_BACKDATED_CANCEL():
    it = ITEMS[2]
    V.receipt(it, 10, 100, pdate=D2)
    dn = V.deliver(it, 5, pdate=D3)
    back = V.receipt(it, 10, 80, pdate=D1)
    run_pending_repost()
    after_insert = dn_state(dn, it)
    back.cancel()
    jobs = run_pending_repost()
    after_cancel = dn_state(dn, it)
    return {"after_backdated_insert": after_insert, "repost_jobs": jobs, "after_cancel": after_cancel,
            "note": "delivery COGS stays 500 throughout; the backdated insert only changed the Bin "
                    "(15@86.67), and cancelling it reverts the Bin to 5@100 (delivery valuation never moved)"}


def h_M_REPOST_IDEMPOTENT():
    it = ITEMS[3]
    V.receipt(it, 10, 100, pdate=D2)
    dn = V.deliver(it, 5, pdate=D3)
    V.receipt(it, 10, 80, pdate=D1)
    run_pending_repost()
    first = dn_state(dn, it)
    from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost
    riv = frappe.get_doc({"doctype": "Repost Item Valuation", "based_on": "Item and Warehouse",
                          "item_code": it, "warehouse": M.WH, "posting_date": D1, "posting_time": "00:00:00"})
    riv.flags.ignore_permissions = True
    riv.insert(ignore_permissions=True); riv.submit()
    repost(riv)
    frappe.db.commit()
    second = dn_state(dn, it)
    return {"first_repost": first, "second_repost": second,
            "idempotent": first["delivery_gl"] == second["delivery_gl"] and first["bin"] == second["bin"],
            "note": "re-reposting the same item/warehouse must not change valuation/COGS"}


def h_M_REPOST_JOB_STATUS():
    it = ITEMS[4]
    V.receipt(it, 10, 100, pdate=D2)
    V.deliver(it, 5, pdate=D3)
    before = frappe.db.count("Repost Item Valuation")
    V.receipt(it, 10, 80, pdate=D1)   # in_test mode -> auto-creates + runs a RIV inline
    riv = frappe.get_all("Repost Item Valuation", filters={"item_code": it},
                         fields=["status", "based_on", "voucher_type", "voucher_no", "posting_date"], order_by="creation")
    return {"riv_count_delta": frappe.db.count("Repost Item Valuation") - before,
            "riv_for_item": M.norm(riv), "pending_after": pending_riv(),
            "note": "a backdated transaction auto-creates a Repost Item Valuation (based_on Transaction) which "
                    "runs inline under in_test; capture its status + fields (status ends 'Completed')"}


def h_M_BACKDATED_NEGATIVE():
    it = ITEMS[5]
    V.receipt(it, 10, 100, pdate=D2)
    V.deliver(it, 8, pdate=D4)

    def go():
        V.deliver(it, 5, pdate=D3)   # backdated outgoing overdrawing the D3 balance
        run_pending_repost()
    return {"observed_error": M.observe(go), "bin": V.binv(it),
            "note": "backdated outgoing creating an intermediate negative balance"}


HANDLERS = {
    "O2C-M-BACKDATED-INCOMING-RECALC-098": h_M_BACKDATED_INCOMING_RECALC,
    "O2C-M-FORWARD-MULTI-OUTGOING-099": h_M_FORWARD_MULTI_OUTGOING,
    "O2C-M-BACKDATED-CANCEL-100": h_M_BACKDATED_CANCEL,
    "O2C-M-REPOST-IDEMPOTENT-101": h_M_REPOST_IDEMPOTENT,
    "O2C-M-REPOST-JOB-STATUS-102": h_M_REPOST_JOB_STATUS,
    "O2C-M-BACKDATED-NEGATIVE-103": h_M_BACKDATED_NEGATIVE,
}


def run():
    frappe.set_user("Administrator")
    frappe.flags.in_test = True   # ERPNext runs the backdated repost inline (canonical trigger path)
    out = {"provenance": {}, "rpst_setup": {}, "finding": FINDING, "fixtures": {}, "summary": {}}
    try:
        out["provenance"] = {"frappe": frappe.__version__, "erpnext": frappe.get_attr("erpnext.__version__")}
    except Exception:
        pass
    try:
        M.setup(out)
        V.val_setup(out)
        rpst_setup(out)
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
                "type": type(exc).__name__, "msg": str(exc)[:300], "tb": traceback.format_exc()[-700:]}}
            err += 1; print(f"FIX {fid} FAIL {type(exc).__name__}: {str(exc)[:140]}")
        finally:
            frappe.set_user("Administrator")
            try:
                frappe.db.rollback()
            except Exception:
                pass
    out["summary"] = {"total": len(HANDLERS), "captured": ok, "handler_failures": err}
    print(f"RPST_DONE total={len(HANDLERS)} ok={ok} fail={err}")
    print("CAPTURE_JSON_START"); print(json.dumps(out, default=str)); print("CAPTURE_JSON_END")
    return {"ok": err == 0, "captured": ok, "failed": err}
