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
import {
  parseAppActionBatchContract,
  parseLegacyBatchActionField,
  type AppActionBatchContract,
} from "./batch-action.js";

/**
 * Temporary storage/wire bridge while all installed packages and clients still understand
 * the Bulk Transaction v1 Text-field transport.
 *
 * New package authors may declare `input_tables` plus an optional first-class `batch`
 * contract. Before the existing manifest parser/installer sees the package we lower each
 * table to the exact legacy Text shape the current generic ActionScreen already renders.
 * Rich presentation/summary metadata rides beside the legacy columns; old clients ignore it,
 * while new clients reconstruct the canonical contract without losing behavior.
 *
 * This bridge is intentionally isolated and deletable. It contains no business rule and no
 * tenant data write of its own; the canonical AppInstaller remains the authority for install,
 * ownership, dependencies and transactions.
 */

export type AppActionWithInputTables = AppAction & {
  input_tables?: AppActionInputTable[];
  batch?: AppActionBatchContract;
};

export type AppManifestWithInputTables = Omit<AppManifest, "actions"> & {
  actions: AppActionWithInputTables[];
};

type RawAction = JsonObject & {
  fields?: JsonValue[];
  input_tables?: JsonValue[];
  batch?: JsonValue;
  preview?: JsonValue;
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

function legacyOptions(table: AppActionInputTable, batch?: AppActionBatchContract): string {
  return `${LEGACY_PREFIX}${JSON.stringify({
    columns: table.columns,
    minRows: table.min_rows,
    maxRows: table.max_rows,
    allowPaste: table.allow_paste,
    ...(table.presentation ? { presentation: table.presentation } : {}),
    ...(table.summary ? { summary: table.summary } : {}),
    ...(batch ? { batch } : {}),
  })}`;
}

/**
 * Lower first-class `actions[].input_tables` and `actions[].batch` to the currently installed
 * manifest shape. The returned value is a deep clone, so hashing/retaining the original
 * package remains safe.
 */
export function lowerActionInputTablesForInstall(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = structuredClone(value) as JsonObject;
  if (input.actions === undefined) return input;

  const actions = array(input.actions, "actions");
  const linkTargets = linkTargetsFromPackage(input);
  input.actions = actions.map((raw, actionIndex) => {
    const action = object(raw, `actions[${actionIndex}]`) as RawAction;
    if (action.input_tables === undefined && action.batch === undefined) return action;
    if (action.input_tables === undefined && action.batch !== undefined) {
      throw errors.validation(`actions[${actionIndex}].batch requires input_tables`);
    }

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

    const batch = action.batch === undefined
      ? undefined
      : parseAppActionBatchContract(action.batch, tables, {
          where: `actions[${actionIndex}].batch`,
          hasPreview: action.preview !== undefined,
        });

    const loweredFields: JsonValue[] = [
      ...fields,
      ...tables.map((table): JsonObject => ({
        fieldname: table.fieldname,
        label: table.label,
        fieldtype: "Text",
        options: legacyOptions(table, batch?.input_table === table.fieldname ? batch : undefined),
        required: table.min_rows > 0,
        ...(table.description ? { description: table.description } : {}),
      })),
    ];

    const { input_tables: _removedTables, batch: _removedBatch, ...rest } = action;
    return { ...rest, fields: loweredFields } as JsonObject;
  });
  return input;
}

/**
 * Decorate installed actions with first-class `input_tables` plus canonical `batch` metadata.
 * Compatibility fields remain in `fields` until the rolling migration closes.
 */
export function decorateActionInputTables(actions: AppAction[]): AppActionWithInputTables[] {
  return actions.map((action) => {
    const tables: AppActionInputTable[] = [];
    let batch: AppActionBatchContract | undefined;
    for (const field of action.fields) {
      const table = parseLegacyBulkTransactionField(field);
      if (!table) continue;
      tables.push(table);
      const candidate = parseLegacyBatchActionField(field, table, action.preview !== undefined);
      if (!candidate) continue;
      if (batch) throw errors.validation(`AppAction ${action.name} stores more than one batch contract`);
      batch = candidate;
    }
    if (!tables.length && !batch) return action;
    return {
      ...action,
      ...(tables.length ? { input_tables: tables } : {}),
      ...(batch ? { batch } : {}),
    };
  });
}

/**
 * Server-authoritative parser view for tooling and tests during the rolling migration.
 * The base parser remains the validator for the canonical installed manifest shape.
 */
export function parseAppManifestWithInputTables(value: unknown): AppManifestWithInputTables {
  const manifest = parseBaseAppManifest(lowerActionInputTablesForInstall(value));
  return {
    ...manifest,
    actions: decorateActionInputTables(manifest.actions),
  };
}
