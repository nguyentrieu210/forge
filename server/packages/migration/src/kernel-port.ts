import type { MutationCommand, MutationReceipt } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MigrationPlan, MigrationPlannedRow } from "./index.js";
import type { DurableMigrationApplyPort, PreparedMigrationCommand } from "./durable-orchestrator.js";

export interface KernelMigrationBridge {
  lookup(plan: MigrationPlan, row: MigrationPlannedRow): Promise<{ exists: boolean; target_name?: string }>;
  /** Resolve authoritative autoname and build the exact create command without executing it. */
  prepareCreate(plan: MigrationPlan, row: MigrationPlannedRow): Promise<MutationCommand>;
  /** Build an OCC/version-aware save command for an existing target without executing it. */
  prepareUpdate(plan: MigrationPlan, row: MigrationPlannedRow, targetName: string): Promise<MutationCommand>;
  runCommand(command: MutationCommand): Promise<MutationReceipt>;
}

/**
 * Adapts Forge's existing command boundary to the journal-first migration executor.
 * No write path is duplicated: `execute()` calls the supplied canonical `runCommand`.
 */
export class KernelMigrationApplyPort implements DurableMigrationApplyPort {
  constructor(private readonly bridge: KernelMigrationBridge) {}

  lookup(plan: MigrationPlan, row: MigrationPlannedRow): Promise<{ exists: boolean; target_name?: string }> {
    return this.bridge.lookup(plan, row);
  }

  async prepareCreate(plan: MigrationPlan, row: MigrationPlannedRow): Promise<PreparedMigrationCommand> {
    const command = await this.bridge.prepareCreate(plan, row);
    assertPreparedCommand(command, plan.target_doctype, null);
    return this.prepared(command);
  }

  async prepareUpdate(plan: MigrationPlan, row: MigrationPlannedRow, targetName: string): Promise<PreparedMigrationCommand> {
    const command = await this.bridge.prepareUpdate(plan, row, targetName);
    assertPreparedCommand(command, plan.target_doctype, targetName);
    if (command.action !== "save") throw errors.lifecycle("Migration update bridge must prepare a save command");
    if (command.expected_version === null) throw errors.validation("Migration update command requires expected_version");
    return this.prepared(command);
  }

  private prepared(command: MutationCommand): PreparedMigrationCommand {
    const targetName = command.aggregate.name;
    return {
      target_name: targetName,
      command_id: command.command_id,
      payload_hash: command.payload_hash,
      execute: async () => {
        const receipt = await this.bridge.runCommand(command);
        if (receipt.command_id !== command.command_id) throw errors.idempotency();
        if (receipt.payload_hash !== command.payload_hash) throw errors.idempotency();
        if (receipt.aggregate.doctype !== command.aggregate.doctype || receipt.aggregate.name !== targetName) {
          throw errors.database("Migration kernel receipt does not match prepared command target");
        }
      },
    };
  }
}

function assertPreparedCommand(command: MutationCommand, doctype: string, expectedName: string | null): void {
  if (command.aggregate.doctype !== doctype) throw errors.validation("Migration bridge prepared command for the wrong DocType");
  if (!command.aggregate.name?.trim()) throw errors.validation("Migration bridge must resolve target name before execution");
  if (expectedName !== null && command.aggregate.name !== expectedName) throw errors.idempotency();
  if (!command.command_id?.trim()) throw errors.validation("Migration bridge command_id is required");
  if (!/^[a-f0-9]{64}$/.test(command.payload_hash)) throw errors.validation("Migration bridge payload_hash must be SHA-256 hex");
  if (command.action !== "create" && command.action !== "save") throw errors.lifecycle("Migration bridge may prepare only create/save commands");
  if (command.action === "create" && command.expected_version !== null) throw errors.validation("Migration create command expected_version must be null");
}
