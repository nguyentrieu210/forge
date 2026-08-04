interface Env {
  PLATFORM?: Fetcher;
}

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

const WS07_APPS = new Set(["maintenance", "projects", "support"]);
const PROJECT_DEPENDENCY_TYPES = new Set(["Finish-to-Start", "Start-to-Start", "Finish-to-Finish", "Start-to-Finish"]);

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});
const accept = () => json({ ok: true });
const refuse = (message: string) => json({ message }, 422);

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || text(value).toLowerCase() === "true";
}

function numberValue(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : null;
}

function timeValue(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 3600 + minute * 60 + second;
}

function orderedDates(doc: Record<string, unknown>, startField: string, endField: string, label: string): string | null {
  const startRaw = text(doc[startField]);
  const endRaw = text(doc[endField]);
  if (!startRaw || !endRaw) return null;
  const start = dateValue(startRaw);
  const end = dateValue(endRaw);
  if (start === null || end === null) return `${label}: thời gian không hợp lệ.`;
  if (end < start) return `${label}: thời điểm kết thúc không được trước thời điểm bắt đầu.`;
  return null;
}

function nonNegative(value: unknown): boolean {
  const number = numberValue(value);
  return number !== null && number >= 0;
}

function positive(value: unknown): boolean {
  const number = numberValue(value);
  return number !== null && number > 0;
}

function percentage(value: unknown): boolean {
  const number = numberValue(value);
  return number !== null && number >= 0 && number <= 100;
}

function platformCaller(request: Request, env: Env): (path: string) => Promise<Response> {
  const callback = request.headers.get("x-cloudforge-callback");
  if (!callback) throw new Error("Nền tảng không cấp callback cho WS07 validator.");
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

async function mergedDocument(request: Request, env: Env, subject: ValidatorSubject): Promise<Record<string, unknown>> {
  if (!subject.name || subject.action === "create" || subject.action === "insert") return { ...subject.payload };
  const call = platformCaller(request, env);
  const response = await call(`resource/${encodeURIComponent(subject.doctype)}/${encodeURIComponent(subject.name)}`);
  if (response.status === 404) return { ...subject.payload };
  if (!response.ok) throw new Error(`Không đọc được ${subject.doctype} ${subject.name} (HTTP ${response.status}).`);
  const current = ((await response.json()) as { data?: Record<string, unknown> }).data ?? {};
  return { ...current, ...subject.payload };
}

function validateServiceContract(doc: Record<string, unknown>): string | null {
  const order = orderedDates(doc, "effective_from", "effective_to", "Hợp đồng dịch vụ");
  if (order) return order;
  if (!positive(doc.response_hours) || !positive(doc.resolution_hours)) {
    return "Hợp đồng dịch vụ: thời gian phản hồi và xử lý phải lớn hơn 0.";
  }
  if (Number(doc.response_hours) > Number(doc.resolution_hours)) {
    return "Hợp đồng dịch vụ: thời gian phản hồi không được lớn hơn thời gian xử lý.";
  }
  if (!nonNegative(doc.visits_included ?? 0)) return "Hợp đồng dịch vụ: số lượt dịch vụ không được âm.";

  const coveredItems = rows(doc.covered_items);
  if (coveredItems.length === 0) return "Hợp đồng dịch vụ: phải khai báo ít nhất một sản phẩm/phạm vi được bao phủ.";
  const contractStart = dateValue(doc.effective_from);
  const contractEnd = dateValue(doc.effective_to);
  const coverageKeys = new Set<string>();
  for (const row of coveredItems) {
    const item = text(row.item);
    const coverageType = text(row.coverage_type);
    if (!item || !coverageType) return "Hợp đồng dịch vụ: mỗi dòng phạm vi phải có sản phẩm và loại phạm vi.";
    const coverageOrder = orderedDates(row, "coverage_start", "coverage_end", `Phạm vi ${item}`);
    if (coverageOrder) return coverageOrder;
    const coverageStart = dateValue(row.coverage_start);
    const coverageEnd = dateValue(row.coverage_end);
    if (coverageStart !== null && contractStart !== null && coverageStart < contractStart) {
      return `Hợp đồng dịch vụ: phạm vi ${item} không được bắt đầu trước hiệu lực hợp đồng.`;
    }
    if (coverageEnd !== null && contractEnd !== null && coverageEnd > contractEnd) {
      return `Hợp đồng dịch vụ: phạm vi ${item} không được kết thúc sau hiệu lực hợp đồng.`;
    }
    const key = `${item}\u0000${text(row.serial_no)}\u0000${coverageType}`;
    if (coverageKeys.has(key)) return `Hợp đồng dịch vụ: phạm vi ${item} bị khai báo trùng.`;
    coverageKeys.add(key);
  }
  if (text(doc.workflow_state) === "Hủy" && !text(doc.cancel_reason)) return "Hợp đồng dịch vụ: hủy hợp đồng phải có lý do.";
  return null;
}

function validateWarrantyClaim(doc: Record<string, unknown>): string | null {
  const state = text(doc.workflow_state);
  const eligibility = text(doc.eligibility_result);
  if (["Đủ điều kiện", "Đang xử lý", "Chờ xác nhận", "Hoàn tất"].includes(state) && eligibility !== "Đủ điều kiện") {
    return "Yêu cầu bảo hành: trạng thái xử lý chỉ hợp lệ khi kết quả quyền lợi là Đủ điều kiện.";
  }
  if (state === "Từ chối" && eligibility !== "Không đủ điều kiện") {
    return "Yêu cầu bảo hành: hồ sơ Từ chối phải ghi kết quả quyền lợi Không đủ điều kiện.";
  }
  if (["Đủ điều kiện", "Từ chối"].includes(state) && !text(doc.eligibility_reason)) {
    return "Yêu cầu bảo hành: xác minh quyền lợi phải có căn cứ.";
  }
  if (state === "Từ chối" && !text(doc.rejection_reason)) return "Yêu cầu bảo hành: từ chối phải có lý do.";
  if (["Chờ xác nhận", "Hoàn tất"].includes(state)) {
    if (!text(doc.service_order)) return "Yêu cầu bảo hành: phải liên kết Lệnh dịch vụ trước khi xác nhận hoàn tất.";
    if (!text(doc.resolution_date) || !text(doc.resolution)) return "Yêu cầu bảo hành: phải có thời điểm và kết quả xử lý trước khi xác nhận.";
  }
  if (state === "Hoàn tất" && !text(doc.customer_confirmed_by)) return "Yêu cầu bảo hành: hoàn tất phải có người xác nhận phía khách hàng.";
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Yêu cầu bảo hành: hủy hồ sơ phải có lý do.";
  return null;
}

function validateServiceOrder(doc: Record<string, unknown>): string | null {
  const schedule = orderedDates(doc, "scheduled_start", "scheduled_end", "Lệnh dịch vụ");
  if (schedule) return schedule;
  const actual = orderedDates(doc, "actual_start", "actual_end", "Thời gian thực tế");
  if (actual) return actual;
  const state = text(doc.workflow_state);
  if (["Chờ xác nhận", "Hoàn tất"].includes(state)) {
    if (!text(doc.actual_start) || !text(doc.actual_end)) return "Lệnh dịch vụ: phải có thời gian bắt đầu và kết thúc thực tế trước khi xác nhận.";
    if (rows(doc.checklist).length === 0) return "Lệnh dịch vụ: phải có checklist hiện trường trước khi xác nhận.";
    if (!text(doc.overall_checklist_result) || !text(doc.work_performed) || !text(doc.resolution)) {
      return "Lệnh dịch vụ: thiếu kết quả checklist, công việc thực hiện hoặc kết luận.";
    }
    for (const row of rows(doc.checklist)) {
      if (!text(row.check_item) || !text(row.result)) return "Lệnh dịch vụ: mỗi dòng checklist phải có hạng mục và kết quả.";
    }
  }
  if (state === "Hoàn tất" && !text(doc.customer_confirmed_by)) return "Lệnh dịch vụ: hoàn tất phải có người xác nhận phía khách hàng.";
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Lệnh dịch vụ: hủy lệnh phải có lý do.";
  for (const row of rows(doc.parts_used)) {
    if (!text(row.item) || !positive(row.qty) || !text(row.uom)) {
      return "Lệnh dịch vụ: mỗi vật tư ghi nhận phải có mã hàng, số lượng dương và ĐVT.";
    }
  }
  return null;
}

function validateMaintenanceRequest(doc: Record<string, unknown>): string | null {
  if (text(doc.request_type) === "Bảo hành" && !text(doc.service_contract) && !text(doc.warranty_reference)) {
    return "Yêu cầu bảo hành phải có Hợp đồng dịch vụ hoặc tham chiếu bảo hành.";
  }
  return null;
}

function validateProject(doc: Record<string, unknown>): string | null {
  const order = orderedDates(doc, "planned_start", "planned_end", "Dự án");
  if (order) return order;
  for (const row of rows(doc.resources)) {
    const allocation = numberValue(row.allocation_percent);
    if (allocation === null || allocation <= 0 || allocation > 100) return "Dự án: tỷ lệ phân bổ nguồn lực phải lớn hơn 0 và không vượt 100%.";
    const resourceOrder = orderedDates(row, "start_date", "end_date", `Nguồn lực ${text(row.user) || text(row.employee)}`);
    if (resourceOrder) return resourceOrder;
  }
  const state = text(doc.workflow_state);
  if (state === "Tạm dừng" && !text(doc.hold_reason)) return "Dự án: tạm dừng phải có lý do.";
  if (state === "Hoàn tất" && !text(doc.completion_summary)) return "Dự án: hoàn tất phải có tổng kết.";
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Dự án: hủy phải có lý do.";
  return null;
}

function validateProjectTemplate(doc: Record<string, unknown>): string | null {
  const taskRows = rows(doc.tasks);
  if (taskRows.length === 0) return "Mẫu dự án: phải có ít nhất một công việc mẫu.";
  const keys = taskRows.map((row) => text(row.task_key));
  if (keys.some((key) => !key)) return "Mẫu dự án: mỗi công việc mẫu phải có task_key.";
  if (new Set(keys).size !== keys.length) return "Mẫu dự án: task_key không được trùng.";
  const known = new Set(keys);
  const parentByKey = new Map<string, string>();
  for (const row of taskRows) {
    const key = text(row.task_key);
    const parent = text(row.parent_task_key);
    if (parent && parent === key) return "Mẫu dự án: công việc không được làm cha của chính nó.";
    if (parent && !known.has(parent)) return `Mẫu dự án: parent_task_key ${parent} không tồn tại trong mẫu.`;
    parentByKey.set(key, parent);
    if (!positive(row.duration_days)) return "Mẫu dự án: thời lượng công việc phải lớn hơn 0.";
    const weight = numberValue(row.weight_percent);
    if (weight !== null && (weight < 0 || weight > 100)) return "Mẫu dự án: trọng số công việc phải trong khoảng 0-100%.";
  }
  for (const key of keys) {
    const seen = new Set<string>();
    let current = key;
    while (current) {
      if (seen.has(current)) return `Mẫu dự án: phát hiện vòng lặp quan hệ cha tại ${current}.`;
      seen.add(current);
      current = parentByKey.get(current) ?? "";
    }
  }
  return null;
}

function validateProjectPortfolio(doc: Record<string, unknown>): string | null {
  const projectNames = rows(doc.projects).map((row) => text(row.project)).filter(Boolean);
  if (new Set(projectNames).size !== projectNames.length) return "Danh mục dự án: một dự án không được xuất hiện hai lần.";
  return null;
}

function validateProjectTask(doc: Record<string, unknown>, name: string): string | null {
  const order = orderedDates(doc, "planned_start", "planned_end", "Công việc dự án");
  if (order) return order;
  if (name && text(doc.parent_task) === name) return "Công việc dự án không được làm công việc cha của chính nó.";
  if (!percentage(doc.progress_percent ?? 0)) return "Công việc dự án: tiến độ phải trong khoảng 0-100%.";
  const dependencies = rows(doc.dependencies);
  const dependencyNames = new Set<string>();
  for (const row of dependencies) {
    const dependsOn = text(row.depends_on);
    if (!dependsOn) return "Công việc dự án: mỗi dòng phụ thuộc phải có công việc nguồn.";
    if (name && dependsOn === name) return "Công việc dự án không được phụ thuộc vào chính nó.";
    if (dependencyNames.has(dependsOn)) return `Công việc dự án: phụ thuộc ${dependsOn} bị khai báo trùng.`;
    dependencyNames.add(dependsOn);
    const dependencyType = text(row.dependency_type || "Finish-to-Start");
    if (!PROJECT_DEPENDENCY_TYPES.has(dependencyType)) return `Công việc dự án: kiểu phụ thuộc ${dependencyType} không hợp lệ.`;
  }
  const state = text(doc.workflow_state);
  if (state === "Tạm dừng" && !text(doc.hold_reason)) return "Công việc dự án: tạm dừng phải có lý do.";
  if (["Chờ xác nhận", "Hoàn tất"].includes(state)) {
    if (Number(doc.progress_percent) !== 100) return "Công việc dự án: chỉ được gửi/xác nhận hoàn tất khi tiến độ đạt 100%.";
    if (!text(doc.completion_note)) return "Công việc dự án: hoàn tất phải có kết quả thực hiện.";
  }
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Công việc dự án: hủy phải có lý do.";
  return null;
}

function validateCapacityPlan(doc: Record<string, unknown>): string | null {
  const order = orderedDates(doc, "period_start", "period_end", "Kế hoạch năng lực");
  if (order) return order;
  for (const row of rows(doc.resources)) {
    if (!nonNegative(row.available_hours) || !nonNegative(row.planned_hours)) {
      return "Kế hoạch năng lực: giờ khả dụng và giờ hoạch định không được âm.";
    }
    const target = numberValue(row.target_utilization_percent);
    if (target !== null && (target < 0 || target > 100)) return "Kế hoạch năng lực: mục tiêu sử dụng phải trong khoảng 0-100%.";
  }
  return null;
}

function validateTimesheet(doc: Record<string, unknown>): string | null {
  const order = orderedDates(doc, "period_start", "period_end", "Bảng chấm giờ dự án");
  if (order) return order;
  const details = rows(doc.details);
  if (details.length === 0) return "Bảng chấm giờ dự án: phải có ít nhất một dòng thời gian.";
  const seen = new Set<string>();
  for (const row of details) {
    const task = text(row.task);
    const activityType = text(row.activity_type);
    if (!task || !activityType) return "Bảng chấm giờ dự án: mỗi dòng phải có công việc và loại hoạt động.";
    const detailOrder = orderedDates(row, "from_time", "to_time", `Dòng chấm giờ ${task}`);
    if (detailOrder) return detailOrder;
    if (!text(row.from_time) || !text(row.to_time)) return `Bảng chấm giờ dự án: dòng ${task} phải có thời điểm bắt đầu và kết thúc.`;
    if (!positive(row.hours)) return "Bảng chấm giờ dự án: số giờ mỗi dòng phải lớn hơn 0.";
    const key = `${task}\u0000${text(row.from_time)}\u0000${text(row.to_time)}`;
    if (seen.has(key)) return `Bảng chấm giờ dự án: dòng thời gian ${task} bị trùng.`;
    seen.add(key);
  }
  const state = text(doc.workflow_state);
  if (state === "Trả lại" && !text(doc.rejection_reason)) return "Bảng chấm giờ dự án: trả lại phải có lý do.";
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Bảng chấm giờ dự án: hủy phải có lý do.";
  return null;
}

function validateProjectChangeOrder(doc: Record<string, unknown>): string | null {
  if (doc.schedule_impact_days !== undefined && doc.schedule_impact_days !== "" && numberValue(doc.schedule_impact_days) === null) {
    return "Thay đổi dự án: ảnh hưởng tiến độ phải là số hợp lệ.";
  }
  const state = text(doc.workflow_state);
  if (state === "Từ chối" && !text(doc.rejection_reason)) return "Thay đổi dự án: từ chối phải có lý do.";
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Thay đổi dự án: hủy phải có lý do.";
  return null;
}

function validateAcceptance(doc: Record<string, unknown>): string | null {
  if (!percentage(doc.progress_percent)) return "Nghiệm thu dự án: tiến độ xác nhận phải trong khoảng 0-100%.";
  const order = orderedDates(doc, "period_from", "period_to", "Kỳ nghiệm thu");
  if (order) return order;
  const state = text(doc.workflow_state);
  if (state === "Đã xác nhận" && !text(doc.signed_document)) {
    return "Nghiệm thu dự án: phải có biên bản ký trước khi xác nhận.";
  }
  const result = text(doc.acceptance_result);
  if (result && result !== "Chấp nhận" && !text(doc.condition_note)) {
    return "Nghiệm thu dự án: kết quả có điều kiện/không chấp nhận phải ghi rõ điều kiện hoặc tồn tại.";
  }
  if (state === "Từ chối" && !text(doc.rejection_reason)) return "Nghiệm thu dự án: từ chối phải có lý do.";
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Nghiệm thu dự án: hủy phải có lý do.";
  return null;
}

function validateSlaPolicy(doc: Record<string, unknown>): string | null {
  const order = orderedDates(doc, "active_from", "active_to", "Chính sách SLA");
  if (order) return order;
  const priorities = rows(doc.priorities);
  if (priorities.length === 0) return "Chính sách SLA: phải có ít nhất một mục tiêu theo mức ưu tiên.";
  const names = priorities.map((row) => text(row.priority));
  if (names.some((name) => !name)) return "Chính sách SLA: mỗi dòng phải có mức ưu tiên.";
  if (new Set(names).size !== names.length) return "Chính sách SLA: mức ưu tiên không được trùng.";
  let defaultCount = 0;
  for (const row of priorities) {
    if (!positive(row.response_minutes) || !positive(row.resolution_minutes) || !positive(row.escalation_minutes)) {
      return "Chính sách SLA: thời gian phản hồi, xử lý và leo thang phải lớn hơn 0.";
    }
    const response = Number(row.response_minutes);
    const resolution = Number(row.resolution_minutes);
    const escalation = Number(row.escalation_minutes);
    if (response > resolution) return `Chính sách SLA ${text(row.priority)}: thời gian phản hồi không được lớn hơn thời gian xử lý.`;
    if (escalation > resolution) return `Chính sách SLA ${text(row.priority)}: thời điểm leo thang không được sau hạn xử lý.`;
    if (checked(row.is_default)) defaultCount += 1;
  }
  if (defaultCount > 1) return "Chính sách SLA: chỉ được có một mức ưu tiên mặc định.";

  const workdays = rows(doc.workdays);
  if (workdays.length === 0) return "Chính sách SLA: phải có ít nhất một ngày làm việc.";
  const weekdays = new Set<string>();
  for (const row of workdays) {
    const weekday = text(row.weekday);
    if (!weekday) return "Chính sách SLA: lịch làm việc thiếu ngày.";
    if (weekdays.has(weekday)) return `Chính sách SLA: ngày ${weekday} bị khai báo trùng.`;
    weekdays.add(weekday);
    const start = timeValue(row.start_time);
    const end = timeValue(row.end_time);
    if (start === null || end === null || end <= start) return `Chính sách SLA ${weekday}: giờ kết thúc phải sau giờ bắt đầu.`;
  }
  return null;
}

function validateSupportTicket(doc: Record<string, unknown>): string | null {
  const state = text(doc.workflow_state);
  if (!["", "Mới", "Hủy"].includes(state) && !text(doc.assignee)) return "Phiếu hỗ trợ: phải phân công người xử lý trước khi tiếp tục.";
  if (["Đã xử lý", "Đóng"].includes(state) && !text(doc.resolution)) return "Phiếu hỗ trợ: không được đóng khi chưa có kết quả xử lý.";
  if (state === "Đã leo thang" && (!text(doc.escalation_reason) || !text(doc.escalated_to))) {
    return "Phiếu hỗ trợ: leo thang phải có lý do và người nhận.";
  }
  if (state === "Hủy" && !text(doc.cancel_reason)) return "Phiếu hỗ trợ: hủy phải có lý do.";
  return null;
}

function validateSupportFeedback(doc: Record<string, unknown>): string | null {
  const rating = numberValue(doc.rating);
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) return "CSAT: điểm hài lòng phải là số nguyên từ 1 đến 5.";
  if (checked(doc.followup_required) && !text(doc.followup_note)) return "CSAT: đánh dấu cần chăm sóc lại phải có ghi chú theo dõi.";
  return null;
}

function validateDoctype(subject: ValidatorSubject, doc: Record<string, unknown>): string | null {
  switch (subject.doctype) {
    case "Maintenance Request": return validateMaintenanceRequest(doc);
    case "Service Contract": return validateServiceContract(doc);
    case "Warranty Claim": return validateWarrantyClaim(doc);
    case "Service Order": return validateServiceOrder(doc);
    case "Project": return validateProject(doc);
    case "Project Template": return validateProjectTemplate(doc);
    case "Project Portfolio": return validateProjectPortfolio(doc);
    case "Project Task": return validateProjectTask(doc, subject.name);
    case "Project Capacity Plan": return validateCapacityPlan(doc);
    case "Project Timesheet": return validateTimesheet(doc);
    case "Project Change Order": return validateProjectChangeOrder(doc);
    case "Project Acceptance Certificate": return validateAcceptance(doc);
    case "Support SLA Policy": return validateSlaPolicy(doc);
    case "Support Ticket": return validateSupportTicket(doc);
    case "Support Feedback": return validateSupportFeedback(doc);
    default: return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/hooks/validate") return json({ message: "not found" }, 404);
    if (request.method !== "POST") return json({ message: "method not allowed" }, 405);
    const appId = request.headers.get("x-cloudforge-app") ?? "";
    if (!WS07_APPS.has(appId)) return json({ message: "WS07 app identity is not allowed" }, 403);

    let subject: ValidatorSubject;
    try {
      const body = await request.json() as Partial<ValidatorSubject>;
      if (!body || typeof body.doctype !== "string" || typeof body.name !== "string" || typeof body.action !== "string" || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
        return refuse("WS07 validator: payload không hợp lệ.");
      }
      subject = body as ValidatorSubject;
    } catch {
      return refuse("WS07 validator: JSON không hợp lệ.");
    }

    try {
      const doc = await mergedDocument(request, env, subject);
      const message = validateDoctype(subject, doc);
      return message ? refuse(message) : accept();
    } catch (error) {
      const message = error instanceof Error ? error.message : "WS07 validator không thể kiểm tra thay đổi.";
      return new Response(JSON.stringify({ message }), { status: 503, headers: { "content-type": "application/json" } });
    }
  },
};
