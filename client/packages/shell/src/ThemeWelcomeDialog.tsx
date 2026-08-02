import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn,
} from "@metaforge/ui";
import type { ThemeMode } from "./theme.js";
import { BRANDS, useBrand, type BrandMode } from "./brand.js";

const WELCOME_VERSION = "v1";

export interface ThemeWelcomeDialogProps {
  userKey?: string | undefined;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  brandMode?: BrandMode | undefined;
  allowBrandChange?: boolean | undefined;
}

export function ThemeWelcomeDialog(props: ThemeWelcomeDialogProps) {
  const storageKey = useMemo(
    () => `mf-theme-welcome:${WELCOME_VERSION}:${props.userKey?.trim() || "local-user"}`,
    [props.userKey],
  );
  const [brand, setBrand] = useBrand(
    props.allowBrandChange === false ? props.brandMode : undefined,
    props.brandMode ?? "blue",
  );
  const [open, setOpen] = useState(() => {
    if (props.allowBrandChange === false || typeof localStorage === "undefined") return false;
    try { return localStorage.getItem(storageKey) !== "1"; } catch { return false; }
  });

  if (props.allowBrandChange === false) return null;

  const finish = () => {
    try { localStorage.setItem(storageKey, "1"); } catch { /* private mode */ }
    setOpen(false);
  };

  const changeOpen = (next: boolean) => {
    if (!next) finish();
    else setOpen(true);
  };

  const modes: Array<{ id: ThemeMode; label: string; icon: ReactNode }> = [
    { id: "light", label: "Sáng", icon: <Sun className="size-4" /> },
    { id: "dark", label: "Tối", icon: <Moon className="size-4" /> },
    { id: "system", label: "Theo máy", icon: <Monitor className="size-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="w-[min(94vw,36rem)] max-w-none overflow-hidden p-0">
        <div className="border-b bg-gradient-to-br from-primary/[0.10] via-card to-card px-5 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Palette className="size-4" />
              </span>
              Chọn giao diện của bạn
            </DialogTitle>
            <DialogDescription className="pt-1 leading-5">
              Chọn màu nhìn thuận mắt nhất. Mọi thứ đổi ngay để xem thử và vẫn có thể đổi lại ở nút Giao diện trên thanh trên.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Màu chủ đạo</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BRANDS.map((item) => {
                const active = brand === item.id;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant={active ? "secondary" : "outline"}
                    className={cn(
                      "h-11 justify-start gap-2.5 rounded-xl px-3 font-normal",
                      active && "border-primary/35 bg-primary/[0.08] text-foreground ring-1 ring-primary/20",
                    )}
                    onClick={() => setBrand(item.id)}
                  >
                    <span
                      className="size-5 shrink-0 rounded-full border border-black/10 shadow-sm [background:var(--mf-welcome-swatch)]"
                      style={{ "--mf-welcome-swatch": item.swatch } as CSSProperties}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">{item.label}</span>
                    {active ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-xl border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Độ sáng</div>
              <div className="text-xs text-muted-foreground">Có thể để hệ thống tự theo máy.</div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
              {modes.map((mode) => (
                <Button
                  key={mode.id}
                  type="button"
                  variant={props.theme === mode.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                  onClick={() => props.onThemeChange(mode.id)}
                >
                  {mode.icon}{mode.label}
                </Button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t bg-muted/15 px-5 py-3">
          <span className="hidden text-xs text-muted-foreground sm:block">Thiết lập này chỉ cần chọn một lần cho tài khoản trên thiết bị này.</span>
          <Button type="button" className="ml-auto" onClick={finish}>Dùng giao diện này</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
