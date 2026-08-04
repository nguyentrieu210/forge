import type { D1UserStore } from "../../auth/src/index.js";
import { errors, sha256Hex } from "../../core/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";
import { lowerActionInputTablesForInstall } from "./action-input-table-compat.js";
import {
  capabilitySurfaceEnabled,
  capabilityValidatorSurfaceKey,
  parsePackageCapabilityContract,
  resolveCapabilityProfile,
  type CapabilityProfileProposal,
  type CapabilityResolutionPlan,
  type CapabilitySurfaceKind,
  type PackageCapabilityContract,
} from "./capability-profile.js";
import { CapabilityProfileService, type CapabilityProfileApplyResult, type CapabilityProfilePreview } from "./capability-profile-store.js";
import { AppInstaller as InputTableAppInstaller, type InstalledAppRecordWithInputTables } from "./input-table-installer.js";
import type { InstallResult } from "./installer.js";
import { parseAppManifest, type AppClientManifest } from "./manifest.js";

export type CapabilityAwareInstalledAppRecord = InstalledAppRecordWithInputTables & {
  capability_profile?: {
    profile_id: string;
    version: number;
  };
};

export interface CapabilityProfileSnapshot {
  profile_id: string;
  version: number;
  resolution: CapabilityResolutionPlan | null;
}

function filteredClient(
  client: AppClientManifest | null | undefined,
  nav: InstalledAppRecordWithInputTables["nav"],
): AppClientManifest | null {
  if (!client) return null;
  if (!client.home?.route) return client;
  if (nav.some((entry) => entry.route === client.home?.route || entry.key === client.home?.route)) return client;
  const { home: _home, ...rest } = client;
  return rest;
}

/**
 * Canonical App Registry installer with capability-profile activation layered over the
 * proven package installer. Package installation remains authoritative for metadata/data;
 * profile application only gates surfaces and never uninstalls a package or deletes data.
 */
export class AppInstaller extends InputTableAppInstaller {
  private readonly capabilityProfiles: CapabilityProfileService;

  constructor(
    db: D1Database,
    metadata: MetadataStore,
    users: D1UserStore,
    platformVersion = "1.0.0",
  ) {
    super(db, metadata, users, platformVersion);
    this.capabilityProfiles = new CapabilityProfileService(db);
  }

  override async install(
    tenantId: string,
    packageValue: unknown,
    actor: string,
    now: string,
  ): Promise<InstallResult> {
    const lowered = lowerActionInputTablesForInstall(packageValue);
    const manifest = parseAppManifest(lowered);
    const contract = parsePackageCapabilityContract(packageValue, manifest);
    if (contract) {
      const contentHash = await sha256Hex(lowered);
      await this.capabilityProfiles.store.rememberPackageContract(
        tenantId, manifest.id, manifest.version, contentHash, contract, now,
      );
    }
    return super.install(tenantId, packageValue, actor, now);
  }

  async previewCapabilityProfile(
    tenantId: string,
    proposal: CapabilityProfileProposal | unknown,
  ): Promise<CapabilityProfilePreview> {
    const installed = await super.list(tenantId);
    return this.capabilityProfiles.preview(tenantId, installed, proposal);
  }

  async applyCapabilityProfile(
    tenantId: string,
    proposal: CapabilityProfileProposal | unknown,
    actor: string,
    now: string,
  ): Promise<CapabilityProfileApplyResult> {
    const installed = await super.list(tenantId);
    return this.capabilityProfiles.apply(tenantId, installed, proposal, actor, now);
  }

  async currentCapabilityProfile(tenantId: string): Promise<CapabilityProfileSnapshot> {
    const installed = await super.list(tenantId);
    const contracts = await this.capabilityProfiles.store.contractsForInstalled(tenantId, installed);
    const active = await this.capabilityProfiles.store.active(tenantId);
    if (active) {
      return {
        profile_id: active.profile_id,
        version: active.version,
        resolution: resolveCapabilityProfile(contracts, installed, active.proposal, active.resolution),
      };
    }
    if (!contracts.length) return { profile_id: "default", version: 0, resolution: null };
    return {
      profile_id: "default",
      version: 0,
      resolution: resolveCapabilityProfile(
        contracts,
        installed,
        { profile_id: "default", expected_version: 0, selections: [] },
        null,
      ),
    };
  }

  async currentCapabilityResolution(tenantId: string): Promise<CapabilityResolutionPlan | null> {
    return (await this.currentCapabilityProfile(tenantId)).resolution;
  }

  async assertCapability(tenantId: string, capabilityId: string): Promise<void> {
    const plan = await this.currentCapabilityResolution(tenantId);
    if (!plan) return;
    const capability = plan.capabilities.find((entry) => entry.capability_id === capabilityId);
    if (!capability) throw errors.reference(`Unknown capability: ${capabilityId}`);
    if (capability.state !== "enabled" && capability.state !== "required") {
      throw errors.permission(`Capability is not active: ${capabilityId}`);
    }
  }

  /**
   * Single server-side authority for non-visual runtime consumers such as hooks,
   * scheduled jobs and provider dispatch. Packages without a capability contract stay
   * active for backward compatibility; a contracted surface follows the effective
   * tenant profile and never trusts client-side flags.
   */
  async isCapabilitySurfaceEnabled(
    tenantId: string,
    packageId: string,
    kind: CapabilitySurfaceKind,
    surface: string,
  ): Promise<boolean> {
    const installed = await super.list(tenantId);
    const contracts = await this.capabilityProfiles.store.contractsForInstalled(tenantId, installed);
    const packageContracts = contracts.filter((contract) => contract.package_id === packageId);
    if (!packageContracts.length) return true;
    const active = await this.capabilityProfiles.store.active(tenantId);
    const plan = active
      ? resolveCapabilityProfile(contracts, installed, active.proposal, active.resolution)
      : resolveCapabilityProfile(
        contracts,
        installed,
        { profile_id: "default", expected_version: 0, selections: [] },
        null,
      );
    return capabilitySurfaceEnabled(packageContracts, plan, packageId, kind, surface);
  }

  override async list(tenantId: string): Promise<CapabilityAwareInstalledAppRecord[]> {
    const installed = await super.list(tenantId);
    const contracts = await this.capabilityProfiles.store.contractsForInstalled(tenantId, installed);
    if (!contracts.length) return installed;
    const active = await this.capabilityProfiles.store.active(tenantId);
    const plan = active
      ? resolveCapabilityProfile(contracts, installed, active.proposal, active.resolution)
      : resolveCapabilityProfile(contracts, installed, { profile_id: "default", expected_version: 0, selections: [] }, null);

    const byPackage = new Map<string, PackageCapabilityContract>();
    for (const contract of contracts) byPackage.set(contract.package_id, contract);

    return installed.map((record) => {
      const contract = byPackage.get(record.app_id);
      if (!contract) return record;
      const contractList = [contract];
      const nav = record.nav.filter((entry) => capabilitySurfaceEnabled(contractList, plan, record.app_id, "nav", entry.key));
      const actions = record.actions.filter((entry) => capabilitySurfaceEnabled(contractList, plan, record.app_id, "actions", entry.name));
      const screens = record.screens.filter((entry) => capabilitySurfaceEnabled(contractList, plan, record.app_id, "screens", entry.name));
      const reports = record.reports.filter((entry) => capabilitySurfaceEnabled(contractList, plan, record.app_id, "reports", entry.name));
      const charts = record.charts.filter((entry) => capabilitySurfaceEnabled(contractList, plan, record.app_id, "charts", entry.name));
      const validators = record.validators.filter((entry) => capabilitySurfaceEnabled(
        contractList, plan, record.app_id, "validators", capabilityValidatorSurfaceKey(entry),
      ));
      return {
        ...record,
        nav,
        actions,
        screens,
        reports,
        charts,
        validators,
        client: filteredClient(record.client, nav),
        ...(active ? { capability_profile: { profile_id: active.profile_id, version: active.version } } : {}),
      };
    });
  }
}
