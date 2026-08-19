/** @jsxImportSource react */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@metaforge/ui";
import type { BusinessContextValue } from "./BusinessContext.js";

/**
 * Cửa "phạm vi dữ liệu" — một luật cho cả ba trạng thái trước khi app mở được.
 *
 * TRƯỚC ĐÂY mỗi app tự viết đúng một dòng này:
 *
 *   if (context.loading && !context.dimensions.length)
 *     return <div className="grid h-screen place-items-center …">Đang xác định phạm vi dữ liệu…</div>;
 *
 * chép ở `apps/runtime`, `apps/hrm`, `apps/sample-sales`, `apps/sample-wms` và cả
 * `create-metaforge-app/templates.ts` — nghĩa là mọi app sinh mới cũng thừa hưởng. Nó gây ba
 * vấn đề, đo được trên trình duyệt thật:
 *
 * 1. **Nhảy layout.** Dòng đó `return` TRƯỚC khi Shell kịp render, nên mỗi lần tải trang người
 *    dùng xem ba màn toàn khung nối tiếp: nền đen "Đang kết nối với Forge…", rồi nền xám sáng
 *    một dòng chữ trần, rồi mới tới Desk. Hai ngôn ngữ thị giác khác hẳn nhau.
 *
 * 2. **Treo im lặng.** `BusinessContextProvider` CÓ khai `error` và `reload`, nhưng không app
 *    nào đọc chúng. Khi lời gọi phạm vi không bao giờ trả lời, `loading` ở nguyên `true` và màn
 *    hình đứng đó vĩnh viễn — không lỗi, không đường thoát. Tôi đã ngồi nhìn đúng cảnh đó.
 *
 * 3. **Không phân biệt được trạng thái.** "đang tải", "hỏng" và "chưa chọn phạm vi" là ba việc
 *    khác nhau với ba hành động khác nhau, mà chỉ có một câu chữ cho cả ba.
 *
 * Nay: một hàm quyết trạng thái, một component vẽ thân, và app đặt nó BÊN TRONG Shell của mình
 * nên khung không biến mất. Nhánh `!ready` vốn đã render trong Shell — đây chỉ là kéo hai nhánh
 * còn lại về cùng chỗ.
 */

export type ScopeGateState = "loading" | "error" | "choose" | "ready";

/** Ngưỡng coi là "lâu bất thường" — đủ dài để không doạ người dùng ở mạng chậm. */
const SLOW_MS = 8000;

export function resolveScopeState(context: BusinessContextValue): ScopeGateState {
  if (context.error) return "error";
  if (context.loading && !context.dimensions.length) return "loading";
  return context.ready ? "ready" : "choose";
}

/**
 * Thân của cửa phạm vi. Đặt trong Shell của app; KHÔNG tự vẽ khung.
 *
 * `choose` cần một control riêng của app (thanh chọn phạm vi), nên nó được truyền vào thay vì
 * import ngược — shell không được biết app bày thanh đó ở đâu.
 */
export function ScopeGateBody({
  state,
  error,
  onRetry,
  chooser,
}: {
  state: Exclude<ScopeGateState, "ready">;
  error?: string;
  onRetry?: () => void;
  chooser?: ReactNode;
}) {
  if (state === "loading") return <ScopeLoading onRetry={onRetry} />;
  if (state === "error") return <ScopeError message={error} onRetry={onRetry} />;
  return <ScopeChooser chooser={chooser} />;
}

/**
 * Đang tải: giữ NGUYÊN hình dạng của trang sắp hiện ra, thay vì một dòng chữ giữa màn hình.
 *
 * Sau `SLOW_MS` mới thêm một dòng nhắc kèm nút thử lại — không phải để doạ, mà để cái treo
 * vĩnh viễn có đường thoát.
 */
function ScopeLoading({ onRetry }: { onRetry?: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Đang xác định phạm vi dữ liệu</span>
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-7 w-24" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {Array.from({ length: 8 }, (_, row) => <Skeleton key={row} className="h-9 w-full shrink-0" />)}
      </div>
      {slow ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">Việc xác định phạm vi dữ liệu đang lâu hơn bình thường.</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-4" aria-hidden="true" /> Thử lại
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ScopeError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md rounded-xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold">Không xác định được phạm vi dữ liệu</h1>
            <p className="mt-1.5 break-words text-sm leading-6 text-muted-foreground" role="alert">
              {message || "Máy chủ không trả lời khi lấy danh sách công ty/kho/năm tài chính."}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Dữ liệu chưa được đọc hay ghi gì, nên thử lại là an toàn.
            </p>
            {onRetry ? (
              <Button type="button" className="mt-4" onClick={onRetry}>
                <RefreshCw className="size-4" aria-hidden="true" /> Thử lại
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopeChooser({ chooser }: { chooser?: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center">
        <h1 className="font-semibold">Cần chọn phạm vi dữ liệu</h1>
        <p className="mt-2 text-sm text-muted-foreground">Chọn phạm vi ở thanh trên để tiếp tục.</p>
        {chooser ? <div className="mt-4">{chooser}</div> : null}
      </div>
    </div>
  );
}
