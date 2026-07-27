/** @jsxImportSource react */
/**
 * PrintView (M13, presentational) — render HTML từ printview.get_html_and_style (§6, đã ghép style+html).
 * Dùng iframe cô lập để CSS print-format không rò rỉ ra app. HTML là nội dung tin cậy cùng site (§F3).
 */
import { forwardRef } from "react";
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
  if (props.loading) return <div className="mf-print mf-print-loading">{t("print.rendering")}</div>;
  const zoom = Math.min(1.5, Math.max(0.5, props.zoom ?? 1));
  return (
    <div className="mf-print-frame-wrap overflow-auto" style={{ minHeight: 600 }}>
    <iframe
      ref={ref}
      className="mf-print-frame"
      title={props.title ?? "Print preview"}
      srcDoc={props.html}
      /* P0-07: chặn JS/same-origin/form/popup trong print HTML (chỉ render HTML+CSS tĩnh) */
      sandbox=""
      referrerPolicy="no-referrer"
      style={{ width: `${100 / zoom}%`, minHeight: 600 / zoom, transform: `scale(${zoom})`, transformOrigin: "top left", border: "1px solid var(--border)", borderRadius: "var(--mf-panel-radius)", background: "#fff" }}
    />
    </div>
  );
});
