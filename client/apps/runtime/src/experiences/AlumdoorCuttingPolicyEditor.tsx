import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildMetadataDefaults,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import {
  useDoc,
  useMeta,
  useMetaForge,
} from "@metaforge/views";
import {
  Button,
  Input,
  Label,
  Switch,
  Textarea,
  controlBase,
  toast,
} from "@metaforge/ui";

const DOCTYPE = "Cutting Policy";

const BASIC_FIELDS = [
  "policy_name",
  "door_type",
  "ray_type",
  "item_group",
  "dealer_width_basis",
  "dealer_cut_deduction_m",
  "retail_width_basis",
  "retail_cut_deduction_m",
  "butterfly_cut_deduction_m",
  "purchase_formula",
  "purchase_height_basis",
  "purchase_width_basis",
  "dealer_split_sales_basis",
  "dealer_full_sales_basis",
  "retail_sales_basis",
  "manual_pull_sales_basis",
  "leaf_formula",
  "height_pb_offset_m",
  "leaf_height_deduction_m",
  "leaf_divisor_source",
  "leaf_divisor_const",
  "leaf_rounding",
  "leaf_round_threshold",
  "priority",
  "note",
  "disabled",
] as const;

type BasicField = typeof BASIC_FIELDS[number];
type Draft = Record<string, unknown>;
type Capabilities = { create?: boolean; write?: boolean };

type DoorPreset = Partial<Record<BasicField, unknown>>;

const DOOR_PRESETS: Record<string, DoorPreset> = {
  "Cửa Đức": {
    dealer_width_basis: "Phủ bì nhựa",
    retail_width_basis: "Phủ bì ray",
    dealer_cut_deduction_m: 0.02,
    retail_cut_deduction_m: 0.08,
    butterfly_cut_deduction_m: null,
    purchase_formula: "Kg thực tế",
    purchase_height_basis: null,
    purchase_width_basis: null,
    dealer_split_sales_basis: "Phủ bì nhựa",
    dealer_full_sales_basis: "Phủ bì nhựa",
    retail_sales_basis: "Phủ bì ray",
    manual_pull_sales_basis: null,
  },
  "Cửa Úc": {
    dealer_width_basis: "Phủ bì ray",
    retail_width_basis: "Phủ bì ray",
    dealer_cut_deduction_m: 0.03,
    retail_cut_deduction_m: 0.03,
    butterfly_cut_deduction_m: null,
    purchase_formula: "Barem kg/m2",
    purchase_height_basis: "Cao phủ bì",
    purchase_width_basis: "Rộng cắt lá",
    dealer_split_sales_basis: "Phủ bì ray",
    dealer_full_sales_basis: "Phủ bì ray",
    retail_sales_basis: "Phủ bì ray",
    manual_pull_sales_basis: null,
  },
  "Cửa Lưới": {
    dealer_width_basis: "Phủ bì ray",
    retail_width_basis: "Phủ bì ray",
    dealer_cut_deduction_m: 0.03,
    retail_cut_deduction_m: 0.03,
    butterfly_cut_deduction_m: 0.035,
    purchase_formula: "Barem kg/m2",
    purchase_height_basis: "Cao lưới",
    purchase_width_basis: "Rộng cắt lá",
    dealer_split_sales_basis: "Rộng cắt lá",
    dealer_full_sales_basis: "Phủ bì ray",
    retail_sales_basis: "Phủ bì ray",
    manual_pull_sales_basis: null,
  },
  "Cửa Đài Loan": {
    dealer_width_basis: "Phủ bì ray",
    retail_width_basis: "Phủ bì ray",
    dealer_cut_deduction_m: 0.03,
    retail_cut_deduction_m: 0.03,
    butterfly_cut_deduction_m: 0.035,
    purchase_formula: "Barem kg/m2",
    purchase_height_basis: "Cao lưới",
    purchase_width_basis: "Rộng cắt lá",
    dealer_split_sales_basis: "Rộng cắt lá",
    dealer_full_sales_basis: "Phủ bì ray",
    retail_sales_basis: "Phủ bì ray",
    manual_pull_sales_basis: "Phủ bì ray",
  },
  "Cửa Siêu Trường": {
    dealer_width_basis: "Phủ bì ray",
    retail_width_basis: "Phủ bì ray",
    dealer_cut_deduction_m: 0.03,
    retail_cut_deduction_m: 0.03,
    butterfly_cut_deduction_m: 0.035,
    purchase_formula: "Barem kg/m2",
    purchase_height_basis: "Cao lưới",
    purchase_width_basis: "Rộng cắt lá",
    dealer_split_sales_basis: "Rộng cắt lá",
    dealer_full_sales_basis: "Rộng cắt lá",
    retail_sales_basis: "Phủ bì ray",
    manual_pull_sales_basis: null,
  },
};

function options(field?: DocField): string[] {
  if (!field || typeof field.options !== "string") return [];
  return field.options.split("\n").map((value) => value.trim()).filter(Boolean);
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function numberValue(value: unknown): string {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function compactFormula(draft: Draft): string[] {
  const dealerBasis = text(draft.dealer_width_basis);
  const retailBasis = text(draft.retail_width_basis);
  const dealerDeduct = numberValue(draft.dealer_cut_deduction_m);
  const retailDeduct = numberValue(draft.retail_cut_deduction_m);
  const butterfly = numberValue(draft.butterfly_cut_deduction_m);
  const purchase = text(draft.purchase_formula);
  const purchaseHeight = text(draft.purchase_height_basis);
  const purchaseWidth = text(draft.purchase_width_basis);
  return [
    dealerBasis && dealerDeduct ? `Đại lý: ${dealerBasis} − ${dealerDeduct} m` : "",
    retailBasis && retailDeduct ? `Khách lẻ: ${retailBasis} − ${retailDeduct} m` : "",
    butterfly ? `Có bản bướm: trừ ${butterfly} m` : "",
    purchase === "Kg thực tế"
      ? "Mua: số kg thực tế × đơn giá"
      : purchase ? `Mua: barem kg/m² × (${purchaseHeight || "…"} × ${purchaseWidth || "…"}) × đơn giá` : "",
  ].filter(Boolean);
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NativeSelect({ value, choices, disabled, onChange }: { value: unknown; choices: string[]; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <select
      className={`${controlBase} h-9 w-full bg-background px-3 text-sm`}
      value={text(value)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">— Chọn —</option>
      {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
    </select>
  );
}

export function AlumdoorCuttingPolicyEditor({ name, onBack, onOpenRaw }: {
  name: string;
  onBack: () => void;
  onOpenRaw: (name: string) => void;
}) {
  const isNew = name === "new";
  const { adapter, scopeKey } = useMetaForge();
  const queryClient = useQueryClient();
  const metaQ = useMeta(DOCTYPE);
  const docQ = useDoc(DOCTYPE, isNew ? "" : name);
  const meta = metaQ.data;
  const existing = !isNew ? docQ.data?.doc : undefined;
  const [draft, setDraft] = useState<Draft>({});
  const [baseline, setBaseline] = useState<Draft>({});
  const [caps, setCaps] = useState<Capabilities>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    adapter.getCapabilities(DOCTYPE, isNew ? undefined : name)
      .then((value) => { if (active) setCaps(value); })
      .catch(() => { if (active) setCaps({}); });
    return () => { active = false; };
  }, [adapter, isNew, name]);

  useEffect(() => {
    if (!meta) return;
    const source = isNew
      ? ({ name: "new", doctype: DOCTYPE, docstatus: 0, __islocal: 1, ...buildMetadataDefaults(meta) } as Doc)
      : existing;
    if (!source) return;
    const next = { ...source } as Draft;
    setDraft(next);
    setBaseline(next);
  }, [meta, existing, isNew]);

  const byName = useMemo(() => new Map((meta?.fields ?? []).map((field) => [field.fieldname, field])), [meta]);
  const canWrite = isNew ? Boolean(caps.create) : Boolean(caps.write);
  const dirty = useMemo(() => BASIC_FIELDS.some((field) => text(draft[field]) !== text(baseline[field])), [draft, baseline]);
  const set = (field: BasicField, value: unknown) => setDraft((current) => ({ ...current, [field]: value }));
  const doorType = text(draft.door_type);
  const purchaseFormula = text(draft.purchase_formula);
  const leafDivisorSource = text(draft.leaf_divisor_source);
  const leafRounding = text(draft.leaf_rounding);

  const applyPreset = () => {
    const preset = DOOR_PRESETS[doorType];
    if (!preset) return;
    setDraft((current) => ({ ...current, ...preset }));
    toast.success(`Đã áp công thức chuẩn cho ${doorType}. Kiểm tra rồi lưu.`);
  };

  const save = async () => {
    if (!meta || !canWrite || saving) return;
    setSaving(true);
    try {
      if (isNew) {
        const full = serializeCreateDocument(meta, draft);
        const created = await adapter.createDoc(DOCTYPE, full);
        toast.success("Đã tạo công thức cửa.");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", DOCTYPE] }),
          queryClient.invalidateQueries({ queryKey: [scopeKey, "list", DOCTYPE] }),
          queryClient.invalidateQueries({ queryKey: [scopeKey, "count", DOCTYPE] }),
        ]);
        onOpenRaw(String(created.name));
        return;
      }
      const changed = Object.fromEntries(BASIC_FIELDS
        .filter((field) => text(draft[field]) !== text(baseline[field]))
        .map((field) => [field, draft[field] ?? null]));
      if (!Object.keys(changed).length) return;
      const updated = await adapter.updateDoc(DOCTYPE, name, changed, String(existing?.modified ?? ""));
      const next = { ...draft, ...updated } as Draft;
      setDraft(next);
      setBaseline(next);
      toast.success("Đã lưu công thức cửa.");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [scopeKey, "doc", DOCTYPE, name] }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", DOCTYPE] }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list", DOCTYPE] }),
      ]);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (metaQ.isLoading || (!isNew && docQ.isLoading)) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Đang tải công thức…</div>;
  if (metaQ.error || (!isNew && docQ.error)) {
    const error = metaQ.error ?? docQ.error;
    return <div className="p-5 text-sm text-destructive">{adapter.mapError(error).message}</div>;
  }
  if (!meta || (!isNew && !existing)) return <div className="p-5 text-sm text-muted-foreground">Không có dữ liệu.</div>;

  const select = (field: BasicField, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NativeSelect value={draft[field]} choices={options(byName.get(field))} disabled={!canWrite} onChange={(value) => set(field, value || null)} />
    </Field>
  );
  const numeric = (field: BasicField, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="number" step="0.001" value={numberValue(draft[field])} disabled={!canWrite} onChange={(event) => set(field, event.target.value === "" ? null : Number(event.target.value))} />
    </Field>
  );

  return (
    <div className="h-full overflow-auto bg-muted/20">
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 md:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={onBack}>← Danh sách công thức</Button>
            <h1 className="text-xl font-semibold">{isNew ? "Tạo công thức cửa" : text(draft.policy_name) || name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Chỉ cấu hình theo nghiệp vụ: rộng cắt, mua, bán và chia lá. Các field kỹ thuật phụ được gom xuống Thiết lập nâng cao.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew ? <Button variant="outline" onClick={() => onOpenRaw(name)}>Cấu hình kỹ thuật đầy đủ</Button> : null}
            <Button disabled={!canWrite || !dirty || saving} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu công thức"}</Button>
          </div>
        </header>

        <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
          <Field label="Tên chính sách"><Input value={text(draft.policy_name)} disabled={!canWrite || !isNew} onChange={(event) => set("policy_name", event.target.value)} /></Field>
          {select("door_type", "Loại cửa")}
          {byName.has("ray_type") ? select("ray_type", "Loại ray") : null}
          <Button variant="outline" disabled={!canWrite || !DOOR_PRESETS[doorType]} onClick={applyPreset}>Áp công thức chuẩn</Button>
          <div className="md:col-span-full"><Field label="Nhóm hàng áp dụng" hint="Để trống nếu công thức áp dụng cho mọi nhóm của loại cửa."><Input value={text(draft.item_group)} disabled={!canWrite} onChange={(event) => set("item_group", event.target.value || null)} /></Field></div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="1. Rộng cắt lá" description="Mọi cách nhập rộng được quy về rộng cắt lá. Người vận hành chỉ chọn cơ sở đo và số mét cần trừ.">
            {select("dealer_width_basis", "Đại lý — lấy rộng từ")}
            {numeric("dealer_cut_deduction_m", "Đại lý — trừ khi cắt (m)")}
            {select("retail_width_basis", "Khách lẻ — lấy rộng từ")}
            {numeric("retail_cut_deduction_m", "Khách lẻ — trừ khi cắt (m)")}
            {numeric("butterfly_cut_deduction_m", "Có bản bướm — trừ (m)", "Để trống nếu loại cửa không có ngoại lệ bản bướm.")}
          </Card>

          <Card title="2. Công thức mua" description="Chọn mua theo kg thực tế hoặc barem kg/m². Chỉ khi dùng barem mới cần chọn chiều cao và chiều rộng.">
            {select("purchase_formula", "Cách tính mua")}
            {purchaseFormula === "Barem kg/m2" ? select("purchase_height_basis", "Chiều cao dùng để tính") : null}
            {purchaseFormula === "Barem kg/m2" ? select("purchase_width_basis", "Chiều rộng dùng để tính") : null}
          </Card>

          <Card title="3. Công thức bán" description="Chọn đúng loại rộng dùng để nhân với chiều cao phủ bì trong từng tình huống bán hàng.">
            {select("dealer_split_sales_basis", "Đại lý — tách món")}
            {select("dealer_full_sales_basis", "Đại lý — trọn bộ")}
            {select("retail_sales_basis", "Khách lẻ")}
            {select("manual_pull_sales_basis", "Cửa kéo tay", "Chỉ dùng khi loại cửa có ngoại lệ kéo tay.")}
          </Card>

          <Card title="4. Chia lá" description="Phần chia lá được tách khỏi rộng cắt/mua/bán để tránh phải đọc một form kỹ thuật dài từ trên xuống dưới.">
            {byName.has("leaf_formula") ? select("leaf_formula", "Kiểu chia lá") : null}
            {byName.has("height_pb_offset_m") ? numeric("height_pb_offset_m", "Cao phủ bì cộng thêm (m)") : null}
            {byName.has("leaf_height_deduction_m") ? numeric("leaf_height_deduction_m", "Số trừ trước khi chia lá (m)") : null}
            {byName.has("leaf_divisor_source") ? select("leaf_divisor_source", "Nguồn bản lá") : null}
            {byName.has("leaf_divisor_const") && leafDivisorSource === "Hằng số của chính sách" ? numeric("leaf_divisor_const", "Hằng số chia lá") : null}
            {byName.has("leaf_rounding") ? select("leaf_rounding", "Cách làm tròn") : null}
            {byName.has("leaf_round_threshold") && leafRounding === "Ngưỡng trừ-một-lá" ? numeric("leaf_round_threshold", "Ngưỡng làm tròn") : null}
          </Card>
        </div>

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Công thức đang hiểu</h2>
            <p className="mt-1 text-xs text-muted-foreground">Đọc nhanh trước khi lưu, không phải công thức tính lại ở client.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {compactFormula(draft).map((line) => <div key={line} className="rounded-lg border bg-muted/25 px-3 py-2 text-sm">{line}</div>)}
          </div>
        </section>

        <details className="rounded-xl border bg-card shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Thiết lập nâng cao</summary>
          <div className="grid gap-4 border-t p-4 md:grid-cols-2">
            {byName.has("priority") ? numeric("priority", "Độ ưu tiên") : null}
            <Field label="Ngừng áp dụng"><div className="flex h-9 items-center"><Switch checked={Boolean(Number(draft.disabled ?? 0))} disabled={!canWrite} onCheckedChange={(checked) => set("disabled", checked ? 1 : 0)} /></div></Field>
            {byName.has("note") ? <div className="md:col-span-2"><Field label="Ghi chú / nguồn"><Textarea value={text(draft.note)} disabled={!canWrite} onChange={(event) => set("note", event.target.value)} /></Field></div> : null}
            {!isNew ? <div className="md:col-span-2"><Button variant="outline" onClick={() => onOpenRaw(name)}>Mở toàn bộ field kỹ thuật / bảng ngoại lệ</Button></div> : null}
          </div>
        </details>
      </div>
    </div>
  );
}
