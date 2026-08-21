/** @jsxImportSource react */
/**
 * BÁO CÁO CÔNG NỢ — một màn, hai mặt: PHẢI THU (khách hàng) và PHẢI TRẢ (nhà cung cấp).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * VÌ SAO MÀN NÀY TỒN TẠI
 *
 * `docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` §0 định nghĩa hạng P1:
 * "không sai tiền, nhưng người bán KHÔNG GIẢI TRÌNH ĐƯỢC con số, hoặc phải mở màn
 * khác mới biết". Công nợ là chỗ P1 đau nhất: ai cũng thấy một số dư, không ai chỉ
 * được nó đến từ những chứng từ nào.
 *
 * Nên nguyên tắc trình bày của màn là: MỖI SỐ DƯ ĐỀU BẤM ĐƯỢC XUỐNG CHỨNG TỪ GỐC.
 * Bảng đối tác chỉ là cửa vào; phần thân là danh sách hoá đơn, phiếu thu/chi, giảm
 * trừ và phiếu giao/nhập — mỗi dòng nhảy thẳng sang chính chứng từ đó.
 *
 * THẨM QUYỀN
 *
 * Client chỉ điều phối và trình bày (`skills/forge-ui-change-routing/SKILL.md` §4.8).
 * Không một con số công nợ nào được sinh ra trong file này. Chỗ duy nhất có phép
 * cộng là hàng "Tổng (đang hiện)" — `displaySubtotal()` trong `model.ts` — và mọi
 * nơi in nó ra đều mang chữ "đang hiện".
 * ────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  Download,
  Info,
  Loader2,
  RefreshCw,
  Scale,
  Wallet,
} from "lucide-react";
import { mapError } from "@metaforge/core";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorDebtField } from "./AlumdoorDebtField.js";
import {
  groupLedgerByParty,
  loadAging,
  loadCreditNotes,
  loadInvoices,
  loadLedgerRows,
  loadMovements,
  loadPayments,
  loadReceivableParties,
  loadSupplierDashboard,
  mergeLedgerIntoParties,
  runSupplierSettlement,
  type DebtServer,
  type SupplierDashboard,
} from "./data.js";
import {
  AGING_BUCKETS,
  amount,
  applyOpenOnly,
  countOrDash,
  dateOnly,
  displaySubtotal,
  documentPath,
  downloadCsv,
  moneyOrDash,
  partySourcesDisagree,
  sideConfig,
  startOfYearIso,
  text,
  toCsv,
  todayIso,
  type AgingState,
  type DebtFilterState,
  type DebtSide,
  type DebtSideConfig,
  type LedgerRow,
  type PartyRow,
  type SourceDocumentGroup,
  type SourceDocumentRow,
} from "./model.js";

interface SideState {
  loading: boolean;
  /** Lỗi chặn cả bảng — hiện nguyên văn. */
  error: string;
  /** Lỗi từng nguồn: nạp được nguồn nào thì vẫn hiện nguồn đó, nhưng nói ra nguồn nào hỏng. */
  sourceErrors: string[];
  parties: PartyRow[];
  aging: AgingState;
  loadedAt: string;
}

interface DetailState {
  party: string;
  loading: boolean;
  ledger: LedgerRow[];
  ledgerError: string;
  groups: SourceDocumentGroup[];
  dashboard: SupplierDashboard | null;
  dashboardError: string;
}

const EMPTY_SIDE: SideState = {
  loading: false,
  error: "",
  sourceErrors: [],
  parties: [],
  aging: { status: "idle" },
  loadedAt: "",
};

function errorText(caught: unknown): string {
  const mapped = mapError(caught).message;
  return mapped || (caught instanceof Error ? caught.message : String(caught));
}

export function AlumdoorDebtWorkbench(props: { onNavigate?: (path: string) => void }) {
  const { adapter, services } = useMetaForge();
  // Bề mặt server khai bằng cấu trúc — xem `data.ts::DebtServer` về lý do không
  // import kiểu `FrappeAdapter` vào gói vertical.
  const server = adapter as unknown as DebtServer;

  const [side, setSide] = useState<DebtSide>("receivable");
  const [filters, setFilters] = useState<DebtFilterState>(() => ({
    fromDate: startOfYearIso(),
    toDate: todayIso(),
    party: "",
    onlyOpen: true,
    minBalance: "0",
  }));
  const [sides, setSides] = useState<Record<DebtSide, SideState>>({
    receivable: EMPTY_SIDE,
    payable: EMPTY_SIDE,
  });
  const [details, setDetails] = useState<Record<DebtSide, DetailState | null>>({
    receivable: null,
    payable: null,
  });
  const [settlement, setSettlement] = useState<{ queueKey: string; material: string; operation: "Close" | "Reverse" } | null>(null);
  const [settlementReason, setSettlementReason] = useState("");
  const [settlementBusy, setSettlementBusy] = useState(false);

  const config = sideConfig(side);
  const current = sides[side];
  const detail = details[side];

  const navigate = useCallback((path: string) => {
    if (props.onNavigate) {
      props.onNavigate(path);
      return;
    }
    if (typeof window !== "undefined") window.location.assign(path);
  }, [props]);

  const patchSide = useCallback((target: DebtSide, patch: Partial<SideState>) => {
    setSides((previous) => ({ ...previous, [target]: { ...previous[target], ...patch } }));
  }, []);

  // ── Nạp bảng đối tác ──────────────────────────────────────────────────────
  const loadSide = useCallback(async (target: DebtSide, state: DebtFilterState) => {
    const targetConfig = sideConfig(target);
    patchSide(target, { loading: true, error: "", sourceErrors: [], aging: { status: "loading" } });
    const sourceErrors: string[] = [];
    try {
      const ledgerResult = await Promise.allSettled([
        loadLedgerRows(server, targetConfig, state.party),
      ]);
      const ledgerRows = ledgerResult[0].status === "fulfilled" ? ledgerResult[0].value : [];
      if (ledgerResult[0].status === "rejected") {
        sourceErrors.push(`Sổ Payment Ledger (${targetConfig.ledgerReport}): ${errorText(ledgerResult[0].reason)}`);
      }
      const ledgerParties = groupLedgerByParty(ledgerRows);

      let parties: PartyRow[];
      if (target === "receivable") {
        const grouped = await Promise.allSettled([
          loadReceivableParties(server, { party: state.party, fromDate: state.fromDate, toDate: state.toDate }),
        ]);
        if (grouped[0].status === "fulfilled") {
          parties = mergeLedgerIntoParties(grouped[0].value, ledgerParties);
        } else {
          sourceErrors.push(`Báo cáo "Công nợ theo khách hàng": ${errorText(grouped[0].reason)}`);
          parties = ledgerParties;
        }
      } else {
        // Brief chưa khai báo cáo gộp theo nhà cung cấp (xem Dependency Request),
        // nên bảng phải trả dựng từ chính sổ Payment Ledger.
        parties = ledgerParties;
      }

      if (!parties.length && ledgerResult[0].status === "rejected") {
        patchSide(target, {
          loading: false,
          error: sourceErrors.join(" · "),
          sourceErrors,
          parties: [],
          aging: { status: "idle" },
          loadedAt: new Date().toISOString(),
        });
        return;
      }

      patchSide(target, {
        loading: false,
        error: "",
        sourceErrors,
        parties,
        loadedAt: new Date().toISOString(),
      });

      // Tuổi nợ nạp SAU và tách bạch: nó có thể bị nền tảng từ chối mà bảng chính
      // vẫn đúng. Không được để một khối phụ kéo sập cả màn.
      try {
        const rows = await loadAging(server, targetConfig, {
          asOfDate: state.toDate || todayIso(),
          party: state.party,
        });
        patchSide(target, { aging: { status: "ready", rows } });
      } catch (caught) {
        patchSide(target, { aging: { status: "unavailable", message: errorText(caught) } });
      }
    } catch (caught) {
      const message = errorText(caught);
      patchSide(target, { loading: false, error: message, sourceErrors, aging: { status: "idle" } });
      toast.error(message);
    }
  }, [patchSide, server]);

  // Nạp lần đầu cho tab đang mở; đổi tab thì nạp tab mới nếu chưa có dữ liệu.
  const bootstrapped = useRef<Record<DebtSide, boolean>>({ receivable: false, payable: false });
  useEffect(() => {
    if (bootstrapped.current[side]) return;
    bootstrapped.current[side] = true;
    void loadSide(side, filters);
    // Chỉ chạy khi đổi tab: bộ lọc có nút "Áp dụng" riêng, không tự nạp lại theo
    // từng phím gõ (một lần gõ ngày = một lượt quét sổ).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  const applyFilters = useCallback(() => {
    setDetails((previous) => ({ ...previous, [side]: null }));
    void loadSide(side, filters);
  }, [filters, loadSide, side]);

  // ── Mở chi tiết một đối tác ───────────────────────────────────────────────
  const openParty = useCallback(async (party: string) => {
    if (!party) return;
    const targetConfig = config;
    const state = filters;
    setDetails((previous) => ({
      ...previous,
      [side]: { party, loading: true, ledger: [], ledgerError: "", groups: [], dashboard: null, dashboardError: "" },
    }));
    const input = { party, fromDate: state.fromDate, toDate: state.toDate };
    const [ledger, invoices, payments, credits, movements, dashboard] = await Promise.allSettled([
      loadLedgerRows(server, targetConfig, party),
      loadInvoices(server, targetConfig, input),
      loadPayments(server, targetConfig, input),
      loadCreditNotes(server, targetConfig, input),
      loadMovements(server, targetConfig, input),
      targetConfig.side === "payable"
        ? loadSupplierDashboard(server, party)
        : Promise.resolve(null as SupplierDashboard | null),
    ]);

    const group = (
      key: string,
      title: string,
      hint: string,
      amountLabel: string,
      showOutstanding: boolean,
      settled: PromiseSettledResult<SourceDocumentRow[]>,
    ): SourceDocumentGroup => ({
      key,
      title,
      hint,
      amountLabel,
      showOutstanding,
      rows: settled.status === "fulfilled" ? settled.value : [],
      error: settled.status === "rejected" ? errorText(settled.reason) : "",
    });

    setDetails((previous) => ({
      ...previous,
      [side]: {
        party,
        loading: false,
        ledger: ledger.status === "fulfilled" ? ledger.value : [],
        ledgerError: ledger.status === "rejected" ? errorText(ledger.reason) : "",
        dashboard: dashboard.status === "fulfilled" ? dashboard.value : null,
        dashboardError: dashboard.status === "rejected" ? errorText(dashboard.reason) : "",
        groups: [
          group(
            "invoices",
            targetConfig.side === "receivable" ? "Hoá đơn bán" : "Hoá đơn mua",
            "Nguồn LÀM PHÁT SINH nợ. Cột “Còn nợ” là trường server lưu trên chính chứng từ.",
            "Tổng tiền",
            true,
            invoices,
          ),
          group(
            "payments",
            targetConfig.paymentLabel,
            targetConfig.side === "receivable"
              ? "Nguồn LÀM GIẢM nợ. Số tiền lấy từ `paid_amount` trên phiếu."
              : "Nguồn LÀM GIẢM nợ phải trả. Số tiền lấy từ `paid_amount` trên phiếu.",
            "Số tiền",
            false,
            payments,
          ),
          group(
            "credits",
            targetConfig.side === "receivable" ? "Giảm trừ cho khách (Credit Note)" : "Giảm trừ của NCC (Debit Note)",
            "Giảm trừ gắn với hoá đơn gốc ở cột “Chứng từ nguồn”.",
            "Tổng giảm trừ",
            false,
            credits,
          ),
          group(
            "movements",
            targetConfig.side === "receivable" ? "Phiếu giao hàng" : "Phiếu nhập kho",
            "Vế HIỆN VẬT của cùng số dư — để soát “đã giao/đã nhận mà chưa có hoá đơn”.",
            targetConfig.side === "receivable" ? "—" : "Tổng tiền hàng",
            false,
            movements,
          ),
        ],
      },
    }));
  }, [config, filters, server, side]);

  // ── Đối soát kỳ giao hàng (chỉ mặt phải trả) ──────────────────────────────
  const confirmSettlement = useCallback(async () => {
    if (!settlement || !detail?.party) return;
    const reason = settlementReason.trim();
    if (reason.length < 3) {
      toast.error("Lý do đối soát phải có ít nhất 3 ký tự.");
      return;
    }
    setSettlementBusy(true);
    try {
      const result = await runSupplierSettlement(server, {
        supplier: detail.party,
        queueKey: settlement.queueKey,
        operation: settlement.operation,
        reason,
      });
      toast.success(
        `${settlement.operation === "Close" ? "Đã đối soát" : "Đã đảo đối soát"} kỳ giao hàng${result.name ? ` · ${result.name}` : ""}.`,
      );
      setSettlement(null);
      setSettlementReason("");
      await openParty(detail.party);
    } catch (caught) {
      toast.error(errorText(caught));
    } finally {
      setSettlementBusy(false);
    }
  }, [detail, openParty, server, settlement, settlementReason]);

  // ── Dữ liệu đang hiện ─────────────────────────────────────────────────────
  const visibleParties = useMemo(() => applyOpenOnly(current.parties, filters), [current.parties, filters]);

  const exportParties = useCallback(() => {
    const headers = [
      config.partyLabel,
      "Số chứng từ (server)",
      "Tổng phát sinh (server)",
      "Số dư theo hoá đơn (server)",
      "Số dư theo sổ (tổng hiển thị)",
      "Số chứng từ còn dư",
      "Tiền tệ",
    ];
    const rows = visibleParties.map((row) => [
      row.party,
      row.documentCount ?? "",
      row.totalBilled ?? "",
      row.outstandingByInvoice ?? "",
      row.outstandingByLedger ?? "",
      row.ledgerVoucherCount,
      row.currencies.join(" "),
    ]);
    downloadCsv(`cong-no-${side}-${todayIso()}.csv`, toCsv(headers, rows));
  }, [config.partyLabel, side, visibleParties]);

  const exportDetail = useCallback(() => {
    if (!detail) return;
    const headers = ["Nhóm", "DocType", "Số chứng từ", "Ngày", "Hạn thanh toán", "Chứng từ nguồn", "Số tiền", "Còn nợ", "Ghi chú", "Trạng thái"];
    const rows: Array<Array<unknown>> = [];
    for (const item of detail.ledger) {
      rows.push(["Sổ Payment Ledger", item.voucherType, item.voucherNo, "", "", "", "", item.outstanding ?? "", item.currency, ""]);
    }
    for (const group of detail.groups) {
      for (const row of group.rows) {
        rows.push([
          group.title,
          row.doctype,
          row.name,
          row.postingAt,
          row.dueDate,
          row.reference,
          row.amount ?? "",
          row.outstanding ?? "",
          row.extra,
          row.docstatus ?? "",
        ]);
      }
    }
    downloadCsv(`cong-no-${side}-${detail.party}-${todayIso()}.csv`, toCsv(headers, rows));
  }, [detail, side]);

  return (
    <div className="h-full overflow-auto bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              <h1 className="text-xl font-semibold">Báo cáo công nợ</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Phải thu và phải trả trong cùng một màn. Mỗi số dư đều mở ra được danh sách chứng từ gốc
              làm nên nó, và mỗi dòng chứng từ bấm được để sang thẳng chứng từ đó.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={applyFilters} disabled={current.loading}>
              {current.loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Áp dụng bộ lọc
            </Button>
            <Button variant="outline" onClick={exportParties} disabled={!visibleParties.length}>
              <Download className="mr-2 size-4" /> Xuất CSV
            </Button>
          </div>
        </header>

        {/*
          Hai tab dùng CHUNG một khuôn trình bày, nên phần thân nằm NGOÀI `TabsContent`:
          chỉ có `config` và dữ liệu đổi, còn bố cục thì không. Nhân đôi cây JSX cho hai
          mặt là cách chắc chắn nhất để một sửa đổi chỉ áp vào một mặt rồi trôi dạt.
        */}
        <Tabs value={side} onValueChange={(value) => setSide(value === "payable" ? "payable" : "receivable")}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="receivable"><Wallet className="size-4" /> Phải thu (khách hàng)</TabsTrigger>
            <TabsTrigger value="payable"><Scale className="size-4" /> Phải trả (nhà cung cấp)</TabsTrigger>
          </TabsList>
        </Tabs>

        <FilterBar
          config={config}
          filters={filters}
          services={services}
          onChange={setFilters}
          onApply={applyFilters}
          busy={current.loading}
        />

        {current.error ? <ErrorNote message={current.error} /> : null}
        {current.sourceErrors.map((message) => <ErrorNote key={message} message={message} tone="warning" />)}

        <AgingPanel config={config} state={current.aging} asOfDate={filters.toDate || todayIso()} />

        <PartyTable
          config={config}
          loading={current.loading}
          rows={visibleParties}
          selected={detail?.party ?? ""}
          onSelect={(party) => void openParty(party)}
        />

        {detail ? (
          <PartyDetail
            config={config}
            detail={detail}
            onNavigate={navigate}
            onExport={exportDetail}
            settlement={settlement}
            settlementReason={settlementReason}
            settlementBusy={settlementBusy}
            onRequestSettlement={(queueKey, material, operation) => {
              setSettlement({ queueKey, material, operation });
              setSettlementReason("");
            }}
            onSettlementReason={setSettlementReason}
            onCancelSettlement={() => { setSettlement(null); setSettlementReason(""); }}
            onConfirmSettlement={() => void confirmSettlement()}
          />
        ) : (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Chọn một {config.partyLabel.toLocaleLowerCase("vi")} ở bảng trên để xem chứng từ gốc làm nên số dư.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bộ lọc ───────────────────────────────────────────────────────────────────

function FilterBar(props: {
  config: DebtSideConfig;
  filters: DebtFilterState;
  services: Parameters<typeof AlumdoorDebtField>[0]["services"];
  onChange: (next: DebtFilterState) => void;
  onApply: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<DebtFilterState>) => props.onChange({ ...props.filters, ...patch });
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor="debt-from">Từ ngày</Label>
        <Input id="debt-from" type="date" value={props.filters.fromDate} onChange={(event) => set({ fromDate: event.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="debt-to">Đến ngày</Label>
        <Input id="debt-to" type="date" value={props.filters.toDate} onChange={(event) => set({ toDate: event.target.value })} />
      </div>
      <AlumdoorDebtField
        id={`debt-party-${props.config.side}`}
        label={props.config.partyLabel}
        doctype={props.config.partyDoctype}
        fieldname={props.config.partyField}
        parentDoctype={props.config.invoiceDoctype}
        value={props.filters.party}
        onChange={(value) => set({ party: value })}
        services={props.services}
        hint="Để trống = toàn bộ danh mục."
      />
      <div className="space-y-1.5">
        <Label htmlFor="debt-threshold">Ngưỡng “còn nợ trên”</Label>
        <Input
          id="debt-threshold"
          type="number"
          inputMode="decimal"
          value={props.filters.minBalance}
          onChange={(event) => set({ minBalance: event.target.value })}
          disabled={!props.filters.onlyOpen}
        />
      </div>
      <div className="flex flex-col justify-end gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={props.filters.onlyOpen}
            onCheckedChange={(value) => set({ onlyOpen: value === true })}
          />
          Chỉ hiện còn nợ
        </label>
        <Button onClick={props.onApply} disabled={props.busy}>
          {props.busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Áp dụng
        </Button>
      </div>
    </section>
  );
}

// ── Tuổi nợ ──────────────────────────────────────────────────────────────────

function AgingPanel(props: { config: DebtSideConfig; state: AgingState; asOfDate: string }) {
  if (props.state.status === "idle") return null;
  if (props.state.status === "loading") {
    return <div className="rounded-xl border bg-card p-4"><Skeleton className="h-16 w-full" /></div>;
  }
  if (props.state.status === "unavailable") {
    return (
      <section className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-text">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Chưa có tuổi nợ chia khoảng từ server — màn KHÔNG tự tính thay.</p>
            <p>
              Báo cáo <code className="font-mono text-xs">{props.config.agingReport}</code> đã được viết đủ 5 khoảng
              (Chưa đến hạn · 1–30 · 31–60 · 61–90 · Trên 90) ở
              <code className="ml-1 font-mono text-xs">server/packages/query/src/finance-aging.ts</code>, nhưng tuyến
              chạy báo cáo hiện tại chưa nối compiler đó. Tự chia khoảng ở client là dựng nguồn sự thật thứ hai cho
              ngày đáo hạn, nên màn từ chối làm việc đó.
            </p>
            <p className="text-xs opacity-90">Server trả về: {props.state.message}</p>
          </div>
        </div>
      </section>
    );
  }

  const rows = props.state.rows;
  if (!rows.length) {
    return (
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Không có chứng từ nào còn dư tại ngày {props.asOfDate}.
      </section>
    );
  }
  // Gộp theo khoảng: từng dòng `outstanding` là con số server; đây là TỔNG HIỂN THỊ
  // của đúng các dòng server vừa trả, không phải một cách chia tuổi nợ do client nghĩ ra.
  const byBucket = new Map<string, number | null>();
  for (const bucket of AGING_BUCKETS) {
    byBucket.set(bucket, displaySubtotal(rows.filter((row) => row.bucket === bucket).map((row) => row.outstanding)));
  }
  const other = rows.filter((row) => !AGING_BUCKETS.includes(row.bucket as typeof AGING_BUCKETS[number]));
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Scale className="size-4 text-primary" /> Tuổi nợ tại ngày {props.asOfDate}</h2>
        <span className="text-xs text-muted-foreground">
          Khoảng do server đặt tên ({props.config.agingReport}); tổng mỗi khoảng là tổng hiển thị của các dòng đang hiện.
        </span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AGING_BUCKETS.map((bucket) => (
          <div key={bucket} className="rounded-lg bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{bucket}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{moneyOrDash(byBucket.get(bucket) ?? null)}</dd>
          </div>
        ))}
      </dl>
      {other.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {other.length} dòng mang nhãn khoảng ngoài danh sách trên — server đã đổi tên khoảng, cần cập nhật màn.
        </p>
      ) : null}
    </section>
  );
}

// ── Bảng đối tác ─────────────────────────────────────────────────────────────

function PartyTable(props: {
  config: DebtSideConfig;
  loading: boolean;
  rows: PartyRow[];
  selected: string;
  onSelect: (party: string) => void;
}) {
  if (props.loading) {
    return (
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    );
  }
  if (!props.rows.length) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <BookOpenCheck className="mx-auto size-9 text-muted-foreground" />
        <h2 className="mt-3 font-medium">Không có {props.config.partyLabel.toLocaleLowerCase("vi")} nào khớp bộ lọc</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nới kỳ, bỏ chọn đối tác hoặc tắt “Chỉ hiện còn nợ”.</p>
      </div>
    );
  }
  const totalBilled = displaySubtotal(props.rows.map((row) => row.totalBilled));
  const totalInvoiceOutstanding = displaySubtotal(props.rows.map((row) => row.outstandingByInvoice));
  const totalLedgerOutstanding = displaySubtotal(props.rows.map((row) => row.outstandingByLedger));

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{props.config.partyLabel} · {props.rows.length} dòng</h2>
        <span className="text-xs text-muted-foreground">
          Cột “Số dư theo sổ” là tổng hiển thị các dòng Payment Ledger đang hiện, LŨY KẾ tới hiện tại
          (báo cáo {props.config.ledgerReport} không nhận lọc theo ngày).
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{props.config.partyLabel}</TableHead>
              <TableHead className="text-right">Số chứng từ</TableHead>
              <TableHead className="text-right">Tổng phát sinh</TableHead>
              <TableHead className="text-right">Số dư theo hoá đơn</TableHead>
              <TableHead className="text-right">Số dư theo sổ</TableHead>
              <TableHead className="text-center">Đối chiếu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row) => (
              <TableRow
                key={row.party}
                className={`cursor-pointer ${props.selected === row.party ? "bg-accent/60" : ""}`}
                onClick={() => props.onSelect(row.party)}
              >
                <TableCell className="font-medium">
                  {row.party}
                  {row.currencies.length ? <div className="text-xs text-muted-foreground">{row.currencies.join(" · ")}</div> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{countOrDash(row.documentCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{moneyOrDash(row.totalBilled)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{moneyOrDash(row.outstandingByInvoice)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {moneyOrDash(row.outstandingByLedger)}
                  <div className="text-xs text-muted-foreground">{row.ledgerVoucherCount || 0} chứng từ</div>
                </TableCell>
                <TableCell className="text-center">
                  {partySourcesDisagree(row)
                    ? <Badge variant="destructive">Hai nguồn lệch</Badge>
                    : <Badge variant="outline">Khớp</Badge>}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-medium">
              <TableCell>Tổng (đang hiện)</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">{moneyOrDash(totalBilled)}</TableCell>
              <TableCell className="text-right tabular-nums">{moneyOrDash(totalInvoiceOutstanding)}</TableCell>
              <TableCell className="text-right tabular-nums">{moneyOrDash(totalLedgerOutstanding)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// ── Chi tiết một đối tác ─────────────────────────────────────────────────────

function PartyDetail(props: {
  config: DebtSideConfig;
  detail: DetailState;
  onNavigate: (path: string) => void;
  onExport: () => void;
  settlement: { queueKey: string; material: string; operation: "Close" | "Reverse" } | null;
  settlementReason: string;
  settlementBusy: boolean;
  onRequestSettlement: (queueKey: string, material: string, operation: "Close" | "Reverse") => void;
  onSettlementReason: (value: string) => void;
  onCancelSettlement: () => void;
  onConfirmSettlement: () => void;
}) {
  const { detail } = props;
  if (detail.loading) {
    return (
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
      </div>
    );
  }
  const ledgerTotal = displaySubtotal(detail.ledger.map((row) => row.outstanding));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
        <div>
          <h2 className="font-semibold">{detail.party}</h2>
          <p className="text-sm text-muted-foreground">
            Số dư đến từ những chứng từ dưới đây. Bấm một dòng để mở chính chứng từ đó.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={props.onExport}>
            <Download className="mr-2 size-4" /> Xuất CSV chi tiết
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => props.onNavigate(documentPath(props.config.partyDoctype, detail.party))}
          >
            <ArrowUpRight className="mr-2 size-4" /> Mở hồ sơ {props.config.partyLabel.toLocaleLowerCase("vi")}
          </Button>
        </div>
      </div>

      {/* Sổ Payment Ledger — bảng GIẢI TRÌNH gốc: mỗi dòng là một chứng từ còn dư. */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="font-medium">Sổ Payment Ledger · còn dư theo từng chứng từ</h3>
          <span className="text-xs text-muted-foreground">Nguồn: báo cáo nền tảng {props.config.ledgerReport}</span>
        </div>
        {detail.ledgerError ? <ErrorNote message={detail.ledgerError} className="m-3" /> : null}
        {detail.ledger.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loại chứng từ</TableHead>
                  <TableHead>Chứng từ</TableHead>
                  <TableHead>Tiền tệ</TableHead>
                  <TableHead className="text-right">Còn nợ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.ledger.map((row) => (
                  <TableRow
                    key={`${row.voucherType}:${row.voucherNo}:${row.currency}`}
                    className="cursor-pointer"
                    onClick={() => row.voucherType && row.voucherNo && props.onNavigate(documentPath(row.voucherType, row.voucherNo))}
                  >
                    <TableCell><Badge variant="outline">{row.voucherType || "—"}</Badge></TableCell>
                    <TableCell className="font-medium">{row.voucherNo || "—"}</TableCell>
                    <TableCell>{row.currency || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{moneyOrDash(row.outstanding)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={3}>Tổng (đang hiện)</TableCell>
                  <TableCell className="text-right tabular-nums">{moneyOrDash(ledgerTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : !detail.ledgerError ? (
          <p className="p-4 text-sm text-muted-foreground">Sổ không còn chứng từ dư nào cho đối tác này.</p>
        ) : null}
      </div>

      {detail.groups.map((group) => (
        <DocumentGroupTable key={group.key} group={group} onNavigate={props.onNavigate} />
      ))}

      {props.config.side === "payable" ? (
        <SupplierDeliveryPanel
          dashboard={detail.dashboard}
          error={detail.dashboardError}
          onNavigate={props.onNavigate}
          settlement={props.settlement}
          settlementReason={props.settlementReason}
          settlementBusy={props.settlementBusy}
          onRequestSettlement={props.onRequestSettlement}
          onSettlementReason={props.onSettlementReason}
          onCancelSettlement={props.onCancelSettlement}
          onConfirmSettlement={props.onConfirmSettlement}
        />
      ) : null}
    </section>
  );
}

function DocumentGroupTable(props: { group: SourceDocumentGroup; onNavigate: (path: string) => void }) {
  const { group } = props;
  const total = displaySubtotal(group.rows.map((row) => row.amount));
  const totalOutstanding = group.showOutstanding ? displaySubtotal(group.rows.map((row) => row.outstanding)) : null;
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="font-medium">{group.title} · {group.rows.length} chứng từ</h3>
        <span className="max-w-2xl text-xs text-muted-foreground">{group.hint}</span>
      </div>
      {group.error ? <ErrorNote message={group.error} className="m-3" /> : null}
      {group.rows.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chứng từ</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Hạn</TableHead>
                <TableHead>Chứng từ nguồn</TableHead>
                <TableHead className="text-right">{group.amountLabel}</TableHead>
                {group.showOutstanding ? <TableHead className="text-right">Còn nợ</TableHead> : null}
                <TableHead>Ghi chú</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <TableRow
                  key={`${row.doctype}:${row.name}`}
                  className="cursor-pointer"
                  onClick={() => props.onNavigate(documentPath(row.doctype, row.name))}
                >
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.postingAt || "—"}</TableCell>
                  <TableCell>{row.dueDate || "—"}</TableCell>
                  <TableCell>
                    {row.reference ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 font-normal"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onNavigate(documentPath(referenceDoctype(row), row.reference));
                        }}
                      >
                        {row.reference}
                      </Button>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{moneyOrDash(row.amount)}</TableCell>
                  {group.showOutstanding ? <TableCell className="text-right font-medium tabular-nums">{moneyOrDash(row.outstanding)}</TableCell> : null}
                  <TableCell className="max-w-56 whitespace-normal text-sm text-muted-foreground">{row.extra || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={row.docstatus === 1 ? "outline" : row.docstatus === 2 ? "destructive" : "secondary"}>
                      {docstatusBadge(row.docstatus)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={4}>Tổng (đang hiện)</TableCell>
                <TableCell className="text-right tabular-nums">{moneyOrDash(total)}</TableCell>
                {group.showOutstanding ? <TableCell className="text-right tabular-nums">{moneyOrDash(totalOutstanding)}</TableCell> : null}
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : !group.error ? (
        <p className="p-4 text-sm text-muted-foreground">Không có chứng từ nào trong kỳ đang lọc.</p>
      ) : null}
    </div>
  );
}

/**
 * DocType của "chứng từ nguồn" trên từng dòng.
 *
 * Suy từ loại chứng từ đang đứng, không đoán theo tiền tố mã: `Sales Invoice`
 * trỏ về `Sales Order`, `Credit Note` trỏ về `Sales Invoice`, v.v. Nếu không
 * biết chắc thì trả về chính DocType đó để không dựng route ảo.
 */
function referenceDoctype(row: SourceDocumentRow): string {
  switch (row.doctype) {
    case "Sales Invoice":
    case "Delivery Note":
      return "Sales Order";
    case "Purchase Invoice":
    case "Purchase Receipt":
      return "Purchase Order";
    case "Credit Note":
      return "Sales Invoice";
    case "Debit Note":
      return "Purchase Invoice";
    default:
      return row.doctype;
  }
}

function docstatusBadge(value: number | null): string {
  if (value === 1) return "Đã ghi sổ";
  if (value === 2) return "Đã huỷ";
  if (value === 0) return "Nháp";
  return "—";
}

// ── Giao hàng + đối trừ của nhà cung cấp ─────────────────────────────────────

function SupplierDeliveryPanel(props: {
  dashboard: SupplierDashboard | null;
  error: string;
  onNavigate: (path: string) => void;
  settlement: { queueKey: string; material: string; operation: "Close" | "Reverse" } | null;
  settlementReason: string;
  settlementBusy: boolean;
  onRequestSettlement: (queueKey: string, material: string, operation: "Close" | "Reverse") => void;
  onSettlementReason: (value: string) => void;
  onCancelSettlement: () => void;
  onConfirmSettlement: () => void;
}) {
  if (props.error) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-medium">Theo dõi giao hàng & đối trừ</h3>
        <ErrorNote className="mt-3" message={props.error} />
      </div>
    );
  }
  const dashboard = props.dashboard;
  if (!dashboard) return null;
  const summary = dashboard.summary ?? {};
  const billing = dashboard.billing ?? {};
  const materials = dashboard.materials ?? [];
  const orders = dashboard.purchase_orders ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Công nợ phải trả theo thẩm quyền server</h3>
          <Badge variant={billing.authoritative ? "outline" : "destructive"}>
            {text(billing.source) || "Không rõ nguồn"}
          </Badge>
        </div>
        {billing.note ? <p className="mt-2 text-sm text-muted-foreground">{billing.note}</p> : null}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Còn phải trả" value={moneyOrDash(amount(summary.payable_outstanding))} />
          <Metric label="Quá hạn" value={moneyOrDash(amount(summary.payable_overdue))} />
          <Metric label="Đã ứng trước NCC" value={moneyOrDash(amount(summary.supplier_advance))} />
          <Metric label="Ròng phải trả" value={moneyOrDash(amount(summary.payable_net_exposure))} />
          <Metric label="Tổng hoá đơn mua" value={moneyOrDash(amount(billing.invoice_total))} />
          <Metric label="Giá trị hàng đã nhận" value={moneyOrDash(amount(billing.received_value))} />
          <Metric label="Đã nhận chưa có hoá đơn" value={moneyOrDash(amount(billing.received_not_invoiced_hint))} />
          <Metric label="Hạn cũ nhất" value={dateOnly(billing.oldest_due_date) || "—"} />
        </dl>
        {!billing.authoritative ? (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning-text">
            Server báo đang dùng đường lùi (`Purchase Invoice fallback`) thay cho Payment Ledger. Con số vẫn của server,
            nhưng KHÔNG được coi là công nợ chính thức — xem `capabilities.payable_source_of_truth` trong payload.
          </p>
        ) : null}
      </div>

      {orders.length ? (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3"><h3 className="font-medium">Đơn mua · tình trạng giao</h3></div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đơn mua</TableHead>
                  <TableHead>Ngày đặt</TableHead>
                  <TableHead>Hẹn giao</TableHead>
                  <TableHead className="text-right">Giá trị đơn</TableHead>
                  <TableHead className="text-right">Đã nhận (%)</TableHead>
                  <TableHead className="text-right">Đã có HĐ (%)</TableHead>
                  <TableHead className="text-right">Quá hạn (ngày)</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((row) => {
                  const name = text(row.purchase_order);
                  return (
                    <TableRow key={name} className="cursor-pointer" onClick={() => props.onNavigate(documentPath("Purchase Order", name))}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{dateOnly(row.transaction_date) || "—"}</TableCell>
                      <TableCell>{dateOnly(row.schedule_date) || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{moneyOrDash(amount(row.purchase_value))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.received_percentage))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.billed_percentage))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.overdue_days))}</TableCell>
                      <TableCell className="text-center"><Badge variant={text(row.status) === "Quá hạn" ? "destructive" : "outline"}>{text(row.status) || "—"}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {materials.length ? (
        <div className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="font-medium">Đối trừ vật tư · {materials.length} luồng</h3>
            <span className="text-xs text-muted-foreground">
              Nợ HIỆN VẬT (cây/mét/kg) do server tính; đây là vế đi kèm số dư tiền, không phải số tiền.
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vật tư</TableHead>
                  <TableHead className="text-right">Đặt</TableHead>
                  <TableHead className="text-right">Đã nhận</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                  <TableHead className="text-right">Còn (m)</TableHead>
                  <TableHead className="text-right">Lệch cân (kg)</TableHead>
                  <TableHead className="text-right">Quá hạn</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                  <TableHead className="text-center">Đối soát</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((row) => {
                  const queueKey = text(row.queue_key);
                  const status = text(row.status);
                  const material = text(row.material) || text(row.item_code);
                  return (
                    <TableRow key={queueKey || material}>
                      <TableCell className="max-w-72 whitespace-normal font-medium">{material || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.ordered_bars))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.received_bars))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.remaining_bars))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.remaining_meters))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.weight_variance_kg))}</TableCell>
                      <TableCell className="text-right tabular-nums">{countOrDash(amount(row.overdue_days))}</TableCell>
                      <TableCell className="text-center"><Badge variant={status === "Đã đối soát" ? "secondary" : "outline"}>{status || "—"}</Badge></TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!queueKey || status === "Đã đối soát"}
                            onClick={() => props.onRequestSettlement(queueKey, material, "Close")}
                          >
                            Đối soát
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!queueKey || status !== "Đã đối soát"}
                            onClick={() => props.onRequestSettlement(queueKey, material, "Reverse")}
                          >
                            Đảo
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {props.settlement ? (
            <div className="space-y-2 border-t p-4">
              <p className="text-sm font-medium">
                {props.settlement.operation === "Close" ? "Đối soát" : "Đảo đối soát"} luồng “{props.settlement.material}”
              </p>
              <p className="text-xs text-muted-foreground">
                Server tự chọn kỳ đang ở đúng trạng thái rồi tạo và ghi sổ chứng từ `Purchase Settlement`. Lý do bắt buộc từ 3 ký tự.
              </p>
              <Textarea
                value={props.settlementReason}
                onChange={(event) => props.onSettlementReason(event.target.value)}
                placeholder="Lý do đối soát (bắt buộc)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={props.onConfirmSettlement} disabled={props.settlementBusy}>
                  {props.settlementBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Xác nhận
                </Button>
                <Button size="sm" variant="ghost" onClick={props.onCancelSettlement} disabled={props.settlementBusy}>Huỷ</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Mảnh dùng chung ──────────────────────────────────────────────────────────

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{props.value}</dd>
    </div>
  );
}

function ErrorNote(props: { message: string; tone?: "error" | "warning"; className?: string }): ReactNode {
  const warning = props.tone === "warning";
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
        warning
          ? "border-warning/30 bg-warning/10 text-warning-text"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      } ${props.className ?? ""}`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span className="whitespace-pre-wrap">{props.message}</span>
    </div>
  );
}
