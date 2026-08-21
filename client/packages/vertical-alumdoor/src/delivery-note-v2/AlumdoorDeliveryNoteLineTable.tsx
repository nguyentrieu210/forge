/** @jsxImportSource react */
/**
 * Bảng dòng hàng của Phiếu xuất kho giao khách.
 *
 * Ba việc bảng này phải làm ĐÚNG, vì đây là chỗ luật hay chết im lặng nhất:
 *  1. Đã đặt / đã giao / còn lại hiện trên TỪNG DÒNG (số của server, không tự trừ).
 *  2. Hàng cân thực tế (`RT_`: mua Kg · tồn CÂY · bán Mét) hiện SONG SONG mọi trục server trả về.
 *  3. Thiếu tồn / thiếu hệ số ĐVT / có giữ chỗ treo thì nói ra NGUYÊN VĂN + chỗ sửa, không chặn câm.
 */
import { Fragment, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info, Loader2, Lock, Trash2, Unlock } from "lucide-react";
import type { DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import {
  Badge,
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";
import { AlumdoorSalesOrderField, fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";
import {
  lineAlerts,
  lineDeliveredBefore,
  lineOrderedQty,
  lineOutstandingQty,
  lineOverDelivering,
  lineQuantityAxes,
  lineReservedQty,
  lineSaleUom,
  quantity,
  text,
  type DeliveryAlert,
  type DeliveryLine,
} from "./model.js";

export interface DeliveryReservationDraft {
  min_length_m: number;
  qty_reserved: number;
  expires_at: string;
}

export interface AlumdoorDeliveryNoteLineTableProps {
  lines: DeliveryLine[];
  childMeta: DocTypeMeta | null;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  readOnly: boolean;
  /** Gộp nhiều Đơn bán: máy chủ dựng nguyên phiếu, dòng KHÔNG sửa được tại đây. */
  multiOrder: boolean;
  busy: boolean;
  onPatch: (key: string, patch: Partial<DeliveryLine>) => void;
  onCommit: (key: string, fieldname: string) => void;
  onRemove: (key: string) => void;
  onReserve: (key: string, draft: DeliveryReservationDraft) => void;
  onReleaseReservation: (key: string, reservation: string, reason: string) => void;
}

const ALERT_STYLE: Record<DeliveryAlert["level"], string> = {
  block: "border-destructive/40 bg-destructive/5 text-destructive",
  warn: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  info: "border-border bg-muted/40 text-muted-foreground",
};

function AlertList(props: { alerts: DeliveryAlert[]; compact?: boolean }) {
  if (!props.alerts.length) return null;
  return (
    <div className="space-y-1">
      {props.alerts.map((alert, index) => (
        <div
          key={`${alert.level}-${index}`}
          className={`rounded border px-1.5 py-1 text-[10px] leading-snug ${ALERT_STYLE[alert.level]}`}
        >
          <span className="inline-flex items-start gap-1">
            {alert.level === "info"
              ? <Info className="mt-[1px] size-3 shrink-0" />
              : <AlertTriangle className="mt-[1px] size-3 shrink-0" />}
            <span>
              {alert.message}
              {alert.where && !props.compact
                ? <span className="mt-0.5 block opacity-80">Sửa tại: {alert.where}</span>
                : null}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function AlumdoorDeliveryNoteLineTable(props: AlumdoorDeliveryNoteLineTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [reserveDrafts, setReserveDrafts] = useState<Record<string, DeliveryReservationDraft>>({});
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});

  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const childField = (
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
  ): DocField => props.childMeta?.fields.find((field) => field.fieldname === fieldname)
    ?? fallbackField(fieldname, label, fieldtype, options);

  const cellControl = (
    line: DeliveryLine,
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"],
    options?: string,
    parentDoctype = "Delivery Note Item",
  ) => (
    <AlumdoorSalesOrderField
      id={`delivery-v2-${line._key}-${fieldname}`}
      field={parentDoctype === "Delivery Note Item"
        ? childField(fieldname, label, fieldtype, options)
        : fallbackField(fieldname, label, fieldtype, options)}
      label={label}
      hideLabel
      value={line[fieldname]}
      onChange={(value) => props.onPatch(line._key, {
        [fieldname]: fieldtype === "Float" || fieldtype === "Int" || fieldtype === "Currency"
          ? (value === "" || value === null || value === undefined ? undefined : Number(value))
          : value,
      } as Partial<DeliveryLine>)}
      onCommit={() => props.onCommit(line._key, fieldname)}
      registry={props.registry}
      services={props.services}
      parentDoctype={parentDoctype}
      docValues={line}
      roles={props.roles}
      readOnly={props.readOnly || props.busy || props.multiOrder}
      compact
      className="[&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_button]:!h-7"
    />
  );

  return (
    <section className="rounded-lg border bg-card" data-section="alumdoor-delivery-v2-lines">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-xs font-medium">
          Dòng hàng xuất giao · {props.lines.length}
        </div>
        {props.multiOrder ? (
          <span className="text-[10px] text-muted-foreground">
            Đang gộp nhiều Đơn bán — máy chủ dựng nguyên phiếu nên dòng khoá sửa. Muốn chốt số thực giao thì tách từng đơn.
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-10 text-right">#</TableHead>
              <TableHead className="min-w-56">Mặt hàng</TableHead>
              <TableHead className="min-w-40">Đơn bán / dòng</TableHead>
              <TableHead className="min-w-40 text-right">Đã đặt · Đã giao · Còn lại</TableHead>
              <TableHead className="min-w-56">Số lượng theo từng trục</TableHead>
              <TableHead className="min-w-44">Kho xuất</TableHead>
              <TableHead className="min-w-56">Tồn &amp; cảnh báo</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.lines.map((line, index) => {
              const alerts = lineAlerts(line);
              const axes = lineQuantityAxes(line);
              const snapshot = line._context?.stock_snapshot;
              const ordered = lineOrderedQty(line);
              const delivered = lineDeliveredBefore(line);
              const outstanding = lineOutstandingQty(line);
              const isOpen = expanded.has(line._key);
              const reserved = lineReservedQty(line);
              const draft = reserveDrafts[line._key] ?? {
                min_length_m: Number(line.length_m ?? 0),
                qty_reserved: Number(line.qty ?? 0),
                expires_at: "",
              };
              return (
                <Fragment key={line._key}>
                  <TableRow className={line._edited ? "bg-primary/5" : undefined}>
                    <TableCell className="align-top">
                      <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={() => toggle(line._key)}>
                        {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      </Button>
                    </TableCell>
                    <TableCell className="align-top text-right text-xs tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="align-top">
                      <div className="text-xs font-medium">{text(line.item_code) || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{text(line._itemName) || text(line.item_name)}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {text(line.color) ? <Badge variant="outline" className="px-1 py-0 text-[9px]">{text(line.color)}</Badge> : null}
                        {text(line.measurement_profile) ? <Badge variant="outline" className="px-1 py-0 text-[9px]">{text(line.measurement_profile)}</Badge> : null}
                        {line._loading ? <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground"><Loader2 className="size-2.5 animate-spin" /> đang đọc tồn</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-[11px]">
                      <div>{text(line._salesOrder) || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">Dòng {text(line.sales_order_row_id) || "—"}</div>
                    </TableCell>
                    <TableCell className="align-top text-right text-[11px] tabular-nums">
                      {ordered === undefined && delivered === undefined && outstanding === undefined ? (
                        <span className="text-[10px] text-muted-foreground">
                          Chưa có số đã giao — cần nạp kế hoạch từ máy chủ (Xem phân bổ).
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <div>Đặt: <strong>{quantity(ordered)}</strong></div>
                          <div className="text-muted-foreground">Đã giao: {quantity(delivered)}</div>
                          <div className={lineOverDelivering(line) ? "font-semibold text-destructive" : "font-semibold"}>
                            Còn lại: {quantity(outstanding)} {lineSaleUom(line)}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        {axes.map((axis) => (
                          <div key={axis.kind} className="flex items-center gap-1.5">
                            <span className="w-20 shrink-0 text-[10px] text-muted-foreground">{axis.label}</span>
                            {axis.kind === "sale" || axis.kind === "weight" ? (
                              <div className="w-24">
                                {cellControl(line, axis.kind === "sale" ? "qty" : "weight_kg", axis.label, "Float")}
                              </div>
                            ) : (
                              <span className="w-24 text-right text-[11px] tabular-nums">
                                {axis.value === undefined ? "—" : `${axis.estimated ? "≈ " : ""}${quantity(axis.value)}`}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">{axis.uom || "—"}</span>
                            {axis.estimated ? <Badge variant="outline" className="px-1 py-0 text-[9px]">tạm tính</Badge> : null}
                          </div>
                        ))}
                        {axes.filter((axis) => axis.blockedReason).map((axis) => (
                          <div key={`${axis.kind}-reason`} className="text-[10px] text-amber-700 dark:text-amber-400">
                            {axis.blockedReason}
                          </div>
                        ))}
                        {lineOverDelivering(line) ? (
                          <div className="text-[10px] font-medium text-destructive">
                            Đang giao nhiều hơn phần còn lại của Đơn bán. Máy chủ vẫn là nơi chốt khi ghi sổ.
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {cellControl(line, "warehouse", "Kho xuất", "Link", "Warehouse")}
                      {text(line._warehouseSource) ? (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">Nguồn: {text(line._warehouseSource)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        {snapshot ? (
                          <div className="space-y-0.5 text-[10px] tabular-nums">
                            <div>Tồn: <strong>{quantity(snapshot.stock_qty)}</strong> {text(snapshot.stock_uom)}</div>
                            {text(snapshot.selected_uom) && text(snapshot.selected_uom) !== text(snapshot.stock_uom) ? (
                              <div>
                                Quy về {text(snapshot.selected_uom)}:{" "}
                                {snapshot.selected_qty === null || snapshot.selected_qty === undefined
                                  ? <span className="text-amber-700 dark:text-amber-400">{text(snapshot.selected_qty_blocked_reason) || "chưa quy đổi được"}</span>
                                  : <strong>{quantity(snapshot.selected_qty)}</strong>}
                              </div>
                            ) : null}
                            {text(snapshot.weight_uom) ? (
                              <div>Cân: {quantity(snapshot.weight_qty)} {text(snapshot.weight_uom)}</div>
                            ) : null}
                            {snapshot.batch_tracked ? (
                              <div className="text-muted-foreground">Lô: {quantity(snapshot.batch_count)} lô · nguồn {text(snapshot.source) || "—"}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">
                            {text(line._context?.availability_status) || "Chưa đọc tồn cho dòng này."}
                          </div>
                        )}
                        {reserved > 0 ? (
                          <Badge variant="outline" className="px-1 py-0 text-[9px]">
                            <Lock className="mr-0.5 size-2.5" /> Giữ chỗ treo: {quantity(reserved)}
                          </Badge>
                        ) : null}
                        <AlertList alerts={alerts.slice(0, 2)} compact />
                        {alerts.length > 2 ? (
                          <Button type="button" variant="link" size="sm" className="h-5 px-0 text-[10px]" onClick={() => toggle(line._key)}>
                            còn {alerts.length - 2} cảnh báo nữa
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0"
                        disabled={props.readOnly || props.busy || props.multiOrder}
                        onClick={() => props.onRemove(line._key)}
                        aria-label="Bỏ dòng khỏi phiếu"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>

                  {isOpen ? (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/30">
                        <div className="grid gap-3 py-2 lg:grid-cols-3">
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium">Cảnh báo đầy đủ</div>
                            {alerts.length
                              ? <AlertList alerts={alerts} />
                              : <div className="text-[10px] text-muted-foreground">Máy chủ không báo vấn đề nào trên dòng này.</div>}
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] font-medium">Lớp tồn / FIFO máy chủ dự tính</div>
                            {(line._fifo ?? []).length ? (
                              <div className="space-y-0.5 text-[10px] tabular-nums">
                                {(line._fifo ?? []).map((row, rowIndex) => (
                                  <div key={`${text(row.inventory_layer)}-${rowIndex}`} className="flex flex-wrap gap-x-2">
                                    <span className="font-medium">{text(row.inventory_layer) || "—"}</span>
                                    <span>{text(row.qty)}</span>
                                    <span className="text-muted-foreground">giá vốn/đv {text(row.unit_cost)}</span>
                                    <span className="text-muted-foreground">{text(row.received_at)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground">
                                Chưa có lớp FIFO cho dòng này. FIFO chỉ có sau khi bấm “Xem phân bổ” và được máy chủ tính lại lần nữa lúc ghi sổ.
                              </div>
                            )}
                            {(line._context?.stock_snapshot?.batches ?? []).length ? (
                              <div className="mt-1 space-y-0.5 text-[10px]">
                                <div className="font-medium">Lô đang có trong kho</div>
                                {(line._context?.stock_snapshot?.batches ?? []).map((batch, batchIndex) => (
                                  <div key={`${text(batch.batch_no)}-${batchIndex}`} className="text-muted-foreground">
                                    {text(batch.batch_no)} · {quantity(batch.qty)}
                                    {batch.length_m ? ` · dài ${quantity(batch.length_m)} m` : ""}
                                    {batch.weight_kg ? ` · ${quantity(batch.weight_kg)} kg` : ""}
                                    {text(batch.color) ? ` · ${text(batch.color)}` : ""}
                                    {batch.is_offcut ? " · đầu thừa" : ""}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[11px] font-medium">Giữ chỗ tồn (Stock Reservation)</div>
                            {(line._reservations ?? []).length ? (
                              <div className="space-y-1">
                                {(line._reservations ?? []).map((row) => (
                                  <div key={text(row.name)} className="rounded border bg-card px-1.5 py-1 text-[10px]">
                                    <div className="flex flex-wrap items-center gap-x-2">
                                      <strong>{text(row.name)}</strong>
                                      <span>{quantity(row.qty_reserved)} · khổ ≥ {quantity(row.min_length_m)} m</span>
                                      <span className="text-muted-foreground">{text(row.source_doctype)} {text(row.source_name)}</span>
                                    </div>
                                    <div className="mt-1 flex items-end gap-1.5">
                                      <div className="min-w-40 flex-1">
                                        <AlumdoorSalesOrderField
                                          id={`delivery-v2-release-${text(row.name)}`}
                                          field={fallbackField("released_reason", "Lý do nhả", "Link", "Lý do huỷ")}
                                          label="Lý do nhả"
                                          hideLabel
                                          value={releaseReasons[text(row.name)] ?? ""}
                                          onChange={(value) => setReleaseReasons((current) => ({ ...current, [text(row.name)]: text(value) }))}
                                          registry={props.registry}
                                          services={props.services}
                                          parentDoctype="Stock Reservation"
                                          docValues={row}
                                          roles={props.roles}
                                          readOnly={props.busy}
                                          compact
                                          className="[&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_button]:!h-7"
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7"
                                        disabled={props.busy || !text(releaseReasons[text(row.name)])}
                                        onClick={() => props.onReleaseReservation(line._key, text(row.name), text(releaseReasons[text(row.name)]))}
                                      >
                                        <Unlock className="size-3" /> Nhả
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground">Không có phiếu giữ chỗ nào đang treo trên mã này.</div>
                            )}

                            <div className="rounded border border-dashed px-1.5 py-1">
                              <div className="text-[10px] font-medium">Giữ chỗ cho phần chưa xuất</div>
                              <div className="mt-1 grid grid-cols-3 gap-1">
                                <div>
                                  <Label htmlFor={`delivery-v2-reserve-len-${line._key}`} className="text-[9px] text-muted-foreground">Khổ tối thiểu (m)</Label>
                                  <Input
                                    id={`delivery-v2-reserve-len-${line._key}`}
                                    type="number"
                                    className="mt-0.5 h-7 text-[11px]"
                                    value={Number.isFinite(draft.min_length_m) ? draft.min_length_m : 0}
                                    onChange={(event) => setReserveDrafts((current) => ({
                                      ...current,
                                      [line._key]: { ...draft, min_length_m: Number(event.target.value) },
                                    }))}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`delivery-v2-reserve-qty-${line._key}`} className="text-[9px] text-muted-foreground">Số giữ</Label>
                                  <Input
                                    id={`delivery-v2-reserve-qty-${line._key}`}
                                    type="number"
                                    className="mt-0.5 h-7 text-[11px]"
                                    value={Number.isFinite(draft.qty_reserved) ? draft.qty_reserved : 0}
                                    onChange={(event) => setReserveDrafts((current) => ({
                                      ...current,
                                      [line._key]: { ...draft, qty_reserved: Number(event.target.value) },
                                    }))}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`delivery-v2-reserve-exp-${line._key}`} className="text-[9px] text-muted-foreground">Hết hạn</Label>
                                  <Input
                                    id={`delivery-v2-reserve-exp-${line._key}`}
                                    type="date"
                                    className="mt-0.5 h-7 text-[11px]"
                                    value={draft.expires_at}
                                    onChange={(event) => setReserveDrafts((current) => ({
                                      ...current,
                                      [line._key]: { ...draft, expires_at: event.target.value },
                                    }))}
                                  />
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-1 h-7"
                                disabled={props.busy || !text(line._salesOrder) || !text(line.warehouse) || !draft.expires_at || !(draft.qty_reserved > 0) || !(draft.min_length_m > 0)}
                                onClick={() => props.onReserve(line._key, draft)}
                              >
                                <Lock className="size-3" /> Giữ chỗ
                              </Button>
                              <div className="mt-1 text-[9px] text-muted-foreground">
                                Máy chủ chỉ nhận giữ chỗ theo Work Order / Sales Order / Cut Order, nên phiếu giữ được ghi theo Đơn bán nguồn của dòng. Giữ chỗ KHÔNG làm đổi tồn thực.
                              </div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
            {!props.lines.length ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                  Chưa có dòng nào. Chọn Đơn bán rồi bấm “Nạp phần còn phải giao”.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
