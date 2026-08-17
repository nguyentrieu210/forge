/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { DocField, DocTypeMeta, FilterOperator } from "@metaforge/core";
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@metaforge/ui";
import type { AdvancedFilterState } from "./filters.js";

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: "=", label: "Bằng" },
  { value: "!=", label: "Khác" },
  { value: "like", label: "Chứa" },
  { value: "not like", label: "Không chứa" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "in", label: "Thuộc danh sách" },
  { value: "not in", label: "Không thuộc danh sách" },
  { value: "between", label: "Trong khoảng" },
  { value: "is", label: "Có/không có giá trị" },
];

interface DraftRule {
  field: string;
  operator: FilterOperator;
  value: string;
  second: string;
}

function fieldOptions(meta: DocTypeMeta): Array<Pick<DocField, "fieldname" | "label" | "fieldtype">> {
  const excluded = new Set(["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"]);
  const result = (meta.fields ?? []).filter((field) => !excluded.has(field.fieldtype) && !field.hidden);
  if (!result.some((field) => field.fieldname === "name")) result.unshift({ fieldname: "name", label: "Mã", fieldtype: "Data" });
  return result;
}

function toDraft(filter: AdvancedFilterState | undefined): DraftRule[] {
  return (filter?.rules ?? []).map(([field, operator, raw]) => {
    if (operator === "between" && Array.isArray(raw)) return { field, operator, value: String(raw[0] ?? ""), second: String(raw[1] ?? "") };
    if ((operator === "in" || operator === "not in") && Array.isArray(raw)) return { field, operator, value: raw.map(String).join(", "), second: "" };
    return { field, operator, value: String(raw ?? ""), second: "" };
  });
}

function toRuntime(mode: AdvancedFilterState["mode"], rules: DraftRule[]): AdvancedFilterState | undefined {
  const runtime: AdvancedFilterState["rules"] = [];
  for (const rule of rules) {
    if (!rule.field) continue;
    if (rule.operator === "is") {
      runtime.push([rule.field, rule.operator, rule.value === "not set" ? "not set" : "set"]);
      continue;
    }
    if (rule.operator === "between") {
      if (!rule.value.trim() && !rule.second.trim()) continue;
      runtime.push([rule.field, rule.operator, [rule.value.trim(), rule.second.trim()]]);
      continue;
    }
    if (rule.operator === "in" || rule.operator === "not in") {
      const values = rule.value.split(",").map((value) => value.trim()).filter(Boolean);
      if (!values.length) continue;
      runtime.push([rule.field, rule.operator, values]);
      continue;
    }
    if (!rule.value.trim()) continue;
    const value = rule.operator === "like" || rule.operator === "not like" ? `%${rule.value.trim().replace(/^%|%$/g, "")}%` : rule.value.trim();
    runtime.push([rule.field, rule.operator, value]);
  }
  return runtime.length ? { mode, rules: runtime } : undefined;
}

export function AdvancedFilterDialog({
  open,
  onOpenChange,
  meta,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: DocTypeMeta;
  value?: AdvancedFilterState;
  onApply: (value: AdvancedFilterState | undefined) => void;
}) {
  const fields = useMemo(() => fieldOptions(meta), [meta]);
  const [mode, setMode] = useState<AdvancedFilterState["mode"]>(value?.mode ?? "all");
  const [rules, setRules] = useState<DraftRule[]>(() => toDraft(value));

  useEffect(() => {
    if (!open) return;
    setMode(value?.mode ?? "all");
    setRules(toDraft(value));
  }, [open, value]);

  const addRule = () => {
    const first = fields[0]?.fieldname ?? "name";
    setRules((current) => [...current, { field: first, operator: "=", value: "", second: "" }]);
  };
  const patchRule = (index: number, patch: Partial<DraftRule>) => setRules((current) => current.map((rule, currentIndex) => currentIndex === index ? { ...rule, ...patch } : rule));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,880px)] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="size-5" /> Bộ lọc nâng cao</DialogTitle>
          <DialogDescription>Dùng toán tử chi tiết trên field thật của DocType. Điều kiện được lưu trong URL nên reload/back vẫn giữ nguyên.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <span className="text-sm font-medium">Khớp</span>
          <Select value={mode} onValueChange={(next) => setMode(next as AdvancedFilterState["mode"])}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả điều kiện (AND)</SelectItem>
              <SelectItem value="any">Bất kỳ điều kiện (OR)</SelectItem>
            </SelectContent>
          </Select>
          {mode === "any" ? <Badge variant="secondary">OR dùng bucket `or_filters`; tìm kiếm nhanh sẽ được xoá khi áp dụng</Badge> : null}
        </div>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {rules.map((rule, index) => (
            <div key={index} className="grid grid-cols-[minmax(10rem,1.2fr)_10rem_minmax(9rem,1fr)_auto] items-center gap-2 rounded-lg border p-2 max-md:grid-cols-1">
              <Select value={rule.field} onValueChange={(field) => patchRule(index, { field })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {fields.map((field) => <SelectItem key={field.fieldname} value={field.fieldname}>{field.label || field.fieldname}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={rule.operator} onValueChange={(operator) => patchRule(index, { operator: operator as FilterOperator, value: "", second: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
              </Select>
              {rule.operator === "is" ? (
                <Select value={rule.value || "set"} onValueChange={(next) => patchRule(index, { value: next })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="set">Có giá trị</SelectItem><SelectItem value="not set">Không có giá trị</SelectItem></SelectContent>
                </Select>
              ) : rule.operator === "between" ? (
                <div className="grid grid-cols-2 gap-2"><Input value={rule.value} onChange={(event) => patchRule(index, { value: event.target.value })} placeholder="Từ" /><Input value={rule.second} onChange={(event) => patchRule(index, { second: event.target.value })} placeholder="Đến" /></div>
              ) : (
                <Input value={rule.value} onChange={(event) => patchRule(index, { value: event.target.value })} placeholder={rule.operator === "in" || rule.operator === "not in" ? "A, B, C" : "Giá trị"} />
              )}
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Bỏ điều kiện" onClick={() => setRules((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {!rules.length ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Chưa có điều kiện nâng cao.</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={addRule}><Plus className="size-4" /> Thêm điều kiện</Button>
          <Button type="button" variant="ghost" disabled={!value?.rules.length && !rules.length} onClick={() => { setRules([]); onApply(undefined); onOpenChange(false); }}>Xoá bộ lọc nâng cao</Button>
          <div className="ml-auto flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button><Button type="button" onClick={() => { onApply(toRuntime(mode, rules)); onOpenChange(false); }}>Áp dụng</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
