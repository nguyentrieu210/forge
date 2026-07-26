
import type { AggregateRef, DomainEvent, JsonObject } from "../../contracts/src/index.js";
import { randomId } from "../../core/src/index.js";

export function domainEvent(input: {
  type: string;
  tenantId: string;
  aggregate: AggregateRef;
  aggregateVersion: number;
  actor: string;
  commandId: string;
  occurredAt: string;
  payload?: JsonObject;
}): DomainEvent {
  return {
    event_id: randomId("evt"),
    event_type: input.type,
    tenant_id: input.tenantId,
    aggregate: input.aggregate,
    aggregate_version: input.aggregateVersion,
    actor: input.actor,
    command_id: input.commandId,
    occurred_at: input.occurredAt,
    schema_version: 1,
    payload: input.payload ?? {},
  };
}

export * from "./publisher.js";
