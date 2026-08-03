/**
 * Author-facing business-context dimensions the deployed server/client can resolve today.
 *
 * Keep this deliberately boring and explicit. The compiler runs before the TypeScript server
 * package is necessarily built, so importing `CLIENT_CONTEXT_DIMENSIONS` from dist would make
 * authoring depend on a stale build artifact. A regression test pins this list against both the
 * checked-in JSON Schema and the server's exported set, turning drift into a failing test instead
 * of an app that installs and then blocks forever on an empty selector.
 */
export const BRIEF_CONTEXT_DIMENSIONS = Object.freeze([
  "company",
  "fiscal_year",
  "warehouse",
  "branch",
  "cost_center",
  "project",
  "territory",
  "selling_price_list",
  "buying_price_list",
]);

export const BRIEF_CONTEXT_DIMENSION_SET = new Set(BRIEF_CONTEXT_DIMENSIONS);

export function validateBriefContextDimensions(brief) {
  if (brief?.dimensions === undefined) return [];
  if (!Array.isArray(brief.dimensions)) return ["dimensions phải là mảng."];
  const errors = [];
  const seen = new Set();
  brief.dimensions.forEach((raw, index) => {
    if (typeof raw !== "string" || !raw.trim()) {
      errors.push(`dimensions[${index}] phải là chuỗi dimension không rỗng.`);
      return;
    }
    const key = raw.trim();
    if (!BRIEF_CONTEXT_DIMENSION_SET.has(key)) {
      errors.push(`dimensions[${index}] không phải dimension server có thể resolve: ${key}. Hỗ trợ: ${BRIEF_CONTEXT_DIMENSIONS.join(", ")}.`);
    }
    if (seen.has(key)) errors.push(`dimensions trùng: ${key}.`);
    seen.add(key);
  });
  return errors;
}

export function assertBriefContextDimensions(brief, ErrorClass = Error) {
  const errors = validateBriefContextDimensions(brief);
  if (errors.length) throw new ErrorClass(errors.join(" "));
}
