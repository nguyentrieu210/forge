/** @jsxImportSource react */
/**
 * Field controls — data-driven từ DocField, render bằng @metaforge/ui (shadcn/Tailwind tokens).
 * Không còn browser-default: Input/Textarea/Checkbox/Select(Radix)/Combobox(cmdk). Masked/readOnly
 * xử lý thống nhất. Link dùng services.searchLink (combobox popover). Giữ MASK để selfcheck logic ổn.
 */
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, MapPin, Plus, TriangleAlert } from "lucide-react";
import { buildLinkFilters, formatDuration, getNumberFormatInfo, linkDisplay } from "@metaforge/core";
import {
  cn, Input, Textarea, Checkbox,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Popover, PopoverTrigger, PopoverContent,
  Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup,
  Button, useT,
} from "@metaforge/ui";
import type { FieldControlProps, LinkSearchOpts } from "./index.js";
import { loadRecentLinks, recordRecentLink } from "./recent-links.js";

/** Frappe search_link mặc định ~10 kết quả; nhiều hơn ⇒ gợi ý gõ thêm để thu hẹp. */
const LINK_PAGE_LENGTH = 10;

const MASK = "••••••";
const BLANK = "__blank__"; // Radix Select cấm value rỗng → sentinel

function labelId(p: FieldControlProps): string {
  return p.id ?? `mf-${p.field.fieldname}`;
}

function a11y(p: FieldControlProps) {
  return {
    "aria-describedby": p.describedBy,
    "aria-required": p.required || undefined,
    "aria-label": p.label,
  } as const;
}

function Masked() {
  const t = useT();
  return (
    <span className="mf-masked inline-flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground" aria-label={t("control.masked_label")} title={t("control.masked_title")}>
      {MASK}
    </span>
  );
}

export function TextControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  const type = p.field.fieldtype === "Password" ? "password" : p.field.fieldtype === "Phone" ? "tel" : "text";
  return (
    <Input
      id={labelId(p)}
      className="mf-control"
      type={type}
      value={(p.value as string) ?? ""}
      readOnly={p.readOnly}
      aria-invalid={p.error ? true : undefined}
      {...a11y(p)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
    />
  );
}

export function TextAreaControl(p: FieldControlProps) {
  if (p.parentDoctype === "Sales Option" && p.field.fieldname === "conditions") return <SalesOptionConditionsControl {...p} />;
  if (p.parentDoctype === "Pricing Rule" && p.field.fieldname === "conditions") return <PricingRuleConditionsControl {...p} />;
  if (p.masked) return <Masked />;
  return (
    <Textarea
      id={labelId(p)}
      className="mf-control"
      value={(p.value as string) ?? ""}
      readOnly={p.readOnly}
      rows={p.field.fieldtype === "Long Text" || p.field.fieldtype === "Code" ? 6 : 3}
      aria-invalid={p.error ? true : undefined}
      {...a11y(p)}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => p.onChange(e.target.value)}
    />
  );
}

type SalesOptionCondition = {
  field: string;
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number | string;
};

const SALES_OPTION_CONDITION_FIELDS = [
  { value: "billable_area_sqm", label: "Diện tích", unit: "m²" },
  { value: "height_m", label: "Chiều cao", unit: "m" },
  { value: "width_m", label: "Chiều rộng", unit: "m" },
  { value: "set_count", label: "Số bộ", unit: "bộ" },
] as const;

const SALES_OPTION_OPERATORS: Array<{ value: SalesOptionCondition["op"]; label: string }> = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
];

function salesOptionConditions(value: unknown): SalesOptionCondition[] {
  const raw = typeof value === "string" ? value.trim() : value;
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      .map((row) => ({
        field: typeof row.field === "string" ? row.field : "billable_area_sqm",
        op: SALES_OPTION_OPERATORS.some((operator) => operator.value === row.op) ? row.op as SalesOptionCondition["op"] : "gte",
        value: typeof row.value === "number" || typeof row.value === "string" ? row.value : "",
      }));
  } catch {
    return [];
  }
}

function salesOptionConditionField(field: string) {
  return SALES_OPTION_CONDITION_FIELDS.find((option) => option.value === field)
    ?? { value: field, label: field, unit: "" };
}

/** A small, safe editor for numeric Sales Option conditions; storage stays the generic JSON contract. */
export function SalesOptionConditionsControl(p: FieldControlProps) {
  const rows = salesOptionConditions(p.value);
  const commit = (next: SalesOptionCondition[]) => p.onChange(next.length ? JSON.stringify(next) : "");
  const readOnlySummary = rows.map((row) => {
    const criterion = salesOptionConditionField(row.field);
    const operator = SALES_OPTION_OPERATORS.find((candidate) => candidate.value === row.op)?.label ?? row.op;
    return `${criterion.label} ${operator} ${row.value}${criterion.unit ? ` ${criterion.unit}` : ""}`;
  });

  if (p.masked) return <Masked />;
  if (p.readOnly) {
    return <div id={labelId(p)} className="mf-control min-h-9 rounded-md border border-input bg-muted px-3 py-2 text-sm">{readOnlySummary.length ? readOnlySummary.join(" và ") : "Không giới hạn"}</div>;
  }

  return (
    <div id={labelId(p)} className="mf-control space-y-2 rounded-md border border-input bg-muted/20 p-2" aria-describedby={p.describedBy} aria-label={p.label}>
      {rows.map((row, index) => {
        const criterion = salesOptionConditionField(row.field);
        return (
          <div key={`${row.field}-${index}`} className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(5rem,8rem)_auto_auto] items-center gap-2 max-sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(4.5rem,1fr)_auto]">
            <Select value={criterion.value} onValueChange={(field) => commit(rows.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, field } : candidate))}>
              <SelectTrigger aria-label={`Chỉ tiêu điều kiện ${index + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>{SALES_OPTION_CONDITION_FIELDS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={row.op} onValueChange={(op) => commit(rows.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, op: op as SalesOptionCondition["op"] } : candidate))}>
              <SelectTrigger aria-label={`Dấu so sánh điều kiện ${index + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>{SALES_OPTION_OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" inputMode="decimal" step="any" aria-label={`Giá trị điều kiện ${index + 1}`} value={row.value} onChange={(event) => commit(rows.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, value: event.target.value } : candidate))} />
            <span className="min-w-7 text-sm text-muted-foreground">{criterion.unit}</span>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => commit(rows.filter((_, candidateIndex) => candidateIndex !== index))}>Bỏ</Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => commit([...rows, { field: "billable_area_sqm", op: "gte", value: "" }])}>Thêm điều kiện</Button>
      <p className="text-xs text-muted-foreground">Tất cả điều kiện đều phải đúng thì phương án mới được áp dụng.</p>
    </div>
  );
}

type PricingRuleCondition = {
  field: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number | string;
};

const PRICING_RULE_CONDITION_FIELDS = [
  { value: "sales_option", label: "Phương án bán", unit: "", numeric: false },
  { value: "price_variant", label: "Mã giá", unit: "", numeric: false },
  { value: "color", label: "Màu", unit: "", numeric: false },
  { value: "finish_type", label: "Bề mặt", unit: "", numeric: false },
  { value: "billable_area_sqm", label: "Diện tích tính tiền", unit: "m²", numeric: true },
  { value: "height_m", label: "Chiều cao", unit: "m", numeric: true },
  { value: "width_m", label: "Chiều rộng", unit: "m", numeric: true },
  { value: "length_m", label: "Chiều dài", unit: "m", numeric: true },
  { value: "set_count", label: "Số bộ", unit: "bộ", numeric: true },
] as const;

function pricingRuleConditions(value: unknown): PricingRuleCondition[] {
  const raw = typeof value === "string" ? value.trim() : value;
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      .map((row) => {
        const field = typeof row.field === "string" ? row.field : "billable_area_sqm";
        return {
          field: field === "area_sqm" ? "billable_area_sqm" : field,
          operator: SALES_OPTION_OPERATORS.some((operator) => operator.value === (row.operator ?? row.op))
            ? (row.operator ?? row.op) as PricingRuleCondition["operator"]
            : "gte",
          value: typeof row.value === "number" || typeof row.value === "string" ? row.value : "",
        };
      });
  } catch {
    return [];
  }
}

function pricingRuleConditionField(field: string) {
  return PRICING_RULE_CONDITION_FIELDS.find((option) => option.value === field)
    ?? { value: field, label: field, unit: "", numeric: false };
}

/** Friendly authoring for the generic server-side Pricing Rule condition array. */
export function PricingRuleConditionsControl(p: FieldControlProps) {
  const rows = pricingRuleConditions(p.value);
  const commit = (next: PricingRuleCondition[]) => p.onChange(next.length ? JSON.stringify(next) : "");
  const summary = rows.map((row) => {
    const criterion = pricingRuleConditionField(row.field);
    const operator = SALES_OPTION_OPERATORS.find((candidate) => candidate.value === row.operator)?.label ?? row.operator;
    return `${criterion.label} ${operator} ${row.value}${criterion.unit ? ` ${criterion.unit}` : ""}`;
  });

  if (p.masked) return <Masked />;
  if (p.readOnly) {
    return <div id={labelId(p)} className="mf-control min-h-9 rounded-md border border-input bg-muted px-3 py-2 text-sm">{summary.length ? summary.join(" và ") : "Không có điều kiện thêm"}</div>;
  }

  return (
    <div id={labelId(p)} className="mf-control space-y-2 rounded-md border border-input bg-muted/20 p-2" aria-describedby={p.describedBy} aria-label={p.label}>
      {rows.map((row, index) => {
        const criterion = pricingRuleConditionField(row.field);
        const operators = criterion.numeric ? SALES_OPTION_OPERATORS : SALES_OPTION_OPERATORS.filter((operator) => operator.value === "eq" || operator.value === "neq");
        const safeOperator = operators.some((operator) => operator.value === row.operator) ? row.operator : "eq";
        return (
          <div key={`${row.field}-${index}`} className="grid grid-cols-[minmax(8rem,1fr)_4.5rem_minmax(7rem,9rem)_auto_auto] items-center gap-2 max-sm:grid-cols-[minmax(7rem,1fr)_3.5rem_minmax(6rem,1fr)_auto_auto]">
            <Select value={criterion.value} onValueChange={(field) => {
              const nextCriterion = pricingRuleConditionField(field);
              const nextOperator = nextCriterion.numeric ? row.operator : (row.operator === "eq" || row.operator === "neq" ? row.operator : "eq");
              commit(rows.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, field, operator: nextOperator } : candidate));
            }}>
              <SelectTrigger aria-label={`Chỉ tiêu điều kiện ${index + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>{PRICING_RULE_CONDITION_FIELDS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={safeOperator} onValueChange={(operator) => commit(rows.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, operator: operator as PricingRuleCondition["operator"] } : candidate))}>
              <SelectTrigger aria-label={`Dấu so sánh điều kiện ${index + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>{operators.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type={criterion.numeric ? "number" : "text"} inputMode={criterion.numeric ? "decimal" : undefined} step={criterion.numeric ? "any" : undefined} aria-label={`Giá trị điều kiện ${index + 1}`} value={row.value} onChange={(event) => commit(rows.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, value: event.target.value } : candidate))} />
            <span className="min-w-7 text-sm text-muted-foreground">{criterion.unit}</span>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => commit(rows.filter((_, candidateIndex) => candidateIndex !== index))}>Bỏ</Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => commit([...rows, { field: "billable_area_sqm", operator: "gte", value: "" }])}>Thêm điều kiện</Button>
      <p className="text-xs text-muted-foreground">Tất cả điều kiện đều phải đúng thì chính sách mới được áp dụng.</p>
    </div>
  );
}

export function NumberControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  if (p.field.ui_control === "time_of_day_minutes") return <MinuteOfDayControl {...p} />;
  if (p.field.ui_control === "duration_minutes") return <MinuteDurationControl {...p} />;
  if (p.field.ui_control === "coordinate_pair") return <CoordinatePairControl {...p} />;
  const step = p.field.fieldtype === "Int" ? "1" : "any";
  const suffix = p.field.fieldtype === "Percent" ? "%" : undefined;
  // Bảng bán hàng dùng VNĐ: giá và thành tiền luôn là số nguyên. Chuẩn hoá ngay
  // tại control để dữ liệu nhập tay cũng không còn phần thập phân.
  const compactVnd = p.compact && p.field.fieldtype === "Currency";
  const numericProps: FieldControlProps = compactVnd
    ? {
        ...p,
        field: { ...p.field, precision: "0" },
        onChange: (value) => p.onChange(value === null || value === "" ? null : Math.round(Number(value))),
      }
    : p;

  /**
   * Ô CHỈ ĐỌC hiện chữ đã định dạng, không dùng ô nhập kiểu number của trình duyệt.
   *
   * Chuẩn HTML không cho ô nhập kiểu number hiển thị dấu phân cách hàng nghìn — tổng tiền hiện nguyên
   * "75982503967,3". Con số đó vô dụng: không đọc được bậc, không soát được đúng sai.
   * Ô còn SỬA ĐƯỢC thì vẫn giữ input number (gõ và dùng phím mũi tên tăng/giảm mới thuận).
   */
  const fmt = p.services?.fmt;
  if (p.readOnly && fmt && p.value !== null && p.value !== undefined && p.value !== "") {
    const ft = p.field.fieldtype;
    const rawPrecision = numericProps.field.precision;
    const prec = rawPrecision !== undefined && rawPrecision !== null && rawPrecision !== ""
      ? Number(rawPrecision) : undefined;
    // Trong bảng con, đơn vị tiền đã được ghi rõ ở tiêu đề cột. Không lặp ký hiệu
    // trong ô vì cột hẹp sẽ đẩy "đ" xuống dòng, làm lệch cả hàng.
    const text = ft === "Currency" && !p.compact ? fmt.currency(p.value as number, prec)
      : ft === "Int" ? fmt.number(p.value as number, 0)
      : fmt.number(p.value as number, prec);
    return (
      <div
        id={labelId(p)}
        className="mf-control flex h-8 items-center justify-end rounded-md border border-input bg-muted px-3 text-right text-[13px] tabular-nums"
      >
        {text}{suffix ?? ""}
      </div>
    );
  }

  // `step` chỉ còn nghĩa với ô number; ô tiền/số thực dùng ô văn bản có nhóm hàng nghìn.
  if (fmt && p.field.fieldtype !== "Int") return <GroupedNumberInput {...numericProps} suffix={suffix} />;

  return (
    <div className="relative">
      <Input
        id={labelId(p)}
        className={cn("mf-control text-right tabular-nums", suffix && "pr-8")}
        type="number"
        inputMode={p.field.fieldtype === "Int" ? "numeric" : "decimal"}
        step={step}
        value={p.value === null || p.value === undefined ? "" : (p.value as number)}
        readOnly={p.readOnly}
        aria-invalid={p.error ? true : undefined}
        {...a11y(p)}
        onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}

/**
 * Latitude input with an explicit browser-geolocation autofill action.
 * `field.options` names the longitude sibling; storage remains two ordinary Floats.
 */
export function CoordinatePairControl(p: FieldControlProps) {
  const t = useT();
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const longitudeField = String(p.field.options ?? "").trim();

  const locate = () => {
    setMessage("");
    if (!navigator.geolocation) {
      setMessage(t("control.geo_unsupported"));
      return;
    }
    if (!longitudeField || !p.setFieldValue) {
      setMessage(t("control.geo_pair_misconfigured"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        p.onChange(latitude);
        p.setFieldValue?.(longitudeField, longitude);
        setMessage(t("control.geo_pair_success").replace("{accuracy}", String(Math.round(position.coords.accuracy))));
        setLocating(false);
      },
      (error) => {
        const key = error.code === 1 ? "control.geo_permission_denied"
          : error.code === 3 ? "control.geo_timeout"
          : "control.geo_unavailable";
        setMessage(t(key));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  if (p.masked) return <Masked />;
  return (
    <div className="space-y-2">
      <Input
        id={labelId(p)}
        className="mf-control text-right tabular-nums"
        type="number"
        inputMode="decimal"
        step="any"
        value={p.value === null || p.value === undefined ? "" : (p.value as number)}
        readOnly={p.readOnly}
        aria-invalid={p.error ? true : undefined}
        {...a11y(p)}
        onChange={(event: ChangeEvent<HTMLInputElement>) => p.onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
      {!p.readOnly ? (
        <Button type="button" variant="outline" className="min-h-11 w-full gap-2 sm:w-auto" disabled={locating} onClick={locate}>
          {locating ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          {locating ? t("control.geo_locating") : t("control.geo_locate")}
        </Button>
      ) : null}
      {message ? <p className="text-xs text-muted-foreground" aria-live="polite">{message}</p> : null}
    </div>
  );
}

function minuteValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function formatMinuteOfDay(value: unknown): string {
  const total = minuteValue(value);
  return total === null
    ? ""
    : `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function parseMinuteOfDay(text: string): number | null {
  const value = text.trim();
  let hours: number;
  let minutes: number;
  const colon = value.match(/^(\d{1,2}):(\d{2})$/);
  const compact = value.match(/^(\d{3,4})$/);
  if (colon) {
    hours = Number(colon[1]);
    minutes = Number(colon[2]);
  } else if (compact) {
    const digits = compact[1] ?? "";
    hours = Number(digits.slice(0, -2));
    minutes = Number(digits.slice(-2));
  } else {
    return null;
  }
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : null;
}

/** Integer minutes since midnight in storage, familiar HH:mm at the form boundary. */
export function MinuteOfDayControl(p: FieldControlProps) {
  const display = formatMinuteOfDay(p.value);
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(display); }, [display, editing]);

  if (p.readOnly) {
    return <span id={labelId(p)} className="mf-control text-sm tabular-nums">{display || "—"}</span>;
  }

  return (
    <Input
      id={labelId(p)}
      className="mf-control tabular-nums"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder="HH:mm"
      title="Nhập giờ theo định dạng 24 giờ HH:mm"
      value={text}
      aria-invalid={p.error || (editing && text !== "" && parseMinuteOfDay(text) === null) ? true : undefined}
      {...a11y(p)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value.replace(/[^\d:]/g, "").slice(0, 5);
        setText(next);
        const parsed = parseMinuteOfDay(next);
        if (parsed !== null) p.onChange(parsed);
      }}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (!text) {
          p.onChange(null);
          return;
        }
        const parsed = parseMinuteOfDay(text);
        if (parsed === null) setText(display);
        else {
          p.onChange(parsed);
          setText(formatMinuteOfDay(parsed));
        }
      }}
    />
  );
}

/** Integer duration in storage, split into hours/minutes so operators never calculate it by hand. */
export function MinuteDurationControl(p: FieldControlProps) {
  const total = minuteValue(p.value) ?? 0;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (p.readOnly) {
    return (
      <span id={labelId(p)} className="mf-control text-sm tabular-nums">
        {p.value === null || p.value === undefined || p.value === "" ? "—" : `${hours} giờ ${minutes} phút`}
      </span>
    );
  }

  const commit = (part: "hours" | "minutes", raw: string) => {
    const value = Math.max(0, Math.round(Number(raw) || 0));
    p.onChange(part === "hours" ? value * 60 + minutes : hours * 60 + Math.min(value, 59));
  };

  return (
    <div id={labelId(p)} className="mf-duration flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Input
          type="number"
          min={0}
          value={hours}
          aria-label="Giờ"
          className="mf-control h-9 w-24 text-center tabular-nums"
          onChange={(e: ChangeEvent<HTMLInputElement>) => commit("hours", e.target.value)}
        />
        <span className="text-center text-[10px] text-muted-foreground">giờ</span>
      </div>
      <div className="flex flex-col gap-1">
        <Input
          type="number"
          min={0}
          max={59}
          value={minutes}
          aria-label="Phút"
          className="mf-control h-9 w-24 text-center tabular-nums"
          onChange={(e: ChangeEvent<HTMLInputElement>) => commit("minutes", e.target.value)}
        />
        <span className="text-center text-[10px] text-muted-foreground">phút</span>
      </div>
    </div>
  );
}

/**
 * Ô nhập số CÓ dấu phân cách hàng nghìn — ngay khi đang gõ.
 *
 * `<input type="number">` không hiển thị được dấu phân cách: đó là chuẩn HTML, không phải
 * thiếu sót của trình duyệt. Nên đơn giá 200000 hiện đúng như vậy, và người nhập phải tự
 * đếm số 0 để biết là hai trăm nghìn hay hai triệu. Với bảng giá cửa cuốn — nơi 1.014.000
 * và 10.140.000 chỉ khác nhau một chữ số — đó là lỗi nhập liệu chờ xảy ra.
 *
 * Đổi sang ô văn bản và tự nhóm. Ba chỗ phải làm đúng, nếu không ô nhập sẽ khó dùng hơn cả
 * khi không có dấu phân cách:
 *
 * 1. CON TRỎ. Chèn thêm dấu chấm làm chuỗi dài ra, nên con trỏ phải đặt lại theo SỐ CHỮ SỐ
 *    đứng trước nó, không theo vị trí ký tự. Không làm thì mỗi lần vượt mốc nghìn, con trỏ
 *    nhảy về sai chỗ và người dùng gõ tiếp vào giữa số.
 * 2. ĐANG GÕ DỞ. "1.234," là trạng thái hợp lệ khi người ta sắp gõ phần thập phân. Chuẩn
 *    hoá ngay lúc đó sẽ nuốt mất dấu phẩy vừa gõ.
 * 3. GIÁ TRỊ GỬI RA NGOÀI vẫn là số thuần — form và server không bao giờ thấy dấu phân cách.
 */
function GroupedNumberInput(p: FieldControlProps & { suffix?: string }) {
  const fmt = p.services!.fmt!;
  const info = getNumberFormatInfo(fmt.config.numberFormat);
  const group = info.group || "";
  const decimal = info.decimal || ".";
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  /** Vị trí con trỏ TUYỆT ĐỐI, cho lần chèn dấu thập phân — nó không thêm chữ số nào. */
  const caretExact = useRef<number | null>(null);
  const rawPrecision = p.field.precision;
  const precision = rawPrecision !== undefined && rawPrecision !== null && rawPrecision !== ""
    ? Number(rawPrecision) : undefined;

  const digitsBefore = (text: string, at: number) => text.slice(0, at).replace(/\D/g, "").length;
  const groupDigits = (raw: string) => (group ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, group) : raw);

  /** "1.234.567,8" → "1234567.8". Chuỗi rỗng → null, để phân biệt "chưa nhập" với số 0. */
  const parse = (text: string): number | null => {
    // `split/join` chứ không phải regex: dấu nhóm là "." trong định dạng Việt Nam, và một
    // regex chưa escape sẽ khớp MỌI ký tự — xoá sạch cả chữ số.
    const cleaned = text.split(group).join("").replace(decimal, ".").replace(/[^\d.-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  };

  /** Số → chuỗi đã nhóm. Giữ nguyên phần thập phân người dùng đang gõ, không tự làm tròn. */
  const display = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "";
    const numeric = Number(value);
    const normalized = Number.isFinite(numeric) && Number.isInteger(precision) && precision! >= 0
      ? numeric.toFixed(precision!)
      : String(value);
    const [whole, fraction] = normalized.split(".");
    const sign = whole?.startsWith("-") ? "-" : "";
    const grouped = groupDigits((whole ?? "").replace("-", ""));
    return sign + grouped + (fraction === undefined ? "" : decimal + fraction);
  };

  // Trạng thái chuỗi sống trong ô, để "1.234," giữ được dấu phẩy đang gõ dở.
  const [text, setText] = useState(() => display(p.value));
  const [editing, setEditing] = useState(false);
  // Giá trị từ ngoài vào (tải bản ghi, tính lại thành tiền) phải hiện ngay — trừ khi người
  // dùng đang gõ, vì lúc đó ghi đè sẽ giật mất thứ họ vừa nhập.
  useEffect(() => { if (!editing) setText(display(p.value)); }, [p.value, editing]);

  useEffect(() => {
    if (caretExact.current !== null && ref.current) {
      const at = caretExact.current;
      caretExact.current = null;
      caret.current = null;
      ref.current.setSelectionRange(at, at);
      return;
    }
    if (caret.current === null || !ref.current) return;
    const wanted = caret.current;
    caret.current = null;
    let position = 0, seen = 0;
    while (position < text.length && seen < wanted) { if (/\d/.test(text[position]!)) seen += 1; position += 1; }
    ref.current.setSelectionRange(position, position);
  }, [text]);

  /**
   * Phím `.` và `,` LUÔN là dấu thập phân, bất kể định dạng site dùng dấu nào.
   *
   * Không có luật này thì trong định dạng Việt Nam (`#.###,##`, nhóm là dấu chấm) gõ "3.5"
   * ra **35** — dấu chấm bị hiểu là dấu phân nhóm rồi bỏ đi. Im lặng, và sai một bậc mười.
   * Bắt được đúng ở ô "rộng cắt lá": gõ 3.5 m, máy đọc 35 m. Lần đó nó lộ ra vì kho không
   * có cây nhôm 35 m nên bị từ chối; ở ô đơn giá thì 1.5 thành 15 và không có gì báo cả.
   *
   * Người dùng KHÔNG BAO GIỜ tự gõ dấu phân nhóm — ô này tự chèn. Nên hai phím đó chỉ còn
   * một nghĩa duy nhất, và gán đúng nghĩa đó là chuyện của ô nhập, không phải của người gõ.
   */
  const typeDecimal = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "." && event.key !== ",") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? start;
    const kept = text.slice(0, start) + text.slice(end);
    // Đã có dấu thập phân rồi thì phím này không làm gì — hai dấu thì không còn là số.
    if (kept.includes(decimal)) return;
    const next = text.slice(0, start) + decimal + text.slice(end);
    caretExact.current = start + decimal.length;
    setText(next);
    p.onChange(parse(next));
  };

  return (
    <div className="relative">
      <Input
        ref={ref}
        id={labelId(p)}
        className={cn("mf-control text-right tabular-nums", p.suffix && "pr-8")}
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={p.readOnly}
        aria-invalid={p.error ? true : undefined}
        {...a11y(p)}
        onFocus={() => setEditing(true)}
        onBlur={() => { setEditing(false); setText(display(p.value)); }}
        onKeyDown={typeDecimal}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value;
          const before = digitsBefore(raw, e.target.selectionStart ?? raw.length);
          const parsed = parse(raw);
          // Hiển thị theo CHUỖI người dùng vừa gõ, không theo số đã parse — nếu không thì
          // dấu thập phân cuối cùng ("1.234,") biến mất ngay khi vừa gõ.
          const [whole = "", ...rest] = raw.split(group).join("").split(decimal);
          const sign = whole.startsWith("-") ? "-" : "";
          const next = sign + groupDigits(whole.replace(/[^\d]/g, "")) + (rest.length ? decimal + rest.join("").replace(/[^\d]/g, "") : "");
          caret.current = before;
          setText(next);
          p.onChange(parsed);
        }}
      />
      {p.suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{p.suffix}</span> : null}
    </div>
  );
}

const DUR_DAY = 86400, DUR_HOUR = 3600, DUR_MIN = 60;

/** Duration — trước đây dùng thẳng NumberControl (nhập giây thô, không ai đếm tay quy đổi ra ngày/giờ
 * được). Widget d/h/m/s đầy đủ, quy về GIÂY (canonical, đúng như Frappe lưu) khi đổi bất kỳ ô nào. */
export function DurationControl(p: FieldControlProps) {
  const t = useT();
  if (p.masked) return <Masked />;
  const total = Math.max(0, Math.round(Number(p.value) || 0));
  const days = Math.floor(total / DUR_DAY);
  const hours = Math.floor((total % DUR_DAY) / DUR_HOUR);
  const minutes = Math.floor((total % DUR_HOUR) / DUR_MIN);
  const seconds = total % DUR_MIN;

  if (p.readOnly) {
    return <span id={labelId(p)} className="mf-control mf-duration-readonly text-sm tabular-nums">{p.value ? formatDuration(total) : "—"}</span>;
  }

  const commit = (part: "d" | "h" | "m" | "s", raw: string) => {
    const v = Math.max(0, Math.round(Number(raw) || 0));
    const d = part === "d" ? v : days, h = part === "h" ? v : hours, m = part === "m" ? v : minutes, s = part === "s" ? v : seconds;
    p.onChange(d * DUR_DAY + h * DUR_HOUR + m * DUR_MIN + s);
  };

  const box = (part: "d" | "h" | "m" | "s", value: number, label: string, max?: number) => (
    <div key={part} className="flex flex-col items-center gap-0.5">
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        aria-label={label}
        className="mf-control h-9 w-14 text-center tabular-nums"
        onChange={(e: ChangeEvent<HTMLInputElement>) => commit(part, e.target.value)}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <div id={labelId(p)} className="mf-duration flex items-end gap-1.5">
      {box("d", days, t("control.duration_days"))}
      {box("h", hours, t("control.duration_hours"), 23)}
      {box("m", minutes, t("control.duration_minutes"), 59)}
      {box("s", seconds, t("control.duration_seconds"), 59)}
    </div>
  );
}

export function CheckControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  return (
    <div className="flex h-9 items-center">
      <Checkbox
        id={labelId(p)}
        // `!size-4` giữ ô tick luôn vuông 16px, kể cả khi người dùng chọn mật độ
        // "chạm" (quy tắc chung tăng chiều cao button cho vùng bấm, không áp dụng cho glyph).
        className="mf-control !size-4"
        checked={Boolean(p.value)}
        disabled={p.readOnly}
        aria-invalid={p.error ? true : undefined}
        {...a11y(p)}
        onCheckedChange={(v) => p.onChange(v ? 1 : 0)}
      />
    </div>
  );
}

export function SelectControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  const options = (p.field.options ?? "").split("\n");
  const val = (p.value as string) ?? "";
  // GIÁ TRỊ giữ nguyên gốc (đúng thứ ghi xuống DB), chỉ NHÃN lấy bản dịch. Nếu dịch cả giá trị
  // thì doc cũ không khớp option nào (ô hiện rỗng) và lựa chọn mới ghi sai chuỗi xuống DB.
  const labels = p.field.optionLabels;
  const labelOf = (o: string) => labels?.[o] ?? o;
  return (
    <Select value={val === "" ? BLANK : val} disabled={p.readOnly} onValueChange={(v) => p.onChange(v === BLANK ? "" : v)}>
      <SelectTrigger id={labelId(p)} className="mf-control" aria-invalid={p.error ? true : undefined} {...a11y(p)}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o, i) => (
          <SelectItem key={i} value={o === "" ? BLANK : o}>{o === "" ? "—" : labelOf(o)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Frappe Datetime "YYYY-MM-DD HH:mm:ss" ↔ HTML datetime-local "YYYY-MM-DDTHH:mm". */
function toDatetimeLocal(v: string): string {
  if (!v) return "";
  return v.replace(" ", "T").slice(0, 16);
}
function fromDatetimeLocal(v: string): string {
  if (!v) return "";
  const s = v.replace("T", " ");
  return s.length === 16 ? `${s}:00` : s;
}

export function DateControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  const isDatetime = p.field.fieldtype === "Datetime";
  const type = isDatetime ? "datetime-local" : p.field.fieldtype === "Time" ? "time" : "date";
  const raw = (p.value as string) ?? "";
  // Control KHÔNG tự chặn bề rộng. Bề rộng của một ô do form quyết (`basisClass`) hoặc do cột
  // của bảng quyết (`colgroup`) — chặn thêm ở đây là con số thứ hai phải nhớ giữ khớp, và nó
  // đã lệch thật: 16rem ở đây trong khi form cấp 14rem.
  return (
    <Input
      id={labelId(p)}
      className="mf-control"
      type={type}
      value={isDatetime ? toDatetimeLocal(raw) : raw}
      readOnly={p.readOnly}
      aria-invalid={p.error ? true : undefined}
      {...a11y(p)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(isDatetime ? fromDatetimeLocal(e.target.value) : e.target.value)}
    />
  );
}

export function ColorControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  return (
    <Input
      id={labelId(p)}
      className="mf-control h-9 w-16 cursor-pointer p-1"
      type="color"
      value={(p.value as string) || "#000000"}
      disabled={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
    />
  );
}

export function ReadOnlyControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  return (
    <span id={labelId(p)} className="mf-control mf-readonly inline-flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
      {p.value === null || p.value === undefined ? "" : String(p.value)}
    </span>
  );
}

/** DEV-ONLY escape hatch cho fallback free-text khi thiếu service/config (P1-LINK-01) — PHẢI bật
 * tường minh (vd trong 1 script kiểm thử cục bộ), KHÔNG BAO GIỜ mặc định true. Sản phẩm thật (kể cả
 * app do create-metaforge-app sinh ra) không set cờ này ⇒ luôn fail-visible, không âm thầm cho gõ
 * tự do vào 1 field lẽ ra phải là quan hệ ràng buộc. */
function linkFreeTextDevFlagEnabled(): boolean {
  return typeof globalThis !== "undefined" && (globalThis as { __MF_LINK_ALLOW_FREE_TEXT__?: boolean }).__MF_LINK_ALLOW_FREE_TEXT__ === true;
}

function LinkDiagnostic({ id, tone, children }: { id: string; tone: "error" | "waiting"; children: ReactNode }) {
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "mf-control mf-link flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm",
        tone === "error" ? "border-destructive/50 bg-destructive/5 text-destructive" : "border-input bg-muted/40 text-muted-foreground",
      )}
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </div>
  );
}

/**
 * Link/Dynamic Link (P0-09 + P1-LINK-01) — combobox typeahead qua services.searchLink với:
 *  - filters: dựng từ field.link_filters + ngữ cảnh doc (buildLinkFilters, hỗ trợ eval: an toàn).
 *  - referenceDoctype: parentDoctype → server phân quyền/user-permission theo tham chiếu.
 *  - trang đầu: page_length + gợi ý "gõ thêm để thu hẹp" khi chạm trần — ĐÂY KHÔNG PHẢI phân trang
 *    thật (không có "tải thêm"/next-page); chỉ lấy trang đầu, giống Frappe search_link mặc định.
 *  - cancellation: AbortController + seq-guard chống race (kết quả cũ KHÔNG đè kết quả mới).
 * 3 trạng thái KHÔNG render combobox — KHÁC NHAU, không còn gộp chung 1 input tự do như trước:
 *  - Dynamic Link CHƯA chọn doctype nguồn: BÌNH THƯỜNG (chờ user), disable + hướng dẫn.
 *  - Static Link thiếu `options` (lỗi cấu hình DocType): chẩn đoán rõ, KHÔNG sửa được.
 *  - Thiếu `services.searchLink` lúc runtime (app quên tiêm — lỗi hạ tầng): chẩn đoán rõ, KHÔNG sửa được.
 * Free-text chỉ còn sau cờ dev tường minh (linkFreeTextDevFlagEnabled) — KHÔNG mặc định.
 */
export function LinkControl(p: FieldControlProps) {
  const t = useT();
  const [creatingFromField, setCreatingFromField] = useState(false);
  if (p.masked) return <Masked />;
  const isDynamic = p.field.fieldtype === "Dynamic Link";
  const target = p.linkTarget ?? (isDynamic ? undefined : p.field.options);
  const search = p.services?.searchLink;
  const value = (p.value as string) ?? "";
  const id = labelId(p);
  const devFreeText = linkFreeTextDevFlagEnabled();

  if (isDynamic && !target) {
    // Chưa chọn doctype nguồn (field.options trỏ tới field kia) — trạng thái CHỜ bình thường, không
    // phải lỗi: khoá control + hướng dẫn thay vì cho gõ tự do (giá trị sẽ vô nghĩa nếu chưa rõ đích).
    return (
      <LinkDiagnostic id={id} tone="waiting">
        {t("control.link_choose")} "{p.field.options || t("control.link_reference_field")}" {t("control.link_choose_suffix")}
      </LinkDiagnostic>
    );
  }
  if (!target) {
    // Static Link thiếu `options` trong metadata DocType — LỖI CẤU HÌNH thật, không phải trạng thái chờ.
    if (devFreeText) {
      return (
        <Input id={id} className="mf-control mf-link" value={value} readOnly={p.readOnly} {...a11y(p)}
          aria-invalid={p.error ? true : undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)} />
      );
    }
    return (
      <LinkDiagnostic id={id} tone="error">
        {t("control.link_missing_target_prefix")} "{p.field.fieldname}" {t("control.link_missing_target_suffix")}
      </LinkDiagnostic>
    );
  }
  if (!search) {
    // target hợp lệ nhưng app không tiêm services.searchLink — lỗi hạ tầng (app quên wiring), không
    // phải "chưa cấu hình" — im lặng cho gõ tự do sẽ CHE MẤT lỗi thật này.
    if (devFreeText) {
      return (
        <Input id={id} className="mf-control mf-link" value={value} readOnly={p.readOnly} {...a11y(p)}
          aria-invalid={p.error ? true : undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)} />
      );
    }
    return (
      <LinkDiagnostic id={id} tone="error">
        {t("control.link_missing_service")}
      </LinkDiagnostic>
    );
  }

  const filters = buildLinkFilters(p.field, p.docValues);
  const fixedLinkTarget = target === "Tỉnh Thành" || target === "Phường Xã";
  const allowCreate = !fixedLinkTarget && p.field.allow_create !== false && p.field.allow_create !== 0;
  // Nút cộng cạnh ô Link là lối vào rõ ràng cho thao tác tạo danh mục ngay khi
  // đang nhập form. Dùng chính quickCreate trung tâm (và form/permission thật)
  // thay vì tự dựng form nhỏ tại control, nên sau khi lưu vẫn trả về đúng name
  // để chọn lại ở form đang mở.
  const canCreateFromField = allowCreate && Boolean(p.services?.quickCreate) && !p.readOnly && !p.compact;
  const createFromField = async () => {
    if (!p.services?.quickCreate || creatingFromField) return;
    setCreatingFromField(true);
    try {
      const name = await p.services.quickCreate(target);
      if (name) p.onChange(name);
    } finally {
      setCreatingFromField(false);
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <LinkCombobox
          id={id}
          value={value}
          target={target}
          search={search}
          resolveDisplay={p.services?.resolveDisplay}
          quickCreate={allowCreate ? p.services?.quickCreate : undefined}
          getMeta={p.services?.getMeta}
          filters={filters}
          referenceDoctype={p.parentDoctype}
          readOnly={p.readOnly}
          error={p.error}
          describedBy={p.describedBy}
          required={p.required}
          label={p.label}
          {...(p.compact ? { compact: true } : {})}
          onChange={(v) => p.onChange(v)}
        />
      </div>
      {canCreateFromField ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="!size-[34px] shrink-0"
          aria-label={`${t("control.link_create_new")} ${p.label ?? target}`}
          title={`${t("control.link_create_new")} ${p.label ?? target}`}
          disabled={creatingFromField}
          onClick={() => { void createFromField(); }}
        >
          {creatingFromField ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Export ra ngoài để MÀN NGHIỆP VỤ TỰ VIẾT cũng dùng đúng control Link này, thay vì mỗi màn tự
 * chế một ô tìm kiếm riêng. Tự chế thì mất hết: "+ Tạo mới", danh sách gần đây, lọc theo quyền
 * và User Permission phía server, chống race khi gõ nhanh, và cả các bản vá giao diện về sau.
 */
export function LinkCombobox({
  id, value, target, search, resolveDisplay, quickCreate, getMeta, filters, referenceDoctype, readOnly, error, describedBy, required, label, compact, onChange,
}: {
  id: string;
  value: string;
  target: string;
  search: NonNullable<FieldControlProps["services"]>["searchLink"];
  resolveDisplay?: NonNullable<FieldControlProps["services"]>["resolveDisplay"];
  quickCreate?: NonNullable<FieldControlProps["services"]>["quickCreate"];
  /** Chỉ để lấy NHÃN của doctype đích cho nút "Tạo mới …". Có cache ở adapter. */
  getMeta?: NonNullable<FieldControlProps["services"]>["getMeta"];
  filters?: LinkSearchOpts["filters"];
  referenceDoctype?: string;
  readOnly?: boolean;
  error?: string;
  describedBy?: string;
  required?: boolean;
  label?: string;
  /** Ô trong bảng: bỏ phần mã in cạnh tên cho đỡ chật. */
  compact?: boolean;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const [opts, setOpts] = useState<Array<{ value: string; description?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  // mô tả (title) của giá trị đang chọn — hiển thị cạnh id ở nút đóng.
  const [pickedDesc, setPickedDesc] = useState<string | undefined>();
  const [recent, setRecent] = useState<Array<{ value: string; description?: string }>>([]);
  const seqRef = useRef(0); // seq-guard: chỉ nhận kết quả của request mới nhất
  // filters có thể là object mới mỗi render → chốt bằng chuỗi để dep ổn định.
  const filtersKey = filters ? JSON.stringify(filters) : "";

  useEffect(() => { if (open) setRecent(loadRecentLinks(target)); }, [open, target]);

  /**
   * Nhãn của doctype ĐÍCH, cho nút "Tạo mới …".
   *
   * Trước đây nút in thẳng `target`, tức là TÊN KỸ THUẬT: giữa một giao diện tiếng Việt
   * hiện ra "Tạo mới Material Request", "Tạo mới Price List". Nhãn có sẵn trong metadata
   * và `getMeta` có cache ở adapter, nên đây là một lượt đọc cho mỗi doctype — chỉ chạy
   * khi popover MỞ và khi thật sự có nút tạo nhanh.
   */
  const [targetLabel, setTargetLabel] = useState<string>();
  useEffect(() => {
    if (!open || !quickCreate || !getMeta) return;
    let alive = true;
    void getMeta(target)
      .then((meta) => { if (alive && meta?.label) setTargetLabel(meta.label); })
      // Không đọc được metadata thì lùi về tên kỹ thuật — xấu, nhưng vẫn bấm được.
      .catch(() => { /* fallback target */ });
    return () => { alive = false; };
  }, [open, quickCreate, getMeta, target]);

  useEffect(() => {
    if (!value || !resolveDisplay) { if (!value) setPickedDesc(undefined); return; }
    let alive = true;
    void resolveDisplay(target, value).then((r) => { if (alive) setPickedDesc(r.label); }).catch(() => { /* fallback value */ });
    return () => { alive = false; };
  }, [value, target, resolveDisplay]);

  useEffect(() => {
    if (!open) return;
    const seq = ++seqRef.current;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void search!(target, txt, { filters, referenceDoctype, pageLength: LINK_PAGE_LENGTH, signal: ac.signal })
        .then((r) => {
          if (seq !== seqRef.current) return; // đã có request mới hơn → bỏ kết quả cũ (chống stale-overwrite)
          setOpts(r);
        })
        .catch(() => {
          if (seq !== seqRef.current || ac.signal.aborted) return;
          setFailed(true);
          setOpts([]);
        })
        .finally(() => {
          if (seq === seqRef.current) setLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      ac.abort(); // huỷ request đang bay khi phím mới/đóng popover
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txt, target, open, search, filtersKey, referenceDoctype]);

  const atCap = opts.length >= LINK_PAGE_LENGTH;
  // localStorage can outlive a deleted record or a permission change. Only show a recent value
  // after the current permission-filtered server result confirms it, then de-duplicate the list.
  const optionValues = new Set(opts.map((option) => option.value));
  const visibleRecent = !txt.trim() ? recent.filter((option) => optionValues.has(option.value)) : [];
  const recentValues = new Set(visibleRecent.map((option) => option.value));
  const visibleOptions = !txt.trim() ? opts.filter((option) => !recentValues.has(option.value)) : opts;

  /**
   * Kết quả ĐẦU TIÊN luôn được tô sáng sẵn, để gõ mã rồi Enter là CHỌN được.
   *
   * `shouldFilter={false}` vì lọc do máy chủ làm, và cmdk chỉ tự chọn mục đầu khi chính nó
   * lọc. Kết quả về bằng đường không đồng bộ nên danh sách thay ngay dưới chân nó, mục đang
   * chọn trỏ vào một `value` không còn tồn tại, và cmdk bỏ chọn tất cả — Enter lúc đó không
   * làm gì cả. Người nhập gõ đúng mã rồi Enter mà ô vẫn trống là hỏng đúng thao tác thường
   * dùng nhất, nên mục đang chọn được điều khiển từ đây thay vì phó mặc.
   *
   * Không bao giờ trỏ vào "＋ Tạo mới": Enter phải chọn cái đang có, tạo mới là việc phải
   * chủ động đi tới.
   */
  const firstValue = visibleRecent.length ? `recent-${visibleRecent[0]!.value}` : visibleOptions[0]?.value ?? "";
  const [active, setActive] = useState("");
  useEffect(() => { setActive(firstValue); }, [firstValue]);

  // Giống ERPNext "+ Create a new …" — gõ không khớp bản ghi nào có sẵn thì tạo nhanh ngay tại đây
  // (mở form tạo thật qua services.quickCreate, KHÔNG tự bịa field) thay vì bắt người dùng thoát ra
  // tạo riêng rồi quay lại gõ lại. Quyền tạo do chính form đó tự kiểm (fail-closed), không lặp ở đây.
  const handleCreate = async () => {
    if (!quickCreate || creating) return;
    setCreating(true);
    try {
      const name = await quickCreate(target);
      if (name) { onChange(name); setOpen(false); }
    } finally {
      setCreating(false);
    }
  };

  /** Một mục duy nhất, đặt được ở đầu hoặc ở cuối danh sách tuỳ có kết quả khớp hay không. */
  const createItem = (
    <CommandItem value={`__mf_create__${txt}`} disabled={creating} onSelect={handleCreate}>
      {creating ? <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 size-4 shrink-0" aria-hidden="true" />}
      {t("control.link_create_new")}{txt.trim() ? ` "${txt.trim()}"` : ` ${targetLabel ?? target}`}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          aria-label={label}
          title={pickedDesc && pickedDesc !== value ? pickedDesc : undefined}
          className={cn(
            // KHÔNG đặt `bg-accent` ở đây: `--accent` là mảng navy pha loãng dành cho trạng thái
            // ĐANG CHỌN. Ô Link tô sẵn accent thì một biểu mẫu chục ô Link trông như chục ô đang
            // được chọn, và mất luôn khả năng thể hiện trạng thái chọn thật. Nền để nguyên theo
            // `controlBase` (bề mặt `--card`), ranh giới ô do viền `--input` đảm nhiệm.
            "mf-control mf-link w-full justify-between font-normal",
            !value && "text-muted-foreground",
            error && "border-destructive",
          )}
        >
          <span className="min-w-0 truncate text-left">
            {value ? (pickedDesc || value) : t("control.link_placeholder")}
            {value && pickedDesc && pickedDesc !== value && !compact
              ? <span className="ml-1.5 text-xs text-muted-foreground">· {value}</span> : null}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/*
        `collisionPadding`: Radix giữ popover cách mép khung nhìn một khoảng, thay vì dán sát đáy
        màn hình khiến mấy mục cuối nằm ngay trên thanh tác vụ và bấm rất khó.

        CommandList là vùng cuộn duy nhất. Chiều cao của nó lấy theo phần màn hình Radix báo còn
        trống và chặn ở 22rem; ô tìm kiếm vì vậy luôn đứng yên trong khi danh sách cuộn độc lập.
      */}
      <PopoverContent
        className="w-[--radix-popover-trigger-width] overflow-hidden p-0"
        align="start"
        collisionPadding={12}
      >
        <Command shouldFilter={false} value={active} onValueChange={setActive} className="max-h-[var(--radix-popover-content-available-height)]">
          <div className="sticky top-0 z-10 bg-popover">
            <CommandInput placeholder={t("control.link_search_placeholder")} value={txt} onValueChange={setTxt} />
          </div>
          <CommandList className="max-h-[min(22rem,calc(var(--radix-popover-content-available-height)-2.75rem))] overflow-y-auto overflow-x-hidden overscroll-contain">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("control.link_searching")}
              </div>
            ) : failed ? (
              <div className="px-3 py-3 text-sm text-destructive" role="alert">{t("control.link_load_failed")}</div>
            ) : (
              <>
                {/* "+ Tạo mới" ở ĐẦU khi không tìm được gì, ở CUỐI khi có kết quả.
                    Để đầu là đúng cho trường hợp danh mục dài mà không có thứ cần: bắt cuộn hết
                    danh sách vô ích rồi mới thấy nút tạo là ngược đời.
                    Nhưng khi CÓ kết quả khớp thì để đầu là nguy hiểm: mục đầu danh sách được tô
                    sáng sẵn, nên gõ đúng mã có thật rồi Enter — thao tác tự nhiên nhất của người
                    nhập liệu — sẽ TẠO MỘT BẢN GHI TRÙNG thay vì chọn cái đang có. Thử trên tenant
                    thật: gõ "AL548" (mã có sẵn) thì mục sáng là "＋ Tạo mới AL548". Với danh mục
                    294 mặt hàng và người nhập gõ cả ngày, đó là cách sinh mã rác nhanh nhất. */}
                {quickCreate && opts.length === 0 && visibleRecent.length === 0 ? createItem : null}
                {/* Gần đây — chỉ khi ô tìm còn trống, đỡ gõ lại giá trị vừa dùng (client-only, không gọi server). */}
                {visibleRecent.length > 0 ? (
                  <CommandGroup heading={t("control.link_recent")}>
                    {visibleRecent.map((o) => (
                      <CommandItem key={`recent-${o.value}`} value={`recent-${o.value}`} onSelect={() => { onChange(o.value); setPickedDesc(o.description); recordRecentLink(target, o); setOpen(false); }}>
                        <Check className={cn("mr-2 size-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{linkDisplay(o).primary}</span>
                          {linkDisplay(o).secondary ? <span className="truncate text-xs text-muted-foreground">{linkDisplay(o).secondary}</span> : null}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {opts.length === 0 && !quickCreate ? <CommandEmpty>{t("control.link_no_results")}</CommandEmpty> : null}
                {visibleOptions.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => { onChange(o.value); setPickedDesc(o.description); recordRecentLink(target, o); setOpen(false); }}>
                    <Check className={cn("mr-2 size-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{linkDisplay(o).primary}</span>
                      {linkDisplay(o).secondary ? <span className="truncate text-xs text-muted-foreground">{linkDisplay(o).secondary}</span> : null}
                    </span>
                  </CommandItem>
                ))}
                {atCap ? <div className="px-3 py-2 text-xs text-muted-foreground">{t("control.link_more_hint_prefix")} {LINK_PAGE_LENGTH} {t("control.link_more_hint_suffix")}</div> : null}
                {quickCreate && (opts.length > 0 || visibleRecent.length > 0) ? (
                  <>
                    <div className="mx-1 my-1 h-px bg-border" />
                    {createItem}
                  </>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Fallback cho fieldtype chưa có control chuyên biệt — Input + nhãn cảnh báo. */
export function FallbackControl(p: FieldControlProps) {
  if (p.masked) return <Masked />;
  return (
    <Input
      id={labelId(p)}
      className="mf-control mf-fallback"
      type="text"
      title={`Chưa có control chuyên biệt cho ${p.field.fieldtype}`}
      value={p.value === null || p.value === undefined ? "" : String(p.value)}
      readOnly={p.readOnly}
      aria-invalid={p.error ? true : undefined}
      {...a11y(p)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
    />
  );
}
