import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "server/briefs/alumdoor.json"
GEN = ROOT / "server/scripts/build-alumdoor-v2-brief.mjs"
TEST = ROOT / "server/tests/alumdoor-v2-generator-reproducibility.test.mjs"


def snap(commit):
    raw = subprocess.check_output(
        ["git", "show", f"{commit}:server/briefs/alumdoor-v2.json"],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
    )
    return json.loads(raw)


def dt(brief, name):
    return next(x for x in brief["doctypes"] if x["name"] == name)


def field_name(field):
    return field.split(":", 1)[0].strip() if isinstance(field, str) else field.get("fieldname")


def fld(doctype, name):
    for field in doctype.get("fields", []):
        if field_name(field) == name:
            return field
    raise KeyError(f"{doctype['name']}.{name}")


def upsert_field(target, field, after=None):
    name = field_name(field)
    fields = target.setdefault("fields", [])
    fields[:] = [x for x in fields if field_name(x) != name]
    if after:
        for index, current in enumerate(fields):
            if field_name(current) == after:
                fields.insert(index + 1, field)
                return
    fields.append(field)


source = json.loads(SRC.read_text(encoding="utf-8"))
A = snap("a71725a2977ab08ae793b5b64bcf4b5da8f7c3ee")
B = snap("b07e4f4d35e8e11fa5775a99833d1f437a6dd263")
M = snap("ffecf83e53fe350d9bd82c977fe3840afb5bf3d2")
G = snap("0c56ebcf20202fecb6b68b50503ebcfb3da01f05")
C = snap("d6427f435fb300f72f790a67f640114d6453cad4")
COLOR = snap("ea6d267b05c0e912f91afacfe62376c5a6e15e4f")


def srcdt(name):
    return dt(source, name)


def replace_dt(name, value):
    source["doctypes"] = [x for x in source["doctypes"] if x["name"] != name]
    source["doctypes"].append(value)


# Whole contracts introduced in the historical commits named above.
for name in ["Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng"]:
    replace_dt(name, dt(A, name))
for name in ["Credit Note", "Credit Note Item", "Stock Return"]:
    replace_dt(name, dt(B, name))
replace_dt("Item Color Scope", dt(COLOR, "Item Color Scope"))

# Customer install-address contract; the old free-text `address` is retired.
customer = srcdt("Customer")
customer["fields"] = [x for x in customer["fields"] if field_name(x) != "address"]
anchor = "email"
for name in ["install_province", "install_ward", "install_address_line1", "shipping_note"]:
    upsert_field(customer, fld(dt(A, "Customer"), name), anchor)
    anchor = name

# Commercial source contracts.
upsert_field(srcdt("Price List"), fld(dt(A, "Price List"), "customer_group"), "price_list_name")
for name, anchor in [
    ("bank_account", "payment_method"),
    ("contact_person", "customer_group"),
    ("phone", "contact_person"),
    ("install_province", "phone"),
    ("install_ward", "install_province"),
    ("shipping_note", "install_address"),
]:
    upsert_field(srcdt("Sales Order"), fld(dt(A, "Sales Order"), name), anchor)
upsert_field(srcdt("Sales Order Item"), fld(dt(A, "Sales Order Item"), "discount_percentage"), "rate")

# Later canonical contracts that were previously only present in generated V2.
for name in ["theoretical_kg_per_m", "scrap_threshold_m"]:
    upsert_field(srcdt("Material Specification"), fld(dt(M, "Material Specification"), name))
for name in ["geometry_profile", "geometry_rules"]:
    upsert_field(srcdt("Cutting Policy"), fld(dt(G, "Cutting Policy"), name))
upsert_field(srcdt("Cut Order Item"), fld(dt(C, "Cut Order Item"), "source_batch_no"))
srcdt("Item").setdefault("permissions", {})["Chủ xưởng"] = dt(A, "Item")["permissions"]["Chủ xưởng"]

# O2C navigation/action/validator contracts.
quotation = srcdt("Quotation")
quotation["inbox"] = dt(B, "Quotation").get("inbox", False)
quotation.pop("menu", None)
srcdt("Sales Invoice").pop("menu", None)
action = next(x for x in B.get("actions", []) if x.get("name") == "don-ban-thanh-hoa-don")
source["actions"] = [x for x in source.get("actions", []) if x.get("name") != "don-ban-thanh-hoa-don"] + [action]
for action_name in ["bao-gia-thanh-don", "don-ban-thanh-phieu-xuat"]:
    for entry in source.get("actions", []):
        if entry.get("name") == action_name:
            entry.pop("menu", None)
validator = next(x for x in B.get("validators", []) if x.get("doctype") == "Stock Return")
source["validators"] = [x for x in source.get("validators", []) if x.get("doctype") != "Stock Return"] + [validator]

# Issue #941 source fixture. The scalar .03 fields are compatibility metadata only;
# ray-specific live geometry remains in the canonical geometry catalog.
policy_name = "Cửa tấm liền Úc — công thức chuẩn"
source["fixtures"] = [
    x for x in source.get("fixtures", [])
    if not (x.get("type") == "Cutting Policy" and x.get("name") == policy_name)
]
anchor = next(
    i for i, x in enumerate(source["fixtures"])
    if x.get("type") == "Cutting Policy" and x.get("name") == "Cửa Úc — công thức chuẩn"
)
source["fixtures"].insert(anchor + 1, {
    "type": "Cutting Policy",
    "name": policy_name,
    "data": {
        "policy_name": policy_name,
        "door_type": "Cửa tấm liền Úc",
        "dealer_width_basis": "Phủ bì ray",
        "retail_width_basis": "Phủ bì ray",
        "dealer_cut_deduction_m": 0.03,
        "retail_cut_deduction_m": 0.03,
        "dealer_split_sales_basis": "Phủ bì ray",
        "dealer_full_sales_basis": "Phủ bì ray",
        "retail_sales_basis": "Phủ bì ray",
        "purchase_formula": "Kg thực tế",
        "note": "Bán theo Cao PB × PB ray. Chia lá tấm liền: (Cao PB − 0,13) ÷ 0,068.",
        "leaf_height_deduction_m": 0.13,
        "leaf_rounding": "Làm tròn xuống",
        "leaf_formula": "Kiểu tấm liền Úc",
        "leaf_divisor_source": "Hằng số của chính sách",
        "leaf_divisor_const": 0.068,
    },
})

# Lossless Item Color schema-key convergence.
renamed = 0
for fixture in source.get("fixtures", []):
    if fixture.get("type") != "Item Color" or not isinstance(fixture.get("data"), dict):
        continue
    data = fixture["data"]
    if "finish" not in data:
        continue
    if "surface_finish" in data and data["surface_finish"] != data["finish"]:
        raise RuntimeError(f"conflicting finish/surface_finish for {fixture.get('name')}")
    data["surface_finish"] = data.pop("finish")
    renamed += 1
print("renamed Item Color finish keys:", renamed)
SRC.write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Generator: keep immutable source snapshot and converge historical direct-generated contracts.
s = GEN.read_text(encoding="utf-8")
old = 'const brief = JSON.parse(readFileSync(SRC, "utf8"));'
new = 'const sourceBrief = JSON.parse(readFileSync(SRC, "utf8"));\nconst brief = structuredClone(sourceBrief);'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("sourceBrief bootstrap pattern drift")
old = 'const canonicalAluminumProfile = fixture("Measurement Profile", "Nhôm cây/lá").data;'
new = 'const canonicalAluminumProfile = { ...fixture("Measurement Profile", "Nhôm cây/lá").data };'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("canonicalAluminumProfile pattern drift")

marker = "const childPresentation = applyAlumdoorChildPresentation(brief);"
if marker not in s:
    raise RuntimeError("child presentation marker missing")
block = r'''
// ── SOURCE → GENERATED REPRODUCIBILITY CONVERGENCE ──
// Historical O2C/master changes had landed directly in alumdoor-v2.json. They now live in
// alumdoor.json; this final boundary keeps later V2 transforms from dropping them again.
// Commit 46cff213 retired Sales Option / Sales Package; regenerated metadata must never
// resurrect sales_option or sales_mode.
{
  const sourceDoctype = (name) => {
    const value = sourceBrief.doctypes.find((entry) => entry.name === name);
    if (!value) throw new Error(`Nguồn thiếu doctype ${name}`);
    return value;
  };
  const replaceFromSource = (name) => {
    const index = brief.doctypes.findIndex((entry) => entry.name === name);
    const value = structuredClone(sourceDoctype(name));
    if (index >= 0) brief.doctypes[index] = value; else brief.doctypes.push(value);
  };
  const sourceField = (doctypeName, fieldname) => {
    const value = sourceDoctype(doctypeName).fields.find((entry) => nameOf(entry) === fieldname);
    if (!value) throw new Error(`Nguồn thiếu ${doctypeName}.${fieldname}`);
    return structuredClone(value);
  };
  const upsertSourceField = (doctypeName, fieldname) => {
    const target = doctype(doctypeName);
    const value = sourceField(doctypeName, fieldname);
    const index = target.fields.findIndex((entry) => nameOf(entry) === fieldname);
    if (index >= 0) target.fields[index] = value; else target.fields.push(value);
  };

  for (const name of [
    "Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng",
    "Credit Note", "Credit Note Item", "Stock Return", "Item Color Scope",
  ]) replaceFromSource(name);

  for (const fieldname of ["install_province", "install_ward", "install_address_line1", "shipping_note"])
    upsertSourceField("Customer", fieldname);
  dropFields(doctype("Customer"), ["address"]);
  upsertSourceField("Price List", "customer_group");
  for (const fieldname of ["bank_account", "contact_person", "phone", "install_province", "install_ward", "shipping_note"])
    upsertSourceField("Sales Order", fieldname);
  upsertSourceField("Sales Order Item", "discount_percentage");
  for (const fieldname of ["theoretical_kg_per_m", "scrap_threshold_m"])
    upsertSourceField("Material Specification", fieldname);
  for (const fieldname of ["geometry_profile", "geometry_rules"])
    upsertSourceField("Cutting Policy", fieldname);
  upsertSourceField("Cut Order Item", "source_batch_no");
  doctype("Item").permissions["Chủ xưởng"] = sourceDoctype("Item").permissions["Chủ xưởng"];

  const sourceAction = sourceBrief.actions.find((entry) => entry.name === "don-ban-thanh-hoa-don");
  if (!sourceAction) throw new Error("Nguồn thiếu action don-ban-thanh-hoa-don");
  brief.actions = brief.actions.filter((entry) => entry.name !== "don-ban-thanh-hoa-don");
  brief.actions.push(structuredClone(sourceAction));
  for (const actionName of ["bao-gia-thanh-don", "don-ban-thanh-phieu-xuat"]) {
    const action = brief.actions.find((entry) => entry.name === actionName);
    if (action) delete action.menu;
  }
  const sourceStockReturnValidator = sourceBrief.validators.find((entry) => entry.doctype === "Stock Return");
  if (!sourceStockReturnValidator) throw new Error("Nguồn thiếu validator Stock Return");
  brief.validators = brief.validators.filter((entry) => entry.doctype !== "Stock Return");
  brief.validators.push(structuredClone(sourceStockReturnValidator));

  const quotation = doctype("Quotation");
  quotation.inbox = false;
  delete quotation.menu;
  delete doctype("Sales Invoice").menu;

  for (const target of brief.doctypes) {
    target.fields = (target.fields ?? []).filter((entry) => !["sales_option", "sales_mode"].includes(nameOf(entry)));
    if (Array.isArray(target.search)) target.search = target.search.filter((entry) => !["sales_option", "sales_mode"].includes(entry));
  }
  const itemPrice = doctype("Item Price");
  const priceVariantIndex = itemPrice.fields.findIndex((entry) => nameOf(entry) === "price_variant");
  if (priceVariantIndex >= 0 && typeof itemPrice.fields[priceVariantIndex] === "object") {
    const value = { ...itemPrice.fields[priceVariantIndex] };
    if (String(value.fetch_from ?? "").startsWith("sales_option.")) delete value.fetch_from;
    itemPrice.fields[priceVariantIndex] = value;
  }
  const salesOrder = doctype("Sales Order");
  const installAddressIndex = salesOrder.fields.findIndex((entry) => nameOf(entry) === "install_address");
  if (installAddressIndex >= 0 && typeof salesOrder.fields[installAddressIndex] === "object") {
    const value = { ...salesOrder.fields[installAddressIndex] };
    if (value.fetch_from === "customer.address") delete value.fetch_from;
    salesOrder.fields[installAddressIndex] = value;
  }
  if (brief.doctypes.some((entry) => ["Sales Option", "Sales Package"].includes(entry.name)))
    throw new Error("Generator resurrected deprecated Sales Option/Sales Package DocType");
  note("REPRO · source-authoritative O2C/master contracts restored; deprecated sales option fields forbidden");
}

'''
if "SOURCE → GENERATED REPRODUCIBILITY CONVERGENCE" not in s:
    s = s.replace(marker, block + marker, 1)
GEN.write_text(s, encoding="utf-8")

TEST.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE = resolve(ROOT, "server/briefs/alumdoor.json");
const GENERATED = resolve(ROOT, "server/briefs/alumdoor-v2.json");
const GENERATOR = resolve(ROOT, "server/scripts/build-alumdoor-v2-brief.mjs");
const nameOf = (field) => typeof field === "string" ? field.split(":", 1)[0].trim() : field.fieldname;
const doc = (brief, name) => brief.doctypes.find((entry) => entry.name === name);
const field = (brief, doctype, fieldname) => doc(brief, doctype)?.fields?.find((entry) => nameOf(entry) === fieldname);

test("alumdoor-v2 generator is idempotent and preserves runtime contracts", () => {
  const before = readFileSync(GENERATED, "utf8");
  execFileSync(process.execPath, [GENERATOR], { cwd: ROOT, stdio: "pipe" });
  const after = readFileSync(GENERATED, "utf8");
  assert.equal(after, before, "official generator must be a zero-diff second pass");
  const generated = JSON.parse(after);
  for (const required of ["Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng", "Credit Note", "Credit Note Item"])
    assert.ok(doc(generated, required), `missing regenerated ${required}`);
  for (const required of [
    ["Customer", "install_province"], ["Customer", "install_ward"], ["Customer", "install_address_line1"],
    ["Price List", "customer_group"], ["Sales Order Item", "discount_percentage"],
    ["Sales Order", "bank_account"], ["Sales Order", "contact_person"], ["Sales Order", "phone"],
    ["Sales Order", "install_province"], ["Sales Order", "install_ward"], ["Sales Order", "shipping_note"],
    ["Cutting Policy", "geometry_profile"], ["Cutting Policy", "geometry_rules"], ["Cut Order Item", "source_batch_no"],
  ]) assert.ok(field(generated, ...required), `missing regenerated ${required.join(".")}`);
  for (const dt of generated.doctypes) {
    assert.ok(!["Sales Option", "Sales Package"].includes(dt.name), `deprecated doctype ${dt.name}`);
    for (const f of dt.fields ?? []) assert.ok(!["sales_option", "sales_mode"].includes(nameOf(f)), `deprecated ${dt.name}.${nameOf(f)}`);
  }
  const stockReturn = doc(generated, "Stock Return");
  for (const required of ["party_doctype", "party", "return_against_doctype", "return_against"])
    assert.ok(stockReturn.fields.some((entry) => nameOf(entry) === required), `Stock Return missing ${required}`);
  assert.ok(generated.actions.some((entry) => entry.name === "don-ban-thanh-hoa-don"));
  assert.ok(generated.validators.some((entry) => entry.doctype === "Stock Return"));
});

test("alumdoor source owns tấm liền Úc and canonical Item Color keys", () => {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const policy = source.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === "Cửa tấm liền Úc — công thức chuẩn");
  assert.ok(policy);
  assert.equal(policy.data.leaf_formula, "Kiểu tấm liền Úc");
  assert.equal(policy.data.leaf_divisor_const, 0.068);
  for (const color of source.fixtures.filter((entry) => entry.type === "Item Color")) {
    assert.ok(!Object.hasOwn(color.data, "finish"), `${color.name} still uses legacy finish key`);
    assert.ok(Object.hasOwn(color.data, "surface_finish"), `${color.name} missing surface_finish`);
  }
});
''', encoding="utf-8")

print("issue-942 source/generator/test patches staged")
