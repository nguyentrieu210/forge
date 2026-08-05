import { useCallback, useEffect, useState } from "react";
import { Loader2, PackageCheck, RefreshCw, RotateCcw, Truck, XCircle } from "lucide-react";
import { Badge, Button, Separator, StatusBadge, toast } from "@metaforge/ui";

interface MarketplaceOrderRef {
  order_id: string;
  sales_order_name: string | null;
  status: string;
  currency: string;
}

interface Shipment {
  shipment_id: string;
  delivery_note_name: string;
  carrier: string;
  tracking_code: string | null;
  status: string;
  cod_expected_minor: number;
  cod_collected_minor: number | null;
  cod_reconciled_at: string | null;
  created_at: string;
  modified_at: string;
}

interface FulfillmentProjection {
  order_id: string;
  sales_order_name: string | null;
  status: string;
  currency: string;
  shipments: Shipment[];
}

export function MarketplaceFulfillmentPanel({
  order,
  onClose,
  onReloadOrders,
  onAuthenticationRequired,
}: {
  order: MarketplaceOrderRef;
  onClose: () => void;
  onReloadOrders: () => Promise<void>;
  onAuthenticationRequired: () => void;
}) {
  const [projection, setProjection] = useState<FulfillmentProjection>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [deliveryNote, setDeliveryNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [returnDeliveryNote, setReturnDeliveryNote] = useState("");
  const [stockReturn, setStockReturn] = useState("");
  const [codValues, setCodValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await request<FulfillmentProjection>(
        `/api/v1/social/marketplace/orders/${encodeURIComponent(order.order_id)}/fulfillment`,
      );
      setProjection(next);
      if (!returnDeliveryNote && next.shipments[0]?.delivery_note_name) setReturnDeliveryNote(next.shipments[0].delivery_note_name);
      setCodValues((current) => {
        const values = { ...current };
        for (const shipment of next.shipments) {
          if (!shipment.cod_reconciled_at && values[shipment.shipment_id] === undefined) {
            values[shipment.shipment_id] = minorToMajorText(shipment.cod_expected_minor, next.currency);
          }
        }
        return values;
      });
    } catch (error) {
      if (error instanceof FulfillmentApiError && error.status === 401) onAuthenticationRequired();
      else toast.error(error instanceof Error ? error.message : "Không tải được vận hành đơn hàng");
    } finally {
      setLoading(false);
    }
  }, [onAuthenticationRequired, order.order_id, returnDeliveryNote]);

  useEffect(() => { void load(); }, [load]);

  async function run(label: string, action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(label);
    try {
      await action();
      toast.success(success);
      await Promise.all([load(), onReloadOrders()]);
    } catch (error) {
      if (error instanceof FulfillmentApiError && error.status === 401) onAuthenticationRequired();
      else toast.error(error instanceof Error ? error.message : "Thao tác vận hành thất bại");
    } finally {
      setBusy(undefined);
    }
  }

  async function cancelOrder() {
    if (!window.confirm(`Hủy ${order.order_id}? Sales Order canonical sẽ được hủy theo lifecycle và reservation marketplace sẽ được release.`)) return;
    await run(
      "cancel",
      () => request(`/api/v1/social/orders/${encodeURIComponent(order.order_id)}/cancel`, { method: "POST", body: "{}" }),
      "Đã hủy đơn và giải phóng reservation marketplace",
    );
  }

  async function createShipment() {
    if (!deliveryNote.trim() || !carrier.trim()) {
      toast.warning("Cần nhập Delivery Note và đơn vị vận chuyển");
      return;
    }
    await run(
      "shipment",
      () => request(`/api/v1/social/orders/${encodeURIComponent(order.order_id)}/shipments`, {
        method: "POST",
        body: JSON.stringify({
          delivery_note_name: deliveryNote.trim(),
          carrier: carrier.trim(),
          ...(tracking.trim() ? { tracking_code: tracking.trim() } : {}),
        }),
      }),
      "Đã đăng ký shipment từ Delivery Note canonical",
    );
    setDeliveryNote("");
    setCarrier("");
    setTracking("");
  }

  async function updateShipmentStatus(shipment: Shipment, status: string) {
    await run(
      `${shipment.shipment_id}:${status}`,
      () => request(`/api/v1/social/shipments/${encodeURIComponent(shipment.shipment_id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
      `Đã cập nhật vận chuyển: ${shipmentStatusLabel(status)}`,
    );
  }

  async function reconcileCod(shipment: Shipment, currency: string) {
    const collectedMinor = majorTextToMinor(codValues[shipment.shipment_id] ?? "", currency);
    if (collectedMinor === null) {
      toast.warning("Số COD đã thu không hợp lệ");
      return;
    }
    await run(
      `cod:${shipment.shipment_id}`,
      () => request(`/api/v1/social/shipments/${encodeURIComponent(shipment.shipment_id)}/cod-reconcile`, {
        method: "POST",
        body: JSON.stringify({ cod_collected_minor: collectedMinor }),
      }),
      "Đã đối chiếu COD với Delivery Note canonical; Finance vẫn chưa tự động post GL",
    );
  }

  async function createReturn() {
    if (!returnDeliveryNote.trim() || !stockReturn.trim()) {
      toast.warning("Cần nhập Delivery Note gốc và Stock Return canonical");
      return;
    }
    await run(
      "return",
      () => request(`/api/v1/social/orders/${encodeURIComponent(order.order_id)}/returns`, {
        method: "POST",
        body: JSON.stringify({
          delivery_note_name: returnDeliveryNote.trim(),
          stock_return_name: stockReturn.trim(),
        }),
      }),
      "Đã ghi nhận trả hàng từ Stock Return canonical",
    );
    setStockReturn("");
  }

  const current = projection ?? { ...order, shipments: [] };
  const terminal = current.status === "cancelled" || current.status === "returned";

  return (
    <div className="border-y bg-muted/20 p-3 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Vận hành {order.order_id}</h3>
            <StatusBadge tone={orderTone(current.status)}>{orderStatusLabel(current.status)}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Sales Order: {current.sales_order_name ?? "—"}. Mọi mutation vẫn đi qua authority Sales Order / Delivery Note / Stock Return của ERP.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Làm mới</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
        </div>
      </div>

      {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Đang tải shipment...</div> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2"><Truck className="size-4" /><h4 className="text-sm font-medium">Giao hàng canonical</h4></div>
          <p className="mt-1 text-xs text-muted-foreground">Chỉ đăng ký shipment khi Delivery Note đã tồn tại và thuộc đúng Sales Order.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Field label="Delivery Note" value={deliveryNote} onChange={setDeliveryNote} placeholder="DN-00001" />
            <Field label="Đơn vị vận chuyển" value={carrier} onChange={setCarrier} placeholder="GHN / J&T / SPX" />
            <Field label="Tracking" value={tracking} onChange={setTracking} placeholder="Tùy chọn" />
          </div>
          <Button className="mt-3" size="sm" disabled={terminal || Boolean(busy)} onClick={() => void createShipment()}>
            {busy === "shipment" ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} Đăng ký Delivery Note
          </Button>

          <Separator className="my-4" />
          <div className="space-y-2">
            {current.shipments.length ? current.shipments.map((shipment) => (
              <div key={shipment.shipment_id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{shipment.delivery_note_name}</p><p className="text-xs text-muted-foreground">{shipment.carrier}{shipment.tracking_code ? ` · ${shipment.tracking_code}` : ""}</p></div>
                  <StatusBadge tone={shipmentTone(shipment.status)}>{shipmentStatusLabel(shipment.status)}</StatusBadge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {nextShipmentStatuses(shipment.status).map((status) => (
                    <Button key={status} variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void updateShipmentStatus(shipment, status)}>
                      {busy === `${shipment.shipment_id}:${status}` ? <Loader2 className="size-4 animate-spin" /> : null}{shipmentStatusLabel(status)}
                    </Button>
                  ))}
                </div>
                <div className="mt-3 rounded-md bg-muted/30 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">COD theo Delivery Note</span>
                    <Badge variant="outline">{money(shipment.cod_expected_minor, current.currency)}</Badge>
                  </div>
                  {shipment.cod_reconciled_at ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <p>Đã thu: {money(shipment.cod_collected_minor ?? 0, current.currency)}</p>
                      <p>Đối chiếu lúc {dateTime(shipment.cod_reconciled_at)} · chưa tự động post GL/Payment Entry.</p>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="grid min-w-40 flex-1 gap-1 text-xs font-medium">COD thực thu ({current.currency})<input className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" inputMode="decimal" value={codValues[shipment.shipment_id] ?? ""} onChange={(event) => setCodValues((values) => ({ ...values, [shipment.shipment_id]: event.target.value }))} placeholder={minorToMajorText(shipment.cod_expected_minor, current.currency)} /></label>
                      <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void reconcileCod(shipment, current.currency)}>{busy === `cod:${shipment.shipment_id}` ? <Loader2 className="size-4 animate-spin" /> : null}Đối chiếu COD</Button>
                    </div>
                  )}
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">Chưa có Delivery Note được đăng ký cho đơn này.</p>}
          </div>
        </section>

        <section className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2"><RotateCcw className="size-4" /><h4 className="text-sm font-medium">Hủy / trả hàng</h4></div>
          <p className="mt-1 text-xs text-muted-foreground">Không tạo stock truth riêng: trả hàng chỉ được ghi nhận khi Stock Return canonical đã tồn tại.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Delivery Note gốc" value={returnDeliveryNote} onChange={setReturnDeliveryNote} placeholder="DN-00001" />
            <Field label="Stock Return" value={stockReturn} onChange={setStockReturn} placeholder="SR-00001" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={terminal || Boolean(busy)} onClick={() => void createReturn()}>
              {busy === "return" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Ghi nhận trả hàng
            </Button>
            <Button variant="outline" size="sm" disabled={terminal || Boolean(busy)} onClick={() => void cancelOrder()}>
              {busy === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} Hủy đơn
            </Button>
          </div>
          <div className="mt-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>Hủy đơn sau khi COD đã reconcile sẽ bị backend chặn cho tới khi Finance canonical được đảo.</p>
            <p className="mt-1">COD mismatch cũng bị chặn: số thực thu phải bằng đúng giá trị Delivery Note trước khi đánh dấu đã đối chiếu.</p>
            <p className="mt-1">Trạng thái giao/return không được nhập tự do; server kiểm transition và quan hệ chứng từ.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1 text-xs font-medium">{label}<input className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={320} autoComplete="off" /></label>;
}

function nextShipmentStatuses(status: string): string[] {
  if (status === "ready") return ["picked_up", "in_transit", "failed"];
  if (status === "picked_up") return ["in_transit", "delivered", "failed"];
  if (status === "in_transit") return ["delivered", "failed"];
  if (status === "failed") return ["picked_up", "in_transit"];
  return [];
}

function shipmentStatusLabel(status: string): string {
  if (status === "ready") return "Sẵn sàng";
  if (status === "picked_up") return "Đã lấy hàng";
  if (status === "in_transit") return "Đang vận chuyển";
  if (status === "delivered") return "Đã giao";
  if (status === "failed") return "Giao thất bại";
  if (status === "returned") return "Đã trả";
  return status;
}

function shipmentTone(status: string): "success" | "warning" | "info" | "muted" {
  if (status === "delivered") return "success";
  if (status === "failed" || status === "returned") return "warning";
  if (status === "picked_up" || status === "in_transit") return "info";
  return "muted";
}

function orderStatusLabel(status: string): string {
  if (status === "confirmed") return "Đã xác nhận";
  if (status === "packing") return "Đóng gói";
  if (status === "shipped") return "Đang giao";
  if (status === "completed") return "Hoàn tất";
  if (status === "cancelled") return "Đã hủy";
  if (status === "returned") return "Đã trả";
  return status;
}

function orderTone(status: string): "success" | "warning" | "info" | "muted" {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "returned") return "warning";
  if (status === "packing" || status === "shipped") return "info";
  return "muted";
}

function currencyDigits(currency: string): number {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 0; }
  catch { return currency === "VND" ? 0 : 2; }
}

function minorToMajorText(minor: number, currency: string): string {
  const scale = 10 ** currencyDigits(currency);
  const digits = currencyDigits(currency);
  return (minor / scale).toFixed(digits);
}

function majorTextToMinor(value: string, currency: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  const scale = 10 ** currencyDigits(currency);
  const minor = Math.round(numeric * scale);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

function money(minor: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "VND";
  const digits = currencyDigits(code);
  try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: code }).format(minor / (10 ** digits)); }
  catch { return `${minor} ${code}`; }
}

class FulfillmentApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "FulfillmentApiError"; }
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
  if (!response.ok) throw new FulfillmentApiError(body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`, response.status);
  return body;
}

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}
