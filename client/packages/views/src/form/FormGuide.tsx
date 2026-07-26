/** @jsxImportSource react */
/**
 * Hướng dẫn nhập liệu ngay TRONG form.
 *
 * Vì sao cần: chứng từ kho của ERPNext không tự giải thích. Thủ kho mở "Phiếu kho" ra thấy một ô
 * "Mục đích" với năm lựa chọn tiếng Anh và không có gì nói cho biết chọn cái nào thì tồn chạy đi
 * đâu. Người mới hoặc đoán, hoặc đi hỏi — và đoán sai thì sổ kho sai, phải huỷ chứng từ làm lại.
 *
 * Nguyên tắc viết hướng dẫn ở đây:
 *  - Nói VIỆC người dùng đang làm, không mô tả lại tên field ("Ngày ghi sổ là ngày ghi sổ").
 *  - Nêu HẬU QUẢ khi chọn sai, vì đó mới là thứ khiến người ta dừng lại đọc.
 *  - Ngắn. Ba dòng người ta đọc; mười dòng người ta bỏ qua và ta quay lại chỗ cũ.
 *
 * Người dùng đóng lại được, và lựa chọn đó nhớ theo từng doctype (localStorage) — người làm lâu
 * năm không phải nhìn lại hướng dẫn mỗi ngày, người mới vẫn thấy ngay lần đầu.
 */
import { useState } from "react";
import { Lightbulb, X, HelpCircle } from "lucide-react";
import { Button, cn } from "@metaforge/ui";

const KEY_PREFIX = "mf-guide-hidden:";

function isHidden(doctype: string): boolean {
  try { return localStorage.getItem(KEY_PREFIX + doctype) === "1"; } catch { return false; }
}
function setHidden(doctype: string, hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(KEY_PREFIX + doctype, "1");
    else localStorage.removeItem(KEY_PREFIX + doctype);
  } catch { /* private mode */ }
}

export interface FormGuideContent {
  /** Một câu nói rõ chứng từ này DÙNG ĐỂ LÀM GÌ. */
  what: string;
  /** Các bước/điểm cần lưu ý — mỗi mục một dòng ngắn. */
  points?: string[];
  /** Cảnh báo hậu quả nếu làm sai (hiện nổi bật hơn). */
  warn?: string;
}

export function FormGuide({ doctype, guide, className }: {
  doctype: string;
  guide?: FormGuideContent;
  className?: string;
}) {
  const [hidden, setH] = useState(() => isHidden(doctype));
  if (!guide) return null;

  // Đã tắt ⇒ thu về một dấu "?" nhỏ, KHÔNG biến mất hẳn.
  // Ẩn hoàn toàn thì người dùng lỡ tắt là mất luôn đường quay lại: không có menu nào, không có
  // thiết lập nào để bật lại, và họ cũng không biết là từng có hướng dẫn ở đó.
  if (hidden) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-7 gap-1.5 px-2 text-xs text-muted-foreground", className)}
        onClick={() => { setHidden(doctype, false); setH(false); }}
        title="Xem lại hướng dẫn nhập cho chứng từ này"
      >
        <HelpCircle className="size-3.5" /> Hướng dẫn
      </Button>
    );
  }

  return (
    <div className={cn("relative rounded-md border border-info/30 bg-info/5 px-3 py-2.5 pr-9 text-[13px]", className)}>
      <div className="flex gap-2">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-info-text" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{guide.what}</p>
          {guide.points?.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {guide.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          ) : null}
          {guide.warn ? (
            <p className="text-warning-text">{guide.warn}</p>
          ) : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-1 top-1 size-6"
        onClick={() => { setHidden(doctype, true); setH(true); }}
        aria-label="Thu gọn hướng dẫn"
        title="Thu gọn — mở lại bằng nút ? phía trên form"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export type FormGuideMap = Record<string, FormGuideContent>;
