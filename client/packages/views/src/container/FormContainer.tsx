/** @jsxImportSource react */
/**
 * FormContainer — nối FormView vào backend thật: nạp meta+doc(+docinfo perms)+transitions,
 * lưu qua updateDoc (bắt 417 → conflict, KHÔNG ghi đè). Form actions METADATA/SERVER-DRIVEN:
 *   perms ← docinfo.permissions · transitions ← get_transitions (server) ·
 *   submit/cancel/amend/delete ← adapter · workflow ← applyWorkflow → refetch doc+transitions+timeline.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog, PromptDialog, toast, useT } from "@metaforge/ui";
import { FormView } from "../form/FormView.js";
import type { FormActionKind } from "../detail/formActions.js";
import { useMetaForge } from "./provider.js";
import { useDoc, useFormMeta, useTransitions, useCapabilities, NO_CAPS } from "./hooks.js";
import { stashDuplicate } from "./duplicate.js";
import { recordRecentDoc } from "./recent-docs.js";

export interface FormContainerProps {
  doctype: string;
  name: string;
  onSaved?: () => void;
  onDeleted?: () => void;
  /** Nhân bản: FormContainer tự stash dữ liệu (sessionStorage) rồi gọi callback này — cha điều
   * hướng sang "/app/<doctype>/new" (NewFormContainer tự tiêu thụ prefill). */
  onDuplicate?: () => void;
  /** Đổi tên thành công: cha điều hướng sang tên mới (URL vẫn còn tên cũ). */
  onRenamed?: (newName: string) => void;
  /** Xem bản in: cha điều hướng sang route in ấn riêng (vd "/print/<doctype>/<name>"). */
  onPrint?: () => void;
  /** đóng form, quay về danh sách (hiện nút X trong header form). */
  onClose?: () => void;
  headerActions?: ReactNode;
}

export function FormContainer(props: FormContainerProps) {
  const t = useT();
  const { doctype, name } = props;
  const { adapter, registry, services, roles, scopeKey } = useMetaForge();
  const metaQ = useFormMeta(doctype);
  const docQ = useDoc(doctype, name);
  const doc = docQ.data?.doc;
  const transQ = useTransitions(doctype, name, doc);
  // P0-05: capabilities FAIL-CLOSED từ server (has_permission) — KHÔNG optimistic.
  // Đang tải / lỗi ⇒ NO_CAPS (mọi nút disable) cho tới khi server trả quyền thật.
  const capsQ = useCapabilities(doctype, name);
  const caps = capsQ.data ?? NO_CAPS;
  const qc = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // "Gần đây" (CommandPalette đã có sẵn UI, trước đây không app nào cấp dữ liệu) — ghi mỗi lần mở
  // 1 bản ghi đã lưu thành công (doc?.modified đổi ⇒ mở doc mới HOẶC vừa lưu xong đều tính là "vừa xem").
  useEffect(() => {
    if (!doc || !metaQ.data) return;
    const titleField = metaQ.data.title_field;
    const title = titleField ? (doc[titleField] as string | undefined) : undefined;
    recordRecentDoc(doctype, name, title || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, name, doc?.modified]);

  if (metaQ.isLoading || docQ.isLoading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(metaQ.error).message}</div>;
  if (docQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(docQ.error).message}</div>;
  if (!metaQ.data || !docQ.data || !doc) return <div className="p-4 text-sm text-muted-foreground">{t("common.no_data")}</div>;

  const refetchAll = () =>
    // Khoá query có prefix scopeKey (P1-03) ⇒ invalidate PHẢI gồm scopeKey, nếu không sẽ không khớp
    // (bản ghi sẽ KHÔNG refetch sau save/submit/workflow). Bug hồi quy từ Gate 1, sửa ở Gate 3.
    Promise.all([
      qc.invalidateQueries({ queryKey: [scopeKey, "doc", doctype, name] }),
      qc.invalidateQueries({ queryKey: [scopeKey, "transitions", doctype, name] }),
      qc.invalidateQueries({ queryKey: [scopeKey, "caps", doctype, name] }),
    ]);

  const invalidateList = () => Promise.all([
    // `all`: ở mobile SplitView không mount list khi đang mở form. Vẫn làm mới cache NGAY sau
    // mutation để lúc đóng form danh sách hiện đúng dữ liệu mà không cần refetch-on-mount.
    qc.invalidateQueries({ queryKey: [scopeKey, "list", doctype], refetchType: "all" }),
    qc.invalidateQueries({ queryKey: [scopeKey, "count", doctype], refetchType: "all" }),
  ]);

  const onSave = async (changed: Record<string, unknown>) => {
    setSaving(true);
    setFieldErrors(undefined);
    try {
      await adapter.updateDoc(doctype, name, changed, String(doc.modified ?? ""));
      await Promise.all([refetchAll(), invalidateList()]);
      setConflict(false);
      toast.success(t("form.saved"));
      props.onSaved?.();
    } catch (e) {
      const err = adapter.mapError(e);
      if (err.kind === "conflict") setConflict(true);
      else {
        if (err.fieldErrors) setFieldErrors({ ...err.fieldErrors }); // gắn vào đúng control
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onAction = async (kind: FormActionKind) => {
    // Xoá không thể hoàn tác — hỏi xác nhận TRƯỚC, không gọi API ngay (trước đây xoá tức thì, 0 xác
    // nhận, kể cả window.confirm cũng không có — 1 cú click nhầm trong menu là mất dữ liệu vĩnh viễn).
    if (kind === "delete") { setConfirmDelete(true); return; }
    // Đổi tên cần hỏi tên mới trước — mở dialog, KHÔNG gọi API ngay.
    if (kind === "rename") { setRenaming(true); return; }
    // Nhân bản đọc bản ĐÃ LƯU (doc từ server), không phải giá trị đang gõ dở trên form — cục bộ,
    // không gọi API, chỉ stash + để cha điều hướng.
    if (kind === "duplicate") { stashDuplicate(doctype, doc as Record<string, unknown>); props.onDuplicate?.(); return; }
    if (kind === "print") { props.onPrint?.(); return; }
    setSaving(true);
    try {
      if (kind === "submit") { await adapter.submit(doc); toast.success(t("form.submitted")); await Promise.all([refetchAll(), invalidateList()]); }
      else if (kind === "cancel") { await adapter.cancel(doctype, name); toast.success(t("form.cancelled")); await Promise.all([refetchAll(), invalidateList()]); }
      else if (kind === "amend") { const d = await adapter.amend(doctype, name); toast.success(t("form.amended")); await invalidateList(); props.onSaved?.(); void d; }
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await adapter.deleteDoc(doctype, name);
      await invalidateList();
      toast.success(t("form.deleted"));
      props.onDeleted?.();
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const doRename = async (newName: string) => {
    if (newName === name) return;
    setSaving(true);
    try {
      const finalName = await adapter.rename(doctype, name, newName);
      await invalidateList();
      toast.success(t("form.renamed"));
      props.onRenamed?.(finalName);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const onWorkflowAction = async (action: string) => {
    setSaving(true);
    try {
      await adapter.applyWorkflow(doc, action);
      toast.success(`${t("form.workflow_done")}: ${action}`);
      await Promise.all([refetchAll(), invalidateList()]);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormView
        onClose={props.onClose}
        headerActions={props.headerActions}
        meta={metaQ.data}
        doc={doc}
        registry={registry}
        services={services}
        roles={roles}
        conflict={conflict}
        onReload={async () => { setConflict(false); await docQ.refetch(); }}
        onSave={onSave}
        saving={saving}
        fieldErrors={fieldErrors}
        perms={caps}
        // P1-PERM-01: field editability phải theo caps.write HIỆU LỰC (server has_permission — gồm
        // if_owner/user-permission/share), KHÔNG chỉ role/permlevel tĩnh của resolveMeta. Trước đây
        // "perms" chỉ gate NÚT (Lưu/Gửi…), field vẫn gõ được dù server sẽ từ chối lúc lưu.
        forceReadOnly={!caps.write}
        transitions={transQ.data?.transitions ?? []}
        // P1-WF-01: has_workflow SERVER-AUTHORITATIVE — trước đây FormView tự suy "có workflow" từ
        // transitions.length>0, nên user hết transition khả dụng (trạng thái cuối / không role nào
        // khớp) bị hiện NHẦM nút Submit/Huỷ thủ công dù doctype thật sự có workflow.
        hasWorkflow={transQ.data?.has_workflow ?? false}
        onAction={onAction}
        onWorkflowAction={onWorkflowAction}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`${t("form.delete_confirm_title")} "${name}"?`}
        description={t("form.delete_confirm_desc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={doDelete}
      />
      <PromptDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t("form.rename_title")}
        label={t("form.rename_label")}
        defaultValue={name}
        confirmLabel={t("form.rename_title")}
        onConfirm={doRename}
      />
    </>
  );
}
