/**
 * App package format.
 *
 * An app is DATA — metadata plus seed records — so installing one is a write, not
 * a deploy. That is what makes "a new customer in a new industry, running the
 * same day" possible: no build, no restart, no downtime, and nothing in the
 * platform's own code changes.
 *
 * Anything an app cannot express as data belongs in a Worker of its own (see
 * ROADMAP Pha 5), never in the kernel.
 */

import { errors } from "../../core/src/index.js";
import { parseCustomField, parseDocTypeMeta, validateWorkflow } from "../../frappe-model/src/index.js";
import type { CustomFieldRecord, DocTypeMeta, PrintFormatMeta, WorkflowMeta } from "../../frappe-model/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

export interface AppDependency {
  id: string;
  /** Minimum acceptable version, compared component-wise. */
  version: string;
}

/**
 * A PUBLIC face for one of the app's doctypes.
 *
 * The narrowness is the design. Not "expose get_list to guests" — one forgotten filter
 * away from serving the customer table — but: one doctype, one flag that decides what is
 * published, and an explicit list of fields a stranger may see. Everything not listed
 * stays invisible, which matters most for the fields that sit right next to the ones
 * that are listed: cost price, dealer price, stock on hand.
 */
export interface StorefrontCatalogSpec {
  doctype: string;
  /** Check field deciding whether a row is public. Nothing is public without it. */
  published_field: string;
  /** Unique, readable key used in the product URL. */
  slug_field: string;
  /** Exactly the fields a visitor may see. */
  fields: string[];
  /** Fields free-text search may look at — must be a subset of `fields`. */
  search_fields: string[];
  /** Optional field the catalogue may be filtered by, e.g. a product group. */
  facet_field?: string;
  /** Currency field order lines are priced from, ON THE SERVER. */
  price_field: string;
}

export interface StorefrontOrderSpec {
  doctype: string;
  /** Role the public write runs as; the tenant's DocPerm decides what it may do. */
  submit_as_role: string;
  /** Table field holding the order lines. */
  lines_field: string;
  /** Fields the buyer may fill in. Anything else on the doctype is staff-only. */
  buyer_fields: string[];
  /** Datetime field stamped by the server, never by the client. */
  placed_at_field: string;
  /** Currency field the server totals into. */
  total_field: string;
  /** Second factor a tracking lookup must match besides the order code. */
  track_field: string;
  /** Orders accepted from one visitor per day. */
  max_per_day: number;
}

export interface StorefrontSpec {
  catalog: StorefrontCatalogSpec;
  order?: StorefrontOrderSpec;
}

export interface AppRoleDefinition {
  role: string;
  desk_access: boolean;
}

export interface AppFixture {
  record_type: string;
  name: string;
  data: JsonObject;
}

export interface AppNavItem {
  key: string;
  label: string;
  kind: "doctype" | "route" | "workspace" | "system" | "experience";
  /** DocType whose read permission gates this navigation entry. */
  permission_doctype?: string;
  /** Optional stricter role gate, applied before the client manifest is returned. */
  required_roles?: string[];
  icon?: string;
  group?: string;
  route?: string;
}

/**
 * An event subscription.
 *
 * `event` is an exact event type (`sales_order.submitted`) or a prefix wildcard
 * (`sales_order.*`, or `*` for everything). Only a trailing `*` is allowed:
 * arbitrary patterns would make it impossible to tell, by reading a manifest,
 * which events an app actually receives.
 */
export interface AppHook {
  event: string;
}

/**
 * A write this app wants to inspect BEFORE it is committed — Frappe's `validate`.
 *
 * `doctype` is an exact name or `*`. `actions` narrows it further; omitted means every
 * write action. An app that registers a validator is asked on every matching write and
 * can refuse it, which is the one thing an after-commit hook can never do.
 *
 * Kept separate from `hooks` because the two have opposite failure modes: a hook that
 * cannot be delivered is retried for hours, while a validator that cannot be reached
 * must decide the write immediately. Conflating them would make one of those wrong.
 */
export interface AppValidator {
  doctype: string;
  actions?: string[];
}

/** Aggregates a report column may apply. `count` ignores its field and counts rows. */
export type AppReportAggregate = "count" | "sum" | "avg" | "min" | "max";

export interface AppReportColumn {
  /** A fieldname of the report's doctype, or one of the record's own columns. */
  field: string;
  label: string;
  /** DocField type, so the client formats currency as currency and dates as dates. */
  type: string;
  /**
   * Target doctype for a `Link` column.
   *
   * Without it the client has nothing to resolve the value against and prints the id:
   * a report of enrolments by class reads `LOP-2026-0001` down the key column, which is
   * the same defect the lists and the calendar each had to be fixed for.
   */
  options?: string;
  aggregate?: AppReportAggregate;
}

export interface AppReport {
  /** Also the id in `/report/<name>` and in `frappe.desk.query_report.run`. */
  name: string;
  label: string;
  /** The doctype read, and the doctype whose `report` permission is required. */
  doctype: string;
  columns: AppReportColumn[];
  /** A single grouping field. Absent means one row per document. */
  group_by?: string;
  order_by?: { column: string; direction: "asc" | "desc" };
  /** Fieldnames a user may filter on. Anything else is refused. */
  filters: string[];
  limit: number;
}

export interface AppExternalDocType {
  name: string;
  kind: "transaction" | "master" | "child_table" | "single" | "tree" | "virtual" | "system";
  /** Owning platform/app package, for install-time dependency diagnostics. */
  app: string;
  version?: string;
}

/**
 * A real overview chart backed by one declared, permission-checked app report.
 * No chart is inferred from a workflow or from the presence of a numeric field.
 */
export interface AppChart {
  name: string;
  label: string;
  source: string;
  type: "Line" | "Bar" | "Percentage" | "Pie" | "Donut" | "Heatmap";
  dimensions: string[];
  measures: string[];
  roles: string[];
  drilldown: { route: string };
  emptyFallback: "table" | "message";
}

/**
 * One input of an action screen. A DocField in everything but name, so the generic client
 * renders it with the SAME controls a form uses — Link autocompletes, thousands separators,
 * Select dropdowns — instead of a second, poorer set of inputs living next to the first.
 */
export interface AppActionField {
  fieldname: string;
  label: string;
  /** DocField type: Data, Link, Select, Int, Float, Currency, Date, Datetime, Check… */
  fieldtype: string;
  /** Link target doctype, or Select choices separated by newlines. */
  options?: string;
  required?: boolean;
  default?: string;
  description?: string;
}

/**
 * An operation a user performs by FILLING A FORM, not by editing a document.
 *
 * Cutting aluminium is the case that forced this. It is not a write to one record: it
 * picks lots, decides how many sheets to take from each, deducts them and writes cut
 * vouchers — and the person doing it must SEE what it will take before it happens,
 * because aluminium cut wrong cannot be uncut.
 *
 * Before this existed, the only ways to ship that screen were a hand-written React page
 * in the shared runtime — one customer's workshop compiled into every other customer's
 * bundle — or telling the user to call an API. Declaring it makes the screen data, like
 * the DocTypes and the reports already are.
 *
 * `preview` is optional but is the reason the shape has two halves: a read-only method
 * that answers "what would happen", then a commit the user reaches only after seeing it.
 */
export interface AppAction {
  /** Id in `/x/action:<name>`. */
  name: string;
  label: string;
  icon?: string;
  group?: string;
  description?: string;
  fields: AppActionField[];
  /** Read-only method run on demand. Must change nothing. */
  preview?: { method: string; label: string };
  /** The method that writes. Reached from the screen's primary button. */
  commit: { method: string; label: string; confirm?: string };
  /**
   * DocType whose WRITE permission gates the screen.
   *
   * Required, and deliberately so: an action runs an app method that writes, and the
   * method authenticates as the caller. Without a gate the menu entry would be offered
   * to everyone and the refusal would arrive only after they filled the form in.
   */
  permission_doctype: string;
  /** Read-only actions (for example an AI explainer) may gate on read instead of write. */
  permission_action?: "read" | "save";
  /** Response key holding the row array to render as a table. */
  result_table?: string;
}

export type AppScreenMode = "desk" | "focus" | "touch";
export type AppScreenTone = "neutral" | "info" | "success" | "warning" | "danger";

interface AppScreenBlockBase {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  /** Number of grid columns occupied by this block. */
  span?: 1 | 2 | 3;
}

export interface AppScreenMetricBlock extends AppScreenBlockBase {
  type: "metric";
  doctype: string;
  filters?: JsonObject;
  tone?: AppScreenTone;
  route?: string;
}

export interface AppScreenListBlock extends AppScreenBlockBase {
  type: "list";
  doctype: string;
  fields: string[];
  filters?: JsonObject;
  order_by?: string;
  limit: number;
  empty_text?: string;
}

export interface AppScreenActionBlock extends AppScreenBlockBase {
  type: "action";
  action: string;
}

export type AppScreenBlock = AppScreenMetricBlock | AppScreenListBlock | AppScreenActionBlock;

/**
 * A composed, app-owned screen rendered by the generic client.
 *
 * Unlike a native React Experience, this travels with the app package and therefore needs
 * no second frontend build. Blocks deliberately reuse platform data paths (DocType list/
 * count and declared AppAction) so permission checks stay server-authoritative.
 */
export interface AppScreen {
  /** Id in `/x/screen:<name>`. */
  name: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  permission_doctype: string;
  mode: AppScreenMode;
  columns: 1 | 2 | 3;
  blocks: AppScreenBlock[];
}

export interface AppDesignManifest {
  density?: "compact" | "comfortable" | "touch";
  radius?: "square" | "soft" | "round";
  content_width?: "contained" | "wide" | "fluid";
}

/**
 * How this app wants to be PRESENTED — the half of an app that used to live only in a
 * hand-written client bundle.
 *
 * Without this, shipping an app meant shipping a second artifact: a React build whose
 * `app-manifest.ts` hard-coded the brand, the landing screen and the context dimensions.
 * That artifact had to be built, hosted and versioned separately, so "install an app"
 * was a write on one side and a deploy on the other — and the two could disagree.
 *
 * Carrying it in the package makes the app ONE thing again. A single generic client
 * reads this at boot, so a new app needs no client build at all.
 */
export interface AppClientManifest {
  brand?:
    | "zinc" | "blue" | "warm" | "sakura" | "emerald" | "ocean" | "violet"
    | "indigo" | "teal" | "amber" | "rose" | "aurora" | "sunset";
  /** Overview/Process definition key (`hr`, `stock`, `selling`…). */
  domain?: string;
  /** Landing screen. A route must be one this app's nav actually reaches — see below. */
  home?: { doctype?: string; route?: string };
  /**
   * Global context selectors this app needs.
   *
   * Validated against the dimensions the server can actually resolve. A dimension the
   * server does not know is not a cosmetic mistake: the shell blocks on "choose a scope"
   * for a selector that will never have options, and the app is unusable — which is
   * exactly what an HR app asking for `warehouse` did.
   */
  dimensions?: string[];
  catalog_mode?: "manifest" | "workspace" | "hybrid";
  locale?: { numberFormat?: string; currency?: string; dateFormat?: string };
  design?: AppDesignManifest;
}

/** Dimensions the server's `metaforge.api.get_business_context` can resolve. */
export const CLIENT_CONTEXT_DIMENSIONS = new Set([
  "company", "fiscal_year", "warehouse", "branch", "cost_center",
  "project", "territory", "selling_price_list", "buying_price_list",
]);

/**
 * Experience prefixes the deployed generic runtime can actually render.
 *
 * Kept as a server-side allowlist so an app cannot declare a screen that does not exist:
 * the menu entry would install cleanly and then show "chưa được triển khai" on click.
 * Adding a prefix here is the LAST step of shipping one, never the first.
 */
export const SUPPORTED_EXPERIENCE_KINDS = new Set(["approval", "calendar", "social-commerce", "daily-ledger", "alumdoor-operations", "action", "screen"]);

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  /** Versioned opt-in to the canonical DocType/field/view contract. */
  metaContractVersion?: 1;
  /** Minimum Forge platform version required by this package. */
  platform_requires?: string;
  requires: AppDependency[];
  doctypes: DocTypeMeta[];
  workflows: WorkflowMeta[];
  print_formats: PrintFormatMeta[];
  roles: AppRoleDefinition[];
  fixtures: AppFixture[];
  /**
   * Fields this app adds to doctypes it does NOT own.
   *
   * An industry app usually needs the standard Item with a photo and a pack size on it,
   * not an Item of its own — a private product doctype would be a second catalogue that
   * the stock ledger, the price list and every selling controller cannot see. Carrying
   * the extra fields in the package is what makes them installable, upgradable and
   * removable: written by hand after install, they belong to nobody and survive the
   * uninstall of the app that needed them.
   */
  custom_fields: CustomFieldRecord[];
  /** Public catalogue and order intake, if this app has a storefront. */
  storefront?: StorefrontSpec;
  nav: AppNavItem[];
  /**
   * Worker in the dispatch namespace that receives this app's hook events.
   *
   * Required when `hooks` is non-empty: a subscription with nowhere to deliver
   * would queue events that can never be processed.
   */
  worker?: string;
  hooks: AppHook[];
  /** Pre-commit checks. Like `hooks`, useless without a `worker`. */
  validators: AppValidator[];
  /**
   * Tabular reports over this app's OWN doctypes.
   *
   * Reports used to be a fixed table inside the platform, over hand-written SQL views
   * for accounting. That is the right shape for the ledger, and the wrong shape for
   * everything else: an app shipped as data could not have a single report, so every
   * customer asking for "doanh thu theo lớp" needed a platform release. Declaring them
   * here makes a report the same kind of thing as a DocType — data the app carries.
   *
   * They are NOT arbitrary SQL. A report names a doctype, fields of that doctype, and
   * at most one grouping; the compiler builds the statement. An app cannot reach another
   * app's data, cannot join, and cannot express anything the permission layer would not
   * already allow it to read.
   */
  reports: AppReport[];
  /** Platform-owned DocTypes this package links to but deliberately does not redefine. */
  externalDocTypes: AppExternalDocType[];
  /** Explicit charts shown on Overview. Empty means no charts, never auto-generated charts. */
  charts: AppChart[];
  /**
   * Form-driven operations backed by this app's own Worker methods.
   *
   * Like `reports`, these need a `worker`: an action names methods, and a method with
   * nothing to serve it is a screen whose only button answers 404.
   */
  actions: AppAction[];
  /** App-owned composed screens rendered from data by the generic client. */
  screens: AppScreen[];
  /** Presentation. Absent means "the generic client picks sane defaults". */
  client?: AppClientManifest;
}

/** True when an event type matches a subscription pattern. */
export function hookMatches(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
  return pattern === eventType;
}

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Parses and validates a package.
 *
 * Everything is validated up front, before anything is written: a package that is
 * half-valid must be rejected whole, because a partial install leaves a tenant
 * with DocTypes whose workflows or roles are missing and no record of what went in.
 */
export function parseAppManifest(value: unknown): AppManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("An app manifest must be an object");
  const input = value as JsonObject;

  const id = text(input.id, "id", 64);
  if (!ID_PATTERN.test(id)) throw errors.validation("An app id must be lowercase letters, digits and hyphens");
  const version = text(input.version, "version", 32);
  if (!VERSION_PATTERN.test(version)) throw errors.validation("An app version must be semantic (1.2.3)");
  const metaContractVersion = input.metaContractVersion === undefined
    ? undefined
    : integer(input.metaContractVersion, "metaContractVersion", 1, 1) as 1;
  const platformRequires = input.platform_requires === undefined
    ? undefined
    : text(input.platform_requires, "platform_requires", 32);
  if (platformRequires && !VERSION_PATTERN.test(platformRequires)) {
    throw errors.validation("platform_requires must be semantic (1.2.3)");
  }

  const doctypes = array(input.doctypes, "doctypes").map((entry) => parseDocTypeMeta(entry));
  const doctypeNames = new Set(doctypes.map((meta) => meta.name));
  assertUnique(doctypes.map((meta) => meta.name), "doctype");

  const workflows = array(input.workflows ?? [], "workflows").map((entry) => validateWorkflow(entry));
  for (const workflow of workflows) {
    // A workflow for a doctype the app does not ship would silently attach to
    // nothing, or to another app's doctype.
    if (!doctypeNames.has(workflow.document_type)) {
      throw errors.validation(`Workflow ${workflow.name} targets ${workflow.document_type}, which this app does not define`);
    }
  }

  const printFormats = array(input.print_formats ?? [], "print_formats").map((entry, index) => parsePrintFormat(entry, index, doctypeNames));
  const roles = array(input.roles ?? [], "roles").map((entry, index) => parseRole(entry, index));
  const roleNames = new Set(roles.map((role) => role.role));

  // Every role a DocPerm mentions must be defined by the app or already exist as a
  // platform role; otherwise the permission row matches nobody and users appear to
  // have been granted access they do not have.
  for (const meta of doctypes) {
    for (const permission of meta.permissions) {
      if (!roleNames.has(permission.role) && !PLATFORM_ROLES.has(permission.role)) {
        throw errors.validation(`${meta.name} grants permission to role ${permission.role}, which the app does not define`);
      }
    }
  }

  const fixtures = array(input.fixtures ?? [], "fixtures").map((entry, index) => parseFixture(entry, index));

  const customFields = array(input.custom_fields ?? [], "custom_fields").map((entry) => parseCustomField(entry));
  assertUnique(customFields.map((field) => field.name), "custom field");
  for (const field of customFields) {
    // A custom field on the app's OWN doctype is a field it forgot to declare. Allowing
    // it would give one doctype two sources of truth for its schema, and the overlay
    // would win — so the definition in the package would no longer describe what
    // installs. Nothing is lost by refusing: the app can simply add the field.
    if (doctypeNames.has(field.dt)) {
      throw errors.validation(`custom_fields cannot target ${field.dt}: this app defines that doctype, so declare the field on it directly`);
    }
  }
  // Parsed BEFORE nav so a nav entry naming an action/screen that does not exist is refused here
  // rather than installing a menu line whose screen cannot be built.
  const actions = array(input.actions ?? [], "actions").map((entry, index) => parseAction(entry, index, doctypeNames));
  assertUnique(actions.map((action) => action.name), "action name");
  const actionsByName = new Map(actions.map((action) => [action.name, action]));
  const screens = array(input.screens ?? [], "screens").map((entry, index) => parseScreen(entry, index, id, doctypes, actionsByName));
  assertUnique(screens.map((screen) => screen.name), "screen name");
  const screensByName = new Map(screens.map((screen) => [screen.name, screen]));
  const nav = array(input.nav ?? [], "nav").map((entry, index) => parseNav(entry, index, doctypeNames, actionsByName, screensByName));
  assertUnique(nav.map((item) => item.key), "nav key");

  const requires = array(input.requires ?? [], "requires").map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw errors.validation(`requires[${index}] must be an object`);
    const dependency = entry as JsonObject;
    const dependencyId = text(dependency.id, `requires[${index}].id`, 64);
    if (dependencyId === id) throw errors.validation("An app cannot depend on itself");
    return { id: dependencyId, version: text(dependency.version, `requires[${index}].version`, 32) };
  });

  const hooks = array(input.hooks ?? [], "hooks").map((entry, index) => parseHook(entry, index));
  const worker = input.worker === undefined ? undefined : text(input.worker, "worker", 128);
  // A subscription with nowhere to deliver would queue events that can never be
  // processed, and the backlog would look like a broken platform rather than a
  // misdeclared app.
  if (hooks.length && !worker) throw errors.validation(`${id} declares hooks but no worker to deliver them to`);

  const validators = array(input.validators ?? [], "validators").map((entry, index) => parseValidator(entry, index));
  // A validator with nowhere to ask would have to be treated as either always-allow —
  // silently dropping the rule the app declared — or always-deny, which bricks the
  // doctype. Refusing the manifest is the only answer that is not a surprise later.
  if (validators.length && !worker) throw errors.validation(`${id} declares validators but no worker to run them`);

  const reports = array(input.reports ?? [], "reports").map((entry, index) => parseReport(entry, index, doctypeNames));
  assertUnique(reports.map((report) => report.name), "report name");

  const externalDocTypes = array(input.externalDocTypes ?? [], "externalDocTypes").map((entry, index) => parseExternalDocType(entry, index));
  assertUnique(externalDocTypes.map((entry) => entry.name), "external DocType");
  const externalNames = new Set(externalDocTypes.map((entry) => entry.name));
  if (metaContractVersion === 1) validateDocTypeReferences(doctypes, doctypeNames, externalNames);

  const charts = array(input.charts ?? [], "charts").map((entry, index) => parseChart(entry, index, reports, nav, roleNames));
  if (charts.length > 3) throw errors.validation("An app overview may declare at most 3 charts");
  assertUnique(charts.map((chart) => chart.name), "chart name");

  // Same reasoning as validators: an action names methods, and a method with no worker to
  // serve it is a screen whose only button answers 404.
  if (actions.length && !worker) throw errors.validation(`${id} declares actions but no worker to run them`);

  const storefront = input.storefront === undefined
    ? undefined
    : parseStorefront(input.storefront, doctypes, roleNames);

  const client = input.client === undefined ? undefined : parseClientManifest(input.client, nav, doctypeNames);

  return {
    id,
    name: text(input.name, "name", 160),
    version,
    ...(metaContractVersion ? { metaContractVersion } : {}),
    ...(platformRequires ? { platform_requires: platformRequires } : {}),
    requires,
    doctypes,
    workflows,
    print_formats: printFormats,
    roles,
    fixtures,
    custom_fields: customFields,
    ...(storefront === undefined ? {} : { storefront }),
    nav,
    hooks,
    validators,
    reports,
    externalDocTypes,
    charts,
    actions,
    screens,
    ...(worker === undefined ? {} : { worker }),
    ...(client === undefined ? {} : { client }),
  };
}

const EXTERNAL_DOCTYPE_KINDS = new Set<AppExternalDocType["kind"]>(["transaction", "master", "child_table", "single", "tree", "virtual", "system"]);
const CHART_TYPES = new Set<AppChart["type"]>(["Line", "Bar", "Percentage", "Pie", "Donut", "Heatmap"]);

function parseExternalDocType(value: JsonValue, index: number): AppExternalDocType {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`externalDocTypes[${index}] must be an object`);
  const entry = value as JsonObject;
  const kind = text(entry.kind, `externalDocTypes[${index}].kind`, 32) as AppExternalDocType["kind"];
  if (!EXTERNAL_DOCTYPE_KINDS.has(kind)) throw errors.validation(`externalDocTypes[${index}].kind is not recognised: ${kind}`);
  const version = entry.version === undefined ? undefined : text(entry.version, `externalDocTypes[${index}].version`, 32);
  return {
    name: text(entry.name, `externalDocTypes[${index}].name`, 160),
    kind,
    app: text(entry.app, `externalDocTypes[${index}].app`, 80),
    ...(version ? { version } : {}),
  };
}

function validateDocTypeReferences(
  doctypes: DocTypeMeta[],
  ownNames: ReadonlySet<string>,
  externalNames: ReadonlySet<string>,
): void {
  const byName = new Map(doctypes.map((meta) => [meta.name, meta]));
  for (const meta of doctypes) {
    if (!meta.kind) throw errors.validation(`${meta.name} must declare kind when externalDocTypes enables the DocType Meta contract`);
    if (!meta.viewPolicy) throw errors.validation(`${meta.name} must declare viewPolicy when externalDocTypes enables the DocType Meta contract`);
    for (const field of meta.fields) {
      if ((field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") && field.options) {
        const child = byName.get(field.options);
        if (!child || child.kind !== "child_table" || !child.is_child) {
          throw errors.validation(`${meta.name}.${field.fieldname} must target an owned child_table DocType; got ${field.options}`);
        }
      }
      if (field.fieldtype === "Link" && field.options && !ownNames.has(field.options) && !externalNames.has(field.options)) {
        throw errors.validation(`${meta.name}.${field.fieldname} links to undeclared external DocType ${field.options}`);
      }
      if (!field.valueSource || !field.editMode || !field.surface) {
        throw errors.validation(`${meta.name}.${field.fieldname} must declare valueSource, editMode and surface`);
      }
      if ((field.valueSource === "system" || field.valueSource === "workflow" || field.valueSource === "formula") && !field.serverEnforced) {
        throw errors.validation(`${meta.name}.${field.fieldname} is ${field.valueSource}-owned and must be serverEnforced`);
      }
      if (field.editMode === "hidden" && !field.serverEnforced) {
        throw errors.validation(`${meta.name}.${field.fieldname} is hidden and must be serverEnforced`);
      }
    }
  }
}

function parseChart(
  value: JsonValue,
  index: number,
  reports: AppReport[],
  nav: AppNavItem[],
  roleNames: ReadonlySet<string>,
): AppChart {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`charts[${index}] must be an object`);
  const entry = value as JsonObject;
  const source = text(entry.source, `charts[${index}].source`, 120);
  const report = reports.find((candidate) => candidate.name === source);
  if (!report) throw errors.validation(`charts[${index}].source must name a declared report: ${source}`);
  const type = text(entry.type, `charts[${index}].type`, 24) as AppChart["type"];
  if (!CHART_TYPES.has(type)) throw errors.validation(`charts[${index}].type is not recognised: ${type}`);
  const dimensions = array(entry.dimensions, `charts[${index}].dimensions`).map((item, position) => text(item, `charts[${index}].dimensions[${position}]`, 120));
  const measures = array(entry.measures, `charts[${index}].measures`).map((item, position) => text(item, `charts[${index}].measures[${position}]`, 120));
  if (dimensions.length !== 1) throw errors.validation(`charts[${index}] needs exactly one dimension`);
  if (measures.length < 1 || measures.length > 3) throw errors.validation(`charts[${index}] needs 1 to 3 measures`);
  assertUnique([...dimensions, ...measures], `charts[${index}] field`);
  if (report.group_by !== dimensions[0]) throw errors.validation(`charts[${index}] dimension must match report group_by (${report.group_by ?? "none"})`);
  const columns = new Map(report.columns.map((column) => [column.field, column]));
  if (!columns.has(dimensions[0]!)) throw errors.validation(`charts[${index}] dimension is not a report column: ${dimensions[0]}`);
  for (const measure of measures) {
    const column = columns.get(measure);
    if (!column?.aggregate) throw errors.validation(`charts[${index}] measure must be an aggregated report column: ${measure}`);
  }
  const roles = array(entry.roles, `charts[${index}].roles`).map((item, position) => {
    const role = text(item, `charts[${index}].roles[${position}]`, 120);
    if (!roleNames.has(role) && !PLATFORM_ROLES.has(role)) throw errors.validation(`charts[${index}] names undeclared role ${role}`);
    return role;
  });
  if (!roles.length) throw errors.validation(`charts[${index}] needs at least one role`);
  if (!entry.drilldown || typeof entry.drilldown !== "object" || Array.isArray(entry.drilldown)) throw errors.validation(`charts[${index}].drilldown must be an object`);
  const route = text((entry.drilldown as JsonObject).route, `charts[${index}].drilldown.route`, 320);
  if (!navReaches(route, nav)) throw errors.validation(`charts[${index}].drilldown.route is not reachable from nav: ${route}`);
  const emptyFallback = text(entry.emptyFallback ?? "table", `charts[${index}].emptyFallback`, 16);
  if (emptyFallback !== "table" && emptyFallback !== "message") throw errors.validation(`charts[${index}].emptyFallback must be table or message`);
  return {
    name: text(entry.name, `charts[${index}].name`, 120),
    label: text(entry.label ?? entry.name, `charts[${index}].label`, 160),
    source,
    type,
    dimensions,
    measures,
    roles,
    drilldown: { route },
    emptyFallback,
  };
}

const BRANDS = new Set([
  "zinc", "blue", "warm", "sakura", "emerald", "ocean", "violet",
  "indigo", "teal", "amber", "rose", "aurora", "sunset",
]);
const CATALOG_MODES = new Set(["manifest", "workspace", "hybrid"]);
const DESIGN_DENSITIES = new Set(["compact", "comfortable", "touch"]);
const DESIGN_RADII = new Set(["square", "soft", "round"]);
const DESIGN_WIDTHS = new Set(["contained", "wide", "fluid"]);

/**
 * Parses the presentation block.
 *
 * The checks here are not style policing. Each one corresponds to a way a client that
 * trusts this block renders something unusable, and every one of them has happened:
 *
 * - an unknown `brand` leaves the theme unstyled;
 * - a `dimension` the server cannot resolve wedges the shell on "choose a scope"
 *   forever, because the selector it is waiting on can never be populated;
 * - a `home.route` no nav item reaches sends the router to its catch-all, which
 *   redirects home, which is the same unreachable route — a redirect loop.
 *
 * Refusing the package is the only point at which these are cheap to fix. Past that
 * they are a tenant with an app installed that nobody can open.
 */
function parseClientManifest(value: JsonValue, nav: AppNavItem[], doctypeNames: ReadonlySet<string>): AppClientManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("client must be an object");
  const input = value as JsonObject;
  const result: AppClientManifest = {};

  if (input.brand !== undefined) {
    const brand = text(input.brand, "client.brand", 16);
    if (!BRANDS.has(brand)) throw errors.validation(`client.brand is not recognised: ${brand}`);
    result.brand = brand as NonNullable<AppClientManifest["brand"]>;
  }
  if (input.domain !== undefined) result.domain = text(input.domain, "client.domain", 64);
  if (input.catalog_mode !== undefined) {
    const mode = text(input.catalog_mode, "client.catalog_mode", 16);
    if (!CATALOG_MODES.has(mode)) throw errors.validation(`client.catalog_mode is not recognised: ${mode}`);
    result.catalog_mode = mode as NonNullable<AppClientManifest["catalog_mode"]>;
  }

  if (input.dimensions !== undefined) {
    const dimensions = array(input.dimensions, "client.dimensions").map((entry, index) => {
      const key = text(entry, `client.dimensions[${index}]`, 64);
      if (!CLIENT_CONTEXT_DIMENSIONS.has(key)) {
        throw errors.validation(`client.dimensions[${index}] is not a dimension the server can resolve: ${key}`);
      }
      return key;
    });
    assertUnique(dimensions, "client dimension");
    result.dimensions = dimensions;
  }

  if (input.home !== undefined) {
    if (!input.home || typeof input.home !== "object" || Array.isArray(input.home)) {
      throw errors.validation("client.home must be an object");
    }
    const home = input.home as JsonObject;
    const doctype = home.doctype === undefined ? undefined : text(home.doctype, "client.home.doctype", 160);
    const route = home.route === undefined ? undefined : text(home.route, "client.home.route", 320);
    if (!doctype && !route) throw errors.validation("client.home needs a doctype or a route");
    if (doctype && !doctypeNames.has(doctype)) {
      throw errors.validation(`client.home.doctype ${doctype} is not a doctype this app defines`);
    }
    if (route && !navReaches(route, nav)) {
      throw errors.validation(`client.home.route ${route} is not reachable from this app's nav — the client would redirect to it forever`);
    }
    result.home = { ...(doctype ? { doctype } : {}), ...(route ? { route } : {}) };
  }

  if (input.locale !== undefined) {
    if (!input.locale || typeof input.locale !== "object" || Array.isArray(input.locale)) {
      throw errors.validation("client.locale must be an object");
    }
    const locale = input.locale as JsonObject;
    const pick = (field: "numberFormat" | "currency" | "dateFormat") =>
      locale[field] === undefined ? {} : { [field]: text(locale[field], `client.locale.${field}`, 32) };
    result.locale = { ...pick("numberFormat"), ...pick("currency"), ...pick("dateFormat") };
  }

  if (input.design !== undefined) {
    if (!input.design || typeof input.design !== "object" || Array.isArray(input.design)) {
      throw errors.validation("client.design must be an object");
    }
    const design = input.design as JsonObject;
    const density = design.density === undefined ? undefined : text(design.density, "client.design.density", 16);
    const radius = design.radius === undefined ? undefined : text(design.radius, "client.design.radius", 16);
    const contentWidth = design.content_width === undefined ? undefined : text(design.content_width, "client.design.content_width", 16);
    if (density && !DESIGN_DENSITIES.has(density)) throw errors.validation(`client.design.density is not recognised: ${density}`);
    if (radius && !DESIGN_RADII.has(radius)) throw errors.validation(`client.design.radius is not recognised: ${radius}`);
    if (contentWidth && !DESIGN_WIDTHS.has(contentWidth)) throw errors.validation(`client.design.content_width is not recognised: ${contentWidth}`);
    result.design = {
      ...(density ? { density: density as NonNullable<AppDesignManifest["density"]> } : {}),
      ...(radius ? { radius: radius as NonNullable<AppDesignManifest["radius"]> } : {}),
      ...(contentWidth ? { content_width: contentWidth as NonNullable<AppDesignManifest["content_width"]> } : {}),
    };
  }

  return result;
}

/** The path a nav item navigates to — must agree with the client's `resolveNavPath`. */
export function navItemPath(item: AppNavItem): string | null {
  switch (item.kind) {
    case "doctype": return `/app/${encodeURIComponent(item.key)}`;
    case "experience": return `/x/${encodeURIComponent(item.key)}`;
    case "workspace": return item.route ?? "/catalog";
    case "system": return `/${item.key.replace(/^__/, "")}`;
    case "route": return item.route ?? null;
    default: return null;
  }
}

function navReaches(route: string, nav: AppNavItem[]): boolean {
  return nav.some((item) => navItemPath(item) === route);
}

const WRITE_ACTIONS = new Set(["create", "save", "submit", "cancel", "amend", "delete"]);

function parseValidator(value: JsonValue, index: number): AppValidator {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`validators[${index}] must be an object`);
  }
  const entry = value as JsonObject;
  const doctype = text(entry.doctype, `validators[${index}].doctype`, 160);
  if (entry.actions === undefined) return { doctype };
  const actions = array(entry.actions, `validators[${index}].actions`).map((action, position) => {
    const name = text(action, `validators[${index}].actions[${position}]`, 32);
    // An unknown action would never match, so the rule would silently never run —
    // exactly the failure a declarative manifest is supposed to make impossible.
    if (!WRITE_ACTIONS.has(name)) {
      throw errors.validation(`validators[${index}].actions[${position}] is not a write action: ${name}`);
    }
    return name;
  });
  return { doctype, actions };
}

const REPORT_AGGREGATES = new Set<AppReportAggregate>(["count", "sum", "avg", "min", "max"]);
/**
 * A fieldname the compiler will place into SQL.
 *
 * Checked HERE rather than at compile time because a manifest is stored and re-read: a
 * name that reaches the database is a name that will be compiled on every run, by code
 * that has long since lost the context to reject it. The pattern is deliberately narrower
 * than what a DocField allows — no dots, no quotes, no spaces — so nothing that survives
 * it can change the shape of a statement.
 */
const REPORT_FIELD = /^[a-z_][a-z0-9_]*$/;

/**
 * The record's own columns, which are real SQL columns rather than JSON payload fields.
 *
 * Compiling `name` as `json_extract(payload_json,'$.name')` returns NULL for every row —
 * a report whose key column is empty, which reads as "no data" rather than as a mistake.
 */
export const REPORT_RECORD_COLUMNS = new Set(["name", "owner", "status", "docstatus", "created_at", "modified_at"]);

function parseReport(value: JsonValue, index: number, doctypeNames: Set<string>): AppReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`reports[${index}] must be an object`);
  }
  const entry = value as JsonObject;
  const name = text(entry.name, `reports[${index}].name`, 120);
  const doctype = text(entry.doctype, `reports[${index}].doctype`, 160);
  // A report over a doctype the app does not ship would either read another app's data
  // or read nothing; both are worse than being refused at install.
  if (!doctypeNames.has(doctype)) {
    throw errors.validation(`reports[${index}] (${name}) reads ${doctype}, which this app does not define`);
  }

  const columns = array(entry.columns, `reports[${index}].columns`).map((raw, position) => {
    const where = `reports[${index}].columns[${position}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`${where} must be an object`);
    const column = raw as JsonObject;
    const field = text(column.field, `${where}.field`, 120);
    if (!REPORT_FIELD.test(field)) throw errors.validation(`${where}.field is not a plain fieldname: ${field}`);
    const aggregate = column.aggregate === undefined ? undefined : text(column.aggregate, `${where}.aggregate`, 16);
    if (aggregate !== undefined && !REPORT_AGGREGATES.has(aggregate as AppReportAggregate)) {
      throw errors.validation(`${where}.aggregate must be one of ${[...REPORT_AGGREGATES].join(", ")}`);
    }
    const type = text(column.type ?? "Data", `${where}.type`, 32);
    const options = column.options === undefined ? undefined : text(column.options, `${where}.options`, 160);
    // A Link with nowhere to point resolves to nothing, so the column shows raw ids.
    if (type === "Link" && !options) throw errors.validation(`${where} is a Link but names no target doctype`);
    return {
      field,
      label: text(column.label, `${where}.label`, 160),
      type,
      ...(options ? { options } : {}),
      ...(aggregate ? { aggregate: aggregate as AppReportAggregate } : {}),
    };
  });
  if (!columns.length) throw errors.validation(`reports[${index}] (${name}) has no columns`);
  assertUnique(columns.map((column) => `${column.aggregate ?? ""}:${column.field}`), `reports[${index}] column`);

  const groupBy = entry.group_by === undefined ? undefined : text(entry.group_by, `reports[${index}].group_by`, 120);
  if (groupBy !== undefined && !REPORT_FIELD.test(groupBy)) {
    throw errors.validation(`reports[${index}].group_by is not a plain fieldname: ${groupBy}`);
  }
  const aggregated = columns.some((column) => column.aggregate);
  if (aggregated && !groupBy) {
    // SQLite would answer with one arbitrary row per bare column instead of erroring.
    // A report that quietly reports the wrong number is worse than one that will not load.
    throw errors.validation(`reports[${index}] (${name}) aggregates but declares no group_by`);
  }
  if (groupBy) {
    const plain = columns.filter((column) => !column.aggregate);
    for (const column of plain) {
      if (column.field !== groupBy) {
        throw errors.validation(`reports[${index}] (${name}) groups by ${groupBy}, so column ${column.field} must be aggregated`);
      }
    }
  }

  let orderBy: AppReport["order_by"];
  if (entry.order_by !== undefined) {
    if (!entry.order_by || typeof entry.order_by !== "object" || Array.isArray(entry.order_by)) {
      throw errors.validation(`reports[${index}].order_by must be an object`);
    }
    const order = entry.order_by as JsonObject;
    const column = text(order.column, `reports[${index}].order_by.column`, 120);
    const direction = text(order.direction ?? "asc", `reports[${index}].order_by.direction`, 8);
    if (direction !== "asc" && direction !== "desc") throw errors.validation(`reports[${index}].order_by.direction must be asc or desc`);
    // Ordering by something the report does not select cannot be rendered, and under a
    // GROUP BY it is not even meaningful.
    if (!columns.some((candidate) => candidate.field === column)) {
      throw errors.validation(`reports[${index}].order_by.column is not one of the report's columns: ${column}`);
    }
    orderBy = { column, direction };
  }

  const filters = array(entry.filters ?? [], `reports[${index}].filters`).map((raw, position) => {
    const field = text(raw, `reports[${index}].filters[${position}]`, 120);
    if (!REPORT_FIELD.test(field)) throw errors.validation(`reports[${index}].filters[${position}] is not a plain fieldname: ${field}`);
    return field;
  });

  const limit = entry.limit === undefined ? 500 : Number(entry.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw errors.validation(`reports[${index}].limit must be an integer between 1 and 5000`);
  }

  return {
    name,
    label: text(entry.label ?? name, `reports[${index}].label`, 160),
    doctype,
    columns,
    ...(groupBy ? { group_by: groupBy } : {}),
    ...(orderBy ? { order_by: orderBy } : {}),
    filters,
    limit,
  };
}

/** Action ids reach a URL (`/x/action:<name>`), so keep them to what a path carries plainly. */
const ACTION_NAME = /^[a-z][a-z0-9-]*$/;
/**
 * A method name the client will POST to.
 *
 * Narrow on purpose. This string is concatenated into `/api/method/<name>` by the client,
 * so anything with a slash or a query character would let a manifest aim the screen's
 * button at a different endpoint than the one it names.
 */
const ACTION_METHOD = /^[A-Za-z][A-Za-z0-9_.]*$/;
/**
 * Fieldtypes the action screen can render, as an ALLOWLIST.
 *
 * `Attach` / `Attach Image` are here because a screen that takes a PHOTOGRAPH is a whole
 * class of work the list previously locked out: a supplier sends a price table over Zalo,
 * or a driver hands over a delivery note, and the job is to turn that picture into rows.
 * The screen already resolves controls through the same registry the form uses and hands
 * them `services`, so the attach control uploads through `upload_file` and yields a
 * `file_url` exactly as it does on a document — nothing new to render, only permission to.
 */
const ACTION_FIELDTYPES = new Set([
  "Data", "Small Text", "Text", "Int", "Float", "Currency", "Percent",
  "Check", "Select", "Link", "Date", "Datetime", "Time",
  "Attach", "Attach Image",
]);

function parseAction(value: JsonValue, index: number, doctypeNames: ReadonlySet<string>): AppAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`actions[${index}] must be an object`);
  const entry = value as JsonObject;
  const name = text(entry.name, `actions[${index}].name`, 64);
  if (!ACTION_NAME.test(name)) throw errors.validation(`actions[${index}].name must be lowercase letters, digits and hyphens: ${name}`);

  const call = (raw: JsonValue | undefined, where: string) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`${where} must be an object`);
    const spec = raw as JsonObject;
    const method = text(spec.method, `${where}.method`, 160);
    if (!ACTION_METHOD.test(method)) throw errors.validation(`${where}.method is not a plain method name: ${method}`);
    return {
      method,
      label: text(spec.label, `${where}.label`, 80),
      ...(spec.confirm === undefined ? {} : { confirm: text(spec.confirm, `${where}.confirm`, 320) }),
    };
  };

  const permissionDoctype = text(entry.permission_doctype, `actions[${index}].permission_doctype`, 160);
  const permissionAction = entry.permission_action === undefined
    ? "save"
    : text(entry.permission_action, `actions[${index}].permission_action`, 16);
  if (!["read", "save"].includes(permissionAction)) {
    throw errors.validation(`actions[${index}].permission_action must be read or save`);
  }
  // A gate naming a doctype the app does not ship cannot be evaluated, so the screen would
  // either be shown to everyone or to nobody — both silently.
  if (!doctypeNames.has(permissionDoctype)) {
    throw errors.validation(`actions[${index}].permission_doctype points at ${permissionDoctype}, which this app does not define`);
  }

  const fields = array(entry.fields ?? [], `actions[${index}].fields`).map((raw, position) => {
    const where = `actions[${index}].fields[${position}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`${where} must be an object`);
    const field = raw as JsonObject;
    const fieldtype = text(field.fieldtype ?? "Data", `${where}.fieldtype`, 32);
    if (!ACTION_FIELDTYPES.has(fieldtype)) {
      throw errors.validation(`${where}.fieldtype is not one the action screen can render: ${fieldtype}`);
    }
    const options = field.options === undefined ? undefined : text(field.options, `${where}.options`, 2000);
    // A Link with no target renders an autocomplete that searches nothing; a Select with
    // no choices renders an empty dropdown. Both look like a broken screen.
    if ((fieldtype === "Link" || fieldtype === "Select") && !options) {
      throw errors.validation(`${where} is a ${fieldtype} but names no options`);
    }
    if (fieldtype === "Link" && !doctypeNames.has(options!)) {
      throw errors.validation(`${where} links to ${options}, which this app does not define`);
    }
    return {
      fieldname: text(field.fieldname, `${where}.fieldname`, 120),
      label: text(field.label, `${where}.label`, 160),
      fieldtype,
      ...(options ? { options } : {}),
      ...(field.required === true ? { required: true } : {}),
      ...(field.default === undefined ? {} : { default: text(field.default, `${where}.default`, 160) }),
      ...(field.description === undefined ? {} : { description: text(field.description, `${where}.description`, 320) }),
    };
  });
  if (!fields.length) throw errors.validation(`actions[${index}] (${name}) has no fields`);
  assertUnique(fields.map((field) => field.fieldname), `actions[${index}] field`);

  return {
    name,
    label: text(entry.label ?? name, `actions[${index}].label`, 160),
    ...(entry.icon === undefined ? {} : { icon: text(entry.icon, `actions[${index}].icon`, 64) }),
    ...(entry.group === undefined ? {} : { group: text(entry.group, `actions[${index}].group`, 80) }),
    ...(entry.description === undefined ? {} : { description: text(entry.description, `actions[${index}].description`, 500) }),
    fields,
    ...(entry.preview === undefined ? {} : { preview: call(entry.preview, `actions[${index}].preview`) }),
    commit: call(entry.commit, `actions[${index}].commit`),
    permission_doctype: permissionDoctype,
    ...(permissionAction === "save" ? {} : { permission_action: "read" as const }),
    ...(entry.result_table === undefined ? {} : { result_table: text(entry.result_table, `actions[${index}].result_table`, 120) }),
  };
}

const SCREEN_BLOCK_ID = /^[a-z][a-z0-9-]*$/;
const SCREEN_MODES = new Set<AppScreenMode>(["desk", "focus", "touch"]);
const SCREEN_TONES = new Set<AppScreenTone>(["neutral", "info", "success", "warning", "danger"]);
const SYSTEM_SCREEN_FIELDS = new Set(["name", "owner", "status", "docstatus", "creation", "modified", "modified_at"]);

function parseScreen(
  value: JsonValue,
  index: number,
  appId: string,
  doctypes: AppManifest["doctypes"],
  actions: ReadonlyMap<string, AppAction>,
): AppScreen {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`screens[${index}] must be an object`);
  const entry = value as JsonObject;
  const name = text(entry.name, `screens[${index}].name`, 140);
  if (!ACTION_NAME.test(name)) throw errors.validation(`screens[${index}].name must be lowercase letters, digits and hyphens: ${name}`);
  if (!name.startsWith(`${appId}-`)) {
    throw errors.validation(`screens[${index}].name must be namespaced with this app id: ${appId}-`);
  }

  const metaByName = new Map(doctypes.map((meta) => [meta.name, meta]));
  const permissionDoctype = text(entry.permission_doctype, `screens[${index}].permission_doctype`, 160);
  if (!metaByName.has(permissionDoctype)) {
    throw errors.validation(`screens[${index}].permission_doctype points at ${permissionDoctype}, which this app does not define`);
  }

  const mode = text(entry.mode ?? "desk", `screens[${index}].mode`, 16) as AppScreenMode;
  if (!SCREEN_MODES.has(mode)) throw errors.validation(`screens[${index}].mode is not recognised: ${mode}`);
  const columns = integer(entry.columns ?? 2, `screens[${index}].columns`, 1, 3) as 1 | 2 | 3;

  const fieldsFor = (doctype: string, where: string): ReadonlySet<string> => {
    const meta = metaByName.get(doctype);
    if (!meta) throw errors.validation(`${where} points at ${doctype}, which this app does not define`);
    return new Set([...SYSTEM_SCREEN_FIELDS, ...meta.fields.map((field) => field.fieldname)]);
  };
  const filtersFor = (raw: JsonValue | undefined, doctype: string, where: string): JsonObject | undefined => {
    if (raw === undefined) return undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`${where} must be an object`);
    const known = fieldsFor(doctype, where);
    for (const field of Object.keys(raw)) {
      if (!known.has(field)) throw errors.validation(`${where} filters unknown field ${doctype}.${field}`);
    }
    return raw as JsonObject;
  };
  const spanFor = (raw: JsonValue | undefined, where: string): 1 | 2 | 3 | undefined => {
    if (raw === undefined) return undefined;
    const span = integer(raw, `${where}.span`, 1, 3) as 1 | 2 | 3;
    if (span > columns) throw errors.validation(`${where}.span (${span}) exceeds screen columns (${columns})`);
    return span;
  };

  const blocks = array(entry.blocks ?? [], `screens[${index}].blocks`).map((raw, position): AppScreenBlock => {
    const where = `screens[${index}].blocks[${position}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`${where} must be an object`);
    const block = raw as JsonObject;
    const type = text(block.type, `${where}.type`, 16);
    const id = text(block.id, `${where}.id`, 64);
    if (!SCREEN_BLOCK_ID.test(id)) throw errors.validation(`${where}.id must be lowercase letters, digits and hyphens: ${id}`);
    const span = spanFor(block.span, where);
    const base = {
      id,
      label: text(block.label, `${where}.label`, 160),
      ...(block.description === undefined ? {} : { description: text(block.description, `${where}.description`, 500) }),
      ...(block.icon === undefined ? {} : { icon: text(block.icon, `${where}.icon`, 64) }),
      ...(span === undefined ? {} : { span }),
    };
    if (type === "metric") {
      const doctype = text(block.doctype, `${where}.doctype`, 160);
      fieldsFor(doctype, where);
      const tone = block.tone === undefined ? undefined : text(block.tone, `${where}.tone`, 16) as AppScreenTone;
      if (tone && !SCREEN_TONES.has(tone)) throw errors.validation(`${where}.tone is not recognised: ${tone}`);
      const route = block.route === undefined ? undefined : text(block.route, `${where}.route`, 320);
      if (route && !route.startsWith("/")) throw errors.validation(`${where}.route must be absolute`);
      const filters = filtersFor(block.filters, doctype, `${where}.filters`);
      return {
        ...base, type: "metric", doctype,
        ...(filters ? { filters } : {}),
        ...(tone ? { tone } : {}),
        ...(route ? { route } : {}),
      };
    }
    if (type === "list") {
      const doctype = text(block.doctype, `${where}.doctype`, 160);
      const known = fieldsFor(doctype, where);
      const fields = array(block.fields ?? [], `${where}.fields`).map((field, fieldIndex) => {
        const fieldname = text(field, `${where}.fields[${fieldIndex}]`, 120);
        if (!known.has(fieldname)) throw errors.validation(`${where}.fields[${fieldIndex}] names unknown field ${doctype}.${fieldname}`);
        return fieldname;
      });
      if (!fields.length) throw errors.validation(`${where}.fields must not be empty`);
      assertUnique(fields, `${where} field`);
      const orderBy = block.order_by === undefined ? undefined : text(block.order_by, `${where}.order_by`, 160);
      if (orderBy) {
        const [field, direction = "asc"] = orderBy.trim().split(/\s+/);
        if (!known.has(field!)) throw errors.validation(`${where}.order_by names unknown field ${doctype}.${field}`);
        if (direction !== "asc" && direction !== "desc") throw errors.validation(`${where}.order_by direction must be asc or desc`);
      }
      const filters = filtersFor(block.filters, doctype, `${where}.filters`);
      return {
        ...base, type: "list", doctype, fields,
        ...(filters ? { filters } : {}),
        ...(orderBy ? { order_by: orderBy } : {}),
        limit: integer(block.limit ?? 8, `${where}.limit`, 1, 50),
        ...(block.empty_text === undefined ? {} : { empty_text: text(block.empty_text, `${where}.empty_text`, 200) }),
      };
    }
    if (type === "action") {
      const action = text(block.action, `${where}.action`, 64);
      if (!actions.has(action)) throw errors.validation(`${where} opens action "${action}", which this app does not declare`);
      return { ...base, type: "action", action };
    }
    throw errors.validation(`${where}.type is not recognised: ${type}`);
  });
  if (!blocks.length) throw errors.validation(`screens[${index}] (${name}) has no blocks`);
  assertUnique(blocks.map((block) => block.id), `screens[${index}] block`);

  return {
    name,
    label: text(entry.label ?? name, `screens[${index}].label`, 160),
    ...(entry.description === undefined ? {} : { description: text(entry.description, `screens[${index}].description`, 500) }),
    ...(entry.icon === undefined ? {} : { icon: text(entry.icon, `screens[${index}].icon`, 64) }),
    ...(entry.group === undefined ? {} : { group: text(entry.group, `screens[${index}].group`, 80) }),
    permission_doctype: permissionDoctype,
    mode,
    columns,
    blocks,
  };
}

function parseHook(value: JsonValue, index: number): AppHook {
  const pattern = typeof value === "string" ? value : (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject).event : undefined);
  const event = text(pattern, `hooks[${index}].event`, 160);
  // Only a trailing wildcard: an arbitrary pattern would make it impossible to
  // tell from a manifest which events an app actually receives.
  if (event !== "*" && !/^[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*)?$/.test(event)) {
    throw errors.validation(`hooks[${index}].event must be an event type or a trailing wildcard: ${event}`);
  }
  return { event };
}

/**
 * Roles the platform (or a standard foundational app) provides, so a dependent app
 * may grant DocPerm without trying to take ownership of the same Role record.
 *
 * HR Manager is created by the foundational HRM package and intentionally reused by
 * organization/security. Treating it as shareable here keeps the dependency boundary:
 * HRM owns the role; dependent apps only reference it.
 */
export const PLATFORM_ROLES = new Set(["System Manager", "Administrator", "All", "Guest", "HR Manager"]);

/**
 * Component-wise version comparison.
 *
 * String comparison would rank "1.10.0" below "1.9.0", which is exactly the
 * mistake that lets a too-old dependency satisfy a requirement.
 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value.split("-")[0]!.split(".").map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export function satisfiesVersion(installed: string, required: string): boolean {
  return compareVersions(installed, required) >= 0;
}

function parsePrintFormat(value: JsonValue, index: number, doctypeNames: ReadonlySet<string>): PrintFormatMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`print_formats[${index}] must be an object`);
  const input = value as JsonObject;
  const docType = text(input.doc_type, `print_formats[${index}].doc_type`, 160);
  if (!doctypeNames.has(docType)) {
    throw errors.validation(`Print format ${String(input.name)} targets ${docType}, which this app does not define`);
  }
  return {
    name: text(input.name, `print_formats[${index}].name`, 160),
    doc_type: docType,
    format_type: input.format_type === "Jinja" ? "Jinja" : "Standard",
    html: typeof input.html === "string" ? input.html : "",
    ...(typeof input.css === "string" ? { css: input.css } : {}),
    is_default: input.is_default === true,
    disabled: input.disabled === true,
    revision: typeof input.revision === "number" ? input.revision : 1,
  };
}

function parseRole(value: JsonValue, index: number): AppRoleDefinition {
  if (typeof value === "string") return { role: value, desk_access: true };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`roles[${index}] must be an object or string`);
  const input = value as JsonObject;
  return { role: text(input.role, `roles[${index}].role`, 120), desk_access: input.desk_access !== false };
}

/**
 * Validates a declared storefront against the doctypes the app actually ships.
 *
 * Every check here turns a silent leak or a dead page into a refused install:
 * a catalogue on a doctype the app does not own would publish somebody else's table;
 * a field that does not exist would serve nulls forever; a search over an unpublished
 * field would let a visitor probe values they cannot see by watching which queries match.
 */
function parseStorefront(value: JsonValue, doctypes: DocTypeMeta[], roleNames: ReadonlySet<string>): StorefrontSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("storefront must be an object");
  const input = value as JsonObject;
  const owned = new Map(doctypes.map((meta) => [meta.name, meta]));

  const catalogInput = input.catalog;
  if (!catalogInput || typeof catalogInput !== "object" || Array.isArray(catalogInput)) {
    throw errors.validation("storefront.catalog is required");
  }
  const catalogValue = catalogInput as JsonObject;
  const catalogDoctype = text(catalogValue.doctype, "storefront.catalog.doctype", 160);
  const catalogMeta = owned.get(catalogDoctype);
  if (!catalogMeta) throw errors.validation(`storefront.catalog names ${catalogDoctype}, which this app does not define`);

  const catalogFieldnames = new Set(catalogMeta.fields.map((field) => field.fieldname));
  const requireField = (name: string, where: string): string => {
    const fieldname = text(name, where, 140);
    if (!catalogFieldnames.has(fieldname)) throw errors.validation(`${where} names ${catalogDoctype}.${fieldname}, which does not exist`);
    return fieldname;
  };

  const fields = array(catalogValue.fields, "storefront.catalog.fields").map((entry, index) =>
    requireField(entry as string, `storefront.catalog.fields[${index}]`));
  if (!fields.length) throw errors.validation("storefront.catalog.fields must list at least one field");

  const searchFields = array(catalogValue.search_fields ?? [], "storefront.catalog.search_fields").map((entry, index) => {
    const fieldname = requireField(entry as string, `storefront.catalog.search_fields[${index}]`);
    // Searching a field that is not published lets a visitor confirm its value by
    // watching which queries return a row — a slower way to read it, but a way.
    if (!fields.includes(fieldname)) {
      throw errors.validation(`storefront.catalog.search_fields names ${fieldname}, which is not published`);
    }
    return fieldname;
  });

  const catalog: StorefrontCatalogSpec = {
    doctype: catalogDoctype,
    published_field: requireField(catalogValue.published_field as string, "storefront.catalog.published_field"),
    slug_field: requireField(catalogValue.slug_field as string, "storefront.catalog.slug_field"),
    price_field: requireField(catalogValue.price_field as string, "storefront.catalog.price_field"),
    fields,
    search_fields: searchFields,
    ...(catalogValue.facet_field === undefined
      ? {}
      : { facet_field: requireField(catalogValue.facet_field as string, "storefront.catalog.facet_field") }),
  };

  if (input.order === undefined) return { catalog };
  if (!input.order || typeof input.order !== "object" || Array.isArray(input.order)) {
    throw errors.validation("storefront.order must be an object");
  }
  const orderValue = input.order as JsonObject;
  const orderDoctype = text(orderValue.doctype, "storefront.order.doctype", 160);
  const orderMeta = owned.get(orderDoctype);
  if (!orderMeta) throw errors.validation(`storefront.order names ${orderDoctype}, which this app does not define`);
  const orderFieldnames = new Set(orderMeta.fields.map((field) => field.fieldname));
  const requireOrderField = (name: unknown, where: string): string => {
    const fieldname = text(name, where, 140);
    if (!orderFieldnames.has(fieldname)) throw errors.validation(`${where} names ${orderDoctype}.${fieldname}, which does not exist`);
    return fieldname;
  };

  const submitAsRole = text(orderValue.submit_as_role, "storefront.order.submit_as_role", 140);
  if (!roleNames.has(submitAsRole) && !PLATFORM_ROLES.has(submitAsRole)) {
    throw errors.validation(`storefront.order.submit_as_role names ${submitAsRole}, which the app does not define`);
  }
  const maxPerDay = typeof orderValue.max_per_day === "number" ? orderValue.max_per_day : 20;
  if (!Number.isInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > 500) {
    throw errors.validation("storefront.order.max_per_day must be between 1 and 500");
  }

  const buyerFields = array(orderValue.buyer_fields, "storefront.order.buyer_fields").map((entry, index) => {
    const fieldname = requireOrderField(entry, `storefront.order.buyer_fields[${index}]`);
    const field = orderMeta.fields.find((candidate) => candidate.fieldname === fieldname)!;
    // A read-only field is the author's own statement that the value is computed; a
    // Password arriving from an unauthenticated stranger is never right.
    if (field.read_only) throw errors.validation(`storefront.order.buyer_fields names ${fieldname}, which is read-only`);
    if (field.fieldtype === "Password") throw errors.validation(`storefront.order.buyer_fields cannot include a Password field`);
    return fieldname;
  });
  if (!buyerFields.length) throw errors.validation("storefront.order.buyer_fields must list at least one field");

  return {
    catalog,
    order: {
      doctype: orderDoctype,
      submit_as_role: submitAsRole,
      lines_field: requireOrderField(orderValue.lines_field, "storefront.order.lines_field"),
      placed_at_field: requireOrderField(orderValue.placed_at_field, "storefront.order.placed_at_field"),
      total_field: requireOrderField(orderValue.total_field, "storefront.order.total_field"),
      track_field: requireOrderField(orderValue.track_field, "storefront.order.track_field"),
      buyer_fields: buyerFields,
      max_per_day: maxPerDay,
    },
  };
}

function parseFixture(value: JsonValue, index: number): AppFixture {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`fixtures[${index}] must be an object`);
  const input = value as JsonObject;
  const data = input.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw errors.validation(`fixtures[${index}].data must be an object`);
  return {
    record_type: text(input.record_type, `fixtures[${index}].record_type`, 160),
    name: text(input.name, `fixtures[${index}].name`, 320),
    data: data as JsonObject,
  };
}

function parseNav(
  value: JsonValue,
  index: number,
  doctypeNames: ReadonlySet<string>,
  actions: ReadonlyMap<string, AppAction> = new Map(),
  screens: ReadonlyMap<string, AppScreen> = new Map(),
): AppNavItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`nav[${index}] must be an object`);
  const input = value as JsonObject;
  const kind = input.kind;
  if (kind !== "doctype" && kind !== "route" && kind !== "workspace" && kind !== "system" && kind !== "experience") {
    throw errors.validation(`nav[${index}].kind is not recognised: ${String(kind)}`);
  }
  const key = text(input.key, `nav[${index}].key`, 160);
  let action: AppAction | undefined;
  let screen: AppScreen | undefined;
  if (kind === "experience") {
    const separator = key.indexOf(":");
    const experienceKind = separator < 0 ? key : key.slice(0, separator);
    const argument = separator < 0 ? "" : key.slice(separator + 1);
    if (!SUPPORTED_EXPERIENCE_KINDS.has(experienceKind) || !argument) {
      throw errors.validation(`nav[${index}] requests unsupported experience ${key}; supported prefixes: ${[...SUPPORTED_EXPERIENCE_KINDS].join(", ")}`);
    }
    if (experienceKind === "action") {
      action = actions.get(argument);
      if (!action) throw errors.validation(`nav[${index}] opens action "${argument}", which this app does not declare`);
    }
    if (experienceKind === "screen") {
      screen = screens.get(argument);
      if (!screen) throw errors.validation(`nav[${index}] opens screen "${argument}", which this app does not declare`);
    }
  }
  const inferredPermissionDoctype = kind === "doctype"
    ? key
    : action
      // An action carries its own gate, so the menu entry and the screen agree by
      // construction rather than by two places being kept in step by hand.
      ? action.permission_doctype
      : screen
        ? screen.permission_doctype
      : kind === "experience" && (key.startsWith("approval:") || key.startsWith("calendar:"))
        // Both `approval:` and `calendar:` name the doctype after the colon, so the menu
        // entry is gated on that doctype's read permission — a calendar of records the
        // user cannot read must not appear at all.
        ? key.slice(key.indexOf(":") + 1)
        : undefined;
  const permissionDoctype = typeof input.permission_doctype === "string"
    ? text(input.permission_doctype, `nav[${index}].permission_doctype`, 160)
    : inferredPermissionDoctype;
  const requiredRoles = input.required_roles === undefined
    ? []
    : array(input.required_roles, `nav[${index}].required_roles`).map((role, roleIndex) =>
      text(role, `nav[${index}].required_roles[${roleIndex}]`, 160));
  // A doctype nav item pointing at a doctype the app does not ship would render a
  // menu entry that leads nowhere.
  if (kind === "doctype" && !doctypeNames.has(key)) {
    throw errors.validation(`nav[${index}] points at doctype ${key}, which this app does not define`);
  }
  // Experiences such as approval queues expose data just like a list view. Keeping
  // the permission target in the package lets every consumer apply the same gate.
  if (permissionDoctype && !doctypeNames.has(permissionDoctype)) {
    throw errors.validation(`nav[${index}].permission_doctype points at ${permissionDoctype}, which this app does not define`);
  }
  if (kind === "route" && typeof input.route !== "string") throw errors.validation(`nav[${index}] of kind route requires a route`);
  // A relative route resolves incorrectly in the client router.
  if (typeof input.route === "string" && !input.route.startsWith("/")) {
    throw errors.validation(`nav[${index}].route must be absolute`);
  }
  return {
    key,
    label: text(input.label, `nav[${index}].label`, 160),
    kind,
    ...(permissionDoctype ? { permission_doctype: permissionDoctype } : {}),
    ...(requiredRoles.length ? { required_roles: requiredRoles } : {}),
    ...(typeof input.icon === "string" ? { icon: input.icon } : {}),
    ...(typeof input.group === "string" ? { group: input.group } : {}),
    ...(typeof input.route === "string" ? { route: input.route } : {}),
  };
}

function array(value: unknown, field: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${field} must be an array`);
  return value as JsonValue[];
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${field} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${field} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw errors.validation(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
