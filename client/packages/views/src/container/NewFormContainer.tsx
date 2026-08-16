/** @jsxImportSource react */
/**
 * NewFormContainer — tạo bản ghi MỚI: dựng doc trống từ meta (field.default) → FormView (isNew)
 * → validate required (Zod) → createDoc → điều hướng tới bản ghi vừa tạo. KHÔNG fetch getDoc.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { applyContextPolicy, resolveFormRenderPolicy, serializeCreateDocument, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";
import { Button, toast, useT } from "@metaforge/ui";
import { FormView } from "../form/FormView.js";
import { useMetaForge } from "./meta-context.js";
import { useFormMeta, useCapabilities, NO_CAPS } from "./hooks.js";
import { consumeDuplicate } from "./duplicate.js";
import { editableCodeField, suggestEditableCode } from "./editable-code.js";

const pad = (n: number): string => String(n).padStart(2, "0");

/** `f.default` có thể là biểu thức "ma thuật" của Frappe (Desk resolve bằng đồng hồ máy TRƯỚC khi
 * gửi) chứ không phải giá trị literal — gửi NGUYÊN CHUỖI "Today"/"Now" cho field Date/Datetime khiến
 * MySQL parse lỗi (1292 Incorrect date value), phát hiện LIVE qua create ToDo (`date` default="Today").
 * Resolve như Desk làm, KHÔNG gửi literal. */
function resolveDefault(f: DocField): string | undefined {
  if (f.default == null || f.default === "") return undefined;
  if (f.default === "Today" && f.fieldtype === "Date") {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (f.default === "Now" && f.fieldtype === "Datetime") {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return f.default;
}

export interface NewFormContainerProps {
  doctype: string;
  onCreated?: (name: string) => void;
  /** Lưu chứng từ mới rồi mở ngay bản xem thử in ấn. */
  onPreviewCreated?: (name: string) => void;
  onCancel?: () => void;
  /** Bộ đếm "cha yêu cầu đóng" (vd người dùng bấm ra ngoài modal / nhấn Esc). Tăng giá trị ⇒ chạy
   * ĐÚNG luồng Huỷ sẵn có: chưa nhập gì thì đóng luôn, đang nhập dở thì hỏi xác nhận. Dùng bộ đếm
   * thay vì boolean để bấm ra ngoài lần thứ 2, thứ 3 vẫn kích hoạt được. */
  closeRequest?: number;
  /** Page = biểu mẫu Desk đầy đủ; dialog = quick-create gọn. */
  presentation?: "page" | "dialog";
  /** Khung chứa đã chiếm trọn màn hình ⇒ form bỏ trần bề ngang, không chừa dải trống hai bên. */
  fullWidth?: boolean;
}

function blankDoc(meta: DocTypeMeta, contextDefaults: Record<string, string> = {}, singletonDefaults: Record<string, string> = {}): Doc {
  // `__islocal` là cờ CHUẨN của Frappe đánh dấu "bản ghi chưa lưu". Rất nhiều field ERPNext dùng
  // `read_only_depends_on: "eval: !doc.__islocal"` nghĩa là "chỉ sửa được lúc tạo mới" — vd
  // Warehouse.company. Không đặt cờ này thì `!undefined` = true ⇒ field bị KHOÁ ngay trên form tạo
  // mới, người dùng không chọn được gì và cũng không lưu nổi vì field đó lại bắt buộc.
  const doc: Doc = { name: "new", doctype: meta.name, docstatus: 0, __islocal: 1, __unsaved: 1 };
  for (const f of meta.fields ?? []) {
    const v = resolveDefault(f);
    if (v !== undefined) doc[f.fieldname] = v;
  }
  for (const [fieldname, value] of Object.entries(contextDefaults)) {
    if (meta.fields.some((f) => f.fieldname === fieldname) && (doc[fieldname] == null || doc[fieldname] === "")) doc[fieldname] = value;
  }
  // Ô Link không có gì để chọn ngoài một lựa chọn duy nhất không phải quyết định — tự điền để người
  // dùng không phải mở dropdown chỉ để bấm đúng cái option duy nhất đang có. Áp SAU context defaults
  // (context là chủ ý thật của người dùng/nghiệp vụ, vượt trên suy đoán "chỉ có 1 bản ghi").
  for (const [fieldname, value] of Object.entries(singletonDefaults)) {
    if (meta.fields.some((f) => f.fieldname === fieldname) && (doc[fieldname] == null || doc[fieldname] === "")) doc[fieldname] = value;
  }
  // Mã định danh chính có sẵn ngay khi form mở nhưng vẫn là Data control thường — khách có thể sửa.
  // Đặt SAU default/context để không ghi đè quy ước mã mà app hoặc tenant đã khai rõ.
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
  const capsQ = useCapabilities(doctype); // new-doc: doctype-level create/write (fail-closed)
  const caps = capsQ.data ?? NO_CAPS;
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [dirty, setDirty] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(doctype === "Sales Order" ? null : "");
  useEffect(() => {
    if (doctype !== "Sales Order") {
      setCurrentUser("");
      return;
    }
    let active = true;
    void adapter.getBoot().then((boot) => {
      if (active) setCurrentUser(boot.full_name || boot.user || "");
    }).catch(() => {
      if (active) setCurrentUser("");
    });
    return () => { active = false; };
  }, [adapter, doctype]);
  // "Lưu & Tạo tiếp" — nhập liệu hàng loạt (vd 20 Item liên tiếp) không cần đóng/mở lại modal mỗi lần.
  // resetSeq đổi ⇒ doc mới (blankDoc lại) + key FormView đổi ⇒ remount sạch (RHF defaultValues chỉ
  // chụp 1 lần lúc mount nên PHẢI remount, không thể chỉ đổi prop `doc` mà form tự nhận ra).
  const [resetSeq, setResetSeq] = useState(0);
  const saveIntentRef = useRef<"close" | "continue" | "preview">("close");
  const contextDefaults = useMemo(() => {
    const defaults = applyContextPolicy(doctype, businessContext, contextPolicies).defaults;
    return doctype === "Sales Order" && currentUser && !defaults.responsible_person
      ? { ...defaults, responsible_person: currentUser }
      : defaults;
  }, [doctype, businessContext, contextPolicies, currentUser]);
  // Field Link đích chỉ có ĐÚNG 1 bản ghi ⇒ tự chọn, không bắt người dùng mở dropdown cho một lựa
  // chọn không phải lựa chọn. Chỉ dò field thật sự sẽ hiển thị (renderPolicy.meta), field đã có
  // default/context rồi thì bỏ qua — không tốn round-trip cho chỗ đã có giá trị.
  //
  // `ready` chặn FormView mount tới khi dò xong: RHF chỉ chụp defaultValues MỘT LẦN lúc mount
  // (như ghi chú resetSeq/key bên dưới), nên nếu form mount trước rồi giá trị mới bay tới sau,
  // set lại state không remount thì RHF không bao giờ thấy — hoặc phải remount và xoá sạch những
  // gì người dùng vừa gõ trong lúc chờ. Gate trước khi mount tránh cả hai.
  const [singletonState, setSingletonState] = useState<{ ready: boolean; defaults: Record<string, string> }>({ ready: false, defaults: {} });
  useEffect(() => {
    const fields = renderPolicy?.meta.fields;
    const searchLink = services.searchLink;
    if (!fields || !searchLink) { setSingletonState({ ready: true, defaults: {} }); return; }
    const candidates = fields.filter((f) => (
      f.fieldtype === "Link" && f.options && !f.read_only
      && resolveDefault(f) === undefined && !contextDefaults[f.fieldname]
    ));
    if (!candidates.length) { setSingletonState({ ready: true, defaults: {} }); return; }
    let cancelled = false;
    setSingletonState({ ready: false, defaults: {} });
    void Promise.all(candidates.map(async (f) => {
      try {
        const results = await searchLink(f.options as string, "", { pageLength: 2 });
        return results.length === 1 ? [f.fieldname, results[0]!.value] as const : null;
      } catch { return null; }
    })).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1];
      setSingletonState({ ready: true, defaults: next });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderPolicy?.meta, contextDefaults, services, resetSeq]);
  // Nhân bản (Duplicate) — form "new" mở từ FormContainer.onAction("duplicate") có thể mang theo
  // prefill qua sessionStorage. Tiêu thụ ĐÚNG 1 LẦN (ref, không phải mỗi lần useMemo chạy lại) —
  // "Lưu & Tạo tiếp" (resetSeq đổi) sau đó phải là blankDoc SẠCH, không lặp lại bản nhân bản cũ.
  const consumedDuplicateRef = useRef(false);
  const doc = useMemo(() => {
    if (!metaQ.data) return null;
    const base = blankDoc(metaQ.data, contextDefaults, singletonState.defaults);
    if (!consumedDuplicateRef.current) {
      consumedDuplicateRef.current = true;
      const dup = consumeDuplicate(doctype);
      // dup không bao giờ mang "docstatus"/"name" (loại trừ ở SYSTEM_FIELDS, xem duplicate.ts) — cast
      // an toàn, TS chỉ đang widen quá tay do spread 1 Record<string,unknown> chưa rõ shape tĩnh.
      if (dup) {
        // Không chép mã định danh của bản gốc: nó thường unique và sẽ làm bản nhân bản không lưu được.
        // `base` đã có một mã gợi ý mới; xoá mã cũ khỏi payload nhân bản để giữ đúng giá trị đó.
        const codeField = editableCodeField(metaQ.data);
        if (codeField) delete dup[codeField.fieldname];
        return { ...base, ...dup, name: "new" } as Doc;
      }
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaQ.data, contextDefaults, singletonState.defaults, resetSeq, doctype]);

  // Chỉ hỏi xác nhận khi thật sự có dữ liệu chưa lưu (form dirty) — không hỏi vô cớ.
  /**
   * Huỷ là huỷ ngay, không hỏi lại.
   *
   * Trước đây khi form đang có dữ liệu chưa lưu thì mỗi lần bấm Huỷ / Esc / bấm ra ngoài đều dựng
   * một hộp xác nhận "Huỷ tạo mới?". Bỏ theo yêu cầu.
   *
   * Đánh đổi cần biết: bấm nhầm ra ngoài khung là mất trắng những gì vừa gõ, không có bước chặn
   * nào nữa và cũng không hoàn tác được. `dirty` vẫn được theo dõi cho các mục đích khác.
   */
  const requestCancel = () => { props.onCancel?.(); };

  // ⚠️ MỌI HOOK PHẢI NẰM TRÊN các `return` sớm bên dưới. Đặt dưới chúng thì lần render đầu (meta
  // chưa tải xong → return sớm) sẽ chạy ÍT hook hơn lần sau, React ném lỗi #310 "rendered more
  // hooks than during the previous render" và cả cây component trắng màn.
  //
  // Cha yêu cầu đóng (bấm ra ngoài modal / Esc) → dùng chung luồng Huỷ. Ref giữ hàm mới nhất để
  // effect chỉ phụ thuộc bộ đếm, không chạy lại mỗi render.
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
  if (doctype === "Sales Order" && currentUser === null) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!singletonState.ready) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
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
      // P0-03: gửi TOÀN BỘ document authorable (default ⊕ nhập), KHÔNG chỉ dirty fields
      // ⇒ không mất default/required chưa chạm. `doc` = blankDoc(meta) mang default.
      const full = serializeCreateDocument(metaQ.data, { ...(doc as Record<string, unknown>), ...changed });
      const created = await adapter.createDoc(doctype, full);
      // The create response is complete; do not hold the modal open while every
      // cached page/filter is fetched again. Mounted collections refresh in the
      // background, inactive ones are marked stale and refresh when reopened.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "list", doctype], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "count", doctype], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: [scopeKey, "overview"], refetchType: "none" }),
      ]).catch(() => undefined);
      if (saveIntentRef.current === "continue") {
        toast.success(`${t("form.created")} ${created.name} — ${t("form.continue_new_record")}`);
        setResetSeq((s) => s + 1);
      } else if (saveIntentRef.current === "preview") {
        toast.success("Đã lưu đơn và mở bản xem thử");
        props.onPreviewCreated?.(String(created.name));
      } else {
        toast.success(t("form.created"));
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
        // Boot defaults arrive asynchronously; include the user in the key so the
        // responsible-person field remounts once and visibly receives that default.
        key={`${resetSeq}-${currentUser}`}
        meta={renderPolicy?.meta ?? metaQ.data}
        doc={doc}
        registry={registry}
        services={services}
        roles={roles}
        isNew
        perms={caps}
        // P1-PERM-01: user không có quyền create thì field cũng không gõ được, không chỉ ẩn nút Lưu.
        forceReadOnly={!caps.create}
        onSave={onSave}
        onDirtyChange={setDirty}
        saving={saving}
        fieldErrors={fieldErrors}
        hideDefaultActions
        // Modal cha (vd DoctypeWorkspace) đã tự hiện tiêu đề "Tạo {doctype}" — luôn ẩn header trùng của FormView,
        // kể cả presentation="page" (child-table case), vì Dialog cha vẫn bọc ngoài và có DialogHeader riêng.
        hideHeader
        fullWidth={props.fullWidth}
        footerActions={<>
          <Button type="button" variant="outline" disabled={saving} onClick={requestCancel}>{t("common.cancel")}</Button>
          {doctype === "Sales Order" && props.onPreviewCreated ? (
            <Button type="submit" variant="outline" disabled={!caps.create || saving} onClick={() => { saveIntentRef.current = "preview"; }}>
              <Eye className="size-4" /> Xem thử bản in
            </Button>
          ) : null}
          <Button type="submit" variant="outline" disabled={!caps.create || saving} onClick={() => { saveIntentRef.current = "continue"; }}>{t("form.save_and_new")}</Button>
          <Button type="submit" disabled={!caps.create || saving} onClick={() => { saveIntentRef.current = "close"; }}>{saving ? t("form.saving") : t("form.save_and_open")}</Button>
        </>}
      />
    </>
  );
}
