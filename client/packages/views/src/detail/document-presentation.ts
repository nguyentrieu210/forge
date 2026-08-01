import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";

export type DocumentArchetype =
  | "master"
  | "transaction"
  | "inventory"
  | "production"
  | "approval"
  | "ledger"
  | "analysis"
  | "generic";

export type PresentationValueFormat = "text" | "number" | "currency" | "percent" | "date" | "datetime";
export type PresentationStatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface DocumentPresentationMetricConfig {
  field: string;
  label?: string;
  format?: PresentationValueFormat;
}

export interface DocumentPresentationProgressConfig {
  field?: string;
  steps: string[];
}

/**
 * Presentation Contract V2.
 *
 * Đây là extension thuần presentation: không cấp quyền, không đổi workflow và không thay
 * canonical form policy. Metadata không khai `presentation` vẫn được suy an toàn từ field
 * đang có; metadata khai explicit chỉ được dùng khi field đó tồn tại trong meta đã qua
 * `resolveFormRenderPolicy()`, vì vậy field internal/server-owned không thể bị kéo ngược ra UI.
 */
export interface DocumentPresentationConfig {
  enabled?: boolean;
  archetype?: DocumentArchetype;
  eyebrow?: string;
  titleField?: string;
  subtitleFields?: string[];
  statusField?: string;
  metrics?: DocumentPresentationMetricConfig[];
  contextFields?: string[];
  progress?: DocumentPresentationProgressConfig;
}

export interface ResolvedPresentationMetric {
  field: string;
  label: string;
  value: unknown;
  format: PresentationValueFormat;
}

export interface ResolvedPresentationContextItem {
  field: string;
  label: string;
  value: unknown;
  format: PresentationValueFormat;
}

export interface ResolvedPresentationProgressStep {
  label: string;
  state: "done" | "active" | "todo";
}

export interface ResolvedDocumentPresentation {
  archetype: DocumentArchetype;
  eyebrow: string;
  title: string;
  subtitle: string;
  status?: string;
  statusTone: PresentationStatusTone;
  metrics: ResolvedPresentationMetric[];
  contextItems: ResolvedPresentationContextItem[];
  progress: ResolvedPresentationProgressStep[];
}

const ARCHETYPE_LABELS: Record<DocumentArchetype, string> = {
  master: "Hồ sơ nghiệp vụ",
  transaction: "Chứng từ giao dịch",
  inventory: "Biến động kho",
  production: "Thực thi sản xuất",
  approval: "Phê duyệt",
  ledger: "Hạch toán",
  analysis: "Phân tích",
  generic: "Chứng từ",
};

const TITLE_CANDIDATES: Record<DocumentArchetype, string[]> = {
  master: ["customer_name", "supplier_name", "item_name", "employee_name", "full_name", "title", "subject"],
  transaction: ["customer", "supplier", "party", "project", "title", "subject"],
  inventory: ["purpose", "warehouse", "from_warehouse", "to_warehouse", "title"],
  production: ["production_item", "item_name", "workstation", "title"],
  approval: ["subject", "request_type", "title"],
  ledger: ["party", "account", "mode_of_payment", "title"],
  analysis: ["report_name", "title", "subject"],
  generic: ["title", "subject"],
};

const SUBTITLE_CANDIDATES: Record<DocumentArchetype, string[]> = {
  master: ["customer_group", "supplier_group", "item_group", "territory", "disabled"],
  transaction: ["transaction_date", "posting_date", "delivery_date", "company"],
  inventory: ["posting_date", "posting_time", "company"],
  production: ["planned_start_date", "planned_end_date", "company"],
  approval: ["requester", "owner", "creation"],
  ledger: ["posting_date", "company", "cost_center"],
  analysis: ["company", "from_date", "to_date"],
  generic: ["company", "posting_date", "modified"],
};

const METRIC_CANDIDATES: Record<DocumentArchetype, string[]> = {
  master: ["outstanding_amount", "credit_limit", "valuation_rate", "standard_rate", "disabled"],
  transaction: ["grand_total", "rounded_total", "outstanding_amount", "advance_paid", "total_qty", "total"],
  inventory: ["total_qty", "total_outgoing_value", "total_incoming_value", "difference_amount", "total_amount"],
  production: ["qty", "produced_qty", "process_loss_qty", "planned_operating_cost", "actual_operating_cost"],
  approval: ["amount", "grand_total", "priority"],
  ledger: ["paid_amount", "received_amount", "total_debit", "total_credit", "difference", "outstanding_amount"],
  analysis: ["total", "count", "amount"],
  generic: ["grand_total", "total", "amount", "qty"],
};

const CONTEXT_CANDIDATES: Record<DocumentArchetype, string[]> = {
  master: ["customer_group", "supplier_group", "item_group", "territory", "tax_id", "mobile_no", "email_id", "disabled"],
  transaction: ["company", "transaction_date", "posting_date", "delivery_date", "currency", "set_warehouse", "project", "cost_center"],
  inventory: ["company", "posting_date", "posting_time", "from_warehouse", "to_warehouse", "purpose"],
  production: ["company", "production_item", "planned_start_date", "planned_end_date", "wip_warehouse", "fg_warehouse"],
  approval: ["requester", "department", "priority", "creation", "owner"],
  ledger: ["company", "posting_date", "party_type", "party", "account", "mode_of_payment", "cost_center"],
  analysis: ["company", "from_date", "to_date", "modified"],
  generic: ["company", "posting_date", "owner", "modified"],
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length ? items : undefined;
}

function explicitPresentation(meta: DocTypeMeta): DocumentPresentationConfig | undefined {
  const raw = asRecord((meta as unknown as Record<string, unknown>).presentation);
  if (!raw) return undefined;
  const archetype = typeof raw.archetype === "string" && raw.archetype in ARCHETYPE_LABELS
    ? raw.archetype as DocumentArchetype
    : undefined;
  const metrics = Array.isArray(raw.metrics)
    ? raw.metrics.flatMap((entry) => {
        const metric = asRecord(entry);
        if (!metric || typeof metric.field !== "string" || !metric.field.trim()) return [];
        const format = typeof metric.format === "string" && ["text", "number", "currency", "percent", "date", "datetime"].includes(metric.format)
          ? metric.format as PresentationValueFormat
          : undefined;
        return [{ field: metric.field, label: typeof metric.label === "string" ? metric.label : undefined, format }];
      })
    : undefined;
  const progressRaw = asRecord(raw.progress);
  const progressSteps = asStringArray(progressRaw?.steps);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    archetype,
    eyebrow: typeof raw.eyebrow === "string" ? raw.eyebrow : undefined,
    titleField: typeof raw.titleField === "string" ? raw.titleField : undefined,
    subtitleFields: asStringArray(raw.subtitleFields),
    statusField: typeof raw.statusField === "string" ? raw.statusField : undefined,
    metrics,
    contextFields: asStringArray(raw.contextFields),
    progress: progressSteps ? {
      field: typeof progressRaw?.field === "string" ? progressRaw.field : undefined,
      steps: progressSteps,
    } : undefined,
  };
}

function fieldMap(meta: DocTypeMeta): Map<string, DocField> {
  return new Map((meta.fields ?? []).map((field) => [field.fieldname, field]));
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);
}

function scalarText(value: unknown): string {
  if (!hasValue(value)) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function fieldFormat(field?: DocField, explicit?: PresentationValueFormat): PresentationValueFormat {
  if (explicit) return explicit;
  const type = field?.fieldtype ?? "";
  if (type === "Currency") return "currency";
  if (["Int", "Float", "Long Int", "Decimal"].includes(type)) return "number";
  if (type === "Percent") return "percent";
  if (type === "Date") return "date";
  if (type === "Datetime") return "datetime";
  return "text";
}

function uniqueExisting(candidates: string[] | undefined, fields: Map<string, DocField>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates ?? []) {
    if (!candidate || seen.has(candidate) || !fields.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

export function inferDocumentArchetype(doctype: string): DocumentArchetype {
  const name = doctype.toLocaleLowerCase("en");
  if (/stock entry|stock reconciliation|material request|delivery note|purchase receipt/.test(name)) return "inventory";
  if (/work order|job card|production|manufactur|operation/.test(name)) return "production";
  if (/payment|journal entry|ledger|invoice|expense|account/.test(name)) return "ledger";
  if (/approval|request|leave application|expense claim/.test(name)) return "approval";
  if (/report|dashboard|analysis|analytics/.test(name)) return "analysis";
  if (/order|quotation|quote|receipt|delivery|contract/.test(name)) return "transaction";
  if (/customer|supplier|item|employee|warehouse|project|contact|address|uom|brand|manufacturer/.test(name)) return "master";
  return "generic";
}

export function presentationStatusTone(status: unknown): PresentationStatusTone {
  const normalized = scalarText(status).toLocaleLowerCase("vi");
  if (!normalized) return "neutral";
  if (/cancel|reject|fail|error|trễ|quá hạn|overdue|blocked|thiếu/.test(normalized)) return "danger";
  if (/draft|pending|chờ|hold|warning|cảnh báo|partial|một phần/.test(normalized)) return "warning";
  if (/complete|completed|done|approved|submitted|paid|closed|hoàn tất|đã duyệt|đã giao|đã thu/.test(normalized)) return "success";
  if (/open|active|progress|processing|đang|in progress/.test(normalized)) return "info";
  return "neutral";
}

function labelFor(field: DocField | undefined, fallback: string): string {
  return field?.label?.trim() || fallback.replaceAll("_", " ");
}

export function formatPresentationValue(value: unknown, format: PresentationValueFormat): string {
  if (!hasValue(value)) return "—";
  if (format === "currency") {
    const number = Number(value);
    return Number.isFinite(number)
      ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(number)
      : scalarText(value) || "—";
  }
  if (format === "number") {
    const number = Number(value);
    return Number.isFinite(number)
      ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(number)
      : scalarText(value) || "—";
  }
  if (format === "percent") {
    const number = Number(value);
    return Number.isFinite(number)
      ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(number)}%`
      : scalarText(value) || "—";
  }
  if (format === "date" || format === "datetime") {
    const text = scalarText(value);
    const date = text ? new Date(text.includes("T") ? text : text.replace(" ", "T")) : undefined;
    if (date && !Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("vi-VN", format === "date"
        ? { day: "2-digit", month: "2-digit", year: "numeric" }
        : { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
    }
    return text || "—";
  }
  return scalarText(value) || "—";
}

export function resolveDocumentPresentation(meta: DocTypeMeta, doc: Doc): ResolvedDocumentPresentation | null {
  const explicit = explicitPresentation(meta);
  if (explicit?.enabled === false) return null;

  const fields = fieldMap(meta);
  const archetype = explicit?.archetype ?? inferDocumentArchetype(meta.name);
  const titleCandidates = uniqueExisting(
    [explicit?.titleField, meta.title_field, ...TITLE_CANDIDATES[archetype]].filter((item): item is string => Boolean(item)),
    fields,
    1,
  );
  const titleField = titleCandidates[0];
  const title = scalarText(titleField ? doc[titleField] : undefined) || scalarText(doc.name) || meta.label || meta.name;

  const subtitleFields = uniqueExisting(explicit?.subtitleFields ?? SUBTITLE_CANDIDATES[archetype], fields, 3);
  const subtitleValues = subtitleFields
    .map((fieldname) => scalarText(doc[fieldname]))
    .filter(Boolean);
  const identity = scalarText(doc.name);
  const subtitle = [identity && identity !== title ? identity : "", ...subtitleValues].filter(Boolean).join(" · ") || (meta.label ?? meta.name);

  const statusField = uniqueExisting(
    [explicit?.statusField, "workflow_state", "status", "docstatus"].filter((item): item is string => Boolean(item)),
    fields,
    1,
  )[0];
  const statusValue = statusField ? doc[statusField] : undefined;
  const status = scalarText(statusValue);

  const metricConfig = explicit?.metrics?.length
    ? explicit.metrics
    : uniqueExisting(METRIC_CANDIDATES[archetype], fields, 4).map((field) => ({ field }));
  const metrics = metricConfig.flatMap((metric) => {
    const field = fields.get(metric.field);
    if (!field || !hasValue(doc[metric.field])) return [];
    return [{
      field: metric.field,
      label: metric.label?.trim() || labelFor(field, metric.field),
      value: doc[metric.field],
      format: fieldFormat(field, metric.format),
    } satisfies ResolvedPresentationMetric];
  }).slice(0, 4);

  const contextFields = uniqueExisting(explicit?.contextFields ?? CONTEXT_CANDIDATES[archetype], fields, 8);
  const contextItems = contextFields.flatMap((fieldname) => {
    const field = fields.get(fieldname);
    const value = doc[fieldname];
    if (!field || !hasValue(value)) return [];
    return [{
      field: fieldname,
      label: labelFor(field, fieldname),
      value,
      format: fieldFormat(field),
    } satisfies ResolvedPresentationContextItem];
  });

  let progress: ResolvedPresentationProgressStep[] = [];
  if (explicit?.progress?.steps?.length) {
    const progressField = explicit.progress.field ?? statusField;
    const current = scalarText(progressField ? doc[progressField] : undefined).toLocaleLowerCase("vi");
    const activeIndex = explicit.progress.steps.findIndex((step) => step.toLocaleLowerCase("vi") === current);
    progress = explicit.progress.steps.map((label, index) => ({
      label,
      state: activeIndex < 0 ? "todo" : index < activeIndex ? "done" : index === activeIndex ? "active" : "todo",
    }));
  }

  return {
    archetype,
    eyebrow: explicit?.eyebrow?.trim() || ARCHETYPE_LABELS[archetype],
    title,
    subtitle,
    status: status || undefined,
    statusTone: presentationStatusTone(statusValue),
    metrics,
    contextItems,
    progress,
  };
}
