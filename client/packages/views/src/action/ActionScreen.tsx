/** @jsxImportSource react */
/**
 * ActionScreen — màn "điền form rồi chạy", dựng HOÀN TOÀN từ manifest.
 *
 * Vì sao có màn này: một số việc không phải là sửa một bản ghi. Cắt nhôm chẳng hạn — nó
 * chọn lô, quyết lấy mấy lá ở mỗi lô, trừ tồn rồi ghi phiếu cắt; và người bấm PHẢI thấy
 * trước nó định lấy gì, vì nhôm cắt sai thì không nối lại được. Trước khi có `actions`,
 * cách duy nhất để giao màn đó là viết tay một trang React trong bundle dùng chung — tức
 * là xưởng của một khách nằm trong bundle của mọi khách còn lại.
 *
 * Ba điều màn này CỐ Ý làm:
 *
 *  1. Dùng ĐÚNG control của form (registry), nên Link có gợi ý, tiền có dấu phân cách,
 *     Select có danh sách — thay vì một bộ ô nhập thứ hai, nghèo hơn, sống cạnh bộ thứ nhất.
 *  2. Tách XEM TRƯỚC khỏi CHẠY THẬT. Xem trước chỉ đọc, và kết quả của nó được đánh dấu rõ
 *     là "chưa ghi gì" — nhìn nhầm một bảng đề xuất thành một việc đã làm là cắt hai lần.
 *  3. Hiện câu TỪ CHỐI như một câu trả lời, không phải như một sự cố.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { AppAction, AppActionCall, AppActionField, DocField, Fieldtype } from "@metaforge/core";
import {
  Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";

type Values = Record<string, unknown>;

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
      /**
       * Câu TỪ CHỐI của method là nội dung, không phải sự cố kỹ thuật.
       *
       * "Không đủ nhôm: thiếu 5 lá khổ ≥ 8,9 m cho AL548" chính là câu trả lời người dùng
       * cần. Nuốt nó rồi hiện "Đã xảy ra lỗi" là bắt họ mở file Excel ra đếm tay.
       */
      setError(adapter.mapError(caught).message);
      if (phase === "preview") setPreview(undefined); else setResult(undefined);
    } finally {
      setBusy(undefined);
    }
  }

  const shown = result ?? preview;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {action.description ? <p className="text-sm text-muted-foreground">{action.description}</p> : null}

      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {action.fields.map((field) => {
            const docField = toDocField(field);
            const Control = registry.resolve(docField.fieldtype);
            const id = `action-${action.name}-${field.fieldname}`;
            return (
              <div key={field.fieldname} className="flex flex-col gap-1.5">
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
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
      </div>

      {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

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

const HIDDEN_KEYS = new Set(["_server_messages", "exc_type"]);

/**
 * Kết quả — bảng cho mảng dòng, danh sách khoá/giá trị cho phần còn lại.
 *
 * Không cố đoán ý nghĩa từng khoá. Method trả về gì thì hiện đúng thứ đó, chỉ sắp lại cho
 * đọc được: khai `result_table` thì mảng đó lên bảng trước, khoá còn lại xuống dưới.
 */
function ActionResult({ value, table, committed, format, onOpen }: {
  value: unknown;
  table?: string;
  committed: boolean;
  format: (value: number) => string;
  onOpen?: (doctype: string, name: string) => void;
}) {
  if (value == null || typeof value !== "object") {
    return <div className="rounded-xl border bg-card p-4 text-sm">{String(value)}</div>;
  }
  const record = value as Record<string, unknown>;
  const rows = table && Array.isArray(record[table]) ? (record[table] as unknown[]) : undefined;
  const rest = Object.entries(record).filter(([key]) => key !== table && !HIDDEN_KEYS.has(key));

  /**
   * Chứng từ vừa tạo — mở thẳng vào form, đừng bắt người dùng tự đi tìm.
   *
   * Method nào tạo ra bản ghi thì trả về `doctype` + `name`, và trước đây hai khoá đó rơi
   * xuống danh sách khoá/giá trị như hai dòng chữ chết. Người vừa bấm "Tạo chứng từ nháp"
   * KHÔNG muốn đọc một cái tên — họ muốn đứng trong chứng từ đó để soát lại và ghi sổ.
   * Bắt họ nhớ mã rồi ra menu tìm là chỗ mất người dùng ngay sau khi việc đã chạy xong.
   *
   * Chỉ hiện sau khi CHẠY THẬT: bản xem trước chưa tạo gì, một nút "Mở" lúc đó là nói dối.
   */
  const openable = committed && typeof record.doctype === "string" && record.doctype
    && typeof record.name === "string" && record.name
    ? { doctype: record.doctype, name: record.name }
    : null;

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className={`h-2 w-2 rounded-full ${committed ? "bg-emerald-500" : "bg-amber-500"}`} />
        <h2 className="text-sm font-semibold">{committed ? "Đã chạy" : "Xem trước — chưa ghi gì"}</h2>
        {openable && onOpen
          ? <Button size="sm" className="ml-auto" onClick={() => onOpen(openable.doctype, openable.name)}>
              Mở {openable.name}
            </Button>
          : null}
      </div>
      {rows?.length ? <ResultTable rows={rows} format={format} onOpen={onOpen} /> : null}
      {rows && !rows.length ? <p className="px-4 py-3 text-sm text-muted-foreground">Không có dòng nào.</p> : null}
      {rest.length
        ? <dl className="grid gap-x-6 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-2">
            {rest.map(([key, entry]) => (
              <div key={key} className="flex justify-between gap-3 border-b border-dashed py-1 last:border-0">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="text-right font-medium">{scalar(entry, format)}</dd>
              </div>
            ))}
          </dl>
        : null}
    </div>
  );
}

function ResultTable({ rows, format, onOpen }: { rows: unknown[]; format: (value: number) => string; onOpen?: (doctype: string, name: string) => void }) {
  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      for (const key of Object.keys(row as Record<string, unknown>)) if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }, [rows]);
  if (!columns.length) {
    return <ul className="px-4 py-3 text-sm">{rows.map((row, index) => <li key={index}>{String(row)}</li>)}</ul>;
  }
  return (
    // Bảng cuộn TRONG khung của nó — trang không bao giờ trượt ngang.
    <div className="overflow-x-auto">
      <Table unwrapped className="w-full text-sm">
        <TableHeader className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <TableRow>{columns.map((key) => <TableHead key={key} className="px-4 py-2 font-medium">{key}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const record = (row ?? {}) as Record<string, unknown>;
            return (
              <TableRow key={index} className="border-b last:border-0">
                {columns.map((key) => (
                  <TableCell key={key} className="px-4 py-2 tabular-nums">{cell(record[key], format, onOpen)}</TableCell>
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
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function cell(value: unknown, format: (value: number) => string, onOpen?: (doctype: string, name: string) => void): ReactNode {
  if (typeof value === "object" && value !== null && "doctype" in value && "name" in value && onOpen) {
    const link = value as { doctype: string; name: string };
    return <Button type="button" variant="link" className="h-auto p-0" onClick={() => onOpen(link.doctype, link.name)}>{link.name}</Button>;
  }
  return scalar(value, format);
}
