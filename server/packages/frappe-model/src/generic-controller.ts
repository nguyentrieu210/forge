import type { CanonicalDocument, ChildRow, JsonObject, JsonValue, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/controller.js";
import { nextDocStatus } from "../../document-kernel/src/lifecycle.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { MetadataStore } from "./store.js";
import type { DocFieldMeta, DocTypeMeta, WorkflowMeta, WorkflowStateMeta } from "./types.js";
import { isLayoutField } from "./validate.js";
import { evaluateFieldCondition } from "./field-condition.js";
import { evaluateWorkflowCondition } from "./workflow-condition.js";
import { canWriteField } from "./permission.js";

export class GenericMetadataController implements DocumentController<JsonObject> {
  readonly doctype = "*";
  readonly allowSubmittedSave = true;
  constructor(private readonly metadata: MetadataStore) {}

  async buildPlan(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    const doctype = context.command.aggregate.doctype;
    const meta = await this.metadata.getDocType(context.command.tenant_id, doctype);
    if (!meta || meta.is_child) throw errors.validation(`No executable DocType metadata for ${doctype}`);
    if ((context.command.action === "submit" || context.command.action === "cancel") && !meta.is_submittable) {
      throw errors.lifecycle(`${doctype} is not submittable`);
    }
    const existing = context.existing;
    const data = context.command.action === "cancel"
      ? { ...structuredClone(requireExisting(context).data), ...(context.command.document.workflow_state === undefined ? {} : { workflow_state: context.command.document.workflow_state }) }
      : await normalizeDocument(context, meta, this.metadata);
    const workflow = await this.metadata.getWorkflow(context.command.tenant_id, doctype);
    const workflowResult = workflow?.is_active ? applyWorkflow(context, data, workflow) : null;
    if (workflowResult?.update) {
      const field = meta.fields.find((candidate) => candidate.fieldname === workflowResult.update!.field);
      if (!field || isLayoutField(field)) {
        throw errors.validation(`Workflow ${workflow?.name ?? "active workflow"} update field is not writable metadata: ${workflowResult.update.field}`);
      }
      // The value is produced by server-held workflow metadata AFTER ordinary user
      // input has passed field permissions/read-only checks. Workflow authority can
      // therefore update a read-only target without making that field client-writable.
      data[field.fieldname] = normalizeValue(field, workflowResult.update.value, context.command.action);
    }
    const docstatus = workflowResult?.docstatus ?? (meta.is_submittable ? nextDocStatus(context.command.action) : 0);
    const status = docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled";
    const workflowState = workflowResult?.state ?? (typeof data.workflow_state === "string" ? data.workflow_state : undefined);
    if (workflowState) data[workflow?.state_field ?? "workflow_state"] = workflowState;
    const document: CanonicalDocument<JsonObject> = {
      tenant_id: context.command.tenant_id,
      doctype,
      name: context.command.aggregate.name,
      owner: existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status: workflowState ?? status,
      version: context.nextVersion,
      created_at: existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: extractChildren(meta, data),
    };
    const event = domainEvent({
      type: `${slug(doctype)}.${context.command.action === "create" ? "created" : context.command.action === "save" ? "updated" : context.command.action === "submit" ? "submitted" : "cancelled"}`,
      tenantId: context.command.tenant_id,
      aggregate: context.command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: context.command.actor.user_id,
      commandId: context.command.command_id,
      occurredAt: context.now,
      payload: { action: context.command.action, metadata_revision: meta.revision, status: document.status },
    });
    return {
      command: context.command,
      document,
      gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [], events: [event],
      result: { doctype, name: document.name, version: document.version, docstatus, status: document.status, metadata_revision: meta.revision },
    };
  }
}

async function normalizeDocument(
  context: ControllerContext<JsonObject>,
  meta: DocTypeMeta,
  metadata: MetadataStore,
): Promise<JsonObject> {
  const input = context.command.document;
  const output: JsonObject = {};
  const known = new Map(meta.fields.map((field) => [field.fieldname, field]));
  for (const key of Object.keys(input)) {
    if (key.startsWith("_") || ["workflow_state"].includes(key)) continue;
    if (!known.has(key)) {
      // A metadata upgrade may retire a field while old documents still carry its
      // last stored value. The form echoes the complete document on save. Accept
      // only that unchanged legacy value and omit it from the new normalized
      // document; a caller still cannot invent or modify an unknown field.
      const legacy = context.existing?.data[key];
      if (legacy !== undefined && sameJsonValue(input[key], legacy)) continue;
      throw errors.validation(`Unknown field ${meta.name}.${key}`);
    }
  }
  for (const field of meta.fields) {
    if (isLayoutField(field)) continue;
    const provided = input[field.fieldname];
    const prior = context.existing?.data[field.fieldname];
    const changed = provided !== undefined && !sameFieldValue(field, provided, prior);
    if (changed && !canWriteField(meta, field, context.command.actor, context.existing ? "save" : "create", context.existing?.owner ?? context.command.actor.user_id)) {
      throw errors.permission(`Field permission denied: ${field.fieldname}`);
    }
    // An internal hidden value is not merely absent from the UI. When the Meta contract
    // marks it server-enforced, direct API callers may neither invent it nor change it.
    // A client is allowed to echo the declared default on create because blankDoc seeds
    // defaults before serialisation; accepting only that exact value keeps old clients
    // compatible without turning the hidden field into an input channel.
    /**
     * Ô CÔNG THỨC (`valueSource: "formula"`) KHÔNG đi lối "server-controlled" ở dưới.
     *
     * Hai loại ô đều là của server, nhưng khác nhau ở chỗ ai SINH ra giá trị: ô ẩn thường chỉ
     * có `default` rồi đứng yên, còn ô công thức phải được TÍNH LẠI mỗi lượt ghi vì nguồn của
     * nó thay đổi. Gộp chung thì lượt tính lại nào cũng bị chính kernel từ chối bằng "Field is
     * server-controlled" — đo được trên `Item.purchase_stock_qty_field` ngày 21/08/2026: không
     * tạo nổi một mã `Nhôm cây/lá` nào qua API, vì luật nhôm đòi ô đó bằng `qty_bar` còn kernel
     * cấm mọi giá trị.
     *
     * Cho đi tiếp xuống nhánh chỉ-đọc, nơi `suyRaTuServer` đã có sẵn phép "giá trị đến từ
     * server thì nhận" cho `fetch_from`. An toàn ngang nhau vì cùng một lý do: router GHI ĐÈ ô
     * này trước mỗi lệnh, nên thứ client gửi lên bị thay chứ không được tin.
     */
    const suyRaTuCongThuc = field.valueSource === "formula";
    /**
     * Ô server-controlled vẫn phải có MỘT đường ghi được, nếu không thì nó tự khoá luôn chính
     * chức năng của mình. Ô khai `systemWriterRole` và người ghi mang đúng vai đó thì cho qua —
     * xem chú thích ở `types.ts`. Vai hệ thống, không cấp cho người thật.
     */
    const nguoiGhiHeThong = Boolean(field.systemWriterRole)
      && context.command.actor.roles.includes(field.systemWriterRole!);
    if (field.serverEnforced && field.editMode === "hidden" && !suyRaTuCongThuc && !nguoiGhiHeThong) {
      if (prior !== undefined) {
        if (changed) throw errors.validation(`Field is server-controlled: ${field.fieldname}`);
        output[field.fieldname] = structuredClone(prior);
        continue;
      }
      if (provided !== undefined && (field.default === undefined || !sameFieldValue(field, provided, field.default))) {
        throw errors.validation(`Field is server-controlled: ${field.fieldname}`);
      }
      if (field.default !== undefined) output[field.fieldname] = structuredClone(field.default);
      continue;
    }
    const readOnly = Boolean(field.read_only) || (context.existing?.docstatus === 1 && !field.allow_on_submit);
    /**
     * Ô SUY RA TỪ LIÊN KẾT (`fetch_from`) là ngoại lệ của "chỉ đọc thì giữ giá trị cũ".
     *
     * Chúng chỉ đọc với NGƯỜI DÙNG, nhưng giá trị đến từ SERVER: router tính lại chúng từ bản
     * ghi được trỏ tới ở mỗi lượt ghi, trước khi tới đây. Giữ giá trị cũ trong trường hợp này
     * là vứt bỏ đúng con số server vừa tính, và làm ô đó đứng yên vĩnh viễn.
     *
     * Hỏng đo được: đổi Bộ theo dõi của một mặt hàng thì `inventory_mode` không đổi theo, nên
     * luật kiểm so bộ MỚI với kiểu tồn CŨ rồi từ chối — lỗi trỏ vào đúng ô người dùng vừa sửa.
     * Cùng gốc với lỗi "Field is read-only: inventory_mode" lúc nhập liệu.
     */
    /*
     * Người ghi hệ thống cũng phải vượt được nhánh "chỉ đọc thì giữ giá trị cũ".
     *
     * Bỏ qua mỗi guard `serverEnforced` là chưa đủ: ô còn `read_only: true`, nên giá trị mới rơi
     * vào nhánh giữ nguyên `prior` và lệnh ghi "thành công" mà số không đổi. Đo 23/08/2026: nút
     * "Tạo lại QR" trả 200, `qr_rotated_at` có ghi, còn `secret_version` vẫn đứng ở 1 — tức là
     * vẫn không thu hồi được bản QR cũ, chỉ khác là nay im lặng thay vì báo lỗi.
     */
    const suyRaTuServer = (typeof field.fetch_from === "string" && field.fetch_from.trim() !== "")
      || suyRaTuCongThuc || nguoiGhiHeThong;
    let value: JsonValue | undefined;
    if (readOnly && suyRaTuServer && provided !== undefined) value = normalizeValue(field, provided, context.command.action);
    else if (readOnly && prior !== undefined) value = structuredClone(prior);
    else if (readOnly && provided !== undefined && prior === undefined) throw errors.validation(`Field is read-only: ${field.fieldname}`);
    else if (provided !== undefined) value = normalizeValue(field, provided, context.command.action);
    else if (prior !== undefined && context.command.action === "save") value = structuredClone(prior);
    else if (field.default !== undefined) value = structuredClone(field.default);
    // `set_only_once` is enforced HERE rather than by making the field read-only,
    // because the two differ on the case that matters: a read-only field can never be
    // set, while this one is set exactly once and then frozen. Silently keeping the old
    // value instead of refusing would let a caller believe an edit landed.
    if (field.set_only_once && context.existing && changed && !isEmpty(prior)) {
      throw errors.validation(`${field.label} cannot be changed after it is set`, { fieldname: field.fieldname });
    }
    if (field.not_nullable && value === null) {
      throw errors.validation(`${field.label} cannot be empty`, { fieldname: field.fieldname });
    }
    if (field.non_negative && isNegative(value)) {
      throw errors.validation(`${field.label} cannot be negative`, { fieldname: field.fieldname });
    }
    if (field.required && isEmpty(value)) throw errors.validation(`${field.label} is required`);
    // `mandatory_depends_on` is enforced HERE, on the server. The client evaluates
    // the same expression to drive its UI, but a client-side check is a hint, not
    // a rule: a direct API call would otherwise submit a document missing a field
    // the business logic treats as required.
    if (!field.required && isEmpty(value) && field.mandatory_depends_on
      && evaluateFieldCondition(field.mandatory_depends_on, input, context.existing?.data)) {
      throw errors.validation(`${field.label} is required`, { fieldname: field.fieldname });
    }
    if (value !== undefined) output[field.fieldname] = value;
    /**
     * Kiểm đích của Link lúc SUBMIT — và lúc GHI, nếu doctype này không bao giờ có SUBMIT.
     *
     * Trước đây chỉ kiểm lúc `submit`, với lập luận đúng cho chứng từ: bản nháp được phép trỏ
     * tới thứ chưa có, cổng chặn là lúc chốt sổ. Nhưng DANH MỤC (`is_submittable` sai) không
     * bao giờ đi qua cổng ấy — nên với chúng, "kiểm lúc submit" nghĩa là KHÔNG BAO GIỜ KIỂM, và
     * một tham chiếu rác nằm lại vĩnh viễn. Đo trên 8810 ngày 21/08/2026: 57 doctype danh mục
     * không chốt sổ mang 172 trường Link, cộng 173 trường Link trên 58 bảng con — 345/809 ô Link
     * (43%) chưa từng được kiểm đích lần nào. Làn nhân sự đo được 6/6 ô Link BẮT BUỘC của
     * `Employee` nhận giá trị không tồn tại, trả 201, và hồ sơ treo đó vẫn phân ca được.
     *
     * Đánh đổi đã cân: `validateReference` tốn 1–2 truy vấn cho mỗi ô Link có giá trị, nên bật
     * cho mọi hành động ghi ở MỌI doctype sẽ cộng thêm hàng chục truy vấn cho mỗi chứng từ. Danh
     * mục thì ghi thưa hơn chứng từ nhiều bậc, nên chỗ này trả giá đúng lúc đáng trả.
     *
     * CÒN LẠI, CHƯA KHÉP (cố ý, ghi ra để không ai tưởng đã xong): chứng từ chốt sổ được vẫn
     * nhận Link rác ở bản nháp.
     *
     * Lý do KHÔNG phải là "thiếu bản ghi Company ALUMDOOR" — bản ghi đó CÓ thật trong
     * `master_records` (default_currency VND), và `hasMasterRecord` hợp nhất
     * `master_records ∪ documents ∪ roles ∪ users ∪ doctype_definitions` nên nó giải được
     * bình thường. Lưu ý tra cứu PHÂN BIỆT HOA THƯỜNG (lược đồ không có `COLLATE NOCASE`):
     * "ALUMDOOR" có, "Alumdoor" không.
     *
     * Lý do thật là một câu hỏi mà số đo KHÔNG trả lời thay được. Đo trên toàn D1 ngày
     * 21/08/2026: nhóm chứng từ có 50/267 bản ghi mang link treo (51 ô), nhưng 46/51 là
     * `responsible_person = dev@example.com` — một lỗi router ĐÃ vá — và 5 ô còn lại do chính
     * đợt audit gieo. Tức trên dữ liệu đã có, bật kiểm lúc tạo sẽ không chặn lượt tạo hợp lệ
     * nào. Nhưng phép đo ấy chạy trên corpus các chứng từ ĐÃ tạo thành công, nên nó không thể
     * thấy luồng hợp lệ mà bản nháp cố ý trỏ tới bản ghi sẽ dựng sau — mà đó đúng là lý do gốc
     * sinh ra luật "chỉ kiểm lúc submit". Bật hay không là quyết định kiến trúc của chủ dự án,
     * không phải thứ suy ra được từ dữ liệu hiện có.
     */
    const khongBaoGioChotSo = meta.is_submittable !== true;
    if (context.command.action === "submit" || khongBaoGioChotSo) {
      await validateReference(context, field, value, metadata, input);
    }
  }
  if (input.workflow_state !== undefined) output.workflow_state = input.workflow_state;
  output._metadata_revision = meta.revision;
  return output;
}

/**
 * Whether a stored value is below zero.
 *
 * Numerics are stored as STRINGS by `normalizeValue` (Currency, Float, Percent) so the
 * ledger keeps exact decimals, which means a naive `value < 0` would compare strings
 * and quietly pass "-5".
 */
function isNegative(value: JsonValue | undefined): boolean {
  if (typeof value === "number") return value < 0;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value) < 0;
  return false;
}

function normalizeValue(field: DocFieldMeta, value: JsonValue, action: string): JsonValue {
  if (value === null) return null;
  switch (field.fieldtype) {
    case "Data": case "Small Text": case "Text": case "Long Text": case "Code": case "Select": case "Link": case "Dynamic Link": case "Attach": case "Attach Image":
    // Rich text and secrets are stored exactly like a string. What differs is what
    // happens to them AFTERWARDS: markup is escaped by the print renderer, and a
    // Password is stripped from every read.
    case "Text Editor": case "Markdown Editor": case "HTML Editor": case "Password":
    case "Autocomplete": case "Read Only": case "Barcode": case "Icon": case "Image": case "Signature": {
      if (typeof value !== "string") throw errors.validation(`${field.label} must be a string`);
      if (field.length && value.length > field.length) throw errors.validation(`${field.label} exceeds ${field.length} characters`);
      if (field.fieldtype === "Select" && field.options) {
        const options = field.options.split("\n").map((entry) => entry.trim()).filter(Boolean);
        if (value && !options.includes(value)) throw errors.validation(`${field.label} must be one of the configured options`);
      }
      return value;
    }
    case "Int": {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw errors.validation(`${field.label} must be an integer`); return value;
    }
    case "Duration": {
      // Seconds, as Frappe stores it — so a value moved from a Frappe site keeps its
      // meaning. Negative would be a duration running backwards.
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw errors.validation(`${field.label} must be a whole number of seconds`);
      }
      return value;
    }
    case "Rating": {
      // Frappe stores a FRACTION from 0 to 1, not a star count. Accepting 5 here would
      // store something a Frappe client renders as five times full marks.
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        throw errors.validation(`${field.label} must be a fraction between 0 and 1`);
      }
      return value;
    }
    case "Phone": {
      if (typeof value !== "string") throw errors.validation(`${field.label} must be a string`);
      // Deliberately permissive: digits, spaces and the usual separators. Anything
      // stricter rejects a legitimate international number somewhere in the world.
      if (value && !/^[+()\-.\s\d]{3,32}$/.test(value)) throw errors.validation(`${field.label} is not a usable phone number`);
      return value;
    }
    case "Color": {
      if (typeof value !== "string") throw errors.validation(`${field.label} must be a string`);
      if (value && !/^#[0-9a-fA-F]{6}$/.test(value)) throw errors.validation(`${field.label} must be a #rrggbb colour`);
      return value;
    }
    case "Geolocation": {
      // GeoJSON. Only the envelope is checked: validating geometry here would duplicate
      // a specification the client and any map library already implement.
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw errors.validation(`${field.label} must be a GeoJSON object`);
      }
      return value;
    }
    case "Float": case "Currency": case "Percent": {
      if ((typeof value !== "number" || !Number.isFinite(value)) && (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value))) throw errors.validation(`${field.label} must be numeric`); return typeof value === "number" ? String(value) : value;
    }
    case "Check": {
      if (typeof value === "boolean") return value; if (value === 0 || value === 1) return value === 1; throw errors.validation(`${field.label} must be true or false`);
    }
    case "Date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw errors.validation(`${field.label} must be YYYY-MM-DD`); return value;
    }
    case "Datetime": {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw errors.validation(`${field.label} must be an ISO datetime`); return value;
    }
    case "Time": {
      if (typeof value !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) throw errors.validation(`${field.label} must be HH:MM[:SS]`); return value;
    }
    case "JSON": {
      if (!value || typeof value !== "object") throw errors.validation(`${field.label} must be JSON`); return value;
    }
    case "Table": case "Table MultiSelect": {
      if (!Array.isArray(value)) throw errors.validation(`${field.label} must be a table`);
      if (value.length > 1000) throw errors.validation(`${field.label} exceeds the child-row limit`);
      return value.map((row, index) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`${field.label} row ${index + 1} must be an object`);
        const object = structuredClone(row) as JsonObject;
        if (typeof object.row_id !== "string" || !object.row_id) object.row_id = crypto.randomUUID();
        object.idx = index + 1; return object;
      });
    }
    default:
      if (action === "submit" && !isLayoutField(field)) throw errors.validation(`Unsupported executable field type ${field.fieldtype}`);
      return value;
  }
}

async function validateReference(
  context: ControllerContext<JsonObject>,
  field: DocFieldMeta,
  value: JsonValue | undefined,
  metadata: MetadataStore,
  source: JsonObject,
  depth = 0,
): Promise<void> {
  if (value === undefined || value === null || value === "") return;
  if (field.fieldtype === "Link" && field.options) {
    const exists = await context.reader.hasMasterRecord(context.command.tenant_id, field.options, String(value))
      || Boolean(await context.reader.getDocument(context.command.tenant_id, field.options, String(value)));
    if (!exists) throw errors.reference(`${field.options} reference is invalid or unavailable`);
  }
  if (field.fieldtype === "Dynamic Link" && field.options) {
    // The target doctype is named by ANOTHER field on the same document. This was
    // previously unvalidated entirely: a Dynamic Link could point at a doctype
    // that does not exist, or at a record that does not, and nothing objected.
    const targetDoctype = source[field.options];
    if (typeof targetDoctype !== "string" || !targetDoctype) {
      throw errors.reference(`${field.label} needs ${field.options} to name its target doctype`, { fieldname: field.options });
    }
    const exists = await context.reader.hasMasterRecord(context.command.tenant_id, targetDoctype, String(value))
      || Boolean(await context.reader.getDocument(context.command.tenant_id, targetDoctype, String(value)));
    if (!exists) throw errors.reference(`${targetDoctype} reference is invalid or unavailable`, { fieldname: field.fieldname });
  }
  if ((field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") && field.options && Array.isArray(value)) {
    if (depth >= 5) throw errors.validation(`${field.label} exceeds the child-table nesting limit`);
    const childMeta = await metadata.getDocType(context.command.tenant_id, field.options);
    if (!childMeta || !childMeta.is_child) throw errors.reference(`${field.options} child DocType is invalid or unavailable`);
    for (const [index, entry] of value.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw errors.validation(`${field.label} contains an invalid child row`);
      }
      const row = entry as JsonObject;
      for (const childField of childMeta.fields) {
        if (!["Link", "Dynamic Link", "Table", "Table MultiSelect"].includes(childField.fieldtype)) continue;
        await validateReference(context, childField, row[childField.fieldname], metadata, row, depth + 1).catch((error: unknown) => {
          if (error instanceof Error) error.message = `${field.label} row ${index + 1}: ${error.message}`;
          throw error;
        });
      }
    }
  }
}

function extractChildren(meta: DocTypeMeta, data: JsonObject): ChildRow[] {
  const children: ChildRow[] = [];
  for (const field of meta.fields) {
    if (field.fieldtype !== "Table" && field.fieldtype !== "Table MultiSelect") continue;
    const rows = data[field.fieldname]; if (!Array.isArray(rows)) continue;
    rows.forEach((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const row = value as JsonObject;
      children.push({ fieldname: field.fieldname, child_doctype: field.options ?? `${meta.name} ${field.label}`, row_id: String(row.row_id ?? crypto.randomUUID()), idx: index + 1, data: structuredClone(row) });
    });
  }
  return children;
}

function applyWorkflow(
  context: ControllerContext<JsonObject>,
  data: JsonObject,
  workflow: WorkflowMeta,
): { state: string; docstatus: 0 | 1 | 2; update?: { field: string; value: JsonValue } } {
  if (!workflow.states.length) throw errors.validation(`Workflow ${workflow.name} has no states`);
  const stateField = workflow.state_field;
  const current = context.existing ? String(context.existing.data[stateField] ?? workflow.states[0]!.state) : null;
  const requestedRaw = data[stateField] ?? data.workflow_state;
  const requested = typeof requestedRaw === "string" && requestedRaw ? requestedRaw : (current ?? workflow.states[0]!.state);
  const target = workflow.states.find((state) => state.state === requested);
  if (!target) throw errors.validation(`Unknown workflow state: ${requested}`);
  if (!context.existing) {
    const initial = workflow.states[0]!;
    if (requested !== initial.state || initial.docstatus !== 0) throw errors.validation(`New ${workflow.document_type} must start in workflow state ${initial.state}`);
    if (context.command.action !== "create") throw errors.lifecycle("Workflow document must be created before transition");
    return { state: initial.state, docstatus: initial.docstatus };
  }
  if (requested === current) {
    const currentState = workflow.states.find((state) => state.state === current);
    if (!currentState) throw errors.validation(`Current workflow state is invalid: ${current}`);
    if (context.command.action !== "save") throw errors.lifecycle(`Workflow action is required to ${context.command.action} from ${current}`);
    if (currentState.allow_edit && !context.command.actor.roles.includes(currentState.allow_edit) && !isAdministrator(context)) throw errors.permission(`Role cannot edit workflow state ${current}`);
    return { state: current, docstatus: currentState.docstatus };
  }
  const transitions = workflow.transitions.filter((transition) => transition.state === current && transition.next_state === requested);
  const transition = transitions.find((entry) => context.command.actor.roles.includes(entry.allowed_role) || isAdministrator(context));
  if (!transition) throw errors.permission(`No permitted workflow transition from ${current} to ${requested}`);
  if (blocksSelfApproval(transition, context.existing.owner, context.command.actor.user_id, context.existing.docstatus, target.docstatus)) {
    throw errors.permission("Self approval is not allowed for this transition");
  }
  if (transition.condition && !evaluateWorkflowCondition(transition.condition, data, context.existing.data)) throw errors.validation(`Workflow condition is not satisfied for ${transition.action}`);
  const expectedAction = target.docstatus === 2 ? "cancel" : target.docstatus === 1 && context.existing.docstatus === 0 ? "submit" : "save";
  if (context.command.action !== expectedAction) throw errors.lifecycle(`Transition to ${requested} requires ${expectedAction}`);
  const update = target.update_field
    ? { field: target.update_field, value: resolveWorkflowUpdateValue(target, data) }
    : undefined;
  return { state: requested, docstatus: target.docstatus, ...(update ? { update } : {}) };
}

function resolveWorkflowUpdateValue(state: WorkflowStateMeta, document: JsonObject): JsonValue {
  const configured = state.update_value ?? "";
  if (!state.evaluate_as_expression) return structuredClone(configured);
  if (typeof configured !== "string") throw errors.validation("Workflow update expression must be a string");
  const match = /^doc\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(configured.trim());
  if (!match) throw errors.validation("Workflow update expression must be a direct doc.<field> reference");
  return structuredClone(document[match[1]!] ?? null);
}

/**
 * Whether segregation of duties forbids this actor from taking this transition.
 *
 * Exported and shared because the OFFER and the ENFORCEMENT must agree. They did not:
 * `get_workflow_transitions` exempted a platform administrator and ignored the
 * docstatus condition, while this check exempts nobody. The result was a button the
 * server had offered and then refused on tap — the client behaving correctly and still
 * failing, which is the worst kind of contract bug because nothing in the client is
 * wrong to fix.
 *
 * There is deliberately NO administrator bypass. Self-approval is a segregation-of-
 * duties control; an administrator who could bypass it would make the control decorative,
 * and administrators are exactly who such a control exists to constrain.
 *
 * Only transitions that ADVANCE the docstatus are covered: approving or cancelling your
 * own request is the decision that needs a second pair of eyes, whereas moving your own
 * draft along is not.
 */
export function blocksSelfApproval(
  transition: { allow_self_approval?: boolean },
  ownerId: string,
  actorId: string,
  currentDocstatus: number,
  targetDocstatus: number,
): boolean {
  if (transition.allow_self_approval) return false;
  if (ownerId !== actorId) return false;
  return targetDocstatus > currentDocstatus;
}

function isAdministrator(context: ControllerContext<JsonObject>): boolean {
  return context.command.actor.user_id === "Administrator"
    || context.command.actor.roles.includes("Administrator")
    || context.command.actor.roles.includes("System Manager");
}

function requireExisting(context: ControllerContext<JsonObject>): CanonicalDocument<JsonObject> { if (!context.existing) throw errors.notFound(); return context.existing; }
function sameJsonValue(left: JsonValue | undefined, right: JsonValue | undefined): boolean { return JSON.stringify(left) === JSON.stringify(right); }
/**
 * `1` và `true` là CÙNG MỘT giá trị cho một ô Check — mọi client kiểu Frappe gửi 0/1.
 *
 * So bằng `JSON.stringify` thì `1 !== true`, và hậu quả rơi đúng vào ô ẩn server-enforced:
 * `Item.is_stock_item` có `default: true`, client Frappe echo `1`, kernel ném "Field is
 * server-controlled: is_stock_item" — một ô người dùng không nhìn thấy, không sửa được, và
 * không hiểu vì sao bị chặn. Đo ngày 21/08/2026: mọi lượt nhập danh mục hàng loạt gửi `1`
 * đều 417, trong khi cùng payload đổi thành `true` thì 201.
 *
 * Chính comment ở nhánh đó đã nói ý định: "accepting only that exact value keeps old clients
 * compatible". Đây là làm cho ý định ấy đúng với kiểu dữ liệu Check.
 */
function checkValue(value: JsonValue | undefined): boolean {
  return value === true || value === 1 || value === "1";
}
function sameFieldValue(field: DocFieldMeta, left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (field.fieldtype !== "Check") return sameJsonValue(left, right);
  if (left === undefined || right === undefined) return left === right;
  return checkValue(left) === checkValue(right);
}
function isEmpty(value: JsonValue | undefined): boolean { return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
