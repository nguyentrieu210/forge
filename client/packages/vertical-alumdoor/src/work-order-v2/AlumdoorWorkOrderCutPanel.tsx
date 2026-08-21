/** @jsxImportSource react */
/**
 * Panel CẮT NHÔM của phiếu sản xuất.
 *
 * Nối thẳng vào nhóm method đã có thẩm quyền ở server — client không tự chọn lô, không tự trừ tồn,
 * không tự đặt trạng thái phiếu cắt:
 *
 *  - `alumdoor.cut.propose` → xem lô nào nên cắt (chỉ đọc Batch + sổ kho)
 *  - `alumdoor.cut.draft`   → dựng phiếu cắt NHÁP + bundle, CHƯA trừ tồn
 *  - `alumdoor.cut.apply`   → ghi sổ phiếu cắt, trừ tồn, sinh Paint Job
 *  - `alumdoor.cut.reverse` → GHI NHẦM: đảo đúng bút toán gốc
 *  - `alumdoor.cut.return`  → TRẢ HÀNG: nhập lá ĐÃ CẮT vào lô khổ mới
 *
 * Chữ ký đọc từ `server/apps-src/alumdoor-worker/src/index.ts:553…790`.
 *
 * Hao hụt hiện ở hai chỗ, hai thời điểm khác nhau:
 *  - TRƯỚC khi cắt: `offcut_per_sheet_m` của từng lô trong đề xuất (đầu thừa mỗi lá sẽ để lại);
 *  - SAU khi cắt: `kerf_total_m`, `offcut_length_m`, `scrap_m`, `kg_consumed` trên `Cut Order Item`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Scissors, Undo2 } from "lucide-react";
import { mapError, type DocTypeMeta } from "@metaforge/core";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorWorkOrderField, metaFieldOr } from "./AlumdoorWorkOrderField.js";
import {
  documentPath,
  numberValue,
  positiveNumber,
  quantity,
  text,
  type CutDraftResult,
  type CutOrderItemFacts,
  type CutOrderSummary,
  type CutProposal,
  type Json,
} from "./model.js";

interface CutOrderWithItems extends CutOrderSummary {
  items?: CutOrderItemFacts[];
}

/** Ép một payload lạ về mảng bản ghi mà không cần `as` — tránh cast Doc sang shape hẹp hơn. */
function recordRows(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function cutOrderSummary(source: Json, items: Json[]): CutOrderWithItems {
  return {
    name: text(source.name),
    cut_on: text(source.cut_on),
    cutting_policy: text(source.cutting_policy),
    cut_state: text(source.cut_state),
    work_order: text(source.work_order),
    target_color: text(source.target_color),
    ...(numberValue(source.docstatus) === undefined ? {} : { docstatus: numberValue(source.docstatus) }),
    items: items.map((row) => ({
      item_code: text(row.item_code),
      source_batch_no: text(row.source_batch_no),
      source_warehouse: text(row.source_warehouse),
      source_length_m: numberValue(row.source_length_m),
      cut_width_m: numberValue(row.cut_width_m),
      sheets_cut: numberValue(row.sheets_cut),
      cuts_count: numberValue(row.cuts_count),
      kerf_total_m: numberValue(row.kerf_total_m),
      offcut_length_m: numberValue(row.offcut_length_m),
      scrap_m: numberValue(row.scrap_m),
      kg_consumed: numberValue(row.kg_consumed),
      kg_weighed: numberValue(row.kg_weighed),
    })),
  };
}

export interface AlumdoorWorkOrderCutPanelProps {
  workOrder: string;
  /** Mã cấu phần của chính lệnh — nguồn gợi ý duy nhất, không phải danh sách cứng. */
  componentItemCodes: string[];
  defaults: {
    warehouse: string;
    cut_width_m: number | undefined;
    sheets: number | undefined;
    cutting_policy: string;
    target_color: string;
    so_reference: string;
  };
  /** Lệnh đã ghi sổ chưa. Chưa ghi sổ thì không cho tạo/áp phiếu cắt. */
  submitted: boolean;
  onNavigate: (path: string) => void;
}

export function AlumdoorWorkOrderCutPanel(props: AlumdoorWorkOrderCutPanelProps) {
  const { adapter, registry, services, roles } = useMetaForge();
  const [cutMeta, setCutMeta] = useState<DocTypeMeta | null>(null);
  const [cutItemMeta, setCutItemMeta] = useState<DocTypeMeta | null>(null);
  const [form, setForm] = useState<Json>(() => ({
    item_code: props.componentItemCodes[0] ?? "",
    warehouse: props.defaults.warehouse,
    cut_width_m: props.defaults.cut_width_m,
    sheets: props.defaults.sheets,
    cutting_policy: props.defaults.cutting_policy,
    target_color: props.defaults.target_color,
    offcut_warehouse: "",
  }));
  const [proposal, setProposal] = useState<CutProposal | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [busy, setBusy] = useState<"" | "propose" | "draft" | "apply" | "reverse" | "return">("");
  const [cutOrders, setCutOrders] = useState<CutOrderWithItems[]>([]);
  const [cutListError, setCutListError] = useState("");
  const [selectedCut, setSelectedCut] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"" | "apply" | "reverse" | "return">("");

  const setField = useCallback((fieldname: string, value: unknown) => {
    setForm((current) => ({ ...current, [fieldname]: value }));
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [cut, cutItem] = await Promise.all([
        adapter.getMeta("Cut Order").catch(() => null),
        adapter.getMeta("Cut Order Item").catch(() => null),
      ]);
      if (!alive) return;
      setCutMeta(cut);
      setCutItemMeta(cutItem);
    })();
    return () => { alive = false; };
  }, [adapter]);

  const loadCutOrders = useCallback(async () => {
    setCutListError("");
    try {
      // Đường chính: `Cut Order.work_order` là trường mà `syncPaintJobsFromCut` đọc để gắn Paint Job.
      const rows = await adapter.getList("Cut Order", {
        fields: ["name", "cut_on", "cutting_policy", "cut_state", "docstatus", "work_order", "target_color"],
        filters: [["work_order", "=", props.workOrder]],
        orderBy: "cut_on desc",
        pageLength: 20,
      });
      const detailed = await Promise.all(rows.slice(0, 10).map(async (row) => {
        const name = text(row.name);
        const doc = await adapter.getDoc("Cut Order", name).then((result) => result.doc).catch(() => null);
        return cutOrderSummary({ ...row, ...(doc ?? {}) }, recordRows(doc?.items));
      }));
      setCutOrders(detailed);
    } catch (error) {
      // ĐƯỜNG LÙI có bằng chứng: `Paint Job.work_order` là Link BẮT BUỘC tới Work Order và mỗi
      // Paint Job mang theo `cut_order`. Nếu list theo `Cut Order.work_order` bị nền tảng từ chối
      // thì vẫn còn đường tìm ra phiếu cắt — và lý do từ chối vẫn hiện nguyên văn, không nuốt.
      setCutListError(mapError(error).message);
      try {
        const jobs = await adapter.getList("Paint Job", {
          fields: ["name", "cut_order", "work_order", "state"],
          filters: [["work_order", "=", props.workOrder]],
          pageLength: 100,
        });
        const names = [...new Set(jobs.map((row) => text(row.cut_order)).filter(Boolean))];
        const detailed = await Promise.all(names.slice(0, 10).map(async (name) => {
          const doc = await adapter.getDoc("Cut Order", name).then((result) => result.doc).catch(() => null);
          return cutOrderSummary({ name, ...(doc ?? {}) }, recordRows(doc?.items));
        }));
        setCutOrders(detailed);
      } catch {
        setCutOrders([]);
      }
    }
  }, [adapter, props.workOrder]);

  useEffect(() => { void loadCutOrders(); }, [loadCutOrders]);

  const cutArgs = useMemo(() => ({
    item_code: text(form.item_code),
    warehouse: text(form.warehouse),
    cut_width_m: numberValue(form.cut_width_m),
    sheets: numberValue(form.sheets),
    ...(text(form.target_color) ? { color: text(form.target_color) } : {}),
  }), [form]);

  const canPropose = Boolean(cutArgs.item_code && cutArgs.warehouse)
    && positiveNumber(cutArgs.cut_width_m) !== undefined
    && positiveNumber(cutArgs.sheets) !== undefined;

  const propose = useCallback(async () => {
    setBusy("propose");
    setProposalError("");
    try {
      const result = await adapter.callPost<CutProposal>("alumdoor.cut.propose", cutArgs);
      setProposal(result);
    } catch (error) {
      setProposal(null);
      setProposalError(mapError(error).message);
    } finally {
      setBusy("");
    }
  }, [adapter, cutArgs]);

  const draft = useCallback(async () => {
    setBusy("draft");
    try {
      const result = await adapter.callPost<CutDraftResult>("alumdoor.cut.draft", {
        ...cutArgs,
        cutting_policy: text(form.cutting_policy),
        work_order: props.workOrder,
        ...(text(props.defaults.so_reference) ? { so_reference: text(props.defaults.so_reference) } : {}),
        ...(text(form.target_color) ? { target_color: text(form.target_color) } : {}),
        ...(text(form.offcut_warehouse) ? { offcut_warehouse: text(form.offcut_warehouse) } : {}),
      });
      const created = text(result.cut_order);
      if (created) setSelectedCut(created);
      toast.success(text(result.message) || `Đã tạo phiếu cắt nháp ${created}.`);
      await loadCutOrders();
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setBusy("");
    }
  }, [adapter, cutArgs, form, loadCutOrders, props.defaults.so_reference, props.workOrder]);

  const runCutAction = useCallback(async (action: "apply" | "reverse" | "return") => {
    setBusy(action);
    try {
      const result = await adapter.callPost<Json>(`alumdoor.cut.${action}`, {
        cut_order: selectedCut,
        ...(action === "apply" ? {} : { reason: text(reason) }),
      });
      toast.success(text(result.message) || "Server đã nhận lệnh.");
      setConfirm("");
      await loadCutOrders();
    } catch (error) {
      toast.error(mapError(error).message);
    } finally {
      setBusy("");
    }
  }, [adapter, loadCutOrders, reason, selectedCut]);

  /**
   * `formKey` là TÊN THAM SỐ mà method server nhận; `metaFieldname` là tên trường thật trên
   * DocType danh mục. Hai cái lệch nhau ở vài chỗ (vd server nhận `warehouse`, `Cut Order Item`
   * khai `source_warehouse`), và lấy field theo tên thật là cách duy nhất thừa hưởng được
   * `link_filters` do metadata khai — vd `{"is_group":0,"disabled":0}` cho ô kho.
   */
  const control = (
    meta: DocTypeMeta | null,
    parentDoctype: string,
    formKey: string,
    metaFieldname: string,
    label: string,
    fieldtype: DocTypeMeta["fields"][number]["fieldtype"],
    options?: string,
  ) => {
    const field = metaFieldOr(meta, metaFieldname, label, fieldtype, options);
    return (
      <AlumdoorWorkOrderField
        id={`work-order-v2-cut-${formKey}`}
        field={field}
        label={label}
        value={form[formKey]}
        onChange={(value) => setField(formKey, value)}
        registry={registry}
        services={services}
        parentDoctype={parentDoctype}
        docValues={form}
        roles={roles}
        readOnly={busy !== ""}
      />
    );
  };

  const selected = cutOrders.find((row) => text(row.name) === selectedCut);
  const selectedState = text(selected?.cut_state);

  return (
    <div className="space-y-3" data-section="work-order-v2-cut">
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">Cắt nhôm</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Đề xuất lô và bút toán cắt đều do server quyết. Màn chỉ gửi mã nhôm, kho, rộng cắt và số lá.
          </p>
        </div>

        <div className="space-y-3 px-4 py-3">
          {props.componentItemCodes.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Cấu phần của lệnh:</span>
              {props.componentItemCodes.map((code) => (
                <Button
                  key={code}
                  type="button"
                  variant={text(form.item_code) === code ? "default" : "outline"}
                  size="sm"
                  className="h-6 font-mono text-[10px]"
                  disabled={busy !== ""}
                  onClick={() => setField("item_code", code)}
                >
                  {code}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {control(cutItemMeta, "Cut Order Item", "item_code", "item_code", "Mã nhôm", "Link", "Item")}
            {control(cutItemMeta, "Cut Order Item", "warehouse", "source_warehouse", "Kho lấy lô", "Link", "Warehouse")}
            {control(cutItemMeta, "Cut Order Item", "cut_width_m", "cut_width_m", "Rộng cắt lá (m)", "Float")}
            {control(cutItemMeta, "Cut Order Item", "sheets", "sheets_cut", "Số lá cần cắt", "Int")}
            {control(cutMeta, "Cut Order", "cutting_policy", "cutting_policy", "Công thức cửa", "Link", "Cutting Policy")}
            {control(cutMeta, "Cut Order", "target_color", "target_color", "Màu cần sơn", "Link", "Item Color")}
            {control(null, "Cut Order Item", "offcut_warehouse", "offcut_warehouse", "Kho đầu thừa (bỏ trống = server tự tìm)", "Link", "Warehouse")}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canPropose || busy !== ""} onClick={() => void propose()}>
              {busy === "propose" ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
              Xem đề xuất cắt
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canPropose || !text(form.cutting_policy) || !props.submitted || busy !== ""}
              onClick={() => void draft()}
            >
              {busy === "draft" ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
              Tạo phiếu cắt nháp
            </Button>
            {!props.submitted ? (
              <span className="text-[11px] text-muted-foreground">Lệnh chưa ghi sổ nên chưa tạo phiếu cắt được.</span>
            ) : null}
            {!text(form.cutting_policy) ? (
              <span className="text-[11px] text-muted-foreground">Server đòi Công thức cửa trước khi tạo phiếu cắt.</span>
            ) : null}
          </div>

          {proposalError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />{proposalError}
            </div>
          ) : null}

          {proposal ? (
            <div className="rounded-md border">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
                <Badge variant="outline">{numberValue(proposal.lots_considered) ?? 0} lô được xét</Badge>
                {numberValue(proposal.short) ? (
                  <Badge variant="destructive">Thiếu {quantity(proposal.short)} lá</Badge>
                ) : (
                  <Badge variant="outline">Đủ lô</Badge>
                )}
                {text(proposal.message) ? <span className="text-destructive">{text(proposal.message)}</span> : null}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lô</TableHead>
                      <TableHead>Kho</TableHead>
                      <TableHead>Màu</TableHead>
                      <TableHead>Tình trạng</TableHead>
                      <TableHead className="text-right">Khổ cây (m)</TableHead>
                      <TableHead className="text-right">Còn (lá)</TableHead>
                      <TableHead className="text-right">Lấy</TableHead>
                      <TableHead className="text-right">Đầu thừa / lá (m)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(proposal.picks ?? []).map((pick, index) => (
                      <TableRow key={`${text(pick.batch_no)}-${index}`}>
                        <TableCell className="font-mono text-xs">
                          {text(pick.batch_no)}
                          {pick.is_offcut ? <Badge variant="outline" className="ml-1 text-[10px]">đầu thừa</Badge> : null}
                        </TableCell>
                        <TableCell className="text-xs">{text(pick.warehouse) || "—"}</TableCell>
                        <TableCell className="text-xs">{text(pick.color) || "—"}</TableCell>
                        <TableCell className="text-xs">{text(pick.condition) || "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{quantity(pick.length_m)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{quantity(pick.available)}</TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">{quantity(pick.take)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{quantity(pick.offcut_per_sheet_m)}</TableCell>
                      </TableRow>
                    ))}
                    {!(proposal.picks ?? []).length ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-20 text-center text-xs text-muted-foreground">
                          Không lô nào đủ khổ. Server không đề xuất gì và cũng không ghép lô hộ.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div>
            <h3 className="font-medium">Phiếu cắt của lệnh này</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Hao hụt thật đọc trên `Cut Order Item` sau khi phiếu đã cắt.</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy !== ""} onClick={() => void loadCutOrders()}>
            Làm mới
          </Button>
        </div>

        {cutListError ? (
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
            Không lọc được `Cut Order` theo lệnh sản xuất: {cutListError} — đã thử tìm lại qua `Paint Job`.
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Phiếu cắt</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Công thức</TableHead>
                <TableHead className="text-right">Số lá</TableHead>
                <TableHead className="text-right">Kerf (m)</TableHead>
                <TableHead className="text-right">Đầu thừa (m)</TableHead>
                <TableHead className="text-right">Phế bỏ (m)</TableHead>
                <TableHead className="text-right">Kg tiêu hao</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cutOrders.map((row) => {
                const name = text(row.name);
                const items = row.items ?? [];
                const sum = (field: keyof CutOrderItemFacts) => items.reduce(
                  (total, item) => total + (numberValue(item[field]) ?? 0), 0);
                return (
                  <TableRow
                    key={name}
                    className={selectedCut === name ? "bg-muted/50" : undefined}
                    onClick={() => setSelectedCut(name)}
                  >
                    <TableCell>
                      {/* Kit chưa có RadioGroup, nên dùng Checkbox: chọn một phiếu vẫn do
                          `setSelectedCut` quyết định (bấm cái khác là bỏ chọn cái cũ), giữ đúng
                          ngữ nghĩa "chọn một" mà không phải dựng primitive mới ở vertical. */}
                      <Checkbox
                        checked={selectedCut === name}
                        onCheckedChange={() => setSelectedCut(name)}
                        aria-label={`Chọn phiếu cắt ${name}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{name}</TableCell>
                    <TableCell className="text-xs">{text(row.cut_state) || "—"}</TableCell>
                    <TableCell className="text-xs">{text(row.cutting_policy) || "—"}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{quantity(sum("sheets_cut"))}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{quantity(sum("kerf_total_m"))}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{quantity(sum("offcut_length_m"))}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{quantity(sum("scrap_m"))}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{quantity(sum("kg_consumed"))}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Mở phiếu cắt ${name}`}
                        onClick={(event) => { event.stopPropagation(); props.onNavigate(documentPath("Cut Order", name)); }}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!cutOrders.length ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-20 text-center text-xs text-muted-foreground">
                    Chưa có phiếu cắt nào gắn với lệnh này.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {selectedCut ? (
          <div className="space-y-2 border-t px-4 py-3">
            <div className="grid gap-2 md:grid-cols-[minmax(200px,1fr)_auto]">
              <AlumdoorWorkOrderField
                id="work-order-v2-cut-reason"
                field={metaFieldOr(cutMeta, "cancel_reason", "Lý do hoàn / trả", "Link", "Lý do huỷ")}
                label="Lý do hoàn / trả"
                value={reason}
                onChange={(value) => setReason(text(value))}
                registry={registry}
                services={services}
                parentDoctype="Cut Order"
                docValues={{ cancel_reason: reason }}
                roles={roles}
                readOnly={busy !== ""}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== "" || selectedState === "Đã cắt"}
                  onClick={() => setConfirm("apply")}
                >
                  {busy === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
                  Áp phiếu cắt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== "" || !text(reason)}
                  onClick={() => setConfirm("reverse")}
                >
                  <Undo2 className="size-3.5" /> Hoàn cắt (ghi nhầm)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== "" || !text(reason) || selectedState !== "Đã cắt"}
                  onClick={() => setConfirm("return")}
                >
                  <Undo2 className="size-3.5" /> Trả hàng đã cắt
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Server đòi lý do cho cả hoàn cắt lẫn trả hàng, và lý do phải là một bản ghi `Lý do huỷ` thật.
              “Hoàn cắt” đảo đúng bút toán gốc; “Trả hàng” nhập lá ĐÃ CẮT vào lô khổ mới — hai việc khác nhau.
            </p>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirm !== ""}
        onOpenChange={(open) => { if (!open) setConfirm(""); }}
        title={
          confirm === "apply" ? `Áp phiếu cắt ${selectedCut}?`
            : confirm === "reverse" ? `Hoàn cắt phiếu ${selectedCut}?`
              : `Nhập trả hàng đã cắt của phiếu ${selectedCut}?`
        }
        description={
          confirm === "apply"
            ? "Server sẽ ghi sổ phiếu cắt, trừ tồn theo đúng lô đã chọn và sinh Paint Job cho lô còn thô. Thao tác này chạm sổ kho."
            : confirm === "reverse"
              ? "Dùng khi GHI NHẦM: server đảo đúng bút toán gốc và huỷ Paint Job đã sinh."
              : "Dùng khi TRẢ HÀNG: server nhập lá ĐÃ CẮT vào lô khổ mới, không phục hồi cây nguyên."
        }
        cancelLabel="Không"
        confirmLabel={busy !== "" ? "Đang gửi…" : "Xác nhận"}
        destructive={confirm !== "apply"}
        onConfirm={() => { if (confirm) void runCutAction(confirm); }}
      />
    </div>
  );
}
