/**
 * Tra motor và bình lưu điện theo bảng ngưỡng.
 *
 * Nguồn `BANG-GIA-CHINH-THUC-31-07-2026 §6` nói thẳng vì sao luật này phải nằm trong phần mềm:
 * "chọn lò xo thế nào thì để thợ tự chọn — motor thì CÓ LUẬT RÕ RÀNG nên app tra được".
 *
 * Trước 19/08 luật đó không ở đâu cả: 25 motor nằm trong `Item`, còn ngưỡng diện tích thì chỉ
 * nằm trong đầu người bán. Chọn dư một cấp là khách trả thừa vài triệu; chọn thiếu một cấp là
 * motor kéo quá tải rồi hỏng trong hạn bảo hành.
 *
 * HAI LUẬT KHÁC NHAU, cố ý không gộp:
 *   · motor chọn theo DIỆN TÍCH CỬA
 *   · bình lưu điện chọn theo TẢI MOTOR, không theo diện tích
 */

export interface MotorThresholdRow {
  rule_code?: string;
  item_code?: string;
  selection_basis?: string;
  max_area_sqm?: number | string | null;
  max_motor_kg?: number | string | null;
  includes?: string;
  sort_order?: number | string | null;
  disabled?: number | boolean;
}

export interface MotorSuggestion {
  rule_code: string;
  item_code: string;
  threshold: number;
  includes: string;
}

const enabled = (row: MotorThresholdRow) => !(row.disabled === 1 || row.disabled === true);
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Cận trên MỞ.
 *
 * Nguồn ghi `<15m²`, không phải `≤15m²`, nên cửa đúng 15 m² KHÔNG dùng motor 15. Đảo chiều là
 * lệch đúng một cấp ở mọi đơn nằm ở mép — mà đơn ở mép thì nhiều, vì người ta hay làm tròn số.
 */
function pickSmallestAbove(rows: MotorThresholdRow[], value: number, field: 'max_area_sqm' | 'max_motor_kg'): MotorSuggestion | null {
  const candidates = rows
    .filter(enabled)
    .map((row) => ({ row, threshold: num(row[field]) }))
    .filter((entry): entry is { row: MotorThresholdRow; threshold: number } => entry.threshold !== null)
    .filter((entry) => value < entry.threshold)
    .sort((a, b) => a.threshold - b.threshold || num(a.row.sort_order)! - num(b.row.sort_order)!);
  const best = candidates[0];
  if (!best) return null;
  return {
    rule_code: String(best.row.rule_code ?? ''),
    item_code: String(best.row.item_code ?? ''),
    threshold: best.threshold,
    includes: String(best.row.includes ?? ''),
  };
}

export function suggestMotor(rows: MotorThresholdRow[], areaSqm: number): MotorSuggestion | null {
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) throw new Error('Diện tích cửa phải là số dương');
  const byArea = rows.filter((row) => row.selection_basis === 'Diện tích cửa');
  return pickSmallestAbove(byArea, areaSqm, 'max_area_sqm');
}

export function suggestUps(rows: MotorThresholdRow[], motorKg: number): MotorSuggestion | null {
  if (!Number.isFinite(motorKg) || motorKg <= 0) throw new Error('Tải motor phải là số dương');
  const byLoad = rows.filter((row) => row.selection_basis === 'Tải motor');
  return pickSmallestAbove(byLoad, motorKg, 'max_motor_kg');
}

/**
 * Tải motor đọc từ đuôi mã luật (`MOTO-JG-800` ⇒ 800 kg).
 *
 * Cả 15 dòng motor trong bảng §6 đều theo dạng này, nhưng đây vẫn là SUY RA chứ không phải số
 * được khai, nên khi đuôi không ra số thì TỪ CHỐI. Đoán bừa ở đây là chọn nhầm bình lưu điện,
 * và nhầm về phía nhỏ thì bình không kéo nổi motor lúc mất điện — đúng lúc cần nó nhất.
 */
export function motorLoadKg(ruleCode: string): number {
  const match = /-(\d+)$/.exec(ruleCode.trim());
  const parsed = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Không suy được tải motor từ mã luật ${JSON.stringify(ruleCode)}; hãy truyền motor_kg`);
  }
  return parsed;
}
