from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSER = ROOT / "docs/spec/tools/source_exact_parser.py"
COMMIT = "1" * 40


class SourceExactParserTest(unittest.TestCase):
    def test_full_fixture_scan(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td); source = base / "sample"; out = base / "out"
            dt = source / "sample/sample/doctype/sales_order"
            dt.mkdir(parents=True)
            (dt / "sales_order.json").write_text(json.dumps({
                "doctype": "DocType", "name": "Sales Order", "module": "Selling",
                "autoname": "naming_series:", "is_submittable": 1,
                "fields": [
                    {"fieldname": "customer", "label": "Customer", "fieldtype": "Link", "options": "Customer", "reqd": 1},
                    {"fieldname": "items", "label": "Items", "fieldtype": "Table", "options": "Sales Order Item"},
                ],
                "permissions": [{"role": "Sales User", "read": 1, "write": 1, "create": 1, "submit": 1}],
                "states": [{"title": "Draft", "color": "Red"}],
                "links": [{"link_doctype": "Delivery Note", "link_fieldname": "sales_order"}],
                "actions": [{"label": "Create Delivery Note"}],
            }), encoding="utf-8")
            (dt / "sales_order.py").write_text('''\
import frappe
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

class SalesOrder(Document):
    def validate(self):
        if not self.customer:
            frappe.throw("Customer required")

    def on_submit(self):
        frappe.db.sql("SELECT name FROM `tabSales Order` WHERE name=%s", self.name)

@frappe.whitelist()
def make_delivery_note(source_name):
    return get_mapped_doc("Sales Order", source_name, {"Sales Order": {"doctype": "Delivery Note"}})
''', encoding="utf-8")
            (dt / "sales_order.js").write_text('''\
frappe.ui.form.on("Sales Order", {
  refresh(frm) { frappe.call({ method: "sample.make_delivery_note" }); },
  customer(frm) { frm.refresh(); }
});
''', encoding="utf-8")
            report = source / "sample/sample/report/order_summary"
            report.mkdir(parents=True)
            (report / "order_summary.json").write_text(json.dumps({
                "doctype": "Report", "name": "Order Summary", "report_type": "Script Report",
                "ref_doctype": "Sales Order", "is_standard": "Yes", "roles": [{"role": "Sales User"}],
            }), encoding="utf-8")
            (report / "order_summary.py").write_text("def execute(filters=None):\n    return [], []\n", encoding="utf-8")
            hooks = source / "sample/hooks.py"; hooks.parent.mkdir(parents=True, exist_ok=True)
            hooks.write_text('''\
doc_events = {"Sales Order": {"on_submit": "sample.events.on_submit"}}
scheduler_events = {"daily": ["sample.jobs.daily"]}
''', encoding="utf-8")
            (source / "sample/patches.txt").write_text("sample.patches.v1.fix_orders\n", encoding="utf-8")
            workspace = source / "sample/sample/workspace/selling"
            workspace.mkdir(parents=True)
            (workspace / "selling.json").write_text(json.dumps({
                "doctype": "Workspace", "name": "Selling", "module": "Selling",
                "links": [{"label": "Sales Order", "link_to": "Sales Order", "link_type": "DocType"}],
            }), encoding="utf-8")
            workflow = source / "sample/sample/workflow/sales_order_approval"
            workflow.mkdir(parents=True)
            (workflow / "sales_order_approval.json").write_text(json.dumps({
                "doctype": "Workflow", "name": "Sales Order Approval", "document_type": "Sales Order",
                "states": [{"state": "Draft", "doc_status": "0", "allow_edit": "Sales User"}],
                "transitions": [{"state": "Draft", "action": "Approve", "next_state": "Approved", "allowed": "Sales Manager"}],
            }), encoding="utf-8")
            notification = source / "sample/sample/notification/order_submitted"
            notification.mkdir(parents=True)
            (notification / "order_submitted.json").write_text(json.dumps({
                "doctype": "Notification", "name": "Order Submitted", "document_type": "Sales Order",
                "event": "Submit", "condition": "doc.grand_total > 0",
            }), encoding="utf-8")
            template = source / "sample/templates/print_formats"
            template.mkdir(parents=True)
            (template / "sales_order.html").write_text("<h1>{{ doc.name }}</h1>", encoding="utf-8")
            translations = source / "sample/translations"
            translations.mkdir(parents=True)
            (translations / "vi.csv").write_text('"Sales Order","Đơn bán hàng"\n', encoding="utf-8")
            (source / "sample/schema.sql").write_text("CREATE TABLE sample(id INTEGER);\n", encoding="utf-8")
            command = [sys.executable, str(PARSER), "--app", "sample", "--root", str(source),
                       "--commit", COMMIT, "--tag", "v1.0.0", "--license", "MIT", "--out", str(out)]
            result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            summary = json.loads((out / "summary.json").read_text())
            self.assertEqual(summary["counts"]["doctypes"], 1)
            self.assertEqual(summary["counts"]["reports"], 1)
            self.assertEqual(summary["counts"]["parse_errors"], 0)
            self.assertEqual(summary["coverage"]["source_inventory"]["coverage_percent"], 100.0)
            self.assertEqual(summary["coverage"]["static_extraction"]["coverage_percent"], 100.0)
            manifest = json.loads((out / "manifest.json").read_text())["artifacts"]
            kinds = {item["kind"] for item in manifest}
            self.assertTrue({"workspace", "workflow", "notification", "template", "translation", "sql"}.issubset(kinds))
            doctypes = json.loads((out / "doctype-index.json").read_text())["doctypes"]
            self.assertEqual(doctypes[0]["name"], "Sales Order")
            self.assertEqual({x["to"] for x in doctypes[0]["dependencies"]}, {"Customer", "Sales Order Item"})
            python_modules = json.loads((out / "python-index.json").read_text())["modules"]
            controller = next(x for x in python_modules if x["kind"] == "doctype_controller")
            self.assertEqual([x["name"] for x in controller["python"]["lifecycle_methods"]], ["validate", "on_submit"])
            self.assertEqual(controller["python"]["whitelisted_methods"][0]["name"], "make_delivery_note")
            self.assertEqual(controller["python"]["throws"][0]["message"], "Customer required")
            self.assertIn("SELECT name", controller["python"]["sql"][0]["excerpt"])
            deps = json.loads((out / "dependency-graph.json").read_text())["edges"]
            self.assertTrue(any(x["type"] == "hook" and x["to"] == "sample.events.on_submit" for x in deps))
            self.assertTrue(any(x["type"] == "client_rpc" and x["to"] == "sample.make_delivery_note" for x in deps))
            dossier = out / "docs/doctypes/selling/sales-order.md"
            self.assertTrue(dossier.is_file())
            self.assertIn("Customer required", dossier.read_text())


if __name__ == "__main__":
    unittest.main()
