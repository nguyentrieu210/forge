import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Badge, Button, FileButton, Label, Table, TableBody, TableCell, TableRow, toast } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";

const CUSTOMER_FIELDS = [
  ["customer_name", "Tên khách hàng", true],
  ["price_group", "Nhóm giá", true],
  ["account_manager", "Nhân viên bán hàng", false],
  ["contact_person", "Người liên hệ", false],
  ["phone", "Điện thoại", false],
  ["email", "Email", false],
  ["install_province", "Tỉnh/Thành phố", false],
  ["install_ward", "Xã/Phường", false],
  ["install_address_line1", "Địa chỉ", false],
  ["shipping_note", "Ghi chú vận chuyển", false],
  ["tax_id", "Mã số thuế", false],
  ["credit_limit", "Hạn mức công nợ", false],
  ["payment_terms", "Điều khoản thanh toán", false],
  ["note", "Ghi chú", false],
  ["disabled", "Ngừng giao dịch", false],
] as const;

type CustomerField = typeof CUSTOMER_FIELDS[number][0];
type RowStatus = "READY_CREATE" | "DUPLICATE_EXACT" | "DUPLICATE_CANDIDATE" | "INVALID_REQUIRED" | "INVALID_REFERENCE" | "INVALID_VALUE";
type Filter = "all" | "ready" | "duplicate" | "invalid";
interface SourceRow { row_number: number; values: Record<string, unknown> }
interface CheckedRow {
  row_number: number;
  status: RowStatus;
  normalized: Record<string, unknown>;
  field_errors: Record<string, string>;
  duplicate_matches: Array<{ field: string; value: string; name: string }>;
  warnings: string[];
}
interface DryRun {
  dry_run_token: string;
  rows: CheckedRow[];
  summary: { total: number; ready: number; duplicate: number; invalid: number; warnings: number };
}
interface CommitResult {
  batch_id: string;
  imported: number;
  failed: number;
  skipped: number;
  results: Array<{ row_number: number; status: string; name?: string; message?: string; reason?: string }>;
}

const aliases: Record<CustomerField, string[]> = {
  customer_name: ["customer_name", "ten khach hang", "khach hang", "ten khach"],
  price_group: ["price_group", "nhom gia"],
  account_manager: ["account_manager", "nhan vien ban hang", "nv ban hang", "sale", "sales"],
  contact_person: ["contact_person", "nguoi lien he", "lien he"],
  phone: ["phone", "dien thoai", "sdt", "so dien thoai"],
  email: ["email", "e-mail"],
  install_province: ["install_province", "tinh thanh pho", "tinh thanh", "tinh"],
  install_ward: ["install_ward", "xa phuong", "phuong xa", "phuong", "xa"],
  install_address_line1: ["install_address_line1", "dia chi", "dia chi lap dat"],
  shipping_note: ["shipping_note", "ghi chu van chuyen"],
  tax_id: ["tax_id", "ma so thue", "mst"],
  credit_limit: ["credit_limit", "han muc cong no", "han muc"],
  payment_terms: ["payment_terms", "dieu khoan thanh toan"],
  note: ["note", "ghi chu"],
  disabled: ["disabled", "ngung giao dich", "ngung dung"],
};

function key(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, " ").trim();
}

function autoMap(headers: string[]): Array<CustomerField | ""> {
  const used = new Set<CustomerField>();
  return headers.map((header) => {
    const normalized = key(header);
    const matches = CUSTOMER_FIELDS.filter(([field]) => aliases[field].some((alias) => key(alias) === normalized)).map(([field]) => field);
    if (matches.length !== 1 || used.has(matches[0]!)) return "";
    used.add(matches[0]!);
    return matches[0]!;
  });
}

function mappedRows(rawRows: string[][], mapping: Array<CustomerField | "">): SourceRow[] {
  return rawRows.map((cells, index) => {
    const values: Record<string, unknown> = {};
    mapping.forEach((field, column) => { if (field) values[field] = cells[column] ?? ""; });
    return { row_number: index + 2, values };
  }).filter((row) => Object.values(row.values).some((value) => String(value ?? "").trim() !== ""));
}

function statusLabel(status: RowStatus): string {
  if (status === "READY_CREATE") return "Hợp lệ";
  if (status === "DUPLICATE_EXACT") return "Trùng chính xác";
  if (status === "DUPLICATE_CANDIDATE") return "Có thể trùng";
  if (status === "INVALID_REQUIRED") return "Thiếu bắt buộc";
  if (status === "INVALID_REFERENCE") return "Sai danh mục liên kết";
  return "Giá trị không hợp lệ";
}

export function CustomerImportContent() {
  const { adapter } = useMetaForge();
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Array<CustomerField | "">>([]);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [commit, setCommit] = useState<CommitResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<"parse" | "validate" | "commit" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void adapter.getCapabilities("Customer").then((caps) => { if (live) setCanCreate(caps.create); }).catch(() => { if (live) setCanCreate(false); });
    return () => { live = false; };
  }, [adapter]);

  const sourceRows = useMemo(() => mappedRows(rawRows, mapping), [rawRows, mapping]);
  const missingRequired = CUSTOMER_FIELDS.filter(([field, , required]) => required && !mapping.includes(field)).map(([, label]) => label);
  const shown = useMemo(() => (dryRun?.rows ?? []).filter((row) => {
    if (filter === "all") return true;
    if (filter === "ready") return row.status === "READY_CREATE";
    if (filter === "duplicate") return row.status === "DUPLICATE_EXACT" || row.status === "DUPLICATE_CANDIDATE";
    return row.status.startsWith("INVALID_");
  }), [dryRun, filter]);

  function invalidate() { setDryRun(null); setCommit(null); setFilter("all"); }

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setFileError(null);
    invalidate();
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { setFileError("Chỉ nhận CSV hoặc Excel (.xlsx, .xls)."); return; }
    if (file.size > 20 * 1024 * 1024) { setFileError("Tệp lớn hơn 20 MB. Hãy chia nhỏ trước khi nhập."); return; }
    setBusy("parse");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellText: true, cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("File không có sheet dữ liệu.");
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      const first = (matrix[0] ?? []).map((cell) => String(cell ?? "").trim());
      if (!first.some(Boolean)) throw new Error("Không đọc được hàng tiêu đề.");
      const body = matrix.slice(1).map((row) => first.map((_, index) => String(row[index] ?? "")));
      if (body.length > 500) throw new Error("Customer Import V1 nhận tối đa 500 dòng mỗi lượt.");
      setFileName(file.name);
      setHeaders(first);
      setRawRows(body);
      setMapping(autoMap(first));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Không đọc được file.");
      setHeaders([]); setRawRows([]); setMapping([]); setFileName("");
    } finally { setBusy(null); }
  }

  async function validate() {
    if (!sourceRows.length || missingRequired.length) return;
    setBusy("validate"); setCommit(null);
    try {
      const result = await adapter.callPost<DryRun>("alumdoor.customer_import.dry_run", { rows: sourceRows });
      setDryRun(result);
      setFilter("all");
      toast.success(`Đã kiểm tra ${result.summary.total} dòng; ${result.summary.ready} dòng sẵn sàng tạo.`);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setBusy(null); }
  }

  async function importReady() {
    if (!dryRun || dryRun.summary.ready < 1) return;
    setBusy("commit");
    try {
      const result = await adapter.callPost<CommitResult>("alumdoor.customer_import.commit", {
        rows: sourceRows,
        dry_run_token: dryRun.dry_run_token,
        batch_id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setCommit(result);
      toast.success(`Đã tạo ${result.imported} khách hàng.`);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setBusy(null); }
  }

  if (canCreate === null) return <div className="grid min-h-40 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Đang kiểm tra quyền tạo Khách hàng…</div>;
  if (!canCreate) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5"><h2 className="font-semibold">Không có quyền nhập Khách hàng</h2><p className="mt-1 text-sm text-muted-foreground">Tài khoản hiện tại không có quyền tạo Customer. Quyền được kiểm tra lại ở server khi dry-run và khi commit.</p></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><FileSpreadsheet className="size-5 text-primary" />Nhập khách hàng</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create-only · không tự cập nhật khách cũ · Nhóm giá bắt buộc là Đại lý hoặc Lẻ.</p>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <FileButton accept=".csv,.xlsx,.xls" onFiles={onFiles} disabled={busy !== null}>
            {busy === "parse" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Chọn CSV/Excel
          </FileButton>
          {fileName ? <Badge variant="outline">{fileName}</Badge> : <span className="text-sm text-muted-foreground">Tối đa 500 dòng/lượt.</span>}
        </div>
        {fileError ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{fileError}</div> : null}
      </section>

      {headers.length ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div><h3 className="font-semibold">Ánh xạ cột</h3><p className="text-sm text-muted-foreground">Tự nhận diện chỉ khi header khớp duy nhất. Cột mơ hồ phải chọn tay.</p></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {headers.map((header, index) => (
              <div key={`${header}-${index}`} className="space-y-1.5 rounded-md border p-3">
                <Label htmlFor={`map-${index}`}>{header || `Cột ${index + 1}`}</Label>
                <select id={`map-${index}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={mapping[index] ?? ""} onChange={(event) => {
                  const value = event.target.value as CustomerField | "";
                  setMapping((current) => current.map((item, position) => position === index ? value : item === value && value ? "" : item));
                  invalidate();
                }}>
                  <option value="">Bỏ qua cột</option>
                  {CUSTOMER_FIELDS.map(([field, label, required]) => <option key={field} value={field}>{label}{required ? " *" : ""}</option>)}
                </select>
                <p className="truncate text-xs text-muted-foreground">Mẫu: {rawRows.slice(0, 3).map((row) => row[index]).filter(Boolean).join(" · ") || "—"}</p>
              </div>
            ))}
          </div>
          {missingRequired.length ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">Chưa map cột bắt buộc: {missingRequired.join(", ")}.</div> : null}
          <div className="flex items-center gap-3"><Button onClick={validate} disabled={busy !== null || !sourceRows.length || Boolean(missingRequired.length)}>{busy === "validate" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Dry-run trên server</Button><span className="text-sm text-muted-foreground">{sourceRows.length} dòng dữ liệu</span></div>
        </section>
      ) : null}

      {dryRun ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold">Kết quả dry-run</h3><p className="text-sm text-muted-foreground">Mọi tham chiếu và trùng lặp được server kiểm tra lại trước khi tạo.</p></div>
            <div className="flex flex-wrap gap-2"><Badge>Hợp lệ {dryRun.summary.ready}</Badge><Badge variant="outline">Trùng {dryRun.summary.duplicate}</Badge><Badge variant="outline">Lỗi {dryRun.summary.invalid}</Badge></div>
          </div>
          <div className="flex flex-wrap gap-1">
            {([['all','Tất cả'],['ready','Hợp lệ'],['duplicate','Trùng'],['invalid','Lỗi']] as const).map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{label}</Button>)}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table className="text-sm"><TableBody>
              <TableRow className="bg-muted/40 font-medium"><TableCell>Dòng</TableCell><TableCell>Khách hàng</TableCell><TableCell>Nhóm giá</TableCell><TableCell>Điện thoại</TableCell><TableCell>MST</TableCell><TableCell>Tỉnh/Xã</TableCell><TableCell>Trạng thái / lỗi</TableCell></TableRow>
              {shown.map((row) => {
                const errors = Object.entries(row.field_errors).map(([field, message]) => `${field}: ${message}`);
                const duplicates = row.duplicate_matches.map((match) => `${match.field} → ${match.name}`);
                return <TableRow key={row.row_number}><TableCell className="tabular-nums">{row.row_number}</TableCell><TableCell className="font-medium">{String(row.normalized.customer_name ?? "")}</TableCell><TableCell>{String(row.normalized.price_group ?? "")}</TableCell><TableCell>{String(row.normalized.phone ?? "")}</TableCell><TableCell>{String(row.normalized.tax_id ?? "")}</TableCell><TableCell>{[row.normalized.install_province, row.normalized.install_ward].filter(Boolean).join(" / ")}</TableCell><TableCell><div className="flex items-start gap-2">{row.status === "READY_CREATE" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : row.status.startsWith("DUPLICATE") ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}<div><div className="font-medium">{statusLabel(row.status)}</div>{[...errors, ...duplicates].map((message) => <div key={message} className="text-xs text-muted-foreground">{message}</div>)}</div></div></TableCell></TableRow>;
              })}
            </TableBody></Table>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/30 p-3 text-sm"><span>Sẽ tạo mới: <strong>{dryRun.summary.ready}</strong></span><span>Trùng bỏ qua: <strong>{dryRun.summary.duplicate}</strong></span><span>Lỗi cần sửa: <strong>{dryRun.summary.invalid}</strong></span><Button className="ml-auto" onClick={importReady} disabled={busy !== null || dryRun.summary.ready < 1}>{busy === "commit" ? <Loader2 className="size-4 animate-spin" /> : null}Nhập {dryRun.summary.ready} khách hợp lệ</Button></div>
        </section>
      ) : null}

      {commit ? <section className="rounded-lg border bg-card p-4"><h3 className="font-semibold">Kết quả nhập</h3><p className="mt-1 text-sm">Đã tạo <strong>{commit.imported}</strong> · bỏ qua <strong>{commit.skipped}</strong> · lỗi khi ghi <strong>{commit.failed}</strong>.</p>{commit.failed ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">Có dòng ghi thất bại. Có thể dry-run lại và retry; server sẽ không tạo lại khách đã tồn tại.</div> : null}</section> : null}
    </div>
  );
}
