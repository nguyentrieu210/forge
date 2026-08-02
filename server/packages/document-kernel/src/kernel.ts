import type { JsonObject, MutationCommand, MutationPlan, MutationReceipt } from "../../contracts/src/index.js";
import { commandPayloadHash, errors } from "../../core/src/index.js";
import { assertBalancedGl } from "../../ledger/src/index.js";
import { PermissionService } from "../../policy/src/index.js";
import type { ControllerRegistry } from "./controller.js";
import { assertLifecycleTransition } from "./lifecycle.js";
import type { MutationStore } from "./store.js";

export interface MutationAuthorizer {
  assert(request: { actor: MutationCommand["actor"]; doctype: string; action: MutationCommand["action"]; owner?: string; tenantId?: string; name?: string; data?: JsonObject; existingData?: JsonObject }): void | Promise<void>;
}

export class DocumentKernel {
  constructor(
    private readonly controllers: ControllerRegistry,
    private readonly store: MutationStore,
    private readonly permissions: MutationAuthorizer = new PermissionService(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Build and validate the exact mutation plan without consuming idempotency state
   * or writing the document/ledgers. Permission, lifecycle, optimistic versioning
   * and controller business rules are identical to execute().
   */
  async preview<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationPlan<T>> {
    await this.assertPayloadHash(command);
    return this.plan(command);
  }

  async execute<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    await this.assertPayloadHash(command);

    const previousReceipt = await this.store.getReceipt(command.tenant_id, command.command_id);
    if (previousReceipt) {
      if (previousReceipt.payload_hash !== command.payload_hash || previousReceipt.actor_user_id !== command.actor.user_id) {
        throw errors.idempotency();
      }
      return previousReceipt;
    }

    const plan = await this.plan(command);
    return this.store.execute(plan);
  }

  private async assertPayloadHash<T extends JsonObject>(command: MutationCommand<T>): Promise<void> {
    const actualHash = await commandPayloadHash(command as unknown as Record<string, unknown>);
    if (actualHash !== command.payload_hash) throw errors.validation("payload_hash does not match command payload");
  }

  private async plan<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationPlan<T>> {
    const existing = await this.store.getDocument<T>(command.tenant_id, command.aggregate.doctype, command.aggregate.name);
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
    assertLifecycleTransition(existing, command.action);
    if (existing && command.expected_version !== existing.version) throw errors.version(existing.version);

    const nextVersion = (existing?.version ?? 0) + 1;
    const controller = this.controllers.get(command.aggregate.doctype);
    const plan = await controller.buildPlan({ command, existing, now: this.clock(), nextVersion, reader: this.store });

    if (plan.document.version !== nextVersion) throw errors.validation("Controller returned invalid aggregate version");
    if (plan.document.tenant_id !== command.tenant_id) throw errors.validation("Controller changed tenant boundary");
    if (plan.document.doctype !== command.aggregate.doctype || plan.document.name !== command.aggregate.name) {
      throw errors.validation("Controller changed aggregate identity");
    }
    assertBalancedGl(plan.gl_entries);
    return plan;
  }
}
