/**
 * resolveFormActions — nút Form suy 100% từ metadata + trạng thái (KHÔNG hiện cứng).
 * Theo: docstatus · is_submittable · perms(create/write/submit/cancel/delete/amend) · có workflow · mới-vs-đã-lưu.
 *   Draft(0)+write        → Lưu (primary khi dirty)
 *   Draft(0)+submittable+submit(+KHÔNG workflow) → Gửi (Submit) tách khỏi Lưu
 *   Submitted(1)+cancel(+KHÔNG workflow)         → Huỷ
 *   Cancelled(2)+amend    → Sửa đổi
 *   delete + đã lưu       → Xoá (destructive, trong menu)
 * Có workflow → state do workflow lái ⇒ ẨN Submit/Cancel thủ công (Save/Amend/Delete vẫn còn).
 * WorkflowResolver (transitions) trình bày RIÊNG ở WorkflowActionBar.
 */
export type FormActionKind = "save" | "submit" | "cancel" | "amend" | "delete" | "duplicate" | "rename" | "print";

export interface FormActionDesc {
  kind: FormActionKind;
  label: string;
  variant: "default" | "outline" | "destructive" | "secondary";
  /** nút chính (bên phải, nổi bật). */
  primary?: boolean;
  /** gom vào menu "⋯" (thao tác phụ/nguy hiểm). */
  inMenu?: boolean;
  disabled?: boolean;
  /** lý do bị khoá (tooltip) — vd form dirty phải Lưu trước khi Gửi/Huỷ/Sửa đổi. */
  disabledReason?: string;
}

export interface FormPerms {
  create?: boolean;
  write?: boolean;
  submit?: boolean;
  cancel?: boolean;
  delete?: boolean;
  amend?: boolean;
}

export interface FormActionCtx {
  docstatus: 0 | 1 | 2;
  isSubmittable: boolean;
  isNew: boolean;
  dirty: boolean;
  hasWorkflow: boolean;
  saving?: boolean;
  /** Chỉ hiện Đổi tên khi metadata thật sự cho phép; server vẫn chốt lại lần cuối. */
  allowRename?: boolean;
  perms: FormPerms;
}

/** P0-04: thao tác đổi trạng thái (Gửi/Huỷ/Sửa đổi/workflow) KHÔNG chạy trên form chưa lưu. */
export const DIRTY_GUARD_REASON = "Lưu thay đổi trước khi thực hiện thao tác này";

export function resolveFormActions(ctx: FormActionCtx): FormActionDesc[] {
  const out: FormActionDesc[] = [];
  const p = ctx.perms;
  // Khoá thao tác đổi trạng thái khi form đang dirty ⇒ ép Lưu trước (không chạy trên snapshot cũ).
  const dirtyGuard = ctx.dirty ? { disabled: true, disabledReason: DIRTY_GUARD_REASON } : {};

  // Lưu — Draft, có quyền write (hoặc tạo mới + create)
  if (ctx.docstatus === 0 && (p.write || (ctx.isNew && p.create))) {
    out.push({
      kind: "save",
      label: ctx.saving ? "Đang lưu…" : "Lưu",
      variant: "default",
      primary: !ctx.isSubmittable,
      disabled: ctx.saving || !ctx.dirty,
      disabledReason: ctx.saving ? "Đang lưu thay đổi" : !ctx.dirty ? "Không có thay đổi cần lưu" : undefined,
    });
  }

  // Gửi (Submit) — Draft đã lưu, submittable, có quyền submit, KHÔNG workflow. Khoá khi dirty.
  if (ctx.docstatus === 0 && ctx.isSubmittable && p.submit && !ctx.hasWorkflow && !ctx.isNew) {
    out.push({ kind: "submit", label: "Gửi", variant: "default", primary: true, disabled: ctx.saving, ...dirtyGuard });
  }

  // Huỷ — Submitted, có quyền cancel, KHÔNG workflow. Khoá khi dirty.
  if (ctx.docstatus === 1 && p.cancel && !ctx.hasWorkflow) {
    out.push({ kind: "cancel", label: "Huỷ", variant: "outline", inMenu: true, disabled: ctx.saving, ...dirtyGuard });
  }

  // Sửa đổi (Amend) — Cancelled, có quyền amend. Khoá khi dirty.
  if (ctx.docstatus === 2 && p.amend) {
    out.push({ kind: "amend", label: "Sửa đổi", variant: "default", primary: true, disabled: ctx.saving, ...dirtyGuard });
  }

  // PDF là thao tác thường dùng của chứng từ, giữ ngay trên cụm action chính.
  if (!ctx.isNew) {
    out.push({ kind: "print", label: "Xuất PDF", variant: "outline", inMenu: false, disabled: ctx.saving });
  }

  // Nhân bản — đã lưu, có quyền create (tạo bản ghi mới từ dữ liệu hiện tại). Đọc bản ĐÃ LƯU trên
  // server (không phải giá trị đang gõ dở), giống hành vi ERPNext — KHÔNG khoá theo dirty.
  if (!ctx.isNew && p.create) {
    out.push({ kind: "duplicate", label: "Nhân bản", variant: "outline", inMenu: true, disabled: ctx.saving });
  }

  // Đổi tên — đã lưu, có quyền write. Đổi định danh bản ghi → khoá khi dirty (tránh nhầm giữa sửa
  // nội dung dở tay với đổi tên, ép Lưu/huỷ nháp trước).
  if (!ctx.isNew && p.write && ctx.allowRename) {
    out.push({ kind: "rename", label: "Đổi tên", variant: "outline", inMenu: true, disabled: ctx.saving, ...dirtyGuard });
  }

  // Xoá — đã lưu, có quyền delete (menu). KHÔNG khoá theo dirty (xoá không phụ thuộc snapshot).
  if (!ctx.isNew && p.delete) {
    out.push({ kind: "delete", label: "Xoá", variant: "destructive", inMenu: true, disabled: ctx.saving });
  }

  return out;
}
