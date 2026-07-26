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

export interface AppManifest {
  id: string;
  name: string;
  version: string;
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

  return {
    id,
    name: text(input.name, "name", 160),
    version,
    requires,
    doctypes,
    workflows,
    print_formats: printFormats,
    roles,
    fixtures,
    nav,
    hooks,
    ...(worker === undefined ? {} : { worker }),
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
  // A doctype nav item pointing at a doctype the app does not ship would render a
  // menu entry that leads nowhere.
  if (kind === "doctype" && !doctypeNames.has(key)) {
    throw errors.validation(`nav[${index}] points at doctype ${key}, which this app does not define`);
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
