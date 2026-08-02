import { useCallback, useState } from "react";
import { ArrowLeftRight, Banknote, CalendarClock, ClipboardCheck, Factory, Landmark, Loader2, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMetaForge } from "@metaforge/views/provider";
import {
  Badge, Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger, Textarea, toast,
} from "@metaforge/ui";

interface OperationRow {
  sales_order: string;
  delivery_date?: string;
  customer?: string;
  customer_group?: string;
  responsible_person?: string;
  product_group?: string;
  manual_note?: string;
  grand_total?: number;
  amount_collected?: number;
  delivery_status?: string;
  production_status?: string;
  defect_status?: string;
}

interface DeliveryRow {
  sales_order: string;
  customer?: string;
  delivery_batch_key: string;
  existing_delivery_note?: string;
  status: "Sẵn sàng" | "Đã tạo";
}

const WAREHOUSE_CASH_ROLES = new Set([
  "Warehouse Cash User",
  "Warehouse Cash Manager",
  "Thủ kho",
  "Chủ xưởng",
  "General Accountant",
  "Chief Accountant",
  "Kế toán trưởng",
  "Accounts Manager",
  "System Manager",
  "Administrator",
]);

const WAREHOUSE_CASH_SHORTCUTS = [
  {
    doctype: "Warehouse Cash Fund",
    label: "Quỹ tiền mặt theo kho",
    description: "Xem quỹ, kho, người giữ quỹ, hạn mức ngày và tài khoản tiền mặt đã map.",
    icon: Landmark,
  },
  {
    doctype: "Warehouse Cash Voucher",
    label: "Phiếu thu / chi kho",
    description: "Thu, chi, nạp/hoàn quỹ, tạm ứng/hoàn ứng và điều chỉnh có kiểm soát.",
    icon: Banknote,
  },
  {
    doctype: "Warehouse Cash Transfer",
    label: "Chuyển quỹ",
    description: "Bàn giao tiền giữa hai quỹ kho; không tính vào hạn mức chi phí trực tiếp trong ngày.",
    icon: ArrowLeftRight,
  },
  {
    doctype: "Warehouse Cash Count",
    label: "Kiểm quỹ / bàn giao",
    description: "Chốt ngày, bàn giao ca hoặc kiểm đột xuất theo số dư GL authoritative.",
    icon: ClipboardCheck,
  },
] as const;

const today = () => {
  const date = new Date();
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const money = (value: number | undefined) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0,
}).format(value ?? 0);

export function AlumdoorOperationsCenter() {
  const { adapter, roles } = useMetaForge();
  const navigate = useNavigate();
  const canUseWarehouseCash = roles.some((role) => WAREHOUSE_CASH_ROLES.has(role));
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [printDocuments, setPrintDocuments] = useState<Array<{ doctype: string; name: string }>>([]);
  const [demands, setDemands] = useState('[{"key":"CUA-1","door_type":"Cửa Đức","operation":"Lắp","basis":"set","quantity":5,"minutes_per_unit":60}]');
  const [resource, setResource] = useState(() => JSON.stringify({ persons: 2, shifts: 1, shift_hours: 8, efficiency: 1, overtime_hours: 0, start_date: today(), holidays: [] }));
  const [capacity, setCapacity] = useState<Record<string, number | boolean | string> | null>(null);

  const run = useCallback(async (name: string, task: () => Promise<void>) => {
    setBusy(name);
    try { await task(); }
    catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setBusy(""); }
  }, [adapter]);

  const loadOverview = () => run("overview", async () => {
    const result = await adapter.callPost<{ rows: OperationRow[] }>("alumdoor.operations.overview", {});
    setRows(result.rows);
  });
  const loadDeliveries = () => run("delivery-preview", async () => {
    const result = await adapter.callPost<{ rows: DeliveryRow[] }>("alumdoor.delivery_batch.preview", { delivery_date: deliveryDate });
    setDeliveries(result.rows);
  });
  const createDeliveries = () => run("delivery-create", async () => {
    const result = await adapter.callPost<{ results: Array<{ status: string }>; print_documents: Array<{ doctype: string; name: string }> }>("alumdoor.delivery_batch.create", {
      delivery_date: deliveryDate, warehouse,
    });
    setPrintDocuments(result.print_documents);
    toast.success(`Đã xử lý ${result.results.length} đơn; ${result.print_documents.length} phiếu sẵn sàng để in.`);
    await loadDeliveries();
  });
  const calculateCapacity = () => run("capacity", async () => {
    const result = await adapter.callPost<Record<string, number | boolean | string>>("alumdoor.capacity.preview", { demands_json: demands, resource_json: resource });
    setCapacity(result);
  });

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Trung tâm vận hành Alumdoor</h1><p className="text-sm text-muted-foreground">Theo dõi đơn, tải xưởng, giao hàng, quỹ kho và hồ sơ lỗi từ chứng từ gốc.</p></div>
        <Button variant="outline" onClick={loadOverview} disabled={Boolean(busy)}>{busy === "overview" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Làm mới</Button>
      </div>
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="orders"><CalendarClock className="size-4" /> Theo dõi chung</TabsTrigger>
          <TabsTrigger value="deliveries"><Truck className="size-4" /> Giao theo ngày</TabsTrigger>
          {canUseWarehouseCash && <TabsTrigger value="warehouse-cash" data-testid="warehouse-cash-tab"><Banknote className="size-4" /> Quỹ kho</TabsTrigger>}
          <TabsTrigger value="capacity"><Factory className="size-4" /> Năng lực & tăng ca</TabsTrigger>
          <TabsTrigger value="warranty"><ShieldCheck className="size-4" /> Bảo hành/lỗi</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="rounded-xl border bg-card">
          <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <TableHead>Đơn / ngày giao</TableHead><TableHead>Khách / phụ trách</TableHead><TableHead>Nhóm hàng</TableHead><TableHead>Thu tiền</TableHead><TableHead>Giao</TableHead><TableHead>Sản xuất</TableHead><TableHead>Lỗi</TableHead><TableHead>Ghi chú</TableHead>
          </TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.sales_order}>
            <TableCell className="font-medium">{row.sales_order}<div className="text-xs text-muted-foreground">{row.delivery_date || "Chưa hẹn"}</div></TableCell>
            <TableCell>{row.customer}<div className="text-xs text-muted-foreground">{row.customer_group} · {row.responsible_person || "Chưa giao"}</div></TableCell>
            <TableCell>{row.product_group || "—"}</TableCell><TableCell>{money(row.amount_collected)}<div className="text-xs text-muted-foreground">/ {money(row.grand_total)}</div></TableCell>
            <TableCell><Badge variant="outline">{row.delivery_status}</Badge></TableCell><TableCell><Badge variant="outline">{row.production_status}</Badge></TableCell><TableCell><Badge variant={row.defect_status === "Không có" ? "outline" : "destructive"}>{row.defect_status}</Badge></TableCell><TableCell className="max-w-56 whitespace-normal">{row.manual_note || "—"}</TableCell>
          </TableRow>)}{!rows.length && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">Bấm “Làm mới” để tải các đơn đang vận hành.</TableCell></TableRow>}</TableBody></Table></div>
        </TabsContent>

        <TabsContent value="deliveries" className="space-y-4 rounded-xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="delivery-date">Ngày giao</Label><Input id="delivery-date" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></div><div><Label htmlFor="warehouse">Kho xuất</Label><Input id="warehouse" value={warehouse} onChange={(event) => setWarehouse(event.target.value)} placeholder="Kho thành phẩm" /></div><div className="flex items-end gap-2"><Button variant="outline" onClick={loadDeliveries} disabled={Boolean(busy)}>Xem trước</Button><Button onClick={createDeliveries} disabled={Boolean(busy) || !deliveries.some((row) => row.status === "Sẵn sàng")}>Tạo phiếu nháp</Button></div></div>
          <Table><TableHeader><TableRow><TableHead>Đơn</TableHead><TableHead>Khách</TableHead><TableHead>Khóa chống trùng</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader><TableBody>{deliveries.map((row) => <TableRow key={row.delivery_batch_key}><TableCell>{row.sales_order}</TableCell><TableCell>{row.customer}</TableCell><TableCell className="font-mono text-xs">{row.delivery_batch_key}</TableCell><TableCell><Badge variant="outline">{row.status}{row.existing_delivery_note ? ` · ${row.existing_delivery_note}` : ""}</Badge></TableCell></TableRow>)}</TableBody></Table>
          {printDocuments.length > 0 && <div className="rounded-lg border border-dashed p-3"><p className="text-sm font-medium">Gói in ngày {deliveryDate}</p><div className="mt-2 flex flex-wrap gap-2">{printDocuments.map((doc) => <Button key={`${doc.doctype}:${doc.name}`} size="sm" variant="outline" onClick={() => window.open(`/print/${encodeURIComponent(doc.doctype)}/${encodeURIComponent(doc.name)}`, "_blank", "noopener,noreferrer")}>In {doc.name}</Button>)}</div></div>}
        </TabsContent>

        {canUseWarehouseCash && <TabsContent value="warehouse-cash" className="space-y-4" data-testid="warehouse-cash-panel">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Quỹ tiền mặt theo từng kho</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Thu/chi, chuyển quỹ và kiểm quỹ dùng chứng từ Warehouse Cash canonical của Kế toán Việt Nam. Bút toán đi thẳng vào GL; người tạo chứng từ không được tự duyệt.</p>
              </div>
              <Badge variant="outline">Finance authoritative</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {WAREHOUSE_CASH_SHORTCUTS.map((item) => {
                const Icon = item.icon;
                return <Button
                  key={item.doctype}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left"
                  onClick={() => navigate(`/app/${encodeURIComponent(item.doctype)}`)}
                  data-testid={`warehouse-cash-${item.doctype.toLowerCase().replaceAll(" ", "-")}`}
                >
                  <Icon className="size-5 text-primary" />
                  <span className="mt-3 font-medium">{item.label}</span>
                  <span className="mt-1 text-sm font-normal text-muted-foreground">{item.description}</span>
                </Button>;
              })}
            </div>
            <div className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Thanh toán trực tiếp công nợ Purchase/Sales Invoice vẫn đi qua Payment Entry. Gắn nhà cung cấp/khách hàng trên phiếu quỹ chỉ là dimension kế toán, không tự tất toán công nợ.
            </div>
          </div>
        </TabsContent>}

        <TabsContent value="capacity" className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border bg-card p-4"><div><Label htmlFor="demands">Nhu cầu (m²/bộ/công đoạn/mẻ)</Label><Textarea id="demands" className="min-h-44 font-mono text-xs" value={demands} onChange={(event) => setDemands(event.target.value)} /></div><div><Label htmlFor="resource">Tổ/ca/trạm/tăng ca</Label><Textarea id="resource" className="min-h-28 font-mono text-xs" value={resource} onChange={(event) => setResource(event.target.value)} /></div><Button onClick={calculateCapacity} disabled={Boolean(busy)}>Tính tải và cảnh báo trễ</Button></div>
          <div className="rounded-xl border bg-card p-4"><h2 className="font-medium">Kết quả kế hoạch</h2>{capacity ? <dl className="mt-4 grid grid-cols-2 gap-3">{Object.entries(capacity).map(([key, value]) => <div key={key} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 text-lg font-semibold">{String(value)}</dd></div>)}</dl> : <p className="mt-3 text-sm text-muted-foreground">Tính tải để thấy công suất ca 8 giờ, tăng ca, phần quá tải và số ngày cần.</p>}</div>
        </TabsContent>

        <TabsContent value="warranty" className="rounded-xl border bg-card p-6"><h2 className="font-medium">Hồ sơ bảo hành và hàng lỗi</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Mở danh sách “Bảo hành” ở menu để tiếp nhận hồ sơ. Hệ thống bắt buộc truy về đơn bán, phiếu giao, ngày giao và mặt hàng; bốn nguyên nhân chuẩn quyết định nhánh xử lý. Bù trừ nhà cung cấp chỉ hoàn tất sau xác nhận Kế toán tổng hợp/Kế toán trưởng.</p></TabsContent>
      </Tabs>
    </div>
  );
}