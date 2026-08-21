/** @jsxImportSource react */
/**
 * Panel NĂNG LỰC XƯỞNG của phiếu sản xuất.
 *
 * Gọi `alumdoor.capacity.preview` (chữ ký thật: `server/apps-src/alumdoor-worker/src/index.ts:2154`
 * → `planCapacity` ở `operations-core.ts:157`) để trả lời một câu: **ngày hẹn giao trên lệnh có
 * khả thi không, hay xưởng đã quá tải.**
 *
 * ── Ba chỗ màn này CỐ Ý không đoán ───────────────────────────────────────────────────────────
 *
 *  1. **Cơ sở định mức** (`m2` / `set` / `operation` / `batch`). Server có một phép suy khi
 *     `Production Standard.capacity_basis` bỏ trống (`findStandard` ở `sales-production-core.ts:607`
 *     suy theo Loại cửa và tên công đoạn). Đó là thẩm quyền của server, không phải của màn. Ở đây
 *     nếu danh mục bỏ trống thì BẮT người dùng chọn, vì chọn sai trục là ra một con số tải sai hẳn.
 *
 *  2. **Khối lượng.** Một lệnh có nhiều con số có thể làm "khối lượng" tuỳ trục: SL lệnh, diện
 *     tích tính tiền, số lá. Màn bày cả ba ra dạng chip bấm-để-điền và để người dùng quyết.
 *
 *  3. **Hiệu suất.** `Production Standard.efficiency` là **Percent** (mặc định 100), còn
 *     `planCapacity` nhân thẳng `efficiency` vào công suất — tức truyền 100 sang là gấp 100 lần
 *     công suất. Màn KHÔNG tự chia 100 (đó là sửa hợp đồng của server ở phía client); nó điền 1
 *     và nói rõ danh mục đang khai bao nhiêu.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Gauge, Loader2 } from "lucide-react";
import { mapError, type DocTypeMeta } from "@metaforge/core";
import { Badge, Button } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorWorkOrderField, metaFieldOr, WorkOrderReadonlyField } from "./AlumdoorWorkOrderField.js";
import {
  capacityBasisOf,
  minutesLabel,
  numberValue,
  optionList,
  quantity,
  text,
  type CapacityBasis,
  type CapacityPlan,
  type Json,
  type ProductionStandardFacts,
} from "./model.js";

const BASIS_LABELS: Record<CapacityBasis, string> = {
  m2: "m² — mỗi mét vuông ăn một lượng phút",
  set: "Bộ — mỗi bộ cửa ăn một lượng phút",
  operation: "Công đoạn — cả lệnh ăn một lượng phút",
  batch: "Mẻ — gom theo mẻ sơn, mỗi mẻ ăn một lượng phút",
};

interface QuantityHint {
  label: string;
  value: number;
}

export interface AlumdoorWorkOrderCapacityPanelProps {
  workOrder: string;
  doorType: string;
  color: string;
  plannedStartDate: string;
  plannedEndDate: string;
  /** Các con số của lệnh có thể dùng làm "khối lượng", kèm nhãn nói rõ chúng là gì. */
  quantityHints: QuantityHint[];
  /** `Work Order.estimated_minutes` — phút dự toán server đã chụp lúc lập lệnh. */
  estimatedMinutes: number | undefined;
}

export function AlumdoorWorkOrderCapacityPanel(props: AlumdoorWorkOrderCapacityPanelProps) {
  const { adapter, registry, services, roles } = useMetaForge();
  const [standardMeta, setStandardMeta] = useState<DocTypeMeta | null>(null);
  const [standards, setStandards] = useState<ProductionStandardFacts[]>([]);
  const [standardsError, setStandardsError] = useState("");
  const [form, setForm] = useState<Json>(() => ({
    production_standard: "",
    capacity_basis: "",
    quantity: props.quantityHints[0]?.value,
    persons: 1,
    shifts: 1,
    shift_hours: 8,
    efficiency: 1,
    overtime_hours: 0,
  }));
  const [plan, setPlan] = useState<CapacityPlan | null>(null);
  const [planError, setPlanError] = useState("");
  const [pending, setPending] = useState(false);

  const setField = useCallback((fieldname: string, value: unknown) => {
    setForm((current) => ({ ...current, [fieldname]: value }));
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const meta = await adapter.getMeta("Production Standard").catch(() => null);
      if (alive) setStandardMeta(meta);
      try {
        const rows = await adapter.getList("Production Standard", {
          fields: [
            "name", "department", "door_type", "operation", "minutes_per_set", "minutes_per_unit",
            "capacity_basis", "batch_capacity", "persons", "shift_hours", "efficiency",
            "default_overtime_hours", "workstation", "disabled",
          ],
          ...(props.doorType ? { filters: [["door_type", "=", props.doorType]] as Array<[string, "=", unknown]> } : {}),
          pageLength: 200,
        });
        if (!alive) return;
        setStandards(rows.map((row) => ({
          name: text(row.name),
          department: text(row.department),
          door_type: text(row.door_type),
          operation: text(row.operation),
          minutes_per_set: numberValue(row.minutes_per_set),
          minutes_per_unit: numberValue(row.minutes_per_unit),
          capacity_basis: text(row.capacity_basis),
          batch_capacity: numberValue(row.batch_capacity),
          persons: numberValue(row.persons),
          shift_hours: numberValue(row.shift_hours),
          efficiency: numberValue(row.efficiency),
          default_overtime_hours: numberValue(row.default_overtime_hours),
          workstation: text(row.workstation),
          disabled: row.disabled,
        })));
      } catch (error) {
        if (alive) setStandardsError(mapError(error).message);
      }
    })();
    return () => { alive = false; };
  }, [adapter, props.doorType]);

  const selectedStandard = useMemo(
    () => standards.find((row) => text(row.name) === text(form.production_standard)),
    [form.production_standard, standards],
  );

  /** Mirror ĐÚNG thứ tự ưu tiên của server: `minutes_per_unit ?? minutes_per_set`. */
  const minutesPerUnit = numberValue(selectedStandard?.minutes_per_unit)
    ?? numberValue(selectedStandard?.minutes_per_set);
  const minutesSource = numberValue(selectedStandard?.minutes_per_unit) !== undefined
    ? "Phút / đơn vị"
    : numberValue(selectedStandard?.minutes_per_set) !== undefined ? "Phút / bộ" : "";

  const basis = capacityBasisOf(form.capacity_basis) ?? capacityBasisOf(selectedStandard?.capacity_basis);
  const basisOptions = optionList(standardMeta, "capacity_basis", ["m2", "set", "operation", "batch"]);
  const quantityValue = numberValue(form.quantity);
  const canPreview = Boolean(selectedStandard)
    && minutesPerUnit !== undefined
    && basis !== undefined
    && quantityValue !== undefined
    && quantityValue > 0
    && (numberValue(form.persons) ?? 0) > 0;

  const runPreview = useCallback(async () => {
    if (!basis || minutesPerUnit === undefined || quantityValue === undefined) return;
    setPending(true);
    setPlanError("");
    try {
      const demand = {
        key: props.workOrder,
        door_type: props.doorType,
        operation: text(selectedStandard?.operation) || "Sản xuất",
        basis,
        quantity: quantityValue,
        minutes_per_unit: minutesPerUnit,
        ...(props.color ? { color: props.color } : {}),
        ...(numberValue(selectedStandard?.batch_capacity) === undefined
          ? {}
          : { batch_capacity: numberValue(selectedStandard?.batch_capacity) }),
      };
      const resource = {
        persons: numberValue(form.persons) ?? 1,
        shifts: numberValue(form.shifts) ?? 1,
        shift_hours: numberValue(form.shift_hours) ?? 8,
        efficiency: numberValue(form.efficiency) ?? 1,
        overtime_hours: numberValue(form.overtime_hours) ?? 0,
        ...(props.plannedStartDate ? { start_date: props.plannedStartDate.slice(0, 10) } : {}),
      };
      const result = await adapter.callPost<CapacityPlan>("alumdoor.capacity.preview", {
        demands_json: JSON.stringify([demand]),
        resource_json: JSON.stringify(resource),
      });
      setPlan(result);
    } catch (error) {
      setPlan(null);
      setPlanError(mapError(error).message);
    } finally {
      setPending(false);
    }
  }, [adapter, basis, form, minutesPerUnit, props.color, props.doorType, props.plannedStartDate, props.workOrder, quantityValue, selectedStandard]);

  const suggestedEnd = text(plan?.suggested_end_date);
  const plannedEnd = props.plannedEndDate.slice(0, 10);
  const lateVsPromise = Boolean(suggestedEnd && plannedEnd && suggestedEnd > plannedEnd);

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-section="work-order-v2-capacity">
      <div className="border-b px-4 py-3">
        <h3 className="font-medium">Năng lực xưởng theo ngày hẹn giao</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Định mức thời gian lấy từ danh mục `Production Standard`; phép lập tải do
          `alumdoor.capacity.preview` chạy. Màn chỉ ghép yêu cầu.
        </p>
      </div>

      {standardsError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
          Không đọc được danh mục Định mức thời gian: {standardsError}
        </div>
      ) : null}

      <div className="space-y-3 px-4 py-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <AlumdoorWorkOrderField
            id="work-order-v2-capacity-standard"
            field={metaFieldOr(null, "production_standard", "Định mức thời gian", "Link", "Production Standard")}
            label="Định mức thời gian"
            value={form.production_standard}
            onChange={(value) => setField("production_standard", value)}
            registry={registry}
            services={services}
            parentDoctype="Work Order"
            docValues={form}
            roles={roles}
            readOnly={pending}
          />
          <AlumdoorWorkOrderField
            id="work-order-v2-capacity-basis"
            field={metaFieldOr(standardMeta, "capacity_basis", "Cơ sở định mức", "Select", basisOptions.join("\n"))}
            label="Cơ sở định mức"
            value={text(form.capacity_basis) || text(selectedStandard?.capacity_basis)}
            onChange={(value) => setField("capacity_basis", value)}
            registry={registry}
            services={services}
            parentDoctype="Production Standard"
            docValues={form}
            roles={roles}
            readOnly={pending}
          />
          <WorkOrderReadonlyField
            label="Phút / đơn vị (từ danh mục)"
            value={minutesPerUnit === undefined ? "" : quantity(minutesPerUnit)}
            hint={minutesSource ? `đọc ở trường “${minutesSource}”` : "danh mục chưa khai — không lập được tải"}
            tone={minutesPerUnit === undefined ? "danger" : "default"}
          />
          <AlumdoorWorkOrderField
            id="work-order-v2-capacity-quantity"
            field={metaFieldOr(null, "quantity", "Khối lượng theo cơ sở", "Float")}
            label="Khối lượng theo cơ sở"
            value={form.quantity}
            onChange={(value) => setField("quantity", value)}
            registry={registry}
            services={services}
            parentDoctype="Work Order"
            docValues={form}
            roles={roles}
            readOnly={pending}
          />
        </div>

        {props.quantityHints.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Số của lệnh (bấm để điền):</span>
            {props.quantityHints.map((hint) => (
              <Button
                key={hint.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px]"
                disabled={pending}
                onClick={() => setField("quantity", hint.value)}
              >
                {hint.label}: {quantity(hint.value)}
              </Button>
            ))}
          </div>
        ) : null}

        {basis ? (
          <div className="text-[11px] text-muted-foreground">Trục đang chọn — {BASIS_LABELS[basis]}.</div>
        ) : (
          <div className="text-[11px] text-destructive">
            Danh mục chưa khai Cơ sở định mức cho bản ghi này. Phải chọn một trục; màn cố ý không suy hộ.
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {(["persons", "shifts", "shift_hours", "efficiency", "overtime_hours"] as const).map((fieldname) => (
            <AlumdoorWorkOrderField
              key={fieldname}
              id={`work-order-v2-capacity-${fieldname}`}
              field={metaFieldOr(
                fieldname === "persons" || fieldname === "shift_hours" || fieldname === "efficiency" ? standardMeta : null,
                fieldname === "shifts" ? "shifts" : fieldname === "overtime_hours" ? "default_overtime_hours" : fieldname,
                fieldname === "persons" ? "Số người"
                  : fieldname === "shifts" ? "Số ca"
                    : fieldname === "shift_hours" ? "Giờ / ca"
                      : fieldname === "efficiency" ? "Hiệu suất (hệ số nhân)"
                        : "Giờ tăng ca",
                "Float",
              )}
              label={
                fieldname === "persons" ? "Số người"
                  : fieldname === "shifts" ? "Số ca"
                    : fieldname === "shift_hours" ? "Giờ / ca"
                      : fieldname === "efficiency" ? "Hiệu suất (hệ số nhân)"
                        : "Giờ tăng ca"
              }
              value={form[fieldname]}
              onChange={(value) => setField(fieldname, value)}
              registry={registry}
              services={services}
              parentDoctype="Production Standard"
              docValues={form}
              roles={roles}
              readOnly={pending}
            />
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Hiệu suất ở đây là HỆ SỐ NHÂN của `planCapacity` — 1 nghĩa là 100%.
          {numberValue(selectedStandard?.efficiency) === undefined
            ? " Danh mục chưa khai Hiệu suất."
            : ` Danh mục đang khai ${quantity(selectedStandard?.efficiency)}% cho bản ghi này; màn không tự quy đổi vì đó là hợp đồng của server.`}
          {selectedStandard?.default_overtime_hours === undefined
            ? ""
            : ` Giờ tăng ca mặc định của danh mục: ${quantity(selectedStandard?.default_overtime_hours)}.`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!canPreview || pending} onClick={() => void runPreview()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge className="size-3.5" />}
            Lập tải
          </Button>
          {props.estimatedMinutes !== undefined ? (
            <Badge variant="outline" className="text-[10px]">
              Phút dự toán lúc lập lệnh: {minutesLabel(props.estimatedMinutes)}
            </Badge>
          ) : null}
          {props.plannedEndDate ? (
            <Badge variant="outline" className="text-[10px]">
              <CalendarClock className="mr-1 size-3" /> Hẹn giao {plannedEnd}
            </Badge>
          ) : null}
        </div>

        {planError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />{planError}
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <WorkOrderReadonlyField label="Cần" value={minutesLabel(plan.required_minutes)} />
              <WorkOrderReadonlyField label="Công suất trong ca" value={minutesLabel(plan.regular_capacity_minutes)} />
              <WorkOrderReadonlyField label="Công suất tăng ca" value={minutesLabel(plan.overtime_capacity_minutes)} />
              <WorkOrderReadonlyField
                label="Quá tải"
                value={minutesLabel(plan.overload_minutes)}
                tone={plan.late_warning === true ? "danger" : "default"}
              />
              <WorkOrderReadonlyField label="Số ngày cần" value={plan.days_required} />
              <WorkOrderReadonlyField label="Ngày xong đề xuất" value={suggestedEnd} />
            </div>
            {plan.late_warning === true ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
                Quá tải {minutesLabel(plan.overload_minutes)} so với công suất khai ở trên — server đã bật cảnh báo trễ.
              </div>
            ) : null}
            {lateVsPromise ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
                Ngày xong đề xuất {suggestedEnd} muộn hơn ngày hẹn giao {plannedEnd} ghi trên lệnh.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
