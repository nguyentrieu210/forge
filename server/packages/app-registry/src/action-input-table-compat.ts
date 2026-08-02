import { errors } from "../../core/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import {
  parseAppManifest as parseBaseAppManifest,
  type AppAction,
  type AppManifest,
} from "./manifest.js";
import {
  assertActionInputNamesUnique,
  parseAppActionInputTable,
  parseLegacyBulkTransactionField,
  type AppActionInputTable,
} from "./action-input-table.js";

/**
 * Temporary storage/wire bridge while all installed packages and clients still understand
 * the Bulk Transaction v1 Text-field transport.
 *
 * New package authors may declare `input_tables` first-class. Before the existing manifest
 * parser/installer sees the package we lower each table to the exact legacy Text shape the
 * current generic ActionScreen already renders. Reading installed apps performs the inverse
 * decoration so a new client can migrate without a flag day.
 *
 * This bridge is intentionally isolated and deletable. It contains no business rule and no
 * tenant data write of its own; the canonical AppInstaller remains the authority for install,
 * ownership, dependencies and transactions.
 */

export type AppActionWithInputTables = AppAction & {
  input_tables?: AppActionInputTable[];
};

export type AppManifestWithInputTables = Omit<AppManifest, "actions"> & {
  actions: AppActionWithInputTables[];
};

type RawAction = JsonObject & {
  fields?: JsonValue[];
  input_tables?: JsonValue[];
};

const LEGACY_PREFIX = "BulkTransaction:";

function object(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`${where} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, where: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${where} must be an array`);
  return value as JsonValue[];
}

function linkTargetsFromPackage(input: JsonObject): ReadonlySet<string> {
  const targets = new Set<string>();
  for (const raw of Array.isArray(input.doctypes) ? input.doctypes : []) {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.name === "string") {
      targets.add(raw.name);
    }
  }
  for (const raw of Array.isArray(input.externalDocTypes) ? input.externalDocTypes : []) {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.name === "string") {
      targets.add(raw.name);
    }
  }
  return targets;
}

function legacyOptions(table: AppActionInputTable): string {
  return `${LEGACY_PREFIX}${JSON.stringify({
    columns: table.columns,
    minRows: table.min_rows,
    maxRows: table.max_rows,
    allowPaste: table.allow_paste,
  })}`;
}

/**
 * Lower first-class `actions[].input_tables` to the currently installed manifest shape.
 *
 * The returned value is a deep clone, so callers can safely hash/retain the original package
 * value and no in-memory request object is mutated as a side effect of installation.
 */
export function lowerActionInputTablesForInstall(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = structuredClone(value) as JsonObject;
  if (input.actions === undefined) return input;

  const actions = array(input.actions, "actions");
  const linkTargets = linkTargetsFromPackage(input);
  input.actions = actions.map((raw, actionIndex) => {
    const action = object(raw, `actions[${actionIndex}]`) as RawAction;
    if (action.input_tables === undefined) return action;

    const tables = array(action.input_tables, `actions[${actionIndex}].input_tables`).map((table, tableIndex) =>
      parseAppActionInputTable(table, tableIndex, linkTargets));
    const fields = action.fields === undefined ? [] : array(action.fields, `actions[${actionIndex}].fields`);
    const scalarNames = fields.map((field, fieldIndex) => {
      const entry = object(field, `actions[${actionIndex}].fields[${fieldIndex}]`);
      if (typeof entry.fieldname !== "string" || !entry.fieldname.trim()) {
        throw errors.validation(`actions[${actionIndex}].fields[${fieldIndex}].fieldname is required`);
      }
      return entry.fieldname.trim();
    });
    assertActionInputNamesUnique(scalarNames, tables);

    const loweredFields: JsonValue[] = [
      ...fields,
      ...tables.map((table): JsonObject => ({
        fieldname: table.fieldname,
        label: table.label,
        fieldtype: "Text",
        options: legacyOptions(table),
        required: table.min_rows > 0,
        ...(table.description ? { description: table.description } : {}),
      })),
    ];

    const { input_tables: _removed, ...rest } = action;
    return { ...rest, fields: loweredFields } as JsonObject;
  });
  return input;
}

/**
 * Decorate installed actions with first-class `input_tables` by decoding compatibility
 * fields. Compatibility fields remain in `fields` until WS14 ships a renderer that prefers
 * `input_tables`; retaining them keeps old deployed clients working during rolling upgrades.
 */
export function decorateActionInputTables(actions: AppAction[]): AppActionWithInputTables[] {
  return actions.map((action) => {
    const tables = action.fields.flatMap((field) => {
      const table = parseLegacyBulkTransactionField(field);
      return table ? [table] : [];
    });
    return tables.length ? { ...action, input_tables: tables } : action;
  });
}

/**
 * Server-authoritative parser view for tooling and tests during the rolling migration.
 *
 * The base parser remains the single validator for the canonical manifest. This helper only
 * lowers the new repeatable-input declaration before parsing and decorates the parsed result
 * afterwards, so callers can inspect a normalized first-class contract without teaching a
 * second parser every AppManifest rule.
 *
 * IMPORTANT: the returned manifest is a READ/TOOLING VIEW and intentionally retains legacy
 * fallback fields next to `input_tables`. Do not feed it back into `AppInstaller.install()`;
 * install the original package value instead so the lowering bridge runs exactly once.
 */
export function parseAppManifestWithInputTables(value: unknown): AppManifestWithInputTables {
  const manifest = parseBaseAppManifest(lowerActionInputTablesForInstall(value));
  return {
    ...manifest,
    actions: decorateActionInputTables(manifest.actions),
  };
}
