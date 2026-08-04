export type CapabilityDesiredState = "enabled" | "disabled";
export type CapabilityEffectiveState = "required" | "enabled" | "disabled" | "blocked";

export interface CapabilityCatalogItem {
  capability_id: string;
  package_id: string;
  label: string;
  description?: string;
  required?: boolean;
  state: CapabilityEffectiveState;
  desired_state: CapabilityDesiredState;
  source?: "required" | "explicit" | "default" | "dependency";
  blocked_reasons?: string[];
}

export interface CapabilityProfileModel {
  profileId: string;
  expectedVersion: number;
  capabilities: CapabilityCatalogItem[];
}

export interface CapabilityProfilePayload {
  profile_id: string;
  expected_version: number;
  selections: Array<{ capability_id: string; state: CapabilityDesiredState }>;
}

export interface CapabilityProfileValidation {
  ok: boolean;
  errors: string[];
}

export function capabilityProfileFromResolution(input: {
  profile_id: string;
  version?: number | null;
  capabilities: CapabilityCatalogItem[];
}): CapabilityProfileModel {
  return {
    profileId: input.profile_id,
    expectedVersion: Number(input.version ?? 0),
    capabilities: input.capabilities.map((entry) => ({ ...entry, blocked_reasons: [...(entry.blocked_reasons ?? [])] })),
  };
}

export function setCapabilityDesiredState(
  model: CapabilityProfileModel,
  capabilityId: string,
  state: CapabilityDesiredState,
): CapabilityProfileModel {
  return {
    ...model,
    capabilities: model.capabilities.map((entry) => {
      if (entry.capability_id !== capabilityId) return entry;
      if (entry.required || entry.state === "required") return entry;
      return { ...entry, desired_state: state, source: "explicit" };
    }),
  };
}

export function validateCapabilityProfile(model: CapabilityProfileModel): CapabilityProfileValidation {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(model.profileId)) errors.push("Profile ID phải là kebab-case.");
  if (!Number.isSafeInteger(model.expectedVersion) || model.expectedVersion < 0) errors.push("Profile version không hợp lệ.");
  const ids = new Set<string>();
  for (const capability of model.capabilities) {
    if (ids.has(capability.capability_id)) errors.push(`Capability trùng: ${capability.capability_id}`);
    ids.add(capability.capability_id);
    if ((capability.required || capability.state === "required") && capability.desired_state === "disabled") {
      errors.push(`Capability bắt buộc không thể tắt: ${capability.capability_id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function serializeCapabilityProfile(model: CapabilityProfileModel): CapabilityProfilePayload {
  const validation = validateCapabilityProfile(model);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  return {
    profile_id: model.profileId,
    expected_version: model.expectedVersion,
    selections: model.capabilities
      .filter((entry) => !entry.required && entry.state !== "required" && entry.source === "explicit")
      .map((entry) => ({ capability_id: entry.capability_id, state: entry.desired_state }))
      .sort((a, b) => a.capability_id.localeCompare(b.capability_id)),
  };
}
