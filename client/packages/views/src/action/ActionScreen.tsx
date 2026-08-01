/** @jsxImportSource react */
/**
 * ActionScreen — màn "điền form rồi chạy", dựng HOÀN TOÀN từ manifest.
 *
 * Action không phải CRUD một bản ghi: người dùng nhập điều kiện, xem trước tác động rồi mới
 * chạy thật. Kết quả có thể gồm KPI, nhiều bảng lịch sử và chứng từ vừa tạo; renderer phải
 * trình bày đủ các phần đó thay vì biến object thành JSON hoặc mảng thành [object Object].
 */
import { useMemo, useState, type ReactNode } from "react";
import type { AppAction, AppActionCall, AppActionField, DocField, Fieldtype } from "@metaforge/core";
import {
  Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";

type Values = Record<string, unknown>;
type ResultRecord = Record<string, unknown>;

const RESULT_LABELS: Record<string, string> = {
  supplier: "Nhà cung cấp",
  item_code: "Mã hàng",
  length_m: "Chiều dài (m)",
  theoretical_kg_per_m: "Trọng lượng định mức (kg/m)",
  delivered_bars: "Số cây nhận lần này",
  delivered_meters: "Số mét nhận lần này",
  delivered_barem_weight_kg: "Kg barem lần này",
  actual_weight_kg: "Kg thực cân",
  tolerance_pct: "Dung sai (%)",
  tolerance_source: "Nguồn dung sai",
  ordered_bars: "Tổng cây đã đặt",
  received_bars_before: "Đã nhận trước đó",
  delivered_bars_now: "Nhận lần này",
  received_bars_after: "Đã nhận sau lần này",
  tolerance_bars: "Dung sai (cây)",
  nominal_remaining_bars: "Còn nợ danh nghĩa (cây)",
  nominal_remaining_meters: "Còn nợ danh nghĩa (m)",
  minimum_additional_bars_to_settle: "Cần giao thêm tối thiểu (cây)",
  maximum_additional_bars_allowed: "Được giao thêm tối đa (cây)",
  minimum_additional_meters_to_settle: "Cần giao thêm tối thiểu (m)",
  maximum_additional_meters_allowed: "Được giao thêm tối đa (m)",
  purchase_order: "Đơn mua",
  order_date: "Ngày đặt",
  allocated_bars: "Trừ lần này (cây)",
  allocated_meters: "Trừ lần này (m)",
  barem_weight_kg: "Kg barem",
  kind: "Kiểu phân bổ",
  allocated_bars_now: "Trừ lần này (cây)",
  tolerance_min_total_bars: "Ngưỡng giao tối thiểu (cây)",
  tolerance_max_total_bars: "Ngưỡng giao tối đa (cây)",
  purchase_receipt: "Phiếu nhập",
  posting_at: "Ngày hàng về",
  supplier_invoice_no: "Phiếu giao NCC",
  qty_bar: "Số cây",
  total_length_m: "Tổng mét",
  color: "Màu",
  is_stamped: "Dập",
  note: "Diễn giải",
  rate: "Đơn giá",
  amount: "Thành tiền",
  warehouse: "Kho nhập",
  uom: "ĐVT",
  qty: "Số kg thực",
  theoretical_kg: "Kg barem",
  draft: "Trạng thái",
  message: "Diễn giải",
  name: "Mã chứng từ",
  doctype: "Loại chứng từ",
};

const TABLE_TITLES: Record<string, string> = {
  order_balances: "Đơn còn nợ",
  allocations: "Lịch sử trừ FIFO lần này",
  receipt_history: "Lịch sử hàng về",
  items: "Dòng phiếu nhập sẽ tạo",
};

const OBJECT_TITLES: Record<string, string> = {
  debt: "Công nợ giao hàng sau lần nhận",
};

const FIFO_TABLE_ORDER = ["order_balances", "allocations", "receipt_history", "items"];
const HIDDEN_KEYS = new Set(["_server_messages", "exc_type"]);
const OPEN_LINKS: Record<string, string> = {
  purchase_order: "Purchase Order",
  purchase_receipt: "Purchase Receipt",
};

function labelForKey(key: string): string {
  return RESULT_LABELS[key] ?? key.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

/** DocField tối thiểu để control chung render được — action field vốn đã là DocField trừ tên. */
function toDocField(field: AppActionField): DocField {
  return {
    fieldname: field.fieldname,
    label: field.label,
    fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}),
    ...(field.required ? { reqd: 1 as const } : {}),
    ...(field.default == null ? {} : { default: field.default }),
  };
}

function initialValues(action: AppAction): Values {
  const values: Values = {};
  for (const field of action.fields) if (field.default != null) values[field.fieldname] = field.default;
  return values;
}

/** Ô còn thiếu — kiểm ở đây để người dùng biết TRƯỚC khi lời gọi đi rồi quay về 422. */
function missingFields(action: AppAction, values: Values): AppActionField[] {
  return action.fields.filter((field) => {
    if (!field.required) return false;
    const value = values[field.fieldname];
    return value == null || value === "";
  });
}

export interface ActionScreenProps {
  action: AppAction;
  /** Mở một bản ghi từ bảng kết quả. Không truyền thì kết quả chỉ để đọc. */
  onOpen?: (doctype: string, name: string) => void;
}

export function ActionScreen({ action, onOpen }: ActionScreenProps) {
  const { adapter, registry, services, fmt } = useMetaForge();
  const [values, setValues] = useState<Values>(() => initialValues(action));
  const [preview, setPreview] = useState<unknown>();
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"preview" | "commit">();
  const missing = useMemo(() => missingFields(action, values), [action, values]);

  async function run(call: AppActionCall, phase: "preview" | "commit") {
    if (missing.length) { setError(`Còn thiếu: ${missing.map((field) => field.label).join(", ")}.`); return; }
    if (phase === "commit" && call.confirm && !window.confirm(call.confirm)) return;
    setBusy(phase);
    setError(undefined);
    try {
      const answer = await adapter.callPost<unknown>(call.method, values);
      if (phase === "preview") { setPreview(answer); setResult(undefined); }
      else { setResult(answer); setPreview(undefined); }
    } catch (caught) {
      // Câu từ chối nghiệp vụ là nội dung người dùng cần đọc, không đổi thành lỗi chung chung.
      setError(adapter.mapError(caught).message);
      if (phase === "preview") setPreview(undefined); else setResult(undefined);
    } finally {
      setBusy(undefined);
    }
  }

  const shown = result ?? preview;
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4" data-action-screen={action.name}>
      {action.description ? <p className="text-sm text-muted-foreground">{action.description}</p> : null}

      <section className="rounded-xl border bg-card p-4" aria-label="Thông tin thao tác">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {action.fields.map((field) => {
            const docField = toDocField(field);
            const Control = registry.resolve(docField.fieldtype);
            const id = `action-${action.name}-${field.fieldname}`;
            return (
              <div key={field.fieldname} className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id}>
                  {field.label}
                  {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
                </Label>
                {Control
                  ? <Control
                      field={docField}
                      value={values[field.fieldname] ?? ""}
                      onChange={(next: unknown) => setValues((previous) => ({ ...previous, [field.fieldname]: next }))}
                      id={id}
                      required={field.required}
                      services={services}
                      {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})}
                      docValues={values}
                    />
                  : <Input
                      id={id}
                      value={String(values[field.fieldname] ?? "")}
                      onChange={(event) => setValues((previous) => ({ ...previous, [field.fieldname]: event.target.value }))}
                    />}
                {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          {action.preview
            ? <Button variant="outline" disabled={Boolean(busy)} onClick={() => run(action.preview!, "preview")}>
                {busy === "preview" ? "Đang tính…" : action.preview.label}
              </Button>
            : null}
          <Button disabled={Boolean(busy)} onClick={() => run(action.commit, "commit")}>
            {busy === "commit" ? "Đang chạy…" : action.commit.label}
          </Button>
          {missing.length
            ? <span className="text-xs text-muted-foreground">Còn thiếu: {missing.map((field) => field.label).join(", ")}</span>
            : null}
        </div>
      </section>

      {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</div> : null}

      {shown != null
        ? <ActionResult
            value={shown}
            table={action.result_table}
            committed={result != null}
            format={(value: number) => fmt.number(value)}
            onOpen={onOpen}
          />
        : null}
    </div>
  );
}

function isPlainRecord(value: unknown): value is ResultRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function orderedTableEntries(record: ResultRecord, primary?: string): Array<[string, unknown[]]> {
  const arrays = Object.entries(record)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, value as unknown[]] as [string, unknown[]]);
  const hasFifoShape = FIFO_TABLE_ORDER.some((key) => arrays.some(([candidate]) => candidate === key));
  if (hasFifoShape) {
    return [...arrays].sort(([left], [right]) => {
      const leftIndex = FIFO_TABLE_ORDER.indexOf(left);
      const rightIndex = FIFO_TABLE_ORDER.indexOf(right);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });
  }
  if (!primary) return arrays;
  return [...arrays].sort(([left], [right]) => Number(right === primary) - Number(left === primary));
}

/**
 * Kết quả action có thể chứa scalar, object KPI và NHIỀU mảng lịch sử. Mỗi mảng được render
 * thành một bảng riêng; object được render thành summary cards. Nhờ đó API giàu dữ liệu không
 * còn bị UI làm mất thông tin chỉ vì manifest cũ chỉ có một `result_table`.
 */
function ActionResult({ value, table, committed, format, onOpen }: {
  value: unknown;
  table?: string;
  committed: boolean;
  format: (value: number) => string;
  onOpen?: (doctype: string, name: string) => void;
}) {
  if (!isPlainRecord(value)) {
    return <div className="rounded-xl border bg-card p-4 text-sm">{String(value)}</div>;
  }
  const record = value;
  const tables = orderedTableEntries(record, table);
  const objects = Object.entries(record).filter(([key, entry]) => !HIDDEN_KEYS.has(key) && isPlainRecord(entry));
  const scalars = Object.entries(record).filter(([key, entry]) =>
    !HIDDEN_KEYS.has(key)
    && key !== "message"
    && !Array.isArray(entry)
    && !isPlainRecord(entry)
    && !["doctype", "name", "purchase_receipt"].includes(key));

  // Chuẩn mới: doctype + name. FIFO cũ trả purchase_receipt nên vẫn mở được chứng từ mà không
  // bắt backend cũ phải đổi contract ngay trong một thay đổi UI.
  const openable = committed && typeof record.doctype === "string" && record.doctype
    && typeof record.name === "string" && record.name
    ? { doctype: record.doctype, name: record.name }
    : committed && typeof record.purchase_receipt === "string" && record.purchase_receipt
      ? { doctype: "Purchase Receipt", name: record.purchase_receipt }
      : null;

  return (
    <div className="flex flex-col gap-4" data-action-result>
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className={`h-2 w-2 rounded-full ${committed ? "bg-emerald-500" : "bg-amber-500"}`} />
          <h2 className="text-sm font-semibold">{committed ? "Đã chạy" : "Xem trước — chưa ghi gì"}</h2>
          {openable && onOpen
            ? <Button size="sm" className="ml-auto" onClick={() => onOpen(openable.doctype, openable.name)}>
                Mở {openable.name}
              </Button>
            : null}
        </div>
        {typeof record.message === "string" && record.message
          ? <p className="border-b bg-muted/20 px-4 py-3 text-sm font-medium" data-action-message>{record.message}</p>
          : null}
        {scalars.length
          ? <dl className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {scalars.map(([key, entry]) => (
                <div key={key} className="rounded-lg border bg-background px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{labelForKey(key)}</dt>
                  <dd className="mt-1 text-sm font-semibold tabular-nums">{scalar(entry, format)}</dd>
                </div>
              ))}
            </dl>
          : null}
      </section>

      {objects.map(([key, entry]) => (
        <ObjectSummary key={key} title={OBJECT_TITLES[key] ?? labelForKey(key)} value={entry as ResultRecord} format={format} />
      ))}

      {tables.map(([key, rows]) => (
        <section key={key} className="overflow-hidden rounded-xl border bg-card" data-action-result-section={key}>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{TABLE_TITLES[key] ?? labelForKey(key)}</h3>
            <span className="text-xs text-muted-foreground">{rows.length} dòng</span>
          </div>
          {rows.length
            ? <ResultTable rows={rows} format={format} onOpen={onOpen} />
            : <p className="px-4 py-3 text-sm text-muted-foreground">Chưa có dữ liệu.</p>}
        </section>
      ))}
    </div>
  );
}

function ObjectSummary({ title, value, format }: { title: string; value: ResultRecord; format: (value: number) => string }) {
  const entries = Object.entries(value).filter(([key]) => !HIDDEN_KEYS.has(key));
  return (
    <section className="rounded-xl border bg-card" data-action-summary={title}>
      <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3></div>
      <dl className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map(([key, entry]) => (
          <div key={key} className="rounded-lg border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">{labelForKey(key)}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums">{scalar(entry, format)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ResultTable({ rows, format, onOpen }: { rows: unknown[]; format: (value: number) => string; onOpen?: (doctype: string, name: string) => void }) {
  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      for (const key of Object.keys(row as ResultRecord)) if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }, [rows]);
  if (!columns.length) {
    return <ul className="px-4 py-3 text-sm">{rows.map((row, index) => <li key={index}>{String(row)}</li>)}</ul>;
  }
  return (
    <div className="overflow-x-auto">
      <Table unwrapped className="w-full min-w-max text-sm">
        <TableHeader className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <TableRow>{columns.map((key) => <TableHead key={key} className="whitespace-nowrap px-4 py-2 font-medium">{labelForKey(key)}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const record = (row ?? {}) as ResultRecord;
            return (
              <TableRow key={index} className="border-b last:border-0">
                {columns.map((key) => (
                  <TableCell key={key} className="max-w-80 px-4 py-2 tabular-nums">{cell(record[key], key, format, onOpen)}</TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function scalar(value: unknown, format: (value: number) => string): ReactNode {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return format(value);
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.length ? `${value.length} dòng` : "—";
  if (typeof value === "object") return "Chi tiết";
  if (value === "tien_dat_default") return "Mặc định Tiến Đạt";
  if (value === "supplier") return "Cấu hình nhà cung cấp";
  if (value === "default_zero") return "Mặc định 0%";
  return String(value);
}

function cell(value: unknown, key: string, format: (value: number) => string, onOpen?: (doctype: string, name: string) => void): ReactNode {
  if (typeof value === "object" && value !== null && "doctype" in value && "name" in value && onOpen) {
    const link = value as { doctype: string; name: string };
    return <Button type="button" variant="link" className="h-auto p-0" onClick={() => onOpen(link.doctype, link.name)}>{link.name}</Button>;
  }
  if (typeof value === "string" && value && OPEN_LINKS[key] && onOpen) {
    return <Button type="button" variant="link" className="h-auto p-0" onClick={() => onOpen(OPEN_LINKS[key]!, value)}>{value}</Button>;
  }
  if (key === "note" && typeof value === "string") return <span className="whitespace-normal">{value || "—"}</span>;
  return scalar(value, format);
}
