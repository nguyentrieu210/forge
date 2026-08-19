/** @jsxImportSource react */
import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metaforge/ui";

export interface BomActualComponentRow {
  component_key: string;
  item_code: string;
  qty: number;
  source_row?: number;
  note?: string;
}

export interface BomActualRequirement {
  component_key: string;
  allowed_item_codes: string[];
  provided_item_codes: string[];
  provided_rows: number;
  missing: boolean;
}

interface DraftRow {
  item_code: string;
  qty: string;
}

export interface AlumdoorBomActualEditorProps {
  requirements: BomActualRequirement[];
  value?: BomActualComponentRow[];
  disabled?: boolean;
  onChange: (rows: BomActualComponentRow[]) => void;
}

export function AlumdoorBomActualEditor({
  requirements,
  value = [],
  disabled = false,
  onChange,
}: AlumdoorBomActualEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const updateDraft = (key: string, patch: Partial<DraftRow>) => {
    setDrafts((current) => ({
      ...current,
      [key]: { item_code: "", qty: "", ...(current[key] ?? {}), ...patch },
    }));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  };

  const addRow = (requirement: BomActualRequirement) => {
    const key = requirement.component_key;
    const draft = drafts[key] ?? {
      item_code: requirement.allowed_item_codes.length === 1 ? requirement.allowed_item_codes[0]! : "",
      qty: "",
    };
    const qty = Number(draft.qty);
    if (!draft.item_code || !Number.isFinite(qty) || qty <= 0) return;
    onChange([...value, { component_key: key, item_code: draft.item_code, qty }]);
    setDrafts((current) => ({
      ...current,
      [key]: {
        item_code: requirement.allowed_item_codes.length === 1 ? requirement.allowed_item_codes[0]! : "",
        qty: "",
      },
    }));
  };

  return (
    <div className="space-y-3">
      {requirements.map((requirement) => {
        const rows = value
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.component_key === requirement.component_key);
        const complete = rows.length > 0 || !requirement.missing;
        const draft = drafts[requirement.component_key] ?? {
          item_code: requirement.allowed_item_codes.length === 1 ? requirement.allowed_item_codes[0]! : "",
          qty: "",
        };
        const addDisabled = disabled
          || !draft.item_code
          || !Number.isFinite(Number(draft.qty))
          || Number(draft.qty) <= 0;

        return (
          <div key={requirement.component_key} className="rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold">{requirement.component_key}</span>
                {complete ? (
                  <Badge variant="outline" className="gap-1"><CheckCircle2 className="size-3" /> Đã nhập</Badge>
                ) : (
                  <Badge variant="destructive">Còn thiếu</Badge>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">Số lượng tính cho 1 bộ</span>
            </div>

            {rows.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {rows.map(({ row, index }) => (
                  <div key={`${row.component_key}-${row.item_code}-${index}`} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.item_code}</span>
                    <span className="shrink-0 text-xs tabular-nums">{row.qty}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled}
                      onClick={() => removeRow(index)}
                      aria-label={`Xóa ${row.item_code} khỏi ${requirement.component_key}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={draft.item_code}
                onValueChange={(item_code) => updateDraft(requirement.component_key, { item_code })}
                disabled={disabled}
              >
                <SelectTrigger className="min-w-52 flex-1">
                  <SelectValue placeholder="Chọn vật tư đúng nguồn" />
                </SelectTrigger>
                <SelectContent>
                  {requirement.allowed_item_codes.map((itemCode) => (
                    <SelectItem key={itemCode} value={itemCode}>{itemCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-32 text-right tabular-nums"
                inputMode="decimal"
                placeholder="SL / bộ"
                value={draft.qty}
                disabled={disabled}
                onChange={(event) => updateDraft(requirement.component_key, { qty: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !addDisabled) {
                    event.preventDefault();
                    addRow(requirement);
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={addDisabled} onClick={() => addRow(requirement)}>
                <Plus className="size-3.5" /> Thêm
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
