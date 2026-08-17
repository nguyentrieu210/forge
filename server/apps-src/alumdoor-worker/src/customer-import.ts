export type CustomerImportStatus =
  | "READY_CREATE"
  | "DUPLICATE_EXACT"
  | "DUPLICATE_CANDIDATE"
  | "INVALID_REQUIRED"
  | "INVALID_REFERENCE"
  | "INVALID_VALUE";

export interface CustomerImportSourceRow {
  row_number: number;
  values: Record<string, unknown>;
}

export interface CustomerImportResultRow {
  row_number: number;
  status: CustomerImportStatus;
  normalized: Record<string, unknown>;
  field_errors: Record<string, string>;
  duplicate_matches: Array<{ field: string; value: string; name: string }>;
  warnings: string[];
}

interface CustomerImportEnv { PLATFORM?: Fetcher }
interface CustomerRecord { name?: string; customer_name?: string; tax_id?: string; phone?: string; email?: string }
interface EmployeeRecord { name?: string; employee_status?: string }
interface ProvinceRecord { name?: string }
interface WardRecord { name?: string; province?: string }

const ALLOWED_FIELDS = new Set([
  "customer_name", "price_group", "account_manager", "contact_person", "phone", "email",
  "install_province", "install_ward", "install_address_line1", "shipping_note", "tax_id",
  "credit_limit", "payment_terms", "note", "disabled",
]);
const PAYMENT_TERMS = new Set(["Trả ngay", "7 ngày", "15 ngày", "30 ngày", "45 ngày"]);
const PRICE_GROUPS = new Set(["Đại lý", "Lẻ"]);
const MAX_ROWS = 500;

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function normalizedEmail(value: unknown): string { return text(value).toLocaleLowerCase("en"); }
function normalizedPhone(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  return plus + raw.replace(/[^0-9]/g, "");
}
function normalizedTaxId(value: unknown): string { return text(value).replace(/\s+/g, ""); }
function emailLooksValid(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function parseDisabled(value: unknown): { value?: boolean; error?: string } {
  if (value === undefined || value === null || value === "") return { value: false };
  if (value === true || value === 1) return { value: true };
  if (value === false || value === 0) return { value: false };
  const v = text(value).toLocaleLowerCase("vi");
  if (["1", "true", "yes", "có", "co"].includes(v)) return { value: true };
  if (["0", "false", "no", "không", "khong"].includes(v)) return { value: false };
  return { error: "Chỉ nhận 0/1, true/false, yes/no hoặc có/không." };
}

export function normalizeCustomerImportRow(values: Record<string, unknown>): {
  normalized: Record<string, unknown>;
  errors: Record<string, string>;
} {
  const normalized: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const key of Object.keys(values)) {
    if (!ALLOWED_FIELDS.has(key)) errors[key] = "Cột đích không được Customer Import V1 hỗ trợ.";
  }

  const customerName = text(values.customer_name);
  const priceGroup = text(values.price_group);
  if (!customerName) errors.customer_name = "Tên khách hàng là bắt buộc.";
  else normalized.customer_name = customerName;
  if (!priceGroup) errors.price_group = "Nhóm giá là bắt buộc; không được tự đoán.";
  else if (!PRICE_GROUPS.has(priceGroup)) errors.price_group = "Nhóm giá chỉ được là Đại lý hoặc Lẻ.";
  else normalized.price_group = priceGroup;

  const simpleFields = [
    "account_manager", "contact_person", "install_province", "install_ward",
    "install_address_line1", "shipping_note", "note",
  ] as const;
  for (const key of simpleFields) {
    const value = text(values[key]);
    if (value) normalized[key] = value;
  }

  const phone = normalizedPhone(values.phone);
  if (phone) normalized.phone = phone;
  const email = normalizedEmail(values.email);
  if (email) {
    if (!emailLooksValid(email)) errors.email = "Email không đúng định dạng.";
    else normalized.email = email;
  }
  const taxId = normalizedTaxId(values.tax_id);
  if (taxId) normalized.tax_id = taxId;

  if (values.credit_limit !== undefined && values.credit_limit !== null && text(values.credit_limit) !== "") {
    const raw = typeof values.credit_limit === "string"
      ? values.credit_limit.replace(/[,.](?=\d{3}(?:\D|$))/g, "").replace(",", ".")
      : values.credit_limit;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) errors.credit_limit = "Hạn mức công nợ phải là số không âm.";
    else normalized.credit_limit = number;
  }

  const payment = text(values.payment_terms);
  if (payment) {
    if (!PAYMENT_TERMS.has(payment)) errors.payment_terms = "Điều khoản thanh toán không hợp lệ.";
    else normalized.payment_terms = payment;
  }

  const disabled = parseDisabled(values.disabled);
  if (disabled.error) errors.disabled = disabled.error;
  else normalized.disabled = disabled.value ?? false;
  return { normalized, errors };
}

function callbackCaller(request: Request, env: CustomerImportEnv) {
  const base = request.headers.get("x-cloudforge-callback")?.replace(/\/$/, "");
  if (!base || !env.PLATFORM) throw new Error("Thiếu PLATFORM callback để kiểm tra Customer Import.");
  const forwarded: Record<string, string> = {};
  for (const key of ["authorization", "x-cloudforge-app", "x-cloudforge-identity", "x-cloudforge-identity-signature"]) {
    const value = request.headers.get(key);
    if (value) forwarded[key] = value;
  }
  return (path: string, init: RequestInit = {}) => env.PLATFORM!.fetch(new Request(`${base}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
  }));
}

async function listAll<T>(call: ReturnType<typeof callbackCaller>, doctype: string, fields: string[]): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let start = 0; start < 10000; start += pageSize) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_start: String(start),
      limit_page_length: String(pageSize),
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (!response.ok) throw new Error(`Không đọc được ${doctype} (HTTP ${response.status}).`);
    const rows = ((await response.json()) as { data?: T[] }).data ?? [];
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
  throw new Error(`${doctype} vượt 10.000 bản ghi; từ chối dry-run để tránh kiểm tra trùng không đầy đủ.`);
}

function classifyValidation(errors: Record<string, string>): CustomerImportStatus {
  if (errors.customer_name || errors.price_group) return "INVALID_REQUIRED";
  if (Object.keys(errors).some((key) => ["account_manager", "install_province", "install_ward"].includes(key))) return "INVALID_REFERENCE";
  return "INVALID_VALUE";
}

function addDuplicate(
  row: CustomerImportResultRow,
  field: string,
  value: string,
  name: string,
  exact: boolean,
) {
  if (!value || row.duplicate_matches.some((match) => match.field === field && match.name === name)) return;
  row.duplicate_matches.push({ field, value, name });
  row.status = exact ? "DUPLICATE_EXACT" : row.status === "DUPLICATE_EXACT" ? row.status : "DUPLICATE_CANDIDATE";
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function dryRunRows(request: Request, env: CustomerImportEnv, rows: CustomerImportSourceRow[]) {
  if (!rows.length) throw new Error("Không có dòng khách hàng để kiểm tra.");
  if (rows.length > MAX_ROWS) throw new Error(`Customer Import V1 nhận tối đa ${MAX_ROWS} dòng mỗi lượt.`);
  const call = callbackCaller(request, env);
  const [customers, employees, provinces, wards] = await Promise.all([
    listAll<CustomerRecord>(call, "Customer", ["name", "customer_name", "tax_id", "phone", "email"]),
    listAll<EmployeeRecord>(call, "Employee", ["name", "employee_status"]),
    listAll<ProvinceRecord>(call, "Tỉnh Thành", ["name"]),
    listAll<WardRecord>(call, "Phường Xã", ["name", "province"]),
  ]);
  const employeeMap = new Map(employees.map((row) => [text(row.name), row]));
  const provinceSet = new Set(provinces.map((row) => text(row.name)).filter(Boolean));
  const wardMap = new Map(wards.map((row) => [text(row.name), row]));
  const results: CustomerImportResultRow[] = rows.map((source) => {
    const normalizedRow = normalizeCustomerImportRow(source.values ?? {});
    return {
      row_number: Number(source.row_number),
      status: Object.keys(normalizedRow.errors).length ? classifyValidation(normalizedRow.errors) : "READY_CREATE",
      normalized: normalizedRow.normalized,
      field_errors: normalizedRow.errors,
      duplicate_matches: [],
      warnings: [],
    };
  });

  for (const row of results) {
    if (row.status !== "READY_CREATE") continue;
    const accountManager = text(row.normalized.account_manager);
    if (accountManager) {
      const employee = employeeMap.get(accountManager);
      if (!employee) row.field_errors.account_manager = "Nhân viên bán hàng không tồn tại.";
      else if (text(employee.employee_status) !== "Đang làm việc") row.field_errors.account_manager = "Nhân viên bán hàng không ở trạng thái Đang làm việc.";
    }
    const province = text(row.normalized.install_province);
    const ward = text(row.normalized.install_ward);
    if (province && !provinceSet.has(province)) row.field_errors.install_province = "Tỉnh/Thành phố không tồn tại.";
    if (ward) {
      const wardRecord = wardMap.get(ward);
      if (!wardRecord) row.field_errors.install_ward = "Xã/Phường không tồn tại.";
      else if (!province) row.field_errors.install_province = "Phải chọn Tỉnh/Thành phố khi có Xã/Phường.";
      else if (text(wardRecord.province) !== province) row.field_errors.install_ward = "Xã/Phường không thuộc Tỉnh/Thành phố đã chọn.";
    }
    if (Object.keys(row.field_errors).length) row.status = "INVALID_REFERENCE";
  }

  const existingName = new Map<string, string>();
  const existingTax = new Map<string, string>();
  const existingPhone = new Map<string, string>();
  const existingEmail = new Map<string, string>();
  for (const customer of customers) {
    const name = text(customer.name ?? customer.customer_name);
    const customerName = text(customer.customer_name ?? customer.name).toLocaleLowerCase("vi");
    if (customerName) existingName.set(customerName, name);
    const tax = normalizedTaxId(customer.tax_id); if (tax) existingTax.set(tax, name);
    const phone = normalizedPhone(customer.phone); if (phone) existingPhone.set(phone, name);
    const email = normalizedEmail(customer.email); if (email) existingEmail.set(email, name);
  }

  const batchMaps = {
    customer_name: new Map<string, number>(), tax_id: new Map<string, number>(), phone: new Map<string, number>(), email: new Map<string, number>(),
  };
  for (const row of results) {
    if (row.status !== "READY_CREATE") continue;
    const customerName = text(row.normalized.customer_name);
    const nameKey = customerName.toLocaleLowerCase("vi");
    const tax = normalizedTaxId(row.normalized.tax_id);
    const phone = normalizedPhone(row.normalized.phone);
    const email = normalizedEmail(row.normalized.email);
    const nameHit = existingName.get(nameKey); if (nameHit) addDuplicate(row, "customer_name", customerName, nameHit, true);
    const taxHit = tax && existingTax.get(tax); if (taxHit) addDuplicate(row, "tax_id", tax, taxHit, false);
    const phoneHit = phone && existingPhone.get(phone); if (phoneHit) addDuplicate(row, "phone", phone, phoneHit, false);
    const emailHit = email && existingEmail.get(email); if (emailHit) addDuplicate(row, "email", email, emailHit, false);

    for (const [field, key] of [["customer_name", nameKey], ["tax_id", tax], ["phone", phone], ["email", email]] as const) {
      if (!key) continue;
      const previous = batchMaps[field].get(key);
      if (previous !== undefined) {
        addDuplicate(row, field, key, `dòng ${previous}`, field === "customer_name");
        const prior = results.find((candidate) => candidate.row_number === previous);
        if (prior && (prior.status === "READY_CREATE" || prior.status === "DUPLICATE_CANDIDATE")) addDuplicate(prior, field, key, `dòng ${row.row_number}`, field === "customer_name");
      } else batchMaps[field].set(key, row.row_number);
    }
  }

  const canonicalForHash = results.map((row) => ({ row_number: row.row_number, normalized: row.normalized }));
  const dryRunToken = await sha256(JSON.stringify(canonicalForHash));
  const count = (status: CustomerImportStatus) => results.filter((row) => row.status === status).length;
  const duplicate = count("DUPLICATE_EXACT") + count("DUPLICATE_CANDIDATE");
  const invalid = count("INVALID_REQUIRED") + count("INVALID_REFERENCE") + count("INVALID_VALUE");
  return {
    dry_run_token: dryRunToken,
    rows: results,
    summary: { total: results.length, ready: count("READY_CREATE"), duplicate, invalid, warnings: results.reduce((sum, row) => sum + row.warnings.length, 0) },
  };
}

export async function handleCustomerImportRequest(request: Request, env: CustomerImportEnv, method: string): Promise<Response> {
  try {
    if (request.method !== "POST") return Response.json({ message: "Customer Import chỉ nhận POST." }, { status: 405 });
    const body = await request.clone().json().catch(() => ({})) as { args?: Record<string, unknown> };
    const args = body.args ?? {};
    const rows = Array.isArray(args.rows) ? args.rows.filter((row): row is CustomerImportSourceRow => Boolean(row) && typeof row === "object") : [];
    const dry = await dryRunRows(request, env, rows);
    if (method === "alumdoor.customer_import.dry_run") return Response.json(dry);
    if (method !== "alumdoor.customer_import.commit") return Response.json({ message: "Customer Import method không tồn tại." }, { status: 404 });

    const suppliedToken = text(args.dry_run_token);
    if (!suppliedToken || suppliedToken !== dry.dry_run_token) {
      return Response.json({ message: "Dry-run đã cũ hoặc dữ liệu đã thay đổi. Hãy kiểm tra lại trước khi nhập." }, { status: 409 });
    }
    const batchId = text(args.batch_id);
    if (!batchId || batchId.length > 120) return Response.json({ message: "batch_id là bắt buộc và tối đa 120 ký tự." }, { status: 422 });

    const call = callbackCaller(request, env);
    const results: Array<Record<string, unknown>> = [];
    let imported = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of dry.rows) {
      if (row.status !== "READY_CREATE") {
        skipped += 1;
        results.push({ row_number: row.row_number, status: "skipped", reason: row.status, duplicate_matches: row.duplicate_matches, field_errors: row.field_errors });
        continue;
      }
      const response = await call("resource/Customer", { method: "POST", body: JSON.stringify(row.normalized) });
      if (!response.ok) {
        failed += 1;
        const detail = await response.text();
        results.push({ row_number: row.row_number, status: "failed", message: detail.slice(0, 300) || `HTTP ${response.status}` });
        continue;
      }
      const payload = await response.json().catch(() => ({})) as { data?: { name?: string } };
      imported += 1;
      results.push({ row_number: row.row_number, status: "imported", name: payload.data?.name ?? text(row.normalized.customer_name) });
    }
    return Response.json({
      batch_id: batchId,
      dry_run_token: dry.dry_run_token,
      imported,
      failed,
      skipped,
      results,
      retry_safe: true,
      semantics: "create-only; failed retries are deduped by canonical Customer identity before create",
    }, { status: failed ? 207 : 201 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Customer Import thất bại." }, { status: 422 });
  }
}
