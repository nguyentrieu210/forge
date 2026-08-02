/** @jsxImportSource react */
/**
 * Hướng dẫn nhập liệu ngay TRONG form.
 */
import { useState } from "react";
import { Lightbulb, X, HelpCircle } from "lucide-react";
import { Button, cn } from "@metaforge/ui";

const KEY_PREFIX = "mf-guide-hidden:";

function isHidden(doctype: string): boolean {
  try {
    // Mặc định thu gọn để form ưu tiên diện tích nhập liệu. Người cần hướng dẫn vẫn mở lại được.
    return localStorage.getItem(KEY_PREFIX + doctype) !== "0";
  } catch { return true; }
}
function setHidden(doctype: string, hidden: boolean): void {
  try { localStorage.setItem(KEY_PREFIX + doctype, hidden ? "1" : "0"); } catch { /* private mode */ }
}

export interface FormGuideContent {
  what: string;
  points?: string[];
  warn?: string;
}

export function FormGuide({ doctype, guide, className }: {
  doctype: string;
  guide?: FormGuideContent;
  className?: string;
}) {
  const [hidden, setH] = useState(() => isHidden(doctype));
  if (!guide) return null;

  if (hidden) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn("size-6 text-muted-foreground", className)}
        onClick={() => { setHidden(doctype, false); setH(false); }}
        aria-label="Mở hướng dẫn"
        title="Xem hướng dẫn nhập cho chứng từ này"
      >
        <HelpCircle className="size-3.5" />
      </Button>
    );
  }

  return (
    <div className={cn("relative rounded-md border border-info/20 bg-info/[0.035] px-3 py-2 pr-8 text-xs", className)}>
      <div className="flex gap-2">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-info-text" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{guide.what}</p>
          {guide.points?.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {guide.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          ) : null}
          {guide.warn ? <p className="text-warning-text">{guide.warn}</p> : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-1 top-1 size-6"
        onClick={() => { setHidden(doctype, true); setH(true); }}
        aria-label="Thu gọn hướng dẫn"
        title="Thu gọn hướng dẫn"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export type FormGuideMap = Record<string, FormGuideContent>;
