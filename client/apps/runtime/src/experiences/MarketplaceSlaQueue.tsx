import { useMemo, useState } from "react";
import { AlertTriangle, Timer } from "lucide-react";
import { Badge, Button, Separator, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metaforge/ui";
import { MarketplaceSlaBadge, slaNeedsAttention, type MarketplaceSlaObservation } from "./MarketplaceSlaBadge";

type SlaFilter = "attention" | "breached" | "unconfigured" | "all";

interface MarketplaceSlaOrder {
  order_id: string;
  provider: string;
  sales_order_name: string | null;
  customer: string | null;
  status: string;
  channel_profile?: string | null;
  sla?: MarketplaceSlaObservation | null;
}

export function MarketplaceSlaQueue({ orders }: { orders: MarketplaceSlaOrder[] }) {
  const [filter, setFilter] = useState<SlaFilter>("attention");
  const counts = useMemo(() => ({
    attention: orders.filter((order) => slaNeedsAttention(order.sla ?? null)).length,
    breached: orders.filter((order) => order.sla?.state === "breached").length,
    unconfigured: orders.filter((order) => !order.sla).length,
    all: orders.length,
  }), [orders]);
  const filtered = useMemo(() => orders.filter((order) => {
    if (filter === "attention") return slaNeedsAttention(order.sla ?? null);
    if (filter === "breached") return order.sla?.state === "breached";
    if (filter === "unconfigured") return !order.sla;
    return true;
  }), [filter, orders]);

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm" aria-label="Hàng đợi SLA marketplace">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 md:p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">SLA xử lý đơn</h2>
            {counts.attention ? <StatusBadge tone="warning">{counts.attention} cần chú ý</StatusBadge> : <StatusBadge tone="success">Không có cảnh báo</StatusBadge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Ngưỡng lấy từ Marketplace SLA Policy. Đồng hồ bắt đầu ở thời điểm Forge nhận đơn và dừng ở shipment/Delivery Note canonical đầu tiên.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.assign("/app/Marketplace%20SLA%20Policy")}><Timer className="size-4" /> Chính sách SLA</Button>
      </div>
      <Separator />
      <div className="flex flex-wrap gap-2 p-3 md:p-4">
        <SlaFilterButton active={filter === "attention"} onClick={() => setFilter("attention")} label="Cần chú ý" count={counts.attention} />
        <SlaFilterButton active={filter === "breached"} onClick={() => setFilter("breached")} label="Vi phạm" count={counts.breached} />
        <SlaFilterButton active={filter === "unconfigured"} onClick={() => setFilter("unconfigured")} label="Chưa cấu hình" count={counts.unconfigured} />
        <SlaFilterButton active={filter === "all"} onClick={() => setFilter("all")} label="Tất cả" count={counts.all} />
      </div>
      {filtered.length ? (
        <div className="overflow-x-auto border-t">
          <Table><TableHeader><TableRow><TableHead>Kênh</TableHead><TableHead>Đơn</TableHead><TableHead>Gian hàng</TableHead><TableHead>Sales Order</TableHead><TableHead>Customer</TableHead><TableHead>SLA</TableHead></TableRow></TableHeader><TableBody>
            {filtered.map((order) => <TableRow key={order.order_id}>
              <TableCell><Badge variant="outline">{providerLabel(order.provider)}</Badge></TableCell>
              <TableCell className="max-w-56 truncate font-medium">{order.order_id}</TableCell>
              <TableCell className="max-w-52 truncate">{order.channel_profile ?? "—"}</TableCell>
              <TableCell>{order.sales_order_name ?? "—"}</TableCell>
              <TableCell className="max-w-44 truncate">{order.customer ?? "—"}</TableCell>
              <TableCell><MarketplaceSlaBadge sla={order.sla ?? null} /></TableCell>
            </TableRow>)}
          </TableBody></Table>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground">
          <AlertTriangle className="size-4" /> Không có đơn trong nhóm SLA đang chọn.
        </div>
      )}
    </section>
  );
}

function SlaFilterButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick}>{label}<Badge variant="secondary">{count}</Badge></Button>;
}

function providerLabel(value: string): string {
  if (value === "tiktok_shop") return "TikTok Shop";
  if (value === "shopee") return "Shopee";
  if (value === "lazada") return "Lazada";
  return value;
}
