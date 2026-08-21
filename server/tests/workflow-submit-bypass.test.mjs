/**
 * Lỗ "vượt mặt workflow": chốt duyệt chỉ đứng ở cửa `apply_workflow`, còn
 * `frappe.client.submit` đi thẳng xuống controller nghiệp vụ và tự đổi `docstatus`.
 *
 * Đo trên máy chủ thật ngày 21/08/2026, CÙNG một `Overtime Request`:
 *   apply_workflow "Phê duyệt" -> 403 "You cannot approve a document you created"
 *   frappe.client.submit       -> 200, docstatus=1, approved_minutes=150
 * Người tạo đơn tăng ca tự duyệt tiền tăng ca cho chính mình, chỉ cần đổi cửa gọi.
 *
 * Bộ kiểm này phủ CẢ HAI chiều, vì một chốt chỉ biết chặn thì cũng hỏng ngang một chốt
 * không chặn gì: nó phải chặn đúng người tự duyệt, và phải để yên chứng từ không có
 * workflow lẫn người có quyền duyệt thật.
 *
 * `Issue` được chọn làm chứng từ mẫu vì nó là `SuiteController` — đúng họ controller mang
 * lỗ — mà lại không đòi bảng danh mục nào, nên phép kiểm nói về chốt chứ không nói về dữ
 * liệu nền.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ControllerRegistry, DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { IssueController } from "../dist/packages/clouderp-erpnext/src/index.js";
import { InMemoryMetadataStore, MetadataWorkflowGuard } from "../dist/packages/frappe-model/src/index.js";
import { makeCommand } from "../dist/packages/test-harness/src/index.js";

const NOW = "2026-08-21T00:00:00.000Z";
const TENANT = "demo";
const DOCTYPE = "Issue";

// Người tự duyệt phải là người CÓ vai trò duyệt — nếu không thì lượt duyệt đã hỏng ở bước
// kiểm vai trò và luật tự duyệt không bao giờ được hỏi tới. Đây đúng là tình huống mà phân
// tách trách nhiệm sinh ra để chặn: trưởng phòng tự nộp đơn cho chính mình.
const NGUOI_TAO = { user_id: "nhan.vien@example.test", roles: ["Employee", "HR Manager"] };
const NGUOI_DUYET = { user_id: "truong.phong@example.test", roles: ["HR Manager"] };

/** Vòng duyệt hai bước giống hệt 12 workflow nhân sự đang chạy thật trên tenant. */
function workflowDuyet({ allowSelfApproval = false, khaiLoiHuySauChot = false } = {}) {
  return {
    name: "Duyệt sự vụ",
    document_type: DOCTYPE,
    state_field: "workflow_state",
    is_active: true,
    revision: 1,
    states: [
      { state: "Nháp", docstatus: 0 },
      { state: "Chờ duyệt", docstatus: 0 },
      { state: "Đã duyệt", docstatus: 1 },
      { state: "Từ chối", docstatus: 2 },
      ...(khaiLoiHuySauChot ? [{ state: "Thu hồi", docstatus: 2 }] : []),
    ],
    transitions: [
      { state: "Nháp", action: "Gửi duyệt", next_state: "Chờ duyệt", allowed_role: "Employee", allow_self_approval: true },
      { state: "Chờ duyệt", action: "Phê duyệt", next_state: "Đã duyệt", allowed_role: "HR Manager", allow_self_approval: allowSelfApproval },
      { state: "Chờ duyệt", action: "Từ chối", next_state: "Từ chối", allowed_role: "HR Manager", allow_self_approval: false },
      ...(khaiLoiHuySauChot
        ? [{ state: "Đã duyệt", action: "Thu hồi", next_state: "Thu hồi", allowed_role: "HR Manager", allow_self_approval: false }]
        : []),
    ],
  };
}

async function dungBoiCanh(workflow) {
  const metadata = new InMemoryMetadataStore();
  if (workflow) await metadata.putWorkflow(TENANT, workflow, "Administrator", NOW);
  const store = new InMemoryMutationStore();
  const kernel = new DocumentKernel(
    new ControllerRegistry().register(new IssueController()),
    store,
    // Quyền theo vai trò đã có bộ kiểm riêng; ở đây cố ý mở hết để phép kiểm chỉ nói về
    // chốt workflow, không lẫn với lý do từ chối khác.
    { assert() {} },
    () => NOW,
    new MetadataWorkflowGuard(metadata),
  );
  return { kernel, store, metadata };
}

function suVu(workflowState) {
  return {
    subject: "Máy cắt kêu lạ",
    opened_at: NOW,
    priority: "High",
    ...(workflowState ? { workflow_state: workflowState } : {}),
  };
}

/** Tạo sẵn một sự vụ đang đứng ở "Chờ duyệt", do NGUOI_TAO lập. */
async function soChoDuyet(kernel, name = "ISS-1") {
  await kernel.execute(await makeCommand({
    commandId: `tao-${name}`, actor: NGUOI_TAO, doctype: DOCTYPE, name,
    action: "create", expectedVersion: null, document: suVu("Chờ duyệt"),
  }));
  return name;
}

test("cửa submit không còn vượt mặt được workflow", async () => {
  const { kernel, store } = await dungBoiCanh(workflowDuyet());
  const name = await soChoDuyet(kernel);

  // Đây chính là lời gọi đã đo được 200 trên máy chủ: gửi lại nguyên chứng từ vừa đọc,
  // nên trạng thái workflow trong đó vẫn là "Chờ duyệt".
  const vuotMat = await makeCommand({
    commandId: "submit-thang", actor: NGUOI_TAO, doctype: DOCTYPE, name,
    action: "submit", expectedVersion: 1, document: suVu("Chờ duyệt"),
  });
  await assert.rejects(kernel.execute(vuotMat), (error) => {
    assert.equal(error.code, "PERMISSION_DENIED");
    assert.match(error.message, /workflow "Duyệt sự vụ"/u);
    assert.match(error.message, /không được submit thẳng/u);
    return true;
  });

  const sau = await store.getDocument(TENANT, DOCTYPE, name);
  assert.equal(sau.docstatus, 0, "chứng từ phải còn nguyên ở nháp");
  assert.equal(sau.version, 1);
});

test("người tạo không tự duyệt được, kể cả khi gọi đúng tên trạng thái đích", async () => {
  const { kernel, store } = await dungBoiCanh(workflowDuyet());
  const name = await soChoDuyet(kernel);

  const tuDuyet = await makeCommand({
    commandId: "tu-duyet", actor: NGUOI_TAO, doctype: DOCTYPE, name,
    action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
  });
  await assert.rejects(kernel.execute(tuDuyet), (error) => {
    assert.equal(error.code, "PERMISSION_DENIED");
    // ĐÚNG câu chữ mà cửa `apply_workflow` vẫn trả — hai cửa cùng một luật, cùng một lời.
    assert.equal(error.message, "You cannot approve a document you created");
    return true;
  });
  assert.equal((await store.getDocument(TENANT, DOCTYPE, name)).docstatus, 0);
});

test("quản trị viên cũng không tự duyệt được — phân tách trách nhiệm không có cửa miễn trừ", async () => {
  const { kernel } = await dungBoiCanh(workflowDuyet());
  const quanTri = { user_id: "Administrator", roles: ["System Manager"] };
  await kernel.execute(await makeCommand({
    commandId: "tao-admin", actor: quanTri, doctype: DOCTYPE, name: "ISS-ADM",
    action: "create", expectedVersion: null, document: suVu("Chờ duyệt"),
  }));
  await assert.rejects(
    kernel.execute(await makeCommand({
      commandId: "admin-tu-duyet", actor: quanTri, doctype: DOCTYPE, name: "ISS-ADM",
      action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
    })),
    (error) => error.message === "You cannot approve a document you created",
  );
});

test("người có quyền duyệt và khác người tạo thì vẫn duyệt được", async () => {
  const { kernel, store } = await dungBoiCanh(workflowDuyet());
  const name = await soChoDuyet(kernel);

  await kernel.execute(await makeCommand({
    commandId: "duyet-that", actor: NGUOI_DUYET, doctype: DOCTYPE, name,
    action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
  }));

  const sau = await store.getDocument(TENANT, DOCTYPE, name);
  assert.equal(sau.docstatus, 1);
  assert.equal(sau.data.workflow_state, "Đã duyệt");
  assert.equal(sau.owner, NGUOI_TAO.user_id, "quyền sở hữu vẫn thuộc người lập");
});

test("workflow cho phép tự duyệt thì chốt nhường — một luật, đọc từ một chỗ", async () => {
  // Chốt không tự phán; nó hỏi `blocksSelfApproval`, đúng hàm mà `apply_workflow`,
  // `get_workflow_transitions` và REST `/api/v1/workflows/:doctype/apply` đang hỏi. Bật cờ
  // `allow_self_approval` trong workflow là kết quả phải đổi theo, nếu không thì ở đâu đó
  // đã mọc ra bản luật thứ hai.
  const { kernel, store } = await dungBoiCanh(workflowDuyet({ allowSelfApproval: true }));
  const name = await soChoDuyet(kernel);
  await kernel.execute(await makeCommand({
    commandId: "tu-duyet-duoc-phep", actor: NGUOI_TAO, doctype: DOCTYPE, name,
    action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
  }));
  assert.equal((await store.getDocument(TENANT, DOCTYPE, name)).docstatus, 1);
});

test("vai trò không nằm trên chuyển trạng thái thì bị từ chối", async () => {
  const { kernel } = await dungBoiCanh(workflowDuyet());
  const name = await soChoDuyet(kernel, "ISS-ROLE");
  await assert.rejects(
    kernel.execute(await makeCommand({
      commandId: "sai-vai-tro", actor: { user_id: "ke.toan@example.test", roles: ["Accounts User"] },
      doctype: DOCTYPE, name, action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
    })),
    (error) => error.code === "PERMISSION_DENIED" && /No permitted workflow transition/u.test(error.message),
  );
});

test("KHÔNG CHẶN NHẦM: chứng từ không có workflow vẫn chốt sổ bình thường", async () => {
  const { kernel, store } = await dungBoiCanh(null);
  await kernel.execute(await makeCommand({
    commandId: "tao-tu-do", actor: NGUOI_TAO, doctype: DOCTYPE, name: "ISS-FREE",
    action: "create", expectedVersion: null, document: suVu(),
  }));
  await kernel.execute(await makeCommand({
    commandId: "submit-tu-do", actor: NGUOI_TAO, doctype: DOCTYPE, name: "ISS-FREE",
    action: "submit", expectedVersion: 1, document: suVu(),
  }));
  const sau = await store.getDocument(TENANT, DOCTYPE, "ISS-FREE");
  assert.equal(sau.docstatus, 1, "không có workflow thì chốt này phải đứng ngoài hoàn toàn");
});

test("KHÔNG CHẶN NHẦM: workflow không khai lối huỷ sau chốt sổ thì cửa huỷ để nguyên", async () => {
  // 19 trên 21 workflow đang chạy thật chỉ khai "Từ chối" đi từ một trạng thái docstatus=0.
  // Chúng nói về việc bác một bản nháp, không nói gì về việc huỷ một chứng từ đã chốt sổ.
  // Nếu chốt cứ đòi hành động workflow cho mọi lượt huỷ thì mọi chứng từ đã duyệt sẽ kẹt
  // vĩnh viễn — siết một thứ mà chính người viết workflow không nhận mình quản.
  const { kernel, store } = await dungBoiCanh(workflowDuyet());
  const name = await soChoDuyet(kernel, "ISS-CANCEL-FREE");
  await kernel.execute(await makeCommand({
    commandId: "duyet-truoc-khi-huy", actor: NGUOI_DUYET, doctype: DOCTYPE, name,
    action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
  }));
  await kernel.execute(await makeCommand({
    commandId: "huy-thuong", actor: NGUOI_DUYET, doctype: DOCTYPE, name,
    action: "cancel", expectedVersion: 2, document: suVu("Đã duyệt"),
  }));
  assert.equal((await store.getDocument(TENANT, DOCTYPE, name)).docstatus, 2);
});

test("workflow CÓ khai lối huỷ sau chốt sổ thì cửa huỷ cũng phải đi qua workflow", async () => {
  const { kernel, store } = await dungBoiCanh(workflowDuyet({ khaiLoiHuySauChot: true }));
  const name = await soChoDuyet(kernel, "ISS-CANCEL-WF");
  await kernel.execute(await makeCommand({
    commandId: "duyet-truoc-thu-hoi", actor: NGUOI_DUYET, doctype: DOCTYPE, name,
    action: "submit", expectedVersion: 1, document: suVu("Đã duyệt"),
  }));

  await assert.rejects(
    kernel.execute(await makeCommand({
      commandId: "huy-thang", actor: NGUOI_DUYET, doctype: DOCTYPE, name,
      action: "cancel", expectedVersion: 2, document: suVu("Đã duyệt"),
    })),
    (error) => error.code === "PERMISSION_DENIED" && /không được cancel thẳng/u.test(error.message),
  );
  assert.equal((await store.getDocument(TENANT, DOCTYPE, name)).docstatus, 1);

  await kernel.execute(await makeCommand({
    commandId: "thu-hoi-dung-cua", actor: NGUOI_DUYET, doctype: DOCTYPE, name,
    action: "cancel", expectedVersion: 2, document: suVu("Thu hồi"),
  }));
  assert.equal((await store.getDocument(TENANT, DOCTYPE, name)).docstatus, 2);
});
