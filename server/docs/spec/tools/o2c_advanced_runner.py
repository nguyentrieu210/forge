"""Gate 2E S5 (advanced) — ADVANCED O2C oracle: group I (advanced tax) + group J
(multi-currency). Reuses the proven base seed + helpers from frappe.matrix_o2c and
captures ERPNext ground truth for tax charge-types, inclusive tax, discounts,
foreign-currency invoicing and FX gain/loss. Rollback-isolated per fixture.

  docker exec oracle-backend bench --site oracle.localhost execute frappe.adv_o2c.run

Synthetic data only (_OM-*); no secrets.
"""
import json
import frappe
import frappe.matrix_o2c as M

TAXA = TAXB = None
CUST_EUR = "_OM-CUST-EUR"
DEBTORS_EUR = None


def adv_setup(out):
    global TAXA, TAXB, DEBTORS_EUR
    C, ab = M.COMPANY, M.ABBR
    tax_parent = frappe.db.get_value("Account", {"company": C, "account_type": "Tax", "is_group": 1}, "name") \
        or frappe.db.get_value("Account", {"company": C, "root_type": "Liability", "is_group": 1}, "name")

    def mktax(nm):
        full = f"{nm} - {ab}"
        if not frappe.db.exists("Account", full):
            frappe.get_doc({"doctype": "Account", "account_name": nm, "company": C, "parent_account": tax_parent,
                            "account_type": "Tax", "is_group": 0}).insert(ignore_permissions=True)
        return frappe.db.get_value("Account", {"company": C, "account_name": nm, "is_group": 0}, "name")

    TAXA, TAXB = mktax("Output Tax A"), mktax("Output Tax B")

    # EUR enabled + currency exchange both directions at the posting date
    if frappe.db.exists("Currency", "EUR"):
        frappe.db.set_value("Currency", "EUR", "enabled", 1)
    for f, t, r in [("EUR", "USD", 1.10), ("USD", "EUR", 0.9091)]:
        if not frappe.db.exists("Currency Exchange", {"from_currency": f, "to_currency": t, "date": M.PDATE}):
            frappe.get_doc({"doctype": "Currency Exchange", "from_currency": f, "to_currency": t,
                            "date": M.PDATE, "exchange_rate": r, "for_selling": 1, "for_buying": 1}).insert(ignore_permissions=True)

    # EUR-denominated receivable + EUR customer so payment-side FX gain/loss is real
    recv_parent = frappe.db.get_value("Account", M.ACC["debtors"], "parent_account")
    DEBTORS_EUR = f"Debtors EUR - {ab}"
    if not frappe.db.exists("Account", DEBTORS_EUR):
        frappe.get_doc({"doctype": "Account", "account_name": "Debtors EUR", "company": C, "parent_account": recv_parent,
                        "account_type": "Receivable", "account_currency": "EUR", "is_group": 0}).insert(ignore_permissions=True)
    if not frappe.db.exists("Customer", CUST_EUR):
        frappe.get_doc({"doctype": "Customer", "customer_name": CUST_EUR, "customer_group": "Commercial",
                        "territory": "Rest Of The World", "default_currency": "EUR",
                        "accounts": [{"company": C, "account": DEBTORS_EUR}]}).insert(ignore_permissions=True)
    # Adding a 2nd Receivable leaf (Debtors EUR) makes matrix_o2c.setup()'s
    # account_type=Receivable lookup ambiguous; pin ACC["debtors"] to the USD one so
    # group-I (USD) invoices don't accidentally post to the EUR receivable.
    M.ACC["debtors"] = frappe.db.get_value("Account", {"company": C, "account_name": "Debtors", "is_group": 0}, "name") \
        or M.ACC["debtors"]
    frappe.db.commit()
    out["adv_setup"] = {"TAXA": TAXA, "TAXB": TAXB, "debtors_eur": DEBTORS_EUR, "debtors_usd": M.ACC["debtors"],
                        "exchange_gain_loss": frappe.db.get_value("Company", C, "exchange_gain_loss_account")}


# ---- builders -------------------------------------------------------------
def si_usd(taxes=None, qty=5, rate=100, discount=None, apply_on="Grand Total"):
    so = M.new_so(qty=qty, rate=rate)
    si = M._mappers()[1](so.name)
    si.debit_to = M.ACC["debtors"]
    for it in si.items:
        it.income_account = M.ACC["income"]; it.cost_center = M.CC
    for t in (taxes or []):
        t.setdefault("cost_center", M.CC)
        si.append("taxes", t)
    if discount is not None:
        si.apply_discount_on = apply_on
        si.additional_discount_percentage = discount
    si.insert(ignore_permissions=True); si.submit()
    return si


def so_fx(currency, conv, customer=None, qty=5, rate=100):
    so = frappe.get_doc({"doctype": "Sales Order", "customer": customer or M.CUST, "company": M.COMPANY,
                         "currency": currency, "conversion_rate": conv, "selling_price_list": M.SPL,
                         "price_list_currency": currency, "plc_conversion_rate": conv, "ignore_pricing_rule": 1,
                         "transaction_date": M.PDATE, "delivery_date": M.PDATE,
                         "items": [{"item_code": M.ITEM, "qty": qty, "rate": rate, "warehouse": M.WH,
                                    "delivery_date": M.PDATE, "cost_center": M.CC}]})
    so.insert(ignore_permissions=True); so.submit()
    return so


def si_fx(currency, conv, customer=None, debtors=None, qty=5, rate=100):
    so = so_fx(currency, conv, customer=customer, qty=qty, rate=rate)
    si = M._mappers()[1](so.name)
    si.debit_to = debtors or M.ACC["debtors"]
    si.conversion_rate = conv
    for it in si.items:
        it.income_account = M.ACC["income"]; it.cost_center = M.CC
    si.insert(ignore_permissions=True); si.submit()
    return si


def pe_fx(si, paid_to_rate=None):
    pe = M._mappers()[3]("Sales Invoice", si.name)
    pe.paid_to = M.CASH
    pe.reference_no = "_OM-PEFX"; pe.reference_date = M.PDATE
    if paid_to_rate is not None:
        # settle at a different EUR->USD rate than the invoice -> FX gain/loss
        pe.source_exchange_rate = paid_to_rate
    pe.insert(ignore_permissions=True); pe.submit()
    return pe


def taxrow(acct, ct, rate=0, amount=0, included=0, add_deduct="Add", row_id=None):
    r = {"charge_type": ct, "account_head": acct, "description": ct, "rate": rate,
         "included_in_print_rate": included, "add_deduct_tax": add_deduct}
    if amount:
        r["tax_amount"] = amount
    if row_id:
        r["row_id"] = row_id
    return r


# ---- group I: advanced tax ------------------------------------------------
def h_I_MULTI_TAX_ROWS():
    si = si_usd([taxrow(TAXA, "On Net Total", rate=10), taxrow(TAXB, "On Net Total", rate=5)])
    return {"si": M.cap(si), "total_taxes": si.total_taxes_and_charges,
            "tax_rows": [{"acct": t.account_head, "rate": t.rate, "amount": t.tax_amount, "total": t.total} for t in si.taxes]}

def h_I_INCLUSIVE_TAX():
    si = si_usd([taxrow(TAXA, "On Net Total", rate=10, included=1)])
    return {"si": M.cap(si), "net_total": si.net_total, "grand_total": si.grand_total,
            "total_taxes": si.total_taxes_and_charges, "note": "tax included in the 100 rate -> net back-calculated"}

def h_I_TAX_ON_PREVIOUS_ROW_TOTAL():
    # row_id is valid ONLY on the referring "On Previous Row Total" row (points at row 1)
    si = si_usd([taxrow(TAXA, "On Net Total", rate=10),
                 taxrow(TAXB, "On Previous Row Total", rate=5, row_id=1)])
    return {"si": M.cap(si), "tax_rows": [{"ct": t.charge_type, "rate": t.rate, "amount": t.tax_amount, "total": t.total} for t in si.taxes]}

def h_I_ACTUAL_TAX():
    si = si_usd([taxrow(TAXA, "Actual", amount=37.50)])
    return {"si": M.cap(si), "total_taxes": si.total_taxes_and_charges, "grand_total": si.grand_total}

def h_I_ON_ITEM_QUANTITY():
    si = si_usd([taxrow(TAXA, "On Item Quantity", rate=3)], qty=5)
    return {"si": M.cap(si), "total_taxes": si.total_taxes_and_charges,
            "note": "per-unit tax 3 x 5 qty = 15 expected"}

def h_I_ADDITIONAL_DISCOUNT_ON_GRAND():
    si = si_usd([taxrow(TAXA, "On Net Total", rate=10)], discount=10, apply_on="Grand Total")
    return {"si": M.cap(si), "net_total": si.net_total, "grand_total": si.grand_total,
            "discount_amount": si.discount_amount, "apply_on": si.apply_discount_on}

def h_I_ADDITIONAL_DISCOUNT_ON_NET():
    si = si_usd([taxrow(TAXA, "On Net Total", rate=10)], discount=10, apply_on="Net Total")
    return {"si": M.cap(si), "net_total": si.net_total, "grand_total": si.grand_total,
            "discount_amount": si.discount_amount, "apply_on": si.apply_discount_on}

def h_I_DEDUCT_TAX():
    si = si_usd([taxrow(TAXA, "On Net Total", rate=10, add_deduct="Deduct")])
    return {"si": M.cap(si), "total_taxes": si.total_taxes_and_charges, "grand_total": si.grand_total,
            "note": "deduct-type tax (withholding-like) reduces grand total"}

def h_I_TAX_ROUNDING():
    si = si_usd([taxrow(TAXA, "On Net Total", rate=6.25)], qty=3, rate=10.005)
    return {"si": M.cap(si), "net_total": si.net_total, "grand_total": si.grand_total,
            "rounded_total": si.rounded_total, "rounding_adjustment": si.rounding_adjustment,
            "total_taxes": si.total_taxes_and_charges}


# ---- group J: multi-currency ----------------------------------------------
def h_J_FOREIGN_SO():
    so = so_fx("EUR", 1.10)
    return {"so": M.cap(so), "currency": so.currency, "conversion_rate": so.conversion_rate,
            "grand_total": so.grand_total, "base_grand_total": so.base_grand_total}

def h_J_FOREIGN_SI_GL():
    # an EUR invoice requires an EUR-currency receivable (party account currency == doc currency)
    si = si_fx("EUR", 1.10, customer=CUST_EUR, debtors=DEBTORS_EUR)
    return {"si": M.cap(si), "currency": si.currency, "conversion_rate": si.conversion_rate,
            "grand_total": si.grand_total, "base_grand_total": si.base_grand_total,
            "note": "GL posts base (USD) amounts; grand_total is EUR"}

def h_J_OUTSTANDING_TXN_VS_BASE():
    si = si_fx("EUR", 1.10, customer=CUST_EUR, debtors=DEBTORS_EUR)
    return {"currency": si.currency, "outstanding_amount": si.outstanding_amount,
            "base_grand_total": si.base_grand_total, "grand_total": si.grand_total}

def h_J_PE_SAME_RATE():
    si = si_fx("EUR", 1.10, customer=CUST_EUR, debtors=DEBTORS_EUR)
    pe = pe_fx(si)
    si.reload()
    return {"pe": M.cap(pe), "si_outstanding_after": si.outstanding_amount, "si_status": si.status,
            "note": "payment at the invoice rate -> no exchange gain/loss expected"}

def h_J_PE_DIFF_RATE_GAIN():
    si = si_fx("EUR", 1.10, customer=CUST_EUR, debtors=DEBTORS_EUR)
    pe = pe_fx(si, paid_to_rate=1.20)  # EUR strengthened -> gain
    si.reload()
    return {"pe": M.cap(pe), "si_outstanding_after": si.outstanding_amount,
            "note": "settled at 1.20 vs invoice 1.10 -> exchange gain GL line expected"}

def h_J_PE_DIFF_RATE_LOSS():
    si = si_fx("EUR", 1.10, customer=CUST_EUR, debtors=DEBTORS_EUR)
    pe = pe_fx(si, paid_to_rate=1.00)  # EUR weakened -> loss
    si.reload()
    return {"pe": M.cap(pe), "si_outstanding_after": si.outstanding_amount,
            "note": "settled at 1.00 vs invoice 1.10 -> exchange loss GL line expected"}


HANDLERS = {
    "O2C-I-MULTI-TAX-ROWS-072": h_I_MULTI_TAX_ROWS,
    "O2C-I-INCLUSIVE-TAX-073": h_I_INCLUSIVE_TAX,
    "O2C-I-TAX-ON-PREVIOUS-ROW-TOTAL-074": h_I_TAX_ON_PREVIOUS_ROW_TOTAL,
    "O2C-I-ACTUAL-TAX-075": h_I_ACTUAL_TAX,
    "O2C-I-ON-ITEM-QUANTITY-076": h_I_ON_ITEM_QUANTITY,
    "O2C-I-ADDITIONAL-DISCOUNT-ON-GRAND-077": h_I_ADDITIONAL_DISCOUNT_ON_GRAND,
    "O2C-I-ADDITIONAL-DISCOUNT-ON-NET-078": h_I_ADDITIONAL_DISCOUNT_ON_NET,
    "O2C-I-DEDUCT-TAX-079": h_I_DEDUCT_TAX,
    "O2C-I-TAX-ROUNDING-080": h_I_TAX_ROUNDING,
    "O2C-J-FOREIGN-SO-081": h_J_FOREIGN_SO,
    "O2C-J-FOREIGN-SI-GL-082": h_J_FOREIGN_SI_GL,
    "O2C-J-OUTSTANDING-TXN-VS-BASE-083": h_J_OUTSTANDING_TXN_VS_BASE,
    "O2C-J-PE-SAME-RATE-084": h_J_PE_SAME_RATE,
    "O2C-J-PE-DIFF-RATE-GAIN-085": h_J_PE_DIFF_RATE_GAIN,
    "O2C-J-PE-DIFF-RATE-LOSS-086": h_J_PE_DIFF_RATE_LOSS,
}


def run():
    frappe.set_user("Administrator")
    out = {"provenance": {}, "adv_setup": {}, "fixtures": {}, "summary": {}}
    try:
        out["provenance"] = {"frappe": frappe.__version__, "erpnext": frappe.get_attr("erpnext.__version__")}
    except Exception:
        pass
    try:
        M.setup(out)
        adv_setup(out)
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
    print(f"ADV_DONE total={len(HANDLERS)} ok={ok} fail={err}")
    print("CAPTURE_JSON_START"); print(json.dumps(out, default=str)); print("CAPTURE_JSON_END")
    return {"ok": err == 0, "captured": ok, "failed": err}
