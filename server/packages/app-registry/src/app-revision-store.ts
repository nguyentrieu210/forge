import { errors, randomId } from "../../core/src/index.js";
import type { AppRollbackPlan } from "./app-rollback.js";
import { assertAppRollbackAutomatable, planAppRollback } from "./app-rollback.js";
import { parseAppManifestWithInputTables } from "./action-input-table-compat.js";

export interface AppRevisionRecord {
  app_id: string;
  revision_no: number;
  version: string;
  content_hash: string;
  manifest_json: string;
  recorded_at: string;
}

export interface AppRevisionSummary {
  app_id: string;
  revision_no: number;
  version: string;
  content_hash: string;
  recorded_at: string;
  active: boolean;
}

export interface AppRevisionActivation {
  activation_id: string;
  app_id: string;
  from_revision_no: number;
  to_revision_no: number;
  action: "rollback" | "restore";
  actor: string;
  activated_at: string;
}

type ActiveAppRow = {
  version: string;
  content_hash: string;
  manifest_json: string;
};

function requiredText(value: string, where: string, max = 320): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw errors.validation(`${where} is required and must be at most ${max} characters`);
  return normalized;
}

function isoTimestamp(value: string, where: string): string {
  const normalized = requiredText(value, where, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw errors.validation(`${where} must be an ISO datetime`);
  return new Date(parsed).toISOString();
}

/**
 * A presentation rollback may mutate only values read from installed_apps itself.
 *
 * DocTypes, workflows, print formats, roles, fixtures and custom fields are materialized into
 * separate tables by the installer. Reverting them would require the full install transaction
 * and migration semantics. Keeping those fields byte-equivalent lets us safely activate an old
 * manifest row without bypassing the core installer's intentional downgrade guard.
 */
function presentationKernelSignature(manifestValue: unknown): string {
  const manifest = parseAppManifestWithInputTables(manifestValue);
  const {
    name: _name,
    version: _version,
    nav: _nav,
    reports: _reports,
    charts: _charts,
    client: _client,
    ...kernel
  } = manifest;
  return JSON.stringify(kernel);
}

function planPresentationRollback(activeManifest: unknown, targetManifest: unknown): AppRollbackPlan {
  const plan = planAppRollback(activeManifest, targetManifest);
  if (presentationKernelSignature(activeManifest) === presentationKernelSignature(targetManifest)) return plan;
  if (plan.issues.some((entry) => entry.code === "MATERIALIZED_METADATA_CHANGED")) return plan;
  return {
    ...plan,
    automatable: false,
    issues: [
      ...plan.issues,
      {
        severity: "review",
        code: "MATERIALIZED_METADATA_CHANGED",
        path: "manifest",
        message: "Rollback target changes metadata materialized outside installed_apps; explicit reverse migration is required",
      },
    ],
  };
}

/** Read-side companion to 0049_app_revision_history.sql plus the narrow safe rollback path. */
export class AppRevisionStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(database: D1Database) {
    this.db = database.withSession?.("first-primary") ?? database;
  }

  async list(tenantId: string, appId: string, limit = 50): Promise<AppRevisionSummary[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const active = await this.db.prepare(
      "SELECT version,content_hash,manifest_json FROM installed_apps WHERE tenant_id=?1 AND app_id=?2",
    ).bind(tenantId, appId).first<ActiveAppRow>();
    if (!active) throw errors.notFound(`App is not installed: ${appId}`);

    const result = await this.db.prepare(
      `SELECT app_id,revision_no,version,content_hash,recorded_at
       FROM app_revisions
       WHERE tenant_id=?1 AND app_id=?2
       ORDER BY revision_no DESC LIMIT ?3`,
    ).bind(tenantId, appId, bounded).all<Omit<AppRevisionRecord, "manifest_json">>();
    return (result.results ?? []).map((row) => ({
      ...row,
      active: row.content_hash === active.content_hash,
    }));
  }

  async listActivations(tenantId: string, appId: string, limit = 50): Promise<AppRevisionActivation[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const result = await this.db.prepare(
      `SELECT activation_id,app_id,from_revision_no,to_revision_no,action,actor,activated_at
       FROM app_revision_activations
       WHERE tenant_id=?1 AND app_id=?2
       ORDER BY activated_at DESC,activation_id DESC LIMIT ?3`,
    ).bind(tenantId, appId, bounded).all<AppRevisionActivation>();
    return result.results ?? [];
  }

  async get(tenantId: string, appId: string, revisionNo: number): Promise<AppRevisionRecord> {
    if (!Number.isInteger(revisionNo) || revisionNo <= 0) throw errors.validation("revision_no must be a positive integer");
    const row = await this.db.prepare(
      `SELECT app_id,revision_no,version,content_hash,manifest_json,recorded_at
       FROM app_revisions WHERE tenant_id=?1 AND app_id=?2 AND revision_no=?3`,
    ).bind(tenantId, appId, revisionNo).first<AppRevisionRecord>();
    if (!row) throw errors.notFound(`App revision not found: ${appId}#${revisionNo}`);
    return row;
  }

  async active(tenantId: string, appId: string): Promise<AppRevisionRecord> {
    const row = await this.db.prepare(
      `SELECT app_id,version,content_hash,manifest_json,modified_at AS recorded_at
       FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
    ).bind(tenantId, appId).first<Omit<AppRevisionRecord, "revision_no">>();
    if (!row) throw errors.notFound(`App is not installed: ${appId}`);
    const revision = await this.db.prepare(
      `SELECT revision_no FROM app_revisions
       WHERE tenant_id=?1 AND app_id=?2 AND content_hash=?3 AND manifest_json=?4
       ORDER BY revision_no DESC LIMIT 1`,
    ).bind(tenantId, appId, row.content_hash, row.manifest_json).first<{ revision_no: number }>();
    if (!revision) throw errors.database(`Active app ${appId} has no revision history; tenant migration 0049 may be missing`);
    return { ...row, revision_no: revision.revision_no };
  }

  /** Compare the active package against one stored revision using the fail-closed WS09 planner. */
  async planRollback(tenantId: string, appId: string, targetRevisionNo: number): Promise<AppRollbackPlan & { target_revision_no: number; active_revision_no: number }> {
    const [active, target] = await Promise.all([
      this.active(tenantId, appId),
      this.get(tenantId, appId, targetRevisionNo),
    ]);
    if (target.revision_no === active.revision_no) throw errors.validation(`${appId} revision ${targetRevisionNo} is already active`);
    const plan = planPresentationRollback(JSON.parse(active.manifest_json), JSON.parse(target.manifest_json));
    return {
      ...plan,
      target_revision_no: target.revision_no,
      active_revision_no: active.revision_no,
    };
  }

  /**
   * Activate an older revision only when every materialized/write-contract surface is identical.
   *
   * This is intentionally narrower than a general schema rollback. The latter remains blocked by
   * the planner until an explicit reverse migration exists. Here the only changed source of truth
   * is installed_apps, so one optimistic UPDATE plus its audit INSERT is a complete transaction.
   */
  async rollbackPresentation(
    tenantId: string,
    appId: string,
    targetRevisionNo: number,
    actorValue: string,
    nowValue: string,
  ): Promise<AppRevisionActivation> {
    const actor = requiredText(actorValue, "actor");
    const now = isoTimestamp(nowValue, "now");
    const [active, target] = await Promise.all([
      this.active(tenantId, appId),
      this.get(tenantId, appId, targetRevisionNo),
    ]);
    if (target.revision_no >= active.revision_no) {
      throw errors.validation(`Presentation rollback target must be older than active revision ${active.revision_no}`);
    }

    const activeManifest = JSON.parse(active.manifest_json);
    const targetManifest = JSON.parse(target.manifest_json);
    const plan = planPresentationRollback(activeManifest, targetManifest);
    assertAppRollbackAutomatable(plan);
    const parsedTarget = parseAppManifestWithInputTables(targetManifest);
    const activationId = randomId("apprev");

    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE installed_apps
         SET app_name=?1,version=?2,content_hash=?3,manifest_json=?4,modified_at=?5
         WHERE tenant_id=?6 AND app_id=?7 AND content_hash=?8 AND manifest_json=?9`,
      ).bind(
        parsedTarget.name,
        target.version,
        target.content_hash,
        target.manifest_json,
        now,
        tenantId,
        appId,
        active.content_hash,
        active.manifest_json,
      ),
      // Insert only if the first statement actually left the target revision active. If a
      // concurrent update wins the optimistic predicate, this SELECT yields no row and avoids
      // manufacturing a rollback audit event for a rollback that never happened.
      this.db.prepare(
        `INSERT INTO app_revision_activations(
           tenant_id,app_id,activation_id,from_revision_no,to_revision_no,action,actor,activated_at
         )
         SELECT ?1,?2,?3,?4,?5,'rollback',?6,?7
         WHERE EXISTS(
           SELECT 1 FROM installed_apps
           WHERE tenant_id=?1 AND app_id=?2 AND content_hash=?8 AND manifest_json=?9
         )`,
      ).bind(
        tenantId,
        appId,
        activationId,
        active.revision_no,
        target.revision_no,
        actor,
        now,
        target.content_hash,
        target.manifest_json,
      ),
    ]);

    if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
      throw errors.lifecycle("App revision changed while rollback was being activated; reload revision history and retry");
    }
    return {
      activation_id: activationId,
      app_id: appId,
      from_revision_no: active.revision_no,
      to_revision_no: target.revision_no,
      action: "rollback",
      actor,
      activated_at: now,
    };
  }
}
