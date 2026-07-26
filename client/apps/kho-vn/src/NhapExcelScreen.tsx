/** @jsxImportSource react */
/**
 * NHẬP TỪ FILE EXCEL (mẫu MISA AMIS).
 *
 * Ba bước rõ ràng: chọn loại phiếu → chọn file → XEM TRƯỚC rồi mới ghi.
 *
 * Bước xem trước là bắt buộc, không phải trang trí: nhập hàng loạt mà sai thì hậu quả là hàng
 * trăm chứng từ rác trong sổ kho, phải huỷ từng cái. Ở đây báo rõ dòng nào thiếu gì TRƯỚC khi
 * chạm vào dữ liệu thật, và chỉ ghi những phiếu hợp lệ.
 *
 * Bộ đọc Excel (SheetJS, ~400 KB) NẠP LƯỜI bằng dynamic import: chỉ tải khi người dùng thật sự
 * chọn file. App kho phải nhẹ để chạy trên sóng yếu giữa kho, và tuyệt đại đa số phiên làm việc
 * không đụng tới màn này.
 */
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useMetaForge } from "@metaforge/views";
import {
  Button, FileButton, Separator, Badge, cn, toast,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@metaforge/ui";
import {
  MISA_MAP, findDocNoColumn, findHeaderRow, matchColumns, toISODate, toNumber, type MisaKind,
} from "./misa-mapping.js";

interface DraftDoc {
  key: string;
  head: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  errors: string[];
}

export function NhapExcelScreen() {
  const { adapter, businessContext } = useMetaForge();
  const [kind, setKind] = useState<MisaKind>("nhap");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [drafts, setDrafts] = useState<DraftDoc[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; msgs: string[] } | null>(null);

  const company = String(businessContext?.company ?? "");
  const spec = MISA_MAP[kind];

  const reset = () => { setDrafts([]); setMissingCols([]); setResult(null); setFileName(""); };

  const onFile = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setParsing(true);
    setResult(null);
    setFileName(file.name);
    try {
      // NẠP LƯỜI — xem chú thích đầu file.
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      if (!sheet) throw new Error("File không có sheet nào đọc được.");

      // header:1 ⇒ trả về MẢNG THEO DÒNG, giữ nguyên cột trống. Dùng chế độ object sẽ mất cột
      // rỗng và làm lệch chỉ số cột.
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });

      // TỰ DÒ dòng tiêu đề — số dòng hướng dẫn khác nhau giữa các mẫu MISA, chốt cứng là trượt hết.
      const hIdx = findHeaderRow(rows);
      if (hIdx < 0) {
        setMissingCols(["(không tìm thấy dòng tiêu đề)"]);
        setDrafts([]);
        return;
      }
      const headerRow = rows[hIdx] ?? [];
      const body = rows.slice(hIdx + 1);

      const cols = matchColumns(headerRow, spec.fields);
      const docNoCol = findDocNoColumn(headerRow);

      const missing = spec.fields.filter((f) => f.required && cols[f.target] === undefined).map((f) => f.headers[0]!);
      setMissingCols(missing);
      if (missing.length) { setDrafts([]); return; }

      // Gom dòng theo SỐ CHỨNG TỪ. File MISA để một phiếu trên nhiều dòng (mỗi dòng một mặt hàng),
      // các cột đầu phiếu chỉ điền ở dòng ĐẦU TIÊN của phiếu đó.
      const map = new Map<string, DraftDoc>();
      let lastKey = "";
      body.forEach((r, i) => {
        const rowNo = hIdx + 2 + i; // số dòng như người dùng thấy trong Excel
        const itemCode = String(r[cols.item_code!] ?? "").trim();
        const docNo = docNoCol >= 0 ? String(r[docNoCol] ?? "").trim() : "";
        // Dòng không có mã hàng mà cũng không có số chứng từ ⇒ dòng trống/ghi chú, bỏ qua.
        if (!itemCode && !docNo) return;

        const key = docNo || lastKey || `__row${rowNo}`;
        lastKey = key;

        let d = map.get(key);
        if (!d) {
          const head: Record<string, unknown> = { ...spec.fixed };
          for (const f of spec.fields) {
            if (f.line) continue;
            const idx = cols[f.target];
            if (idx === undefined) continue;
            const raw = r[idx];
            head[f.target] = f.type === "date" ? toISODate(raw) : f.type === "number" ? toNumber(raw) : String(raw ?? "").trim();
          }
          d = { key, head, lines: [], errors: [] };
          map.set(key, d);
        }

        if (!itemCode) return; // dòng chỉ mang thông tin đầu phiếu
        const line: Record<string, unknown> = {};
        for (const f of spec.fields) {
          if (!f.line) continue;
          const idx = cols[f.target];
          if (idx === undefined) continue;
          const raw = r[idx];
          line[f.target] = f.type === "number" ? toNumber(raw) : String(raw ?? "").trim();
        }
        if (!Number(line.qty)) d.errors.push(`Dòng ${rowNo}: số lượng trống hoặc bằng 0`);
        d.lines.push(line);
      });

      const list = [...map.values()];
      for (const d of list) {
        if (!d.lines.length) d.errors.push("Không có dòng hàng nào");
        for (const f of spec.fields) {
          if (f.line || !f.required) continue;
          if (!d.head[f.target]) d.errors.push(`Thiếu ${f.headers[0]}`);
        }
      }
      setDrafts(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setDrafts([]);
    } finally {
      setParsing(false);
    }
  }, [spec]);

  const valid = useMemo(() => drafts.filter((d) => d.errors.length === 0), [drafts]);
  const invalid = useMemo(() => drafts.filter((d) => d.errors.length > 0), [drafts]);

  const runImport = async () => {
    if (!valid.length) return;
    setImporting(true);
    const msgs: string[] = [];
    let ok = 0, fail = 0;
    for (const d of valid) {
      try {
        await adapter.createDoc(spec.doctype, {
          ...d.head,
          company: company || undefined,
          items: d.lines,
        });
        ok++;
      } catch (e) {
        fail++;
        // Giữ nguyên thông báo của server: nó nói rõ field nào sai, còn diễn giải lại thành câu
        // chung chung thì người dùng không biết sửa gì trong file Excel.
        msgs.push(`${d.key}: ${adapter.mapError(e).message}`);
      }
    }
    setResult({ ok, fail, msgs });
    setImporting(false);
    if (ok) toast.success(`Đã tạo ${ok} phiếu`);
    if (fail) toast.error(`${fail} phiếu lỗi — xem chi tiết bên dưới`);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 overflow-auto p-4">
      <div>
        <h1 className="text-lg font-semibold">Nhập từ file Excel</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Dùng đúng file mẫu của MISA AMIS. Hệ thống khớp cột theo TÊN tiêu đề nên xoá bớt cột
          không dùng vẫn nhập được.
        </p>
      </div>

      {/* Bước 1 — loại phiếu */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">1. Loại phiếu:</span>
        {(Object.keys(MISA_MAP) as MisaKind[]).map((k) => (
          <Button
            key={k}
            variant={kind === k ? "default" : "outline"}
            size="sm"
            onClick={() => { setKind(k); reset(); }}
          >
            {MISA_MAP[k].label}
          </Button>
        ))}
        <Badge variant="secondary" className="ml-1 font-normal">→ {spec.doctype}</Badge>
      </div>

      {/* Bước 2 — file */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">2. Chọn file:</span>
        <FileButton accept=".xls,.xlsx" disabled={parsing} onFiles={(f) => void onFile(f)}>
          {parsing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
          {parsing ? "Đang đọc…" : "Chọn file Excel"}
        </FileButton>
        {fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
        {company ? <Badge variant="secondary" className="font-normal">Công ty: {company}</Badge> : null}
      </div>

      {missingCols.length ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[13px]" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            <b>Thiếu cột bắt buộc:</b> {missingCols.join(", ")}.
            <span className="block text-muted-foreground">
              Kiểm tra lại dòng tiêu đề (dòng 7 của file mẫu MISA) — có thể file đã bị sửa hoặc
              chọn nhầm loại phiếu.
            </span>
          </span>
        </div>
      ) : null}

      {/* Bước 3 — xem trước */}
      {drafts.length ? (
        <>
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">3. Xem trước:</span>
            <Badge variant="secondary" className="font-normal">{drafts.length} phiếu</Badge>
            {valid.length ? <Badge className="bg-success/15 font-normal text-success-text hover:bg-success/15">{valid.length} hợp lệ</Badge> : null}
            {invalid.length ? <Badge variant="destructive" className="font-normal">{invalid.length} lỗi</Badge> : null}
            <Button className="ml-auto" disabled={!valid.length || importing} onClick={() => void runImport()}>
              {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Tạo {valid.length} phiếu
            </Button>
          </div>

          <div className="max-h-[24rem] overflow-auto rounded-md border">
            <Table unwrapped>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead>Số chứng từ</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead className="text-right">Số dòng</TableHead>
                  <TableHead>Ghi chú / Lỗi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d) => (
                  <TableRow key={d.key} className={cn(d.errors.length && "bg-destructive/5")}>
                    <TableCell>
                      {d.errors.length
                        ? <AlertTriangle className="size-4 text-destructive" />
                        : <CheckCircle2 className="size-4 text-success-text" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.key.startsWith("__row") ? "(không có số)" : d.key}</TableCell>
                    <TableCell className="text-[13px]">{String(d.head.posting_date ?? "—")}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.lines.length}</TableCell>
                    <TableCell className="text-xs text-destructive">{d.errors.join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      {result ? (
        <div className="rounded-md border p-3 text-[13px]">
          <p className="font-medium">
            Kết quả: {result.ok} phiếu đã tạo{result.fail ? `, ${result.fail} phiếu lỗi` : ""}.
          </p>
          {result.msgs.length ? (
            <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-destructive">
              {result.msgs.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Phiếu tạo ra ở trạng thái NHÁP. Tồn kho chỉ thay đổi sau khi ghi sổ từng phiếu.
          </p>
        </div>
      ) : null}

      {!drafts.length && !missingCols.length && !parsing ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 text-center">
          <FileSpreadsheet className="size-8 text-muted-foreground/50" />
          <p className="text-[13px] font-medium">Chưa chọn file</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Chọn đúng file mẫu MISA AMIS cho loại phiếu ở trên. Dữ liệu chỉ được ghi sau khi bạn
            xem trước và bấm nút tạo — chọn file không làm thay đổi gì.
          </p>
        </div>
      ) : null}
    </div>
  );
}
