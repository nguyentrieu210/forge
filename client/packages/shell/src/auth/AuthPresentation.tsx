import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@metaforge/ui";
import { ForgeBrandLogo } from "../BrandLogo.js";

const AUTH_STYLES = `
  /* Mặt đăng nhập cố ý TỐI ở cả light lẫn dark: nó là một mặt thương hiệu toàn màn, không phải
   * một trang trong workspace, và mọi chữ trên nó đều là trắng. Vì thế ba giá trị nền dưới đây
   * KHÔNG lấy từ bảng token theo theme — chúng là hằng số của riêng màn này.
   *
   * Trước đây chúng được viết là \`var(--forge-black, #090909)\` v.v., nhưng \`--forge-black\`,
   * \`--forge-graphite\` và \`--forge-font-sans\` chưa từng được khai ở bất kỳ đâu trong repo —
   * nên phần \`var()\` luôn trượt và giá trị thật luôn là cái hex dự phòng. Đặt tên đàng hoàng
   * ở đây để thứ đang thực sự chạy nhìn thấy được. */
  :root {
    --mf-auth-ground: #090909;
    --mf-auth-ground-soft: #111317;
    --mf-auth-ground-deep: #08090b;
    --mf-auth-alert: #7f1d1d;
    --mf-auth-alert-mark: #fca5a5;
  }

  .mf-auth-root {
    font-family: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--foreground);
  }

  .mf-auth-visual {
    background:
      radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 26rem),
      linear-gradient(145deg, var(--mf-auth-ground), var(--mf-auth-ground-soft) 58%, var(--mf-auth-ground-deep));
  }

  .mf-auth-grid {
    background-image:
      linear-gradient(color-mix(in srgb, white 7%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, white 7%, transparent) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: linear-gradient(to bottom, transparent, black 18%, black 78%, transparent);
    animation: mf-auth-grid-drift 18s linear infinite;
  }

  .mf-auth-brand-reveal {
    animation: mf-auth-brand-reveal var(--mf-motion-data) var(--mf-ease-enter) both;
  }

  .mf-auth-panel-enter {
    animation: mf-auth-panel-enter var(--mf-motion-workspace) var(--mf-ease-enter) both;
  }

  .mf-auth-error-reveal {
    animation: mf-auth-error-reveal var(--mf-motion-micro-slow) var(--mf-ease-enter) both;
  }

  .mf-auth-notice-reveal {
    animation: mf-auth-notice-reveal var(--mf-motion-micro-slow) var(--mf-ease-enter) both;
  }

  .mf-auth-node {
    animation: mf-auth-node-float 5.6s var(--mf-ease-standard) infinite alternate;
  }

  .mf-auth-node:nth-child(2n) { animation-delay: -1.8s; }
  .mf-auth-node:nth-child(3n) { animation-delay: -3.1s; }

  .mf-auth-primary-button {
    background: var(--primary) !important;
    color: #fff !important;
    border-color: var(--primary) !important;
    box-shadow: 0 10px 28px color-mix(in srgb, var(--primary) 22%, transparent);
    transition:
      background-color var(--mf-motion-micro) var(--mf-ease-standard),
      transform var(--mf-motion-micro) var(--mf-ease-standard),
      box-shadow var(--mf-motion-micro) var(--mf-ease-standard);
  }

  .mf-auth-primary-button:hover:not(:disabled) {
    background: var(--primary-hover) !important;
    transform: translateY(-1px);
    box-shadow: 0 14px 32px color-mix(in srgb, var(--primary) 28%, transparent);
  }

  .mf-auth-primary-button:active:not(:disabled) {
    background: var(--primary-active) !important;
    transform: translateY(0);
  }

  .mf-auth-primary-button:disabled {
    box-shadow: none;
  }

  .mf-auth-form input {
    transition:
      border-color var(--mf-motion-micro) var(--mf-ease-standard),
      box-shadow var(--mf-motion-micro) var(--mf-ease-standard),
      background-color var(--mf-motion-micro) var(--mf-ease-standard);
  }

  .mf-auth-form input:focus-visible {
    border-color: var(--ring);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 14%, transparent);
  }

  .mf-auth-form input:-webkit-autofill,
  .mf-auth-form input:-webkit-autofill:hover,
  .mf-auth-form input:-webkit-autofill:focus {
    -webkit-text-fill-color: var(--foreground);
    -webkit-box-shadow: 0 0 0 1000px var(--card) inset;
    transition: background-color 9999s ease-out 0s;
  }

  .mf-auth-boot-mark {
    animation: mf-auth-boot-pulse 1.4s var(--mf-ease-standard) infinite alternate;
  }

  .mf-auth-progress {
    animation: mf-auth-progress 1.2s var(--mf-ease-standard) infinite;
  }

  @keyframes mf-auth-brand-reveal {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes mf-auth-panel-enter {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes mf-auth-error-reveal {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes mf-auth-notice-reveal {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes mf-auth-grid-drift {
    from { background-position: 0 0, 0 0; }
    to { background-position: 42px 42px, 42px 42px; }
  }

  @keyframes mf-auth-node-float {
    from { transform: translate3d(0, 0, 0); opacity: .36; }
    to { transform: translate3d(0, -7px, 0); opacity: .82; }
  }

  @keyframes mf-auth-boot-pulse {
    from { opacity: .62; transform: scale(.985); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes mf-auth-progress {
    from { transform: translateX(-130%) scaleX(.7); }
    to { transform: translateX(260%) scaleX(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .mf-auth-grid,
    .mf-auth-brand-reveal,
    .mf-auth-panel-enter,
    .mf-auth-error-reveal,
    .mf-auth-node,
    .mf-auth-boot-mark,
    .mf-auth-progress {
      animation: none !important;
      transform: none !important;
    }

    .mf-auth-notice-reveal {
      animation: none !important;
    }

    .mf-auth-primary-button,
    .mf-auth-form input {
      transition-duration: 1ms !important;
    }

    .mf-auth-primary-button:hover:not(:disabled) {
      transform: none;
    }
  }
`;

export function AuthVisualStyles() {
  return <style>{AUTH_STYLES}</style>;
}

export function AuthBootScreen({ label = "Đang kết nối với Forge…" }: { label?: string }) {
  return (
    <div
      className="mf-auth-root fixed inset-0 z-[100] grid min-h-[100svh] place-items-center overflow-hidden px-6 text-white"
      style={{ background: "var(--mf-auth-ground)" }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="forge-auth-boot"
    >
      <AuthVisualStyles />
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="mf-auth-grid absolute inset-0" />
        <div
          className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--primary) 16%, transparent)" }}
        />
      </div>
      <div className="relative flex flex-col items-center text-center">
        <div className="mf-auth-boot-mark grid size-14 place-items-center rounded-xl border border-white/10 bg-white/[0.04] shadow-2xl">
          <ForgeBrandLogo size={38} />
        </div>
        <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.34em] text-white/[0.42]">Forge</div>
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-white/[0.74]">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <div className="mt-5 h-px w-40 overflow-hidden bg-white/10">
          <div className="mf-auth-progress h-full w-1/2" style={{ background: "var(--primary)" }} />
        </div>
      </div>
    </div>
  );
}

export function AuthErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <main
      className="mf-auth-root relative grid min-h-[100svh] place-items-center overflow-hidden px-5 py-10 text-white"
      style={{ background: "var(--mf-auth-ground)" }}
      data-testid="forge-auth-error"
    >
      <AuthVisualStyles />
      <div className="pointer-events-none absolute inset-0 opacity-65"><div className="mf-auth-grid absolute inset-0" /></div>
      <section className="mf-auth-panel-enter relative w-full max-w-md rounded-xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur-xl sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/[0.46]">Forge connection</p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.025em]">Không thể hoàn tất kết nối</h1>
            <p className="mt-2 break-words text-sm leading-6 text-white/[0.64]" role="alert" aria-live="assertive">{message}</p>
          </div>
        </div>
        {onRetry ? (
          <Button type="button" className="mf-auth-primary-button mt-6 h-10 w-full rounded-lg font-semibold" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" /> Thử lại
          </Button>
        ) : null}
        <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/[0.42]">
          <ForgeBrandLogo size={20} />
          <span>Forge Enterprise Workspace</span>
        </div>
      </section>
    </main>
  );
}

export type AuthNoticeKind = "session-expired" | "signed-out";

export function AuthNotice({ kind }: { kind: AuthNoticeKind }) {
  const expired = kind === "session-expired";
  return (
    <div
      className="mf-auth-notice-reveal fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[min(92vw,34rem)] -translate-x-1/2 rounded-lg border px-4 py-3 shadow-xl backdrop-blur-xl"
      style={{
        background: expired
          ? "color-mix(in srgb, var(--mf-auth-alert) 86%, transparent)"
          : "color-mix(in srgb, var(--mf-auth-ground-soft) 90%, transparent)",
        borderColor: expired
          ? "color-mix(in srgb, var(--mf-auth-alert-mark) 26%, transparent)"
          : "color-mix(in srgb, white 13%, transparent)",
        color: "white",
      }}
      role="status"
      aria-live="polite"
      data-testid="forge-auth-notice"
    >
      {/* Tự bơm stylesheet thay vì trông chờ component anh em: `AuthNotice` hiện cạnh
        * `renderGuest()`, mà bảng `--mf-auth-*` lại do `<AuthVisualStyles />` bên trong LoginForm
        * mang tới. Ràng buộc ngầm đó đúng hôm nay và hỏng ngay khi ai đó đổi màn khách. */}
      <AuthVisualStyles />
      <div className="flex items-start gap-3">
        <div className="mt-0.5 size-2 shrink-0 rounded-full" style={{ background: expired ? "var(--mf-auth-alert-mark)" : "var(--primary)" }} />
        <div>
          <p className="text-sm font-semibold">{expired ? "Phiên đăng nhập đã hết hạn" : "Đã đăng xuất"}</p>
          <p className="mt-0.5 text-xs leading-5 text-white/[0.66]">
            {expired ? "Đăng nhập lại để tiếp tục làm việc." : "Bạn có thể đăng nhập lại bằng tài khoản khác."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function HiddenAuthRender({ children }: { children?: ReactNode }) {
  if (children == null) return null;
  return <div hidden>{children}</div>;
}
