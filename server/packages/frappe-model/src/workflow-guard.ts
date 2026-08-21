import type { CanonicalDocument, JsonObject, MutationCommand } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { CommandWorkflowGuard } from "../../document-kernel/src/kernel.js";
import { blocksSelfApproval } from "./generic-controller.js";
import type { MetadataStore } from "./store.js";
import type { WorkflowMeta, WorkflowTransitionMeta } from "./types.js";

/**
 * Một chứng từ có workflow chỉ được đổi `docstatus` qua một chuyển trạng thái đã KHAI.
 *
 * Đây là chốt chung mà CẢ HAI cửa cùng gọi tới. Trước đây chỉ có
 * `frappe.model.workflow.apply_workflow` kiểm workflow; `frappe.client.submit` đi thẳng
 * xuống controller nghiệp vụ, mà `SuiteController.buildPlan` (và `QuotationController`)
 * suy `docstatus` từ hành động qua `nextDocStatus()` — cả hai file không nhắc chữ
 * "workflow" một lần nào. Kết quả đo được trên `Overtime Request` ngày 21/08/2026: cùng
 * một chứng từ, cửa duyệt trả 403 "You cannot approve a document you created", cửa submit
 * trả 200 với `docstatus=1`, `approved_minutes=150` và `workflow_state` vẫn đứng ở
 * "Chờ duyệt". Chứng từ đã chốt sổ trong khi workflow tưởng nó còn đang chờ.
 *
 * MỘT LUẬT, MỘT CHỖ: luật "không tự duyệt" KHÔNG được chép lại ở đây. Nó vẫn là
 * `blocksSelfApproval` — đúng hàm mà `apply_workflow`, `get_workflow_transitions`, REST
 * `/api/v1/workflows/:doctype/apply` và `GenericMetadataController` đang dùng. Chỗ này chỉ
 * thêm câu hỏi mà tầng kernel còn thiếu: "lượt đổi docstatus này có nằm trên một chuyển
 * trạng thái được khai và vai trò người gọi được phép đi không?".
 *
 * KHÔNG có cửa miễn trừ cho quản trị viên ở luật tự duyệt — cố ý, giống hệt lý do ghi trong
 * `blocksSelfApproval`. Vai trò `allowed_role` thì quản trị viên vẫn thoả được, đúng như ba
 * cửa workflow hiện có vẫn làm, để chốt này không nghiêm hơn cửa nó đang bảo vệ.
 */
export function assertWorkflowDocstatusTransition(input: {
  workflow: WorkflowMeta;
  doctype: string;
  action: "submit" | "cancel";
  existing: { owner: string; docstatus: number; data: JsonObject };
  requestedDocument: JsonObject;
  actor: { user_id: string; roles: readonly string[] };
}): void {
  const { workflow, doctype, action, existing, requestedDocument, actor } = input;
  if (!workflow.is_active || workflow.states.length === 0) return;
  if (!workflowGovernsDocstatus(workflow, action)) return;

  const stateField = workflow.state_field;
  const current = String(existing.data[stateField] ?? workflow.states[0]!.state);
  const requestedRaw = requestedDocument[stateField] ?? requestedDocument.workflow_state;
  const requested = typeof requestedRaw === "string" && requestedRaw ? requestedRaw : current;
  const targetDocstatus = action === "submit" ? 1 : 2;

  // Không nêu tên trạng thái đích, tức là người gọi không hề đi qua workflow. Đây chính là
  // cửa vượt mặt: `frappe.client.submit` gửi lại nguyên chứng từ đã đọc, nên trạng thái
  // workflow trong đó vẫn y như bản đang lưu.
  if (requested === current) {
    throw errors.permission(
      `${doctype} đi theo workflow "${workflow.name}": phải ${action === "submit" ? "phê duyệt" : "huỷ"} bằng hành động workflow từ trạng thái "${current}", không được ${action} thẳng`,
    );
  }

  const target = workflow.states.find((state) => state.state === requested);
  if (!target) throw errors.validation(`Unknown workflow state: ${requested}`);
  if (target.docstatus !== targetDocstatus) {
    throw errors.lifecycle(
      `Workflow state ${requested} has docstatus ${target.docstatus}; ${action} requires ${targetDocstatus}`,
      { workflow: workflow.name, state: requested, action },
    );
  }

  const candidates = workflow.transitions.filter((entry) => entry.state === current && entry.next_state === requested);
  const transition: WorkflowTransitionMeta | undefined =
    candidates.find((entry) => actor.roles.includes(entry.allowed_role))
    ?? (isAdministrator(actor) ? candidates[0] : undefined);
  if (!transition) throw errors.permission(`No permitted workflow transition from ${current} to ${requested}`);

  if (blocksSelfApproval(transition, existing.owner, actor.user_id, existing.docstatus, target.docstatus)) {
    throw errors.permission("You cannot approve a document you created");
  }
}

/**
 * Bản cài đặt đọc workflow từ siêu dữ liệu tenant, cắm vào `DocumentKernel`.
 *
 * Chỉ xét `submit` và `cancel`, tức đúng hai hành động đổi `docstatus`. `create` và `save`
 * không đổi `docstatus`, và với DocType chạy bằng siêu dữ liệu thì
 * `GenericMetadataController` đã lo phần chuyển trạng thái cùng cấp docstatus rồi — chốt
 * này cố tình không lấn sang đó để không sinh ra bản luật thứ hai.
 */
export class MetadataWorkflowGuard implements CommandWorkflowGuard {
  constructor(private readonly metadata: MetadataStore) {}

  async assertCommandAllowed(
    command: MutationCommand<JsonObject>,
    existing: CanonicalDocument<JsonObject> | null,
  ): Promise<void> {
    if (command.action !== "submit" && command.action !== "cancel") return;
    // Không có bản ghi cũ thì `assertLifecycleTransition` đã từ chối trước đó; ở đây không
    // có gì để so sánh, và ném thêm một lỗi khác chỉ làm mờ nguyên nhân thật.
    if (!existing) return;
    const workflow = await this.metadata.getWorkflow(command.tenant_id, command.aggregate.doctype);
    if (!workflow) return;
    assertWorkflowDocstatusTransition({
      workflow,
      doctype: command.aggregate.doctype,
      action: command.action,
      existing: { owner: existing.owner, docstatus: existing.docstatus, data: existing.data },
      requestedDocument: command.document,
      actor: command.actor,
    });
  }
}

/**
 * Workflow này có thật sự MÔ HÌNH HOÁ lượt đổi docstatus đang xét không.
 *
 * Không phải workflow nào cũng nhận trách nhiệm về cả hai đầu vòng đời. Đo trên tenant thử
 * nghiệm ngày 21/08/2026: 21 workflow đang hoạt động, cả 21 đều khai lối lên `docstatus=1`,
 * nhưng chỉ 2 (`AlumDoor Attendance Policy`, `AlumDoor Pay Profile`) khai lối từ `docstatus=1`
 * sang `docstatus=2`. Mười chín workflow còn lại chỉ có "Từ chối" đi từ một trạng thái
 * `docstatus=0` — tức là chúng nói về việc từ chối một bản nháp, KHÔNG nói gì về việc huỷ một
 * chứng từ đã chốt sổ.
 *
 * Nếu chốt này cứ đòi hành động workflow cho mọi lượt huỷ, thì mọi đơn nghỉ phép / tăng ca đã
 * duyệt sẽ vĩnh viễn không huỷ được — workflow không khai lối ra, mà cửa huỷ thường thì đã bị
 * chặn. Đó là chặn nhầm: siết một thứ mà chính người viết workflow không hề tuyên bố mình
 * quản. Chốt chỉ có thẩm quyền ở đúng chỗ workflow đã nhận.
 */
function workflowGovernsDocstatus(workflow: WorkflowMeta, action: "submit" | "cancel"): boolean {
  const docstatusOf = new Map(workflow.states.map((state) => [state.state, state.docstatus]));
  const from = action === "submit" ? 0 : 1;
  const to = action === "submit" ? 1 : 2;
  return workflow.transitions.some((entry) =>
    docstatusOf.get(entry.state) === from && docstatusOf.get(entry.next_state) === to);
}

function isAdministrator(actor: { user_id: string; roles: readonly string[] }): boolean {
  return actor.user_id === "Administrator"
    || actor.roles.includes("Administrator")
    || actor.roles.includes("System Manager");
}
