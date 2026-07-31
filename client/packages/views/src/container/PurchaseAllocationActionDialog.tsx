import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@metaforge/ui";

export interface PurchaseAllocationActionWindow {
  queue_key: string;
  window_id: string;
  sequence: number;
  status: "Open" | "Settled" | "Reversed";
  tolerance: string;
  nominal_qty: string;
  received_qty: string;
  remaining_qty: string;
  minimum_qty: string | null;
  maximum_qty: string | null;
  shortage_variance: string | null;
  overage_variance: string | null;
  reason: string | null;
}

export interface PurchaseAllocationActionRow {
  row_id: string;
  event: string;
  window: string;
  purchase_receipt: string | null;
  receipt_row: string | null;
  purchase_order: string | null;
  purchase_order_row: string | null;
  qty: string;
}

export type PurchaseAllocationActionTarget =
  | { kind: "close" | "reverse"; window: PurchaseAllocationActionWindow }
  | { kind: "override"; row: PurchaseAllocationActionRow };

export interface PurchaseAllocationActionSubmission {
  doctype: "Purchase Settlement" | "Purchase Allocation Override";
  document: Record<string, unknown>;
  successMessage: string;
}

export interface PurchaseAllocationActionDialogProps {
  target: PurchaseAllocationActionTarget | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (submission: PurchaseAllocationActionSubmission) => void;
}

export function PurchaseAllocationActionDialog(props: PurchaseAllocationActionDialogProps) {
  const { target, saving, onCancel, onSubmit } = props;
  const [reason, setReason] = useState("");
  const [targetPurchaseOrder, setTargetPurchaseOrder] = useState("");
  const [targetPurchaseOrderRow, setTargetPurchaseOrderRow] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setTargetPurchaseOrder("");
    setTargetPurchaseOrderRow("");
    setQuantity(target?.kind === "override" ? target.row.qty : "");
    setError(null);
  }, [target]);

  const projectedBounds = useMemo(() => {
    if (!target || target.kind === "override") return null;
    return settlementBounds(target.window);
  }, [target]);

  const submit = () => {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError("Lý do là bắt buộc để lưu dấu vết kiểm toán.");
      return;
    }
    if (!target) return;

    if (target.kind === "override") {
      const cleanPurchaseOrder = targetPurchaseOrder.trim();
      const cleanRow = targetPurchaseOrderRow.trim();
      const cleanQuantity = quantity.trim();
      const numericQuantity = Number(cleanQuantity);
      if (!cleanPurchaseOrder || !cleanRow) {
        setError("Đơn mua đích và dòng PO đích là bắt buộc.");
        return;
      }
      if (!cleanQuantity || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
        setError("Số lượng điều chỉnh phải lớn hơn 0.");
        return;
      }
      onSubmit({
        doctype: "Purchase Allocation Override",
        document: {
          source_allocation_entry_id: target.row.row_id,
          target_purchase_order: cleanPurchaseOrder,
          target_purchase_order_item_row_id: cleanRow,
          qty: cleanQuantity,
          reason: cleanReason,
        },
        successMessage: "Đã ghi điều chỉnh phân bổ FIFO.",
      });
      return;
    }

    onSubmit({
      doctype: "Purchase Settlement",
      document: {
        operation: target.kind === "close" ? "Close" : "Reverse",
        queue_key: target.window.queue_key,
        window_id: target.window.window_id,
        reason: cleanReason,
      },
      successMessage: target.kind === "close"
        ? "Đã đóng cửa sổ tất toán."
        : "Đã đảo lần tất toán.",
    });
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,720px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{dialogTitle(target)}</DialogTitle>
          <DialogDescription>{dialogDescription(target)}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {target?.kind === "override" ? (
            <>
              <ScopeGrid entries={[
                ["Nguồn allocation", target.row.row_id],
                ["Phiếu nhập nguồn", target.row.purchase_receipt ?? "—"],
                ["Đơn mua hiện tại", target.row.purchase_order ?? "—"],
                ["Dòng PO hiện tại", target.row.purchase_order_row ?? "—"],
                ["Cửa sổ", target.row.window],
                ["Có thể chọn tối đa", target.row.qty],
              ]} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Đơn mua đích" htmlFor="allocation-target-po">
                  <Input
                    id="allocation-target-po"
                    value={targetPurchaseOrder}
                    disabled={saving}
                    onChange={(event) => setTargetPurchaseOrder(event.target.value)}
                    placeholder="PO-2026-00001"
                  />
                </Field>
                <Field label="Mã dòng PO đích" htmlFor="allocation-target-row">
                  <Input
                    id="allocation-target-row"
                    value={targetPurchaseOrderRow}
                    disabled={saving}
                    onChange={(event) => setTargetPurchaseOrderRow(event.target.value)}
                    placeholder="ROW-..."
                  />
                </Field>
              </div>
              <Field label="Số lượng điều chỉnh" htmlFor="allocation-override-qty">
                <Input
                  id="allocation-override-qty"
                  inputMode="decimal"
                  value={quantity}
                  disabled={saving}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
            </>
          ) : target ? (
            <>
              <ScopeGrid entries={[
                ["Cửa sổ", `#${target.window.sequence}`],
                ["Trạng thái", statusLabel(target.window.status)],
                ["Queue", target.window.queue_key],
                ["Dung sai", target.window.tolerance],
                ["Danh nghĩa", target.window.nominal_qty],
                ["Đã nhận", target.window.received_qty],
                ["Còn danh nghĩa", target.window.remaining_qty],
                ["Cận dưới", target.window.minimum_qty ?? projectedBounds?.minimum ?? "—"],
                ["Cận trên", target.window.maximum_qty ?? projectedBounds?.maximum ?? "—"],
              ]} />
              {target.kind === "close" ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Cận dưới và cận trên chưa được ledger đóng ghi nhận sẽ được hiển thị dưới dạng dự kiến. Máy chủ tính lại bằng fixed-point khi submit.
                </p>
              ) : null}
            </>
          ) : null}

          <Field label="Lý do" htmlFor="allocation-action-reason">
            <Textarea
              id="allocation-action-reason"
              value={reason}
              disabled={saving}
              onChange={(event) => { setReason(event.target.value); setError(null); }}
              placeholder="Nêu rõ căn cứ nghiệp vụ và người phê duyệt…"
              rows={4}
            />
          </Field>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Hủy</Button>
          <Button
            type="button"
            variant={target?.kind === "reverse" ? "destructive" : "default"}
            disabled={saving}
            onClick={submit}
          >
            {saving ? "Đang xử lý…" : confirmLabel(target)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      {props.children}
    </div>
  );
}

function ScopeGrid(props: { entries: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {props.entries.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-all font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function dialogTitle(target: PurchaseAllocationActionTarget | null): string {
  if (!target) return "Xác nhận thao tác phân bổ";
  if (target.kind === "close") return "Đóng cửa sổ tất toán";
  if (target.kind === "reverse") return "Đảo lần tất toán";
  return "Điều chỉnh phân bổ FIFO";
}

function dialogDescription(target: PurchaseAllocationActionTarget | null): string {
  if (target?.kind === "close") return "Tạo và submit Purchase Settlement qua Durable Object. Thao tác được ghi append-only.";
  if (target?.kind === "reverse") return "Không sửa bản ghi đóng cũ. Máy chủ ghi một settlement reversal mới nếu lifecycle cho phép.";
  if (target?.kind === "override") return "Máy chủ đảo một phần allocation nguồn và phân bổ sang dòng PO đích trong cùng mutation.";
  return "Kiểm tra scope và nhập lý do trước khi xác nhận.";
}

function confirmLabel(target: PurchaseAllocationActionTarget | null): string {
  if (target?.kind === "close") return "Đóng cửa sổ";
  if (target?.kind === "reverse") return "Đảo tất toán";
  if (target?.kind === "override") return "Ghi điều chỉnh";
  return "Xác nhận";
}

function statusLabel(status: PurchaseAllocationActionWindow["status"]): string {
  if (status === "Open") return "Đang mở";
  if (status === "Settled") return "Đã tất toán";
  return "Đã đảo tất toán";
}

function settlementBounds(window: PurchaseAllocationActionWindow): { minimum: string; maximum: string } | null {
  const nominal = Number(window.nominal_qty);
  const tolerancePercent = Number(window.tolerance.replace("%", ""));
  if (!Number.isFinite(nominal) || !Number.isFinite(tolerancePercent)) return null;
  const ratio = tolerancePercent / 100;
  return {
    minimum: trimNumber(nominal * (1 - ratio)),
    maximum: trimNumber(nominal * (1 + ratio)),
  };
}

function trimNumber(value: number): string {
  return value.toFixed(6).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
