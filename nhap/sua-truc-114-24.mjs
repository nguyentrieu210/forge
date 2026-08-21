/**
 * `RT_TRUC114_2.4LY` mang tên "TRỤC140 2.4LY" — mã ghi 114, tên ghi 140. Chủ xưởng chốt: LẤY THEO MÃ.
 * Đổi tên về 114, kéo quy cách từ PHI140-2.4 sang PHI114-2.4, rồi bỏ quy cách PHI140-2.4 vì
 * nó sinh ra chỉ do đọc nhầm cái tên sai và giờ không mã nào dùng.
 */
const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");
let cookie = "", csrf = "";
async function goi(d, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${d}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const c = res.headers.get("set-cookie"); if (c?.startsWith("sid=")) cookie = c.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, json: j };
}
const dn = await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
if (!dn.ok) throw new Error(JSON.stringify(dn.json));

const MA = "RT_TRUC114_2.4LY", TEN_MOI = "TRỤC 114 2.4LY";
const QC_MOI = "QC-TRUC-THEP-PHI114-2_4", QC_CU = "QC-TRUC-THEP-PHI140-2_4";

const it = await goi(`/api/resource/Item/${encodeURIComponent(MA)}`);
if (!it.ok) throw new Error(`không đọc được ${MA}`);
const d = it.json.data;
console.log(`hiện tại : ${MA}  tên "${d.item_name}"  quy cách ${d.material_specification}`);
console.log(`sẽ thành : ${MA}  tên "${TEN_MOI}"  quy cách ${QC_MOI}`);
if (!THAT) { console.log("\n(chạy thử — thêm --that để ghi)"); process.exit(0); }

if (!(await goi(`/api/resource/Material Specification/${encodeURIComponent(QC_MOI)}`)).ok) {
  const t = await goi("/api/resource/Material Specification", { method: "POST", body: {
    doctype: "Material Specification", spec_code: QC_MOI, spec_name: "Trục thép PHI114 dày 2.4 mm",
    material_grade: "THEP", spec_type: "Ống/trục", item_group: "Ray và trục", section_code: "PHI114",
    thickness_mm: 2.4, disabled: false,
    note: "Kg/m lý thuyết CHƯA có — đây là con số cho ra hệ số quy đổi Mét↔Kg của mọi mã dùng quy cách này.",
    _migration_source: "alumdoor-quy-cach-ray-truc-2026-08-20",
  } });
  console.log(t.ok ? `  ✓ tạo quy cách ${QC_MOI}` : `  ✗ tạo quy cách hỏng: ${JSON.stringify(t.json).slice(0, 300)}`);
  if (!t.ok) process.exit(1);
}

const p = await goi(`/api/resource/Item/${encodeURIComponent(MA)}`, { method: "PUT", body: { ...d, item_name: TEN_MOI, material_specification: QC_MOI } });
console.log(p.ok ? `  ✓ ${MA} → "${p.json.data.item_name}" · ${p.json.data.material_specification}` : `  ✗ ${JSON.stringify(p.json).slice(0, 300)}`);
if (!p.ok) process.exit(1);

/** Chỉ xoá khi CHẮC không còn mã nào trỏ tới — quy cách mồ côi thì vô hại, quy cách bị xoá nhầm thì gãy liên kết. */
const con = await goi(`/api/resource/Item?filters=${encodeURIComponent(JSON.stringify([["material_specification", "=", QC_CU]]))}&limit_page_length=2000&fields=${encodeURIComponent('["name"]')}`);
const dung = con.ok ? (con.json.data ?? []) : null;
if (dung === null) console.log(`  ! không kiểm được ai dùng ${QC_CU} — giữ lại cho chắc`);
else if (dung.length) console.log(`  ! ${QC_CU} còn ${dung.length} mã dùng (${dung.map((r) => r.name).join(", ")}) — giữ lại`);
else {
  const x = await goi(`/api/resource/Material Specification/${encodeURIComponent(QC_CU)}`, { method: "DELETE" });
  console.log(x.ok ? `  ✓ xoá quy cách mồ côi ${QC_CU}` : `  ✗ xoá hỏng ${x.status}: ${JSON.stringify(x.json).slice(0, 200)}`);
}
