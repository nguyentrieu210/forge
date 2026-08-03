import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, Factory, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { Button, Input, Label, toast } from "@metaforge/ui";
import { ForgeBrandLogo } from "../BrandLogo.js";
import { useT } from "../i18n/index.js";
import { AuthVisualStyles } from "./AuthPresentation.js";

export interface LoginFormProps {
  adapter: FrappeAdapter;
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
  brand?: string;
  brandMark?: ReactNode;
  onForgotPassword?: () => void;
  /** Render only the credential panel when another public surface owns the page layout. */
  embedded?: boolean;
}

type LoginError = {
  message: string;
  kind?: string;
};

function BrandMark({ brandMark, size = 42 }: { brandMark?: ReactNode; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-current/10"
      style={{ width: size + 12, height: size + 12 }}
    >
      {brandMark ?? <ForgeBrandLogo size={size} />}
    </span>
  );
}

function AuthSignalField() {
  const nodes = [
    ["16%", "20%"], ["34%", "28%"], ["59%", "18%"], ["76%", "34%"],
    ["22%", "56%"], ["46%", "49%"], ["69%", "63%"], ["84%", "72%"],
  ] as const;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="mf-auth-grid absolute inset-0 opacity-75" />
      <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 1000 760" preserveAspectRatio="none">
        <path d="M-20 520 C 160 390, 260 610, 420 450 S 710 220, 1040 330" fill="none" stroke="var(--forge-primary, #e52521)" strokeWidth="1.25" strokeDasharray="9 12" />
        <path d="M-40 610 C 220 720, 370 470, 540 570 S 790 700, 1040 490" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1" />
        <path d="M120 -20 C 260 170, 320 220, 530 250 S 810 170, 940 30" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
      </svg>
      {nodes.map(([left, top], index) => (
        <span
          key={`${left}-${top}`}
          className="mf-auth-node absolute size-1.5 rounded-full"
          style={{ left, top, background: index % 3 === 0 ? "var(--forge-primary, #e52521)" : "rgba(255,255,255,.48)" }}
        />
      ))}
      <div
        className="absolute -left-20 top-[14%] h-80 w-80 rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--forge-primary, #e52521) 14%, transparent)" }}
      />
    </div>
  );
}

export function LoginForm({
  adapter,
  onSuccess,
  title,
  subtitle,
  brand,
  brandMark,
  onForgotPassword,
  embedded = false,
}: LoginFormProps) {
  const t = useT();
  const resolvedBrand = brand ?? "Forge";
  const resolvedTitle = title ?? t("auth.title");
  const resolvedSubtitle = subtitle ?? t("auth.subtitle");
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);

  useEffect(() => {
    if (embedded) return;
    const previous = document.title;
    document.title = `${resolvedBrand} — Đăng nhập`;
    return () => { document.title = previous; };
  }, [embedded, resolvedBrand]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!usr || !pwd || busy) return;
    setError(null);
    setBusy(true);
    try {
      await adapter.login(usr, pwd);
      onSuccess();
    } catch (caught) {
      const mapped = adapter.mapError(caught);
      setError({ message: mapped.message, kind: mapped.kind });
      toast.error(mapped.message);
    } finally {
      setBusy(false);
    }
  };

  const formPanel = (
    <div className="mf-auth-panel-enter w-full max-w-[430px]" data-testid="forge-auth-login-panel">
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <BrandMark brandMark={brandMark} size={34} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-[-0.025em]">{resolvedBrand}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Enterprise workspace</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--forge-primary, #e52521)" }}>
          <span className="h-px w-6" style={{ background: "currentColor" }} />
          Forge workspace
        </div>
        <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-[2.15rem]">{resolvedTitle}</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{resolvedSubtitle}</p>
      </div>

      <form onSubmit={submit} className="mf-auth-form space-y-5" aria-busy={busy || undefined}>
        <div className="space-y-2">
          <Label htmlFor="mf-login-usr" className="text-xs font-semibold">{t("auth.username")}</Label>
          <div className="relative">
            <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="mf-login-usr"
              value={usr}
              onChange={(event) => setUsr(event.target.value)}
              placeholder={t("auth.username_placeholder")}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={!embedded}
              disabled={busy}
              className="h-11 rounded-lg bg-background pl-10 pr-3.5"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="mf-login-pwd" className="text-xs font-semibold">{t("auth.password")}</Label>
            {onForgotPassword ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onForgotPassword} disabled={busy}>
                Quên mật khẩu?
              </Button>
            ) : null}
          </div>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="mf-login-pwd"
              type={showPassword ? "text" : "password"}
              value={pwd}
              onChange={(event) => setPwd(event.target.value)}
              autoComplete="current-password"
              disabled={busy}
              className="h-11 rounded-lg bg-background pl-10 pr-11"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "mf-login-error" : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
              disabled={busy}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>

        {error ? (
          <div
            id="mf-login-error"
            className="mf-auth-error-reveal rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
            role="alert"
            aria-live="assertive"
          >
            <p className="font-semibold">{error.kind === "auth" ? "Không thể đăng nhập" : "Không thể kết nối"}</p>
            <p className="mt-1 text-[13px] leading-5 opacity-90">{error.message}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          className="mf-auth-primary-button h-11 w-full rounded-lg font-semibold"
          disabled={busy || !usr || !pwd}
          data-testid="forge-auth-submit"
        >
          {busy ? (
            <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t("auth.submitting")}</>
          ) : (
            <>{t("auth.submit")} <ArrowRight className="size-4" aria-hidden="true" /></>
          )}
        </Button>
      </form>

      <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5 text-[11px] text-muted-foreground">
        <span>Forge V3</span>
        <span className="text-right">Enterprise Operating Platform</span>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="mf-auth-root w-full" data-testid="forge-auth-login" data-auth-layout="embedded">
        <AuthVisualStyles />
        <div className="mx-auto w-full max-w-[470px] rounded-xl border bg-card p-6 shadow-lg sm:p-8">{formPanel}</div>
      </div>
    );
  }

  return (
    <main
      className="mf-auth-root grid min-h-[100svh] overflow-hidden bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,.92fr)]"
      data-testid="forge-auth-login"
      data-auth-layout="split"
    >
      <AuthVisualStyles />
      <section className="mf-auth-visual relative hidden min-h-[100svh] overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <AuthSignalField />
        <div className="mf-auth-brand-reveal relative z-10 flex items-center gap-3">
          <BrandMark brandMark={brandMark} size={38} />
          <div>
            <p className="text-lg font-semibold tracking-[-0.025em]">{resolvedBrand}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/[0.42]">Enterprise Operating Platform</p>
          </div>
        </div>

        <div className="mf-auth-brand-reveal relative z-10 max-w-xl pb-8 xl:pb-14">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/[0.48]">
            <span className="size-1.5 rounded-full" style={{ background: "var(--forge-primary, #e52521)" }} />
            Forge Vben Next
          </div>
          <h2 className="max-w-lg text-4xl font-semibold leading-[1.04] tracking-[-0.05em] xl:text-[3.35rem]">
            Một workspace cho dữ liệu, quy trình và vận hành doanh nghiệp.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/[0.58] xl:text-[15px]">
            Giao diện tập trung cho công việc hằng ngày, giữ nguyên quyền hạn và dữ liệu từ hệ thống Forge phía sau.
          </p>

          <div className="mt-9 grid max-w-lg gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-3">
            {[
              ["01", "Metadata runtime"],
              ["02", "Enterprise controls"],
              ["03", "Cloud execution"],
            ].map(([index, label]) => (
              <div key={index} className="bg-black/[0.35] px-4 py-4 backdrop-blur-sm">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-white/[0.30]">{index}</p>
                <p className="mt-2 text-xs font-medium text-white/[0.74]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.16em] text-white/[0.32]">
          <span>Forge Workspace</span>
          <span className="flex items-center gap-1.5"><Factory className="size-3" aria-hidden="true" /> Built for operations</span>
        </div>
      </section>

      <section
        className="relative flex min-h-[100svh] items-center justify-center overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 lg:px-10 xl:px-14"
        style={{ background: "var(--forge-surface, var(--background, #ffffff))" }}
      >
        <div
          className="pointer-events-none absolute right-0 top-0 h-40 w-40 opacity-30"
          style={{ background: "linear-gradient(135deg, transparent 48%, color-mix(in srgb, var(--forge-primary, #e52521) 16%, transparent) 49%, transparent 50%)" }}
          aria-hidden="true"
        />
        {formPanel}
      </section>
    </main>
  );
}
