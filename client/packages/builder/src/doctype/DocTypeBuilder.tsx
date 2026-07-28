/** @jsxImportSource react */
/**
 * DocTypeBuilder (M17) — palette 43 fieldtype → kéo (dnd-kit) vào canvas (SortableContext) → DocTypeMeta.
 * onChange(meta) mỗi thay đổi → demo render FormView(meta) LIVE ("thần sầu"). Lưu qua onSave.
 */
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Undo2, Redo2, X, GripVertical } from "lucide-react";
import { AUTHORABLE_FIELDTYPES, type DocTypeMeta, type DocField, type Fieldtype } from "@metaforge/core";
import { cn, Button, Input, Textarea, Checkbox, ConfirmDialog } from "@metaforge/ui";
import { useBuilder } from "../kernel.js";
import { addField, moveField, newField, removeField, updateField, indexOfField } from "./meta-build.js";
import { validateDraft, type ValidationResult } from "./validate.js";

const CANVAS = "canvas-drop";

export interface DocTypeBuilderProps {
  initial: DocTypeMeta;
  onChange?: (meta: DocTypeMeta) => void;
  onSave?: (meta: DocTypeMeta) => void;
  saving?: boolean;
}

export function DocTypeBuilder(props: DocTypeBuilderProps) {
  const b = useBuilder<DocTypeMeta>(props.initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    props.onChange?.(b.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.model]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith("palette:")) {
      const ft = activeId.slice("palette:".length) as Fieldtype;
      const f = newField(ft);
      const idx = overId === CANVAS ? b.model.fields.length : indexOfField(b.model, overId);
      b.set(addField(b.model, f, idx < 0 ? undefined : idx));
      setSelected(f.fieldname);
    } else {
      const from = indexOfField(b.model, activeId);
      const to = overId === CANVAS ? b.model.fields.length - 1 : indexOfField(b.model, overId);
      if (from >= 0 && to >= 0 && from !== to) b.set(moveField(b.model, from, to));
    }
  };

  const sel = b.model.fields.find((f) => f.fieldname === selected) ?? null;
  // Gate 6.2: validate TRƯỚC KHI apply — chặn Lưu khi còn error (fail-closed).
  const validation = useMemo(() => validateDraft(b.model), [b.model]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mf-builder mf-doctype-builder">
        {/* PALETTE */}
        <div className="mf-palette">
          <div className="mf-palette-title">Loại trường</div>
          <p id="mf-builder-dnd-help" className="mb-2 text-[11px] leading-snug text-muted-foreground">Kéo bằng chuột hoặc dùng Space, phím mũi tên, Space để thả.</p>
          {fieldtypeGroups().map((group) => <section key={group.label} className="mb-3"><h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>{group.items.map((ft) => <PaletteItem key={ft} fieldtype={ft} />)}</section>)}
        </div>

        {/* CANVAS */}
        <Canvas
          model={b.model}
          selected={selected}
          onSelect={setSelected}
          onRename={(name) => b.set({ ...b.model, name })}
          onDelete={setPendingDelete}
          undo={b.undo}
          redo={b.redo}
          canUndo={b.canUndo}
          canRedo={b.canRedo}
          onSave={() => { if (validation.ok) props.onSave?.(b.model); }}
          saving={props.saving}
          validation={validation}
        />

        {/* PROPERTY PANEL */}
        <div className="mf-props">
          <div className="mf-props-title">Thuộc tính</div>
          {sel ? <FieldProps field={sel} onPatch={(p) => b.set(updateField(b.model, sel.fieldname, p))} /> : <div className="mf-props-empty">Chọn 1 field</div>}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Xóa trường này?"
        description="Trường sẽ bị loại khỏi bản thiết kế. Bạn vẫn có thể dùng Hoàn tác ngay sau đó."
        confirmLabel="Xóa trường"
        cancelLabel="Giữ lại"
        destructive
        onConfirm={() => {
          if (!pendingDelete) return;
          b.set(removeField(b.model, pendingDelete));
          if (selected === pendingDelete) setSelected(null);
          setPendingDelete(null);
        }}
      />
    </DndContext>
  );
}

function fieldtypeGroups(): Array<{ label: string; items: Fieldtype[] }> {
  const buckets: Array<{ label: string; accepts: Set<string>; items: Fieldtype[] }> = [
    { label: "Văn bản", accepts: new Set(["Data", "Text", "Small Text", "Long Text", "Text Editor", "Markdown Editor", "Code", "Password", "Phone", "Barcode"]), items: [] },
    { label: "Số & thời gian", accepts: new Set(["Int", "Float", "Currency", "Percent", "Duration", "Rating", "Date", "Datetime", "Time"]), items: [] },
    { label: "Lựa chọn & liên kết", accepts: new Set(["Check", "Select", "Link", "Dynamic Link", "Table", "Table MultiSelect"]), items: [] },
    { label: "Tệp & trình bày", accepts: new Set(["Attach", "Attach Image", "Image", "Color", "Geolocation", "HTML", "Heading", "Section Break", "Column Break", "Tab Break", "Fold"]), items: [] },
    { label: "Khác", accepts: new Set(), items: [] },
  ];
  for (const fieldtype of AUTHORABLE_FIELDTYPES) (buckets.find((bucket) => bucket.accepts.has(fieldtype)) ?? buckets[buckets.length - 1]!).items.push(fieldtype);
  return buckets.filter((bucket) => bucket.items.length).map(({ label, items }) => ({ label, items }));
}

function PaletteItem({ fieldtype }: { fieldtype: Fieldtype }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${fieldtype}`, data: { fieldtype } });
  return (
    <div
      ref={setNodeRef}
      className={cn("mf-palette-item mb-1 cursor-grab rounded-md border bg-card px-2 py-1 text-xs hover:border-primary/40", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-describedby="mf-builder-dnd-help"
    >
      {fieldtype}
    </div>
  );
}

interface CanvasProps {
  model: DocTypeMeta;
  selected: string | null;
  onSelect: (fn: string) => void;
  onRename: (name: string) => void;
  onDelete: (fn: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  saving?: boolean;
  validation: ValidationResult;
}

function Canvas(props: CanvasProps) {
  const { model, validation } = props;
  const { setNodeRef } = useDroppable({ id: CANVAS });
  const errors = validation.issues.filter((i) => i.severity === "error");
  return (
    <div ref={setNodeRef} className="mf-canvas rounded-md border border-dashed p-2" style={{ minHeight: 240 }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input className="w-48" value={model.name} onChange={(e) => props.onRename(e.target.value)} placeholder="Tên DocType" />
        <Button variant="outline" size="icon-sm" onClick={props.undo} disabled={!props.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={props.redo} disabled={!props.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        {errors.length ? (
          <span className="mf-validation-errors text-xs text-destructive" role="alert" title={errors.map((e) => e.message).join("\n")}>
            {errors.length} lỗi cần sửa
          </span>
        ) : null}
        <Button size="sm" className="ml-auto" onClick={props.onSave} disabled={props.saving || !validation.ok} title={validation.ok ? undefined : "Còn lỗi — không thể lưu"}>
          {props.saving ? "Đang lưu…" : "Lưu DocType"}
        </Button>
      </div>
      {errors.length ? <ul className="mb-2 list-disc rounded-md border border-destructive/30 bg-destructive/5 px-7 py-2 text-xs text-destructive" role="alert">{errors.map((error, index) => <li key={`${error.fieldname ?? "draft"}-${index}`}>{error.fieldname ? `${error.fieldname}: ` : ""}{error.message}</li>)}</ul> : null}
      {model.fields.length === 0 ? (
        <div className="grid h-40 place-items-center text-sm text-muted-foreground">Kéo fieldtype từ trái vào đây</div>
      ) : (
        <SortableContext items={model.fields.map((f) => f.fieldname)} strategy={verticalListSortingStrategy}>
          <ul className="mf-canvas-list list-none p-0">
            {model.fields.map((f) => (
              <SortableField key={f.fieldname} field={f} selected={props.selected === f.fieldname} onSelect={() => props.onSelect(f.fieldname)} onDelete={() => props.onDelete(f.fieldname)} />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

function SortableField({ field, selected, onSelect, onDelete }: { field: DocField; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.fieldname });
  return (
    <li
      ref={setNodeRef}
      className={cn("mb-1 flex items-center justify-between rounded-md border bg-card p-1.5 text-sm", selected && "border-primary ring-1 ring-primary", isDragging && "opacity-50")}
      onClick={onSelect}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSelect(); } }}
      tabIndex={0}
      aria-selected={selected}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span className="flex cursor-grab items-center gap-1.5" {...attributes} {...listeners}>
        <GripVertical className="size-3.5 text-muted-foreground" />
        <b>{field.label || field.fieldname}</b> <span className="text-xs text-muted-foreground">{field.fieldtype}</span>
      </span>
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Xoá field"><X /></Button>
    </li>
  );
}

function FieldProps({ field, onPatch }: { field: DocField; onPatch: (p: Partial<DocField>) => void }) {
  const hasOptions = ["Select", "Link", "Dynamic Link", "Table", "Table MultiSelect"].includes(field.fieldtype);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="mb-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">{label}{children}</label>
  );
  const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} /> {label}</label>
  );
  return (
    <div className="mf-field-props">
      <Row label="Nhãn"><Input value={field.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} /></Row>
      <Row label="Tên field"><Input value={field.fieldname} onChange={(e) => onPatch({ fieldname: e.target.value })} /></Row>
      {hasOptions ? (
        <Row label={`Options (${field.fieldtype === "Select" ? "mỗi dòng 1 mục" : "DocType đích"})`}>
          <Textarea value={field.options ?? ""} onChange={(e) => onPatch({ options: e.target.value })} rows={3} />
        </Row>
      ) : null}
      <Row label="Độ rộng trên form">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={field.form_width ?? ""}
          onChange={(event) => onPatch({ form_width: (event.target.value || undefined) as DocField["form_width"] })}
        >
          <option value="">Tự động theo loại field</option>
          <option value="full">Toàn hàng (1 ô/hàng)</option>
          <option value="half">Nửa hàng (2 ô/hàng)</option>
          <option value="third">Một phần ba (3 ô/hàng)</option>
        </select>
      </Row>
      <Check label="Bắt buộc" checked={field.reqd === 1} onChange={(v) => onPatch({ reqd: v ? 1 : 0 })} />
      <Check label="Hiện ở List" checked={field.in_list_view === 1} onChange={(v) => onPatch({ in_list_view: v ? 1 : 0 })} />
      <Check label="Chỉ đọc" checked={field.read_only === 1} onChange={(v) => onPatch({ read_only: v ? 1 : 0 })} />
      <Check label="Ẩn" checked={field.hidden === 1} onChange={(v) => onPatch({ hidden: v ? 1 : 0 })} />
      <Check label="Bộ lọc chuẩn" checked={field.in_standard_filter === 1} onChange={(v) => onPatch({ in_standard_filter: v ? 1 : 0 })} />
      <Row label="Mô tả"><Textarea value={typeof field.description === "string" ? field.description : ""} onChange={(e) => onPatch({ description: e.target.value })} rows={2} /></Row>
      <Row label="Giá trị mặc định"><Input value={String(field.default ?? "")} onChange={(e) => onPatch({ default: e.target.value })} /></Row>
      <Row label="depends_on"><Input value={field.depends_on ?? ""} onChange={(e) => onPatch({ depends_on: e.target.value })} placeholder="eval:doc.x=='y'" /></Row>
      <Row label="mandatory_depends_on"><Input value={field.mandatory_depends_on ?? ""} onChange={(e) => onPatch({ mandatory_depends_on: e.target.value })} placeholder="eval:doc.x=='y'" /></Row>
      <Row label="read_only_depends_on"><Input value={field.read_only_depends_on ?? ""} onChange={(e) => onPatch({ read_only_depends_on: e.target.value })} placeholder="eval:doc.x=='y'" /></Row>
    </div>
  );
}
