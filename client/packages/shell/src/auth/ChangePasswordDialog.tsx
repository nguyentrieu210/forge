/** @jsxImportSource react */
/**
 * ChangePasswordDialog — "Đổi mật khẩu" từ menu tài khoản (ERPNext Desk có sẵn, MetaForge trước đây
 * KHÔNG có UI nào gọi tới dù adapter.updatePassword() đã tồn tại sẵn từ lâu, không nơi nào dùng).
 * Gọi thẳng adapter.updatePassword() → frappe.core.doctype.user.user.update_password THẬT.
 */
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, Label, Checkbox, toast } from "@metaforge/ui";
import { useT } from "../i18n/index.js";

export interface ChangePasswordDialogProps {
  adapter: FrappeAdapter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ adapter, open, onOpenChange }: ChangePasswordDialogProps) {
  const t = useT();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [logoutAll, setLogoutAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setOldPassword(""); setNewPassword(""); setConfirm(""); setLogoutAll(false); };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error(t("account.password_too_short")); return; }
    if (newPassword !== confirm) { toast.error(t("account.password_mismatch")); return; }
    setSaving(true);
    try {
      await adapter.updatePassword(newPassword, { oldPassword, logoutAll: logoutAll ? 1 : 0 });
      toast.success(t("account.password_updated"));
      reset();
      onOpenChange(false);
    } catch (e2) {
      toast.error(adapter.mapError(e2).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" /> {t("account.change_password")}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="mf-cp-old">{t("account.current_password")}</Label>
            <Input id="mf-cp-old" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mf-cp-new">{t("account.new_password")}</Label>
            <Input id="mf-cp-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mf-cp-confirm">{t("account.confirm_password")}</Label>
            <Input id="mf-cp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          <label className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
            <Checkbox checked={logoutAll} onCheckedChange={(v) => setLogoutAll(Boolean(v))} />
            {t("account.logout_all_sessions")}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? t("common.loading") : t("account.change_password")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
