import { ControlRegistry, NumberControl, createDefaultRegistry, type FieldControl } from "@metaforge/controls";
import { registerTableControls } from "./form/table-controls.js";

/**
 * Runtime-level display guard for editable numeric controls.
 *
 * The child grid resolves controls from this registry directly. Keeping the cap here makes
 * the rule effective even when an app or table path bypasses the default registration helper.
 * Metadata precision remains untouched for persistence/calculation; only the field passed to
 * the UI control is capped to two decimals.
 *
 * IMPORTANT: missing precision must become 2, not stay undefined. API values can arrive as
 * fixed-scale strings such as "22.000000"; GroupedNumberInput preserves the raw string when
 * precision is undefined, which is exactly why editable fields still showed six decimals.
 */
const TwoDecimalRuntimeNumberControl: FieldControl = (props) => {
  const raw = props.field.precision;
  const parsed = raw === undefined || raw === null || raw === "" ? undefined : Number(raw);
  const displayPrecision = parsed !== undefined && Number.isFinite(parsed)
    ? String(Math.min(2, Math.max(0, Math.floor(parsed))))
    : "2";
  return NumberControl({
    ...props,
    field: { ...props.field, precision: displayPrecision },
  });
};

/** Registry required by generic forms; route renderers remain independently lazy. */
export function createFullRegistry(): ControlRegistry {
  const registry = registerTableControls(createDefaultRegistry());
  for (const fieldtype of ["Float", "Currency", "Percent", "Rating"] as const) {
    registry.register(fieldtype, TwoDecimalRuntimeNumberControl);
  }
  return registry;
}
