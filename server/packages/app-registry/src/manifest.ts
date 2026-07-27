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
import { parseDocTypeMeta, validateWorkflow } from "../../frappe-model/src/index.js";
import type { DocTypeMeta, PrintFormatMeta, WorkflowMeta } from "../../frappe-model/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

export interface AppDependency {
  id: string;
  /** Minimum acceptable version, compared component-wise. */
  version: string;
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
  brand?: "zinc" | "blue" | "warm";
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
export const SUPPORTED_EXPERIENCE_KINDS = new Set(["approval", "calendar", "social-commerce"]);

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  /** Minimum Forge platform version required by this package. */
  platform_requires?: string;
  requires: AppDependency[];
  doctypes: DocTypeMeta[];
  workflows: WorkflowMeta[];
  print_formats: PrintFormatMeta[];
  roles: AppRoleDefinition[];
  fixtures: AppFixture[];
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
  const nav = array(input.nav ?? [], "nav").map((entry, index) => parseNav(entry, index, doctypeNames));
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

  const client = input.client === undefined ? undefined : parseClientManifest(input.client, nav, doctypeNames);

  return {
    id,
    name: text(input.name, "name", 160),
    version,
    ...(platformRequires ? { platform_requires: platformRequires } : {}),
    requires,
    doctypes,
    workflows,
    print_formats: printFormats,
    roles,
    fixtures,
    nav,
    hooks,
    validators,
    ...(worker === undefined ? {} : { worker }),
    ...(client === undefined ? {} : { client }),
  };
}

const BRANDS = new Set(["zinc", "blue", "warm"]);
const CATALOG_MODES = new Set(["manifest", "workspace", "hybrid"]);

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
    if (!BRANDS.has(brand)) throw errors.validation(`client.brand is not recognised: ${brand} (zinc|blue|warm)`);
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

/** Roles the platform always provides, so an app need not redeclare them. */
export const PLATFORM_ROLES = new Set(["System Manager", "Administrator", "All", "Guest"]);

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

function parseNav(value: JsonValue, index: number, doctypeNames: ReadonlySet<string>): AppNavItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`nav[${index}] must be an object`);
  const input = value as JsonObject;
  const kind = input.kind;
  if (kind !== "doctype" && kind !== "route" && kind !== "workspace" && kind !== "system" && kind !== "experience") {
    throw errors.validation(`nav[${index}].kind is not recognised: ${String(kind)}`);
  }
  const key = text(input.key, `nav[${index}].key`, 160);
  if (kind === "experience") {
    const separator = key.indexOf(":");
    const experienceKind = separator < 0 ? key : key.slice(0, separator);
    const argument = separator < 0 ? "" : key.slice(separator + 1);
    if (!SUPPORTED_EXPERIENCE_KINDS.has(experienceKind) || !argument) {
      throw errors.validation(`nav[${index}] requests unsupported experience ${key}; supported prefixes: ${[...SUPPORTED_EXPERIENCE_KINDS].join(", ")}`);
    }
  }
  const inferredPermissionDoctype = kind === "doctype"
    ? key
    : kind === "experience" && (key.startsWith("approval:") || key.startsWith("calendar:"))
      // Both `approval:` and `calendar:` name the doctype after the colon, so the menu
      // entry is gated on that doctype's read permission — a calendar of records the
      // user cannot read must not appear at all.
      ? key.slice(key.indexOf(":") + 1)
      : undefined;
  const permissionDoctype = typeof input.permission_doctype === "string"
    ? text(input.permission_doctype, `nav[${index}].permission_doctype`, 160)
    : inferredPermissionDoctype;
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

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw errors.validation(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
