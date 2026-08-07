/** @jsxImportSource react */
import { useMemo, useState } from "react";
import type { DocField, DocTypeMeta } from "@metaforge/core";
import {
  Badge, Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from "@metaforge/ui";

export interface MetadataIntelligenceEditorProps {
  meta: DocTypeMeta;
  onChange: (meta: DocTypeMeta) => void;
}

const VALUE_SOURCES = ["user", "default", "link", "formula", "system", "workflow"] as const;
const EDIT_MODES = ["editable", "readonly", "set_once", "immutable_after_submit", "hidden"] as const;
const SURFACES = ["quick", "expanded", "internal"] as const;

function patchField(meta: DocTypeMeta, fieldname: string, patch: Partial<DocField>): DocTypeMeta {
  return { ...meta, fields: meta.fields.map((field) => field.fieldname === fieldname ? { ...field, ...patch } : field) };
}

function editModePatch(mode: DocField["editMode"] | undefined): Partial<DocField> {
  if (!mode) return { editMode: undefined };
  if (mode === "readonly") return { editMode: mode, read_only: 1, set_only_once: 0, hidden: 0 };
  if (mode === "set_once") return { editMode: mode, read_only: 0, set_only_once: 1, hidden: 0 };
  if (mode === "hidden") return { editMode: mode, hidden: 1, read_only: 0, set_only_once: 0, surface: "internal" };
  return { editMode: mode, read_only: 0, set_only_once: 0, hidden: 0 };
}

function surfacePatch(surface: DocField["surface"] | undefined, field: DocField): Partial<DocField> {
  if (!surface) return { surface: undefined };
  if (surface === "internal" && (field.editMode ?? "editable") === "editable") {
    return { surface, editMode: "readonly", read_only: 1 };
  }
  return { surface };
}

function valueSourcePatch(source: DocField["valueSource"] | undefined, field: DocField): Partial<DocField> {
  if (!source) return { valueSource: undefined };
  const patch: Partial<DocField> = { valueSource: source };
  if (["system", "workflow", "formula"].includes(source)) patch.serverEnforced = true;
  if (source === "link" && field.fetch_if_empty === 1 && field.editMode === "editable" && !field.dirtyGuard) {
    patch.dirtyGuard = "preserve_user_value";
  }
  return patch;
}

export function MetadataIntelligenceEditor({ meta, onChange }: MetadataIntelligenceEditorProps) {
  const fields = useMemo(() => meta.fields.filter((field) => !["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button"].includes(field.fieldtype)), [meta.fields]);
  const [selected, setSelected] = useState(fields[0]?.fieldname ?? "");
  const field = fields.find((entry) => entry.fieldname === selected) ?? fields[0];
  const apply = (patch: Partial<DocField>) => {
    if (!field) return;
    onChange(patchField(meta, field.fieldname, patch));
  };

  if (!field) return <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Chưa có field dữ liệu để khai metadata intelligence.</div>;

  const derived = [
    field.valueSource ? `source:${field.valueSource}` : "source:auto",
    field.editMode ? `edit:${field.editMode}` : "edit:auto",
    field.surface ? `surface:${field.surface}` : "surface:auto",
    field.fetch_from ? `fetch:${field.fetch_from}` : null,
    field.fetch_if_empty === 1 ? "fetch:empty-only" : null,
    field.serverEnforced ? "server-enforced" : null,
    field.dirtyGuard ? `dirty:${field.dirtyGuard}` : null,
  ].filter(Boolean) as string[];
  const linkFiltersText = typeof field.link_filters === "string" ? field.link_filters : "";

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Metadata intelligence">
      <div className="border-b bg-muted/35 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Metadata Intelligence</h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">Khai nguồn giá trị, quyền sửa, surface và dependency bằng canonical metadata. Runtime Form/Child/Action dùng cùng contract; server vẫn là quyền cuối.</p>
          </div>
          <Badge variant="outline">{fields.length} fields</Badge>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Field đang cấu hình</label>
          <Select value={field.fieldname} onValueChange={setSelected}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.map((entry) => <SelectItem key={entry.fieldname} value={entry.fieldname}>{entry.label || entry.fieldname} · {entry.fieldtype}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1 pt-1">{derived.map((token) => <Badge key={token} variant="secondary" className="font-mono text-[10px]">{token}</Badge>)}</div>
          <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => apply({
            valueSource: undefined,
            editMode: undefined,
            surface: undefined,
            serverEnforced: false,
            dirtyGuard: undefined,
          })}>Về suy luận tự động</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border p-3">
            <div className="text-xs font-semibold">Nguồn & tự điền</div>
            <FieldLabel label="valueSource">
              <Select value={field.valueSource ?? "auto"} onValueChange={(value) => apply(valueSourcePatch(value === "auto" ? undefined : value as DocField["valueSource"], field))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Tự suy từ metadata cũ</SelectItem>
                  {VALUE_SOURCES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldLabel>
            <FieldLabel label="fetch_from">
              <Input className="font-mono text-xs" value={field.fetch_from ?? ""} onChange={(event) => apply({ fetch_from: event.target.value || undefined, ...(!event.target.value ? { fetch_if_empty: 0, dirtyGuard: undefined } : {}) })} placeholder="customer.customer_name" />
            </FieldLabel>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs">
              <Checkbox
                checked={field.fetch_if_empty === 1}
                disabled={!field.fetch_from}
                onCheckedChange={(value) => apply({
                  fetch_if_empty: value ? 1 : 0,
                  dirtyGuard: value ? "preserve_user_value" : undefined,
                })}
              />
              <span>
                <strong className="block">fetch_if_empty</strong>
                <span className="mt-0.5 block text-muted-foreground">Chỉ tự điền khi ô đích đang trống. Khi bật, operator vẫn có thể nhập/sửa giá trị; khi tắt, Link nguồn sở hữu ô đích trong lúc đã chọn nguồn.</span>
              </span>
            </label>
            <FieldLabel label="link_filters">
              <Textarea className="font-mono text-xs" value={linkFiltersText} onChange={(event) => apply({ link_filters: event.target.value || undefined })} rows={3} placeholder={'[["Item","disabled","=",0]]'} />
            </FieldLabel>
            <FieldLabel label="dirtyGuard">
              <Select value={field.dirtyGuard ?? "auto"} onValueChange={(value) => apply({ dirtyGuard: value === "auto" ? undefined : "preserve_user_value" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">Tự suy</SelectItem><SelectItem value="preserve_user_value">preserve_user_value</SelectItem></SelectContent>
              </Select>
            </FieldLabel>
          </div>

          <div className="space-y-3 rounded-xl border p-3">
            <div className="text-xs font-semibold">Quyền sửa & surface</div>
            <FieldLabel label="editMode">
              <Select value={field.editMode ?? "auto"} onValueChange={(value) => apply(editModePatch(value === "auto" ? undefined : value as DocField["editMode"]))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">Tự suy từ cờ Frappe</SelectItem>{EDIT_MODES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </FieldLabel>
            <FieldLabel label="surface">
              <Select value={field.surface ?? "auto"} onValueChange={(value) => apply(surfacePatch(value === "auto" ? undefined : value as DocField["surface"], field))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">Tự suy</SelectItem>{SURFACES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </FieldLabel>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs">
              <Checkbox checked={field.serverEnforced === true} onCheckedChange={(value) => apply({ serverEnforced: Boolean(value) })} />
              <span><strong className="block">serverEnforced</strong><span className="mt-0.5 block text-muted-foreground">Đánh dấu field do server/workflow/formula sở hữu. Đây không phải quyền client-side.</span></span>
            </label>
            <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] leading-4 text-muted-foreground">
              `readonly`, `set_once`, `hidden` được đồng bộ về `read_only`, `set_only_once`, `hidden` để đường Frappe legacy và canonical contract không nói hai điều khác nhau.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
