"""Gate 2E S5 — FULL behavioral oracle matrix runner (71 fixtures, groups A-H).

Runs inside the pinned oracle bench against ERPNext's own controllers/mappers:
  docker exec oracle-backend bench --site oracle.localhost execute frappe.matrix_o2c.run

Determinism WITHOUT a slow per-fixture site reinstall:
  * a FRESH company namespace (_OMatrixCo / _OM) is seeded and COMMITTED once, with
    generous opening stock, so it is isolated from any prior smoke data;
  * every fixture runs in the ambient transaction and ends with frappe.db.rollback(),
    so each fixture starts from the identical committed base state.

Each fixture is independently wrapped: a handler bug is recorded as `handler_exception`
(a runner bug to fix), distinct from an ERPNext business error that a fixture *expects*
(recorded as `observed_error`). One JSON blob is emitted between CAPTURE_JSON markers.
All data is synthetic (`_OM-*`); no real party/account/item; no secrets.
"""
import json
import frappe

SITE = "oracle.localhost"
COMPANY = "_OMatrixCo"
ABBR = "_OM"
CUST = "_OM-CUST"
CUST2 = "_OM-CUST2"
ITEM = "_OM-ITEM"
ITEM2 = "_OM-ITEM2"
ITEMF = "_OM-ITEMF"   # fractional-UOM item (Must-be-Whole-Number disabled)
WH = f"Stores - {ABBR}"
PDATE = "2027-01-04"
PTIME = "10:00:00"
CC = None
SPL = None
CASH = None
ACC = {}

_STRIP = {"name", "creation", "modified", "modified_by", "owner", "idx", "amended_from",
          "_user_tags", "_comments", "_assign", "_liked_by", "lft", "rgt", "docstatus_str"}


def norm(v):
    if isinstance(v, dict):
        return {k: norm(x) for k, x in sorted(v.items()) if k not in _STRIP}
    if isinstance(v, (list, tuple)):
        return [norm(x) for x in v]
    return v


# ---------------------------------------------------------------- base setup ---
def setup(out):
    from erpnext.setup.setup_wizard.operations import install_fixtures
    from frappe.utils import nowdate
    if not frappe.db.exists("Customer Group", "All Customer Groups"):
        install_fixtures.install("United States"); frappe.db.commit()
    if not frappe.db.exists("Warehouse Type", "Transit"):
        frappe.get_doc({"doctype": "Warehouse Type", "__newname": "Transit"}).insert(ignore_permissions=True)
    cur = nowdate()[:4]
    mid = f"{cur}-06-01"
    covers_cur = frappe.get_all("Fiscal Year", filters=[["year_start_date", "<=", mid], ["year_end_date", ">=", mid]],
                                limit=1, ignore_permissions=True)
    if cur != "2027" and not covers_cur:
        frappe.get_doc({"doctype": "Fiscal Year", "year": f"_OM-{cur}",
                        "year_start_date": f"{cur}-01-01", "year_end_date": f"{cur}-12-31"}).insert(ignore_permissions=True)
    if not frappe.db.exists("Company", COMPANY):
        args = frappe._dict({"company_name": COMPANY, "company_abbr": ABBR, "currency": "USD",
                             "country": "United States", "chart_of_accounts": "Standard",
                             "fy_start_date": "2027-01-01", "fy_end_date": "2027-12-31",
                             "domain": "Distribution", "bank_account": "Cash"})
        install_fixtures.install_company(args)
        install_fixtures.install_defaults(args)
        frappe.db.commit()

    global CC, SPL, CASH, ACC
    CASH = f"Cash - {ABBR}"
    if not frappe.db.exists("Account", CASH):
        parent = frappe.db.get_value("Account", {"company": COMPANY, "account_type": "Bank", "is_group": 1}, "name") \
            or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Asset", "is_group": 1}, "name")
        frappe.get_doc({"doctype": "Account", "account_name": "Cash", "company": COMPANY,
                        "parent_account": parent, "account_type": "Cash", "is_group": 0}).insert(ignore_permissions=True)
    for c in (CUST, CUST2):
        if not frappe.db.exists("Customer", c):
            frappe.get_doc({"doctype": "Customer", "customer_name": c,
                            "customer_group": "Commercial", "territory": "Rest Of The World"}).insert(ignore_permissions=True)
    for it in (ITEM, ITEM2):
        if not frappe.db.exists("Item", it):
            frappe.get_doc({"doctype": "Item", "item_code": it, "item_name": it,
                            "item_group": "Products", "stock_uom": "Nos", "is_stock_item": 1}).insert(ignore_permissions=True)
    # a fractional-capable UOM + item so the fractional-qty fixture exercises the
    # arithmetic path instead of tripping ERPNext's whole-number UOM guard.
    if not frappe.db.exists("UOM", "_OM-FracUnit"):
        frappe.get_doc({"doctype": "UOM", "uom_name": "_OM-FracUnit", "must_be_whole_number": 0}).insert(ignore_permissions=True)
    if not frappe.db.exists("Item", ITEMF):
        frappe.get_doc({"doctype": "Item", "item_code": ITEMF, "item_name": ITEMF,
                        "item_group": "Products", "stock_uom": "_OM-FracUnit", "is_stock_item": 1}).insert(ignore_permissions=True)

    ACC = {
        "cogs": frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Cost of Goods Sold", "is_group": 0}, "name")
        or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Expense", "is_group": 0}, "name"),
        "income": frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Sales", "is_group": 0}, "name")
        or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Income", "is_group": 0}, "name"),
        "debtors": frappe.db.get_value("Account", {"company": COMPANY, "account_type": "Receivable", "is_group": 0}, "name"),
    }
    SPL = frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name")
    if not SPL:
        SPL = frappe.get_doc({"doctype": "Price List", "price_list_name": "_OM Selling", "selling": 1,
                              "buying": 0, "currency": "USD", "enabled": 1}).insert(ignore_permissions=True).name
    saa = frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Stock Adjustment", "is_group": 0}, "name") \
        or frappe.db.get_value("Account", {"company": COMPANY, "account_type": "Stock Adjustment", "is_group": 0}, "name")
    CC = frappe.db.get_value("Company", COMPANY, "cost_center") \
        or frappe.db.get_value("Cost Center", {"company": COMPANY, "is_group": 0}, "name")
    if not CC:
        root_name = f"{COMPANY} - {ABBR}"
        if not frappe.db.exists("Cost Center", root_name):
            rc = frappe.get_doc({"doctype": "Cost Center", "cost_center_name": COMPANY, "company": COMPANY, "is_group": 1})
            rc.flags.ignore_mandatory = True
            rc.insert(ignore_permissions=True)
        CC = frappe.get_doc({"doctype": "Cost Center", "cost_center_name": "Main", "company": COMPANY,
                             "parent_cost_center": root_name, "is_group": 0}).insert(ignore_permissions=True).name
    if saa and not frappe.db.get_value("Company", COMPANY, "stock_adjustment_account"):
        frappe.db.set_value("Company", COMPANY, "stock_adjustment_account", saa)
    if not frappe.db.get_value("Company", COMPANY, "cost_center"):
        frappe.db.set_value("Company", COMPANY, "cost_center", CC)
    roa = frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Round Off", "is_group": 0}, "name")
    if roa and not frappe.db.get_value("Company", COMPANY, "round_off_account"):
        frappe.db.set_value("Company", COMPANY, "round_off_account", roa)
        frappe.db.set_value("Company", COMPANY, "round_off_cost_center", CC)
    # generous opening stock so no fixture runs out (per item)
    for it in (ITEM, ITEM2):
        have = frappe.db.get_value("Bin", {"item_code": it, "warehouse": WH}, "actual_qty") or 0
        if have < 1000:
            se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": COMPANY,
                                 "posting_date": PDATE, "posting_time": "09:00:00",
                                 "items": [{"item_code": it, "qty": 100000, "t_warehouse": WH, "basic_rate": 100,
                                            "expense_account": saa, "cost_center": CC}]})
            se.insert(ignore_permissions=True); se.submit()
    frappe.db.commit()
    out["base"] = {"company": COMPANY, "cost_center": CC, "price_list": SPL,
                   "accounts": {**ACC, "cash": CASH},
                   "opening_qty": {it: frappe.db.get_value("Bin", {"item_code": it, "warehouse": WH}, "actual_qty") for it in (ITEM, ITEM2)}}


# ------------------------------------------------------------------ helpers ---
def _mappers():
    from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note, make_sales_invoice
    from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice as dn_make_si
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
    return make_delivery_note, make_sales_invoice, dn_make_si, get_payment_entry


def new_so(qty=5, rate=100, submit=True, customer=CUST, items=None, ignore=True):
    rows = items or [{"item_code": ITEM, "qty": qty, "rate": rate, "warehouse": WH,
                      "delivery_date": PDATE, "cost_center": CC}]
    so = frappe.get_doc({"doctype": "Sales Order", "customer": customer, "company": COMPANY, "currency": "USD",
                         "selling_price_list": SPL, "price_list_currency": "USD", "plc_conversion_rate": 1,
                         "transaction_date": PDATE, "delivery_date": PDATE, "items": rows})
    so.insert(ignore_permissions=ignore)
    if submit:
        so.submit()
    return so


def dn_from(so, submit=True, qty_map=None):
    mdn = _mappers()[0]
    dn = mdn(so.name)
    for it in dn.items:
        it.expense_account = ACC["cogs"]; it.cost_center = CC
        if qty_map is not None and it.item_code in qty_map:
            it.qty = qty_map[it.item_code]
    dn.insert(ignore_permissions=True)
    if submit:
        dn.submit()
    return dn


def si_from_so(so, submit=True, qty_map=None):
    msi = _mappers()[1]
    si = msi(so.name)
    if ACC["debtors"]:
        si.debit_to = ACC["debtors"]
    for it in si.items:
        it.income_account = ACC["income"]; it.cost_center = CC
        if qty_map is not None and it.item_code in qty_map:
            it.qty = qty_map[it.item_code]
    si.insert(ignore_permissions=True)
    if submit:
        si.submit()
    return si


def si_from_dn(dn, submit=True):
    dnsi = _mappers()[2]
    si = dnsi(dn.name)
    if ACC["debtors"]:
        si.debit_to = ACC["debtors"]
    for it in si.items:
        it.income_account = ACC["income"]; it.cost_center = CC
    si.insert(ignore_permissions=True)
    if submit:
        si.submit()
    return si


def pe_from_si(si, submit=True, paid_amount=None, allocated=None):
    gpe = _mappers()[3]
    pe = gpe("Sales Invoice", si.name)
    pe.paid_to = CASH
    pe.reference_no = "_OM-PE"
    pe.reference_date = PDATE
    if paid_amount is not None:
        pe.paid_amount = paid_amount
        pe.received_amount = paid_amount
    if allocated is not None:
        for ref in pe.references:
            ref.allocated_amount = allocated
    pe.insert(ignore_permissions=True)
    if submit:
        pe.submit()
    return pe


def gl_of(doctype, name):
    return norm(frappe.get_all("GL Entry", filters={"voucher_type": doctype, "voucher_no": name, "is_cancelled": 0},
               fields=["account", "party_type", "party", "debit", "credit", "against_voucher_type", "against_voucher"],
               order_by="account, debit desc", ignore_permissions=True))


def sle_of(doctype, name):
    return norm(frappe.get_all("Stock Ledger Entry", filters={"voucher_type": doctype, "voucher_no": name, "is_cancelled": 0},
               fields=["item_code", "warehouse", "actual_qty", "qty_after_transaction", "valuation_rate", "stock_value_difference"],
               order_by="item_code", ignore_permissions=True))


def ple_of(doctype, name):
    if not frappe.db.exists("DocType", "Payment Ledger Entry"):
        return []
    return norm(frappe.get_all("Payment Ledger Entry", filters={"voucher_type": doctype, "voucher_no": name, "delinked": 0},
               fields=["account_type", "party_type", "party", "account", "amount", "against_voucher_type", "against_voucher_no"],
               order_by="account", ignore_permissions=True))


def cap(doc):
    d = doc if hasattr(doc, "doctype") else frappe.get_doc(doc[0], doc[1])
    dt, nm = d.doctype, d.name
    return {"doctype": dt, "docstatus": d.docstatus, "status": getattr(d, "status", None),
            "per_delivered": getattr(d, "per_delivered", None), "per_billed": getattr(d, "per_billed", None),
            "outstanding_amount": getattr(d, "outstanding_amount", None),
            "grand_total": getattr(d, "grand_total", None), "net_total": getattr(d, "net_total", None),
            "rounded_total": getattr(d, "rounded_total", None),
            "gl_entries": gl_of(dt, nm), "stock_ledger_entries": sle_of(dt, nm), "payment_ledger_entries": ple_of(dt, nm)}


def report(name, filters):
    from frappe.desk.query_report import run
    r = run(name, filters=filters, ignore_prepared_report=True)
    return {"row_count": len(r.get("result") or []), "rows": norm(r.get("result") or [])[:12]}


def bin_qty(item):
    return frappe.db.get_value("Bin", {"item_code": item, "warehouse": WH}, "actual_qty")


def stock_item_rows(item):
    # Stock Balance report chokes on an item_code filter (tree query) — run it with
    # the company/date filters that work, then post-filter to the item of interest.
    from frappe.desk.query_report import run
    r = run("Stock Balance", filters={"company": COMPANY, "from_date": PDATE, "to_date": PDATE}, ignore_prepared_report=True)
    rows = []
    for row in (r.get("result") or []):
        if isinstance(row, dict) and row.get("item_code") == item:
            rows.append({k: row.get(k) for k in ("item_code", "warehouse", "bal_qty", "bal_val", "in_qty", "out_qty", "opening_qty")})
    return rows


def observe(fn):
    try:
        r = fn()
        return {"raised": False, "result": r}
    except Exception as e:  # noqa: BLE001 — capturing ERPNext's real error is the point
        return {"raised": True, "type": type(e).__name__,
                "frappe_class": getattr(e, "__module__", "") + "." + type(e).__name__,
                "msg": str(e)[:300]}


def as_user(email, roles, fn):
    """Insert as admin, then perform fn under a limited user to observe permission checks."""
    if not frappe.db.exists("User", email):
        u = frappe.get_doc({"doctype": "User", "email": email, "first_name": "Oracle Limited",
                            "send_welcome_email": 0, "roles": [{"role": r} for r in roles]})
        u.flags.ignore_permissions = True
        u.insert(ignore_permissions=True)
    frappe.set_user(email)
    try:
        return observe(fn)
    finally:
        frappe.set_user("Administrator")


# --------------------------------------------------------------- handlers ----
# Each returns a capture dict. Business errors are captured via observe(); a raise
# that escapes is recorded by the outer loop as a handler_exception (runner bug).

def h_A_CREATE_DRAFT():
    so = new_so(submit=False)
    return {"doc": cap(so)}

def h_A_UPDATE_DRAFT():
    so = new_so(submit=False)
    so.items[0].qty = 7
    so.save(ignore_permissions=True)
    return {"doc": cap(so), "qty": so.items[0].qty, "total": so.items[0].amount}

def h_A_SUBMIT():
    so = new_so()
    return {"doc": cap(so)}

def h_A_CANCEL():
    so = new_so()
    so.cancel()
    return {"doc": cap(so)}

def h_A_AMEND():
    so = new_so()
    so.cancel()
    amended = frappe.copy_doc(so)
    amended.amended_from = so.name
    amended.insert(ignore_permissions=True)
    amended.submit()
    return {"cancelled": cap(so), "amended": cap(amended)}

def h_A_INVALID_ITEM():
    def go():
        new_so(items=[{"item_code": "_OM-NOPE", "qty": 1, "rate": 10, "warehouse": WH,
                       "delivery_date": PDATE, "cost_center": CC}])
    return {"observed_error": observe(go)}

def h_A_INVALID_QTY():
    def go():
        new_so(qty=0)
    return {"observed_error": observe(go)}

def h_A_MISSING_MANDATORY():
    def go():
        so = frappe.get_doc({"doctype": "Sales Order", "company": COMPANY, "currency": "USD",
                             "selling_price_list": SPL, "transaction_date": PDATE, "delivery_date": PDATE,
                             "items": [{"item_code": ITEM, "qty": 1, "rate": 10, "warehouse": WH,
                                        "delivery_date": PDATE, "cost_center": CC}]})
        so.insert(ignore_permissions=True)
    return {"observed_error": observe(go)}

def h_A_PRICE_RATE():
    so = new_so(qty=3, rate=33.333)
    it = so.items[0]
    return {"doc": cap(so), "rate": it.rate, "amount": it.amount, "net_amount": it.net_amount,
            "net_total": so.net_total, "grand_total": so.grand_total}

def h_A_REPLAY_EQUIV():
    so1 = new_so()
    so2 = new_so()
    return {"observation": "ERPNext has no built-in idempotency; two identical submits create two distinct vouchers",
            "so1": so1.name != so2.name, "so1_status": so1.status, "so2_status": so2.status,
            "distinct": so1.name != so2.name}

def h_A_PERMISSION_DENIED():
    so = new_so(submit=False)
    return {"observed_error": as_user("oracle-limited@example.com", [], lambda: frappe.get_doc("Sales Order", so.name).submit())}

# B. Delivery Note
def h_B_CREATE_FROM_SO():
    so = new_so(); dn = dn_from(so, submit=False)
    return {"dn": cap(dn), "mapped_qty": [it.qty for it in dn.items], "against_so": dn.items[0].against_sales_order}

def h_B_PARTIAL():
    so = new_so(qty=10); dn = dn_from(so, qty_map={ITEM: 4})
    so.reload()
    return {"dn": cap(dn), "so": cap(so)}

def h_B_FULL():
    so = new_so(qty=10); dn = dn_from(so)
    so.reload()
    return {"dn": cap(dn), "so": cap(so)}

def h_B_OVER_DELIVERY():
    so = new_so(qty=5)
    return {"observed_error": observe(lambda: dn_from(so, qty_map={ITEM: 999}))}

def h_B_WAREHOUSE_MISSING():
    so = new_so(qty=5)
    def go():
        mdn = _mappers()[0]; dn = mdn(so.name)
        for it in dn.items:
            it.expense_account = ACC["cogs"]; it.cost_center = CC; it.warehouse = None
        dn.insert(ignore_permissions=True); dn.submit()
    return {"observed_error": observe(go)}

def h_B_INSUFFICIENT_STOCK():
    # deliver from an empty warehouse to force negative stock
    empty = frappe.db.get_value("Warehouse", {"company": COMPANY, "warehouse_name": "Finished Goods", "is_group": 0}, "name") or WH
    so = new_so(qty=5, items=[{"item_code": ITEM2, "qty": 5, "rate": 100, "warehouse": empty,
                              "delivery_date": PDATE, "cost_center": CC}])
    def go():
        mdn = _mappers()[0]; dn = mdn(so.name)
        for it in dn.items:
            it.expense_account = ACC["cogs"]; it.cost_center = CC
        dn.insert(ignore_permissions=True)
        frappe.db.set_value("Bin", {"item_code": ITEM2, "warehouse": empty}, "actual_qty", 0)
        dn.submit()
    return {"observed_error": observe(go), "note": "empty warehouse to provoke NegativeStock"}

def h_B_SUBMIT():
    so = new_so(qty=6); dn = dn_from(so)
    return {"dn": cap(dn)}

def h_B_CANCEL():
    so = new_so(qty=6); dn = dn_from(so); dn.cancel(); so.reload()
    return {"dn": cap(dn), "so_after_cancel": cap(so)}

def h_B_FULFILLMENT_ROLLBACK():
    so = new_so(qty=8); dn = dn_from(so)
    so.reload(); before = so.per_delivered
    dn.cancel(); so.reload()
    return {"per_delivered_after_dn": before, "per_delivered_after_cancel": so.per_delivered, "so": cap(so)}

def h_B_MULTI_ITEM():
    so = new_so(items=[{"item_code": ITEM, "qty": 3, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC},
                       {"item_code": ITEM2, "qty": 2, "rate": 50, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    dn = dn_from(so)
    return {"dn": cap(dn), "rows": len(dn.items)}

def h_B_PERMISSION_DENIED():
    so = new_so(qty=5); dn = dn_from(so, submit=False)
    return {"observed_error": as_user("oracle-limited@example.com", [], lambda: frappe.get_doc("Delivery Note", dn.name).submit())}

# C. Sales Invoice
def h_C_CREATE_FROM_SO():
    so = new_so(); si = si_from_so(so, submit=False)
    return {"si": cap(si), "mapped_qty": [it.qty for it in si.items]}

def h_C_CREATE_AFTER_DN():
    so = new_so(qty=5); dn = dn_from(so); si = si_from_dn(dn)
    return {"si": cap(si), "dn": cap(dn)}

def h_C_PARTIAL_BILLING():
    so = new_so(qty=10); si = si_from_so(so, qty_map={ITEM: 4}); so.reload()
    return {"si": cap(si), "so": cap(so)}

def h_C_FULL_BILLING():
    so = new_so(qty=10); si = si_from_so(so); so.reload()
    return {"si": cap(si), "so": cap(so)}

def h_C_OVER_BILLING():
    so = new_so(qty=5)
    return {"observed_error": observe(lambda: si_from_so(so, qty_map={ITEM: 999}))}

def h_C_SUBMIT_GL():
    so = new_so(qty=5); si = si_from_so(so)
    return {"si": cap(si)}

def h_C_TAX_FREE_BASELINE():
    so = new_so(qty=5); si = si_from_so(so)
    return {"si": cap(si), "total_taxes": si.total_taxes_and_charges}

def h_C_SINGLE_TAX_BASELINE():
    so = new_so(qty=5)
    si = _mappers()[1](so.name)
    if ACC["debtors"]:
        si.debit_to = ACC["debtors"]
    for it in si.items:
        it.income_account = ACC["income"]; it.cost_center = CC
    taxacc = frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Sales Tax", "is_group": 0}, "name") \
        or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Liability", "is_group": 0}, "name")
    si.append("taxes", {"charge_type": "On Net Total", "account_head": taxacc, "description": "Tax 10%",
                        "rate": 10, "cost_center": CC})
    si.insert(ignore_permissions=True); si.submit()
    return {"si": cap(si), "total_taxes": si.total_taxes_and_charges, "tax_account": taxacc}

def h_C_OUTSTANDING():
    so = new_so(qty=5); si = si_from_so(so)
    return {"outstanding": si.outstanding_amount, "grand_total": si.grand_total, "status": si.status}

def h_C_CANCEL():
    so = new_so(qty=5); si = si_from_so(so); si.cancel()
    return {"si": cap(si)}

def h_C_PERMISSION_DENIED():
    so = new_so(qty=5); si = si_from_so(so, submit=False)
    return {"observed_error": as_user("oracle-limited@example.com", [], lambda: frappe.get_doc("Sales Invoice", si.name).submit())}

# D. Payment Entry
def h_D_RECEIVE_FULL():
    so = new_so(qty=5); si = si_from_so(so); pe = pe_from_si(si); si.reload()
    return {"pe": cap(pe), "si_after": cap(si)}

def h_D_RECEIVE_PARTIAL():
    so = new_so(qty=5); si = si_from_so(so)
    pe = pe_from_si(si, paid_amount=200, allocated=200); si.reload()
    return {"pe": cap(pe), "si_outstanding_after": si.outstanding_amount, "si_status": si.status}

def h_D_OVER_PAYMENT():
    so = new_so(qty=5); si = si_from_so(so)
    return {"observed_error": observe(lambda: pe_from_si(si, allocated=si.grand_total + 500))}

def h_D_ALLOCATION_MISMATCH():
    so = new_so(qty=5); si = si_from_so(so)
    def go():
        pe = pe_from_si(si, submit=False)
        pe.paid_amount = 100; pe.received_amount = 100
        for ref in pe.references:
            ref.allocated_amount = 500
        pe.submit()
    return {"observed_error": observe(go)}

def h_D_PAID_RECEIVED_BEHAVIOR():
    so = new_so(qty=5); si = si_from_so(so); pe = pe_from_si(si, submit=False)
    return {"paid_amount": pe.paid_amount, "received_amount": pe.received_amount,
            "source_exchange_rate": pe.source_exchange_rate, "target_exchange_rate": pe.target_exchange_rate,
            "equal_single_currency": pe.paid_amount == pe.received_amount}

def h_D_SUBMIT_PLE_GL():
    so = new_so(qty=5); si = si_from_so(so); pe = pe_from_si(si)
    return {"pe": cap(pe)}

def h_D_CANCEL():
    so = new_so(qty=5); si = si_from_so(so); pe = pe_from_si(si); pe.cancel(); si.reload()
    return {"pe": cap(pe), "si_after_pe_cancel": cap(si)}

def h_D_OUTSTANDING_ROLLBACK():
    so = new_so(qty=5); si = si_from_so(so)
    o0 = si.outstanding_amount
    pe = pe_from_si(si); si.reload(); o1 = si.outstanding_amount
    pe.cancel(); si.reload(); o2 = si.outstanding_amount
    return {"outstanding_initial": o0, "after_payment": o1, "after_pe_cancel": o2,
            "si_status": si.status}

def h_D_PERMISSION_DENIED():
    so = new_so(qty=5); si = si_from_so(so); pe = pe_from_si(si, submit=False)
    return {"observed_error": as_user("oracle-limited@example.com", [], lambda: frappe.get_doc("Payment Entry", pe.name).submit())}

# E. Cross-document lifecycle
def h_E_SO_DN_SI_PE_HAPPY():
    so = new_so(qty=5); dn = dn_from(so); si = si_from_so(so); pe = pe_from_si(si)
    so.reload(); si.reload()
    return {"so": cap(so), "dn": cap(dn), "si": cap(si), "pe": cap(pe),
            "ar_after": report("Accounts Receivable", {"company": COMPANY, "report_date": PDATE})}

def h_E_PARTIAL_CHAIN():
    so = new_so(qty=10); dn = dn_from(so, qty_map={ITEM: 6})
    si = si_from_so(so, qty_map={ITEM: 6})
    pe = pe_from_si(si, paid_amount=si.grand_total / 2, allocated=si.grand_total / 2)
    so.reload(); si.reload()
    return {"so": cap(so), "dn": cap(dn), "si": cap(si), "pe": cap(pe)}

def h_E_CANCEL_PE():
    so = new_so(qty=5); dn = dn_from(so); si = si_from_so(so); pe = pe_from_si(si)
    pe.cancel(); si.reload()
    return {"pe": cap(pe), "si_after": cap(si)}

def h_E_CANCEL_SI():
    so = new_so(qty=5); dn = dn_from(so); si = si_from_so(so)
    si.cancel(); so.reload()
    return {"si": cap(si), "so_after": cap(so)}

def h_E_CANCEL_DN():
    so = new_so(qty=5); dn = dn_from(so)
    dn.cancel(); so.reload()
    return {"dn": cap(dn), "so_after": cap(so)}

def h_E_CANCEL_SO_BLOCKED():
    so = new_so(qty=5); dn = dn_from(so)
    return {"observed_error": observe(lambda: frappe.get_doc("Sales Order", so.name).cancel())}

def h_E_STATUS_RECALC():
    so = new_so(qty=10)
    steps = {"initial": {"status": so.status, "per_delivered": so.per_delivered, "per_billed": so.per_billed}}
    dn = dn_from(so, qty_map={ITEM: 5}); so.reload()
    steps["after_partial_dn"] = {"status": so.status, "per_delivered": so.per_delivered}
    si = si_from_so(so); so.reload()
    steps["after_full_si"] = {"status": so.status, "per_billed": so.per_billed}
    return {"steps": steps, "so": cap(so)}

def h_E_OUTSTANDING_CHANGES():
    so = new_so(qty=5); si = si_from_so(so)
    seq = [si.outstanding_amount]
    pe = pe_from_si(si, paid_amount=200, allocated=200); si.reload(); seq.append(si.outstanding_amount)
    pe2 = pe_from_si(si, paid_amount=si.outstanding_amount, allocated=si.outstanding_amount); si.reload(); seq.append(si.outstanding_amount)
    return {"outstanding_sequence": seq, "final_status": si.status}

# F. Report oracle
def h_F_AR_BEFORE_INVOICE():
    return {"report": report("Accounts Receivable", {"company": COMPANY, "report_date": PDATE})}

def h_F_AR_AFTER_INVOICE():
    so = new_so(qty=5); si = si_from_so(so)
    return {"report": report("Accounts Receivable", {"company": COMPANY, "report_date": PDATE}), "si": si.name and cap(si)["outstanding_amount"]}

def h_F_AR_AFTER_PARTIAL_PAYMENT():
    so = new_so(qty=5); si = si_from_so(so); pe_from_si(si, paid_amount=200, allocated=200)
    return {"report": report("Accounts Receivable", {"company": COMPANY, "report_date": PDATE})}

def h_F_AR_AFTER_FULL_PAYMENT():
    so = new_so(qty=5); si = si_from_so(so); pe_from_si(si)
    return {"report": report("Accounts Receivable", {"company": COMPANY, "report_date": PDATE})}

def h_F_AR_AFTER_PAYMENT_CANCEL():
    so = new_so(qty=5); si = si_from_so(so); pe = pe_from_si(si); pe.cancel()
    return {"report": report("Accounts Receivable", {"company": COMPANY, "report_date": PDATE})}

def h_F_STOCK_BEFORE_DN():
    return {"bin_qty": bin_qty(ITEM2), "report_rows": stock_item_rows(ITEM2)}

def h_F_STOCK_AFTER_DN():
    so = new_so(qty=7, items=[{"item_code": ITEM2, "qty": 7, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    dn_from(so)
    return {"bin_qty": bin_qty(ITEM2), "report_rows": stock_item_rows(ITEM2)}

def h_F_STOCK_AFTER_DN_CANCEL():
    so = new_so(qty=7, items=[{"item_code": ITEM2, "qty": 7, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    dn = dn_from(so); dn.cancel()
    return {"bin_qty": bin_qty(ITEM2), "report_rows": stock_item_rows(ITEM2)}

# G. Numeric & boundary
def h_G_ZERO():
    return {"observed_error": observe(lambda: new_so(qty=0, rate=0))}

def h_G_NEGATIVE_INPUT():
    return {"observed_error": observe(lambda: new_so(qty=-5))}

def h_G_FRACTIONAL_QTY():
    so = new_so(items=[{"item_code": ITEMF, "qty": 2.5, "rate": 100, "warehouse": WH,
                        "delivery_date": PDATE, "cost_center": CC}])
    return {"uom": so.items[0].uom, "qty": so.items[0].qty, "amount": so.items[0].amount,
            "net_total": so.net_total, "grand_total": so.grand_total,
            "note": "fractional-capable UOM (_OM-FracUnit, whole-number guard off)"}

def h_G_FRACTIONAL_RATE():
    so = new_so(qty=3, rate=10.333)
    return {"rate": so.items[0].rate, "amount": so.items[0].amount, "net_total": so.net_total, "grand_total": so.grand_total}

def h_G_ROUNDING_BOUNDARY():
    so = new_so(qty=3, rate=10.005)
    si = si_from_so(so)
    return {"item_amount": so.items[0].amount, "net_total": si.net_total, "grand_total": si.grand_total,
            "rounded_total": si.rounded_total, "rounding_adjustment": si.rounding_adjustment}

def h_G_LARGE_AMOUNT():
    so = new_so(qty=1000, rate=999999.99)
    return {"amount": so.items[0].amount, "net_total": so.net_total, "grand_total": so.grand_total}

def h_G_DUPLICATE_ITEM_ROWS():
    so = new_so(items=[{"item_code": ITEM, "qty": 2, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC},
                       {"item_code": ITEM, "qty": 3, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    return {"rows": len(so.items), "qtys": [it.qty for it in so.items], "net_total": so.net_total, "grand_total": so.grand_total}

def h_G_SAME_TIMESTAMP():
    so = new_so(qty=3, items=[{"item_code": ITEM2, "qty": 3, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    dn1 = dn_from(so, qty_map={ITEM2: 1})
    # second delivery, same posting date/time as first
    so.reload()
    mdn = _mappers()[0]; dn2 = mdn(so.name)
    for it in dn2.items:
        it.expense_account = ACC["cogs"]; it.cost_center = CC; it.qty = 1
    dn2.posting_date = PDATE; dn2.posting_time = dn1.posting_time
    dn2.insert(ignore_permissions=True); dn2.submit()
    return {"dn1_sle": sle_of("Delivery Note", dn1.name), "dn2_sle": sle_of("Delivery Note", dn2.name),
            "dn1_time": str(dn1.posting_time), "dn2_time": str(dn2.posting_time)}

def h_G_TIMEZONE_BOUNDARY():
    so = new_so(qty=2, items=[{"item_code": ITEM2, "qty": 2, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    mdn = _mappers()[0]; dn = mdn(so.name)
    for it in dn.items:
        it.expense_account = ACC["cogs"]; it.cost_center = CC
    dn.posting_date = PDATE; dn.posting_time = "23:59:59"
    dn.insert(ignore_permissions=True); dn.submit()
    return {"posting_date": str(dn.posting_date), "posting_time": str(dn.posting_time), "sle": sle_of("Delivery Note", dn.name)}

# H. Concurrency candidates (SEQUENTIAL observation — no real race in a single txn)
def h_H_TWO_UPDATES():
    so = new_so(submit=False)
    d1 = frappe.get_doc("Sales Order", so.name)
    d2 = frappe.get_doc("Sales Order", so.name)
    d1.items[0].qty = 8; d1.save(ignore_permissions=True)
    def go():
        d2.items[0].qty = 9; d2.save(ignore_permissions=True)  # stale timestamp -> TimestampMismatchError
    return {"observed_error": observe(go), "note": "second save on a stale in-memory copy (optimistic-lock probe)"}

def h_H_TWO_DELIVERIES():
    so = new_so(qty=10)
    dn1 = dn_from(so, qty_map={ITEM: 6}); so.reload()
    dn2 = dn_from(so, qty_map={ITEM: 4}); so.reload()
    return {"dn1": cap(dn1), "dn2": cap(dn2), "so_after_both": cap(so),
            "note": "sequential: ERPNext allows multiple DNs until ordered qty is met"}

def h_H_TWO_PAYMENTS():
    so = new_so(qty=5); si = si_from_so(so)
    pe1 = pe_from_si(si, paid_amount=200, allocated=200); si.reload()
    pe2 = pe_from_si(si, paid_amount=si.outstanding_amount, allocated=si.outstanding_amount); si.reload()
    return {"pe1": cap(pe1), "pe2": cap(pe2), "si_outstanding_final": si.outstanding_amount, "si_status": si.status}

def h_H_TWO_STOCK_MUTATIONS():
    so = new_so(qty=3, items=[{"item_code": ITEM2, "qty": 3, "rate": 100, "warehouse": WH, "delivery_date": PDATE, "cost_center": CC}])
    dn1 = dn_from(so, qty_map={ITEM2: 2})
    b1 = frappe.db.get_value("Bin", {"item_code": ITEM2, "warehouse": WH}, "actual_qty")
    dn2 = dn_from(so, qty_map={ITEM2: 1})
    b2 = frappe.db.get_value("Bin", {"item_code": ITEM2, "warehouse": WH}, "actual_qty")
    return {"bin_after_dn1": b1, "bin_after_dn2": b2, "delta": (b1 - b2) if (b1 is not None and b2 is not None) else None,
            "note": "sequential stock mutations; Bin decremented per delivery"}


HANDLERS = {
    "O2C-A-CREATE-DRAFT-001": h_A_CREATE_DRAFT, "O2C-A-UPDATE-DRAFT-002": h_A_UPDATE_DRAFT,
    "O2C-A-SUBMIT-003": h_A_SUBMIT, "O2C-A-CANCEL-004": h_A_CANCEL, "O2C-A-AMEND-005": h_A_AMEND,
    "O2C-A-INVALID-ITEM-006": h_A_INVALID_ITEM, "O2C-A-INVALID-QTY-007": h_A_INVALID_QTY,
    "O2C-A-MISSING-MANDATORY-008": h_A_MISSING_MANDATORY, "O2C-A-PRICE-RATE-009": h_A_PRICE_RATE,
    "O2C-A-REPLAY-EQUIV-010": h_A_REPLAY_EQUIV, "O2C-A-PERMISSION-DENIED-011": h_A_PERMISSION_DENIED,
    "O2C-B-CREATE-FROM-SO-012": h_B_CREATE_FROM_SO, "O2C-B-PARTIAL-013": h_B_PARTIAL,
    "O2C-B-FULL-014": h_B_FULL, "O2C-B-OVER-DELIVERY-015": h_B_OVER_DELIVERY,
    "O2C-B-WAREHOUSE-MISSING-016": h_B_WAREHOUSE_MISSING, "O2C-B-INSUFFICIENT-STOCK-017": h_B_INSUFFICIENT_STOCK,
    "O2C-B-SUBMIT-018": h_B_SUBMIT, "O2C-B-CANCEL-019": h_B_CANCEL,
    "O2C-B-FULFILLMENT-ROLLBACK-020": h_B_FULFILLMENT_ROLLBACK, "O2C-B-MULTI-ITEM-021": h_B_MULTI_ITEM,
    "O2C-B-PERMISSION-DENIED-022": h_B_PERMISSION_DENIED,
    "O2C-C-CREATE-FROM-SO-023": h_C_CREATE_FROM_SO, "O2C-C-CREATE-AFTER-DN-024": h_C_CREATE_AFTER_DN,
    "O2C-C-PARTIAL-BILLING-025": h_C_PARTIAL_BILLING, "O2C-C-FULL-BILLING-026": h_C_FULL_BILLING,
    "O2C-C-OVER-BILLING-027": h_C_OVER_BILLING, "O2C-C-SUBMIT-GL-028": h_C_SUBMIT_GL,
    "O2C-C-TAX-FREE-BASELINE-029": h_C_TAX_FREE_BASELINE, "O2C-C-SINGLE-TAX-BASELINE-030": h_C_SINGLE_TAX_BASELINE,
    "O2C-C-OUTSTANDING-031": h_C_OUTSTANDING, "O2C-C-CANCEL-032": h_C_CANCEL,
    "O2C-C-PERMISSION-DENIED-033": h_C_PERMISSION_DENIED,
    "O2C-D-RECEIVE-FULL-034": h_D_RECEIVE_FULL, "O2C-D-RECEIVE-PARTIAL-035": h_D_RECEIVE_PARTIAL,
    "O2C-D-OVER-PAYMENT-036": h_D_OVER_PAYMENT, "O2C-D-ALLOCATION-MISMATCH-037": h_D_ALLOCATION_MISMATCH,
    "O2C-D-PAID-RECEIVED-BEHAVIOR-038": h_D_PAID_RECEIVED_BEHAVIOR, "O2C-D-SUBMIT-PLE-GL-039": h_D_SUBMIT_PLE_GL,
    "O2C-D-CANCEL-040": h_D_CANCEL, "O2C-D-OUTSTANDING-ROLLBACK-041": h_D_OUTSTANDING_ROLLBACK,
    "O2C-D-PERMISSION-DENIED-042": h_D_PERMISSION_DENIED,
    "O2C-E-SO-DN-SI-PE-HAPPY-043": h_E_SO_DN_SI_PE_HAPPY, "O2C-E-PARTIAL-CHAIN-044": h_E_PARTIAL_CHAIN,
    "O2C-E-CANCEL-PE-045": h_E_CANCEL_PE, "O2C-E-CANCEL-SI-046": h_E_CANCEL_SI,
    "O2C-E-CANCEL-DN-047": h_E_CANCEL_DN, "O2C-E-CANCEL-SO-BLOCKED-048": h_E_CANCEL_SO_BLOCKED,
    "O2C-E-STATUS-RECALC-049": h_E_STATUS_RECALC, "O2C-E-OUTSTANDING-CHANGES-050": h_E_OUTSTANDING_CHANGES,
    "O2C-F-AR-BEFORE-INVOICE-051": h_F_AR_BEFORE_INVOICE, "O2C-F-AR-AFTER-INVOICE-052": h_F_AR_AFTER_INVOICE,
    "O2C-F-AR-AFTER-PARTIAL-PAYMENT-053": h_F_AR_AFTER_PARTIAL_PAYMENT, "O2C-F-AR-AFTER-FULL-PAYMENT-054": h_F_AR_AFTER_FULL_PAYMENT,
    "O2C-F-AR-AFTER-PAYMENT-CANCEL-055": h_F_AR_AFTER_PAYMENT_CANCEL, "O2C-F-STOCK-BEFORE-DN-056": h_F_STOCK_BEFORE_DN,
    "O2C-F-STOCK-AFTER-DN-057": h_F_STOCK_AFTER_DN, "O2C-F-STOCK-AFTER-DN-CANCEL-058": h_F_STOCK_AFTER_DN_CANCEL,
    "O2C-G-ZERO-059": h_G_ZERO, "O2C-G-NEGATIVE-INPUT-060": h_G_NEGATIVE_INPUT,
    "O2C-G-FRACTIONAL-QTY-061": h_G_FRACTIONAL_QTY, "O2C-G-FRACTIONAL-RATE-062": h_G_FRACTIONAL_RATE,
    "O2C-G-ROUNDING-BOUNDARY-063": h_G_ROUNDING_BOUNDARY, "O2C-G-LARGE-AMOUNT-064": h_G_LARGE_AMOUNT,
    "O2C-G-DUPLICATE-ITEM-ROWS-065": h_G_DUPLICATE_ITEM_ROWS, "O2C-G-SAME-TIMESTAMP-066": h_G_SAME_TIMESTAMP,
    "O2C-G-TIMEZONE-BOUNDARY-067": h_G_TIMEZONE_BOUNDARY,
    "O2C-H-TWO-UPDATES-068": h_H_TWO_UPDATES, "O2C-H-TWO-DELIVERIES-069": h_H_TWO_DELIVERIES,
    "O2C-H-TWO-PAYMENTS-070": h_H_TWO_PAYMENTS, "O2C-H-TWO-STOCK-MUTATIONS-071": h_H_TWO_STOCK_MUTATIONS,
}


def run():
    frappe.set_user("Administrator")
    frappe.flags.in_test = False
    out = {"provenance": {}, "base": {}, "fixtures": {}, "summary": {}}
    try:
        out["provenance"] = {"frappe": frappe.__version__,
                             "erpnext": frappe.get_attr("erpnext.__version__")}
    except Exception:
        pass
    try:
        setup(out)
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
            cResult = fn()
            out["fixtures"][fid] = {"captured": True, "data": norm(cResult) if False else cResult}
            ok += 1
            print(f"FIX {fid} OK")
        except Exception as exc:  # a handler bug (unexpected) — record and continue
            import traceback
            out["fixtures"][fid] = {"captured": False, "handler_exception": {
                "type": type(exc).__name__, "msg": str(exc)[:300], "tb": traceback.format_exc()[-600:]}}
            err += 1
            print(f"FIX {fid} FAIL {type(exc).__name__}: {str(exc)[:120]}")
        finally:
            frappe.set_user("Administrator")
            try:
                frappe.db.rollback()
            except Exception:
                pass
    out["summary"] = {"total": len(HANDLERS), "captured": ok, "handler_failures": err}
    print(f"MATRIX_DONE total={len(HANDLERS)} ok={ok} fail={err}")
    print("CAPTURE_JSON_START")
    print(json.dumps(out, default=str))
    print("CAPTURE_JSON_END")
    return {"ok": err == 0, "captured": ok, "failed": err}
