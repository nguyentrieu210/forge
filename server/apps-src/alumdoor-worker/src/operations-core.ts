export const WARRANTY_CAUSES = [
  "Sản xuất",
  "Nhà cung cấp",
  "Khách hàng sử dụng",
  "Vận chuyển/lắp đặt",
] as const;

export type WarrantyCause = typeof WARRANTY_CAUSES[number];
export type CapacityBasis = "m2" | "set" | "operation" | "batch";

const DAY_MS = 86_400_000;

function isoDate(value: unknown, label: string): string {
  const source = String(value ?? "").slice(0, 10);
  const date = new Date(`${source}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || Number.isNaN(date.valueOf())) throw new Error(`${label} không hợp lệ.`);
  return source;
}

function positive(value: unknown, label: string, allowZero = false): number {
  const result = Number(value);
  if (!Number.isFinite(result) || (allowZero ? result < 0 : result <= 0)) throw new Error(`${label} phải ${allowZero ? "không âm" : "lớn hơn 0"}.`);
  return result;
}

export function addCalendarMonths(dateValue: string, months: number): string {
  const source = isoDate(dateValue, "Ngày");
  const [year, month, day] = source.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function evaluateWarranty(input: {
  delivery_date?: string;
  received_fault_on: string;
  warranty_months?: number;
}): { eligible: boolean; expires_on: string; received_fault_on: string } {
  if (!input.delivery_date) throw new Error("Phải truy được Phiếu giao và ngày giao thực tế trước khi kết luận bảo hành.");
  const deliveryDate = isoDate(input.delivery_date, "Ngày giao");
  const faultDate = isoDate(input.received_fault_on, "Ngày nhận lỗi");
  if (faultDate < deliveryDate) throw new Error("Ngày nhận lỗi không được trước ngày giao.");
  const expiresOn = addCalendarMonths(deliveryDate, input.warranty_months ?? 12);
  return { eligible: faultDate <= expiresOn, expires_on: expiresOn, received_fault_on: faultDate };
}

export interface WarrantyCostLine {
  operation: string;
  quantity: number;
  rate: number;
}

export interface WarrantyClaimInput {
  sales_order?: string;
  delivery_note?: string;
  delivery_date?: string;
  item_code?: string;
  received_fault_on?: string;
  issue_cause?: string;
  responsible_person?: string;
  supplier?: string;
  purchase_document?: string;
  debit_note?: string;
  supplier_offset_amount?: number;
  accounting_confirmed_by?: string;
  customer_costs?: WarrantyCostLine[];
}

export function validateWarrantyClaim(input: WarrantyClaimInput): WarrantyClaimInput & {
  warranty_eligible: 0 | 1;
  warranty_expires_on: string;
  customer_cost_total: number;
  warranty_status: string;
} {
  for (const [field, label] of [
    [input.sales_order, "Đơn bán"], [input.delivery_note, "Phiếu giao"], [input.item_code, "Mặt hàng"],
  ] as const) if (!String(field ?? "").trim()) throw new Error(`${label} là bắt buộc để truy vết bảo hành.`);
  if (!WARRANTY_CAUSES.includes(input.issue_cause as WarrantyCause)) throw new Error("Nguyên nhân lỗi phải thuộc một trong bốn nhóm chuẩn.");
  const warranty = evaluateWarranty({
    ...(input.delivery_date ? { delivery_date: input.delivery_date } : {}),
    received_fault_on: String(input.received_fault_on ?? ""),
    warranty_months: 12,
  });
  if (input.issue_cause === "Sản xuất" && !String(input.responsible_person ?? "").trim()) {
    throw new Error("Lỗi sản xuất phải có người chịu trách nhiệm.");
  }
  if (input.issue_cause === "Nhà cung cấp") {
    if (!String(input.supplier ?? "").trim() || !String(input.purchase_document ?? "").trim()) {
      throw new Error("Lỗi nhà cung cấp phải truy được nhà cung cấp và chứng từ mua.");
    }
    positive(input.supplier_offset_amount ?? 0, "Số tiền bù trừ", true);
  }
  const costs = input.customer_costs ?? [];
  if (input.issue_cause === "Khách hàng sử dụng" && costs.length === 0) {
    throw new Error("Lỗi do khách sử dụng phải có chi phí theo từng công việc.");
  }
  const customerCostTotal = costs.reduce((total, row, index) => {
    if (!String(row.operation ?? "").trim()) throw new Error(`Chi phí dòng ${index + 1} thiếu công việc.`);
    return total + positive(row.quantity, `Số lượng chi phí dòng ${index + 1}`) * positive(row.rate, `Đơn giá chi phí dòng ${index + 1}`, true);
  }, 0);
  return {
    ...input,
    warranty_eligible: warranty.eligible ? 1 : 0,
    warranty_expires_on: warranty.expires_on,
    customer_cost_total: Math.round(customerCostTotal * 100) / 100,
    warranty_status: input.issue_cause === "Nhà cung cấp" ? "Chờ NCC đổi" : "Đang xử lý",
  };
}

export function confirmSupplierOffset(input: WarrantyClaimInput, actor: { user_id: string; roles: string[] }): WarrantyClaimInput & {
  accounting_confirmed_by: string;
  accounting_confirmed_on: string;
  warranty_status: "Đã xác nhận bù trừ";
} {
  const allowed = new Set(["General Accountant", "Chief Accountant", "Kế toán tổng hợp", "Kế toán trưởng"]);
  if (!actor.roles.some((role) => allowed.has(role))) throw new Error("Chỉ Kế toán tổng hợp/Kế toán trưởng được xác nhận bù trừ nhà cung cấp.");
  if (input.issue_cause !== "Nhà cung cấp") throw new Error("Chỉ hồ sơ lỗi nhà cung cấp mới được xác nhận bù trừ.");
  positive(input.supplier_offset_amount ?? 0, "Số tiền bù trừ");
  if (!input.purchase_document || !input.supplier) throw new Error("Thiếu chứng từ mua hoặc nhà cung cấp để bù trừ.");
  return {
    ...input,
    accounting_confirmed_by: actor.user_id,
    accounting_confirmed_on: new Date().toISOString(),
    warranty_status: "Đã xác nhận bù trừ",
  };
}

export interface CapacityDemand {
  key: string;
  door_type: string;
  operation: string;
  basis: CapacityBasis;
  quantity: number;
  minutes_per_unit: number;
  color?: string;
  batch_capacity?: number;
}

export interface CapacityResource {
  persons: number;
  shifts?: number;
  shift_hours?: number;
  efficiency?: number;
  overtime_hours?: number;
  workstation_minutes?: number;
  start_date?: string;
  holidays?: string[];
}

export function demandMinutes(demand: CapacityDemand): number {
  const quantity = positive(demand.quantity, `Khối lượng ${demand.key}`);
  const minutes = positive(demand.minutes_per_unit, `Định mức ${demand.key}`);
  if (demand.basis === "batch") return Math.ceil(quantity / positive(demand.batch_capacity ?? 1, `Sức chứa mẻ ${demand.key}`)) * minutes;
  return quantity * minutes;
}

export function planCapacity(demands: CapacityDemand[], resource: CapacityResource): {
  required_minutes: number;
  regular_capacity_minutes: number;
  overtime_capacity_minutes: number;
  overload_minutes: number;
  late_warning: boolean;
  days_required: number;
  suggested_end_date: string;
} {
  const regularDemands = demands.filter((row) => row.basis !== "batch");
  const required = regularDemands.reduce((sum, row) => sum + demandMinutes(row), 0)
    + groupPaintBatches(demands).reduce((sum, row) => sum + row.required_minutes, 0);
  const persons = positive(resource.persons, "Số người");
  const shifts = positive(resource.shifts ?? 1, "Số ca");
  const shiftHours = positive(resource.shift_hours ?? 8, "Số giờ/ca");
  const efficiency = positive(resource.efficiency ?? 1, "Hiệu suất");
  const crewCapacity = persons * shifts * shiftHours * 60 * efficiency;
  const regular = resource.workstation_minutes == null
    ? crewCapacity
    : Math.min(crewCapacity, positive(resource.workstation_minutes, "Công suất trạm"));
  const overtime = positive(resource.overtime_hours ?? 0, "Giờ tăng ca", true) * persons * 60 * efficiency;
  const overload = Math.max(0, required - regular - overtime);
  const dailyCapacity = regular + overtime;
  const daysRequired = dailyCapacity > 0 ? Math.ceil(required / dailyCapacity) : 0;
  let suggestedEndDate = "";
  if (resource.start_date && daysRequired > 0) {
    const holidays = resource.holidays ?? [];
    let cursor = nextWorkingDate(resource.start_date, holidays);
    for (let day = 1; day < daysRequired; day += 1) {
      cursor = nextWorkingDate(new Date(new Date(`${cursor}T00:00:00.000Z`).valueOf() + DAY_MS).toISOString().slice(0, 10), holidays);
    }
    suggestedEndDate = cursor;
  }
  return {
    required_minutes: Math.round(required * 100) / 100,
    regular_capacity_minutes: Math.round(regular * 100) / 100,
    overtime_capacity_minutes: Math.round(overtime * 100) / 100,
    overload_minutes: Math.round(overload * 100) / 100,
    late_warning: overload > 0,
    days_required: daysRequired,
    suggested_end_date: suggestedEndDate,
  };
}

export function groupPaintBatches(demands: CapacityDemand[]): Array<{ color: string; quantity: number; batches: number; required_minutes: number }> {
  const grouped = new Map<string, CapacityDemand[]>();
  for (const row of demands.filter((entry) => entry.basis === "batch")) {
    const color = String(row.color ?? "CHƯA CHỌN MÀU").trim().toLocaleUpperCase("vi");
    grouped.set(color, [...(grouped.get(color) ?? []), row]);
  }
  return [...grouped.entries()].map(([color, rows]) => {
    const quantity = rows.reduce((sum, row) => sum + positive(row.quantity, `Khối lượng sơn ${color}`), 0);
    const capacity = Math.min(...rows.map((row) => positive(row.batch_capacity ?? 1, `Sức chứa mẻ ${color}`)));
    const minutes = Math.max(...rows.map((row) => positive(row.minutes_per_unit || 180, `Thời lượng mẻ ${color}`)));
    const batches = Math.ceil(quantity / capacity);
    return { color, quantity, batches, required_minutes: batches * minutes };
  }).sort((left, right) => left.color.localeCompare(right.color, "vi"));
}

export function deliveryBatchKey(deliveryDate: string, salesOrder: string): string {
  return `${isoDate(deliveryDate, "Ngày giao")}:${String(salesOrder).trim()}`;
}

export function previewDailyDeliveries(
  deliveryDate: string,
  orders: Array<{ name: string; delivery_date?: string; docstatus?: number; delivered_percentage?: number; customer?: string }>,
  existing: Array<{ against_sales_order?: string; delivery_batch_key?: string; name?: string; docstatus?: number }>,
): Array<{ sales_order: string; customer?: string; delivery_batch_key: string; existing_delivery_note?: string; status: "Sẵn sàng" | "Đã tạo" }> {
  const date = isoDate(deliveryDate, "Ngày giao");
  return orders
    .filter((order) => order.docstatus === 1 && String(order.delivery_date ?? "").slice(0, 10) <= date && Number(order.delivered_percentage ?? 0) < 100)
    .map((order): { sales_order: string; customer?: string; delivery_batch_key: string; existing_delivery_note?: string; status: "Sẵn sàng" | "Đã tạo" } => {
      const key = deliveryBatchKey(date, order.name);
      const found = existing.find((note) => note.docstatus !== 2 && (note.delivery_batch_key === key || note.against_sales_order === order.name));
      return {
        sales_order: order.name,
        ...(order.customer ? { customer: order.customer } : {}),
        delivery_batch_key: key,
        ...(found?.name ? { existing_delivery_note: found.name } : {}),
        status: found ? "Đã tạo" : "Sẵn sàng",
      };
    })
    .sort((left, right) => left.sales_order.localeCompare(right.sales_order, "vi"));
}

export function nextWorkingDate(start: string, holidays: string[]): string {
  const blocked = new Set(holidays.map((value) => isoDate(value, "Ngày nghỉ")));
  let cursor = new Date(`${isoDate(start, "Ngày bắt đầu")}T00:00:00.000Z`);
  while (blocked.has(cursor.toISOString().slice(0, 10)) || cursor.getUTCDay() === 0) cursor = new Date(cursor.valueOf() + DAY_MS);
  return cursor.toISOString().slice(0, 10);
}
