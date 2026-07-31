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

/** Dropdown còn tự cuộn được thì không được giành wheel của nó. */
function popoverCanConsumeWheel(content: HTMLElement, target: EventTarget | null, deltaX: number, deltaY: number): boolean {
  let node: Element | null = target instanceof Element ? target : null;
  while (node && content.contains(node)) {
    if (node instanceof HTMLElement && elementCanConsumeWheel(node, deltaX, deltaY)) return true;
    if (node === content) break;
    node = node.parentElement;
  }
  return false;
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

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, onWheel, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // max-h theo biến Radix: popover dài (danh sách dài) trước đây tràn khỏi màn hình.
        "z-50 max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none",
        // `animate-in` trần không tạo hiệu ứng nào; thêm fade+zoom và slide theo phía mở ra.
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
        className,
      )}
      onWheel={(event) => {
        onWheel?.(event);
        if (event.defaultPrevented) return;

        const content = event.currentTarget;
        const { deltaX, deltaY } = wheelPixels(event);
        if (popoverCanConsumeWheel(content, event.target, deltaX, deltaY)) return;

        const trigger = triggerForContent(content);
        const target = trigger ? childGridScrollTarget(trigger, deltaX, deltaY) : undefined;
        if (!target) return;

        event.preventDefault();
        event.stopPropagation();
        target.scrollBy({ left: deltaX, top: deltaY, behavior: "auto" });
      }}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
