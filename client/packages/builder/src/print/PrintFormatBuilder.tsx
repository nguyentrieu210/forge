/** @jsxImportSource react */
/**
 * PrintFormatBuilder (M21) — chọn field in + thứ tự + nhãn. Sinh PrintFormatDef.format_data (JSON).
 * Lưu qua adapter.savePrintFormat.
 */
import { useEffect } from "react";
import { ArrowDown, ArrowUp, Eye, FileText, Printer, Redo2, Save, Undo2 } from "lucide-react";
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
  const visibleBlocks = m.blocks.filter((block) => block.visible);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.blocks.length) return;
    const blocks = [...m.blocks];
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
    b.set({ ...m, blocks });
  };

  return (
    <div className="mf-builder overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="border-b bg-card/95 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 hidden size-9 place-items-center rounded-xl bg-primary/10 text-primary sm:grid"><Printer className="size-4" /></div>
          <Input className="h-9 min-w-48 flex-1 font-semibold sm:max-w-72" value={m.name} onChange={(e) => b.set({ ...m, name: e.target.value })} placeholder="Tên Print Format" />
          <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">{m.doc_type}</span>
          <span className="hidden rounded-full border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground md:inline">{visibleBlocks.length}/{m.blocks.length} trường hiển thị</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
            <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
            <Button size="sm" className="ml-1 gap-1.5" onClick={() => props.onSave?.(m)} disabled={props.saving}><Save className="size-3.5" /> {props.saving ? "Đang lưu…" : "Lưu mẫu in"}</Button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[38rem] grid-cols-1 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(24rem,1.1fr)]">
        <section className="min-w-0 border-b bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b bg-card/70 px-3 py-2.5 sm:px-4">
            <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-3.5" /></div>
            <div>
              <h3 className="text-xs font-semibold">Trường trên mẫu in</h3>
              <p className="text-[10px] text-muted-foreground">Bật/tắt, đổi nhãn và sắp xếp thứ tự.</p>
            </div>
          </div>

          <div className="max-h-[34rem] overflow-auto p-3 sm:p-4 lg:max-h-[42rem]">
            {m.blocks.length ? (
              <ul className="space-y-2">
                {m.blocks.map((blk, i) => (
                  <li key={blk.fieldname} className="group rounded-xl border bg-card p-2.5 transition hover:border-primary/30 hover:shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <div className="pt-1"><Checkbox checked={blk.visible} onCheckedChange={(v) => b.set({ ...m, blocks: m.blocks.map((x, j) => (j === i ? { ...x, visible: Boolean(v) } : x)) })} aria-label={`Hiển thị ${blk.label}`} /></div>
                      <div className="min-w-0 flex-1">
                        <Input className="h-8 text-xs font-medium" value={blk.label} onChange={(e) => b.set({ ...m, blocks: m.blocks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{blk.fieldname}</span>
                          <span>{blk.visible ? "Đang in" : "Đã ẩn"}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Đưa lên"><ArrowUp className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => move(i, 1)} disabled={i === m.blocks.length - 1} aria-label="Đưa xuống"><ArrowDown className="size-3.5" /></Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-56 place-items-center rounded-xl border border-dashed bg-card/60 p-5 text-center">
                <div><FileText className="mx-auto size-8 text-muted-foreground/40" /><h3 className="mt-2 text-xs font-semibold">Chưa có trường để in</h3><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Print model sẽ lấy các trường khả dụng từ DocType nguồn.</p></div>
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 bg-background/60 p-3 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold"><Eye className="size-3.5 text-primary" /> Xem trước trang in</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Bố cục xem trước cập nhật ngay theo nhãn, thứ tự và trạng thái hiển thị.</p>
            </div>
            <span className="ml-auto rounded-full border bg-card px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">A4 preview</span>
          </div>

          <div className="mx-auto min-h-[34rem] max-w-[44rem] overflow-hidden rounded-sm border bg-white text-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <div className="border-b border-zinc-200 px-7 py-6 sm:px-9 sm:py-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">MetaForge · Print Format</div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">{m.name || "Untitled Print Format"}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{m.doc_type}</p>
                </div>
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-500"><Printer className="size-4" /></div>
              </div>
            </div>

            <div className="px-7 py-6 sm:px-9 sm:py-8">
              {visibleBlocks.length ? (
                <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {visibleBlocks.map((block, index) => (
                    <div key={block.fieldname} className={index === 0 && visibleBlocks.length % 2 === 1 ? "sm:col-span-2" : undefined}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{block.label || block.fieldname}</dt>
                      <dd className="mt-1.5 min-h-7 border-b border-zinc-200 pb-1 text-sm text-zinc-700">Dữ liệu {block.fieldname}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-zinc-200 p-8 text-center">
                  <div><FileText className="mx-auto size-8 text-zinc-300" /><h3 className="mt-2 text-sm font-semibold text-zinc-600">Trang in chưa có nội dung</h3><p className="mt-1 text-xs leading-5 text-zinc-400">Bật ít nhất một trường ở panel bên trái để đưa dữ liệu vào mẫu.</p></div>
                </div>
              )}
            </div>

            <div className="mt-auto border-t border-zinc-100 px-7 py-4 text-[9px] text-zinc-400 sm:px-9">Preview metadata · {visibleBlocks.length} trường hiển thị</div>
          </div>
        </section>
      </div>
    </div>
  );
}
