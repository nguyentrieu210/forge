/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Send } from "lucide-react";
import {
  applyContextPolicy,
  mapError,
  serializeCreateDocument,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";
import { MetadataChildGrid } from "../../../form/MetadataChildGrid.js";
import { AlumdoorSalesOrderField, fallbackField } from "./sales-order-v2/AlumdoorSalesOrderField.js";

type Json = Record<string, unknown>;

export interface AlumdoorPurchaseOrderCreateProps {
  name?: string;
  closeRequest?: number;
  onCreated: (name: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function numberValue(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positive(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function today(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function money(value: unknown): string {
  const parsed = numberValue(value) ?? 0;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(parsed);
}

function resolveDefault(field: DocField): unknown {
  if (field.default === undefined || field.default === null || field.default === "") return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return today();
  return field.default;
}

function blankFromMeta(meta: DocTypeMeta): Json {
  const result: Json = {};
  for (const field of meta.fields ?? []) {
    const value = resolveDefault(field);
    if (value !== undefined) result[field.fieldname] = value;
  }
  return result;
}

function newChildRow(meta: DocTypeMeta, index: number): Doc {
  const row: Doc = {
    name: `new-purchase-row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    doctype: meta.name,
  } as Doc;
  for (const field of meta.fields ?? []) {
    const value = resolveDefault(field);
    if (value !== undefined) row[field.fieldname] = value;
  }
  return row;
}

function fieldValueForServer(fieldtype: DocField["fieldtype"], value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (["Float", "Int", "Currency", "Percent"].includes(fieldtype)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function mergePurchaseItemFilters(filters: Record<string, unknown> | Array<unknown> | undefined): Record<string, unknown> | Array<unknown> {
  if (Array.isArray(filters)) {
    return [
      ...filters,
      ["Item", "is_purchase_item", "=", 1],
      ["Item", "disabled", "=", 0],
    ];
  }
  return {
    ...(filters ?? {}),
    is_purchase_item: 1,
    disabled: 0,
  };
}

function cleanChildRow(row: Doc, childMeta: DocTypeMeta, keepIdentity: boolean): Json {
  const allowed = new Set((childMeta.fields ?? []).map((field) => field.fieldname));
  const result: Json = {};
  for (const [fieldname, value] of Object.entries(row)) {
    if (value === undefined || value === null || value === "") continue;
    if (allowed.has(fieldname)) result[fieldname] = value;
  }
  if (keepIdentity && text(row.name) && !text(row.name).startsWith("new-")) {
    result.name = row.name;
    result.doctype = row.doctype || childMeta.name;
  }
  return result;
}

function applyChildPreview(row: Doc, preview: Json, childMeta: DocTypeMeta): Doc {
  const fields = new Set((childMeta.fields ?? []).map((field) => field.fieldname));
  const next = { ...row } as Doc;
  for (const fieldname of Array.isArray(preview.clear) ? preview.clear.map(text) : []) {
    if (fields.has(fieldname)) next[fieldname] = undefined;
  }
  const patch = preview.patch && typeof preview.patch === "object" && !Array.isArray(preview.patch)
    ? preview.patch as Json
    : {};
  for (const [fieldname, value] of Object.entries(patch)) {
    if (fields.has(fieldname)) next[fieldname] = value;
  }
  return next;
}

export function AlumdoorPurchaseOrderCreate(props: AlumdoorPurchaseOrderCreateProps) {
  const { adapter, scopeKey, businessContext, contextPolicies, registry, services, roles } = useMetaForge();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [childMeta, setChildMeta] = useState<DocTypeMeta | null>(null);
  const [header, setHeader] = useState<Json>({});
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState("");
  const [sourceModified, setSourceModified] = useState("");
  const [docstatus, setDocstatus] = useState(0);
  const [canCreate, setCanCreate] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const closeSeen = useRef(props.closeRequest ?? 0);

  const documentName = text(props.name);
  const isExisting = Boolean(documentName);
  const formReadOnly = isExisting && (!canWrite || docstatus !== 0);
  const canSave = isExisting ? !formReadOnly : canCreate;

  const purchaseServices = useMemo<FieldServices>(() => ({
    ...services,
    searchLink: async (doctype, query, options) => {
      if (!services.searchLink) return [];
      if (doctype !== "Item") return services.searchLink(doctype, query, options);
      return services.searchLink(doctype, query, {
        ...options,
        filters: mergePurchaseItemFilters(options?.filters),
        pageLength: Math.max(options?.pageLength ?? 10, 50),
      });
    },
  }), [services]);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const purchaseMeta = await adapter.getMeta("Purchase Order");
        const itemsField = purchaseMeta.fields.find((field) => field.fieldname === "items" && field.fieldtype === "Table");
        const childDoctype = text(itemsField?.options) || "Purchase Order Item";
        const [purchaseChildMeta, boot, caps, existingResult] = await Promise.all([
          adapter.getMeta(childDoctype),
          adapter.getBoot(),
          adapter.getCapabilities("Purchase Order", documentName || undefined),
          documentName ? adapter.getDoc("Purchase Order", documentName) : Promise.resolve(null),
        ]);
        if (!active) return;

        const defaults: Json = {
          ...blankFromMeta(purchaseMeta),
          ...applyContextPolicy("Purchase Order", businessContext, contextPolicies).defaults,
        };
        if (!defaults.transaction_date) defaults.transaction_date = today();
        if (!defaults.company && purchaseMeta.fields.some((field) => field.fieldname === "company")) defaults.company = "ALUMDOOR";
        if (!defaults.currency && purchaseMeta.fields.some((field) => field.fieldname === "currency")) defaults.currency = boot.sysdefaults.currency || "VND";

        const existingDoc = existingResult?.doc as Json | undefined;
        const existingRows = Array.isArray(existingDoc?.items) ? existingDoc!.items as Doc[] : [];
        setMeta(purchaseMeta);
        setChildMeta(purchaseChildMeta);
        setHeader(existingDoc ? { ...defaults, ...existingDoc, items: undefined } : defaults);
        setRows(existingRows.length
          ? existingRows.map((row) => ({ ...row, doctype: row.doctype || purchaseChildMeta.name } as Doc))
          : [newChildRow(purchaseChildMeta, 0)]);
        setSourceModified(text(existingDoc?.modified));
        setDocstatus(Number(existingDoc?.docstatus) || 0);
        setCanCreate(Boolean(caps.create));
        setCanWrite(Boolean(caps.write));
        setCanSubmit(Boolean(caps.submit));
      } catch (error) {
        if (active) setFatal(mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext, contextPolicies, documentName]);

  const metaField = useCallback((fieldname: string) => meta?.fields.find((field) => field.fieldname === fieldname), [meta]);
  const setHeaderField = useCallback((fieldname: string, value: unknown) => {
    setHeader((current) => ({ ...current, [fieldname]: value }));
  }, []);

  useEffect(() => {
    const supplierName = text(header.supplier);
    if (!supplierName || !meta || loading || formReadOnly) return;
    let active = true;
    void adapter.getDoc("Supplier", supplierName).then(({ doc }) => {
      if (!active) return;
      const supplier = doc as Json;
      setHeader((current) => {
        const next = { ...current };
        const copyIfPresent = (target: string, ...sources: string[]) => {
          if (!meta.fields.some((field) => field.fieldname === target)) return;
          const value = sources.map((source) => supplier[source]).find((candidate) => text(candidate));
          if (value !== undefined) next[target] = value;
        };
        copyIfPresent("supplier_group", "supplier_group");
        copyIfPresent("payment_terms", "payment_terms");
        copyIfPresent("contact_person", "contact_person");
        copyIfPresent("buying_price_list", "buying_price_list", "default_buying_price_list");
        return next;
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [adapter, formReadOnly, header.supplier, loading, meta]);

  const activeRows = useMemo(() => rows.filter((row) => text(row.item_code)), [rows]);
  const aluminumRows = useMemo(() => activeRows.filter((row) => text(row.inventory_mode) === "Nhôm cây/lá"), [activeRows]);
  const grandTotal = useMemo(() => activeRows.reduce((sum, row) => sum + (numberValue(row.amount) ?? 0), 0), [activeRows]);
  const totalAluminumKg = useMemo(() => aluminumRows.reduce((sum, row) => sum + (numberValue(row.theoretical_kg ?? row.qty) ?? 0), 0), [aluminumRows]);
  const totalAluminumBars = useMemo(() => aluminumRows.reduce((sum, row) => sum + (numberValue(row.qty_bar) ?? 0), 0), [aluminumRows]);

  const resolveRowsFromAuthority = useCallback(async (sourceRows: Doc[], changedField: string): Promise<Doc[]> => {
    if (!childMeta) return sourceRows;
    const childFields = childMeta.fields.map((field) => field.fieldname).filter(Boolean);
    const parent = { ...header, doctype: "Purchase Order", items: undefined };
    return Promise.all(sourceRows.map(async (row) => {
      if (!text(row.item_code)) return row;
      const preview = await adapter.callPost<Json>("alumdoor.ui.preview_child_row", {
        parent_doctype: "Purchase Order",
        child_doctype: childMeta.name,
        child_fields: childFields,
        parent,
        row,
        changed_field: changedField,
      });
      return applyChildPreview(row, preview, childMeta);
    }));
  }, [adapter, childMeta, header]);

  const refreshAll = useCallback(async () => {
    if (!childMeta || !activeRows.length) return;
    setRefreshing(true);
    try {
      const resolvedActive = await resolveRowsFromAuthority(activeRows, "manual_refresh");
      const byName = new Map(resolvedActive.map((row) => [text(row.name), row]));
      setRows((current) => current.map((row) => byName.get(text(row.name)) ?? row));
      toast.success("Đã tính lại quy cách, số lượng và thành tiền theo dữ liệu mua hàng hiện tại.");
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setRefreshing(false);
    }
  }, [activeRows, childMeta, resolveRowsFromAuthority]);

  const validateRows = useCallback((resolvedRows: Doc[]): string | null => {
    if (!text(header.supplier)) return "Cần chọn nhà cung cấp.";
    if (!resolvedRows.length) return "Cần ít nhất một mặt hàng.";
    for (const [index, row] of resolvedRows.entries()) {
      const position = index + 1;
      if (!text(row.item_code)) return `Dòng ${position}: thiếu mặt hàng.`;
      if (!text(row.uom)) return `Dòng ${position}: thiếu ĐVT mua.`;
      if (!positive(row.qty)) return `Dòng ${position}: số lượng tính tiền phải lớn hơn 0.`;
      if (numberValue(row.rate) === undefined) return `Dòng ${position}: chưa có đơn giá mua.`;
      if (text(row.inventory_mode) === "Nhôm cây/lá") {
        if (!positive(row.length_m)) return `Dòng ${position}: nhôm phải có chiều dài một cây.`;
        if (!positive(row.qty_bar)) return `Dòng ${position}: nhôm phải nhập số cây/lá đặt.`;
        if (!positive(row.theoretical_kg_per_m)) return `Dòng ${position}: nhôm chưa có định mức kg/m từ quy cách.`;
        if (!positive(row.theoretical_kg)) return `Dòng ${position}: chưa tính được khối lượng nhôm đặt.`;
      }
    }
    return null;
  }, [header.supplier]);

  const save = useCallback(async (submitAfterSave: boolean) => {
    if (!meta || !childMeta || !canSave) return;
    setSaving(true);
    try {
      const resolvedRows = await resolveRowsFromAuthority(activeRows, "__save__");
      const validationError = validateRows(resolvedRows);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      const activeNames = new Set(resolvedRows.map((row) => text(row.name)));
      setRows((current) => current.map((row) => activeNames.has(text(row.name))
        ? resolvedRows.find((candidate) => text(candidate.name) === text(row.name)) ?? row
        : row));

      const document: Json = {};
      for (const field of meta.fields ?? []) {
        if (field.fieldname === "items") continue;
        const value = fieldValueForServer(field.fieldtype, header[field.fieldname]);
        if (value !== undefined) document[field.fieldname] = value;
      }
      document.items = resolvedRows.map((row) => cleanChildRow(row, childMeta, isExisting));
      const payload = serializeCreateDocument(meta, document) as Partial<Doc>;
      const saved = isExisting
        ? await adapter.updateDoc("Purchase Order", documentName, payload, sourceModified)
        : await adapter.createDoc("Purchase Order", payload);
      const finalDoc = submitAfterSave ? await adapter.submit(saved) : saved;
      const savedName = text(finalDoc.name) || documentName;
      setSourceModified(text(finalDoc.modified));
      setDocstatus(Number(finalDoc.docstatus) || 0);
      const savedItems = Array.isArray(finalDoc.items) ? finalDoc.items as Doc[] : [];
      if (savedItems.length) setRows(savedItems.map((row) => ({ ...row, doctype: row.doctype || childMeta.name } as Doc)));

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", "Purchase Order"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list", "Purchase Order"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "count", "Purchase Order"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
      ]).catch(() => undefined);

      toast.success(submitAfterSave ? `Đã xác nhận đơn mua ${savedName}` : isExisting ? `Đã lưu đơn mua ${savedName}` : `Đã tạo đơn mua ${savedName}`);
      if (isExisting) props.onSaved?.(savedName);
      else props.onCreated(savedName);
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setSaving(false);
    }
  }, [activeRows, adapter, canSave, childMeta, documentName, header, isExisting, meta, props, queryClient, resolveRowsFromAuthority, scopeKey, sourceModified, validateRows]);

  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang mở màn mua hàng AlumDoor…</span></div>;
  }
  if (fatal) return <div className="p-6 text-sm text-destructive">{fatal}</div>;
  if (!meta || !childMeta) return <div className="p-6 text-sm text-muted-foreground">Không đọc được cấu trúc Purchase Order.</div>;

  const headerField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string) =>
    metaField(fieldname) ?? fallbackField(fieldname, label, fieldtype, options);
  const headerControl = (
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
  ) => {
    const field = headerField(fieldname, label, fieldtype, options);
    return (
      <AlumdoorSalesOrderField
        id={`purchase-order-header-${fieldname}`}
        field={field}
        value={header[fieldname]}
        onChange={(value) => setHeaderField(fieldname, fieldValueForServer(field.fieldtype, value))}
        registry={registry}
        services={purchaseServices}
        parentDoctype="Purchase Order"
        docValues={header}
        roles={roles}
        required={Boolean(field.reqd)}
        readOnly={formReadOnly || Boolean(field.read_only)}
        compact
        className="[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8"
      />
    );
  };

  const hasField = (fieldname: string) => Boolean(metaField(fieldname));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-purchase-order-v2">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1900px] space-y-3 px-3 py-3">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Đơn mua hàng</h1>
              <Badge variant="outline">{isExisting ? documentName : "Nháp mới"}</Badge>
              {formReadOnly ? <Badge variant="outline">Chỉ xem</Badge> : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>{isExisting ? "Đóng" : "Hủy"}</Button>
              <Button type="button" variant="outline" size="sm" disabled={saving || refreshing || formReadOnly || !activeRows.length} onClick={() => void refreshAll()}>
                {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Tính lại
              </Button>
              <Button type="button" size="sm" disabled={saving || !canSave} onClick={() => void save(false)}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} {isExisting ? "Lưu" : "Tạo đơn"}
              </Button>
              {canSubmit && !formReadOnly ? (
                <Button type="button" variant="outline" size="sm" disabled={saving || !canSave} onClick={() => void save(true)}>
                  <Send className="size-3.5" /> Lưu & xác nhận
                </Button>
              ) : null}
            </div>
          </header>

          {formReadOnly ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">Đơn đã xác nhận/khóa hoặc tài khoản không có quyền sửa.</div> : null}

          <fieldset disabled={formReadOnly} className="contents">
            <section className="rounded-lg border bg-card p-3" data-section="purchase-order-header">
              <div className="grid gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">{headerControl("supplier", "Nhà cung cấp", "Link", "Supplier")}</div>
                {headerControl("transaction_date", "Ngày đặt", "Date")}
                {hasField("schedule_date") ? headerControl("schedule_date", "Ngày giao dự kiến", "Date") : null}
                {hasField("priority") ? headerControl("priority", "Mức độ", "Select") : null}
                {hasField("buying_price_list") ? headerControl("buying_price_list", "Bảng giá mua", "Link", "Price List") : null}
                {hasField("supplier_group") ? headerControl("supplier_group", "Nhóm NCC", metaField("supplier_group")!.fieldtype, metaField("supplier_group")!.options) : null}
                {hasField("supplier_quotation") ? headerControl("supplier_quotation", "Theo báo giá NCC", "Link", "Supplier Quotation") : null}
                {hasField("payment_terms") ? headerControl("payment_terms", "Điều khoản thanh toán", metaField("payment_terms")!.fieldtype, metaField("payment_terms")!.options) : null}
                {hasField("note") ? <div className="xl:col-span-2">{headerControl("note", "Ghi chú", metaField("note")!.fieldtype)}</div> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                <span>Công ty: <strong className="text-foreground">{text(header.company) || "—"}</strong></span>
                <span>Tiền tệ: <strong className="text-foreground">{text(header.currency) || "VND"}</strong></span>
                <span>Item picker chỉ lấy <strong className="text-foreground">Được phép mua + đang hoạt động</strong>.</span>
              </div>
            </section>

            <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_300px]">
              <section className="min-w-0 overflow-hidden rounded-lg border bg-card" data-section="purchase-order-items">
                <div className="border-b px-3 py-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mặt hàng đặt mua</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Nhôm tự mở quy cách, dài cây, kg/m, số cây và kg đặt. Motor/phụ kiện chỉ giữ các cột số lượng, ĐVT và giá cần thiết.</p>
                </div>
                <div className="p-2">
                  <MetadataChildGrid
                    childMeta={childMeta}
                    rows={rows}
                    onChange={setRows}
                    registry={registry}
                    services={purchaseServices}
                    readOnly={formReadOnly}
                    parentDoc={{ ...header, doctype: "Purchase Order" }}
                    roles={roles}
                  />
                </div>
              </section>

              <aside className="space-y-3 2xl:sticky 2xl:top-3 2xl:self-start" aria-label="Tóm tắt đơn mua">
                <section className="rounded-lg border bg-card">
                  <div className="border-b px-3 py-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tóm tắt đơn mua</h2></div>
                  <div className="space-y-2 px-3 py-3 text-xs">
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dòng hàng</span><span className="font-medium tabular-nums">{activeRows.length}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dòng nhôm</span><span className="font-medium tabular-nums">{aluminumRows.length}</span></div>
                    {aluminumRows.length ? (
                      <>
                        <div className="flex justify-between gap-3"><span className="text-muted-foreground">Số cây/lá đặt</span><span className="font-medium tabular-nums">{totalAluminumBars}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-muted-foreground">Kg nhôm lý thuyết</span><span className="font-medium tabular-nums">{totalAluminumKg.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} kg</span></div>
                      </>
                    ) : null}
                    <div className="border-t pt-2"><div className="flex items-baseline justify-between gap-3"><span className="font-semibold">Tạm tính</span><strong className="text-lg tabular-nums text-primary">{money(grandTotal)} ₫</strong></div></div>
                  </div>
                </section>
                <section className="rounded-lg border bg-card px-3 py-3 text-[11px] text-muted-foreground">
                  <div className="font-medium text-foreground">Cách tính nhôm</div>
                  <div className="mt-1">Kg đặt = Dài một cây × Số cây/lá × Kg/m lý thuyết.</div>
                  <div className="mt-1">`qty` lưu theo ĐVT mua để tính tiền; số cây/lá được giữ riêng trên dòng.</div>
                </section>
              </aside>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
