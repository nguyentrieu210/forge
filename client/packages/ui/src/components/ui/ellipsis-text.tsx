import * as React from "react";
import { cn } from "../../lib/cn.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.js";

/**
 * Chữ dài bị cắt, và CHỈ khi bị cắt mới có tooltip.
 *
 * Dịch ý từ vben `common-ui/src/components/ellipsis-text` (`tooltipWhenEllipsis`). Điểm mấu
 * chốt nằm ở chữ "chỉ khi": gắn tooltip cho mọi ô thì phần lớn tooltip lặp lại đúng chữ đang
 * hiện, và người dùng học được rằng tooltip vô dụng nên thôi không rê chuột nữa — đến lúc có
 * ô bị cắt thật thì họ cũng không tra.
 *
 * Trong ERP tiếng Việt chuyện này gặp liên tục: "Nhôm hệ 4200 cây 6m màu ghi mờ" trong một cột
 * rộng 12rem. Không có cách xem đủ thì người dùng phải mở từng bản ghi ra để đọc một cái tên.
 *
 * Cách đo: so `scrollWidth` với `clientWidth` (một dòng) hoặc `scrollHeight`/`clientHeight`
 * (nhiều dòng), đo lại khi kích thước đổi bằng `ResizeObserver` — cắt hay không phụ thuộc bề
 * rộng cột, mà cột thì kéo được.
 */
export function EllipsisText({
  children,
  lines = 1,
  className,
  tooltipClassName,
  ...rest
}: {
  children: React.ReactNode;
  /** Số dòng trước khi cắt. 1 = cắt một dòng, >1 = cắt nhiều dòng. */
  lines?: number;
  className?: string;
  tooltipClassName?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setTruncated(lines > 1 ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, lines]);

  const text = (
    <span
      ref={ref}
      className={cn(
        "block min-w-0",
        lines > 1 ? "overflow-hidden" : "truncate",
        className,
      )}
      style={lines > 1 ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" } : undefined}
      {...rest}
    >
      {children}
    </span>
  );

  if (!truncated) return text;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{text}</TooltipTrigger>
        {/* `max-w` để một tên 200 ký tự không thành một dải chữ chạy hết màn hình. */}
        <TooltipContent side="top" className={cn("max-w-[min(28rem,80vw)] whitespace-normal break-words", tooltipClassName)}>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
