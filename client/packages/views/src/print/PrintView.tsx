/** @jsxImportSource react */
/**
 * PrintView (M13, presentational) — render HTML từ printview.get_html_and_style (§6, đã ghép style+html).
 * Dùng iframe cô lập để CSS print-format không rò rỉ ra app. HTML là nội dung tin cậy cùng site (§F3).
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@metaforge/ui";

export interface PrintViewProps {
  /** HTML đã gồm <style> (adapter.printHtml). */
  html: string;
  title?: string;
  loading?: boolean;
  /** Tỷ lệ xem trước; không làm thay đổi kích thước khi in. */
  zoom?: number;
}

export const PrintView = forwardRef<HTMLIFrameElement, PrintViewProps>(function PrintView(props, ref) {
  const t = useT();
  const zoom = Math.min(1.5, Math.max(0.5, props.zoom ?? 1));
  const landscape = /@page\s*\{[^}]*size\s*:\s*A4\s+landscape/i.test(props.html);
  const pageWidth = landscape ? 1123 : 794;
  const pageHeight = landscape ? 794 : 1123;
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [availableSize, setAvailableSize] = useState({ width: pageWidth, height: pageHeight });
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const update = () => setAvailableSize({
      width: Math.max(320, element.clientWidth - 16),
      height: Math.max(320, element.clientHeight - 16),
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.loading, pageWidth, pageHeight]);
  const setFrameRef = useCallback((node: HTMLIFrameElement | null) => {
    frameRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  // Mặc định vừa chiều ngang để nội dung chứng từ đủ lớn để đọc.
  // Chiều dọc được cuộn trong vùng xem thay vì ép toàn bộ A4 vào chiều cao màn hình.
  const fitScale = Math.min(1, availableSize.width / pageWidth);
  const pageScale = fitScale * zoom;
  if (props.loading) return <div className="mf-print mf-print-loading">{t("print.rendering")}</div>;
  return (
    <div ref={wrapRef} className="mf-print-frame-wrap flex h-full min-h-0 overflow-auto p-2" style={{ minHeight: 320 }}>
    <div style={{ width: pageWidth * pageScale, minWidth: pageWidth * pageScale, height: pageHeight * pageScale, margin: "0 auto" }}>
      <iframe
      ref={setFrameRef}
      className="mf-print-frame"
      title={props.title ?? "Print preview"}
      srcDoc={props.html}
      /* Chỉ cho cùng nguồn để nạp font đóng gói; vẫn chặn JS, form và popup trong HTML in. */
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      style={{ width: pageWidth, height: pageHeight, transform: `scale(${pageScale})`, transformOrigin: "top left", border: "1px solid var(--border)", borderRadius: "var(--mf-panel-radius)", background: "#fff" }}
    />
    </div>
    </div>
  );
});
