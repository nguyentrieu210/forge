
import type { Actor, JsonObject, MutationAction, MutationCommand } from "../../contracts/src/index.js";
import { commandPayloadHash } from "../../core/src/index.js";

export async function makeCommand<T extends JsonObject>(input: {
  commandId: string;
  tenantId?: string;
  actor?: Actor;
  doctype: string;
  name: string;
  action: MutationAction;
  expectedVersion: number | null;
  document: T;
}): Promise<MutationCommand<T>> {
  const command: MutationCommand<T> = {
    schema_version: 1,
    command_id: input.commandId,
    tenant_id: input.tenantId ?? "demo",
    actor: input.actor ?? { user_id: "Administrator", roles: ["System Manager"] },
    aggregate: { doctype: input.doctype, name: input.name },
    action: input.action,
    expected_version: input.expectedVersion,
    payload_hash: "",
    document: input.document,
  };
  command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
  return command;
}
