/** @jsxImportSource react */
/**
 * SplitView (M11-LAYOUT, luật trọng yếu #1) — bố cục 3 cột responsive KHÓA:
 *   ≥1280  : list | detail | context — resizable, LƯU layout (autoSaveId localStorage),
 *            context collapse được; Esc đóng context trước → rồi detail (→ list).
 *   768–1279: list(hẹp) | detail ; context mở bằng Sheet phải.
 *   <768    : 1 pane/lúc — có detail thì detail full + "← Danh sách"; context bằng Sheet.
 * Presentation-only: nhận list/detail/context là node; routing quyết hasDetail. Click dòng ở
 * list → mở detail (KHÔNG chuyển màn) do container set URL ?open / :name, list vẫn hiển thị.
 */
import { useEffect, useState, type ReactNode } from "react";
import { PanelRight, ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
import {
  Button, Sheet, SheetContent, SheetHeader, SheetTitle,
  ResizablePanelGroup, ResizablePanel, ResizableHandle, useT,
} from "@metaforge/ui";

export type Breakpoint = "desktop" | "tablet" | "mobile";

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => compute());
  useEffect(() => {
    const on = () => setBp(compute());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return bp;
}
function compute(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w >= 1280) return "desktop";
  if (w >= 768) return "tablet";
  return "mobile";
}

export interface SplitViewProps {
  list: ReactNode;
  detail?: ReactNode;
  context?: ReactNode;
  hasDetail: boolean;
  contextTitle?: string;
  onCloseDetail?: () => void;
  /** id lưu layout resizable (localStorage). */
  autoSaveId?: string;
}

export function SplitView(props: SplitViewProps) {
  const t = useT();
  const bp = useBreakpoint();
  const hasContext = Boolean(props.context);
  // Chỉ tự mở cột thứ ba khi màn hình thực sự rộng. Ở 1280px, mở đủ 3 cột làm form giữa
  // còn khoảng 470px — hợp lệ về kỹ thuật nhưng không đủ chỗ nhập chứng từ.
  const [contextOpen, setContextOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1600);
  const [sheetOpen, setSheetOpen] = useState(false);    // tablet/mobile: Sheet (mặc định ĐÓNG)
  const [focusMode, setFocusMode] = useState(false);
  const { hasDetail, onCloseDetail } = props;

  useEffect(() => {
    const closeWhenNarrow = () => {
      if (window.innerWidth < 1440) setContextOpen(false);
    };
    window.addEventListener("resize", closeWhenNarrow);
    return () => window.removeEventListener("resize", closeWhenNarrow);
  }, []);

  // Esc: đóng context trước → rồi detail (§3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (bp !== "desktop" && sheetOpen) { setSheetOpen(false); return; }
      if (bp === "desktop" && focusMode) { setFocusMode(false); return; }
      if (bp === "desktop" && hasContext && contextOpen) { setContextOpen(false); return; }
      if (hasDetail) onCloseDetail?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bp, hasContext, contextOpen, focusMode, sheetOpen, hasDetail, onCloseDetail]);

  // ── Không có detail → list full ─────────────────────────────────────────────
  if (!props.hasDetail) {
    return <div className="mf-split mf-split-list-only h-full w-full min-w-0 max-w-none overflow-hidden">{props.list}</div>;
  }

  // ── Desktop ≥1280: 3 cột resizable ─────────────────────────────────────────
  if (bp === "desktop") {
    if (focusMode) {
      return (
        <div className="mf-split relative h-full min-w-0 overflow-hidden">
          <div className="absolute bottom-3 right-3 z-30 flex gap-1 rounded-md bg-card/90 p-1 shadow-sm backdrop-blur">
            {hasContext ? (
              <Button variant="outline" size="icon-sm" onClick={() => setSheetOpen(true)} aria-label={t("split.open_activity")}>
                <PanelRight />
              </Button>
            ) : null}
            <Button variant="outline" size="icon-sm" onClick={() => setFocusMode(false)} aria-label={t("split.exit_focus", "Thoát chế độ tập trung")}>
              <Minimize2 />
            </Button>
          </div>
          {props.detail}
          <ContextSheet open={sheetOpen && hasContext} onOpenChange={setSheetOpen} title={props.contextTitle}>
            {props.context}
          </ContextSheet>
        </div>
      );
    }
    return (
      <ResizablePanelGroup direction="horizontal" autoSaveId={`${props.autoSaveId ?? "mf-split"}:v2`} className="mf-split h-full">
        <ResizablePanel defaultSize={contextOpen && hasContext ? 28 : 32} minSize={22} maxSize={38} className="min-w-0">
          {props.list}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={contextOpen && hasContext ? 54 : 68} minSize={42} className="min-w-0">
          <div className="relative h-full">
            <div className="absolute bottom-3 right-3 z-30 flex gap-1 rounded-md bg-card/90 p-1 shadow-sm backdrop-blur">
              {hasContext && !contextOpen ? (
                <Button variant="outline" size="icon-sm" onClick={() => setContextOpen(true)} aria-label={t("split.open_activity")}>
                  <PanelRight />
                </Button>
              ) : null}
              <Button variant="outline" size="icon-sm" onClick={() => setFocusMode(true)} aria-label={t("split.focus", "Tập trung vào biểu mẫu")}>
                <Maximize2 />
              </Button>
            </div>
            {props.detail}
          </div>
        </ResizablePanel>
        {hasContext && contextOpen ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={18} minSize={18} maxSize={28} className="min-w-0">
              <ContextFrame title={props.contextTitle} onClose={() => setContextOpen(false)}>
                {props.context}
              </ContextFrame>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    );
  }

  // ── Tablet 768–1279: list hẹp | detail ; context = Sheet ───────────────────
  if (bp === "tablet") {
    return (
      <div className="mf-split flex h-full">
        <div className="w-[clamp(15rem,31vw,20rem)] shrink-0 overflow-hidden border-r">{props.list}</div>
        <div className="relative min-w-0 flex-1">
          <div className="absolute bottom-3 right-3 z-30 flex gap-1 rounded-md bg-card/90 p-1 shadow-sm backdrop-blur">
            {hasContext ? (
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                <PanelRight /> {t("split.activity")}
              </Button>
            ) : null}
          </div>
          {props.detail}
        </div>
        <ContextSheet open={sheetOpen && hasContext} onOpenChange={setSheetOpen} title={props.contextTitle}>
          {props.context}
        </ContextSheet>
      </div>
    );
  }

  // ── Mobile <768: 1 pane — detail full + back ; context = Sheet ──────────────
  return (
    <div className="mf-split flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2">
        <Button variant="ghost" size="sm" onClick={props.onCloseDetail}>
          <ArrowLeft /> {t("split.list")}
        </Button>
        {hasContext ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSheetOpen(true)}>
            <PanelRight /> {t("split.activity")}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{props.detail}</div>
      <ContextSheet open={sheetOpen && hasContext} onOpenChange={setSheetOpen} title={props.contextTitle}>
        {props.context}
      </ContextSheet>
    </div>
  );
}

function ContextFrame({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="mf-context-frame flex h-full flex-col overflow-hidden border-l bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">{title ?? t("split.activity")}</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label={t("split.close_activity")}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function ContextSheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title?: string; children: ReactNode }) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(92vw,26rem)] p-0 sm:max-w-[26rem]">
        <SheetHeader className="border-b px-3 py-2.5">
          <SheetTitle className="text-sm">{title ?? t("split.activity")}</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100%-3rem)] overflow-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
