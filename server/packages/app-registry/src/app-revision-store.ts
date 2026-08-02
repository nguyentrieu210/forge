import { errors } from "../../core/src/index.js";
import type { AppRollbackPlan } from "./app-rollback.js";
import { planAppRollback } from "./app-rollback.js";

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

type ActiveAppRow = {
  version: string;
  content_hash: string;
  manifest_json: string;
};

/** Read-side companion to 0049_app_revision_history.sql. It never activates a revision itself. */
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
    const plan = planAppRollback(JSON.parse(active.manifest_json), JSON.parse(target.manifest_json));
    return {
      ...plan,
      target_revision_no: target.revision_no,
      active_revision_no: active.revision_no,
    };
  }
}
