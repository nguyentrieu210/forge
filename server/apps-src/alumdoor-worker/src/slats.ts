/**
 * Số lá của một bộ cửa — chỗ mà sai một lá là cắt hỏng một bộ nhôm.
 *
 * Tách khỏi index.ts vì đây là phần DUY NHẤT có thể kiểm bằng số học thuần: cho chiều cao
 * phủ bì và mã vật tư, ra số lá. Không mạng, không kho, không quyền. Nên nó có test riêng
 * chạy được mà không cần tenant.
 *
 * BỐN QUYẾT ĐỊNH đã chốt khi hai tài liệu của xưởng nói khác nhau — ghi ở đây vì người sửa
 * sau sẽ đọc file này, không đọc lại đoạn chat:
 *
 * 1. AL70 KHÔNG trừ 1. Bảng công thức PDF ghi `−1`; đặc tả quy trình nêu ba ví dụ và cả ba
 *    đều cộng ra 42 (1+41 · 38+4 · và ví dụ gốc 42). Chọn theo đặc tả vì nó nói hai lần có
 *    bóc tách chi tiết. Đọc theo cấu tạo cũng hợp: `−1` ở các mã khác là vì LÁ ĐẦU chiếm chỗ
 *    một lá ruột, còn AL70 đếm TỔNG số lá của bộ nên không có gì để trừ.
 * 2. AL71N chia 0,057 — theo cột CÔNG THỨC, không theo cột BẢN LÁ (0,055). Cột công thức là
 *    thứ kế toán thực sự tính, và 0,057 khớp AL501N cùng đời N.
 * 3. AL71 (cả hai đời) không trừ 1 — theo đúng PDF.
 * 4. Làm tròn: tính xong rồi làm tròn về số nguyên gần nhất. Suy ra từ chính ba ví dụ của
 *    xưởng: 52,18→51 · "52,6 thì là 52" · "<52,5 thì là 51". Trừ 1 trước rồi làm tròn thường
 *    khớp cả ba; không có luật riêng nào khác.
 */

export interface SlatProfile {
  /** Bản lá dùng để CHIA. Có mã mà bản lá ghi trong bảng khác số chia — số chia thắng. */
  divisor: number;
  /** Trừ 1 vì lá đầu chiếm chỗ một lá ruột. AL71 và AL70 không trừ. */
  subtractOne: boolean;
}

/** Khoảng trừ cố định ở đầu cửa: 130 mm. Bảng của xưởng ghi là `130`, đơn vị mm. */
export const HEAD_ALLOWANCE_M = 0.13;

export const SLAT_PROFILES: Record<string, SlatProfile> = {
  "AL71N": { divisor: 0.057, subtractOne: false },
  "AL71 (CŨ)": { divisor: 0.055, subtractOne: false },
  "AL70 (2 LỚP)": { divisor: 0.068, subtractOne: false },
  "AL70 (1 LỚP)": { divisor: 0.068, subtractOne: false },
  "AL75": { divisor: 0.067, subtractOne: true },
  "AL595": { divisor: 0.060, subtractOne: true },
  "AL503N": { divisor: 0.055, subtractOne: true },
  "AL503 (CŨ)": { divisor: 0.050, subtractOne: true },
  "AL548N": { divisor: 0.055, subtractOne: true },
  "AL548 (CŨ)": { divisor: 0.050, subtractOne: true },
  "AL501N": { divisor: 0.057, subtractOne: true },
  "AL501 (CŨ)": { divisor: 0.050, subtractOne: true },
  "AL552 (CŨ)": { divisor: 0.057, subtractOne: true },
  "AL652": { divisor: 0.050, subtractOne: true },
  "AL752": { divisor: 0.050, subtractOne: true },
  "AL50": { divisor: 0.055, subtractOne: true },
  "AL-VIP50": { divisor: 0.055, subtractOne: true },
  "AL-VIPST500": { divisor: 0.053, subtractOne: true },
  "AL-VIPST700": { divisor: 0.050, subtractOne: true },
};

/**
 * Tên mã trong file tồn kho và trong bảng công thức KHÔNG giống nhau.
 *
 * Kho có một sheet `AL548`; bảng công thức có `AL548N` và `AL548 (CŨ)` với bản lá chênh 10%.
 * Cột `TÌNH TRẠNG` (mới/cũ) trong kho chính là chỗ phân biệt hai đời đó — nên tra công thức
 * phải dùng CẢ mã và đời, không chỉ mã.
 */
export function profileKey(profile: string, generation: string): string {
  const code = profile.trim().toUpperCase().replace(/\s+/g, " ");
  const old = generation.trim().toUpperCase() === "CŨ";
  const direct = SLAT_PROFILES[code] ? code : undefined;
  if (direct && !SLAT_PROFILES[`${code}N`]) return direct;
  return old ? `${code} (CŨ)` : `${code}N`;
}

export interface SlatCount {
  /** Số lá ruột (mã có trừ 1), hoặc tổng số lá (AL70/AL71). */
  slats: number;
  divisor: number;
  /** Giá trị trước khi làm tròn — để màn hình giải thích được con số. */
  raw: number;
  key: string;
}

/**
 * @param heightM chiều cao PHỦ BÌ, mét.
 * @throws khi mã không có trong bảng — thà từ chối còn hơn đoán một bản lá và cắt hỏng.
 */
export function slatCount(profile: string, generation: string, heightM: number): SlatCount {
  const key = profileKey(profile, generation);
  const spec = SLAT_PROFILES[key];
  if (!spec) {
    throw new Error(`Chưa có công thức chia lá cho "${key}". Mã có công thức: ${Object.keys(SLAT_PROFILES).join(", ")}`);
  }
  if (!Number.isFinite(heightM) || heightM <= HEAD_ALLOWANCE_M) {
    throw new Error(`Chiều cao phủ bì phải lớn hơn ${HEAD_ALLOWANCE_M} m, nhận được ${heightM}`);
  }
  const raw = (heightM - HEAD_ALLOWANCE_M) / spec.divisor - (spec.subtractOne ? 1 : 0);
  return { slats: Math.round(raw), divisor: spec.divisor, raw, key };
}

/**
 * Số lá cửa ÚC — luật làm tròn hoàn toàn khác: về 0 / 0,3 / 0,7 / 1,0.
 *
 * Không phải làm tròn về số nguyên: cửa Úc đếm được nửa lá, và xưởng quy ước phần thập phân
 * chỉ nhận bốn giá trị đó. Gộp chung với cửa Đức sẽ ra số lá không cắt được.
 */
export type AustralianDoor = "motor trong" | "kéo tay" | "motor ngoài" | "motor ngoài tự dừng";

const AUSTRALIAN_OFFSET: Record<AustralianDoor, number> = {
  "motor trong": 2,
  "kéo tay": 2,
  "motor ngoài": 1.5,
  "motor ngoài tự dừng": 1.3,
};

export function australianSlatCount(kind: AustralianDoor, heightM: number): number {
  const offset = AUSTRALIAN_OFFSET[kind];
  if (offset === undefined) throw new Error(`Loại cửa Úc không nhận ra: ${kind}`);
  const raw = heightM / 0.465 + offset;
  const whole = Math.floor(raw);
  /**
   * Luật đọc trên CHỮ SỐ THẬP PHÂN THỨ NHẤT, sau khi cắt bỏ phần còn lại — không phải trên
   * phần lẻ đầy đủ.
   *
   * Khác biệt này không nhỏ: xưởng viết "(2m6:0.465)+1.5 = 7.0 → 7 lá", mà giá trị thật là
   * 7,0914. Đọc theo phần lẻ (0,0914) sẽ rơi vào bậc 0,1–0,3 và ra 7,3 — thừa một phần ba
   * lá trên mọi bộ cửa có phần lẻ dưới 0,1. Xưởng cắt về một chữ số trước rồi mới tra bậc,
   * nên code phải làm đúng thứ tự đó.
   *
   * Bốn bậc: 0 → 0 · 1–3 → 0,3 · 4–7 → 0,7 · 8–9 → lên 1.
   */
  const firstDecimal = Math.floor((raw - whole) * 10);
  if (firstDecimal === 0) return whole;
  if (firstDecimal <= 3) return whole + 0.3;
  if (firstDecimal <= 7) return whole + 0.7;
  return whole + 1;
}
