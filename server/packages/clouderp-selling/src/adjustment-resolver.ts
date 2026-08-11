import type { JsonObject } from "../../contracts/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import {
  evaluateSalesAdjustmentRules,
  type AppliedSalesAdjustment,
  type SalesAdjustmentContext,
} from "./adjustment-policy.js";
import {
  salesAdjustmentRulesFromRecords,
  type PersistedSalesAdjustmentRule,
} from "./adjustment-rule-records.js";

export const SALES_ADJUSTMENT_RULE_DOCTYPE = "Sales Adjustment Rule";

export interface ResolveSalesAdjustmentsInput extends SalesAdjustmentContext {
  postingDate: string;
  currency: string;
  currencyScale: number;
}

export interface ResolvedSalesAdjustment extends AppliedSalesAdjustment {
  /** Persisted document identity, separate from business rule code. */
  rule_name: string;
  /** Exact source document revision when the reader exposes it. */
  rule_version?: number;
}

export interface SalesAdjustmentResolution {
  applied: ResolvedSalesAdjustment[];
  unresolved_rules: string[];
}

function sourceByCode(rules: PersistedSalesAdjustmentRule[]): Map<string, PersistedSalesAdjustmentRule> {
  return new Map(rules.map((rule) => [rule.code, rule]));
}

/**
 * Server-authoritative bridge from master-data documents to the deterministic evaluator.
 * The caller supplies only commercial facts and basis quantities. Rule amounts, conditions,
 * effective dates and source revision come from persisted data, never from client code.
 */
export async function resolveSalesAdjustments(
  context: ControllerContext<JsonObject>,
  input: ResolveSalesAdjustmentsInput,
): Promise<SalesAdjustmentResolution> {
  const records = await context.reader.listMasterRecordData(
    context.command.tenant_id,
    SALES_ADJUSTMENT_RULE_DOCTYPE,
  );
  const rules = salesAdjustmentRulesFromRecords(records, {
    postingDate: input.postingDate,
    currency: input.currency,
    currencyScale: input.currencyScale,
  });
  const evaluated = evaluateSalesAdjustmentRules({
    facts: input.facts,
    ...(input.area_sqm === undefined ? {} : { area_sqm: input.area_sqm }),
    ...(input.length_m === undefined ? {} : { length_m: input.length_m }),
    ...(input.set_count === undefined ? {} : { set_count: input.set_count }),
  }, rules);
  const sources = sourceByCode(rules);
  return {
    applied: evaluated.applied.map((adjustment) => {
      const source = sources.get(adjustment.rule_code)!;
      return {
        ...adjustment,
        rule_name: source.source_name,
        ...(source.source_version === undefined ? {} : { rule_version: source.source_version }),
      };
    }),
    unresolved_rules: evaluated.unresolved_rules,
  };
}
