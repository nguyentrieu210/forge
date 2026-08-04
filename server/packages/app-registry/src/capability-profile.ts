import { errors } from "../../core/src/index.js";
import { satisfiesVersion, type AppManifest } from "./manifest.js";

export type CapabilityEffectiveState = "required" | "enabled" | "disabled" | "blocked";
export type CapabilityDesiredState = "enabled" | "disabled";
export type CapabilitySurfaceKind =
  | "nav"
  | "actions"
  | "screens"
  | "reports"
  | "charts"
  | "validators"
  | "hooks"
  | "jobs"
  | "integrations"
  | "permissions";

export interface CapabilityRequirement {
  capability: string;
  min_package_version?: string;
}

export interface CapabilitySurfaceRefs {
  nav: string[];
  actions: string[];
  screens: string[];
  reports: string[];
  charts: string[];
  validators: string[];
  hooks: string[];
  jobs: string[];
  integrations: string[];
  permissions: string[];
}

export interface PackageCapabilityDefinition {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  default_state: CapabilityDesiredState;
  requires: CapabilityRequirement[];
  conflicts_with: string[];
  surfaces: CapabilitySurfaceRefs;
}

export interface PackageCapabilityContract {
  schema_version: 1;
  package_id: string;
  package_version: string;
  capabilities: PackageCapabilityDefinition[];
}

export interface InstalledPackageVersion {
  app_id: string;
  version: string;
  content_hash?: string;
}

export interface CapabilityProfileSelection {
  capability_id: string;
  state: CapabilityDesiredState;
}

export interface CapabilityProfileProposal {
  profile_id: string;
  expected_version?: number | null;
  selections: CapabilityProfileSelection[];
}

export interface ResolvedCapability {
  capability_id: string;
  package_id: string;
  package_version: string;
  label: string;
  state: CapabilityEffectiveState;
  desired_state: CapabilityDesiredState;
  source: "required" | "explicit" | "default" | "dependency";
  blocked_reasons: string[];
}

export interface CapabilityProfileDiff {
  capability_id: string;
  from: CapabilityEffectiveState | "absent";
  to: CapabilityEffectiveState;
}

export interface CapabilityResolutionPlan {
  profile_id: string;
  valid: boolean;
  capabilities: ResolvedCapability[];
  errors: string[];
  implicit_enables: string[];
  package_requirements: Array<{ capability_id: string; package_id: string; min_version: string; installed_version: string }>;
  diff: CapabilityProfileDiff[];
}

const CAPABILITY_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const PROFILE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SURFACE_KINDS: CapabilitySurfaceKind[] = [
  "nav", "actions", "screens", "reports", "charts", "validators", "hooks", "jobs", "integrations", "permissions",
];

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function stringArray(value: unknown, field: string, max = 256): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw errors.validation(`${field} must be an array with at most ${max} entries`);
  const result = value.map((entry, index) => text(entry, `${field}[${index}]`, 240));
  if (new Set(result).size !== result.length) throw errors.validation(`${field} contains duplicate entries`);
  return result;
}

function validatorKey(entry: AppManifest["validators"][number]): string {
  return `${entry.doctype}:${entry.actions?.length ? [...entry.actions].sort().join(",") : "*"}`;
}

function surfaceCatalog(manifest: AppManifest): Record<Exclude<CapabilitySurfaceKind, "jobs" | "integrations" | "permissions">, Set<string>> {
  return {
    nav: new Set(manifest.nav.map((entry) => entry.key)),
    actions: new Set(manifest.actions.map((entry) => entry.name)),
    screens: new Set(manifest.screens.map((entry) => entry.name)),
    reports: new Set(manifest.reports.map((entry) => entry.name)),
    charts: new Set(manifest.charts.map((entry) => entry.name)),
    validators: new Set(manifest.validators.map(validatorKey)),
    hooks: new Set(manifest.hooks.map((entry) => entry.event)),
  };
}

export function parsePackageCapabilityContract(packageValue: unknown, manifest: AppManifest): PackageCapabilityContract | null {
  const input = object(packageValue, "app package");
  if (input.capabilities === undefined) return null;
  if (!Array.isArray(input.capabilities) || input.capabilities.length > 256) {
    throw errors.validation("capabilities must be an array with at most 256 entries");
  }
  const knownSurfaces = surfaceCatalog(manifest);
  const surfaceOwners = new Map<string, string>();
  const capabilities = input.capabilities.map((raw, index) => {
    const entry = object(raw, `capabilities[${index}]`);
    const id = text(entry.id, `capabilities[${index}].id`, 128);
    if (!CAPABILITY_ID.test(id) || !id.startsWith(`${manifest.id}.`)) {
      throw errors.validation(`Capability ${id} must be namespaced under ${manifest.id}.`);
    }
    const required = entry.required === true;
    const defaultState = entry.default_state === undefined ? "enabled" : text(entry.default_state, `capabilities[${index}].default_state`, 16);
    if (defaultState !== "enabled" && defaultState !== "disabled") {
      throw errors.validation(`capabilities[${index}].default_state must be enabled or disabled`);
    }
    if (required && defaultState === "disabled") throw errors.validation(`Required capability ${id} cannot default to disabled`);

    const rawRequires = entry.requires === undefined ? [] : entry.requires;
    if (!Array.isArray(rawRequires) || rawRequires.length > 128) throw errors.validation(`capabilities[${index}].requires is invalid`);
    const requires = rawRequires.map((rawRequirement, requirementIndex) => {
      const requirement = object(rawRequirement, `capabilities[${index}].requires[${requirementIndex}]`);
      const capability = text(requirement.capability, `capabilities[${index}].requires[${requirementIndex}].capability`, 128);
      if (!CAPABILITY_ID.test(capability)) throw errors.validation(`Capability dependency ${capability} is invalid`);
      const minimum = requirement.min_package_version === undefined
        ? undefined
        : text(requirement.min_package_version, `capabilities[${index}].requires[${requirementIndex}].min_package_version`, 32);
      if (minimum && !SEMVER.test(minimum)) throw errors.validation(`Capability dependency ${capability} has invalid min_package_version`);
      return { capability, ...(minimum ? { min_package_version: minimum } : {}) };
    });
    if (new Set(requires.map((requirement) => requirement.capability)).size !== requires.length) {
      throw errors.validation(`Capability ${id} has duplicate dependencies`);
    }

    const conflicts = stringArray(entry.conflicts_with, `capabilities[${index}].conflicts_with`, 128);
    for (const conflict of conflicts) if (!CAPABILITY_ID.test(conflict) || conflict === id) throw errors.validation(`Capability ${id} has invalid conflict ${conflict}`);

    const surfacesInput = entry.surfaces === undefined ? {} : object(entry.surfaces, `capabilities[${index}].surfaces`);
    const surfaces = Object.fromEntries(SURFACE_KINDS.map((kind) => [kind, stringArray(surfacesInput[kind], `capabilities[${index}].surfaces.${kind}`)])) as unknown as CapabilitySurfaceRefs;

    for (const kind of ["nav", "actions", "screens", "reports", "charts", "validators", "hooks"] as const) {
      for (const surface of surfaces[kind]) {
        if (!knownSurfaces[kind].has(surface)) throw errors.validation(`Capability ${id} references unknown ${kind} surface ${surface}`);
      }
    }
    for (const kind of SURFACE_KINDS) {
      for (const surface of surfaces[kind]) {
        const key = `${kind}:${surface}`;
        const owner = surfaceOwners.get(key);
        if (owner && owner !== id) throw errors.validation(`${kind} surface ${surface} is owned by both ${owner} and ${id}`);
        surfaceOwners.set(key, id);
      }
    }

    return {
      id,
      label: text(entry.label ?? id, `capabilities[${index}].label`, 160),
      ...(entry.description === undefined ? {} : { description: text(entry.description, `capabilities[${index}].description`, 500) }),
      required,
      default_state: defaultState as CapabilityDesiredState,
      requires,
      conflicts_with: conflicts,
      surfaces,
    } satisfies PackageCapabilityDefinition;
  });
  if (new Set(capabilities.map((entry) => entry.id)).size !== capabilities.length) throw errors.validation("capabilities contains duplicate ids");
  return { schema_version: 1, package_id: manifest.id, package_version: manifest.version, capabilities };
}

export function parseCapabilityProfileProposal(value: unknown): CapabilityProfileProposal {
  const input = object(value, "capability profile");
  const profileId = text(input.profile_id, "profile_id", 64);
  if (!PROFILE_ID.test(profileId)) throw errors.validation("profile_id must be lowercase letters, digits and hyphens");
  const expectedVersion = input.expected_version === undefined || input.expected_version === null
    ? null
    : Number(input.expected_version);
  if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)) throw errors.validation("expected_version must be a non-negative integer or null");
  if (!Array.isArray(input.selections) || input.selections.length > 512) throw errors.validation("selections must be an array with at most 512 entries");
  const selections = input.selections.map((raw, index) => {
    const entry = object(raw, `selections[${index}]`);
    const capabilityId = text(entry.capability_id, `selections[${index}].capability_id`, 128);
    const state = text(entry.state, `selections[${index}].state`, 16);
    if (state !== "enabled" && state !== "disabled") throw errors.validation(`selections[${index}].state must be enabled or disabled`);
    return { capability_id: capabilityId, state: state as CapabilityDesiredState };
  });
  if (new Set(selections.map((entry) => entry.capability_id)).size !== selections.length) throw errors.validation("selections contains duplicate capability ids");
  return { profile_id: profileId, expected_version: expectedVersion, selections };
}

function currentStateMap(current?: CapabilityResolutionPlan | null): Map<string, CapabilityEffectiveState> {
  return new Map((current?.capabilities ?? []).map((entry) => [entry.capability_id, entry.state]));
}

export function resolveCapabilityProfile(
  contracts: PackageCapabilityContract[],
  installedPackages: InstalledPackageVersion[],
  proposalValue: CapabilityProfileProposal | unknown,
  current?: CapabilityResolutionPlan | null,
): CapabilityResolutionPlan {
  const proposal = (proposalValue as CapabilityProfileProposal)?.profile_id
    ? proposalValue as CapabilityProfileProposal
    : parseCapabilityProfileProposal(proposalValue);
  const installed = new Map(installedPackages.map((entry) => [entry.app_id, entry.version]));
  const definitions = new Map<string, { definition: PackageCapabilityDefinition; package_id: string; package_version: string }>();
  for (const contract of [...contracts].sort((a, b) => a.package_id.localeCompare(b.package_id))) {
    if (installed.get(contract.package_id) !== contract.package_version) continue;
    for (const definition of contract.capabilities) {
      if (definitions.has(definition.id)) throw errors.validation(`Capability id is declared by multiple packages: ${definition.id}`);
      definitions.set(definition.id, { definition, package_id: contract.package_id, package_version: contract.package_version });
    }
  }

  const explicit = new Map(proposal.selections.map((entry) => [entry.capability_id, entry.state]));
  for (const capabilityId of explicit.keys()) if (!definitions.has(capabilityId)) throw errors.validation(`Unknown capability id: ${capabilityId}`);

  const desired = new Map<string, CapabilityDesiredState>();
  const source = new Map<string, ResolvedCapability["source"]>();
  const blocked = new Map<string, string[]>();
  const errorsFound: string[] = [];
  const implicit = new Set<string>();
  const packageRequirements = new Map<string, { capability_id: string; package_id: string; min_version: string; installed_version: string }>();

  const addBlocked = (capabilityId: string, reason: string) => {
    const reasons = blocked.get(capabilityId) ?? [];
    if (!reasons.includes(reason)) reasons.push(reason);
    blocked.set(capabilityId, reasons);
    if (!errorsFound.includes(reason)) errorsFound.push(reason);
  };

  for (const [capabilityId, owned] of definitions) {
    const selected = explicit.get(capabilityId);
    if (owned.definition.required && selected === "disabled") throw errors.validation(`Required capability cannot be disabled: ${capabilityId}`);
    if (owned.definition.required) {
      desired.set(capabilityId, "enabled"); source.set(capabilityId, "required");
    } else if (selected) {
      desired.set(capabilityId, selected); source.set(capabilityId, "explicit");
    } else {
      desired.set(capabilityId, owned.definition.default_state); source.set(capabilityId, "default");
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (capabilityId: string): void => {
    if (visited.has(capabilityId) || desired.get(capabilityId) !== "enabled") return;
    if (visiting.has(capabilityId)) {
      const start = Math.max(0, stack.indexOf(capabilityId));
      const cycle = [...stack.slice(start), capabilityId];
      const reason = `Capability dependency cycle: ${cycle.join(" -> ")}`;
      for (const member of new Set(cycle)) addBlocked(member, reason);
      return;
    }
    visiting.add(capabilityId); stack.push(capabilityId);
    const owned = definitions.get(capabilityId)!;
    for (const requirement of [...owned.definition.requires].sort((a, b) => a.capability.localeCompare(b.capability))) {
      const dependency = definitions.get(requirement.capability);
      if (!dependency) {
        addBlocked(capabilityId, `Capability ${capabilityId} requires unknown or uninstalled capability ${requirement.capability}`);
        continue;
      }
      if (requirement.min_package_version) {
        const installedVersion = installed.get(dependency.package_id) ?? "0.0.0";
        packageRequirements.set(`${capabilityId}:${dependency.package_id}:${requirement.min_package_version}`, {
          capability_id: capabilityId,
          package_id: dependency.package_id,
          min_version: requirement.min_package_version,
          installed_version: installedVersion,
        });
        if (!satisfiesVersion(installedVersion, requirement.min_package_version)) {
          addBlocked(capabilityId, `Capability ${capabilityId} requires ${dependency.package_id} >= ${requirement.min_package_version}; installed ${installedVersion}`);
          continue;
        }
      }
      if (explicit.get(requirement.capability) === "disabled") {
        addBlocked(capabilityId, `Capability ${capabilityId} requires explicitly disabled ${requirement.capability}`);
        continue;
      }
      if (desired.get(requirement.capability) !== "enabled") {
        desired.set(requirement.capability, "enabled");
        source.set(requirement.capability, "dependency");
        implicit.add(requirement.capability);
      }
      visit(requirement.capability);
      if ((blocked.get(requirement.capability)?.length ?? 0) > 0) {
        addBlocked(capabilityId, `Capability ${capabilityId} depends on blocked ${requirement.capability}`);
      }
    }
    stack.pop(); visiting.delete(capabilityId); visited.add(capabilityId);
  };

  for (const capabilityId of [...definitions.keys()].sort()) visit(capabilityId);

  for (const capabilityId of [...definitions.keys()].sort()) {
    if (desired.get(capabilityId) !== "enabled") continue;
    const definition = definitions.get(capabilityId)!.definition;
    for (const conflict of [...definition.conflicts_with].sort()) {
      if (!definitions.has(conflict)) {
        addBlocked(capabilityId, `Capability ${capabilityId} conflicts with unknown capability ${conflict}`);
      } else if (desired.get(conflict) === "enabled") {
        const reason = `Capability conflict: ${capabilityId} conflicts with ${conflict}`;
        addBlocked(capabilityId, reason);
        addBlocked(conflict, reason);
      }
    }
  }

  const capabilities = [...definitions.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([capabilityId, owned]) => {
    const desiredState = desired.get(capabilityId) ?? "disabled";
    const reasons = blocked.get(capabilityId) ?? [];
    const state: CapabilityEffectiveState = reasons.length
      ? "blocked"
      : owned.definition.required
        ? "required"
        : desiredState === "enabled" ? "enabled" : "disabled";
    return {
      capability_id: capabilityId,
      package_id: owned.package_id,
      package_version: owned.package_version,
      label: owned.definition.label,
      state,
      desired_state: desiredState,
      source: source.get(capabilityId) ?? "default",
      blocked_reasons: reasons,
    } satisfies ResolvedCapability;
  });

  const previous = currentStateMap(current);
  const diff = capabilities
    .filter((entry) => previous.get(entry.capability_id) !== entry.state)
    .map((entry) => ({ capability_id: entry.capability_id, from: previous.get(entry.capability_id) ?? "absent", to: entry.state } satisfies CapabilityProfileDiff));

  return {
    profile_id: proposal.profile_id,
    valid: errorsFound.length === 0,
    capabilities,
    errors: errorsFound,
    implicit_enables: [...implicit].sort(),
    package_requirements: [...packageRequirements.values()].sort((a, b) => a.capability_id.localeCompare(b.capability_id) || a.package_id.localeCompare(b.package_id)),
    diff,
  };
}

export function assertCapabilityResolution(plan: CapabilityResolutionPlan): CapabilityResolutionPlan {
  if (!plan.valid) throw errors.validation(`Capability profile cannot be applied: ${plan.errors.join("; ")}`);
  return plan;
}

export function capabilityIsEnabled(plan: CapabilityResolutionPlan, capabilityId: string): boolean {
  const state = plan.capabilities.find((entry) => entry.capability_id === capabilityId)?.state;
  return state === "enabled" || state === "required";
}

export function capabilitySurfaceOwner(
  contracts: PackageCapabilityContract[],
  packageId: string,
  kind: CapabilitySurfaceKind,
  surface: string,
): string | null {
  const contract = contracts.find((entry) => entry.package_id === packageId);
  if (!contract) return null;
  for (const capability of contract.capabilities) if (capability.surfaces[kind].includes(surface)) return capability.id;
  return null;
}

export function capabilitySurfaceEnabled(
  contracts: PackageCapabilityContract[],
  plan: CapabilityResolutionPlan,
  packageId: string,
  kind: CapabilitySurfaceKind,
  surface: string,
): boolean {
  const owner = capabilitySurfaceOwner(contracts, packageId, kind, surface);
  return owner === null || capabilityIsEnabled(plan, owner);
}

export function capabilityValidatorSurfaceKey(entry: { doctype: string; actions?: string[] }): string {
  return validatorKey(entry as AppManifest["validators"][number]);
}
