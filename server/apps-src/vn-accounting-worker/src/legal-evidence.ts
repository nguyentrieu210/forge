export interface VnLegalEvidence {
  rule: string;
  rule_type: string;
  rule_version: string;
  document_no: string;
  regime_code: string;
  taxpayer_segment: string;
  effective_from: string;
  effective_to: string;
  source_url: string;
  source_file_hash: string;
}

/**
 * Parse the already-approved VN Legal Rule that a statutory ruleset references.
 *
 * This is read-only evidence binding, not a second legal-rule authority. The
 * canonical submitted VN Legal Rule remains the source of version/effective-date
 * and official-source evidence. Callers use this helper to fail closed if a
 * ruleset response would otherwise omit or drift from that evidence.
 */
export function parseVnLegalEvidence(
  document: Record<string, unknown>,
  expectedRule: string,
  expectedRuleType: string,
  scopeFrom: string,
  scopeTo: string,
): VnLegalEvidence {
  const rule = requiredText(document.name ?? document.rule_code, "VN Legal Rule name");
  if (rule !== expectedRule) throw new Error(`VN Legal Rule ${expectedRule} identity mismatch`);
  if (Number(document.docstatus) !== 1) throw new Error(`VN Legal Rule ${expectedRule} must be submitted`);

  const ruleType = requiredText(document.rule_type, `VN Legal Rule ${expectedRule} rule_type`);
  if (ruleType !== expectedRuleType) {
    throw new Error(`VN Legal Rule ${expectedRule} must have rule_type ${expectedRuleType}`);
  }

  const effectiveFrom = isoDate(document.effective_from, `VN Legal Rule ${expectedRule} effective_from`);
  const effectiveTo = document.effective_to
    ? isoDate(document.effective_to, `VN Legal Rule ${expectedRule} effective_to`)
    : "9999-12-31";
  if (effectiveFrom > scopeFrom || effectiveTo < scopeTo) {
    throw new Error(`VN Legal Rule ${expectedRule} does not cover the ruleset effective period`);
  }

  return {
    rule,
    rule_type: ruleType,
    rule_version: requiredText(document.rule_version, `VN Legal Rule ${expectedRule} rule_version`),
    document_no: requiredText(document.document_no, `VN Legal Rule ${expectedRule} document_no`),
    regime_code: requiredText(document.regime_code, `VN Legal Rule ${expectedRule} regime_code`),
    taxpayer_segment: requiredText(document.taxpayer_segment, `VN Legal Rule ${expectedRule} taxpayer_segment`),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    source_url: requiredText(document.source_url, `VN Legal Rule ${expectedRule} source_url`),
    source_file_hash: requiredText(document.source_file_hash, `VN Legal Rule ${expectedRule} source_file_hash`),
  };
}

function isoDate(value: unknown, label: string): string {
  const text = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  return text;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}
