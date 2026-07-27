import { useEffect, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowRight, RotateCcw, FileDown } from "lucide-react";
import type { ImportPreview, ImportStatus, DataImportUiPhase } from "@metaforge/adapter-frappe";
import { toUiPhase } from "@metaforge/adapter-frappe";
import { useMetaForge } from "../container/provider.js";
import { cn, Button, Input, Label, Badge, Separator, FileButton, Table, TableBody, TableRow, TableCell, toast } from "@metaforge/ui";

/**
 * MOVED here from the demo app so the generic runtime can serve it too.
 *
 * It was app-agnostic all along — doctype is state, everything else comes from the
 * adapter — but living inside one app meant every OTHER app shipped without an import
 * screen. "Nhập Excel" was missing from a product not because it was unbuilt but
 * because it was in the wrong folder.
 *
 * Data Import (M08) — wizard đầy đủ copy Frappe Data Import Tool:
 *   1. Cấu hình  : DocType + kiểu nhập (thêm mới / cập nhật) + tải MẪU
 *   2. Tải lên   : chọn file → createDoc("Data Import") → uploadFile(import_file) → preview
 *   3. Xem trước : bảng cột đã map (header→field, cột bỏ qua), cảnh báo → "Bắt đầu nhập"
 *   4. Kết quả   : form_start_import → poll get_import_status → success/failed/total,
 *                  tải mẫu lỗi (download_errored_template) nếu có bản ghi hỏng.
 * Adapter: import.downloadTemplate/preview/start/status/erroredTemplate + createDoc + uploadFile.
 */

type ImportType = "Insert New Records" | "Update Existing Records";
type Phase = "config" | "busy" | "preview" | "running" | "done";

const IMPORT_TYPES: { v: ImportType; label: string; hint: string }[] = [
  { v: "Insert New Records", label: "Thêm bản ghi mới", hint: "Tạo bản ghi mới từ mỗi hàng" },
  { v: "Update Existing Records", label: "Cập nhật bản ghi", hint: "Khớp theo ID, cập nhật giá trị" },
];

const TERMINAL: ReadonlySet<DataImportUiPhase> = new Set<DataImportUiPhase>(["completed", "failed"]);

export function ImportContent() {
  const { adapter } = useMetaForge();
  const [dt, setDt] = useState("ToDo");
  const [importType, setImportType] = useState<ImportType>("Insert New Records");
  const [fileType, setFileType] = useState<"CSV" | "Excel">("CSV");

  const [phase, setPhase] = useState<Phase>("config");
  const [di, setDi] = useState<string>("");           // tên Data Import doc
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  const busy = phase === "busy";
  const running = phase === "running";

  function fail(e: unknown) {
    toast.error(adapter.mapError(e).message);
    setPhase((p) => (p === "busy" ? "config" : p));
  }

  // ── bước 1: tải mẫu ────────────────────────────────────────────────────────
  async function downloadTemplate() {
    if (!dt.trim()) return;
    setPhase("busy");
    try {
      const blob = await adapter.import.downloadTemplate(dt.trim(), { fileType });
      saveBlob(blob, `${dt.trim()}-template.${fileType === "Excel" ? "xlsx" : "csv"}`);
      toast.success("Đã tải mẫu");
    } catch (e) {
      fail(e);
    } finally {
      setPhase((p) => (p === "busy" ? "config" : p));
    }
  }

  // ── bước 2: chọn file → tạo Data Import + upload + preview ──────────────────
  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || !dt.trim()) return;
    setFileError(null);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { setFileError("Chỉ nhận tệp CSV hoặc Excel (.xlsx, .xls)."); return; }
    if (file.size > 20 * 1024 * 1024) { setFileError("Tệp lớn hơn 20 MB. Hãy chia thành nhiều tệp nhỏ hơn để nhập an toàn."); return; }
    setPhase("busy");
    setPreview(null);
    setStatus(null);
    setFileName(file.name);
    try {
      // 1) tạo doc Data Import
      const doc = await adapter.createDoc("Data Import", {
        reference_doctype: dt.trim(),
        import_type: importType,
      });
      const name = String(doc.name);
      setDi(name);
      // 2) đính file vào field import_file (server tự gán field khi có fieldname)
      const up = await adapter.uploadFile(file, {
        doctype: "Data Import",
        docname: name,
        fieldname: "import_file",
        isPrivate: 1,
      });
      // 3) xem trước từ template
      const pv = await adapter.import.preview(name, up.file_url);
      setPreview(pv);
      setPhase("preview");
      toast.success("Đã tải lên, xem trước bên dưới");
    } catch (e) {
      fail(e);
    }
  }

  // ── bước 3: bắt đầu nhập + poll trạng thái ──────────────────────────────────
  async function startImport() {
    if (!di) return;
    setPhase("running");
    setStatus(null);
    try {
      await adapter.import.start(di);
      poll();
    } catch (e) {
      fail(e);
      setPhase("preview");
    }
  }

  function poll() {
    if (!di) return;
    void adapter.import
      .status(di)
      .then((st) => {
        setStatus(st);
        if (TERMINAL.has(toUiPhase(st.status))) {
          setPhase("done");
        } else {
          pollTimer.current = setTimeout(poll, 1500);
        }
      })
      .catch((e) => {
        fail(e);
        setPhase("done");
      });
  }

  async function downloadErrored() {
    if (!di) return;
    try {
      const blob = await adapter.import.erroredTemplate(di);
      saveBlob(blob, `${dt.trim()}-loi.csv`);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    }
  }

  function reset() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setPhase("config");
    setDi("");
    setFileName("");
    setPreview(null);
    setStatus(null);
    setFileError(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FileSpreadsheet className="size-5 text-primary" /> Nhập dữ liệu
      </h2>

      <Stepper phase={phase} />

      {/* Bước 1 — cấu hình + tải mẫu */}
      <StepCard n={1} title="Cấu hình & tải mẫu" active={phase === "config" || busy}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="dt">DocType</Label>
            <Input id="dt" value={dt} onChange={(e) => setDt(e.target.value)} disabled={phase !== "config"} className="w-44" placeholder="vd ToDo" />
          </div>
          <div className="space-y-1">
            <Label>Định dạng mẫu</Label>
            <div className="flex gap-1">
              {(["CSV", "Excel"] as const).map((t) => (
                <Button key={t} type="button" variant={fileType === t ? "default" : "outline"} size="sm" disabled={phase !== "config"} onClick={() => setFileType(t)}>{t}</Button>
              ))}
            </div>
          </div>
          <Button variant="outline" onClick={downloadTemplate} disabled={busy || !dt.trim() || phase !== "config"}>
            <Download /> Tải mẫu
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Kiểu nhập</Label>
          <div className="flex flex-wrap gap-2">
            {IMPORT_TYPES.map((it) => (
              <Button
                key={it.v}
                type="button"
                variant={importType === it.v ? "default" : "outline"}
                size="sm"
                disabled={phase !== "config"}
                onClick={() => setImportType(it.v)}
                className="h-auto flex-col items-start gap-0.5 py-2 text-left"
              >
                <span className="font-medium">{it.label}</span>
                <span className={cn("text-xs font-normal", importType === it.v ? "text-primary-foreground/80" : "text-muted-foreground")}>{it.hint}</span>
              </Button>
            ))}
          </div>
        </div>
      </StepCard>

      {/* Bước 2 — tải file lên */}
      <StepCard n={2} title="Tải file đã điền lên" active={phase === "config" || busy} done={phase === "preview" || phase === "running" || phase === "done"}>
        {phase === "config" || busy ? (
          <div className="flex flex-wrap items-center gap-3">
            <FileButton accept=".csv,.xlsx,.xls" onFiles={onFiles} disabled={busy || !dt.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {busy ? "Đang xử lý…" : "Chọn tệp CSV/Excel"}
            </FileButton>
            <span className="text-sm text-muted-foreground">Điền dữ liệu vào file mẫu rồi tải lên để xem trước.</span>
            {fileError ? <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{fileError}</div> : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <span className="font-medium">{fileName}</span>
            <Badge variant="outline" className="font-normal">{di}</Badge>
          </div>
        )}
      </StepCard>

      {/* Bước 3 — xem trước */}
      {preview && (phase === "preview" || phase === "running" || phase === "done") ? (
        <StepCard n={3} title="Xem trước ánh xạ cột" active={phase === "preview"} done={phase === "running" || phase === "done"}>
          <PreviewTable preview={preview} />
          <Warnings preview={preview} />
          {phase === "preview" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={startImport}><ArrowRight className="size-4" /> Bắt đầu nhập</Button>
              <Button variant="ghost" onClick={reset}><RotateCcw className="size-4" /> Chọn tệp khác</Button>
            </div>
          ) : null}
        </StepCard>
      ) : null}

      {/* Bước 4 — chạy & kết quả */}
      {phase === "running" || phase === "done" ? (
        <StepCard n={4} title="Kết quả nhập" active={running} done={phase === "done"}>
          <ResultBlock running={running} status={status} onErrored={downloadErrored} onReset={reset} />
        </StepCard>
      ) : null}
    </div>
  );
}

// ── Xem trước bảng cột ────────────────────────────────────────────────────────
function PreviewTable({ preview }: { preview: ImportPreview }) {
  const cols = preview.columns ?? [];
  const rows = (preview.data ?? []).slice(0, 6);
  if (cols.length === 0 && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Không đọc được nội dung file. Kiểm tra định dạng và tiêu đề cột.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {cols.map((c, i) => {
          const label = c.df?.label ?? c.df?.fieldname;
          return (
            <Badge key={i} variant={c.skip_import ? "outline" : "secondary"} className={cn("font-normal", c.skip_import && "text-muted-foreground line-through")}>
              {c.header_title ?? `Cột ${c.column_number ?? i + 1}`}
              {label ? <span className="opacity-60"> → {label}</span> : c.skip_import ? <span className="opacity-60"> (bỏ qua)</span> : null}
            </Badge>
          );
        })}
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-sm">
            <TableBody>
              {rows.map((r, ri) => (
                <TableRow key={ri} className={cn(ri === 0 && "bg-muted/40 font-medium")}>
                  {(Array.isArray(r) ? r : [r]).map((cell, ci) => (
                    <TableCell key={ci} className="whitespace-nowrap px-2.5 py-1.5">{cell == null ? "" : String(cell)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Hiển thị tối đa 6 hàng đầu để kiểm tra ánh xạ.</p>
    </div>
  );
}

function Warnings({ preview }: { preview: ImportPreview }) {
  const all = [...(preview.template_warnings ?? []), ...(preview.warnings ?? [])];
  if (all.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-warning"><AlertTriangle className="size-4" /> {all.length} cảnh báo</div>
      <ul className="space-y-0.5 pl-6 text-xs text-muted-foreground">
        {all.slice(0, 8).map((w, i) => (
          <li key={i} className="list-disc">{w.message}{w.row != null ? <span className="opacity-60"> (hàng {w.row})</span> : null}</li>
        ))}
        {all.length > 8 ? <li className="list-disc opacity-60">… và {all.length - 8} cảnh báo khác</li> : null}
      </ul>
    </div>
  );
}

// ── Kết quả nhập ──────────────────────────────────────────────────────────────
function ResultBlock({ running, status, onErrored, onReset }: { running: boolean; status: ImportStatus | null; onErrored: () => void; onReset: () => void }) {
  if (running && !status) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Đang xếp hàng công việc nhập…</div>;
  }
  if (!status) return null;

  const phase = toUiPhase(status.status);
  const ok = status.success ?? 0;
  const bad = status.failed ?? 0;
  const total = status.total_records ?? ok + bad;

  if (running) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin text-primary" /> Đang nhập… <span className="text-muted-foreground">{ok + bad}/{total}</span></div>
        <Progress value={total ? ((ok + bad) / total) * 100 : 0} />
      </div>
    );
  }

  const failed = phase === "failed" || bad > 0;
  return (
    <div className="space-y-3">
      <div className={cn("flex items-center gap-2 text-sm font-medium", failed ? "text-warning" : "text-success")}>
        {failed ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
        {status.status === "Success" ? "Nhập thành công" : status.status === "Partial Success" ? "Nhập một phần" : status.status === "Error" ? "Nhập lỗi" : status.status}
      </div>
      <div className="flex flex-wrap gap-2">
        <Stat icon={<CheckCircle2 className="size-4 text-success" />} label="Thành công" value={ok} />
        <Stat icon={<XCircle className="size-4 text-destructive" />} label="Thất bại" value={bad} />
        <Stat icon={<FileSpreadsheet className="size-4 text-muted-foreground" />} label="Tổng" value={total} />
      </div>
      <Separator />
      <div className="flex flex-wrap gap-2">
        {bad > 0 ? <Button variant="outline" size="sm" onClick={onErrored}><FileDown className="size-4" /> Tải bản ghi lỗi</Button> : null}
        <Button variant="ghost" size="sm" onClick={onReset}><RotateCcw className="size-4" /> Nhập tệp khác</Button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex min-w-24 items-center gap-2 rounded-md border bg-card px-3 py-2">
      {icon}
      <div className="leading-tight">
        <div className="text-base font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── khung bước ────────────────────────────────────────────────────────────────
function Stepper({ phase }: { phase: Phase }) {
  const idx = phase === "config" || phase === "busy" ? 0 : phase === "preview" ? 1 : 2;
  const steps = ["Cấu hình", "Xem trước", "Kết quả"];
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={cn("grid size-6 place-items-center rounded-full text-xs", i <= idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
          <span className={cn(i <= idx ? "font-medium" : "text-muted-foreground")}>{s}</span>
          {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
        </div>
      ))}
    </div>
  );
}

function StepCard({ n, title, active, done, children }: { n: number; title: string; active?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", active ? "border-primary/40" : done ? "opacity-90" : "")}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className={cn("grid size-6 place-items-center rounded-full text-xs", done ? "bg-success text-white" : active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          {done ? <CheckCircle2 className="size-4" /> : n}
        </span>
        {title}
      </div>
      <div className="space-y-4 pl-8">{children}</div>
    </div>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
