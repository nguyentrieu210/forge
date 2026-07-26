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
}

export const PrintView = forwardRef<HTMLIFrameElement, PrintViewProps>(function PrintView(props, ref) {
  const t = useT();
  if (props.loading) return <div className="mf-print mf-print-loading">{t("print.rendering")}</div>;
  return (
    <iframe
      ref={ref}
      className="mf-print-frame"
      title={props.title ?? "Print preview"}
      srcDoc={props.html}
      /* P0-07: chặn JS/same-origin/form/popup trong print HTML (chỉ render HTML+CSS tĩnh) */
      sandbox=""
      referrerPolicy="no-referrer"
      style={{ width: "100%", minHeight: 600, border: "1px solid var(--border)", borderRadius: "var(--mf-panel-radius)", background: "#fff" }}
    />
  );
});
