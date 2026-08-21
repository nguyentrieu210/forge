/**
 * ĐIỀN `Kg/m lý thuyết` cho quy cách ray–trục, lấy từ cột "Định mức" của sheet ĐM.
 *
 * Sheet ĐM khai `ĐVT = KG/M` cho 34 mặt hàng, và con số ở cột Định mức chính là kg trên MÉT DÀI.
 * Ba bằng chứng độc lập xác nhận cách đọc này:
 *   · `RAY HỘP TD U100` = 1,419 trùng khít với bảng `data/trong-luong-nhom.json`
 *   · sổ tồn nhôm khai thẳng `ĐVT = KG/M` cho từng mã
 *   · lấy kg/m chia bản lá ra 7,7–7,8 kg/m2 cửa, đúng tầm cửa cuốn thật
 *
 * CHỦ XƯỞNG CHỐT: "cứ điền hết, sửa sau". Nên script điền cả những số còn nghi, nhưng ghi rõ
 * nghi ngờ vào ô Ghi chú của từng quy cách — số vào hệ thống được, còn dấu hỏi thì không mất.
 *
 * CHẠY:  node nhap/dien-kg-tren-met.mjs [--that]
 */
const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

let cookie = "", csrf = "";
async function goi(d, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${d}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const c = res.headers.get("set-cookie"); if (c?.startsWith("sid=")) cookie = c.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, json: j };
}

/**
 * Quy cách → kg/m, kèm nguồn và nghi ngờ.
 *
 * `nghi` khác undefined nghĩa là con số vẫn vào hệ thống nhưng có dấu hỏi — nó được ghi thẳng
 * vào ô Ghi chú để người đọc sau không tưởng số đã được kiểm.
 */
const BANG = [
  ["QC-TRUC-THEP-PHI34", 1.7, "ĐM: TRỤC 34"],
  ["QC-TRUC-THEP-PHI114-1_8", 4.4, "ĐM: TP-TRỤC 114_1.8LY",
    "cùng tên còn một dòng ghi 1,7 — trùng đúng số của TRỤC 34, nhiều khả năng chép nhầm ô"],
  ["QC-TRUC-THEP-PHI114-2_1", 4.7, "ĐM: TP-TRỤC 114_2.1LY"],
  ["QC-TRUC-THEP-PHI114-2_4", 12.8, "ĐM: dòng NVL-TRUC114_2.4LY (tên ghi TRỤC140_2.4LY)",
    "12,8 cao bất thường: ống phi 114 dày 2,4 mm tính theo thép đặc ra khoảng 6,7 kg/m"],
  ["QC-TRUC-THEP-PHI168-5", 15.6, "ĐM: NVL-TRUC168_5LY",
    "tính theo thép ra khoảng 20,7 kg/m — số này thấp hơn, cần đối chiếu lô nhập"],
  ["QC-RAY-THEP-U70", 1.78, "ĐM: RAY SẮT U70 có ron và không ron, cùng 1,78"],
  ["QC-RAY-THEP-U100-1_2", 2.55, "ĐM: RAY SẮT 10P_1.2ly (10 phân = U100)"],
  ["QC-RAY-THEP-U100-1_4", 2.55, "ĐM: RAY SẮT 10P_1.4ly",
    "ĐM cho 1.2ly và 1.4ly CÙNG 2,55 — dày khác nhau mà nặng bằng nhau là đáng ngờ"],
  ["QC-RAY-THEP-U100", 1.419, "ĐM: TP RAY HỘP TD U100 — trùng khít bảng trọng lượng"],
  ["QC-RAY-THEP-U76", 1.083, "ĐM: TP-RHM8 (ray HỘP). Bảng trọng lượng ghi 1,119, lệch 3%"],
  ["QC-RAY-THEP-U76-DON", 0.6, "ĐM: TP RAY ĐƠN TD. Bảng trọng lượng ghi 0,635, lệch 5,5%"],
  ["QC-RON-INOX-DAY", 0.124, "ĐM: Ron inox đáy ray"],
  ["QC-RON-NHUA-DAY", 0.263, "ĐM: NVL-RNHUA-DR",
    "ĐM có hai giá trị cho cùng tên: 0,263 và 0,101. Lấy 0,263 vì nó đi với mã NVL-"],
  ["QC-RON-NHUA-CANH", 0.135, "ĐM: RONNHUAVANGCANHAY_RSU70",
    "bản cho ray U100 nặng hơn (0,1425) — nếu ron cạnh ray phân theo khẩu độ thì phải tách hai quy cách"],
];

const dn = await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
if (!dn.ok) throw new Error(`Đăng nhập hỏng: ${JSON.stringify(dn.json)}`);
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · ${BANG.length} quy cách\n`);

let ok = 0, hong = 0;
for (const [ma, kg, nguon, nghi] of BANG) {
  const g = await goi(`/api/resource/Material Specification/${encodeURIComponent(ma)}`);
  if (!g.ok) { console.log(`  ✗ ${ma.padEnd(26)} không đọc được (${g.status})`); hong += 1; continue; }
  const d = g.json.data;
  const ghi = [`Kg/m = ${kg}. Nguồn: ${nguon}.`, nghi ? `NGHI NGỜ: ${nghi}.` : "", d.note ?? ""].filter(Boolean).join(" ");
  if (!THAT) { console.log(`  → ${ma.padEnd(26)}${String(kg).padStart(7)} kg/m   ${nghi ? "⚠ " + nghi.slice(0, 60) : nguon}`); ok += 1; continue; }
  const p = await goi(`/api/resource/Material Specification/${encodeURIComponent(ma)}`, {
    method: "PUT", body: { ...d, theoretical_kg_per_m: kg, note: ghi },
  });
  if (!p.ok) { console.log(`  ✗ ${ma.padEnd(26)}${p.status} ${p.json?.message ?? ""}`); hong += 1; continue; }
  console.log(`  ✓ ${ma.padEnd(26)}${String(p.json.data.theoretical_kg_per_m).padStart(7)} kg/m${nghi ? "   ⚠ có ghi chú nghi ngờ" : ""}`);
  ok += 1;
}
console.log(`\nđiền ${ok} · hỏng ${hong}`);
