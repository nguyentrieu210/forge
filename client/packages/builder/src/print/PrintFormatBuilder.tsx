/** @jsxImportSource react */
/**
 * PrintFormatBuilder (M21) — chọn field in + thứ tự + nhãn. Sinh PrintFormatDef.format_data (JSON).
 * Lưu qua adapter.savePrintFormat. WYSIWYG paper-blocks (dnd-kit) = PHA 6.
 */
import { useEffect } from "react";
import { Undo2, Redo2, ArrowUp, ArrowDown } from "lucide-react";
import type { DocField } from "@metaforge/core";
import { Button, Input, Checkbox } from "@metaforge/ui";
import { useBuilder } from "../kernel.js";

export interface PrintBlock {
  fieldname: string;
  label: string;
  visible: boolean;
}
export interface PrintFormatModel {
  name: string;
  doc_type: string;
  blocks: PrintBlock[];
}

export function printModelFromFields(name: string, doc_type: string, fields: DocField[]): PrintFormatModel {
  const blocks = fields
    .filter((f) => !["Section Break", "Column Break", "Tab Break", "Fold", "HTML", "Button"].includes(f.fieldtype))
    .map((f) => ({ fieldname: f.fieldname, label: f.label ?? f.fieldname, visible: f.in_list_view === 1 }));
  return { name, doc_type, blocks };
}

export interface PrintFormatBuilderProps {
  initial: PrintFormatModel;
  onChange?: (m: PrintFormatModel) => void;
  onSave?: (m: PrintFormatModel) => void;
  saving?: boolean;
}

export function PrintFormatBuilder(props: PrintFormatBuilderProps) {
  const b = useBuilder<PrintFormatModel>(props.initial);
  useEffect(() => {
    props.onChange?.(b.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.model]);
  const m = b.model;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.blocks.length) return;
    const blocks = [...m.blocks];
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
    b.set({ ...m, blocks });
  };

  return (
    <div className="mf-builder mf-print-builder space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-56" value={m.name} onChange={(e) => b.set({ ...m, name: e.target.value })} placeholder="Tên Print Format" />
        <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <Button size="sm" className="ml-auto" onClick={() => props.onSave?.(m)} disabled={props.saving}>Lưu</Button>
      </div>
      <ul className="list-none divide-y rounded-md border p-0">
        {m.blocks.map((blk, i) => (
          <li key={blk.fieldname} className="flex items-center gap-2 p-2">
            <Checkbox checked={blk.visible} onCheckedChange={(v) => b.set({ ...m, blocks: m.blocks.map((x, j) => (j === i ? { ...x, visible: Boolean(v) } : x)) })} />
            <Input className="flex-1" value={blk.label} onChange={(e) => b.set({ ...m, blocks: m.blocks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <span className="w-32 truncate text-xs text-muted-foreground">{blk.fieldname}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên"><ArrowUp /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === m.blocks.length - 1} aria-label="Xuống"><ArrowDown /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
