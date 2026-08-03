import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, CheckCircle2, ClipboardList, Landmark, RefreshCw, Send, WalletCards } from "lucide-react";
import { FrappeAdapterImpl, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import type { Doc, Filters, LinkResult } from "@metaforge/core";
import { BigButton, TouchCard } from "@metaforge/shell";
import {
  Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, toast,
} from "@metaforge/ui";

const OWNER_ROLES = new Set(["Chủ xưởng", "System Manager", "Administrator"]);
const CASH_ROLES = new Set([
  "Warehouse Cash User", "Warehouse Cash Manager", "Thủ kho", "Chủ xưởng", "Kế toán",
  "General Accountant", "Chief Accountant", "Kế toán tổng hợp", "Kế toán trưởng", "Accounts Manager", "System Manager", "Administrator",
]);
const CASH_APPROVER_ROLES = new Set([
  "Warehouse Cash Manager", "Chủ xưởng", "Chief Accountant", "Kế toán trưởng", "Accounts Manager", "System Manager", "Administrator",
]);

type FundingMethod = "Tiền mặt" | "Tài khoản ngân hàng";

interface EmployeeRow extends Doc {
  name: string;
  employee_name?: string;
  user_id?: string;
  employee_status?: string;
  company?: string;
}

interface ProposalRow extends Doc {
  name: string;
  transaction_date?: string;
  requested_by?: string;
  note?: string;
  docstatus?: 0 | 1 | 2;
  status?: string;
  purchase_funding_employee?: string;
  purchase_funding_amount?: string | number;
  purchase_funding_method?: FundingMethod;
  purchase_funding_bank_name?: string;
  purchase_funding_bank_last4?: string;
}

function today() {
  const date = new Date();
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(value: unknown) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function isFundingProposal(row: ProposalRow) {
  return Boolean(row.purchase_funding_employee && row.purchase_funding_method && Number(row.purchase_funding_amount) > 0);
}

export function PurchaseFundingScreen({ adapter, boot }: { adapter: FrappeAdapterImpl; boot: MetaForgeBootDTO }) {
  const canApprove = boot.roles.some((role) => OWNER_ROLES.has(role));
  const canUseCash = boot.roles.some((role) => CASH_ROLES.has(role));
  const canSubmitCash = boot.roles.some((role) => CASH_APPROVER_ROLES.has(role));
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [employeeLoaded, setEmployeeLoaded] = useState(false);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [paidCash, setPaidCash] = useState<Set<string>>(new Set());
  const [paidBank, setPaidBank] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedCash, setSelectedCash] = useState<ProposalRow | null>(null);
  const [selectedBank, setSelectedBank] = useState<ProposalRow | null>(null);

  useEffect(() => {
    void adapter.getList("Employee", {
      fields: ["name", "employee_name", "user_id", "employee_status", "company"],
      filters: [["user_id", "=", boot.user], ["employee_status", "=", "Đang làm việc"]] as Filters,
      pageLength: 1,
    }).then((result) => setEmployee((result[0] as EmployeeRow | undefined) ?? null))
      .catch(() => setEmployee(null))
      .finally(() => setEmployeeLoaded(true));
  }, [adapter, boot.user]);

  const load = useCallback(async () => {
    if (!canApprove && !employeeLoaded) return;
    if (!canApprove && !employee) { setRows([]); return; }
    setLoading(true);
    try {
      const filters: Filters = [["material_request_type", "=", "Purchase"]];
      if (!canApprove && employee) filters.push(["purchase_funding_employee", "=", employee.name]);
      const [requests, vouchers, payments] = await Promise.all([
        adapter.getList("Material Request", {
          fields: [
            "name", "transaction_date", "schedule_date", "requested_by", "note", "docstatus", "status", "modified",
            "purchase_funding_employee", "purchase_funding_amount", "purchase_funding_method",
            "purchase_funding_bank_name", "purchase_funding_bank_last4",
          ],
          filters,
          orderBy: "modified desc",
          pageLength: 80,
        }),
        canUseCash ? adapter.getList("Warehouse Cash Voucher", {
          fields: ["name", "source_doctype", "source_name", "voucher_type", "docstatus"],
          filters: [["source_doctype", "=", "Material Request"], ["docstatus", "=", 1]] as Filters,
          orderBy: "modified desc",
          pageLength: 200,
        }).catch(() => []) : Promise.resolve([]),
        canApprove ? adapter.getList("Payment Entry", {
          fields: ["name", "party_type", "party", "reference_no", "docstatus", "payment_type"],
          orderBy: "modified desc",
          pageLength: 200,
        }).catch(() => []) : Promise.resolve([]),
      ]);
      setRows((requests as ProposalRow[]).filter(isFundingProposal));
      setPaidCash(new Set(vouchers
        .filter((row) => row.voucher_type === "Tạm ứng")
        .map((row) => String(row.source_name ?? ""))
        .filter(Boolean)));
      setPaidBank(new Set(payments
        .filter((row) => row.party_type === "Employee" && row.payment_type === "Pay" && Number(row.docstatus ?? 0) === 1)
        .map((row) => String(row.reference_no ?? ""))
        .filter(Boolean)));
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setLoading(false);
    }
  }, [adapter, canApprove, canUseCash, employee, employeeLoaded]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (row: ProposalRow) => {
    setLoading(true);
    try {
      const { doc } = await adapter.getDoc("Material Request", row.name);
      await adapter.submit(doc);
      toast.success("Đã duyệt đề xuất mua hàng");
      await load();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setLoading(false);
    }
  };

  const paid = (row: ProposalRow) => row.purchase_funding_method === "Tiền mặt" ? paidCash.has(row.name) : paidBank.has(row.name);

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Đề xuất mua hàng</h2>
            <p className="mt-1 text-sm text-muted-foreground">Nhân viên gửi đề xuất. Chủ xưởng duyệt rồi mới xuất tiền mặt hoặc chuyển khoản.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} aria-label="Làm mới đề xuất"><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></Button>
        </div>
      </section>

      {!canApprove ? (
        employeeLoaded && !employee ? (
          <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Tài khoản đăng nhập chưa liên kết với hồ sơ Nhân viên đang làm việc.</div>
        ) : employee ? (
          <ProposalForm adapter={adapter} employee={employee} onCreated={load} />
        ) : null
      ) : employee ? <ProposalForm adapter={adapter} employee={employee} onCreated={load} /> : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold">{canApprove ? "Đề xuất cần xử lý" : "Đề xuất của tôi"}</h3>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        {rows.map((row) => {
          const approved = Number(row.docstatus ?? 0) === 1;
          const isPaid = paid(row);
          const method = row.purchase_funding_method!;
          const employeeName = row.purchase_funding_employee || row.requested_by || "Nhân viên";
          return (
            <TouchCard key={row.name}>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{String(row.note || "Đề xuất mua hàng")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{employeeName} · {row.name}</div>
                  </div>
                  <div className="text-right"><div className="font-semibold">{money(row.purchase_funding_amount)}</div><Badge className="mt-1" variant={isPaid ? "default" : "outline"}>{isPaid ? "Đã xuất tiền" : approved ? "Đã duyệt" : "Chờ duyệt"}</Badge></div>
                </div>
                <div className="rounded-xl bg-muted/60 p-3 text-xs">
                  <div className="flex items-center gap-2"><WalletCards className="size-4" /><b>Nhận tiền:</b> {method}</div>
                  {method === "Tài khoản ngân hàng" ? <div className="mt-1 pl-6 text-muted-foreground">{row.purchase_funding_bank_name || "Ngân hàng từ Nhân sự"}{row.purchase_funding_bank_last4 ? ` · •••• ${row.purchase_funding_bank_last4}` : ""}</div> : null}
                </div>
                {canApprove && !approved ? <BigButton onClick={() => void approve(row)} disabled={loading}><CheckCircle2 className="mr-2 size-4" /> Duyệt đề xuất</BigButton> : null}
                {canApprove && approved && !isPaid && method === "Tiền mặt" ? <BigButton onClick={() => setSelectedCash(row)}><Banknote className="mr-2 size-4" /> Xuất tiền mặt</BigButton> : null}
                {canApprove && approved && !isPaid && method === "Tài khoản ngân hàng" ? <BigButton onClick={() => setSelectedBank(row)}><Landmark className="mr-2 size-4" /> Ghi chuyển khoản</BigButton> : null}
              </div>
            </TouchCard>
          );
        })}
        {!loading && rows.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Chưa có đề xuất mua hàng.</div> : null}
      </section>

      {selectedCash ? <CashDisbursementForm adapter={adapter} request={selectedCash} canSubmit={canSubmitCash} onDone={() => { setSelectedCash(null); void load(); }} onCancel={() => setSelectedCash(null)} /> : null}
      {selectedBank ? <BankDisbursementForm adapter={adapter} request={selectedBank} onDone={() => { setSelectedBank(null); void load(); }} onCancel={() => setSelectedBank(null)} /> : null}
      {canUseCash ? <InternalCashQuickForm adapter={adapter} canSubmit={canSubmitCash} /> : null}
    </div>
  );
}

function ProposalForm({ adapter, employee, onCreated }: { adapter: FrappeAdapterImpl; employee: EmployeeRow; onCreated: () => Promise<void> }) {
  const [purpose, setPurpose] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [qty, setQty] = useState(1);
  const [uom, setUom] = useState("Cái");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FundingMethod>("Tiền mặt");
  const [neededOn, setNeededOn] = useState(today());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const numericAmount = Number(amount);
    if (!purpose.trim()) { toast.error("Nhập nội dung cần mua"); return; }
    if (!itemCode.trim()) { toast.error("Chọn mặt hàng"); return; }
    if (!(qty > 0)) { toast.error("Số lượng phải lớn hơn 0"); return; }
    if (!(numericAmount > 0)) { toast.error("Nhập số tiền đề xuất"); return; }
    setSaving(true);
    try {
      await adapter.createDoc("Material Request", {
        doctype: "Material Request",
        material_request_type: "Purchase",
        company: String(employee.company || "ALUMDOOR"),
        transaction_date: today(),
        schedule_date: neededOn,
        requested_by: employee.name,
        purchase_funding_employee: employee.name,
        purchase_funding_amount: numericAmount,
        purchase_funding_method: method,
        note: purpose.trim(),
        items: [{ doctype: "Material Request Item", row_id: "ROW-1", item_code: itemCode.trim(), qty, uom, schedule_date: neededOn, note: purpose.trim() }],
      });
      toast.success("Đã gửi đề xuất tới Chủ xưởng");
      setPurpose(""); setItemCode(""); setQty(1); setAmount(""); setMethod("Tiền mặt");
      await onCreated();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm"><ClipboardList className="size-4 text-primary" /><b>Đề xuất mới</b><span className="ml-auto text-xs text-muted-foreground">{String(employee.employee_name ?? employee.name)}</span></div>
      <div className="space-y-1.5"><Label>Nội dung cần mua</Label><Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Ví dụ: mua 2 bộ remote cho công trình…" /></div>
      <LinkField adapter={adapter} label="Mặt hàng" doctype="Item" value={itemCode} onChange={setItemCode} placeholder="Tìm mã hàng" icon={<ClipboardList className="size-4" />} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Số lượng</Label><Input type="number" min="0" step="0.01" value={qty} onChange={(event) => setQty(Number(event.target.value))} className="h-11" /></div>
        <div className="space-y-1.5"><Label>Đơn vị</Label><Select value={uom} onValueChange={setUom}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cái">Cái</SelectItem><SelectItem value="Mét">Mét</SelectItem><SelectItem value="Kg">Kg</SelectItem><SelectItem value="Bộ">Bộ</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Số tiền đề xuất</Label><Input type="number" min="0" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="h-11" /></div>
        <div className="space-y-1.5"><Label>Cần trước ngày</Label><Input type="date" value={neededOn} onChange={(event) => setNeededOn(event.target.value)} className="h-11" /></div>
      </div>
      <div className="space-y-1.5"><Label>Nhận tiền bằng</Label><Select value={method} onValueChange={(value) => setMethod(value as FundingMethod)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Tiền mặt">Tiền mặt</SelectItem><SelectItem value="Tài khoản ngân hàng">Tài khoản ngân hàng</SelectItem></SelectContent></Select></div>
      {method === "Tài khoản ngân hàng" ? <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">Ngân hàng và số tài khoản được kiểm tra trực tiếp từ hồ sơ Nhân sự khi gửi. Số tài khoản đầy đủ không hiển thị trên máy nhân viên.</div> : null}
      <BigButton onClick={() => void submit()} disabled={saving}><Send className="mr-2 size-4" />{saving ? "Đang gửi…" : "Gửi Chủ xưởng duyệt"}</BigButton>
    </section>
  );
}

function CashDisbursementForm({ adapter, request, canSubmit, onDone, onCancel }: {
  adapter: FrappeAdapterImpl; request: ProposalRow; canSubmit: boolean; onDone: () => void; onCancel: () => void;
}) {
  const [fund, setFund] = useState("");
  const [advanceAccount, setAdvanceAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const pay = async () => {
    if (!fund.trim()) { toast.error("Chọn quỹ tiền mặt"); return; }
    if (!advanceAccount.trim()) { toast.error("Chọn tài khoản tạm ứng nhân viên"); return; }
    setSaving(true);
    try {
      const draft = await adapter.createDoc("Warehouse Cash Voucher", {
        doctype: "Warehouse Cash Voucher",
        fund: fund.trim(), posting_date: today(), voucher_type: "Tạm ứng", amount: Number(request.purchase_funding_amount),
        purpose: `Đề xuất ${request.name} · ${String(request.note || "Mua hàng")}`,
        counter_account: advanceAccount.trim(), counterparty_type: "Nhân viên", employee: request.purchase_funding_employee,
        source_doctype: "Material Request", source_name: request.name,
      });
      if (canSubmit) await adapter.submit(draft);
      toast.success(canSubmit ? "Đã xuất tiền mặt" : "Đã lập phiếu chi, chờ người có quyền duyệt");
      onDone();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally { setSaving(false); }
  };
  return (
    <section className="space-y-4 rounded-2xl border-2 border-primary/20 bg-card p-4">
      <div><h3 className="font-semibold">Xuất tiền mặt</h3><p className="mt-1 text-sm text-muted-foreground">{money(request.purchase_funding_amount)} · {String(request.note || "Mua hàng")}</p></div>
      <LinkField adapter={adapter} label="Quỹ tiền mặt" doctype="Warehouse Cash Fund" value={fund} onChange={setFund} placeholder="Chọn quỹ" icon={<Landmark className="size-4" />} />
      <LinkField adapter={adapter} label="Tài khoản tạm ứng" doctype="Account" value={advanceAccount} onChange={setAdvanceAccount} placeholder="Tìm tài khoản tạm ứng nhân viên" icon={<WalletCards className="size-4" />} />
      <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onCancel}>Đóng</Button><Button className="flex-1" onClick={() => void pay()} disabled={saving}>{saving ? "Đang ghi…" : canSubmit ? "Xuất tiền" : "Lập phiếu"}</Button></div>
    </section>
  );
}

function BankDisbursementForm({ adapter, request, onDone, onCancel }: {
  adapter: FrappeAdapterImpl; request: ProposalRow; onDone: () => void; onCancel: () => void;
}) {
  const [bankAccount, setBankAccount] = useState("Tiền gửi ngân hàng");
  const [advanceAccount, setAdvanceAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const pay = async () => {
    if (!bankAccount.trim()) { toast.error("Chọn tài khoản ngân hàng chi"); return; }
    if (!advanceAccount.trim()) { toast.error("Chọn tài khoản tạm ứng nhân viên"); return; }
    setSaving(true);
    try {
      const draft = await adapter.createDoc("Payment Entry", {
        doctype: "Payment Entry",
        payment_type: "Pay",
        party_type: "Employee",
        party: request.purchase_funding_employee,
        company: "ALUMDOOR",
        currency: "VND",
        posting_at: new Date().toISOString(),
        paid_amount: Number(request.purchase_funding_amount),
        received_amount: Number(request.purchase_funding_amount),
        mode_of_payment: "Chuyển khoản",
        paid_from: bankAccount.trim(),
        paid_to: advanceAccount.trim(),
        reference_no: request.name,
        note: `Tạm ứng mua hàng theo ${request.name}: ${String(request.note || "Mua hàng")}`,
      });
      await adapter.submit(draft);
      toast.success("Đã ghi chuyển khoản cho nhân viên");
      onDone();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally { setSaving(false); }
  };
  return (
    <section className="space-y-4 rounded-2xl border-2 border-primary/20 bg-card p-4">
      <div><h3 className="font-semibold">Chuyển khoản cho nhân viên</h3><p className="mt-1 text-sm text-muted-foreground">{money(request.purchase_funding_amount)} · {request.purchase_funding_bank_name || "Ngân hàng trong Nhân sự"}{request.purchase_funding_bank_last4 ? ` · •••• ${request.purchase_funding_bank_last4}` : ""}</p></div>
      <LinkField adapter={adapter} label="Tài khoản ngân hàng chi" doctype="Account" value={bankAccount} onChange={setBankAccount} placeholder="Chọn tài khoản ngân hàng" icon={<Landmark className="size-4" />} />
      <LinkField adapter={adapter} label="Tài khoản tạm ứng nhân viên" doctype="Account" value={advanceAccount} onChange={setAdvanceAccount} placeholder="Tìm tài khoản tạm ứng" icon={<WalletCards className="size-4" />} />
      <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Người nhận được lấy từ Employee của đề xuất. Backend kiểm tra lại ngân hàng và số tài khoản trong Nhân sự trước khi ghi sổ.</div>
      <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onCancel}>Đóng</Button><Button className="flex-1" onClick={() => void pay()} disabled={saving}>{saving ? "Đang ghi…" : "Ghi chuyển khoản"}</Button></div>
    </section>
  );
}

function InternalCashQuickForm({ adapter, canSubmit }: { adapter: FrappeAdapterImpl; canSubmit: boolean }) {
  const [type, setType] = useState<"Thu" | "Chi">("Chi");
  const [fund, setFund] = useState("");
  const [counterAccount, setCounterAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const numericAmount = Number(amount);
    if (!fund.trim() || !counterAccount.trim() || !purpose.trim() || !(numericAmount > 0)) { toast.error("Nhập đủ quỹ, tài khoản, số tiền và nội dung"); return; }
    setSaving(true);
    try {
      const draft = await adapter.createDoc("Warehouse Cash Voucher", {
        doctype: "Warehouse Cash Voucher", fund: fund.trim(), posting_date: today(), voucher_type: type,
        amount: numericAmount, purpose: purpose.trim(), counter_account: counterAccount.trim(), counterparty_type: "Khác", counterparty_name: "Nội bộ",
      });
      if (canSubmit) await adapter.submit(draft);
      toast.success(canSubmit ? `Đã ghi ${type.toLowerCase()} nội bộ` : `Đã lập phiếu ${type.toLowerCase()}, chờ duyệt`);
      setAmount(""); setPurpose("");
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2"><Banknote className="size-4 text-primary" /><h3 className="font-semibold">Thu / chi nội bộ</h3></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Loại</Label><Select value={type} onValueChange={(value) => setType(value as "Thu" | "Chi")}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Thu">Thu</SelectItem><SelectItem value="Chi">Chi</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Số tiền</Label><Input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11" /></div></div>
      <LinkField adapter={adapter} label="Quỹ" doctype="Warehouse Cash Fund" value={fund} onChange={setFund} placeholder="Chọn quỹ tiền mặt" icon={<Landmark className="size-4" />} />
      <LinkField adapter={adapter} label="Tài khoản đối ứng" doctype="Account" value={counterAccount} onChange={setCounterAccount} placeholder="Tìm tài khoản" icon={<WalletCards className="size-4" />} />
      <div className="space-y-1.5"><Label>Nội dung</Label><Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Ví dụ: mua nước, gửi xe, hoàn tiền…" className="h-11" /></div>
      <BigButton onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu…" : canSubmit ? `Ghi ${type.toLowerCase()}` : "Gửi chờ duyệt"}</BigButton>
    </section>
  );
}

function LinkField({ adapter, label, doctype, value, onChange, placeholder, icon }: {
  adapter: FrappeAdapterImpl; label: string; doctype: string; value: string; onChange: (value: string) => void; placeholder: string; icon: ReactNode;
}) {
  const [options, setOptions] = useState<LinkResult[]>([]);
  const [open, setOpen] = useState(false);
  const stableValue = useMemo(() => value.trim(), [value]);
  useEffect(() => {
    if (stableValue.length < 2) { setOptions([]); return; }
    const timer = window.setTimeout(() => {
      void adapter.searchLink(doctype, stableValue, { pageLength: 8 }).then((items) => { setOptions(items); setOpen(true); }).catch(() => setOptions([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [adapter, doctype, stableValue]);
  return (
    <div className="relative space-y-1.5"><Label>{label}</Label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span><Input value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(Boolean(options.length))} onBlur={() => window.setTimeout(() => setOpen(false), 120)} placeholder={placeholder} className="h-11 pl-10" /></div>{open && options.length ? <div className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-xl">{options.map((option) => <Button key={option.value} type="button" variant="ghost" className="h-auto w-full justify-start px-3 py-2 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.value); setOpen(false); }}><span className="min-w-0"><span className="block truncate text-sm font-medium">{option.label || option.description || option.value}</span>{(option.label || option.description) && (option.label || option.description) !== option.value ? <span className="block truncate text-xs text-muted-foreground">{option.value}</span> : null}</span></Button>)}</div> : null}</div>
  );
}
