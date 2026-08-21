import type {
  CanonicalDocument,
  JsonObject,
  MutationBundle,
  MutationCommand,
  MutationPlan,
  MutationReceipt,
} from "../../contracts/src/index.js";
import { commandPayloadHash, errors } from "../../core/src/index.js";
import { assertBalancedGl } from "../../ledger/src/index.js";
import { PermissionService } from "../../policy/src/index.js";
import type { ControllerRegistry } from "./controller.js";
import { assertLifecycleTransition } from "./lifecycle.js";
import type { DomainReader, MutationStore } from "./store.js";

export interface MutationAuthorizer {
  assert(request: {
    actor: MutationCommand["actor"];
    doctype: string;
    action: MutationCommand["action"];
    owner?: string;
    tenantId?: string;
    name?: string;
    data?: JsonObject;
    existingData?: JsonObject;
  }): void | Promise<void>;
}

/**
 * Chốt workflow ở tầng kernel — nơi DUY NHẤT mọi lệnh đều đi qua.
 *
 * Vì sao ở đây chứ không ở router: chốt "không tự duyệt" trước đây chỉ nằm trên đường
 * `frappe.model.workflow.apply_workflow`. Ai gọi thẳng `frappe.client.submit` thì bỏ qua
 * toàn bộ workflow, vì controller nghiệp vụ (`SuiteController`, `QuotationController`, …)
 * đi thẳng từ hành động sang `docstatus` qua `nextDocStatus()` và không hề biết workflow
 * tồn tại. Đo được ngày 21/08/2026 trên `Overtime Request`: apply_workflow "Phê duyệt" trả
 * 403, còn `frappe.client.submit` trên ĐÚNG chứng từ đó trả 200 và `approved_minutes=150`.
 * Người tạo đơn tăng ca tự duyệt tiền tăng ca cho chính mình, chỉ cần đổi cửa gọi.
 *
 * Kernel là điểm thắt nút cuối cùng: mọi lệnh — router Frappe, REST `/api/v1`, coordinator
 * trong Durable Object — đều kết thúc ở `DocumentKernel.execute`. Đặt chốt ở đây thì không
 * còn cửa nào để đi vòng, và không phải chép luật sang từng controller.
 *
 * Giao diện chứ không phải hàm cụ thể: workflow là siêu dữ liệu, nằm ở `frappe-model`, mà
 * `frappe-model` đã phụ thuộc vào `document-kernel`. Đảo phụ thuộc để tránh vòng lặp.
 */
export interface CommandWorkflowGuard {
  assertCommandAllowed(
    command: MutationCommand<JsonObject>,
    existing: CanonicalDocument<JsonObject> | null,
  ): void | Promise<void>;
}

/**
 * Coordinates controller validation and persistence for canonical documents.
 *
 * `executeBundle` is deliberately ordered: a later command can build against
 * an earlier planned document in the same aggregate (create -> submit), while
 * no plan reaches the store until every command has been prepared successfully.
 */
export class DocumentKernel {
  constructor(
    private readonly controllers: ControllerRegistry,
    private readonly store: MutationStore,
    private readonly permissions: MutationAuthorizer = new PermissionService(),
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly workflow: CommandWorkflowGuard | null = null,
  ) {}

  async execute<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    await this.assertPayloadHash(command);
    const previousReceipt = await this.store.getReceipt(command.tenant_id, command.command_id);
    if (previousReceipt) return this.assertMatchingReceipt(command, previousReceipt);

    const plan = await this.prepare(command, this.store);
    return this.store.execute(plan);
  }

  /**
   * Prepare every command, then ask the store to persist all plans atomically.
   * All commands must stay inside one tenant.  Results are returned in exactly
   * the input order, including deterministic replays of a fully committed
   * bundle.
   */
  async executeBundle<T extends JsonObject>(bundle: MutationBundle<T>): Promise<MutationReceipt[]> {
    const commands = bundle.commands;
    this.assertBundleCommands(commands);

    const priorReceipts: Array<MutationReceipt | null> = [];
    for (const command of commands) {
      await this.assertPayloadHash(command);
      priorReceipts.push(await this.store.getReceipt(command.tenant_id, command.command_id));
    }

    const committedCount = priorReceipts.filter((receipt) => receipt !== null).length;
    for (let index = 0; index < commands.length; index += 1) {
      const receipt = priorReceipts[index];
      if (receipt) this.assertMatchingReceipt(commands[index]!, receipt);
    }
    if (committedCount === commands.length) return priorReceipts as MutationReceipt[];
    if (committedCount > 0) {
      throw errors.validation("Mutation bundle has an incomplete receipt set; it cannot be replayed safely");
    }

    const plannedDocuments = new Map<string, CanonicalDocument>();
    const reader = this.createBundleReader(plannedDocuments);
    const plans: MutationPlan[] = [];
    for (const command of commands) {
      const plan = await this.prepare(command, reader);
      plans.push(plan);
      plannedDocuments.set(bundleDocumentKey(command.tenant_id, command.aggregate.doctype, command.aggregate.name), plan.document);
    }
    return this.store.executeBundle(plans);
  }

  private async prepare<T extends JsonObject>(command: MutationCommand<T>, reader: DomainReader): Promise<MutationPlan<T>> {
    const existing = await reader.getDocument<T>(command.tenant_id, command.aggregate.doctype, command.aggregate.name);
    await this.permissions.assert({
      actor: command.actor,
      doctype: command.aggregate.doctype,
      action: command.action,
      tenantId: command.tenant_id,
      name: command.aggregate.name,
      data: command.document,
      ...(existing ? { existingData: existing.data } : {}),
      owner: existing?.owner ?? command.actor.user_id,
    });

    if (command.action === "create" && command.expected_version !== null) {
      throw errors.validation("Create command must have expected_version=null");
    }
    if (command.action !== "create" && command.expected_version === null) {
      throw errors.validation(`${command.action} command requires expected_version`);
    }
    const controller = this.controllers.get(command.aggregate.doctype);
    assertLifecycleTransition(existing, command.action, {
      allowSubmittedSave: controller.allowSubmittedSave === true,
    });
    if (existing && command.expected_version !== existing.version) throw errors.version(existing.version);

    // Sau `assertLifecycleTransition` nên docstatus hiện tại đã hợp lệ cho hành động này;
    // trước `buildPlan` nên controller không bao giờ chạy cho một lượt duyệt không được phép.
    await this.workflow?.assertCommandAllowed(
      command as unknown as MutationCommand<JsonObject>,
      existing as CanonicalDocument<JsonObject> | null,
    );

    const nextVersion = (existing?.version ?? 0) + 1;
    const plan = await controller.buildPlan({ command, existing, now: this.clock(), nextVersion, reader });
    plan.allow_submitted_save = controller.allowSubmittedSave === true;

    if (plan.document.version !== nextVersion) throw errors.validation("Controller returned invalid aggregate version");
    if (plan.document.tenant_id !== command.tenant_id) throw errors.validation("Controller changed tenant boundary");
    if (plan.document.doctype !== command.aggregate.doctype || plan.document.name !== command.aggregate.name) {
      throw errors.validation("Controller changed aggregate identity");
    }
    assertBalancedGl(plan.gl_entries);
    return plan as MutationPlan<T>;
  }

  private async assertPayloadHash(command: MutationCommand): Promise<void> {
    const actualHash = await commandPayloadHash(command as unknown as Record<string, unknown>);
    if (actualHash !== command.payload_hash) throw errors.validation("payload_hash does not match command payload");
  }

  private assertMatchingReceipt(command: MutationCommand, receipt: MutationReceipt): MutationReceipt {
    if (receipt.payload_hash !== command.payload_hash || receipt.actor_user_id !== command.actor.user_id) {
      throw errors.idempotency();
    }
    return receipt;
  }

  private assertBundleCommands(commands: readonly MutationCommand[]): void {
    if (!Array.isArray(commands) || commands.length === 0) {
      throw errors.validation("Mutation bundle must contain at least one command");
    }
    const tenantId = commands[0]!.tenant_id;
    const commandIds = new Set<string>();
    for (const command of commands) {
      if (command.tenant_id !== tenantId) throw errors.validation("Mutation bundle commands must belong to one tenant");
      if (commandIds.has(command.command_id)) throw errors.validation("Mutation bundle command_id values must be unique");
      commandIds.add(command.command_id);
    }
  }

  /** Overlay only the two aggregate reads controllers use, forwarding every
   * specialised reader method to the real store.  This makes a later command
   * see an earlier planned document without exposing any uncommitted state to
   * other requests. */
  private createBundleReader(plannedDocuments: ReadonlyMap<string, CanonicalDocument>): DomainReader {
    const store = this.store;
    return new Proxy(store, {
      get(target, property, receiver) {
        if (property === "getDocument") {
          return async <T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null> => {
            const planned = plannedDocuments.get(bundleDocumentKey(tenantId, doctype, name));
            return planned ? structuredClone(planned) as CanonicalDocument<T> : target.getDocument<T>(tenantId, doctype, name);
          };
        }
        if (property === "listDocumentsByDoctype") {
          return async <T extends JsonObject>(tenantId: string, doctype: string): Promise<Array<CanonicalDocument<T>>> => {
            const base = await target.listDocumentsByDoctype<T>(tenantId, doctype);
            const result = base.filter((document) => !plannedDocuments.has(bundleDocumentKey(tenantId, doctype, document.name)));
            for (const document of plannedDocuments.values()) {
              if (document.tenant_id === tenantId && document.doctype === doctype) {
                result.push(structuredClone(document) as CanonicalDocument<T>);
              }
            }
            return result.sort((left, right) => left.name.localeCompare(right.name));
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as DomainReader;
  }
}

function bundleDocumentKey(tenantId: string, doctype: string, name: string): string {
  return `${tenantId}\u0000${doctype}\u0000${name}`;
}
