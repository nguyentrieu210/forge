/** @jsxImportSource react */
/**
 * DocTypeBuilder (M17) — palette 43 fieldtype → kéo (dnd-kit) vào canvas (SortableContext) → DocTypeMeta.
 * onChange(meta) mỗi thay đổi → demo render FormView(meta) LIVE. Lưu qua onSave.
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
import { GripVertical, Layers3, ListChecks, Redo2, Save, Search, Undo2, X } from "lucide-react";
import { AUTHORABLE_FIELDTYPES, type DocTypeMeta, type DocField, type Fieldtype } from "@metaforge/core";
import {
  cn, Button, Input, Textarea, Checkbox, ConfirmDialog,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@metaforge/ui";
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
  const [paletteQuery, setPaletteQuery] = useState("");
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
  const validation = useMemo(() => validateDraft(b.model), [b.model]);
  const paletteGroups = useMemo(() => {
    const query = paletteQuery.trim().toLocaleLowerCase();
    return fieldtypeGroups()
      .map((group) => ({ ...group, items: group.items.filter((item) => !query || item.toLocaleLowerCase().includes(query)) }))
      .filter((group) => group.items.length > 0);
  }, [paletteQuery]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mf-builder grid min-h-[36rem] grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-sm xl:grid-cols-[13rem_minmax(0,1fr)_18rem]">
        <aside className="min-w-0 border-b bg-muted/30 xl:border-b-0 xl:border-r">
          <div className="border-b bg-card/80 p-3">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Layers3 className="size-4" /></div>
              <div>
                <div className="text-xs font-semibold">Thư viện trường</div>
                <div className="text-[10px] text-muted-foreground">{AUTHORABLE_FIELDTYPES.length} fieldtype</div>
              </div>
            </div>
            <label className="relative mt-3 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                className="h-8 pl-8 text-xs"
                placeholder="Tìm loại trường…"
                aria-label="Tìm loại trường"
              />
            </label>
          </div>
          <div className="max-h-64 overflow-auto p-3 xl:max-h-[min(44rem,76vh)]">
            <p id="mf-builder-dnd-help" className="mb-3 text-[10px] leading-4 text-muted-foreground">
              Kéo bằng chuột hoặc dùng Space, phím mũi tên, Space để thả vào canvas.
            </p>
            {paletteGroups.length ? paletteGroups.map((group) => (
              <section key={group.label} className="mb-4 last:mb-0">
                <h3 className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</h3>
                <div className="space-y-1">{group.items.map((ft) => <PaletteItem key={ft} fieldtype={ft} />)}</div>
              </section>
            )) : (
              <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Không có fieldtype phù hợp.</div>
            )}
          </div>
        </aside>

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

        <aside className="min-w-0 border-t bg-muted/20 xl:border-l xl:border-t-0">
          <div className="flex items-center gap-2 border-b bg-card/80 px-3 py-2.5">
            <ListChecks className="size-4 text-primary" />
            <div className="min-w-0">
              <div className="text-xs font-semibold">Thuộc tính</div>
              <div className="truncate text-[10px] text-muted-foreground">{sel ? `${sel.fieldtype} · ${sel.fieldname}` : "Chưa chọn trường"}</div>
            </div>
          </div>
          <div className="max-h-[30rem] overflow-auto p-3 xl:max-h-[min(44rem,76vh)]">
            {sel ? (
              <FieldProps field={sel} onPatch={(p) => b.set(updateField(b.model, sel.fieldname, p))} />
            ) : (
              <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-card/50 p-5 text-center">
                <div>
                  <ListChecks className="mx-auto size-7 text-muted-foreground/50" />
                  <p className="mt-2 text-xs font-medium">Chọn một trường trên canvas</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Inspector sẽ hiện nhãn, tên field, độ rộng, điều kiện và các cờ hiển thị.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
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
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-xs shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:-translate-y-px hover:border-primary/40 hover:shadow-sm",
        isDragging && "opacity-40",
      )}
      {...attributes}
      {...listeners}
      aria-describedby="mf-builder-dnd-help"
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">+</span>
      <span className="truncate font-medium">{fieldtype}</span>
      <GripVertical className="ml-auto size-3 text-muted-foreground/50" />
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
  const requiredCount = model.fields.filter((field) => field.reqd === 1).length;
  const listCount = model.fields.filter((field) => field.in_list_view === 1).length;

  return (
    <main ref={setNodeRef} className="min-w-0 bg-background/60">
      <div className="sticky top-0 z-10 border-b bg-card/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 min-w-44 flex-1 font-semibold sm:max-w-64" value={model.name} onChange={(e) => props.onRename(e.target.value)} placeholder="Tên DocType" />
          <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground md:flex">
            <span className="rounded-full border bg-muted/40 px-2 py-1">{model.fields.length} trường</span>
            <span className="rounded-full border bg-muted/40 px-2 py-1">{requiredCount} bắt buộc</span>
            <span className="rounded-full border bg-muted/40 px-2 py-1">{listCount} ở List</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={props.undo} disabled={!props.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
            <Button variant="outline" size="icon-sm" onClick={props.redo} disabled={!props.canRedo} aria-label="Làm lại"><Redo2 /></Button>
            <Button size="sm" className="ml-1 gap-1.5" onClick={props.onSave} disabled={props.saving || !validation.ok} title={validation.ok ? undefined : "Còn lỗi — không thể lưu"}>
              <Save className="size-3.5" /> {props.saving ? "Đang lưu…" : "Lưu DocType"}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          <span className={cn("size-1.5 rounded-full", errors.length ? "bg-destructive" : "bg-success")} />
          <span className={errors.length ? "text-destructive" : "text-muted-foreground"}>
            {errors.length ? `${errors.length} lỗi cần sửa trước khi lưu` : "Metadata hợp lệ · sẵn sàng xem trước"}
          </span>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {errors.length ? (
          <ul className="mb-3 list-disc rounded-xl border border-destructive/25 bg-destructive/5 px-8 py-2.5 text-xs text-destructive" role="alert">
            {errors.map((error, index) => <li key={`${error.fieldname ?? "draft"}-${index}`}>{error.fieldname ? `${error.fieldname}: ` : ""}{error.message}</li>)}
          </ul>
        ) : null}

        <div className="min-h-[30rem] rounded-2xl border border-dashed bg-card/75 p-3 shadow-inner sm:p-4">
          {model.fields.length === 0 ? (
            <div className="grid min-h-[27rem] place-items-center p-6 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Layers3 className="size-6" /></div>
                <h3 className="mt-3 text-sm font-semibold">Bắt đầu từ một trường dữ liệu</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Kéo fieldtype từ thư viện bên trái vào đây. Canvas này chính là metadata sẽ được runtime dùng để render form.</p>
              </div>
            </div>
          ) : (
            <SortableContext items={model.fields.map((f) => f.fieldname)} strategy={verticalListSortingStrategy}>
              <ul className="list-none p-0">
                {model.fields.map((f, index) => (
                  <SortableField
                    key={f.fieldname}
                    index={index}
                    field={f}
                    selected={props.selected === f.fieldname}
                    onSelect={() => props.onSelect(f.fieldname)}
                    onDelete={() => props.onDelete(f.fieldname)}
                  />
                ))}
              </ul>
            </SortableContext>
          )}
        </div>
      </div>
    </main>
  );
}

function SortableField({ index, field, selected, onSelect, onDelete }: { index: number; field: DocField; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.fieldname });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        "group mb-2 flex items-center gap-3 rounded-xl border bg-card p-2.5 text-sm transition last:mb-0 hover:border-primary/30 hover:shadow-sm",
        selected && "border-primary bg-primary/[0.03] ring-2 ring-primary/10",
        isDragging && "opacity-50 shadow-lg",
      )}
      onClick={onSelect}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSelect(); } }}
      tabIndex={0}
      aria-selected={selected}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground transition group-hover:border-primary/30 group-hover:text-primary"
        aria-label={`Kéo để sắp xếp ${field.label || field.fieldname}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{field.label || field.fieldname}</span>
          {field.reqd === 1 ? <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">Bắt buộc</span> : null}
          {field.in_list_view === 1 ? <span className="hidden rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary sm:inline">List</span> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <span>·</span>
          <span className="truncate font-mono">{field.fieldname}</span>
          <span>·</span>
          <span>{field.fieldtype}</span>
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground opacity-70 hover:text-destructive group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Xoá field"><X /></Button>
    </li>
  );
}

function FieldProps({ field, onPatch }: { field: DocField; onPatch: (p: Partial<DocField>) => void }) {
  const hasOptions = ["Select", "Link", "Dynamic Link", "Table", "Table MultiSelect"].includes(field.fieldtype);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="mb-3 flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{children}</label>
  );
  const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-2 text-xs font-medium transition hover:border-primary/30">
      <span>{label}</span><Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
    </label>
  );
  return (
    <div className="mf-field-props">
      <div className="mb-3 rounded-xl border bg-card p-3">
        <Row label="Nhãn"><Input value={field.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} /></Row>
        <Row label="Tên field"><Input className="font-mono text-xs" value={field.fieldname} onChange={(e) => onPatch({ fieldname: e.target.value })} /></Row>
        {hasOptions ? (
          <Row label={`Options (${field.fieldtype === "Select" ? "mỗi dòng 1 mục" : "DocType đích"})`}>
            <Textarea value={field.options ?? ""} onChange={(e) => onPatch({ options: e.target.value })} rows={3} />
          </Row>
        ) : null}
        <Row label="Độ rộng trên form">
          <Select
            value={field.form_width ?? "auto"}
            onValueChange={(value) => onPatch({ form_width: (value === "auto" ? undefined : value) as DocField["form_width"] })}
          >
            <SelectTrigger><SelectValue placeholder="Tự động theo loại field" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Tự động theo loại field</SelectItem>
              <SelectItem value="full">Toàn hàng (1 ô/hàng)</SelectItem>
              <SelectItem value="half">Nửa hàng (2 ô/hàng)</SelectItem>
              <SelectItem value="third">Một phần ba (3 ô/hàng)</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </div>

      <div className="mb-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
        <Check label="Bắt buộc" checked={field.reqd === 1} onChange={(v) => onPatch({ reqd: v ? 1 : 0 })} />
        <Check label="Hiện ở List" checked={field.in_list_view === 1} onChange={(v) => onPatch({ in_list_view: v ? 1 : 0 })} />
        <Check label="Chỉ đọc" checked={field.read_only === 1} onChange={(v) => onPatch({ read_only: v ? 1 : 0 })} />
        <Check label="Ẩn" checked={field.hidden === 1} onChange={(v) => onPatch({ hidden: v ? 1 : 0 })} />
        <Check label="Bộ lọc chuẩn" checked={field.in_standard_filter === 1} onChange={(v) => onPatch({ in_standard_filter: v ? 1 : 0 })} />
      </div>

      <div className="rounded-xl border bg-card p-3">
        <Row label="Mô tả"><Textarea value={typeof field.description === "string" ? field.description : ""} onChange={(e) => onPatch({ description: e.target.value })} rows={2} /></Row>
        <Row label="Giá trị mặc định"><Input value={String(field.default ?? "")} onChange={(e) => onPatch({ default: e.target.value })} /></Row>
        <Row label="depends_on"><Input className="font-mono text-xs" value={field.depends_on ?? ""} onChange={(e) => onPatch({ depends_on: e.target.value })} placeholder="eval:doc.x=='y'" /></Row>
        <Row label="mandatory_depends_on"><Input className="font-mono text-xs" value={field.mandatory_depends_on ?? ""} onChange={(e) => onPatch({ mandatory_depends_on: e.target.value })} placeholder="eval:doc.x=='y'" /></Row>
        <Row label="read_only_depends_on"><Input className="font-mono text-xs" value={field.read_only_depends_on ?? ""} onChange={(e) => onPatch({ read_only_depends_on: e.target.value })} placeholder="eval:doc.x=='y'" /></Row>
      </div>
    </div>
  );
}
