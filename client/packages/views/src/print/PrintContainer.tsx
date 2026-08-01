/** @jsxImportSource react */
/**
 * PrintContainer — nối PrintView vào backend thật (adapter.printHtml → printview.get_html_and_style).
 * Trang riêng full-page (không phải modal) vì cần đủ chỗ xem bản in + nút "In" gọi window.print()
 * trên khung xem — PrintView vẫn giữ sandbox="" (P0-07, chặn JS/form/popup trong HTML in ấn).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft, Minus, Plus, RotateCcw, RefreshCw, Download, Loader2, FileQuestion } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast, useT } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import { PrintView } from "./PrintView.js";
import { downloadPrintPdf } from "./downloadPdf.js";

export interface PrintContainerProps {
  doctype: string;
  name: string;
  format?: string;
  onFormatChange?: (format: string) => void;
  onBack?: () => void;
}

export function PrintContainer({ doctype, name, format, onFormatChange, onBack }: PrintContainerProps) {
  const t = useT();
  const { adapter, scopeKey } = useMetaForge();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [localFormat, setLocalFormat] = useState(format);
  const formatsQ = useQuery({
    queryKey: [scopeKey, "print-formats", doctype, name],
    queryFn: () => adapter.getPrintFormats(doctype, name),
    enabled: Boolean(doctype && name),
  });
  const formats = formatsQ.data ?? [];
  const defaultFormat = formats.find((candidate) => candidate.is_default)?.name ?? formats[0]?.name;
  const requestedFormat = format ?? localFormat;
  const selectedFormat = requestedFormat && formats.some((candidate) => candidate.name === requestedFormat) ? requestedFormat : defaultFormat;

  useEffect(() => setLocalFormat(format), [format]);

  useEffect(() => {
    if (requestedFormat && defaultFormat && requestedFormat !== selectedFormat) {
      setLocalFormat(defaultFormat);
      onFormatChange?.(defaultFormat);
    }
  }, [defaultFormat, onFormatChange, requestedFormat, selectedFormat]);

  const changeFormat = (next: string) => {
    setLocalFormat(next);
    onFormatChange?.(next);
  };

  const printQ = useQuery({
    queryKey: [scopeKey, "print-html", doctype, name, selectedFormat],
    queryFn: () => adapter.printHtml(doctype, name, selectedFormat),
    enabled: formatsQ.isSuccess && Boolean(selectedFormat),
  });
  const loading = formatsQ.isLoading || printQ.isLoading;
  const requestError = formatsQ.error ?? printQ.error;

  const doPrint = () => {
    // In khung xem (không phải toàn trang MetaForge) — iframe sandbox="" vẫn cho phép print() ở hầu
    // hết trình duyệt hiện đại; nếu trình duyệt cụ thể chặn, người dùng vẫn xem/đọc được bản in, chỉ
    // cần bấm chuột phải trong khung → "Print Frame" như phương án dự phòng thủ công.
    try { iframeRef.current?.contentWindow?.print(); } catch { /* trình duyệt chặn — người dùng tự in qua chuột phải */ }
  };

  const doDownloadPdf = async () => {
    if (!printQ.data || downloading) return;
    setDownloading(true);
    try {
      await downloadPrintPdf(printQ.data, `${doctype}-${name}.pdf`);
      toast.success("Đã tạo file PDF");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tạo file PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mf-print-container flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
        {onBack ? <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t("common.back")}><ArrowLeft /></Button> : null}
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{doctype} — {name}</div>
        {formats.length > 1 ? (
          <Select value={selectedFormat} onValueChange={changeFormat}>
            <SelectTrigger className="h-8 w-full min-w-52 sm:w-auto" aria-label="Chọn mẫu in">
              <SelectValue placeholder="Chọn mẫu in" />
            </SelectTrigger>
            <SelectContent>
              {formats.map((candidate) => (
                <SelectItem key={candidate.name} value={candidate.name}>
                  {candidate.name}{candidate.is_default ? " (mặc định)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-1" role="group" aria-label="Thu phóng bản in">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} disabled={zoom <= 0.5} aria-label="Thu nhỏ"><Minus /></Button>
          <Button variant="ghost" size="sm" className="min-w-16 tabular-nums" onClick={() => setZoom(1)} aria-label="Đặt lại tỷ lệ"><RotateCcw className="size-3.5" /> {Math.round(zoom * 100)}%</Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} disabled={zoom >= 1.5} aria-label="Phóng to"><Plus /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void doDownloadPdf()} disabled={loading || !printQ.data || downloading}>
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {downloading ? "Đang tạo PDF…" : "Tải PDF"}
        </Button>
        <Button size="sm" onClick={doPrint} disabled={loading || !printQ.data}><Printer className="size-4" /> {t("form.action.print")}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
        {requestError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><div>{adapter.mapError(requestError).message}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => void (formatsQ.error ? formatsQ.refetch() : printQ.refetch())}><RefreshCw /> Thử lại</Button></div>
        ) : formatsQ.isSuccess && formats.length === 0 ? (
          <div className="grid min-h-80 place-items-center p-6 text-center">
            <div className="max-w-md rounded-xl border bg-card p-6 shadow-sm">
              <FileQuestion className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
              <h1 className="mt-3 text-base font-semibold">Chưa có mẫu in</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {doctype} chưa được cấu hình mẫu in. Bạn có thể quay lại chứng từ và tiếp tục làm việc.
              </p>
              {onBack ? <Button variant="outline" className="mt-4" onClick={onBack}><ArrowLeft /> Quay lại chứng từ</Button> : null}
            </div>
          </div>
        ) : (
          <PrintView html={printQ.data ?? ""} title={`${doctype} ${name}`} loading={loading} zoom={zoom} ref={iframeRef} />
        )}
      </div>
    </div>
  );
}
