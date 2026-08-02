import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../../lib/cn.js";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * Một vùng cuộn có còn đi được theo delta này hay không.
 * Tách thành hàm thuần để regression test được cả đầu, giữa và cuối danh sách.
 */
export function canConsumeScrollDelta(offset: number, viewport: number, extent: number, delta: number): boolean {
  if (!Number.isFinite(delta) || delta === 0 || extent <= viewport) return false;
  if (delta < 0) return offset > 0;
  return offset + viewport < extent - 1;
}

function overflowAllowsScroll(element: HTMLElement, axis: "x" | "y"): boolean {
  const style = getComputedStyle(element);
  const value = axis === "x" ? style.overflowX : style.overflowY;
  return value === "auto" || value === "scroll" || value === "overlay";
}

function elementCanConsumeWheel(element: HTMLElement, deltaX: number, deltaY: number): boolean {
  const canX = deltaX !== 0
    && overflowAllowsScroll(element, "x")
    && canConsumeScrollDelta(element.scrollLeft, element.clientWidth, element.scrollWidth, deltaX);
  const canY = deltaY !== 0
    && overflowAllowsScroll(element, "y")
    && canConsumeScrollDelta(element.scrollTop, element.clientHeight, element.scrollHeight, deltaY);
  return canX || canY;
}

/** Trả đúng phần tử trong dropdown còn có thể tiêu thụ wheel. */
function popoverWheelTarget(
  content: HTMLElement,
  target: EventTarget | null,
  deltaX: number,
  deltaY: number,
): HTMLElement | undefined {
  let node: Element | null = target instanceof Element ? target : null;
  while (node && content.contains(node)) {
    if (node instanceof HTMLElement && elementCanConsumeWheel(node, deltaX, deltaY)) return node;
    if (node === content) break;
    node = node.parentElement;
  }
  return undefined;
}

function triggerForContent(content: HTMLElement): HTMLElement | undefined {
  if (!content.id || typeof document === "undefined") return undefined;
  return Array.from(document.querySelectorAll<HTMLElement>("[aria-controls]"))
    .find((candidate) => candidate.dataset.state === "open" && candidate.getAttribute("aria-controls") === content.id);
}

/**
 * Link dropdown dùng Portal nên không còn là DOM con của bảng. Khi dropdown chạm đầu/cuối,
 * trình duyệt chỉ biết cuộn body; vùng child grid thật nằm ở nhánh DOM của trigger.
 * Tìm scroll ancestor từ trigger để trả wheel về đúng bảng.
 */
function childGridScrollTarget(trigger: HTMLElement, deltaX: number, deltaY: number): HTMLElement | undefined {
  const grid = trigger.closest<HTMLElement>(".mf-grid");
  if (!grid) return undefined;

  let node: HTMLElement | null = trigger.parentElement;
  while (node) {
    if (elementCanConsumeWheel(node, deltaX, deltaY)) return node;
    if (node === grid) break;
    node = node.parentElement;
  }
  return undefined;
}

function wheelPixels(event: React.WheelEvent<HTMLElement>): { deltaX: number; deltaY: number } {
  const factor = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? Math.max(event.currentTarget.clientHeight, 1)
      : 1;
  return { deltaX: event.deltaX * factor, deltaY: event.deltaY * factor };
}

function scrollByWheel(target: HTMLElement, deltaX: number, deltaY: number): void {
  target.scrollBy({ left: deltaX, top: deltaY, behavior: "auto" });
}

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = "start", sideOffset = 5, onWheel, ...props }, ref) {
  const contentRef = React.useRef<React.ElementRef<typeof PopoverPrimitive.Content>>(null);
  React.useImperativeHandle(ref, () => contentRef.current as React.ElementRef<typeof PopoverPrimitive.Content>);

  /**
   * Link combobox nằm trong form/bảng cuộn. Để Radix tự reposition khi vùng cha cuộn làm menu
   * "đuổi theo" ô nhập xuyên qua màn hình, vừa rối mắt vừa dễ chọn nhầm. Với Link, cuộn bên
   * ngoài dropdown có nghĩa là user đã rời thao tác chọn: đóng ngay. Cuộn chính danh sách trong
   * dropdown vẫn được giữ nguyên.
   */
  React.useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof document === "undefined") return;
    const trigger = triggerForContent(content);
    if (!trigger?.classList.contains("mf-link")) return;

    const closeOnExternalScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && content.contains(target)) return;
      if (trigger.dataset.state !== "open") return;
      trigger.click();
    };

    document.addEventListener("scroll", closeOnExternalScroll, true);
    return () => document.removeEventListener("scroll", closeOnExternalScroll, true);
  }, []);

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={contentRef}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // max-h theo biến Radix: popover dài (danh sách dài) trước đây tràn khỏi màn hình.
          "z-50 max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto rounded-lg border border-border/80 bg-popover p-3 text-popover-foreground shadow-lg outline-none",
          // `animate-in` trần không tạo hiệu ứng nào; thêm fade+zoom và slide theo phía mở ra.
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
          className,
        )}
        onWheel={(event) => {
          // Radix Dialog/RemoveScroll có thể preventDefault ở capture phase trước khi React
          // nhận event. Khi đó dựa vào cuộn mặc định của trình duyệt sẽ không làm gì, dù kéo
          // thanh scrollbar bằng chuột vẫn hoạt động. Chỉ tôn trọng preventDefault do chính
          // callback của caller tạo ra; nếu event đã bị lớp ngoài chặn, ta cuộn thủ công.
          const preventedBeforeCaller = event.defaultPrevented;
          onWheel?.(event);
          if (!preventedBeforeCaller && event.defaultPrevented) return;

          const content = event.currentTarget;
          const { deltaX, deltaY } = wheelPixels(event);
          const dropdownTarget = popoverWheelTarget(content, event.target, deltaX, deltaY);
          if (dropdownTarget) {
            event.preventDefault();
            event.stopPropagation();
            scrollByWheel(dropdownTarget, deltaX, deltaY);
            return;
          }

          const trigger = triggerForContent(content);
          const gridTarget = trigger ? childGridScrollTarget(trigger, deltaX, deltaY) : undefined;
          if (!gridTarget) return;

          // Dropdown Link đã hết chỗ cuộn mà user tiếp tục wheel => đóng trước rồi mới cuộn bảng.
          // Không để popover mở và chạy theo trigger trong lúc bảng di chuyển.
          if (trigger?.classList.contains("mf-link")) trigger.click();
          event.preventDefault();
          event.stopPropagation();
          scrollByWheel(gridTarget, deltaX, deltaY);
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
