/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  ExternalLink,
  Eye,
  Loader2,
  Plus,
  Ruler,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
type TabId = "overview" | "fields" | "cutting" | "items" | "preview";
type Severity = "blocking" | "warning";

type ScopeRow = Json & {
  item_group?: string;
};

type ProfileFieldRow = Json & {
  geometry_field?: string;
  role?: "INPUT" | "CALCULATED" | "INFO" | string;
  required?: boolean | number;
  visible?: boolean | number;
  editable?: boolean | number;
  sequence?: number | string;
};

type GeometryProfileDoc = Json & {
  name?: string;
  modified?: string;
  profile_code?: string;
  profile_name?: string;
  item_groups?: ScopeRow[];
  fields?: ProfileFieldRow[];
  note?: string;
  disabled?: boolean | number;
};

type GeometryFieldDoc = Json & {
  name?: string;
  modified?: string;
  field_code?: string;
  field_name?: string;
  runtime_fieldname?: string;
  uom?: string;
  axis?: string;
  disabled?: boolean | number;
};

type CuttingPolicyDoc = Json & {
  name?: string;
  door_type?: string;
  geometry_profile?: string;
  disabled?: boolean | number;
};

type ItemUsageDoc = Json & {
  name?: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  door_type?: string;
  geometry_profile?: string;
  cutting_policy?: string;
  disabled?: boolean | number;
};

type Issue = {
  severity: Severity;
  message: string;
};

type Options = {
  itemGroups: Doc[];
  geometryFields: GeometryFieldDoc[];
  cuttingPolicies: CuttingPolicyDoc[];
  items: ItemUsageDoc[];
};

export interface DoorGeometryWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const EMPTY_OPTIONS: Options = { itemGroups: [], geometryFields: [], cuttingPolicies: [], items: [] };
const ROLES = ["INPUT", "CALCULATED", "INFO"] as const;
const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const tableFieldClass = "h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function on(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function sequence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function rows<T extends Json>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((row): row is T => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}
function optionName(row: Doc): string { return text(row.name); }
function geometryFieldKey(row: GeometryFieldDoc): string { return text(row.field_code) || text(row.name); }
function geometryFieldLabel(row: GeometryFieldDoc): string { return text(row.field_name) || geometryFieldKey(row); }
function emptyProfile(): GeometryProfileDoc {
  return { profile_code: "", profile_name: "", item_groups: [], fields: [], note: "", disabled: 0 };
}
function normalizeProfile(value: GeometryProfileDoc): GeometryProfileDoc {
  return {
    ...emptyProfile(),
    ...value,
    item_groups: rows<ScopeRow>(value.item_groups),
    fields: rows<ProfileFieldRow>(value.fields),
  };
}
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}
function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function DoorGeometryWorkbench({ name, base, listPath, onNavigate, onSaved, onCancel }: DoorGeometryWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<GeometryProfileDoc>(emptyProfile);
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [originalBindings, setOriginalBindings] = useState<Record<string, string>>({});
  const [loadedFingerprint, setLoadedFingerprint] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const [itemGroups, geometryFieldList, cuttingPolicies, items, loadedProfile] = await Promise.all([
          adapter.getList("Item Group", { fields: ["name"], orderBy: "name asc", pageLength: 400 }),
          adapter.getList("Geometry Field", { fields: ["name", "field_code", "field_name", "uom", "axis", "disabled", "modified"], orderBy: "field_name asc", pageLength: 100 }),
          adapter.getList("Cutting Policy", { fields: ["name", "door_type", "geometry_profile", "disabled"], orderBy: "name asc", pageLength: 100 }).catch(() => [] as Doc[]),
          adapter.getList("Item", { fields: ["name", "item_code", "item_name", "item_group", "door_type", "geometry_profile", "cutting_policy", "disabled"], orderBy: "item_code asc", pageLength: 1000 }).catch(() => [] as Doc[]),
          name ? adapter.getDoc("Geometry Profile", name).then((result) => result.doc as GeometryProfileDoc) : Promise.resolve(emptyProfile()),
        ]);

        const detailedGeometryFields = await Promise.all((geometryFieldList as GeometryFieldDoc[]).map(async (row) => {
          const target = text(row.name) || text(row.field_code);
          if (!target) return row;
          try {
            const detail = await adapter.getDoc("Geometry Field", target);
            return { ...row, ...(detail.doc as GeometryFieldDoc) };
          } catch {
            return row;
          }
        }));
        if (!active) return;

        const normalized = normalizeProfile(loadedProfile);
        const nextBindings = Object.fromEntries(detailedGeometryFields.map((row) => [geometryFieldKey(row), text(row.runtime_fieldname)]));
        setDoc(normalized);
        setOptions({
          itemGroups,
          geometryFields: detailedGeometryFields,
          cuttingPolicies: cuttingPolicies as CuttingPolicyDoc[],
          items: items as ItemUsageDoc[],
        });
        setBindings(nextBindings);
        setOriginalBindings(nextBindings);
        setLoadedFingerprint(JSON.stringify({ doc: normalized, bindings: nextBindings }));
      } catch (error) {
        if (active) toast.error(adapter.mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, name]);

  const profileFields = rows<ProfileFieldRow>(doc.fields);
  const scopes = rows<ScopeRow>(doc.item_groups);
  const profileIdentity = text(doc.profile_code) || text(doc.name) || text(name);
  const fieldByKey = useMemo(() => {
    const map = new Map<string, GeometryFieldDoc>();
    for (const field of options.geometryFields) {
      const key = geometryFieldKey(field);
      if (key) map.set(key, field);
      if (text(field.name)) map.set(text(field.name), field);
    }
    return map;
  }, [options.geometryFields]);

  const relatedPolicies = useMemo(() => options.cuttingPolicies.filter((row) => {
    const linked = text(row.geometry_profile);
    return Boolean(profileIdentity) && linked === profileIdentity;
  }), [options.cuttingPolicies, profileIdentity]);

  const usedItems = useMemo(() => options.items.filter((row) => {
    const linked = text(row.geometry_profile);
    return Boolean(profileIdentity) && linked === profileIdentity;
  }), [options.items, profileIdentity]);

  const runtimeRows = useMemo(() => profileFields
    .map((row) => {
      const key = text(row.geometry_field);
      const master = fieldByKey.get(key);
      return {
        geometry_field: key,
        label: master ? geometryFieldLabel(master) : key,
        runtime_fieldname: bindings[key] ?? text(master?.runtime_fieldname),
        role: text(row.role),
        visible: on(row.visible),
        required: on(row.required),
        editable: on(row.editable),
        sequence: sequence(row.sequence),
        uom: text(master?.uom),
      };
    })
    .sort((left, right) => left.sequence - right.sequence || left.geometry_field.localeCompare(right.geometry_field)), [bindings, fieldByKey, profileFields]);

  const issues = useMemo<Issue[]>(() => {
    const result: Issue[] = [];
    const seenFields = new Set<string>();
    const seenRuntime = new Map<string, string>();
    const seenSequence = new Set<number>();

    for (const row of profileFields) {
      const key = text(row.geometry_field);
      const role = text(row.role);
      const runtime = text(bindings[key] ?? fieldByKey.get(key)?.runtime_fieldname);
      const seq = sequence(row.sequence);
      if (!key) {
        result.push({ severity: "blocking", message: "Có dòng chưa chọn Geometry Field." });
        continue;
      }
      if (!fieldByKey.has(key)) result.push({ severity: "blocking", message: `${key}: Geometry Field không tồn tại trong danh mục.` });
      if (seenFields.has(key)) result.push({ severity: "blocking", message: `${key}: bị lặp trong cùng profile.` });
      seenFields.add(key);
      if (!ROLES.includes(role as (typeof ROLES)[number])) result.push({ severity: "blocking", message: `${key}: vai trò ${role || "(trống)"} không hợp lệ.` });
      if (on(row.required) && !on(row.visible)) result.push({ severity: "blocking", message: `${key}: đang Bắt buộc nhưng lại Ẩn.` });
      if (role === "CALCULATED" && on(row.editable)) result.push({ severity: "blocking", message: `${key}: Tự tính không được Cho nhập.` });
      if (role === "INPUT" && !on(row.editable)) result.push({ severity: "warning", message: `${key}: là Nhập liệu nhưng đang tắt Cho nhập.` });
      if (on(row.visible) && role === "INPUT" && !runtime) result.push({ severity: "warning", message: `${key}: chưa có runtime_fieldname; Sales chưa thể bind ô này nếu chưa có renderer động.` });
      if (runtime && !/^[a-z][a-z0-9_]*$/.test(runtime)) result.push({ severity: "blocking", message: `${key}: runtime_fieldname "${runtime}" không đúng snake_case.` });
      if (runtime) {
        const previous = seenRuntime.get(runtime);
        if (previous && previous !== key) result.push({ severity: "blocking", message: `${key} và ${previous} cùng bind vào ${runtime}.` });
        else seenRuntime.set(runtime, key);
      }
      if (seenSequence.has(seq)) result.push({ severity: "warning", message: `Thứ tự ${seq} đang dùng cho nhiều field; hệ thống vẫn sắp ổn định theo mã.` });
      seenSequence.add(seq);
    }
    return result;
  }, [bindings, fieldByKey, profileFields]);

  const fingerprint = useMemo(() => JSON.stringify({ doc, bindings }), [bindings, doc]);
  const dirty = Boolean(loadedFingerprint) && fingerprint !== loadedFingerprint;
  const blocking = issues.filter((issue) => issue.severity === "blocking");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  const patch = (next: Partial<GeometryProfileDoc>) => setDoc((current) => ({ ...current, ...next }));
  const patchFieldRow = (index: number, next: Partial<ProfileFieldRow>) => patch({
    fields: profileFields.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  });
  const patchScope = (index: number, next: Partial<ScopeRow>) => patch({
    item_groups: scopes.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  });

  const validate = (): string | null => {
    if (!name && !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(text(doc.profile_code))) return "Mã bộ quy cách phải là mã IN HOA/số/gạch ngang, ví dụ GP-CUA-DUC.";
    if (!text(doc.profile_name)) return "Tên bộ quy cách không được để trống.";
    if (!profileFields.length) return "Bộ quy cách phải có ít nhất một Geometry Field.";
    if (scopes.some((row) => !text(row.item_group))) return "Mỗi dòng Nhóm hàng áp dụng phải chọn một Nhóm hàng.";
    const duplicateScope = scopes.map((row) => text(row.item_group)).find((value, index, all) => value && all.indexOf(value) !== index);
    if (duplicateScope) return `Nhóm hàng ${duplicateScope} bị lặp trong phạm vi.`;
    if (blocking.length) return blocking[0]!.message;
    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }
    setSaving(true);
    try {
      const payload: GeometryProfileDoc = {
        ...doc,
        profile_code: text(doc.profile_code),
        profile_name: text(doc.profile_name),
        note: text(doc.note),
        item_groups: scopes.map((row) => ({ ...row, item_group: text(row.item_group) })),
        fields: profileFields.map((row) => ({
          ...row,
          geometry_field: text(row.geometry_field),
          role: text(row.role),
          required: on(row.required) ? 1 : 0,
          visible: on(row.visible) ? 1 : 0,
          editable: on(row.editable) ? 1 : 0,
          sequence: sequence(row.sequence),
        })),
      };

      let savedName = name ?? "";
      if (name) {
        const updated = await adapter.updateDoc("Geometry Profile", name, payload, text(doc.modified));
        savedName = text((updated as Json).name) || name;
      } else {
        const created = await adapter.createDoc("Geometry Profile", payload);
        savedName = text((created as Json).name) || text(payload.profile_code);
      }

      const changedBindings = options.geometryFields.filter((field) => {
        const key = geometryFieldKey(field);
        return key && text(bindings[key]) !== text(originalBindings[key]);
      });
      for (const field of changedBindings) {
        const key = geometryFieldKey(field);
        const target = text(field.name) || key;
        await adapter.updateDoc("Geometry Field", target, { runtime_fieldname: text(bindings[key]) }, text(field.modified));
      }

      const savedDoc = { ...payload, name: savedName };
      const nextBindings = { ...bindings };
      setDoc(savedDoc);
      setOriginalBindings(nextBindings);
      setLoadedFingerprint(JSON.stringify({ doc: savedDoc, bindings: nextBindings }));
      toast.success(changedBindings.length ? `Đã lưu cấu hình cửa và ${changedBindings.length} runtime binding.` : "Đã lưu cấu hình cửa.");
      onSaved?.(savedName);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const openGeneric = () => onNavigate(`${currentPath}?master_ui=generic`);
  const openDoc = (doctype: string, target?: string) => onNavigate(target ? `${base}/${encodeURIComponent(doctype)}/${encodeURIComponent(target)}` : `${base}/${encodeURIComponent(doctype)}`);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải cấu hình cửa…</div>;

  const tabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
    { id: "overview", label: "Tổng quan", icon: <Settings2 className="size-4" /> },
    { id: "fields", label: "Trường nhập bán hàng", icon: <Ruler className="size-4" /> },
    { id: "cutting", label: "Công thức / Cutting", icon: <Calculator className="size-4" /> },
    { id: "items", label: "Item áp dụng", icon: <ExternalLink className="size-4" /> },
    { id: "preview", label: "Preview", icon: <Eye className="size-4" /> },
  ];

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-door-geometry-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{name ? `${text(doc.profile_name) || name}` : "Tạo cấu hình cửa"}</h2>
              {on(doc.disabled) ? <Badge variant="destructive">Ngưng dùng</Badge> : <Badge variant="outline">Đang dùng</Badge>}
              {dirty ? <Badge variant="outline">Chưa lưu</Badge> : null}
              {blocking.length ? <Badge variant="destructive">{blocking.length} lỗi chặn</Badge> : warnings.length ? <Badge variant="outline">{warnings.length} cảnh báo</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Danh mục quyết định cửa cần field nào; Cutting Policy tính; Sales chỉ đọc contract và render.</p>
          </div>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={openGeneric}>Form đầy đủ</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">{tabs.map((entry) => <Button key={entry.id} size="sm" variant={tab === entry.id ? "default" : "ghost"} onClick={() => setTab(entry.id)}>{entry.icon}{entry.label}</Button>)}</div>
    </header>

    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-4">
        {issues.length ? <section className={`rounded-xl border p-4 ${blocking.length ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <div className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Kiểm tra cấu hình</div>
          <ul className="space-y-1 text-sm text-muted-foreground">{issues.map((issue, index) => <li key={`${issue.severity}-${index}`}>• {issue.severity === "blocking" ? "Lỗi: " : "Cảnh báo: "}{issue.message}</li>)}</ul>
        </section> : null}

        {tab === "overview" ? <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-1 font-medium">Nhận diện cấu hình cửa</h3>
            <p className="mb-4 text-xs text-muted-foreground">Một Geometry Profile là một cấu hình nhập liệu hình học dùng lại cho nhiều Item.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Mã bộ quy cách"><input className={fieldClass} value={text(doc.profile_code)} disabled={Boolean(name)} onChange={(event) => patch({ profile_code: event.target.value.toUpperCase() })} placeholder="GP-CUA-DUC" /></Field>
              <Field label="Tên cấu hình"><input className={fieldClass} value={text(doc.profile_name)} onChange={(event) => patch({ profile_name: event.target.value })} placeholder="Cửa Đức" /></Field>
              <Field label="Ghi chú" className="md:col-span-2"><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" value={text(doc.note)} onChange={(event) => patch({ note: event.target.value })} /></Field>
              <div className="md:col-span-2"><Check label="Ngừng dùng cấu hình này" checked={on(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /></div>
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Nhóm hàng áp dụng</h3><p className="text-xs text-muted-foreground">Không hard-code loại cửa trong TSX.</p></div><Button size="sm" variant="outline" onClick={() => patch({ item_groups: [...scopes, { item_group: "" }] })}><Plus className="size-4" /> Thêm</Button></div>
            <div className="space-y-2 p-3">{scopes.length ? scopes.map((row, index) => <div key={text(row.name) || index} className="flex gap-2"><select className={fieldClass} value={text(row.item_group)} onChange={(event) => patchScope(index, { item_group: event.target.value })}><option value="">— chọn nhóm hàng —</option>{options.itemGroups.map((option) => <option key={optionName(option)} value={optionName(option)}>{optionName(option)}</option>)}</select><Button size="sm" variant="ghost" onClick={() => patch({ item_groups: scopes.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 className="size-4" /></Button></div>) : <div className="py-5 text-center text-sm text-muted-foreground">Chưa giới hạn theo nhóm hàng.</div>}</div>
          </section>
        </div> : null}

        {tab === "fields" ? <section className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><h3 className="font-medium">Trường nhập bán hàng</h3><p className="text-xs text-muted-foreground">Binding runtime thuộc Geometry Field toàn cục; role/hiện/bắt buộc/cho nhập thuộc profile này.</p></div><Button size="sm" variant="outline" onClick={() => patch({ fields: [...profileFields, { geometry_field: "", role: "INPUT", required: 0, visible: 1, editable: 1, sequence: (profileFields.length + 1) * 10 }] })}><Plus className="size-4" /> Thêm field</Button></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="w-20 p-3">Thứ tự</th><th className="min-w-64 p-3">Geometry Field</th><th className="min-w-52 p-3">runtime_fieldname</th><th className="w-40 p-3">Vai trò</th><th className="w-24 p-3 text-center">Hiện</th><th className="w-24 p-3 text-center">Bắt buộc</th><th className="w-24 p-3 text-center">Cho nhập</th><th className="w-24 p-3">ĐVT</th><th className="w-20 p-3" /></tr></thead><tbody>
            {profileFields.length ? profileFields.map((row, index) => {
              const key = text(row.geometry_field);
              const master = fieldByKey.get(key);
              const runtime = bindings[key] ?? text(master?.runtime_fieldname);
              return <tr key={text(row.name) || `${key}-${index}`} className="border-b align-top">
                <td className="p-2"><input className={tableFieldClass} type="number" value={sequence(row.sequence)} onChange={(event) => patchFieldRow(index, { sequence: event.target.value })} /></td>
                <td className="p-2"><div className="flex gap-1"><select className={tableFieldClass} value={key} onChange={(event) => patchFieldRow(index, { geometry_field: event.target.value })}><option value="">— chọn trường —</option>{options.geometryFields.filter((field) => !on(field.disabled)).map((field) => { const fieldKey = geometryFieldKey(field); return <option key={fieldKey} value={fieldKey}>{geometryFieldLabel(field)} · {fieldKey}</option>; })}</select>{key ? <Button size="sm" variant="ghost" onClick={() => openDoc("Geometry Field", text(master?.name) || key)}><ExternalLink className="size-4" /></Button> : null}</div>{master ? <div className="mt-1 text-[11px] text-muted-foreground">{text(master.axis)} · {text(master.uom)}</div> : null}</td>
                <td className="p-2"><input className={tableFieldClass} value={runtime} disabled={!key} onChange={(event) => key && setBindings((current) => ({ ...current, [key]: event.target.value.trim() }))} placeholder="ví dụ height_m" /><div className="mt-1 text-[11px] text-muted-foreground">Dùng chung ở mọi profile có field này.</div></td>
                <td className="p-2"><select className={tableFieldClass} value={text(row.role) || "INPUT"} onChange={(event) => patchFieldRow(index, { role: event.target.value, ...(event.target.value === "CALCULATED" ? { editable: 0 } : {}) })}>{ROLES.map((role) => <option key={role} value={role}>{role === "INPUT" ? "Nhập liệu" : role === "CALCULATED" ? "Tự tính" : "Thông tin"}</option>)}</select></td>
                <td className="p-2 text-center"><input type="checkbox" checked={on(row.visible)} onChange={(event) => patchFieldRow(index, { visible: event.target.checked ? 1 : 0 })} /></td>
                <td className="p-2 text-center"><input type="checkbox" checked={on(row.required)} onChange={(event) => patchFieldRow(index, { required: event.target.checked ? 1 : 0 })} /></td>
                <td className="p-2 text-center"><input type="checkbox" checked={on(row.editable)} disabled={text(row.role) === "CALCULATED"} onChange={(event) => patchFieldRow(index, { editable: event.target.checked ? 1 : 0 })} /></td>
                <td className="p-2 text-muted-foreground">{text(master?.uom) || "—"}</td>
                <td className="p-2"><Button size="sm" variant="ghost" onClick={() => patch({ fields: profileFields.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 className="size-4" /></Button></td>
              </tr>;
            }) : <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">Chưa có trường hình học. Thêm các input/calculated field mà loại cửa này thực sự dùng.</td></tr>}
          </tbody></table></div>
        </section> : null}

        {tab === "cutting" ? <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3"><h3 className="font-medium">Cutting Policy dùng Geometry Profile này</h3><p className="text-xs text-muted-foreground">Workbench chỉ nối và giải thích. Công thức vẫn nằm ở server/master Cutting Policy, không copy sang React.</p></div>
          <div className="divide-y">{relatedPolicies.length ? relatedPolicies.map((policy) => <div key={text(policy.name)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><div className="flex items-center gap-2"><span className="font-medium">{text(policy.name)}</span>{on(policy.disabled) ? <Badge variant="destructive">Ngưng dùng</Badge> : null}</div><div className="mt-1 text-xs text-muted-foreground">Loại cửa: {text(policy.door_type) || "—"} · profile: {text(policy.geometry_profile) || "—"}</div></div><Button size="sm" variant="outline" onClick={() => openDoc("Cutting Policy", text(policy.name))}><ExternalLink className="size-4" /> Mở công thức</Button></div>) : <div className="p-8 text-center text-sm text-muted-foreground">Chưa có Cutting Policy nào trỏ vào profile này. Không tự tạo công thức thay cho server.</div>}</div>
        </section> : null}

        {tab === "items" ? <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3"><h3 className="font-medium">Item đang sử dụng cấu hình</h3><p className="text-xs text-muted-foreground">Đọc trực tiếp Item.geometry_profile; không copy danh sách Item vào profile.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Mã</th><th className="p-3">Tên hàng</th><th className="p-3">Nhóm</th><th className="p-3">Loại cửa</th><th className="p-3">Cutting Policy</th><th className="w-20" /></tr></thead><tbody>{usedItems.length ? usedItems.map((item) => <tr key={text(item.name) || text(item.item_code)} className="border-b"><td className="p-3 font-medium">{text(item.item_code) || text(item.name)}</td><td className="p-3">{text(item.item_name)}</td><td className="p-3 text-muted-foreground">{text(item.item_group)}</td><td className="p-3 text-muted-foreground">{text(item.door_type) || "—"}</td><td className="p-3 text-muted-foreground">{text(item.cutting_policy) || "—"}</td><td className="p-2"><Button size="sm" variant="ghost" onClick={() => openDoc("Item", text(item.name) || text(item.item_code))}><ExternalLink className="size-4" /></Button></td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Chưa có Item nào gắn profile này.</td></tr>}</tbody></table></div>
        </section> : null}

        {tab === "preview" ? <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3"><h3 className="font-medium">Contract mà Sales có thể đọc</h3><p className="text-xs text-muted-foreground">Đây là preview cấu hình hiển thị, không phải preview công thức. Số cắt/diện tích vẫn phải gọi engine server.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="w-20 p-3">#</th><th className="p-3">Nhãn</th><th className="p-3">Geometry</th><th className="p-3">Runtime</th><th className="p-3">Vai trò</th><th className="p-3">Hiện</th><th className="p-3">Bắt buộc</th><th className="p-3">Cho nhập</th></tr></thead><tbody>{runtimeRows.length ? runtimeRows.map((row) => <tr key={`${row.geometry_field}-${row.sequence}`} className="border-b"><td className="p-3 text-muted-foreground">{row.sequence}</td><td className="p-3 font-medium">{row.label}</td><td className="p-3 text-muted-foreground">{row.geometry_field}</td><td className="p-3"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.runtime_fieldname || "chưa bind"}</code></td><td className="p-3">{row.role}</td><td className="p-3">{row.visible ? "Có" : "Không"}</td><td className="p-3">{row.required ? "Có" : "Không"}</td><td className="p-3">{row.editable ? "Có" : "Không"}</td></tr>) : <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">Chưa có contract vì profile chưa có field.</td></tr>}</tbody></table></div>
          <div className="border-t p-4 text-xs text-muted-foreground">Sales Catalog Driven task sau chỉ cần lấy danh sách này từ server và bỏ các nhánh `if (doorType === ...)`; màn này không sửa sâu Sales Order.</div>
        </section> : null}
      </div>
    </div>
  </div>;
}
