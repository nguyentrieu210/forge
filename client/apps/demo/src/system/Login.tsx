import { useState } from "react";
import { LogIn } from "lucide-react";
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";
import { cn, Button, Input, Label, toast } from "@metaforge/ui";
import { useT } from "@metaforge/shell";

// base same-origin theo BASE_URL: dev "/"→"" ; build --base=/wms/ → "/wms" ⇒ SDK gọi /wms/api/…
const adapter = new FrappeAdapterImpl({ url: import.meta.env.BASE_URL.replace(/\/$/, "") });

/**
 * LoginScreen (M-Login) — đăng nhập session (adapter.login → cookie). Đứng NGOÀI Bootstrap
 * (chưa cần boot). Demo token-proxy đã auth sẵn nên màn này minh hoạ luồng; login thật đổi cookie.
 */
export function LoginScreen() {
  const t = useT();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usr || !pwd) return;
    setBusy(true);
    try {
      await adapter.login(usr, pwd);
      toast.success(t("auth.success"));
      location.href = import.meta.env.BASE_URL; // về gốc app (dev "/"; build /wms/)
    } catch (err) {
      toast.error(adapter.mapError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">MF</div>
          <div>
            <div className="font-semibold">{t("auth.title")}</div>
            <div className="text-xs text-muted-foreground">{t("auth.subtitle")}</div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="usr">{t("auth.username")}</Label>
          <Input id="usr" value={usr} onChange={(e) => setUsr(e.target.value)} placeholder={t("auth.username_placeholder")} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pwd">{t("auth.password")}</Label>
          <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
        </div>

        <Button type="submit" className={cn("w-full")} disabled={busy || !usr || !pwd}>
          <LogIn /> {busy ? t("auth.submitting") : t("auth.submit")}
        </Button>
      </form>
    </div>
  );
}
