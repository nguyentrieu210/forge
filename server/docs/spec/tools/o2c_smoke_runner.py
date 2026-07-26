"""Gate 2E S5 smoke — seed a synthetic company and run the real ERPNext
SO -> DN -> SI -> PE chain via ERPNext's own mapping functions, capturing the
document/ledger/report state. Run inside the pinned oracle bench:

  docker exec oracle-backend /home/frappe/frappe-bench/env/bin/python /tmp/smoke.py

Emits one JSON blob between CAPTURE_JSON_START/END on stdout. Synthetic data only.
"""
import json
import frappe

SITE = "oracle.localhost"
COMPANY = "_OracleCo"
ABBR = "_OC"
CUST = "_OC-CUST"
ITEM = "_OC-ITEM"
WH = f"Stores - {ABBR}"
DEBTORS = f"Debtors - {ABBR}"
SALES = f"Sales - {ABBR}"
CASH = f"Cash - {ABBR}"
PDATE = "2027-01-04"
CC = None   # company default cost center, resolved in setup()
SPL = None  # selling price list, resolved in setup()
ACC = {}    # resolved accounts (cogs / income / debtors), set in setup()

_STRIP = {"name", "creation", "modified", "modified_by", "owner", "idx", "docstatus_str",
          "amended_from", "_user_tags", "_comments", "_assign", "_liked_by", "lft", "rgt"}


def norm(v):
    if isinstance(v, dict):
        return {k: norm(x) for k, x in sorted(v.items()) if k not in _STRIP}
    if isinstance(v, (list, tuple)):
        return [norm(x) for x in v]
    return v


def gset(doc):
    frappe.get_doc(doc).insert(ignore_permissions=True, ignore_if_duplicate=True)


def setup(out):
    # A bare `install-app erpnext` skips the setup wizard, so the default masters
    # (customer/territory/item groups, warehouse types, UOMs...) are missing. Run
    # the wizard's own fixture installer — the source-exact way to seed defaults.
    from erpnext.setup.setup_wizard.operations import install_fixtures
    if not frappe.db.exists("Customer Group", "All Customer Groups"):
        install_fixtures.install("United States")
        frappe.db.commit()
    if not frappe.db.exists("Warehouse Type", "Transit"):
        frappe.get_doc({"doctype": "Warehouse Type", "__newname": "Transit"}).insert(ignore_permissions=True)
    # A FY covering "today" for internal nowdate() validations; install_company
    # creates the 2027 FY used by the transactions themselves.
    from frappe.utils import nowdate
    cur_year = nowdate()[:4]
    if cur_year != "2027" and not frappe.db.exists("Fiscal Year", f"_OC-{cur_year}"):
        frappe.get_doc({"doctype": "Fiscal Year", "year": f"_OC-{cur_year}",
                        "year_start_date": f"{cur_year}-01-01", "year_end_date": f"{cur_year}-12-31"}).insert(ignore_permissions=True)
    # Company + full CoA + cost centers + warehouses + defaults via the wizard's own
    # installer (Standard chart, perpetual inventory) — the source-exact setup path.
    if not frappe.db.exists("Company", COMPANY):
        args = frappe._dict({"company_name": COMPANY, "company_abbr": ABBR, "currency": "USD",
                             "country": "United States", "chart_of_accounts": "Standard",
                             "fy_start_date": "2027-01-01", "fy_end_date": "2027-12-31",
                             "domain": "Distribution", "bank_account": "Cash"})
        install_fixtures.install_company(args)
        install_fixtures.install_defaults(args)
        frappe.db.commit()
    # cash account for payment (create under a bank parent if absent)
    if not frappe.db.exists("Account", CASH):
        parent = frappe.db.get_value("Account", {"company": COMPANY, "account_type": "Bank", "is_group": 1}, "name") \
            or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Asset", "is_group": 1}, "name")
        frappe.get_doc({"doctype": "Account", "account_name": "Cash", "company": COMPANY,
                        "parent_account": parent, "account_type": "Cash", "is_group": 0}).insert(ignore_permissions=True)
    if not frappe.db.exists("Customer", CUST):
        frappe.get_doc({"doctype": "Customer", "customer_name": CUST,
                        "customer_group": "Commercial", "territory": "Rest Of The World"}).insert(ignore_permissions=True)
    if not frappe.db.exists("Item", ITEM):
        frappe.get_doc({"doctype": "Item", "item_code": ITEM, "item_name": ITEM,
                        "item_group": "Products", "stock_uom": "Nos", "is_stock_item": 1}).insert(ignore_permissions=True)
    # opening stock via Material Receipt so delivery has stock; needs a stock
    # adjustment (difference) account for the balancing entry.
    global CC, SPL, ACC
    ACC = {
        "cogs": frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Cost of Goods Sold", "is_group": 0}, "name")
        or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Expense", "is_group": 0}, "name"),
        "income": frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Sales", "is_group": 0}, "name")
        or frappe.db.get_value("Account", {"company": COMPANY, "root_type": "Income", "is_group": 0}, "name"),
        "debtors": frappe.db.get_value("Account", {"company": COMPANY, "account_type": "Receivable", "is_group": 0}, "name"),
    }
    SPL = frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name")
    if not SPL:
        SPL = frappe.get_doc({"doctype": "Price List", "price_list_name": "_OC Selling", "selling": 1,
                              "buying": 0, "currency": "USD", "enabled": 1}).insert(ignore_permissions=True).name
    saa = frappe.db.get_value("Account", {"company": COMPANY, "account_name": "Stock Adjustment", "is_group": 0}, "name") \
        or frappe.db.get_value("Account", {"company": COMPANY, "account_type": "Stock Adjustment", "is_group": 0}, "name")
    CC = frappe.db.get_value("Company", COMPANY, "cost_center") \
        or frappe.db.get_value("Cost Center", {"company": COMPANY, "is_group": 0}, "name")
    if not CC:
        root_name = f"{COMPANY} - {ABBR}"
        if not frappe.db.exists("Cost Center", root_name):
            rc = frappe.get_doc({"doctype": "Cost Center", "cost_center_name": COMPANY, "company": COMPANY, "is_group": 1})
            rc.flags.ignore_mandatory = True  # the tree root legitimately has no parent
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
    frappe.db.commit()
    out["diag"] = {"CC": CC, "saa": saa,
                   "cost_centers": frappe.get_all("Cost Center", filters={"company": COMPANY}, fields=["name", "is_group"], ignore_permissions=True)}
    se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": COMPANY,
                         "posting_date": PDATE, "posting_time": "09:00:00",
                         "items": [{"item_code": ITEM, "qty": 100, "t_warehouse": WH, "basic_rate": 100,
                                    "expense_account": saa, "cost_center": CC}]})
    se.insert(ignore_permissions=True)
    se.submit()
    frappe.db.commit()
    out["setup"] = {"opening_stock_entry": se.name}


def capture(doctype, name):
    doc = frappe.get_doc(doctype, name)
    gl = frappe.get_all("GL Entry", filters={"voucher_type": doctype, "voucher_no": name, "is_cancelled": 0},
                        fields=["account", "party_type", "party", "debit", "credit", "against_voucher_type", "against_voucher"],
                        order_by="account", ignore_permissions=True)
    sle = frappe.get_all("Stock Ledger Entry", filters={"voucher_type": doctype, "voucher_no": name, "is_cancelled": 0},
                         fields=["item_code", "warehouse", "actual_qty", "qty_after_transaction", "valuation_rate", "stock_value_difference"],
                         order_by="item_code", ignore_permissions=True)
    ple = frappe.get_all("Payment Ledger Entry", filters={"voucher_type": doctype, "voucher_no": name, "delinked": 0},
                         fields=["account_type", "party_type", "party", "account", "amount", "against_voucher_type", "against_voucher_no"],
                         order_by="account", ignore_permissions=True) if frappe.db.exists("DocType", "Payment Ledger Entry") else []
    return {
        "doctype": doctype, "docstatus": doc.docstatus, "status": getattr(doc, "status", None),
        "per_delivered": getattr(doc, "per_delivered", None), "per_billed": getattr(doc, "per_billed", None),
        "outstanding_amount": getattr(doc, "outstanding_amount", None),
        "grand_total": getattr(doc, "grand_total", None),
        "gl_entries": norm(gl), "stock_ledger_entries": norm(sle), "payment_ledger_entries": norm(ple),
    }


def report(name, filters):
    from frappe.desk.query_report import run
    r = run(name, filters=filters, ignore_prepared_report=True)
    return {"columns": [c.get("label") if isinstance(c, dict) else c for c in (r.get("columns") or [])],
            "row_count": len(r.get("result") or []), "rows": norm(r.get("result") or [])[:20]}


def run():
    # Invoked via: bench --site oracle.localhost execute frappe.smoke_o2c.run
    # (bench provides the site context, logging and commit.)
    frappe.set_user("Administrator")
    out = {"provenance": {}, "steps": [], "captures": {}, "reports": {}, "errors": []}
    try:
        out["provenance"] = {"frappe": frappe.__version__,
                             "erpnext": frappe.get_attr("erpnext.__version__") if frappe.db.exists("Module Def", "Accounts") else None}
    except Exception:
        pass
    try:
        setup(out)

        from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note, make_sales_invoice
        from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

        so = frappe.get_doc({"doctype": "Sales Order", "customer": CUST, "company": COMPANY, "currency": "USD",
                             "selling_price_list": SPL, "price_list_currency": "USD", "plc_conversion_rate": 1,
                             "transaction_date": PDATE, "delivery_date": PDATE,
                             "items": [{"item_code": ITEM, "qty": 5, "rate": 100, "warehouse": WH,
                                        "delivery_date": PDATE, "cost_center": CC}]})
        so.insert(ignore_permissions=True)
        so.submit()
        out["steps"].append(f"SO submitted {so.name} v{so.docstatus}")

        dn = make_delivery_note(so.name)
        for it in dn.items:
            it.expense_account = ACC["cogs"]
            it.cost_center = CC
        dn.insert(ignore_permissions=True)
        dn.submit()
        out["steps"].append(f"DN submitted {dn.name}")

        si = make_sales_invoice(so.name)
        if ACC["debtors"]:
            si.debit_to = ACC["debtors"]
        for it in si.items:
            it.income_account = ACC["income"]
            it.cost_center = CC
        si.insert(ignore_permissions=True)
        si.submit()
        out["steps"].append(f"SI submitted {si.name}")

        pe = get_payment_entry("Sales Invoice", si.name)
        pe.paid_to = CASH
        pe.reference_no = "_OC-PE-1"
        pe.reference_date = PDATE
        pe.insert(ignore_permissions=True)
        pe.submit()
        out["steps"].append(f"PE submitted {pe.name}")
        frappe.db.commit()

        # reload for post-chain projections
        so.reload()
        si.reload()
        out["captures"]["sales_order"] = capture("Sales Order", so.name)
        out["captures"]["delivery_note"] = capture("Delivery Note", dn.name)
        out["captures"]["sales_invoice"] = capture("Sales Invoice", si.name)
        out["captures"]["payment_entry"] = capture("Payment Entry", pe.name)
        out["reports"]["accounts_receivable_after_payment"] = report(
            "Accounts Receivable", {"company": COMPANY, "report_date": PDATE})
        out["reports"]["stock_balance_after_delivery"] = report(
            "Stock Balance", {"company": COMPANY, "from_date": PDATE, "to_date": PDATE})
    except Exception as exc:
        import traceback
        out["errors"].append({"type": type(exc).__name__, "msg": str(exc)[:400],
                              "tb": traceback.format_exc()[-800:]})
    finally:
        print("CAPTURE_JSON_START")
        print(json.dumps(out, default=str))
        print("CAPTURE_JSON_END")
    return {"ok": not out["errors"], "steps": len(out["steps"])}
