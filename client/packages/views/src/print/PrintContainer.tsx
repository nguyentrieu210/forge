/** @jsxImportSource react */
/**
 * PrintContainer — nối PrintView vào backend thật (adapter.printHtml → printview.get_html_and_style).
 * Trang riêng full-page (không phải modal) vì cần đủ chỗ xem bản in + nút "In" gọi window.print()
 * trên khung xem — PrintView vẫn giữ sandbox="" (P0-07, chặn JS/form/popup trong HTML in ấn).
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft, Minus, Plus, RotateCcw, RefreshCw, Download, Loader2 } from "lucide-react";
import { Button, toast, useT } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import { PrintView } from "./PrintView.js";
import { downloadPrintPdf } from "./downloadPdf.js";

export interface PrintContainerProps {
  doctype: string;
  name: string;
  onBack?: () => void;
}

export function PrintContainer({ doctype, name, onBack }: PrintContainerProps) {
  const t = useT();
  const { adapter, scopeKey } = useMetaForge();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const printQ = useQuery({
    queryKey: [scopeKey, "print-html", doctype, name],
    queryFn: () => adapter.printHtml(doctype, name),
    enabled: Boolean(doctype && name),
  });

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
      <div className="flex shrink-0 items-center gap-2 border-b bg-card px-4 py-2.5">
        {onBack ? <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t("common.back")}><ArrowLeft /></Button> : null}
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{doctype} — {name}</div>
        <div className="flex items-center gap-1" role="group" aria-label="Thu phóng bản in">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} disabled={zoom <= 0.5} aria-label="Thu nhỏ"><Minus /></Button>
          <Button variant="ghost" size="sm" className="min-w-16 tabular-nums" onClick={() => setZoom(1)} aria-label="Đặt lại tỷ lệ"><RotateCcw className="size-3.5" /> {Math.round(zoom * 100)}%</Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} disabled={zoom >= 1.5} aria-label="Phóng to"><Plus /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void doDownloadPdf()} disabled={printQ.isLoading || !printQ.data || downloading}>
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {downloading ? "Đang tạo PDF…" : "Tải PDF"}
        </Button>
        <Button size="sm" onClick={doPrint} disabled={printQ.isLoading || !printQ.data}><Printer className="size-4" /> {t("form.action.print")}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
        {printQ.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><div>{adapter.mapError(printQ.error).message}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => void printQ.refetch()}><RefreshCw /> Thử lại</Button></div>
        ) : (
          <PrintView html={printQ.data ?? ""} title={`${doctype} ${name}`} loading={printQ.isLoading} zoom={zoom} ref={iframeRef} />
        )}
      </div>
    </div>
  );
}
