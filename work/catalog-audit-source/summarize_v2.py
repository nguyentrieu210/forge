from __future__ import annotations

import csv
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(r"C:\alumdoor")
DATA = ROOT / "nhap" / "du-lieu"
WORK = ROOT / "work" / "catalog-audit-source"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def records(filename: str):
    obj = load(DATA / filename)
    if isinstance(obj, list):
        return obj
    return obj.get("ban_ghi", obj.get("records", []))


def payload(row):
    return row.get("payload", row)


def norm(value):
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^A-Z0-9]+", "", value.upper())


def main():
    d1 = load(WORK / "d1_relevant.json")
    docs = d1["relevant_doctypes"]
    print("D1 doctypes", {k: len(v) for k, v in docs.items()})
    print("child counts", d1["child_counts"])

    db_path = Path(d1["database"])
    con = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    def d1rows(dt):
        out=[]
        for r in con.execute("select name,payload_json,docstatus,status from documents where tenant_id='demo' and doctype=? order by name",(dt,)):
            out.append({"name":r["name"],"payload":json.loads(r["payload_json"]),"docstatus":r["docstatus"],"status":r["status"]})
        return out
    for dt in ["Pricing Rule","Pricing Scope","Material Grade","Material Specification","Measurement Profile","Cutting Policy","Bậc diện tích","Geometry Field","Geometry Profile","Batch","Serial No","Stock Ledger Entry","Stock Balance","Aluminium Lot","Aluminium Cut","Supplier Item","BOM Rule","BOM Template","Paint Job"]:
        if dt not in docs:
            docs[dt]=d1rows(dt)

    for dt in ["Item", "Item Price", "Pricing Rule", "Bill of Materials", "Stock Entry", "Customer", "Supplier", "UOM", "Material Grade", "Material Specification"]:
        rows = docs.get(dt, [])
        print(f"\n## {dt} count={len(rows)}")
        if rows:
            print("keys", sorted(rows[0]["payload"].keys()))
            print("sample", json.dumps(rows[0]["payload"], ensure_ascii=False)[:1200])

    items = [x["payload"] for x in docs.get("Item", [])]
    print("\nITEM disabled", Counter(str(x.get("disabled")) for x in items))
    print("ITEM groups", Counter(x.get("item_group") for x in items))
    print("ITEM stock_uom", Counter(x.get("stock_uom") for x in items))
    print("ITEM purchase_uom", Counter(x.get("default_purchase_uom") for x in items))
    print("ITEM sales_uom", Counter(x.get("default_sales_uom") for x in items))
    print("ITEM conversions nonempty", sum(bool(x.get("uom_conversions")) for x in items))
    print("ITEM material spec",sum(bool(x.get("material_specification")) for x in items),Counter(x.get("material_specification") for x in items if x.get("material_specification")))
    print("ITEM conversion values", Counter(str(x.get("uom_conversions")) for x in items if x.get("uom_conversions")))

    prices = [x["payload"] for x in docs.get("Item Price", [])]
    print("\nPRICE variants", Counter(x.get("price_variant") for x in prices))
    print("PRICE uom", Counter(x.get("uom") for x in prices))
    print("PRICE nonpositive", [(x.get("item_code"), x.get("rate"), x.get("price_variant")) for x in prices if float(x.get("rate") or 0) <= 0][:50], "count", sum(float(x.get("rate") or 0) <= 0 for x in prices))
    print("PRICE unique keys", len({(x.get("item_code"),x.get("price_list"),x.get("uom"),x.get("price_variant"),x.get("area_tier")) for x in prices}))

    rules = [x["payload"] for x in docs.get("Pricing Rule", [])]
    print("\nRULE effects", Counter((x.get("effect_type"), x.get("adjustment_basis")) for x in rules))
    print("RULE disabled", Counter(str(x.get("disabled")) for x in rules))
    print("RULE exclusive", Counter(x.get("exclusive_group") for x in rules))
    print("RULE negative", sum(float(x.get("adjustment_rate") or 0)<0 for x in rules))
    print("RULE sign/disabled",Counter(("neg" if float(x.get("adjustment_rate") or 0)<0 else "nonneg",str(x.get("disabled"))) for x in rules))
    for x in rules:
        s=json.dumps(x, ensure_ascii=False).casefold()
        if "tặng ray" in s or "tang_ray" in s or "ray tặng" in s:
            print("GIFT RULE", json.dumps(x, ensure_ascii=False))

    print("\nMASTER/CAPABILITY COUNTS", {dt:len(docs.get(dt,[])) for dt in ["Pricing Rule","Pricing Scope","Material Grade","Material Specification","Measurement Profile","Cutting Policy","Bậc diện tích","Geometry Field","Geometry Profile","Batch","Serial No","Stock Ledger Entry","Stock Balance","Aluminium Lot","Aluminium Cut","Supplier Item","BOM Rule","BOM Template","Paint Job"]})

    boms = [x["payload"] for x in docs.get("Bill of Materials", [])]
    print("\nBOM status", Counter((x.get("bom_status"), str(x.get("is_active"))) for x in boms))
    print("BOM migration", Counter(x.get("_migration_source") for x in boms))
    print("BOM components", sum(len(x.get("items") or []) for x in boms), Counter(y.get("qty_basis") for x in boms for y in (x.get("items") or [])))
    print("BOM names/items", [(x.get("item"),len(x.get("items") or []),x.get("bom_status"),x.get("_migration_source")) for x in boms])

    conv=[(x.get("item_code"),c) for x in items for c in (x.get("uom_conversions") or [])]
    print("\nCONVERSION rows",len(conv),"positive",sum(float(c.get("conversion_factor") or 0)>0 for _,c in conv),"zero",sum(float(c.get("conversion_factor") or 0)==0 for _,c in conv),"items",len({i for i,_ in conv}),"positive_items",len({i for i,c in conv if float(c.get("conversion_factor") or 0)>0}))
    print("CONVERSION suspicious zero",[(i,c.get("uom"),c.get("note")) for i,c in conv if float(c.get("conversion_factor") or 0)==0 and any(t in str(c.get("note") or "").casefold() for t in ["hệ số thật","xưởng chốt","kg/con","kg/m"])])

    se = [x["payload"] for x in docs.get("Stock Entry", [])]
    print("\nSTOCK entries", [(x.get("stock_entry_type"),x.get("posting_date"),x.get("reference_no"),len(x.get("items") or []),x.get("remarks")) for x in se])

    artifact_names = ["06-hang-hoa.truoc-gop.json","06-hang-hoa.json","01-nhom-hang.json","02-dvt.json","03-be-mat.json","04-mau-sac.json","05-quy-cach-do.json","07-bac-dien-tich.json","08-don-gia.json","09-mac-vat-lieu.json","09-quy-cach-vat-tu.json","10-vat-tu-tay.json","11-hang-thuong.json","12-ray-truc.json","13-gan-quy-cach.json","13-mac-ray-truc.json","13-quy-cach-ray-truc.json","14-nan-la-cua.json","15-gan-quy-cach-nhom.json","15-quy-cach-nhom.json","16-truong-do.json","17-bo-hinh-hoc.json","18-chinh-sach-cat.json","20-cua.json","21-gia-ban.json","22-gia-bac.json","23-gia-anh.json","24-phu-thu.json","25-khach-hang.json","25-nha-cung-cap.json","26-chinh-sach-gia.json","26-pham-vi-gia.json","27-danh-muc-moi.json","29-dinh-muc-bom.json"]
    print("\nARTIFACT COUNTS")
    for name in artifact_names:
        p=DATA/name
        if p.exists():
            obj=load(p)
            rs=records(name)
            print(name, "records", len(rs), "declared", obj.get("so_ban_ghi") if isinstance(obj,dict) else None)

    # Compare artifact customers/suppliers by normalized display names to D1, not by code alone.
    for name,dt,fields in [("25-khach-hang.json","Customer",("customer_name","name")),("25-nha-cung-cap.json","Supplier",("supplier_name","name"))]:
        art=[payload(x) for x in records(name)]
        cur=[x["payload"] for x in docs.get(dt,[])]
        def label(x):
            return next((x.get(f) for f in fields if x.get(f)), "")
        aset=defaultdict(list); cset=defaultdict(list)
        for x in art: aset[norm(label(x))].append(label(x))
        for x in cur: cset[norm(label(x))].append(label(x))
        print(f"\nCOMPARE {name}->{dt}", "artifact",len(art),"d1",len(cur),"missing_norm",[(k,v) for k,v in aset.items() if k not in cset],"extra_norm",[(k,v) for k,v in cset.items() if k not in aset])
        print("ART DUP NORM",[(k,v) for k,v in aset.items() if len(v)>1])

    # Exact name coverage for stable artifact doctypes.
    stable=[
      ("01-nhom-hang.json","Item Group"),("02-dvt.json","UOM"),("03-be-mat.json","Surface Finish"),
      ("04-mau-sac.json","Item Color"),("05-quy-cach-do.json","Measurement Profile"),("07-bac-dien-tich.json","Bậc diện tích"),
      ("09-mac-vat-lieu.json","Material Grade"),("09-quy-cach-vat-tu.json","Material Specification"),
      ("13-mac-ray-truc.json","Material Grade"),("13-quy-cach-ray-truc.json","Material Specification"),
      ("15-quy-cach-nhom.json","Material Specification"),("16-truong-do.json","Geometry Field"),
      ("17-bo-hinh-hoc.json","Geometry Profile"),("18-chinh-sach-cat.json","Cutting Policy"),
    ]
    print("\nSTABLE COVER")
    grouped=defaultdict(set)
    for f,dt in stable:
        grouped[dt].update(str(x.get("name")) for x in records(f))
    for dt,aset in grouped.items():
        cset={str(x.get("name")) for x in docs.get(dt,[])}
        print(dt,"artifact union",len(aset),"d1",len(cset),"missing",sorted(aset-cset),"extra",sorted(cset-aset))

    # Price/BOM artifacts are sequential upserts; compare union by document name.
    for files,dt in [(["08-don-gia.json","21-gia-ban.json","22-gia-bac.json","23-gia-anh.json","24-phu-thu.json"],"Item Price"),(["26-chinh-sach-gia.json"],"Pricing Rule"),(["26-pham-vi-gia.json"],"Pricing Scope"),(["29-dinh-muc-bom.json"],"Bill of Materials")]:
        aset=set()
        counts={}
        for f in files:
            vals={str(x.get("name")) for x in records(f)}
            aset.update(vals); counts[f]=len(vals)
        cset={str(x.get("name")) for x in docs.get(dt,[])}
        print("\nSEQUENTIAL COVER",dt,"parts",counts,"union",len(aset),"d1",len(cset),"missing",len(aset-cset),sorted(aset-cset)[:30],"extra",len(cset-aset),sorted(cset-aset)[:30])

    snap=load(DATA/"28-hien-trang.json")
    snap_codes={str(x.get("item_code") or x.get("name")) for x in snap.get("item",[])}
    cur_codes={str(x.get("item_code")) for x in items}
    print("\nSNAPSHOT28 item",len(snap_codes),"d1",len(cur_codes),"missing now",sorted(snap_codes-cur_codes),"added since",sorted(cur_codes-snap_codes))

    # Compare source canonical item names to D1 by strong signature, to avoid exact-code false negatives.
    artitems=[payload(x) for x in records("06-hang-hoa.json")]
    d1sig=defaultdict(list)
    for x in items:
        d1sig[(norm(x.get("item_name")), norm(x.get("item_group")), norm(x.get("stock_uom")))].append(x.get("item_code"))
    matched=[]; unmatched=[]; ambiguous=[]
    for x in artitems:
        sig=(norm(x.get("item_name")), norm(x.get("item_group")), norm(x.get("stock_uom")))
        cand=d1sig.get(sig,[])
        if len(cand)==1: matched.append((x.get("item_code"),cand[0]))
        elif len(cand)>1: ambiguous.append((x.get("item_code"),cand))
        else: unmatched.append((x.get("item_code"),x.get("item_name"),x.get("item_group"),x.get("stock_uom")))
    print("\nITEM strong signature", "matched",len(matched),"ambiguous",len(ambiguous),"unmatched",len(unmatched))
    print("ITEM unmatched",unmatched)
    print("ITEM ambiguous",ambiguous)

    cat=records("27-danh-muc-moi.json")
    inames=defaultdict(list)
    for x in items: inames[norm(x.get("item_name"))].append(x.get("item_code"))
    cat_unique=defaultdict(list)
    for x in cat: cat_unique[norm(x.get("TÊN SP"))].append(x.get("Mã SP"))
    print("\nCATALOG27 names","rows",len(cat),"unique",len(cat_unique),"matched_unique",sum(k in inames for k in cat_unique),"unmatched_unique",[(k,v) for k,v in cat_unique.items() if k not in inames])

    # Retired lineage accounting.
    dec=load(ROOT/"docs"/"alumdoor-catalog-decisions.json")
    print("\nDECISIONS retired",len(dec.get("retired_items",[])),"overrides",len(dec.get("field_overrides",[])))
    print("retired",[(x["item_code"],x["kept"]) for x in dec.get("retired_items",[])])

    # CSV verification.
    for name in ["DM-BOM.csv","29-dong-bi-bo-qua.csv","29-anh-xa-vat-tu.csv","29-lech-ban-la-va-gia.csv"]:
        with (DATA/name).open(encoding="utf-8-sig",newline="") as f:
            rows=list(csv.DictReader(f))
        print("\nCSV",name,len(rows))
        if name=="29-dong-bi-bo-qua.csv": print(Counter(x["ly_do"].split(" — ")[0] for x in rows))
        if name=="29-anh-xa-vat-tu.csv": print(Counter(x["trang_thai"] for x in rows))
        if name=="29-lech-ban-la-va-gia.csv":
            print(Counter((x["loai"],x["ket_luan"]) for x in rows))
            imap={x.get("item_code"):x for x in items}
            pmap=defaultdict(list)
            for p in prices:pmap[p.get("item_code")].append((p.get("price_variant"),p.get("area_tier"),p.get("rate"),p.get("uom")))
            print("PRICE EMPTY CLASSIFY")
            for x in rows:
                if x["ket_luan"]=="D1 trống":
                    i=imap.get(x["item_code"])
                    print(x["item_code"],x["ten"],"exists",bool(i),"disabled",i.get("disabled") if i else None,"sales",i.get("is_sales_item") if i else None,"prices",pmap.get(x["item_code"],[]))
            print("PRICE TENTATIVE",[(p.get("item_code"),p.get("rate"),imap.get(p.get("item_code"),{}).get("disabled"),imap.get(p.get("item_code"),{}).get("is_sales_item")) for p in prices if p.get("price_variant")=="TAM_CHUA_CHOT"])
    con.close()


if __name__ == "__main__":
    main()
