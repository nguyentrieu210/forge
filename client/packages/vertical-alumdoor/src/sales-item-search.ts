/**
 * TÌM MẶT HÀNG — XẾP HẠNG TẠI CHỖ.
 *
 * Trước đây chỗ này sinh ~18 biến thể từ khoá rồi bắn 18 truy vấn song song lên server và GỘP
 * HỢP kết quả. Ba cái dở:
 *  · 18 vòng mạng cho mỗi lần gõ;
 *  · biến thể suy đoán (chữ cái đầu, viết liền) trúng vu vơ, gõ "tự dừng" ra nguyên danh mục;
 *  · server so khớp chuỗi thô nên phải nuôi một bảng đồng nghĩa tay ("cua" → "cửa", "duc" →
 *    "đức", …) — bảng đó không bao giờ đủ.
 *
 * Danh mục bán chỉ vài trăm mã, nên nạp một lần rồi tự xếp hạng: một vòng mạng, so khớp do
 * mình cầm, và bỏ dấu ở CẢ HAI phía khiến bảng đồng nghĩa kia thành thừa.
 */

export interface MatHangTimKiem {
  value: string;
  label?: string;
  description?: string;
  /** Nhóm hàng — cho phép tìm "đài loan" ra mọi mã thuộc nhóm đó. */
  group?: string;
}

function chu(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

/** Bỏ dấu, đ→d, thường hoá. Bỏ dấu ở cả hai phía nên "cua duc" khớp "CỬA ĐỨC". */
export function boDau(value: unknown): string {
  return chu(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi");
}

/** Chỉ giữ chữ và số — để "cdl1ly" so được với "CDL_DLM_1LY". */
function nen(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "");
}

/**
 * Viết tắt trong nghề, thứ mà bỏ dấu không giải quyết được: người bán gõ "dl" khi muốn nói
 * "đài loan". Chỉ giữ những cụm THẬT SỰ mơ hồ; đồng nghĩa do dấu thì đã tự xử ở `boDau`.
 */
const VIET_TAT: Record<string, string[]> = {
  dl: ["dai loan"],
  duc: ["duc"],
  kt: ["keo tay"],
  tb: ["tron bo"],
  tm: ["tach mon"],
  pb: ["phu bi"],
  sn: ["song ngang"],
  mv: ["mat vong"],
  std: ["standard", "sieu truong"],
  vk: ["van kem"],
  xn: ["xanh ngoc"],
  ray: ["ray"],
};

/** `kim` có phải dãy con của `dong` không — "cdl1ly" ⊂ "cdldlm1ly". */
function laDayCon(kim: string, dong: string): boolean {
  if (!kim) return false;
  let i = 0;
  for (const ky of dong) {
    if (ky === kim[i]) i += 1;
    if (i === kim.length) return true;
  }
  return false;
}

interface HoSo {
  ma: string;
  maNen: string;
  ten: string;
  nhom: string;
  tatCa: string;
}

function hoSo(mh: MatHangTimKiem): HoSo {
  const ma = boDau(mh.value);
  const ten = boDau(mh.label || mh.description);
  const nhom = boDau(mh.group);
  return { ma, maNen: nen(ma), ten, nhom, tatCa: `${ma} ${ten} ${nhom}` };
}

/**
 * Điểm khớp. **0 nghĩa là không khớp** và dòng đó bị loại hẳn — gõ bậy phải ra rỗng, không
 * phải ra cả danh mục.
 *
 * Luật VÀ: mọi tiếng người dùng gõ đều phải xuất hiện ở đâu đó (mã · tên · nhóm). "dl 1ly"
 * phải có cả "dl" lẫn "1ly"; thiếu một cái là loại. Đây là điểm khác lớn nhất so với bản cũ —
 * bản cũ cộng điểm theo từng tiếng nên thiếu tiếng vẫn lọt, chỉ tụt hạng.
 */
export function chamDiemMatHang(mh: MatHangTimKiem, truyVan: string): number {
  const q = boDau(truyVan);
  if (!q) return 1;
  const h = hoSo(mh);
  const qNen = nen(q);
  const tieng = q.split(/[\s_./\\-]+/).filter(Boolean);

  for (const t of tieng) {
    const canTim = [t, nen(t), ...(VIET_TAT[t] ?? [])];
    const khop = canTim.some((k) => h.tatCa.includes(k) || h.maNen.includes(nen(k)))
      /*
       * Gõ liền không dấu ngăn: "cdl1ly" phải ra "CDL_DLM_1LY". So khớp chuỗi con trượt vì mã
       * có "_DLM_" chen giữa, nên phải xét DÃY CON. Chỉ mở cho tiếng từ 4 ký tự trở lên —
       * ngắn hơn thì dãy con trúng gần như mọi mã, đúng cái kiểu vu vơ vừa bỏ.
       */
      || (nen(t).length >= 4 && laDayCon(nen(t), h.maNen));
    if (!khop) return 0;
  }

  let diem = 0;
  if (h.ma === q || h.maNen === qNen) diem += 1_000;
  else if (h.maNen.startsWith(qNen)) diem += 600;
  else if (h.maNen.includes(qNen)) diem += 420;
  else if (laDayCon(qNen, h.maNen)) diem += 260;

  if (h.ten === q) diem += 500;
  else if (h.ten.startsWith(q)) diem += 320;
  else if (h.ten.includes(q)) diem += 220;

  if (h.nhom.includes(q)) diem += 120;

  for (const t of tieng) {
    if (h.maNen.includes(nen(t))) diem += 70;
    if (h.ten.includes(t)) diem += 50;
    if (h.nhom.includes(t)) diem += 25;
  }
  // Mọi tiếng đều đã khớp (luật VÀ ở trên), nên luôn còn điểm sàn để không bị loại nhầm.
  return diem || 10;
}

/** Xếp hạng cả danh mục theo một truy vấn. Mã ngắn hơn thắng khi cùng điểm — nó cụ thể hơn. */
export function timMatHang(danhMuc: MatHangTimKiem[], truyVan: unknown, gioiHan = 50): MatHangTimKiem[] {
  const q = chu(truyVan);
  const chamDiem = danhMuc.map((mh) => ({ mh, diem: chamDiemMatHang(mh, q) }));
  return chamDiem
    .filter((x) => x.diem > 0)
    .sort((a, b) => b.diem - a.diem
      || a.mh.value.length - b.mh.value.length
      || a.mh.value.localeCompare(b.mh.value, "vi"))
    .slice(0, gioiHan)
    .map((x) => x.mh);
}

/**
 * Biến thể từ khoá gửi lên server — CHỈ còn dùng cho đường lui khi không nạp được danh mục
 * (và cho màn phiếu nhập chưa chuyển sang tìm tại chỗ). Giữ gọn: từ khoá thô và bản bỏ dấu.
 * Không sinh chữ cái đầu / viết liền nữa vì chính chúng kéo về hàng loạt kết quả vu vơ.
 */
export function salesItemSearchTerms(query: unknown): string[] {
  const raw = chu(query);
  if (!raw) return [""];
  return [...new Set([raw, boDau(raw)])];
}
