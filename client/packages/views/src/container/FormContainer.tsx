/** @jsxImportSource react */
/**
 * FormContainer — nối FormView vào backend thật: nạp meta+doc(+docinfo perms)+transitions,
 * lưu qua updateDoc (bắt 417 → conflict, KHÔNG ghi đè). Form actions METADATA/SERVER-DRIVEN:
 *   perms ← docinfo.permissions · transitions ← get_transitions (server) ·
 *   submit/cancel/amend/delete ← adapter · workflow ← applyWorkflow → refetch doc+transitions+timeline.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveFormRenderPolicy, type Doc } from "@metaforge/core";
import type { ListViewSnapshot } from "@metaforge/adapter-frappe";
import { Button, ConfirmDialog, PromptDialog, toast, useT } from "@metaforge/ui";
import { FormView } from "../form/FormView.js";
import { DocumentExperience, DocumentExperienceSkeleton } from "../detail/DocumentExperience.js";
import type { FormActionKind } from "../detail/formActions.js";
import { useMetaForge } from "./provider.js";
import { useDoc, useFormMeta, useTransitions, useCapabilities, NO_CAPS } from "./hooks.js";
import { stashDuplicate } from "./duplicate.js";
import { recordRecentDoc } from "./recent-docs.js";
import { SubmitPreviewDialog, type SubmitPreview } from "./SubmitPreviewDialog.js";
import { AllocationTimelineDialog, type AllocationTimeline } from "./AllocationTimelineDialog.js";

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
  /** đóng form, quay về danh sách (nút X sẽ lưu trước nếu form đang dirty). */
  onClose?: () => void;
  headerActions?: ReactNode;
}

export function FormContainer(props: FormContainerProps) {
  const t = useT();
  const { doctype, name } = props;
  const { adapter, registry, services, roles, scopeKey } = useMetaForge();
  const metaQ = useFormMeta(doctype);
  const renderPolicy = useMemo(
    () => metaQ.data ? resolveFormRenderPolicy(metaQ.data, "expanded") : undefined,
    [metaQ.data],
  );
  const docQ = useDoc(doctype, name);
  const doc = docQ.data?.doc;
  const transQ = useTransitions(doctype, name, doc);
  const capsQ = useCapabilities(doctype, name);
  const caps = capsQ.data ?? NO_CAPS;
  const qc = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [submitPreview, setSubmitPreview] = useState<SubmitPreview | null>(null);
  const [allocationTimelineOpen, setAllocationTimelineOpen] = useState(false);
  const [allocationTimeline, setAllocationTimeline] = useState<AllocationTimeline | null>(null);
  const [allocationTimelineLoading, setAllocationTimelineLoading] = useState(false);
  const [allocationTimelineError, setAllocationTimelineError] = useState<string | null>(null);
  const formHostRef = useRef<HTMLDivElement>(null);
  const closeAfterSaveRef = useRef(false);
  const saveStartedRef = useRef(false);
  const supportsAllocationTimeline = doctype === "Purchase Order" || doctype === "Purchase Receipt";

  useEffect(() => {
    if (!doc || !metaQ.data) return;
    const titleField = metaQ.data.title_field;
    const title = titleField ? (doc[titleField] as string | undefined) : undefined;
    recordRecentDoc(doctype, name, title || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, name, doc?.modified]);

  if (metaQ.isLoading || docQ.isLoading) return <DocumentExperienceSkeleton />;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(metaQ.error).message}</div>;
  if (docQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(docQ.error).message}</div>;
  if (!metaQ.data || !docQ.data || !doc) return <div className="p-4 text-sm text-muted-foreground">{t("common.no_data")}</div>;
  if (renderPolicy && !renderPolicy.enabled) {
    return <div className="grid h-40 place-items-center p-4 text-sm text-muted-foreground" role="status">Biểu mẫu này đã bị tắt bởi metadata.</div>;
  }

  const publishMutation = (updated?: Doc) => {
    if (updated) {
      qc.setQueryData(
        [scopeKey, "doc", doctype, name],
        (current: typeof docQ.data) => current ? { ...current, doc: updated } : current,
      );
      qc.setQueriesData<Doc[]>(
        { queryKey: [scopeKey, "list", doctype] },
        (rows) => rows?.map((row) => String(row.name) === name ? { ...row, ...updated } : row),
      );
      qc.setQueriesData<ListViewSnapshot>(
        { queryKey: [scopeKey, "list-view", doctype] },
        (snapshot) => snapshot
          ? { ...snapshot, rows: snapshot.rows.map((row) => String(row.name) === name ? { ...row, ...updated } : row) }
          : snapshot,
      );
    }
    void Promise.all([
      qc.invalidateQueries({ queryKey: [scopeKey, "caps", doctype, name], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "list", doctype], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "count", doctype], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
    ]).catch(() => undefined);
  };

  const invalidateCollection = () => {
    void Promise.all([
      qc.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "list", doctype], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "count", doctype], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
    ]).catch(() => undefined);
  };

  const submitCurrent = async () => {
    const updated = await adapter.submit(doc);
    publishMutation(updated);
    toast.success(t("form.submitted"));
    setSubmitPreview(null);
  };

  const onSave = async (changed: Record<string, unknown>) => {
    saveStartedRef.current = true;
    setSaving(true);
    setFieldErrors(undefined);
    try {
      const updated = await adapter.updateDoc(doctype, name, changed, String(doc.modified ?? ""));
      publishMutation(updated);
      setConflict(false);
      setFormDirty(false);
      toast.success(t("form.saved"));
      props.onSaved?.();
      if (closeAfterSaveRef.current) {
        closeAfterSaveRef.current = false;
        props.onClose?.();
      }
      return true;
    } catch (e) {
      closeAfterSaveRef.current = false;
      const err = adapter.mapError(e);
      if (err.kind === "conflict") setConflict(true);
      else {
        if (err.fieldErrors) setFieldErrors({ ...err.fieldErrors });
        toast.error(err.message);
      }
      return false;
    } finally {
      saveStartedRef.current = false;
      setSaving(false);
    }
  };

  const onCloseRequested = () => {
    if (!props.onClose) return;
    if (!formDirty) {
      props.onClose();
      return;
    }
    if (saving) return;

    closeAfterSaveRef.current = true;
    saveStartedRef.current = false;
    const formElement = formHostRef.current?.querySelector("form");
    if (!formElement) {
      closeAfterSaveRef.current = false;
      return;
    }
    formElement.requestSubmit();
    window.setTimeout(() => {
      if (!saveStartedRef.current && closeAfterSaveRef.current) closeAfterSaveRef.current = false;
    }, 250);
  };

  const onAction = async (kind: FormActionKind) => {
    if (kind === "delete") { setConfirmDelete(true); return; }
    if (kind === "rename") { setRenaming(true); return; }
    if (kind === "duplicate") { stashDuplicate(doctype, doc as Record<string, unknown>); props.onDuplicate?.(); return; }
    if (kind === "print") { props.onPrint?.(); return; }
    if (kind === "submit") {
      setSaving(true);
      try {
        const preview = await adapter.callGet<SubmitPreview | null>(
          "metaforge.api.get_submit_preview",
          { doctype, name },
        );
        if (preview) setSubmitPreview(preview);
        else await submitCurrent();
      } catch (e) {
        toast.error(adapter.mapError(e).message);
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      if (kind === "cancel") { const updated = await adapter.cancel(doctype, name); publishMutation(updated); toast.success(t("form.cancelled")); }
      else if (kind === "amend") { await adapter.amend(doctype, name); invalidateCollection(); toast.success(t("form.amended")); props.onSaved?.(); }
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmSubmit = async () => {
    setSaving(true);
    try {
      await submitCurrent();
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const openAllocationTimeline = async () => {
    setAllocationTimelineOpen(true);
    setAllocationTimelineLoading(true);
    setAllocationTimelineError(null);
    try {
      const timeline = await adapter.callGet<AllocationTimeline | null>(
        "metaforge.api.get_purchase_allocation_timeline",
        { doctype, name },
      );
      setAllocationTimeline(timeline);
    } catch (error) {
      setAllocationTimeline(null);
      setAllocationTimelineError(adapter.mapError(error).message);
    } finally {
      setAllocationTimelineLoading(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await adapter.deleteDoc(doctype, name);
      qc.removeQueries({ queryKey: [scopeKey, "doc", doctype, name] });
      invalidateCollection();
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
      qc.removeQueries({ queryKey: [scopeKey, "doc", doctype, name] });
      invalidateCollection();
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
      const updated = await adapter.applyWorkflow(doc, action);
      publishMutation(updated);
      toast.success(`${t("form.workflow_done")}: ${action}`);
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DocumentExperience meta={renderPolicy?.meta ?? metaQ.data} doc={doc}>
        <div ref={formHostRef} className="h-full min-h-0">
          <FormView
            onClose={onCloseRequested}
            onDirtyChange={setFormDirty}
            headerActions={(
              <>
                {props.headerActions}
                {supportsAllocationTimeline && Number(doc.docstatus ?? 0) !== 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={allocationTimelineLoading}
                    onClick={() => void openAllocationTimeline()}
                  >
                    {allocationTimelineLoading ? "Đang tải…" : "Phân bổ"}
                  </Button>
                ) : null}
              </>
            )}
            meta={renderPolicy?.meta ?? metaQ.data}
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
            forceReadOnly={!caps.write}
            transitions={transQ.data?.transitions ?? []}
            hasWorkflow={transQ.data?.has_workflow ?? false}
            onAction={onAction}
            onWorkflowAction={onWorkflowAction}
          />
        </div>
      </DocumentExperience>
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
      <SubmitPreviewDialog
        preview={submitPreview}
        saving={saving}
        onCancel={() => setSubmitPreview(null)}
        onConfirm={() => void confirmSubmit()}
      />
      <AllocationTimelineDialog
        open={allocationTimelineOpen}
        timeline={allocationTimeline}
        loading={allocationTimelineLoading}
        error={allocationTimelineError}
        onClose={() => setAllocationTimelineOpen(false)}
      />
    </>
  );
}
