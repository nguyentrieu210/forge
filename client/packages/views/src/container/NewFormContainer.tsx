/** @jsxImportSource react */
/**
 * NewFormContainer — tạo bản ghi MỚI: dựng doc trống từ meta (field.default) → FormView (isNew)
 * → validate required (Zod) → createDoc → điều hướng tới bản ghi vừa tạo. KHÔNG fetch getDoc.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { applyContextPolicy, buildMetadataDefaults, resolveFormRenderPolicy, serializeCreateDocument, type Doc, type DocTypeMeta } from "@metaforge/core";
import { Button, ConfirmDialog, toast, useT } from "@metaforge/ui";
import { FormView } from "../form/FormView.js";
import { useMetaForge } from "./provider.js";
import { useFormMeta, useCapabilities, NO_CAPS } from "./hooks.js";
import { consumeDuplicate } from "./duplicate.js";
import { editableCodeField, suggestEditableCode } from "./editable-code.js";

export interface NewFormContainerProps {
  doctype: string;
  onCreated?: (name: string) => void;
  onCancel?: () => void;
  closeRequest?: number;
  presentation?: "page" | "dialog";
}

function blankDoc(meta: DocTypeMeta, contextDefaults: Record<string, string> = {}): Doc {
  const doc: Doc = {
    name: "new",
    doctype: meta.name,
    docstatus: 0,
    __islocal: 1,
    __unsaved: 1,
    ...buildMetadataDefaults(meta),
  };
  for (const [fieldname, value] of Object.entries(contextDefaults)) {
    if (meta.fields.some((f) => f.fieldname === fieldname) && (doc[fieldname] == null || doc[fieldname] === "")) doc[fieldname] = value;
  }
  const codeField = editableCodeField(meta);
  if (codeField && (doc[codeField.fieldname] == null || doc[codeField.fieldname] === "")) {
    doc[codeField.fieldname] = suggestEditableCode(meta, codeField);
  }
  return doc;
}

export function NewFormContainer(props: NewFormContainerProps) {
  const t = useT();
  const { doctype } = props;
  const { adapter, registry, services, roles, scopeKey, businessContext, contextPolicies } = useMetaForge();
  const queryClient = useQueryClient();
  const metaQ = useFormMeta(doctype);
  const renderPolicy = useMemo(
    () => metaQ.data
      ? resolveFormRenderPolicy(metaQ.data, props.presentation === "dialog" ? "quick" : "expanded")
      : undefined,
    [metaQ.data, props.presentation],
  );
  const capsQ = useCapabilities(doctype);
  const caps = capsQ.data ?? NO_CAPS;
  const isSingle = metaQ.data?.issingle === 1;
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [dirty, setDirty] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [resetSeq, setResetSeq] = useState(0);
  const saveIntentRef = useRef<"close" | "continue">("close");
  const contextDefaults = useMemo(() => applyContextPolicy(doctype, businessContext, contextPolicies).defaults, [doctype, businessContext, contextPolicies]);
  const consumedDuplicateRef = useRef(false);
  const doc = useMemo(() => {
    if (!metaQ.data) return null;
    const base = blankDoc(metaQ.data, contextDefaults);
    if (!consumedDuplicateRef.current) {
      consumedDuplicateRef.current = true;
      const dup = consumeDuplicate(doctype);
      if (dup) {
        const codeField = editableCodeField(metaQ.data);
        if (codeField) delete dup[codeField.fieldname];
        return { ...base, ...dup, name: "new" } as Doc;
      }
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaQ.data, contextDefaults, resetSeq, doctype]);

  const requestCancel = () => { if (dirty) setConfirmCancel(true); else props.onCancel?.(); };
  const requestCancelRef = useRef(requestCancel);
  requestCancelRef.current = requestCancel;
  const closeRequest = props.closeRequest ?? 0;
  const seenCloseRequest = useRef(closeRequest);
  useEffect(() => {
    if (closeRequest === seenCloseRequest.current) return;
    seenCloseRequest.current = closeRequest;
    requestCancelRef.current();
  }, [closeRequest]);

  if (metaQ.isLoading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(metaQ.error).message}</div>;
  if (!metaQ.data || !doc) return <div className="p-4 text-sm text-muted-foreground">{t("common.no_data")}</div>;
  if (renderPolicy && !renderPolicy.enabled) {
    return (
      <div className="grid min-h-40 place-items-center p-5 text-center" role="status">
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {props.presentation === "dialog" ? "Biểu mẫu tạo nhanh đã bị tắt bởi metadata." : "Biểu mẫu này đã bị tắt bởi metadata."}
          </p>
          <p className="text-xs text-muted-foreground">
            {props.presentation === "dialog" ? "MetaForge sẽ không tự nhét biểu mẫu đầy đủ vào hộp thoại tạo nhanh." : "Renderer tôn trọng viewPolicy.form.enabled=false."}
          </p>
          {props.onCancel ? <Button type="button" variant="outline" onClick={props.onCancel}>{t("common.close")}</Button> : null}
        </div>
      </div>
    );
  }

  const onSave = async (changed: Record<string, unknown>) => {
    setSaving(true);
    setFieldErrors(undefined);
    try {
      const full = serializeCreateDocument(metaQ.data, { ...(doc as Record<string, unknown>), ...changed });
      const created = await adapter.createDoc(doctype, full);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list", doctype], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "count", doctype], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
      ]).catch(() => undefined);
      if (!isSingle && saveIntentRef.current === "continue") {
        toast.success(`${t("form.created")} ${created.name} — ${t("form.continue_new_record")}`);
        setResetSeq((s) => s + 1);
      } else {
        toast.success(isSingle ? "Đã lưu cài đặt" : t("form.created"));
        props.onCreated?.(String(created.name));
      }
    } catch (e) {
      const err = adapter.mapError(e);
      if (err.fieldErrors) setFieldErrors({ ...err.fieldErrors });
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormView
        key={resetSeq}
        meta={renderPolicy?.meta ?? metaQ.data}
        doc={doc}
        registry={registry}
        services={services}
        roles={roles}
        isNew
        perms={caps}
        forceReadOnly={!caps.create}
        onSave={onSave}
        onDirtyChange={setDirty}
        saving={saving}
        fieldErrors={fieldErrors}
        hideDefaultActions
        hideHeader={props.presentation !== "page"}
        footerActions={<>
          {!isSingle && props.onCancel ? <Button type="button" variant="outline" disabled={saving} onClick={requestCancel}>{t("common.cancel")}</Button> : null}
          {!isSingle ? <Button type="submit" variant="outline" disabled={!caps.create || saving} onClick={() => { saveIntentRef.current = "continue"; }}>{t("form.save_and_new")}</Button> : null}
          <Button type="submit" disabled={!caps.create || saving} onClick={() => { saveIntentRef.current = "close"; }}>{saving ? t("form.saving") : isSingle ? "Lưu" : t("form.save_and_open")}</Button>
        </>}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("form.cancel_new_title")}
        description={t("form.cancel_new_desc")}
        confirmLabel={t("form.cancel_new_confirm")}
        cancelLabel={t("form.cancel_new_keep_editing")}
        destructive
        onConfirm={() => props.onCancel?.()}
      />
    </>
  );
}
