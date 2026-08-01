import { StrictMode, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Home,
  ListChecks,
  LogOut,
  PackageSearch,
  RefreshCw,
  Repeat2,
  ScanLine,
  Search,
  Settings,
  Smartphone,
  UserRound,
  Warehouse,
  WifiOff,
} from "lucide-react";
import { FrappeAdapterImpl, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import type { Doc, Filters, LinkResult } from "@metaforge/core";
import {
  AuthBoundary,
  BigButton,
  ChangePasswordDialog,
  ForgeBrandLogo,
  I18nProvider,
  LoginForm,
  MobileShell,
  QtyStepper,
  ScanField,
  TouchCard,
  useOfflineQueue,
} from "@metaforge/shell";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Toaster,
  toast,
} from "@metaforge/ui";
import "./styles.css";

const adapter = new FrappeAdapterImpl({});

type MobileTab = "home" | "actions" | "stock" | "account";
type Operation = "receipt" | "issue" | "transfer" | "count";

interface StockPayload {
  operation: Operation;
  itemCode: string;
  qty: number;
  uom: string;
  warehouse: string;
  targetWarehouse?: string;
  postingDate: string;
  note?: string;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const OPERATION_META: Record<Operation, { label: string; description: string; icon: ReactNode }> = {
  receipt: {
    label: "Nhập kho",
    description: "Nhận vật tư, phụ kiện hoặc hàng hoàn trả vào kho.",
    icon: <ArrowDownToLine />,
  },
  issue: {
    label: "Xuất kho",
    description: "Xuất vật tư cho sản xuất, giao hàng hoặc sử dụng nội bộ.",
    icon: <ArrowUpFromLine />,
  },
  transfer: {
    label: "Chuyển kho",
    description: "Chuyển vật tư giữa hai kho trong cùng hệ thống.",
    icon: <Repeat2 />,
  },
  count: {
    label: "Kiểm kho",
    description: "Ghi nhận số lượng thực tế để lập phiếu đối chiếu.",
    icon: <ClipboardCheck />,
  },
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function saveStockPayload(payload: StockPayload) {
  if (payload.operation === "count") {
    await adapter.createDoc("Stock Reconciliation", {
      doctype: "Stock Reconciliation",
      posting_date: payload.postingDate,
      purpose: "Stock Reconciliation",
      remarks: payload.note,
      items: [{
        doctype: "Stock Reconciliation Item",
        item_code: payload.itemCode,
        warehouse: payload.warehouse,
        qty: payload.qty,
      }],
    });
    return;
  }

  const purpose = payload.operation === "receipt"
    ? "Material Receipt"
    : payload.operation === "issue"
      ? "Material Issue"
      : "Material Transfer";
  const item: Record<string, unknown> = {
    doctype: "Stock Entry Detail",
    item_code: payload.itemCode,
    qty: payload.qty,
    uom: payload.uom,
  };
  if (payload.operation !== "receipt") item.s_warehouse = payload.warehouse;
  if (payload.operation === "receipt") item.t_warehouse = payload.warehouse;
  if (payload.operation === "transfer") item.t_warehouse = payload.targetWarehouse;

  await adapter.createDoc("Stock Entry", {
    doctype: "Stock Entry",
    stock_entry_type: purpose,
    purpose,
    posting_date: payload.postingDate,
    remarks: payload.note,
    items: [item],
  });
}

function WarehouseMobileApp({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedAction = params.get("action") as Operation | null;
  const requestedTab = params.get("tab") as MobileTab | null;
  const [tab, setTab] = useState<MobileTab>(requestedTab && ["home", "actions", "stock", "account"].includes(requestedTab) ? requestedTab : "home");
  const [operation, setOperation] = useState<Operation | null>(requestedAction && requestedAction in OPERATION_META ? requestedAction : null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const queue = useOfflineQueue<StockPayload>(`${boot.site_name}:${boot.user}:warehouse`, saveStockPayload);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onInstallPrompt);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const openOperation = (next: Operation) => {
    setOperation(next);
    setTab("actions");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "actions");
    url.searchParams.set("action", next);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeOperation = () => {
    setOperation(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("action");
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url);
  };

  const changeTab = (next: MobileTab) => {
    setOperation(null);
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("action");
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageTitle = operation ? OPERATION_META[operation].label : tab === "stock" ? "Tra tồn kho" : tab === "account" ? "Tài khoản" : "Alumdoor Kho";
  const pageSubtitle = operation ? "Tạo phiếu nghiệp vụ" : "Ứng dụng kho trên điện thoại";

  return (
    <>
      <MobileShell
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={operation ? closeOperation : undefined}
        right={(
          <Button variant="ghost" size="icon" className="relative size-10 rounded-full" onClick={() => changeTab("account")} aria-label="Tài khoản">
            <Avatar className="size-8"><AvatarFallback>{initials(boot.full_name)}</AvatarFallback></Avatar>
            {queue.pending.length ? <span className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-card bg-amber-500" /> : null}
          </Button>
        )}
        bottomBar={operation ? undefined : <BottomNavigation active={tab} pending={queue.pending.length} onChange={changeTab} />}
      >
        {operation ? (
          <StockOperationForm
            operation={operation}
            pending={queue.pending.length}
            onSubmit={async (payload) => {
              const result = await queue.enqueue(payload);
              navigator.vibrate?.(35);
              toast.success(result === "sent" ? "Đã tạo phiếu kho" : "Đã lưu ngoại tuyến, sẽ gửi khi có mạng");
              changeTab("home");
            }}
          />
        ) : tab === "home" ? (
          <HomeScreen fullName={boot.full_name} pending={queue.pending.length} onOpen={openOperation} onAll={() => changeTab("actions")} onStock={() => changeTab("stock")} />
        ) : tab === "actions" ? (
          <OperationScreen onOpen={openOperation} />
        ) : tab === "stock" ? (
          <StockLookup />
        ) : (
          <AccountScreen
            boot={boot}
            pending={queue.pending.length}
            installAvailable={Boolean(installPrompt)}
            onInstall={install}
            onFlush={() => void queue.flush()}
            onChangePassword={() => setPasswordOpen(true)}
            onLogout={() => void logout()}
          />
        )}
      </MobileShell>
      <ChangePasswordDialog adapter={adapter} open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}

function HomeScreen({ fullName, pending, onOpen, onAll, onStock }: {
  fullName: string;
  pending: number;
  onOpen: (operation: Operation) => void;
  onAll: () => void;
  onStock: () => void;
}) {
  const firstName = fullName.trim().split(/\s+/).at(-1) ?? fullName;
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#2e2e2e] via-[#3b302c] to-[#f45b24] p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/80">Xin chào {firstName}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Hôm nay cần làm gì ở kho?</h1>
          </div>
          <ForgeBrandLogo size={44} className="rounded-md bg-white p-1" />
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white/12 px-3 py-2 text-xs backdrop-blur">
          {pending ? <WifiOff className="size-4" /> : <CheckCircle2 className="size-4" />}
          <span>{pending ? `${pending} thao tác đang chờ gửi` : "Mọi thao tác đã đồng bộ"}</span>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Nghiệp vụ nhanh</h2>
          <Button variant="ghost" size="sm" onClick={onAll}>Xem tất cả</Button>
        </div>
        <div className="forge-operation-grid grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(OPERATION_META) as Operation[]).map((key) => (
            <OperationButton key={key} operation={key} onClick={() => onOpen(key)} />
          ))}
        </div>
      </section>

      <TouchCard onClick={onStock}>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><PackageSearch className="size-5" /></span>
          <span>
            <span className="block text-sm font-semibold">Tra tồn nhanh</span>
            <span className="mt-1 block text-xs text-muted-foreground">Tìm vật tư và số lượng thực tế theo kho.</span>
          </span>
        </div>
      </TouchCard>
    </div>
  );
}

function OperationScreen({ onOpen }: { onOpen: (operation: Operation) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Chọn nghiệp vụ</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mỗi màn chỉ giữ các trường cần thiết để thao tác bằng một tay.</p>
      </div>
      {(Object.keys(OPERATION_META) as Operation[]).map((key) => (
        <TouchCard key={key} onClick={() => onOpen(key)}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{OPERATION_META[key].icon}</span>
            <span>
              <span className="block text-sm font-semibold">{OPERATION_META[key].label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{OPERATION_META[key].description}</span>
            </span>
          </div>
        </TouchCard>
      ))}
    </div>
  );
}

function OperationButton({ operation, onClick }: { operation: Operation; onClick: () => void }) {
  const meta = OPERATION_META[operation];
  return (
    <Button variant="outline" className="h-auto min-w-0 flex-col items-start gap-3 whitespace-normal rounded-2xl bg-card p-4 text-left" onClick={onClick}>
      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{meta.icon}</span>
      <span className="min-w-0 w-full">
        <span className="block text-sm font-semibold">{meta.label}</span>
        <span className="mt-1 line-clamp-2 block text-xs font-normal leading-4 text-muted-foreground">{meta.description}</span>
      </span>
    </Button>
  );
}

function StockOperationForm({ operation, pending, onSubmit }: {
  operation: Operation;
  pending: number;
  onSubmit: (payload: StockPayload) => Promise<void>;
}) {
  const [itemCode, setItemCode] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [targetWarehouse, setTargetWarehouse] = useState("");
  const [qty, setQty] = useState(1);
  const [uom, setUom] = useState("Nos");
  const [postingDate, setPostingDate] = useState(today());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!itemCode.trim()) { toast.error("Chọn vật tư"); return; }
    if (!warehouse.trim()) { toast.error(operation === "receipt" ? "Chọn kho nhận" : "Chọn kho nguồn"); return; }
    if (operation === "transfer" && !targetWarehouse.trim()) { toast.error("Chọn kho đích"); return; }
    if (operation === "transfer" && targetWarehouse.trim() === warehouse.trim()) { toast.error("Kho nguồn và kho đích phải khác nhau"); return; }
    if (qty <= 0) { toast.error("Số lượng phải lớn hơn 0"); return; }
    setSaving(true);
    try {
      await onSubmit({
        operation,
        itemCode: itemCode.trim(),
        qty,
        uom,
        warehouse: warehouse.trim(),
        targetWarehouse: targetWarehouse.trim() || undefined,
        postingDate,
        note: note.trim() || undefined,
      });
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {pending ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <WifiOff className="size-4" /> {pending} thao tác trước đang chờ mạng.
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <LinkInput label="Vật tư" doctype="Item" value={itemCode} onChange={setItemCode} icon={<ScanLine className="size-4" />} placeholder="Quét hoặc nhập mã vật tư" />
        <LinkInput
          label={operation === "receipt" ? "Kho nhận" : operation === "count" ? "Kho kiểm" : "Kho nguồn"}
          doctype="Warehouse"
          value={warehouse}
          onChange={setWarehouse}
          icon={<Warehouse className="size-4" />}
          placeholder="Tìm kho"
        />
        {operation === "transfer" ? (
          <LinkInput label="Kho đích" doctype="Warehouse" value={targetWarehouse} onChange={setTargetWarehouse} icon={<Warehouse className="size-4" />} placeholder="Tìm kho đích" />
        ) : null}

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="space-y-1.5">
            <Label>Số lượng</Label>
            <QtyStepper value={qty} onChange={setQty} min={0} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="warehouse-uom">Đơn vị</Label>
            <Select value={uom} onValueChange={setUom}>
              <SelectTrigger id="warehouse-uom" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Nos">Cái</SelectItem>
                <SelectItem value="M">Mét</SelectItem>
                <SelectItem value="Kg">Kg</SelectItem>
                <SelectItem value="Set">Bộ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="warehouse-date">Ngày ghi nhận</Label>
          <Input id="warehouse-date" type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="warehouse-note">Ghi chú</Label>
          <Input id="warehouse-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Số xe, người giao, công trình…" className="h-11" />
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          <BigButton onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu…" : `Lưu ${OPERATION_META[operation].label.toLowerCase()}`}
          </BigButton>
        </div>
      </div>
    </div>
  );
}

function LinkInput({ label, doctype, value, onChange, icon, placeholder }: {
  label: string;
  doctype: string;
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  placeholder: string;
}) {
  const [options, setOptions] = useState<LinkResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value.trim().length < 2) { setOptions([]); return; }
    const timer = window.setTimeout(() => {
      void adapter.searchLink(doctype, value.trim(), { pageLength: 8 })
        .then((rows) => { setOptions(rows); setOpen(true); })
        .catch(() => setOptions([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [doctype, value]);

  return (
    <div className="relative space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <Input
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(Boolean(options.length))}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          className="h-12 pl-10 text-base"
        />
      </div>
      {open && options.length ? (
        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-xl">
          {options.map((option) => (
            <Button key={option.value} type="button" variant="ghost" className="h-auto w-full justify-start px-3 py-2 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.value); setOpen(false); }}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{option.label || option.description || option.value}</span>
                {(option.label || option.description) && (option.label || option.description) !== option.value ? <span className="block truncate text-xs text-muted-foreground">{option.value}</span> : null}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StockLookup() {
  const [query, setQuery] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    const filters: Filters = [];
    if (query.trim()) filters.push(["item_code", "like", `%${query.trim()}%`]);
    if (warehouse.trim()) filters.push(["warehouse", "=", warehouse.trim()]);
    try {
      const result = await adapter.getList("Bin", {
        fields: ["name", "item_code", "warehouse", "actual_qty", "reserved_qty", "projected_qty"],
        filters,
        orderBy: "modified desc",
        pageLength: 30,
      });
      setRows(result);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <ScanField value={query} onChange={setQuery} placeholder="Quét hoặc nhập mã vật tư" onEnter={() => void search()} />
        <LinkInput label="Kho" doctype="Warehouse" value={warehouse} onChange={setWarehouse} icon={<Warehouse className="size-4" />} placeholder="Chọn kho (không bắt buộc)" />
        <BigButton onClick={() => void search()} disabled={loading}>{loading ? "Đang tra…" : <><Search className="mr-2 size-4" /> Tra tồn</>}</BigButton>
      </section>

      <div className="space-y-2">
        {rows.map((row) => (
          <TouchCard key={String(row.name)}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Boxes className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{String(row.item_code ?? row.name)}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{String(row.warehouse ?? "Chưa có kho")}</span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">Thực tế: {Number(row.actual_qty ?? 0).toLocaleString("vi-VN")}</Badge>
                  <Badge variant="outline">Khả dụng: {Number(row.projected_qty ?? 0).toLocaleString("vi-VN")}</Badge>
                </span>
              </span>
            </div>
          </TouchCard>
        ))}
        {!loading && !rows.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Quét mã hoặc nhập từ khoá để tra tồn.</div> : null}
      </div>
    </div>
  );
}

function AccountScreen({ boot, pending, installAvailable, onInstall, onFlush, onChangePassword, onLogout }: {
  boot: MetaForgeBootDTO;
  pending: number;
  installAvailable: boolean;
  onInstall: () => void;
  onFlush: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border bg-card p-5 text-center shadow-sm">
        <Avatar className="mx-auto size-20"><AvatarFallback className="text-xl">{initials(boot.full_name)}</AvatarFallback></Avatar>
        <h2 className="mt-3 text-lg font-semibold">{boot.full_name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{boot.user}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {boot.roles.slice(0, 4).map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        {installAvailable ? <AccountRow icon={<Smartphone />} label="Cài Alumdoor Kho lên điện thoại" onClick={onInstall} /> : null}
        <AccountRow icon={<Settings />} label="Đổi mật khẩu" onClick={onChangePassword} />
        <AccountRow icon={pending ? <WifiOff /> : <RefreshCw />} label={pending ? `Gửi lại ${pending} thao tác` : "Dữ liệu đã đồng bộ"} onClick={pending ? onFlush : undefined} />
        <Separator />
        <AccountRow icon={<LogOut />} label="Đăng xuất" destructive onClick={onLogout} />
      </section>

      <p className="px-2 text-center text-xs leading-5 text-muted-foreground">Alumdoor Kho tập trung nghiệp vụ hiện trường trên điện thoại. Báo cáo và cấu hình đầy đủ tiếp tục dùng bản desktop.</p>
    </div>
  );
}

function AccountRow({ icon, label, onClick, destructive }: { icon: ReactNode; label: string; onClick?: () => void; destructive?: boolean }) {
  return (
    <Button variant="ghost" className={`h-14 w-full justify-start gap-3 rounded-none px-4 ${destructive ? "text-destructive hover:text-destructive" : ""}`} onClick={onClick} disabled={!onClick}>
      <span className="[&_svg]:size-5">{icon}</span>
      <span>{label}</span>
    </Button>
  );
}

function BottomNavigation({ active, pending, onChange }: { active: MobileTab; pending: number; onChange: (tab: MobileTab) => void }) {
  const items: Array<{ key: MobileTab; label: string; icon: ReactNode }> = [
    { key: "home", label: "Trang chủ", icon: <Home /> },
    { key: "actions", label: "Nghiệp vụ", icon: <ListChecks /> },
    { key: "stock", label: "Tra tồn", icon: <PackageSearch /> },
    { key: "account", label: "Tôi", icon: <UserRound /> },
  ];
  return (
    <nav className="forge-mobile-bottom grid grid-cols-4 gap-1" aria-label="Điều hướng app kho">
      {items.map((item) => (
        <Button key={item.key} variant="ghost" className={`relative h-14 flex-col gap-1 rounded-xl px-1 text-[10px] ${active === item.key ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} onClick={() => onChange(item.key)}>
          <span className="[&_svg]:size-5">{item.icon}</span>
          <span>{item.label}</span>
          {item.key === "account" && pending ? <span className="absolute right-3 top-1 size-2 rounded-full bg-amber-500" /> : null}
        </Button>
      ))}
    </nav>
  );
}

function GuestLogin({ retry }: { retry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4">
        <LoginForm adapter={adapter} onSuccess={retry} brand="Alumdoor Kho" title="Đăng nhập app kho Alumdoor" subtitle="Dùng tài khoản nội bộ đã được Alumdoor cấp quyền." embedded />
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}warehouse-sw.js`, { scope: import.meta.env.BASE_URL });
    };
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return (
    <I18nProvider>
      <AuthBoundary
        adapter={adapter}
        renderLoading={() => <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground"><Clock3 className="mb-2 size-6 animate-pulse" />Đang kết nối…</div>}
        renderError={(message) => <div className="grid min-h-dvh place-items-center p-6 text-center text-destructive">Không kết nối được: {message}</div>}
        renderGuest={(retry) => <GuestLogin retry={retry} />}
      >
        {(boot, auth) => <WarehouseMobileApp boot={boot} logout={auth.logout} />}
      </AuthBoundary>
      <Toaster />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
