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
import { PanelRight, ArrowLeft, X } from "lucide-react";
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
  const [contextOpen, setContextOpen] = useState(true); // desktop: cột phải (mặc định hiện)
  const [sheetOpen, setSheetOpen] = useState(false);    // tablet/mobile: Sheet (mặc định ĐÓNG)

  // Esc: đóng context trước → rồi detail (§3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (bp !== "desktop" && sheetOpen) { setSheetOpen(false); return; }
      if (bp === "desktop" && hasContext && contextOpen) { setContextOpen(false); return; }
      if (props.hasDetail) props.onCloseDetail?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bp, hasContext, contextOpen, sheetOpen, props.hasDetail, props]);

  // ── Không có detail → list full ─────────────────────────────────────────────
  if (!props.hasDetail) return <div className="mf-split h-full">{props.list}</div>;

  // ── Desktop ≥1280: 3 cột resizable ─────────────────────────────────────────
  if (bp === "desktop") {
    return (
      <ResizablePanelGroup direction="horizontal" autoSaveId={props.autoSaveId ?? "mf-split"} className="mf-split h-full">
        <ResizablePanel defaultSize={34} minSize={24} maxSize={45} className="min-w-0">
          {props.list}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={contextOpen && hasContext ? 48 : 66} minSize={30} className="min-w-0">
          <div className="relative h-full">
            {/* Nút đóng chi tiết. Trước đây CHỈ màn hẹp mới có nút quay lại; trên desktop/tablet
                người dùng mở một bản ghi rồi không có cách nào đóng nó — danh sách vẫn thấy đấy
                nhưng không bỏ được chế độ chia đôi để xem danh sách toàn màn hình. */}
            {/* z-30: header của FormView là sticky z-20 kèm nền mờ nên nút z-10 bị đè hoàn toàn.
                Form đã có nút X riêng trong header; nút này phục vụ các loại detail khác. */}
            <div className="absolute right-2 top-2 z-30 flex gap-1">
              {hasContext && !contextOpen ? (
                <Button variant="outline" size="icon-sm" onClick={() => setContextOpen(true)} aria-label={t("split.open_activity")}>
                  <PanelRight />
                </Button>
              ) : null}
              {props.onCloseDetail ? (
                <Button variant="outline" size="icon-sm" onClick={props.onCloseDetail} aria-label={t("split.list")}>
                  <X />
                </Button>
              ) : null}
            </div>
            {props.detail}
          </div>
        </ResizablePanel>
        {hasContext && contextOpen ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={18} minSize={16} maxSize={30} className="min-w-0">
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
        <div className="w-[320px] shrink-0 overflow-hidden border-r">{props.list}</div>
        <div className="relative min-w-0 flex-1">
          {/* z-30: header của FormView là sticky z-20 kèm nền mờ nên nút z-10 bị đè hoàn toàn.
                Form đã có nút X riêng trong header; nút này phục vụ các loại detail khác. */}
            <div className="absolute right-2 top-2 z-30 flex gap-1">
            {hasContext ? (
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                <PanelRight /> {t("split.activity")}
              </Button>
            ) : null}
            {props.onCloseDetail ? (
              <Button variant="outline" size="icon-sm" onClick={props.onCloseDetail} aria-label={t("split.list")}>
                <X />
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
      <SheetContent side="right" className="w-[360px] p-0">
        <SheetHeader className="border-b px-3 py-2.5">
          <SheetTitle className="text-sm">{title ?? t("split.activity")}</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100%-3rem)] overflow-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
