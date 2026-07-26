/**
 * LoginForm — form đăng nhập MẶC ĐỊNH dùng chung (P1-AUTH-01). adapter.login() đổi session
 * cookie (Frappe set-cookie khi thành công) — KHÔNG có bí mật API phía trình duyệt. App sinh ra
 * (create-metaforge-app) dùng thẳng component này; app tự branding (như apps/demo) có thể thay
 * bằng UI riêng và chỉ cần gọi `adapter.login()` + `onSuccess`.
 */
import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { cn, Button, Input, Label, toast } from "@metaforge/ui";
import { useT } from "../i18n/index.js";

export interface LoginFormProps {
  adapter: FrappeAdapter;
  /** Gọi sau khi login THÀNH CÔNG — thường là `retry` của AuthBoundary để tải lại boot ngay. */
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
}

export function LoginForm({ adapter, onSuccess, title, subtitle }: LoginFormProps) {
  const t = useT();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!usr || !pwd || busy) return;
    setBusy(true);
    try {
      await adapter.login(usr, pwd);
      onSuccess();
    } catch (err) {
      toast.error(adapter.mapError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mf-login-page grid min-h-screen place-items-center p-4 sm:p-6">
      <form onSubmit={submit} className="mf-login-card w-full max-w-[380px]">
        <div className="space-y-5 px-7 py-8 sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="mf-brand-mark size-9 rounded-[10px] text-base">M</div>
            <span className="text-[17px] font-bold tracking-[-0.01em]">MetaForge</span>
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
              <Input
                id="mf-login-pwd"
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="current-password"
                className="h-10 rounded-lg"
              />
            </div>
          </div>

          <Button type="submit" className={cn("h-10 w-full rounded-lg text-[13.5px] font-semibold")} disabled={busy || !usr || !pwd}>
            <LogIn /> {busy ? t("auth.submitting") : t("auth.submit")}
          </Button>
        </div>
        <div className="border-t bg-secondary/55 px-4 py-3 text-center text-[10px] text-muted-foreground">
          Cookie session · CSRF protected · Frappe v16
        </div>
      </form>
    </div>
  );
}
