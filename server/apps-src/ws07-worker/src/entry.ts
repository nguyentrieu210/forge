import baseWorker from "./index.js";

interface Env {
  PLATFORM?: Fetcher;
}

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

interface ActorIdentity {
  user_id: string;
  roles: string[];
}

const deny = (message: string) => new Response(JSON.stringify({ message }), {
  status: 422,
  headers: { "content-type": "application/json" },
});

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function actorIdentity(request: Request): ActorIdentity {
  const encoded = request.headers.get("x-cloudforge-identity") ?? "";
  if (!encoded) return { user_id: "", roles: [] };
  try {
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const identity = JSON.parse(raw) as { actor?: { user_id?: unknown; roles?: unknown } };
    return {
      user_id: typeof identity.actor?.user_id === "string" ? identity.actor.user_id : "",
      roles: Array.isArray(identity.actor?.roles)
        ? identity.actor.roles.filter((role): role is string => typeof role === "string")
        : [],
    };
  } catch {
    return { user_id: "", roles: [] };
  }
}

function platformCaller(request: Request, env: Env): (path: string) => Promise<Response> {
  const callback = request.headers.get("x-cloudforge-callback");
  if (!callback) throw new Error("Nền tảng không cấp callback cho WS07 scope validator.");
  const base = callback.replace(/\/$/, "");
  const forwarded: Record<string, string> = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return async (path: string) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, { headers: forwarded });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function readRecord(call: (path: string) => Promise<Response>, doctype: string, name: string): Promise<Record<string, unknown> | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Record<string, unknown> }).data ?? null;
}

async function readList(
  call: (path: string) => Promise<Response>,
  doctype: string,
  filters: unknown[],
  fields: string[] = ["name", "workflow_state", "docstatus", "correction_of"],
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    filters: JSON.stringify(filters),
    fields: JSON.stringify(fields),
    limit_page_length: "50",
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query.toString()}`);
  if (!response.ok) throw new Error(`Không tra cứu được ${doctype} (HTTP ${response.status}).`);
  return rows(((await response.json()) as { data?: unknown }).data);
}

async function mergedDocument(request: Request, env: Env, subject: ValidatorSubject): Promise<Record<string, unknown>> {
  if (!subject.name || subject.action === "create" || subject.action === "insert") return { ...subject.payload };
  const current = await readRecord(platformCaller(request, env), subject.doctype, subject.name);
  return { ...(current ?? {}), ...subject.payload };
}

function elevated(roles: string[], managerRole: string): boolean {
  return roles.includes("Administrator") || roles.includes("System Manager") || roles.includes(managerRole);
}

async function technicianUser(call: (path: string) => Promise<Response>, technician: string): Promise<string> {
  if (!technician) return "";
  const record = await readRecord(call, "Service Technician", technician);
  return text(record?.user);
}

async function serviceOrderActorAllowed(request: Request, env: Env, actor: ActorIdentity, doc: Record<string, unknown>): Promise<string | null> {
  if (elevated(actor.roles, "Maintenance Manager") || !actor.roles.includes("Maintenance Technician")) return null;
  const assigned = await technicianUser(platformCaller(request, env), text(doc.technician));
  if (!assigned || assigned !== actor.user_id) return "Lệnh dịch vụ chỉ kỹ thuật viên được phân công mới được cập nhật.";
  return null;
}

async function warrantyActorAllowed(request: Request, env: Env, actor: ActorIdentity, doc: Record<string, unknown>): Promise<string | null> {
  if (elevated(actor.roles, "Maintenance Manager") || !actor.roles.includes("Maintenance Technician")) return null;
  const serviceOrder = text(doc.service_order);
  if (!serviceOrder) return "Yêu cầu bảo hành phải liên kết Lệnh dịch vụ trước khi kỹ thuật viên cập nhật.";
  const call = platformCaller(request, env);
  const order = await readRecord(call, "Service Order", serviceOrder);
  const assigned = await technicianUser(call, text(order?.technician));
  if (!assigned || assigned !== actor.user_id) return "Yêu cầu bảo hành chỉ kỹ thuật viên của Lệnh dịch vụ liên quan mới được cập nhật.";
  return null;
}

function projectTaskActorAllowed(actor: ActorIdentity, doc: Record<string, unknown>): string | null {
  if (elevated(actor.roles, "Project Manager") || !actor.roles.includes("Project User")) return null;
  if (text(doc.assignee) !== actor.user_id) return "Công việc dự án chỉ người được giao việc mới được cập nhật.";
  return null;
}

function projectTimesheetActorAllowed(actor: ActorIdentity, doc: Record<string, unknown>): string | null {
  if (elevated(actor.roles, "Project Manager") || !actor.roles.includes("Project User")) return null;
  if (text(doc.user) !== actor.user_id) return "Bảng chấm giờ dự án chỉ người lập tương ứng mới được cập nhật.";
  return null;
}

function supportTicketActorAllowed(actor: ActorIdentity, doc: Record<string, unknown>): string | null {
  if (elevated(actor.roles, "Support Manager") || !actor.roles.includes("Support User")) return null;
  const assignee = text(doc.assignee);
  if (assignee && assignee !== actor.user_id) return "Phiếu hỗ trợ chỉ agent được phân công mới được cập nhật.";
  if (!["", "Mới", "Hủy"].includes(text(doc.workflow_state)) && !assignee) return "Phiếu hỗ trợ phải được phân công trước khi agent cập nhật.";
  return null;
}

function submitted(record: Record<string, unknown> | null): boolean {
  return Boolean(record) && Number(record?.docstatus) === 1;
}

function sameIfPresent(expected: unknown, actual: unknown): boolean {
  const left = text(expected);
  const right = text(actual);
  return !left || !right || left === right;
}

function sameRequired(expected: unknown, actual: unknown): boolean {
  const left = text(expected);
  return Boolean(left) && left === text(actual);
}

function serialTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean);
}

function rowHasSerial(row: Record<string, unknown>, serialNo: string): boolean {
  if (!serialNo) return true;
  return [
    ...serialTokens(row.serial_nos),
    ...serialTokens(row.serial_no),
  ].includes(serialNo);
}

function rowItem(row: Record<string, unknown>): string {
  return text(row.item_code ?? row.item);
}

function documentHasItem(record: Record<string, unknown>, item: string, serialNo = ""): boolean {
  return rows(record.items).some((row) => rowItem(row) === item && rowHasSerial(row, serialNo));
}

function dateMillis(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw.length === 10 ? `${raw}T00:00:00Z` : raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : null;
}

function withinDate(date: unknown, start: unknown, end: unknown): boolean {
  const target = dateMillis(date);
  const from = dateMillis(start);
  const to = dateMillis(end);
  if (target === null) return false;
  if (from !== null && target < from) return false;
  if (to !== null && target > to) return false;
  return true;
}

function warrantyTerminal(state: string): boolean {
  return ["Hoàn tất", "Từ chối", "Hủy"].includes(state);
}

async function validateCorrection(
  call: (path: string) => Promise<Response>,
  doctype: "Warranty Claim" | "Service Order",
  subject: ValidatorSubject,
  doc: Record<string, unknown>,
): Promise<string | null> {
  const correctionOf = text(doc.correction_of);
  if (!correctionOf) return null;
  if (!text(doc.correction_reason)) return `${doctype}: điều chỉnh phải có lý do.`;
  if (subject.name && correctionOf === subject.name) return `${doctype}: không thể tự điều chỉnh chính mình.`;
  const source = await readRecord(call, doctype, correctionOf);
  if (!source) return `${doctype}: chứng từ gốc ${correctionOf} không tồn tại.`;
  const state = text(source.workflow_state);
  const allowed = doctype === "Warranty Claim" ? warrantyTerminal(state) : ["Hoàn tất", "Hủy"].includes(state);
  if (!allowed) return `${doctype}: chỉ được tạo điều chỉnh từ chứng từ đã kết thúc hoặc hủy.`;
  return null;
}

async function validateWarrantyClosure(
  request: Request,
  env: Env,
  subject: ValidatorSubject,
  doc: Record<string, unknown>,
): Promise<string | null> {
  const call = platformCaller(request, env);
  const correction = await validateCorrection(call, "Warranty Claim", subject, doc);
  if (correction) return correction;

  const maintenanceRequest = text(doc.maintenance_request);
  if (maintenanceRequest) {
    const duplicates = await readList(call, "Warranty Claim", [["maintenance_request", "=", maintenanceRequest]]);
    for (const candidate of duplicates) {
      const candidateName = text(candidate.name);
      if (!candidateName || candidateName === subject.name) continue;
      if (candidateName === text(doc.correction_of) && warrantyTerminal(text(candidate.workflow_state))) continue;
      return `Yêu cầu bảo hành: Maintenance Request ${maintenanceRequest} đã có Warranty Claim ${candidateName}; retry phải dùng lại chứng từ cũ hoặc tạo điều chỉnh có lineage.`;
    }
  }

  const state = text(doc.workflow_state);
  const traced = !["", "Mới"].includes(state);
  if (!traced) return null;
  if (!maintenanceRequest) return "Yêu cầu bảo hành: phải có Maintenance Request nguồn trước khi xác minh.";
  if (!text(doc.source_delivery_note)) return "Yêu cầu bảo hành: phải có Delivery Note nguồn trước khi xác minh.";
  if (!text(doc.company)) return "Yêu cầu bảo hành: phải xác định Công ty trước khi xác minh.";

  const intake = await readRecord(call, "Maintenance Request", maintenanceRequest);
  if (!intake) return `Yêu cầu bảo hành: Maintenance Request ${maintenanceRequest} không tồn tại.`;
  if (!sameRequired(doc.customer, intake.customer)) return "Yêu cầu bảo hành: khách hàng không khớp Maintenance Request nguồn.";
  if (!sameIfPresent(doc.company, intake.company)) return "Yêu cầu bảo hành: Công ty không khớp Maintenance Request nguồn.";
  if (!sameIfPresent(doc.branch, intake.branch)) return "Yêu cầu bảo hành: chi nhánh không khớp Maintenance Request nguồn.";
  if (!sameIfPresent(doc.item, intake.item)) return "Yêu cầu bảo hành: sản phẩm không khớp Maintenance Request nguồn.";
  if (!sameIfPresent(doc.serial_no, intake.serial_no)) return "Yêu cầu bảo hành: serial không khớp Maintenance Request nguồn.";
  if (!sameIfPresent(doc.source_delivery_note, intake.source_delivery_note)) return "Yêu cầu bảo hành: Delivery Note không khớp Maintenance Request nguồn.";

  const deliveryName = text(doc.source_delivery_note);
  const delivery = await readRecord(call, "Delivery Note", deliveryName);
  if (!submitted(delivery)) return `Yêu cầu bảo hành: cần Delivery Note ${deliveryName} đã submit.`;

  const eligible = text(doc.eligibility_result) === "Đủ điều kiện";
  if (!eligible) return null;

  if (!sameRequired(doc.customer, delivery?.customer)) return "Yêu cầu bảo hành: khách hàng không sở hữu Delivery Note nguồn.";
  if (!sameRequired(doc.company, delivery?.company)) return "Yêu cầu bảo hành: Delivery Note thuộc công ty khác.";
  if (!sameIfPresent(doc.branch, delivery?.branch)) return "Yêu cầu bảo hành: Delivery Note thuộc chi nhánh khác.";

  const item = text(doc.item);
  const serialNo = text(doc.serial_no);
  let serial: Record<string, unknown> | null = null;
  if (serialNo) {
    serial = await readRecord(call, "Serial No", serialNo);
    if (!serial) return `Yêu cầu bảo hành: Serial No ${serialNo} không tồn tại.`;
    if (!sameIfPresent(item, serial.item_code ?? serial.item)) return "Yêu cầu bảo hành: serial không thuộc sản phẩm yêu cầu.";
    if (!sameIfPresent(doc.customer, serial.customer)) return "Yêu cầu bảo hành: serial đang gắn với khách hàng khác.";
    if (!sameIfPresent(doc.company, serial.company)) return "Yêu cầu bảo hành: serial thuộc công ty khác.";
  }

  const serialFromDelivery = Boolean(serialNo)
    && text(serial?.reference_doctype) === "Delivery Note"
    && text(serial?.reference_name) === deliveryName;
  if (!documentHasItem(delivery!, item, serialNo) && !serialFromDelivery) {
    return "Yêu cầu bảo hành: Delivery Note nguồn không chứng minh sản phẩm/serial đã giao.";
  }

  if (["Chờ xác nhận", "Hoàn tất"].includes(state)) {
    const serviceOrderName = text(doc.service_order);
    if (!serviceOrderName) return "Yêu cầu bảo hành: phải liên kết Lệnh dịch vụ trước khi xác nhận hoàn tất.";
    const serviceOrder = await readRecord(call, "Service Order", serviceOrderName);
    if (!serviceOrder) return `Yêu cầu bảo hành: Service Order ${serviceOrderName} không tồn tại.`;
    if (text(serviceOrder.warranty_claim) !== subject.name) {
      return "Yêu cầu bảo hành: Service Order phải liên kết ngược đúng Warranty Claim này trước khi đóng hồ sơ.";
    }
    if (text(serviceOrder.maintenance_request) !== maintenanceRequest) {
      return "Yêu cầu bảo hành: Service Order không cùng Maintenance Request nguồn.";
    }
    if (!sameRequired(doc.customer, serviceOrder.customer)) return "Yêu cầu bảo hành: Service Order thuộc khách hàng khác.";
    if (!sameRequired(doc.company, serviceOrder.company)) return "Yêu cầu bảo hành: Service Order thuộc công ty khác.";
    if (!sameIfPresent(doc.branch, serviceOrder.branch)) return "Yêu cầu bảo hành: Service Order thuộc chi nhánh khác.";
    if (!sameIfPresent(item, serviceOrder.item)) return "Yêu cầu bảo hành: Service Order không cùng sản phẩm.";
    if (!sameIfPresent(serialNo, serviceOrder.serial_no)) return "Yêu cầu bảo hành: Service Order không cùng serial.";
    if (!["Chờ xác nhận", "Hoàn tất"].includes(text(serviceOrder.workflow_state))) {
      return "Yêu cầu bảo hành: Service Order phải hoàn tất xử lý trước khi đóng hồ sơ bảo hành.";
    }
  }

  const contractName = text(doc.service_contract);
  if (contractName) {
    const contract = await readRecord(call, "Service Contract", contractName);
    if (!submitted(contract) || text(contract?.workflow_state) !== "Hiệu lực") {
      return `Yêu cầu bảo hành: Service Contract ${contractName} chưa có hiệu lực.`;
    }
    if (!sameRequired(doc.customer, contract?.customer)) return "Yêu cầu bảo hành: Service Contract thuộc khách hàng khác.";
    if (!sameRequired(doc.company, contract?.company)) return "Yêu cầu bảo hành: Service Contract thuộc công ty khác.";
    if (!sameIfPresent(doc.branch, contract?.branch)) return "Yêu cầu bảo hành: Service Contract thuộc chi nhánh khác.";
    if (!withinDate(doc.claim_date, contract?.effective_from, contract?.effective_to)) {
      return "Yêu cầu bảo hành: ngày khiếu nại nằm ngoài hiệu lực Service Contract.";
    }
    const coverage = rows(contract?.covered_items).find((row) => {
      if (rowItem(row) !== item) return false;
      const coveredSerial = text(row.serial_no);
      if (coveredSerial && coveredSerial !== serialNo) return false;
      return withinDate(doc.claim_date, row.coverage_start ?? contract?.effective_from, row.coverage_end ?? contract?.effective_to);
    });
    if (!coverage) return "Yêu cầu bảo hành: Service Contract không bao phủ sản phẩm/serial tại ngày khiếu nại.";
    return null;
  }

  if (!serialNo || !serial) return "Yêu cầu bảo hành: ngoài Service Contract phải có serial để chứng minh thời hạn bảo hành.";
  if (!withinDate(doc.claim_date, undefined, serial.warranty_expiry_date)) {
    return "Yêu cầu bảo hành: serial đã hết hạn bảo hành tại ngày khiếu nại.";
  }
  return null;
}

async function validateStockReference(
  call: (path: string) => Promise<Response>,
  reference: string,
  item: string,
  serialNo: string,
  company: string,
  branch: string,
  label: string,
): Promise<string | null> {
  const stockEntry = await readRecord(call, "Stock Entry", reference);
  if (!submitted(stockEntry)) return `${label}: cần Stock Entry ${reference} đã submit.`;
  if (!sameRequired(company, stockEntry?.company)) return `${label}: Stock Entry ${reference} thuộc công ty khác.`;
  if (!sameIfPresent(branch, stockEntry?.branch)) return `${label}: Stock Entry ${reference} thuộc chi nhánh khác.`;
  if (!documentHasItem(stockEntry!, item, serialNo)) return `${label}: Stock Entry ${reference} không chứa sản phẩm/serial tương ứng.`;
  return null;
}

async function validateServiceOrderClosure(
  request: Request,
  env: Env,
  subject: ValidatorSubject,
  doc: Record<string, unknown>,
): Promise<string | null> {
  const call = platformCaller(request, env);
  const correction = await validateCorrection(call, "Service Order", subject, doc);
  if (correction) return correction;

  const state = text(doc.workflow_state);
  const finalizing = ["Chờ xác nhận", "Hoàn tất"].includes(state);
  if (!finalizing) return null;

  const company = text(doc.company);
  const branch = text(doc.branch);
  if (!company) return "Lệnh dịch vụ: phải xác định Công ty trước khi gửi xác nhận.";
  if (!text(doc.billing_mode)) return "Lệnh dịch vụ: phải xác định hình thức tính phí trước khi gửi xác nhận.";
  if (!text(doc.resolution_type)) return "Lệnh dịch vụ: phải xác định hình thức xử lý trước khi gửi xác nhận.";

  const requestName = text(doc.maintenance_request);
  const intake = await readRecord(call, "Maintenance Request", requestName);
  if (!intake) return `Lệnh dịch vụ: Maintenance Request ${requestName} không tồn tại.`;
  if (!sameRequired(doc.customer, intake.customer)) return "Lệnh dịch vụ: khách hàng không khớp Maintenance Request.";
  if (!sameIfPresent(company, intake.company)) return "Lệnh dịch vụ: Công ty không khớp Maintenance Request.";
  if (!sameIfPresent(branch, intake.branch)) return "Lệnh dịch vụ: chi nhánh không khớp Maintenance Request.";
  if (!sameIfPresent(doc.item, intake.item)) return "Lệnh dịch vụ: sản phẩm không khớp Maintenance Request.";
  if (!sameIfPresent(doc.serial_no, intake.serial_no)) return "Lệnh dịch vụ: serial không khớp Maintenance Request.";

  const billingMode = text(doc.billing_mode);
  const warrantyClaim = text(doc.warranty_claim);
  const serviceContract = text(doc.service_contract);
  if (billingMode === "Bảo hành" && !warrantyClaim) {
    return "Lệnh dịch vụ bảo hành: phải liên kết Warranty Claim đủ điều kiện.";
  }
  if (billingMode === "Bao gồm hợp đồng" && !serviceContract) {
    return "Lệnh dịch vụ theo hợp đồng: phải liên kết Service Contract có hiệu lực.";
  }
  if (warrantyClaim) {
    const claim = await readRecord(call, "Warranty Claim", warrantyClaim);
    if (!claim) return `Lệnh dịch vụ: Warranty Claim ${warrantyClaim} không tồn tại.`;
    if (text(claim.eligibility_result) !== "Đủ điều kiện") return "Lệnh dịch vụ: Warranty Claim liên quan chưa đủ điều kiện.";
    if (!sameRequired(doc.customer, claim.customer)) return "Lệnh dịch vụ: khách hàng không khớp Warranty Claim.";
    if (!sameIfPresent(doc.item, claim.item)) return "Lệnh dịch vụ: sản phẩm không khớp Warranty Claim.";
    if (!sameIfPresent(doc.serial_no, claim.serial_no)) return "Lệnh dịch vụ: serial không khớp Warranty Claim.";
    if (!sameIfPresent(company, claim.company)) return "Lệnh dịch vụ: Warranty Claim thuộc công ty khác.";
    if (!sameIfPresent(branch, claim.branch)) return "Lệnh dịch vụ: Warranty Claim thuộc chi nhánh khác.";
  }

  if (billingMode === "Bao gồm hợp đồng") {
    const contract = await readRecord(call, "Service Contract", serviceContract);
    if (!submitted(contract) || text(contract?.workflow_state) !== "Hiệu lực") {
      return `Lệnh dịch vụ theo hợp đồng: Service Contract ${serviceContract} chưa có hiệu lực.`;
    }
    if (!sameRequired(doc.customer, contract?.customer)) return "Lệnh dịch vụ theo hợp đồng: Service Contract thuộc khách hàng khác.";
    if (!sameRequired(company, contract?.company)) return "Lệnh dịch vụ theo hợp đồng: Service Contract thuộc công ty khác.";
    if (!sameIfPresent(branch, contract?.branch)) return "Lệnh dịch vụ theo hợp đồng: Service Contract thuộc chi nhánh khác.";
    const serviceDate = doc.actual_end ?? doc.actual_start ?? doc.scheduled_start;
    if (!withinDate(serviceDate, contract?.effective_from, contract?.effective_to)) {
      return "Lệnh dịch vụ theo hợp đồng: thời điểm dịch vụ nằm ngoài hiệu lực Service Contract.";
    }
    const item = text(doc.item);
    const serialNo = text(doc.serial_no);
    if (item) {
      const covered = rows(contract?.covered_items).some((row) => {
        if (rowItem(row) !== item) return false;
        const coveredSerial = text(row.serial_no);
        if (coveredSerial && coveredSerial !== serialNo) return false;
        return withinDate(serviceDate, row.coverage_start ?? contract?.effective_from, row.coverage_end ?? contract?.effective_to);
      });
      if (!covered) return "Lệnh dịch vụ theo hợp đồng: sản phẩm/serial không nằm trong phạm vi Service Contract.";
    }
  }

  for (const part of rows(doc.parts_used)) {
    const reference = text(part.stock_reference);
    if (!reference) return `Lệnh dịch vụ: linh kiện ${rowItem(part) || "không xác định"} thiếu Stock Entry chuẩn.`;
    const violation = await validateStockReference(
      call,
      reference,
      rowItem(part),
      text(part.serial_no),
      company,
      branch,
      "Lệnh dịch vụ",
    );
    if (violation) return violation;
  }

  if (billingMode === "Tính phí") {
    const invoiceName = text(doc.sales_invoice);
    if (!invoiceName) return "Lệnh dịch vụ tính phí: phải liên kết Sales Invoice chuẩn trước khi hoàn tất.";
    const invoice = await readRecord(call, "Sales Invoice", invoiceName);
    if (!submitted(invoice)) return `Lệnh dịch vụ tính phí: cần Sales Invoice ${invoiceName} đã submit.`;
    if (Boolean(invoice?.is_return)) return "Lệnh dịch vụ tính phí: không được dùng Sales Invoice hoàn trả làm hóa đơn dịch vụ.";
    if (!sameRequired(doc.customer, invoice?.customer)) return "Lệnh dịch vụ tính phí: Sales Invoice thuộc khách hàng khác.";
    if (!sameRequired(company, invoice?.company)) return "Lệnh dịch vụ tính phí: Sales Invoice thuộc công ty khác.";
    if (!sameIfPresent(branch, invoice?.branch)) return "Lệnh dịch vụ tính phí: Sales Invoice thuộc chi nhánh khác.";
  }

  if (text(doc.resolution_type) === "Thay thế") {
    const deliveryName = text(doc.replacement_delivery_note);
    const replacementSerial = text(doc.replacement_serial_no);
    if (!deliveryName || !replacementSerial) return "Lệnh dịch vụ thay thế: phải có Delivery Note và serial thay thế.";
    const delivery = await readRecord(call, "Delivery Note", deliveryName);
    if (!submitted(delivery)) return `Lệnh dịch vụ thay thế: cần Delivery Note ${deliveryName} đã submit.`;
    if (text(delivery?.issue_purpose) !== "Đổi bảo hành") return "Lệnh dịch vụ thay thế: Delivery Note phải có mục đích Đổi bảo hành.";
    if (!sameRequired(doc.customer, delivery?.customer)) return "Lệnh dịch vụ thay thế: Delivery Note thuộc khách hàng khác.";
    if (!sameRequired(company, delivery?.company)) return "Lệnh dịch vụ thay thế: Delivery Note thuộc công ty khác.";
    if (!sameIfPresent(branch, delivery?.branch)) return "Lệnh dịch vụ thay thế: Delivery Note thuộc chi nhánh khác.";
    if (!documentHasItem(delivery!, text(doc.item), replacementSerial)) {
      return "Lệnh dịch vụ thay thế: Delivery Note không chứa sản phẩm/serial thay thế.";
    }
  }

  if (text(doc.resolution_type) === "Đổi trả") {
    const returnEntry = text(doc.return_stock_entry);
    if (!returnEntry) return "Lệnh dịch vụ đổi trả: phải có Stock Entry nhận hàng trả.";
    const violation = await validateStockReference(
      call,
      returnEntry,
      text(doc.item),
      text(doc.serial_no),
      company,
      branch,
      "Lệnh dịch vụ đổi trả",
    );
    if (violation) return violation;
  }

  return null;
}

async function scopeViolation(request: Request, env: Env, actor: ActorIdentity, subject: ValidatorSubject, doc: Record<string, unknown>): Promise<string | null> {
  switch (subject.doctype) {
    case "Service Order": return serviceOrderActorAllowed(request, env, actor, doc);
    case "Warranty Claim": return warrantyActorAllowed(request, env, actor, doc);
    case "Project Task": return projectTaskActorAllowed(actor, doc);
    case "Project Timesheet": return projectTimesheetActorAllowed(actor, doc);
    case "Support Ticket": return supportTicketActorAllowed(actor, doc);
    default: return null;
  }
}

async function closureViolation(request: Request, env: Env, subject: ValidatorSubject, doc: Record<string, unknown>): Promise<string | null> {
  switch (subject.doctype) {
    case "Warranty Claim": return validateWarrantyClosure(request, env, subject, doc);
    case "Service Order": return validateServiceOrderClosure(request, env, subject, doc);
    default: return null;
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/hooks/validate" || request.method !== "POST") return baseWorker.fetch(request, env);

    const actor = actorIdentity(request);
    if (!actor.user_id) return deny("WS07 validator không nhận được danh tính người dùng đã xác thực.");

    let subject: ValidatorSubject;
    try {
      const body = await request.clone().json() as Partial<ValidatorSubject>;
      if (!body || typeof body.doctype !== "string" || typeof body.name !== "string" || typeof body.action !== "string" || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
        return deny("WS07 scope validator: payload không hợp lệ.");
      }
      subject = body as ValidatorSubject;
    } catch {
      return deny("WS07 scope validator: JSON không hợp lệ.");
    }

    try {
      const doc = await mergedDocument(request, env, subject);
      const scoped = await scopeViolation(request, env, actor, subject, doc);
      if (scoped) return deny(scoped);
      const closure = await closureViolation(request, env, subject, doc);
      if (closure) return deny(closure);
      return baseWorker.fetch(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "WS07 scope validator không thể kiểm tra thay đổi.";
      return new Response(JSON.stringify({ message }), { status: 503, headers: { "content-type": "application/json" } });
    }
  },
};
