/**
 * LoginForm — form đăng nhập MẶC ĐỊNH dùng chung (P1-AUTH-01). adapter.login() đổi session
 * cookie (Frappe set-cookie khi thành công) — KHÔNG có bí mật API phía trình duyệt. App sinh ra
 * (create-metaforge-app) dùng thẳng component này; app tự branding (như apps/demo) có thể thay
 * bằng UI riêng và chỉ cần gọi `adapter.login()` + `onSuccess`.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { cn, Button, Input, Label, toast } from "@metaforge/ui";
import { useT } from "../i18n/index.js";

export interface LoginFormProps {
  adapter: FrappeAdapter;
  /** Gọi sau khi login THÀNH CÔNG — thường là `retry` của AuthBoundary để tải lại boot ngay. */
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
  brand?: string;
  brandMark?: ReactNode;
  onForgotPassword?: () => void;
  /** Render only the form card so a product landing page can place it inside a Dialog. */
  embedded?: boolean;
}

export function LoginForm({ adapter, onSuccess, title, subtitle, brand = "MetaForge", brandMark, onForgotPassword, embedded = false }: LoginFormProps) {
  const t = useT();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!usr || !pwd || busy) return;
    setError(null);
    setBusy(true);
    try {
      await adapter.login(usr, pwd);
      onSuccess();
    } catch (err) {
      const message = adapter.mapError(err).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const form = (
      <form onSubmit={submit} className={cn("w-full max-w-[380px] overflow-hidden", embedded ? "mx-auto" : "mf-login-card")}>
        <div className="space-y-5 px-7 py-8 sm:px-8">
          <div className="flex items-center gap-2.5">
            {brandMark ? <div className="grid size-9 place-items-center overflow-hidden rounded-[10px]">{brandMark}</div> : <div className="mf-brand-mark size-9 rounded-[10px] text-base">{brand.trim().charAt(0).toUpperCase()}</div>}
            <span className="text-[17px] font-bold tracking-[-0.01em]">{brand}</span>
          </div>

          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{title ?? t("auth.title")}</h1>
            <p className="mf-login-site mt-1">{subtitle ?? t("auth.subtitle")}</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mf-login-usr" className="text-[11px] font-medium text-muted-foreground">{t("auth.username")}</Label>
              <Input
                id="mf-login-usr"
                value={usr}
                onChange={(e) => setUsr(e.target.value)}
                placeholder={t("auth.username_placeholder")}
                autoComplete="username"
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mf-login-pwd" className="text-[11px] font-medium text-muted-foreground">{t("auth.password")}</Label>
              <div className="relative">
                <Input
                  id="mf-login-pwd"
                  type={showPassword ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="current-password"
                  className="h-10 rounded-lg pr-11"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "mf-login-error" : undefined}
                />
                <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? <EyeOff /> : <Eye />}</Button>
              </div>
              {onForgotPassword ? <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onForgotPassword}>Quên mật khẩu?</Button> : null}
            </div>
          </div>

          {error ? <div id="mf-login-error" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive" role="alert">{error}</div> : null}

          <Button type="submit" className={cn("h-10 w-full rounded-lg text-[13.5px] font-semibold")} disabled={busy || !usr || !pwd}>
            <LogIn /> {busy ? t("auth.submitting") : t("auth.submit")}
          </Button>
        </div>
        <div className="border-t bg-secondary/55 px-4 py-3 text-center text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Phiên đăng nhập được bảo vệ an toàn</span>
        </div>
      </form>
  );
  return embedded ? form : <div className="mf-login-page grid min-h-screen place-items-center p-4 sm:p-6">{form}</div>;
}
