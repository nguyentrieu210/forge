import { errors, sha256Hex } from "../../core/src/index.js";
import {
  assertCapabilityResolution,
  parseCapabilityProfileProposal,
  resolveCapabilityProfile,
  type CapabilityProfileProposal,
  type CapabilityResolutionPlan,
  type InstalledPackageVersion,
  type PackageCapabilityContract,
} from "./capability-profile.js";

export interface StoredCapabilityProfile {
  profile_id: string;
  version: number;
  proposal: CapabilityProfileProposal;
  resolution: CapabilityResolutionPlan;
  applied_by: string;
  applied_at: string;
}

export interface CapabilityProfilePreview {
  current: StoredCapabilityProfile | null;
  proposal: CapabilityProfileProposal;
  resolution: CapabilityResolutionPlan;
  contracts: PackageCapabilityContract[];
}

export interface CapabilityProfileApplyResult extends StoredCapabilityProfile {
  outcome: "applied" | "unchanged";
}

type ContractRow = {
  app_id: string;
  app_version: string;
  content_hash: string;
  contract_json: string;
};

type ActiveProfileRow = {
  profile_id: string;
  version: number;
  proposal_json: string;
  resolution_json: string;
  applied_by: string;
  applied_at: string;
};

function canonicalProposal(proposal: CapabilityProfileProposal): CapabilityProfileProposal {
  return {
    profile_id: proposal.profile_id,
    expected_version: proposal.expected_version ?? null,
    selections: [...proposal.selections].sort((a, b) => a.capability_id.localeCompare(b.capability_id)),
  };
}

export class CapabilityProfileStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async rememberPackageContract(
    tenantId: string,
    appId: string,
    appVersion: string,
    contentHash: string,
    contract: PackageCapabilityContract,
    now: string,
  ): Promise<void> {
    await this.db.prepare(
      `INSERT INTO app_capability_contracts(
         tenant_id,app_id,app_version,content_hash,contract_json,registered_at
       ) VALUES(?1,?2,?3,?4,?5,?6)
       ON CONFLICT(tenant_id,app_id,content_hash) DO UPDATE SET
         app_version=excluded.app_version,
         contract_json=excluded.contract_json,
         registered_at=excluded.registered_at`,
    ).bind(tenantId, appId, appVersion, contentHash, JSON.stringify(contract), now).run();
  }

  async contractsForInstalled(tenantId: string, installedPackages: InstalledPackageVersion[]): Promise<PackageCapabilityContract[]> {
    const rows = await this.db.prepare(
      `SELECT app_id,app_version,content_hash,contract_json
       FROM app_capability_contracts WHERE tenant_id=?1 ORDER BY app_id,registered_at DESC`,
    ).bind(tenantId).all<ContractRow>();
    const expected = new Map(installedPackages.map((entry) => [entry.app_id, entry]));
    const seen = new Set<string>();
    const contracts: PackageCapabilityContract[] = [];
    for (const row of rows.results ?? []) {
      const installed = expected.get(row.app_id);
      if (!installed || seen.has(row.app_id)) continue;
      if (installed.version !== row.app_version) continue;
      if (installed.content_hash && installed.content_hash !== row.content_hash) continue;
      const parsed = JSON.parse(row.contract_json) as PackageCapabilityContract;
      if (parsed.package_id !== row.app_id || parsed.package_version !== row.app_version) {
        throw errors.misconfigured(`Capability contract identity mismatch for ${row.app_id}`);
      }
      contracts.push(parsed);
      seen.add(row.app_id);
    }
    return contracts;
  }

  async active(tenantId: string): Promise<StoredCapabilityProfile | null> {
    const row = await this.db.prepare(
      `SELECT r.profile_id,r.version,r.proposal_json,r.resolution_json,r.applied_by,r.applied_at
       FROM capability_profile_active a
       JOIN capability_profile_revisions r
         ON r.tenant_id=a.tenant_id AND r.profile_id=a.profile_id AND r.version=a.version
       WHERE a.tenant_id=?1`,
    ).bind(tenantId).first<ActiveProfileRow>();
    if (!row) return null;
    return {
      profile_id: row.profile_id,
      version: Number(row.version),
      proposal: JSON.parse(row.proposal_json) as CapabilityProfileProposal,
      resolution: JSON.parse(row.resolution_json) as CapabilityResolutionPlan,
      applied_by: row.applied_by,
      applied_at: row.applied_at,
    };
  }

  async nextVersion(tenantId: string, profileId: string): Promise<number> {
    const row = await this.db.prepare(
      `SELECT COALESCE(MAX(version),0) AS version
       FROM capability_profile_revisions WHERE tenant_id=?1 AND profile_id=?2`,
    ).bind(tenantId, profileId).first<{ version: number }>();
    return Number(row?.version ?? 0) + 1;
  }

  async apply(
    tenantId: string,
    proposal: CapabilityProfileProposal,
    resolution: CapabilityResolutionPlan,
    actor: string,
    now: string,
  ): Promise<CapabilityProfileApplyResult> {
    assertCapabilityResolution(resolution);
    const current = await this.active(tenantId);
    const expected = proposal.expected_version ?? null;
    const currentVersion = current?.version ?? 0;
    if (expected !== null && expected !== currentVersion) throw errors.version(currentVersion);

    const normalized = canonicalProposal(proposal);
    const fingerprint = await sha256Hex({ proposal: normalized, resolution });
    const currentFingerprint = current ? await sha256Hex({ proposal: canonicalProposal(current.proposal), resolution: current.resolution }) : null;
    if (current && current.profile_id === proposal.profile_id && fingerprint === currentFingerprint) {
      return { ...current, outcome: "unchanged" };
    }

    const version = await this.nextVersion(tenantId, proposal.profile_id);
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO capability_profile_revisions(
           tenant_id,profile_id,version,proposal_json,resolution_json,content_hash,applied_by,applied_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`,
      ).bind(tenantId, proposal.profile_id, version, JSON.stringify(normalized), JSON.stringify(resolution), fingerprint, actor, now),
      this.db.prepare(
        `INSERT INTO capability_profile_active(tenant_id,profile_id,version,modified_at)
         VALUES(?1,?2,?3,?4)
         ON CONFLICT(tenant_id) DO UPDATE SET
           profile_id=excluded.profile_id,version=excluded.version,modified_at=excluded.modified_at`,
      ).bind(tenantId, proposal.profile_id, version, now),
    ]);
    return { profile_id: proposal.profile_id, version, proposal: normalized, resolution, applied_by: actor, applied_at: now, outcome: "applied" };
  }
}

export class CapabilityProfileService {
  readonly store: CapabilityProfileStore;

  constructor(db: D1Database) {
    this.store = new CapabilityProfileStore(db);
  }

  async preview(
    tenantId: string,
    installedPackages: InstalledPackageVersion[],
    proposalValue: unknown,
  ): Promise<CapabilityProfilePreview> {
    const proposal = parseCapabilityProfileProposal(proposalValue);
    const contracts = await this.store.contractsForInstalled(tenantId, installedPackages);
    const current = await this.store.active(tenantId);
    const currentPlan = current?.resolution ?? resolveCapabilityProfile(
      contracts,
      installedPackages,
      { profile_id: proposal.profile_id, expected_version: 0, selections: [] },
      null,
    );
    const resolution = resolveCapabilityProfile(contracts, installedPackages, proposal, currentPlan);
    return { current, proposal, resolution, contracts };
  }

  async apply(
    tenantId: string,
    installedPackages: InstalledPackageVersion[],
    proposalValue: unknown,
    actor: string,
    now: string,
  ): Promise<CapabilityProfileApplyResult> {
    const preview = await this.preview(tenantId, installedPackages, proposalValue);
    assertCapabilityResolution(preview.resolution);
    return this.store.apply(tenantId, preview.proposal, preview.resolution, actor, now);
  }
}
