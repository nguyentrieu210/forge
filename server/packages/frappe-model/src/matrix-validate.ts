import { errors } from "../../core/src/index.js";
import type { DocFieldMeta, DocTypeKind } from "./types.js";
import type {
  MatrixActionInputField,
  MatrixActionInputFieldtype,
  MatrixActionInputTable,
  MatrixActionRef,
  MatrixAxisPolicy,
  MatrixCellPolicy,
  MatrixColumnAxisPolicy,
  MatrixColumnMemberPolicy,
  MatrixEditor,
  MatrixNavigatorPolicy,
  MatrixPresentationPolicy,
  MatrixQueryPolicy,
  MatrixRowAxisPolicy,
  MatrixRowMemberPolicy,
  MatrixSourceRef,
  MatrixValueValidation,
  MatrixViewPolicy,
  MatrixWritePermissionAction,
  MatrixWriteRef,
} from "./matrix-types.js";

const MATRIX_EDITORS = new Set<MatrixEditor>(["Data", "Int", "Float", "Currency", "Percent", "Check", "Select", "Link"]);
const NUMERIC_EDITORS = new Set<MatrixEditor>(["Int", "Float", "Currency", "Percent"]);
const WRITE_PERMISSION_ACTIONS = new Set<MatrixWritePermissionAction>(["write", "create", "submit"]);
const SYSTEM_READ_FIELDS = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"]);
const ACTION_INPUT_NAME = /^[a-z][a-z0-9_]*$/;
const ACTION_INPUT_FIELDTYPES = new Set<MatrixActionInputFieldtype>([
  "Data", "Small Text", "Text", "Int", "Float", "Currency", "Percent",
  "Check", "Select", "Link", "Date", "Datetime", "Time", "Attach", "Attach Image",
]);

export interface MatrixMetaContext {
  name: string;
  kind?: DocTypeKind;
  isChild: boolean;
  isTree: boolean;
  isSingle: boolean;
  isSubmittable: boolean;
  fields: DocFieldMeta[];
}

export function parseMatrixViewPolicy(value: unknown, context: MatrixMetaContext): MatrixViewPolicy {
  const input = object(value, "viewPolicy.matrix");
  const enabled = boolean(input.enabled, "viewPolicy.matrix.enabled", false);
  if (!enabled) {
    only(input, ["enabled"], "viewPolicy.matrix");
    return { enabled: false };
  }

  only(input, [
    "enabled", "navigator", "rowAxis", "columnAxis", "cell", "write",
    "rowMembers", "columnMembers", "query", "presentation", "dirtyPolicy", "conflictPolicy",
  ], "viewPolicy.matrix");

  const rowAxis = parseRowAxis(input.rowAxis, "viewPolicy.matrix.rowAxis", context);
  const columnAxis = parseColumnAxis(input.columnAxis, "viewPolicy.matrix.columnAxis", context);
  if (sourceIdentity(rowAxis.source) === sourceIdentity(columnAxis.source) && rowAxis.keyField === columnAxis.keyField) {
    throw errors.validation("viewPolicy.matrix rowAxis and columnAxis cannot use the same source/key identity");
  }

  const cell = parseCell(input.cell, "viewPolicy.matrix.cell", context);
  if (cell.disabledColumnReadOnly && !columnAxis.disabledField) {
    throw errors.validation("viewPolicy.matrix.cell.disabledColumnReadOnly requires columnAxis.disabledField");
  }
  const navigator = input.navigator === undefined ? undefined : parseNavigator(input.navigator, "viewPolicy.matrix.navigator", context);
  const write = input.write === undefined ? undefined : parseWrite(input.write, "viewPolicy.matrix.write", context);
  const rowMembers = input.rowMembers === undefined ? undefined : parseRowMembers(input.rowMembers, "viewPolicy.matrix.rowMembers");
  if (rowMembers?.primaryRemovable === false && !rowAxis.primaryField) {
    throw errors.validation("viewPolicy.matrix.rowMembers.primaryRemovable=false requires rowAxis.primaryField");
  }
  const columnMembers = input.columnMembers === undefined ? undefined : parseColumnMembers(input.columnMembers, "viewPolicy.matrix.columnMembers");
  const query = parseQuery(input.query, "viewPolicy.matrix.query");
  const presentation = input.presentation === undefined
    ? defaultPresentation()
    : parsePresentation(input.presentation, "viewPolicy.matrix.presentation");
  const dirtyPolicy = input.dirtyPolicy === undefined ? "warn" : enumText(input.dirtyPolicy, "viewPolicy.matrix.dirtyPolicy", ["warn", "block"] as const);
  const conflictPolicy = input.conflictPolicy === undefined
    ? "reject"
    : enumText(input.conflictPolicy, "viewPolicy.matrix.conflictPolicy", ["reject", "prompt_reload"] as const);

  return {
    enabled: true,
    ...(navigator ? { navigator } : {}),
    rowAxis,
    columnAxis,
    cell,
    ...(write ? { write } : {}),
    ...(rowMembers ? { rowMembers } : {}),
    ...(columnMembers ? { columnMembers } : {}),
    query,
    presentation,
    dirtyPolicy,
    conflictPolicy,
  };
}

function parseSource(value: unknown, path: string): MatrixSourceRef {
  const input = object(value, path);
  only(input, ["kind", "name", "permissionDoctype", "permissionAction"], path);
  const kind = enumText(input.kind, `${path}.kind`, ["doctype", "projection"] as const);
  const name = text(input.name, `${path}.name`, 240);
  const permissionDoctype = text(input.permissionDoctype, `${path}.permissionDoctype`, 160);
  const permissionAction = enumText(input.permissionAction, `${path}.permissionAction`, ["read"] as const);
  return { kind, name, permissionDoctype, permissionAction };
}

function parseAxisBase(value: unknown, path: string, context: MatrixMetaContext, extraKeys: string[] = []): { input: Record<string, unknown>; axis: MatrixAxisPolicy } {
  const input = object(value, path);
  only(input, ["source", "keyField", "labelField", "searchFields", "filterFields", ...extraKeys], path);
  const source = parseSource(input.source, `${path}.source`);
  const keyField = sourceField(input.keyField, `${path}.keyField`, source, context);
  const labelField = sourceField(input.labelField, `${path}.labelField`, source, context);
  const searchFields = input.searchFields === undefined ? undefined : sourceFieldList(input.searchFields, `${path}.searchFields`, source, context);
  const filterFields = input.filterFields === undefined ? undefined : sourceFieldList(input.filterFields, `${path}.filterFields`, source, context);
  return {
    input,
    axis: {
      source,
      keyField,
      labelField,
      ...(searchFields ? { searchFields } : {}),
      ...(filterFields ? { filterFields } : {}),
    },
  };
}

function parseRowAxis(value: unknown, path: string, context: MatrixMetaContext): MatrixRowAxisPolicy {
  const { input, axis } = parseAxisBase(value, path, context, ["primaryField", "auxiliaryFields"]);
  const primaryField = input.primaryField === undefined ? undefined : sourceField(input.primaryField, `${path}.primaryField`, axis.source, context);
  if (primaryField) assertCheckReadField(axis.source, primaryField, `${path}.primaryField`, context);
  if (input.auxiliaryFields === undefined) return { ...axis, ...(primaryField ? { primaryField } : {}) };
  if (!Array.isArray(input.auxiliaryFields)) throw errors.validation(`${path}.auxiliaryFields must be an array`);
  const auxiliaryFields = input.auxiliaryFields.map((raw, index) => {
    const itemPath = `${path}.auxiliaryFields[${index}]`;
    const item = object(raw, itemPath);
    only(item, ["field", "label", "editor", "readOnlyWhenField", "validation"], itemPath);
    const field = sourceField(item.field, `${itemPath}.field`, axis.source, context);
    const label = item.label === undefined ? undefined : text(item.label, `${itemPath}.label`, 160);
    const readOnlyWhenField = inputTextOrUndefined(item.readOnlyWhenField, `${itemPath}.readOnlyWhenField`, 160);
    if (readOnlyWhenField) assertCheckReadField(axis.source, readOnlyWhenField, `${itemPath}.readOnlyWhenField`, context);
    const validation = item.validation === undefined ? undefined : valueValidation(item.validation, `${itemPath}.validation`);
    if (item.editor === undefined) {
      if (readOnlyWhenField || validation) throw errors.validation(`${itemPath} needs editor when readOnlyWhenField or validation is declared`);
      return { field, ...(label ? { label } : {}) };
    }
    const editor = matrixEditor(item.editor, `${itemPath}.editor`);
    assertEditableTarget(axis.source, field, editor, `${itemPath}.field`, context);
    if (validation && !NUMERIC_EDITORS.has(editor)) throw errors.validation(`${itemPath}.validation requires a numeric editor`);
    return {
      field,
      ...(label ? { label } : {}),
      editor,
      ...(readOnlyWhenField ? { readOnlyWhenField } : {}),
      ...(validation ? { validation } : {}),
    };
  });
  unique(auxiliaryFields.map((entry) => entry.field), `${path}.auxiliaryFields`);
  return { ...axis, ...(primaryField ? { primaryField } : {}), auxiliaryFields };
}

function parseColumnAxis(value: unknown, path: string, context: MatrixMetaContext): MatrixColumnAxisPolicy {
  const { input, axis } = parseAxisBase(value, path, context, ["subtitleField", "disabledField", "selectedFirst"]);
  const subtitleField = input.subtitleField === undefined ? undefined : sourceField(input.subtitleField, `${path}.subtitleField`, axis.source, context);
  const disabledField = input.disabledField === undefined ? undefined : sourceField(input.disabledField, `${path}.disabledField`, axis.source, context);
  if (disabledField) assertCheckReadField(axis.source, disabledField, `${path}.disabledField`, context);
  return {
    ...axis,
    ...(subtitleField ? { subtitleField } : {}),
    ...(disabledField ? { disabledField } : {}),
    ...(input.selectedFirst === undefined ? {} : { selectedFirst: boolean(input.selectedFirst, `${path}.selectedFirst`, false) }),
  };
}

function parseNavigator(value: unknown, path: string, context: MatrixMetaContext): MatrixNavigatorPolicy {
  const { input, axis } = parseAxisBase(value, path, context, ["parentField", "secondaryLabelField"]);
  const parentField = sourceField(input.parentField, `${path}.parentField`, axis.source, context);
  const secondaryLabelField = input.secondaryLabelField === undefined
    ? undefined
    : sourceField(input.secondaryLabelField, `${path}.secondaryLabelField`, axis.source, context);
  return { ...axis, parentField, ...(secondaryLabelField ? { secondaryLabelField } : {}) };
}

function parseCell(value: unknown, path: string, context: MatrixMetaContext): MatrixCellPolicy {
  const input = object(value, path);
  only(input, ["source", "identity", "valueField", "editor", "enabled", "versionField", "validation", "disabledColumnReadOnly"], path);
  const source = parseSource(input.source, `${path}.source`);
  const identityInput = object(input.identity, `${path}.identity`);
  only(identityInput, ["rowField", "columnField", "recordField"], `${path}.identity`);
  const rowField = sourceField(identityInput.rowField, `${path}.identity.rowField`, source, context);
  const columnField = sourceField(identityInput.columnField, `${path}.identity.columnField`, source, context);
  if (rowField === columnField) throw errors.validation(`${path}.identity rowField and columnField must differ`);
  const recordField = identityInput.recordField === undefined
    ? undefined
    : sourceField(identityInput.recordField, `${path}.identity.recordField`, source, context);
  const valueField = sourceField(input.valueField, `${path}.valueField`, source, context);
  const editor = matrixEditor(input.editor, `${path}.editor`);
  assertEditableTarget(source, valueField, editor, `${path}.valueField`, context);
  const versionField = input.versionField === undefined ? undefined : sourceField(input.versionField, `${path}.versionField`, source, context);
  const validation = input.validation === undefined ? undefined : valueValidation(input.validation, `${path}.validation`);
  if (validation && !NUMERIC_EDITORS.has(editor)) throw errors.validation(`${path}.validation requires a numeric editor`);

  let enabled;
  if (input.enabled !== undefined) {
    const enabledInput = object(input.enabled, `${path}.enabled`);
    only(enabledInput, ["field", "when"], `${path}.enabled`);
    const field = sourceField(enabledInput.field, `${path}.enabled.field`, source, context);
    const when = enumText(enabledInput.when, `${path}.enabled.when`, ["truthy", "falsy"] as const);
    assertEditableTarget(source, field, "Check", `${path}.enabled.field`, context);
    enabled = { field, when } as const;
  }
  return {
    source,
    identity: { rowField, columnField, ...(recordField ? { recordField } : {}) },
    valueField,
    editor,
    ...(enabled ? { enabled } : {}),
    ...(versionField ? { versionField } : {}),
    ...(validation ? { validation } : {}),
    ...(input.disabledColumnReadOnly === undefined ? {} : { disabledColumnReadOnly: boolean(input.disabledColumnReadOnly, `${path}.disabledColumnReadOnly`, false) }),
  };
}

function parseWrite(value: unknown, path: string, context: MatrixMetaContext): MatrixWriteRef {
  const input = object(value, path);
  const strategy = enumText(input.strategy, `${path}.strategy`, ["document_update", "action"] as const);
  if (strategy === "document_update") {
    only(input, ["strategy", "permissionDoctype", "permissionAction"], path);
    if (!genericDocumentUpdateSafe(context)) {
      throw errors.validation(`${path} cannot use document_update for transaction, child, tree, single, or submittable metadata`);
    }
    const permissionDoctype = text(input.permissionDoctype, `${path}.permissionDoctype`, 160);
    const permissionAction = enumText(input.permissionAction, `${path}.permissionAction`, ["write"] as const);
    return { strategy, permissionDoctype, permissionAction };
  }
  only(input, ["strategy", "action", "permissionDoctype", "permissionAction"], path);
  const action = text(input.action, `${path}.action`, 240);
  const permissionDoctype = text(input.permissionDoctype, `${path}.permissionDoctype`, 160);
  const permissionAction = writePermission(input.permissionAction, `${path}.permissionAction`);
  return { strategy, action, permissionDoctype, permissionAction };
}

function parseAction(value: unknown, path: string): MatrixActionRef {
  const input = object(value, path);
  only(input, ["action", "permissionDoctype", "permissionAction", "label", "description", "confirm", "fields", "inputTables"], path);
  const fields = input.fields === undefined ? undefined : parseActionFields(input.fields, `${path}.fields`);
  const inputTables = input.inputTables === undefined ? undefined : parseActionInputTables(input.inputTables, `${path}.inputTables`);
  assertActionInputNamesUnique(fields ?? [], inputTables ?? [], path);
  return {
    action: text(input.action, `${path}.action`, 240),
    permissionDoctype: text(input.permissionDoctype, `${path}.permissionDoctype`, 160),
    permissionAction: writePermission(input.permissionAction, `${path}.permissionAction`),
    ...(input.label === undefined ? {} : { label: text(input.label, `${path}.label`, 160) }),
    ...(input.description === undefined ? {} : { description: text(input.description, `${path}.description`, 500) }),
    ...(input.confirm === undefined ? {} : { confirm: text(input.confirm, `${path}.confirm`, 320) }),
    ...(fields?.length ? { fields } : {}),
    ...(inputTables?.length ? { inputTables } : {}),
  };
}

function parseActionFields(value: unknown, path: string): MatrixActionInputField[] {
  if (!Array.isArray(value)) throw errors.validation(`${path} must be an array`);
  if (value.length > 64) throw errors.validation(`${path} may declare at most 64 fields`);
  const fields = value.map((entry, index) => parseActionInputField(entry, `${path}[${index}]`));
  unique(fields.map((entry) => entry.fieldname), path);
  return fields;
}

function parseActionInputField(value: unknown, path: string): MatrixActionInputField {
  const input = object(value, path);
  only(input, ["fieldname", "label", "fieldtype", "options", "required", "default", "description"], path);
  const fieldname = actionInputName(input.fieldname, `${path}.fieldname`);
  const fieldtype = actionInputFieldtype(input.fieldtype ?? "Data", `${path}.fieldtype`);
  const options = input.options === undefined ? undefined : text(input.options, `${path}.options`, 2000);
  if ((fieldtype === "Link" || fieldtype === "Select") && !options) {
    throw errors.validation(`${path} is a ${fieldtype} but names no options`);
  }
  return {
    fieldname,
    label: text(input.label, `${path}.label`, 160),
    fieldtype,
    ...(options ? { options } : {}),
    ...(input.required === undefined ? {} : { required: boolean(input.required, `${path}.required`, false) }),
    ...(input.default === undefined ? {} : { default: text(input.default, `${path}.default`, 160) }),
    ...(input.description === undefined ? {} : { description: text(input.description, `${path}.description`, 320) }),
  };
}

function parseActionInputTables(value: unknown, path: string): MatrixActionInputTable[] {
  if (!Array.isArray(value)) throw errors.validation(`${path} must be an array`);
  if (value.length > 32) throw errors.validation(`${path} may declare at most 32 tables`);
  const tables = value.map((entry, index) => parseActionInputTable(entry, `${path}[${index}]`));
  unique(tables.map((entry) => entry.fieldname), path);
  return tables;
}

function parseActionInputTable(value: unknown, path: string): MatrixActionInputTable {
  const input = object(value, path);
  only(input, ["fieldname", "label", "description", "columns", "minRows", "maxRows", "allowPaste"], path);
  if (!Array.isArray(input.columns)) throw errors.validation(`${path}.columns must be an array`);
  if (input.columns.length === 0) throw errors.validation(`${path}.columns must not be empty`);
  if (input.columns.length > 64) throw errors.validation(`${path}.columns may declare at most 64 columns`);
  const columns = input.columns.map((entry, index) => parseActionInputField(entry, `${path}.columns[${index}]`));
  unique(columns.map((entry) => entry.fieldname), `${path}.columns`);
  const minRows = input.minRows === undefined ? 1 : integer(input.minRows, `${path}.minRows`, 1, 500);
  const maxRows = input.maxRows === undefined ? 100 : integer(input.maxRows, `${path}.maxRows`, 1, 500);
  if (maxRows < minRows) throw errors.validation(`${path}.maxRows must be greater than or equal to minRows`);
  return {
    fieldname: actionInputName(input.fieldname, `${path}.fieldname`),
    label: text(input.label, `${path}.label`, 160),
    ...(input.description === undefined ? {} : { description: text(input.description, `${path}.description`, 500) }),
    columns,
    minRows,
    maxRows,
    allowPaste: boolean(input.allowPaste, `${path}.allowPaste`, true),
  };
}

function assertActionInputNamesUnique(fields: MatrixActionInputField[], tables: MatrixActionInputTable[], path: string): void {
  const seen = new Set(fields.map((entry) => entry.fieldname));
  for (const table of tables) {
    if (seen.has(table.fieldname)) throw errors.validation(`${path} input key is declared more than once: ${table.fieldname}`);
    seen.add(table.fieldname);
  }
}

function actionInputName(value: unknown, path: string): string {
  const result = text(value, path, 120);
  if (!ACTION_INPUT_NAME.test(result)) throw errors.validation(`${path} must use lowercase letters, digits and underscore`);
  return result;
}

function actionInputFieldtype(value: unknown, path: string): MatrixActionInputFieldtype {
  const result = text(value, path, 32) as MatrixActionInputFieldtype;
  if (!ACTION_INPUT_FIELDTYPES.has(result)) throw errors.validation(`${path} is not a renderable action input fieldtype: ${result}`);
  return result;
}

function parseRowMembers(value: unknown, path: string): MatrixRowMemberPolicy {
  const input = object(value, path);
  only(input, ["create", "remove", "primaryRemovable"], path);
  const create = input.create === undefined ? undefined : parseAction(input.create, `${path}.create`);
  const remove = input.remove === undefined ? undefined : parseAction(input.remove, `${path}.remove`);
  return {
    ...(create ? { create } : {}),
    ...(remove ? { remove } : {}),
    ...(input.primaryRemovable === undefined ? {} : { primaryRemovable: boolean(input.primaryRemovable, `${path}.primaryRemovable`, false) }),
  };
}

function parseColumnMembers(value: unknown, path: string): MatrixColumnMemberPolicy {
  const input = object(value, path);
  only(input, ["create", "allowHide", "allowHideAll", "allowShow", "allowShowAll"], path);
  const create = input.create === undefined ? undefined : parseAction(input.create, `${path}.create`);
  const allowHide = input.allowHide === undefined ? undefined : boolean(input.allowHide, `${path}.allowHide`, false);
  const allowHideAll = input.allowHideAll === undefined ? undefined : boolean(input.allowHideAll, `${path}.allowHideAll`, false);
  const allowShow = input.allowShow === undefined ? undefined : boolean(input.allowShow, `${path}.allowShow`, false);
  const allowShowAll = input.allowShowAll === undefined ? undefined : boolean(input.allowShowAll, `${path}.allowShowAll`, false);
  if (allowHideAll && allowHide !== true) throw errors.validation(`${path}.allowHideAll requires allowHide=true`);
  if (allowShowAll && allowShow !== true) throw errors.validation(`${path}.allowShowAll requires allowShow=true`);
  return {
    ...(create ? { create } : {}),
    ...(allowHide === undefined ? {} : { allowHide }),
    ...(allowHideAll === undefined ? {} : { allowHideAll }),
    ...(allowShow === undefined ? {} : { allowShow }),
    ...(allowShowAll === undefined ? {} : { allowShowAll }),
  };
}

function parseQuery(value: unknown, path: string): MatrixQueryPolicy {
  const input = object(value, path);
  only(input, ["pageSize", "searchLimit", "minSearchChars", "searchMode", "accentInsensitive"], path);
  return {
    pageSize: integer(input.pageSize, `${path}.pageSize`, 20, 500),
    searchLimit: integer(input.searchLimit, `${path}.searchLimit`, 1, 200),
    minSearchChars: integer(input.minSearchChars, `${path}.minSearchChars`, 0, 10),
    ...(input.searchMode === undefined ? {} : { searchMode: enumText(input.searchMode, `${path}.searchMode`, ["contains", "prefix", "token_contains"] as const) }),
    ...(input.accentInsensitive === undefined ? {} : { accentInsensitive: boolean(input.accentInsensitive, `${path}.accentInsensitive`, false) }),
  };
}

function parsePresentation(value: unknown, path: string): MatrixPresentationPolicy {
  const input = object(value, path);
  only(input, [
    "stickyRowAxis", "stickyColumnAxis", "focusMode", "mobileMode",
    "navigatorResizable", "navigatorCollapsible", "showDirtyIndicator", "unsavedChangeGuard",
  ], path);
  return {
    stickyRowAxis: boolean(input.stickyRowAxis, `${path}.stickyRowAxis`, false),
    stickyColumnAxis: boolean(input.stickyColumnAxis, `${path}.stickyColumnAxis`, false),
    focusMode: input.focusMode === undefined ? "inline" : enumText(input.focusMode, `${path}.focusMode`, ["inline", "toggle"] as const),
    mobileMode: input.mobileMode === undefined ? "scroll" : enumText(input.mobileMode, `${path}.mobileMode`, ["scroll", "step"] as const),
    navigatorResizable: boolean(input.navigatorResizable, `${path}.navigatorResizable`, false),
    navigatorCollapsible: boolean(input.navigatorCollapsible, `${path}.navigatorCollapsible`, false),
    showDirtyIndicator: boolean(input.showDirtyIndicator, `${path}.showDirtyIndicator`, true),
    unsavedChangeGuard: boolean(input.unsavedChangeGuard, `${path}.unsavedChangeGuard`, true),
  };
}

function defaultPresentation(): MatrixPresentationPolicy {
  return {
    stickyRowAxis: false,
    stickyColumnAxis: false,
    focusMode: "inline",
    mobileMode: "scroll",
    navigatorResizable: false,
    navigatorCollapsible: false,
    showDirtyIndicator: true,
    unsavedChangeGuard: true,
  };
}

function assertEditableTarget(source: MatrixSourceRef, fieldname: string, editor: MatrixEditor, path: string, context: MatrixMetaContext): void {
  if (source.kind !== "doctype" || source.name !== context.name) return;
  const field = context.fields.find((entry) => entry.fieldname === fieldname);
  if (!field) throw errors.validation(`${path} must name an editable field on ${context.name}`);
  if (field.fieldtype !== editor) throw errors.validation(`${path} editor ${editor} does not match ${field.fieldtype}`);
  if (field.read_only || field.read_only_depends_on || field.serverEnforced || field.surface === "internal") {
    throw errors.validation(`${path} targets a readonly or server-owned field`);
  }
  if (["readonly", "hidden", "set_once", "immutable_after_submit"].includes(field.editMode ?? "editable")) {
    throw errors.validation(`${path} targets field with unsafe editMode ${field.editMode}`);
  }
}

function assertCheckReadField(source: MatrixSourceRef, fieldname: string, path: string, context: MatrixMetaContext): void {
  if (source.kind !== "doctype" || source.name !== context.name) return;
  const field = context.fields.find((entry) => entry.fieldname === fieldname);
  if (!field || field.fieldtype !== "Check") throw errors.validation(`${path} must name a Check field on ${context.name}`);
}

function sourceField(value: unknown, path: string, source: MatrixSourceRef, context: MatrixMetaContext): string {
  const field = identifier(value, path);
  if (source.kind === "doctype" && source.name === context.name) {
    if (!SYSTEM_READ_FIELDS.has(field) && !context.fields.some((entry) => entry.fieldname === field)) {
      throw errors.validation(`${path} names unknown field: ${field}`);
    }
  }
  return field;
}

function sourceFieldList(value: unknown, path: string, source: MatrixSourceRef, context: MatrixMetaContext): string[] {
  if (!Array.isArray(value)) throw errors.validation(`${path} must be an array`);
  const result = value.map((entry, index) => sourceField(entry, `${path}[${index}]`, source, context));
  unique(result, path);
  return result;
}

function genericDocumentUpdateSafe(context: MatrixMetaContext): boolean {
  if (context.kind && context.kind !== "master") return false;
  return !context.isChild && !context.isTree && !context.isSingle && !context.isSubmittable;
}

function sourceIdentity(source: MatrixSourceRef): string {
  return `${source.kind}:${source.name}`;
}

function matrixEditor(value: unknown, path: string): MatrixEditor {
  const result = text(value, path, 32) as MatrixEditor;
  if (!MATRIX_EDITORS.has(result)) throw errors.validation(`${path} is not a supported Matrix editor: ${result}`);
  return result;
}

function valueValidation(value: unknown, path: string): MatrixValueValidation {
  return enumText(value, path, ["positive", "non_negative"] as const);
}

function writePermission(value: unknown, path: string): MatrixWritePermissionAction {
  const result = text(value, path, 16) as MatrixWritePermissionAction;
  if (!WRITE_PERMISSION_ACTIONS.has(result)) throw errors.validation(`${path} must be write, create, or submit`);
  return result;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function only(input: Record<string, unknown>, allowed: string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) if (!allowedSet.has(key)) throw errors.validation(`${path} has unknown property: ${key}`);
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${path} must be a non-empty string up to ${max} characters`);
  return value.trim();
}

function inputTextOrUndefined(value: unknown, path: string, max: number): string | undefined {
  return value === undefined ? undefined : text(value, path, max);
}

function identifier(value: unknown, path: string): string {
  const result = text(value, path, 160);
  if (!/^[a-z][a-z0-9_]*$/i.test(result)) throw errors.validation(`${path} must be an identifier`);
  return result;
}

function boolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw errors.validation(`${path} must be true or false`);
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw errors.validation(`${path} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function enumText<const T extends readonly string[]>(value: unknown, path: string, allowed: T): T[number] {
  const result = text(value, path, 80);
  if (!(allowed as readonly string[]).includes(result)) throw errors.validation(`${path} must be one of: ${allowed.join(", ")}`);
  return result as T[number];
}

function unique(values: string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw errors.validation(`${path} contains duplicate field: ${value}`);
    seen.add(value);
  }
}
