import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";

export type MarketplaceSlaMetric = "order_to_fulfillment";

export interface MarketplaceSlaPolicyData extends JsonObject {
  channel_profile: string;
  metric: MarketplaceSlaMetric;
  target_minutes: number;
  warning_minutes: number;
  disabled: boolean;
  policy_note?: string;
}

/**
 * Business-policy authority for marketplace SLA thresholds.
 *
 * The controller deliberately owns only policy validation. SLA observations are
 * computed from canonical timestamps elsewhere and never mutate order lifecycle.
 */
export class MarketplaceSlaPolicyController implements DocumentController<MarketplaceSlaPolicyData> {
  readonly doctype = "Marketplace SLA Policy";

  buildPlan(context: ControllerContext<MarketplaceSlaPolicyData>): MutationPlan<MarketplaceSlaPolicyData> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle("Marketplace SLA Policy is configuration metadata, not submittable");
    }
    const existing = context.existing as CanonicalDocument<MarketplaceSlaPolicyData> | null;
    const data = normalizePolicy(existing, context.command.document);

    const document: CanonicalDocument<MarketplaceSlaPolicyData> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status: data.disabled ? "disabled" : "active",
      version: context.nextVersion,
      created_at: existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [],
    };

    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: [domainEvent({
        type: context.command.action === "create" ? "marketplace_sla_policy.created" : "marketplace_sla_policy.updated",
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          channel_profile: data.channel_profile,
          metric: data.metric,
          target_minutes: data.target_minutes,
          warning_minutes: data.warning_minutes,
          disabled: data.disabled,
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        channel_profile: data.channel_profile,
        metric: data.metric,
        disabled: data.disabled,
      },
    };
  }
}

function normalizePolicy(
  existing: CanonicalDocument<MarketplaceSlaPolicyData> | null,
  input: MarketplaceSlaPolicyData,
): MarketplaceSlaPolicyData {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errors.validation("Marketplace SLA Policy document is invalid");
  const channelProfile = requiredText(input.channel_profile ?? existing?.data.channel_profile, "channel_profile", 240);
  if (existing && channelProfile !== existing.data.channel_profile) {
    throw errors.validation("Marketplace SLA Policy channel_profile is immutable");
  }
  const metric = normalizeMetric(input.metric ?? existing?.data.metric ?? "order_to_fulfillment");
  if (existing && metric !== existing.data.metric) throw errors.validation("Marketplace SLA Policy metric is immutable");
  const targetMinutes = boundedInteger(input.target_minutes ?? existing?.data.target_minutes, "target_minutes", 1, 525_600);
  const warningMinutes = boundedInteger(input.warning_minutes ?? existing?.data.warning_minutes, "warning_minutes", 0, 525_599);
  if (warningMinutes >= targetMinutes) throw errors.validation("warning_minutes must be smaller than target_minutes");
  const disabled = checkValue(input.disabled ?? existing?.data.disabled ?? false);
  const policyNote = optionalText(input.policy_note ?? existing?.data.policy_note, "policy_note", 2_000);
  return {
    channel_profile: channelProfile,
    metric,
    target_minutes: targetMinutes,
    warning_minutes: warningMinutes,
    disabled,
    ...(policyNote ? { policy_note: policyNote } : {}),
  };
}

function normalizeMetric(value: unknown): MarketplaceSlaMetric {
  if (value !== "order_to_fulfillment") throw errors.validation("Unsupported marketplace SLA metric");
  return value;
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) throw errors.validation(`${field} is invalid`);
  return number;
}

function checkValue(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value === undefined || value === null || value === "") return false;
  throw errors.validation("disabled is invalid");
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, field, max);
}
