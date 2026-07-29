/**
 * Installing, upgrading and removing an app.
 *
 * The whole point of an app being data is that installation is a single metadata
 * write. Every guard here exists because the alternative failure is silent: a
 * half-installed app, a doctype two apps both claim, or an uninstall that takes a
 * customer's own work with it.
 */

import { errors, sha256Hex } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";
import type { D1UserStore } from "../../auth/src/index.js";
import { navItemPath, parseAppManifest, satisfiesVersion, type AppManifest } from "./manifest.js";

export interface InstalledAppRecord {
  app_id: string;
  app_name: string;
  version: string;
  content_hash: string;
  installed_at: string;
  nav: AppManifest["nav"];
  worker: string | null;
  /** Pre-commit checks this app registered. Carried on the record so the write path
   * does not have to re-parse every manifest on every write. */
  validators: AppManifest["validators"];
  /** Tabular reports this app declares, so running one needs no second read. */
  reports: AppManifest["reports"];
  /** Form-driven operations, so the generic client can render them without a build. */
  actions: AppManifest["actions"];
  /** App-owned composed screens, so install and presentation remain one artifact. */
  screens: AppManifest["screens"];
  /** Presentation, so the generic client can be told what to render without a build. */
  client: AppManifest["client"] | null;
  /** Public catalogue and order intake, carried so a storefront request needs no
   *  manifest re-parse — and so an unpublished product disappears on the next request. */
  storefront: AppManifest["storefront"] | null;
}

export interface InstallResult {
  app_id: string;
  version: string;
  outcome: "installed" | "upgraded" | "unchanged";
  doctypes: number;
  workflows: number;
  print_formats: number;
  roles: number;
  fixtures: number;
}

export interface UninstallResult {
  app_id: string;
  removed: { doctypes: number; workflows: number; print_formats: number; roles: number; fixtures: number };
}

type ObjectType = "DocType" | "Workflow" | "Print Format" | "Role" | "Master Record" | "Custom Field";
type SqlValue = string | number | null;

export class AppInstaller {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(
    db: D1Database,
    _metadata: MetadataStore,
    _users: D1UserStore,
    private readonly platformVersion = "1.0.0",
  ) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async list(tenantId: string): Promise<InstalledAppRecord[]> {
    const result = await this.db.prepare(
      `SELECT app_id, app_name, version, content_hash, manifest_json, installed_at
       FROM installed_apps WHERE tenant_id=?1 ORDER BY app_id`,
    ).bind(tenantId).all<{ app_id: string; app_name: string; version: string; content_hash: string; manifest_json: string; installed_at: string }>();
    return (result.results ?? []).map((row) => {
      const manifest = JSON.parse(row.manifest_json) as AppManifest;
      return {
        app_id: row.app_id,
        app_name: row.app_name,
        version: row.version,
        content_hash: row.content_hash,
        installed_at: row.installed_at,
        nav: manifest.nav ?? [],
        worker: manifest.worker ?? null,
        validators: manifest.validators ?? [],
        reports: manifest.reports ?? [],
        actions: manifest.actions ?? [],
        screens: manifest.screens ?? [],
        client: manifest.client ?? null,
        storefront: manifest.storefront ?? null,
      };
    });
  }

  /**
   * Installs or upgrades an app.
   *
   * Re-installing the identical package is a no-op rather than a rewrite, so a
   * retried or repeated provisioning call cannot churn metadata revisions and
   * invalidate every client cache for nothing.
   */
  async install(tenantId: string, packageValue: unknown, actor: string, now: string): Promise<InstallResult> {
    const manifest = parseAppManifest(packageValue);
    if (manifest.platform_requires && !satisfiesVersion(this.platformVersion, manifest.platform_requires)) {
      throw errors.validation(`${manifest.id} requires Forge ${manifest.platform_requires} or later; platform is ${this.platformVersion}`);
    }
    const contentHash = await sha256Hex(packageValue);

    const existing = await this.db.prepare(
      `SELECT version, content_hash, manifest_json FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
    ).bind(tenantId, manifest.id).first<{ version: string; content_hash: string; manifest_json: string }>();

    /**
     * Unchanged means the package is the same AND this platform reads it the same way.
     *
     * The hash alone is not enough, and the gap is not theoretical: the platform gained
     * app-declared reports, the identical package was re-installed on the upgraded
     * tenant, and the hash matched — so the stored manifest kept the OLD parse, with no
     * reports in it, and every report answered "Unknown report". Nothing looked wrong:
     * the install reported success and the app's version was current.
     *
     * Comparing the stored manifest against what the current parser produces catches
     * exactly that case and nothing else. Both strings come from `JSON.stringify` of the
     * same function, so they differ only when the parser's OUTPUT differs — which is
     * precisely when the stored copy is stale.
     */
    if (existing?.content_hash === contentHash && existing.manifest_json === JSON.stringify(manifest)) {
      return { app_id: manifest.id, version: manifest.version, outcome: "unchanged", doctypes: 0, workflows: 0, print_formats: 0, roles: 0, fixtures: 0 };
    }
    if (existing && !satisfiesVersion(manifest.version, existing.version)) {
      // Downgrades are refused: the older package's DocTypes may lack fields the
      // stored documents already use, and no migration runs backwards.
      throw errors.validation(`${manifest.id} ${existing.version} is installed; downgrading to ${manifest.version} is not supported`);
    }

    await this.assertDependencies(tenantId, manifest);
    await this.assertNoForeignOwnership(tenantId, manifest);
    await this.assertNoNavigationConflicts(tenantId, manifest);

    /**
     * The complete install is one D1 batch and therefore one transaction.
     *
     * Previously roles and metadata were written one-by-one before `installed_apps`.
     * A failure on the last workflow left a live DocType with no app record, no owner
     * and no safe uninstall path. Prevalidation cannot prevent storage failures, so
     * activation and every object it exposes must commit or roll back together.
    */
    const statements: D1PreparedStatement[] = [];
    const appendRows = (
      rows: SqlValue[][],
      rowsPerStatement: number,
      sqlBeforeValues: string,
      sqlAfterValues = "",
    ): void => {
      for (let start = 0; start < rows.length; start += rowsPerStatement) {
        const chunk = rows.slice(start, start + rowsPerStatement);
        const width = chunk[0]?.length ?? 0;
        if (!width || chunk.some((row) => row.length !== width)) {
          throw errors.validation("App installer produced an invalid grouped statement");
        }
        const tuples = chunk.map((_, rowIndex) => {
          const first = rowIndex * width + 1;
          return `(${Array.from({ length: width }, (_unused, columnIndex) => `?${first + columnIndex}`).join(",")})`;
        }).join(",");
        statements.push(
          this.db.prepare(`${sqlBeforeValues}${tuples}${sqlAfterValues}`).bind(...chunk.flat()),
        );
      }
    };

    // Roles lead the batch so DocPerm grants become valid in the same transaction.
    appendRows(
      manifest.roles.map((role) => [tenantId, role.role, role.desk_access ? 1 : 0, now]),
      25,
      "INSERT INTO roles(tenant_id,role,desk_access,modified_at) VALUES",
      " ON CONFLICT(tenant_id,role) DO NOTHING",
    );

    // Package revisions describe source metadata; stored revisions describe writes.
    // Carry the latter forward so repeated upgrades stay monotonic.
    const doctypeRows: SqlValue[][] = [];
    for (const doctype of manifest.doctypes) {
      const current = await this.db.prepare(
        `SELECT revision FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2`,
      ).bind(tenantId, doctype.name).first<{ revision: number }>();
      const revision = (current?.revision ?? 0) + 1;
      const normalized = { ...doctype, revision };
      doctypeRows.push([
        tenantId, doctype.name, doctype.module, doctype.custom ? 1 : 0,
        doctype.is_submittable ? 1 : 0, doctype.is_child ? 1 : 0,
        revision, JSON.stringify(normalized), actor, now,
      ]);
    }
    appendRows(
      doctypeRows,
      10,
      `INSERT INTO doctype_definitions(
         tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,modified_by,modified_at
       ) VALUES`,
      ` ON CONFLICT(tenant_id,doctype) DO UPDATE SET
          module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
          is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
          disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    );

    const workflowRows: SqlValue[][] = [];
    for (const workflow of manifest.workflows) {
      const current = await this.db.prepare(
        `SELECT revision FROM workflows WHERE tenant_id=?1 AND name=?2`,
      ).bind(tenantId, workflow.name).first<{ revision: number }>();
      const revision = (current?.revision ?? 0) + 1;
      const normalized = { ...workflow, revision };
      workflowRows.push([
        tenantId, workflow.name, workflow.document_type, workflow.is_active ? 1 : 0,
        revision, JSON.stringify(normalized), actor, now,
      ]);
    }
    appendRows(
      workflowRows,
      12,
      `INSERT INTO workflows(
         tenant_id,name,document_type,is_active,revision,workflow_json,modified_by,modified_at
       ) VALUES`,
      ` ON CONFLICT(tenant_id,name) DO UPDATE SET
          document_type=excluded.document_type,is_active=excluded.is_active,revision=excluded.revision,
          workflow_json=excluded.workflow_json,modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    );

    const printRows: SqlValue[][] = [];
    for (const format of manifest.print_formats) {
      const current = await this.db.prepare(
        `SELECT revision FROM print_formats WHERE tenant_id=?1 AND name=?2`,
      ).bind(tenantId, format.name).first<{ revision: number }>();
      const revision = (current?.revision ?? 0) + 1;
      const normalized = { ...format, revision };
      printRows.push([
        tenantId, format.name, format.doc_type, format.is_default ? 1 : 0,
        format.disabled ? 1 : 0, revision, JSON.stringify(normalized), actor, now,
      ]);
    }
    appendRows(
      printRows,
      11,
      `INSERT INTO print_formats(
         tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
       ) VALUES`,
      ` ON CONFLICT(tenant_id,name) DO UPDATE SET
          doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
          revision=excluded.revision,format_json=excluded.format_json,
          modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    );

    statements.push(
      this.db.prepare(
        `INSERT INTO installed_apps(tenant_id,app_id,app_name,version,content_hash,manifest_json,installed_by,installed_at,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)
         ON CONFLICT(tenant_id,app_id) DO UPDATE SET
           app_name=excluded.app_name, version=excluded.version, content_hash=excluded.content_hash,
           manifest_json=excluded.manifest_json, modified_at=excluded.modified_at`,
      ).bind(tenantId, manifest.id, manifest.name, manifest.version, contentHash, JSON.stringify(manifest), actor, now),
    );

    appendRows(
      manifest.fixtures.map((fixture) => [
        tenantId, fixture.record_type, fixture.name, JSON.stringify(fixture.data), now,
      ]),
      20,
      "INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at) VALUES",
      ` ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
          data_json=excluded.data_json,disabled=0,modified_at=excluded.modified_at`,
    );

    // Custom Fields, plus a revision bump for every doctype they touch. The bump is not
    // bookkeeping: `mergeCustomizations` versions the effective schema by it, so a field
    // written without one installs into the table and stays invisible to anything
    // holding a cached DocType — which, after an install, is every client.
    const touched = new Set<string>();
    const customFieldRows: SqlValue[][] = [];
    for (const field of manifest.custom_fields) {
      touched.add(field.dt);
      customFieldRows.push([
        tenantId, field.name, field.dt, field.fieldname, JSON.stringify(field.field),
        field.insert_after, actor, now,
      ]);
    }
    appendRows(
      customFieldRows,
      12,
      `INSERT INTO custom_fields(
         tenant_id,name,dt,fieldname,metadata_json,insert_after,modified_by,modified_at
       ) VALUES`,
      ` ON CONFLICT(tenant_id,name) DO UPDATE SET
          dt=excluded.dt,fieldname=excluded.fieldname,metadata_json=excluded.metadata_json,
          insert_after=excluded.insert_after,modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    );
    appendRows(
      [...touched].map((doctype) => [tenantId, doctype, 1, now]),
      25,
      "INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at) VALUES",
      ` ON CONFLICT(tenant_id,doctype) DO UPDATE SET
          revision=customization_revisions.revision+1,modified_at=excluded.modified_at`,
    );

    // Ownership is recorded last, once every object exists, and is rewritten
    // wholesale so an upgrade that drops an object also drops its claim.
    statements.push(this.db.prepare(`DELETE FROM app_objects WHERE tenant_id=?1 AND app_id=?2`).bind(tenantId, manifest.id));
    /**
     * Ownership rows go in as FEW statements, not one per object.
     *
     * These rows are the largest part of the batch and the least interesting: for an app
     * with forty DocTypes they were sixty-odd single-row inserts, so ownership bookkeeping
     * alone consumed half the atomic budget and a perfectly ordinary app was refused with
     * "expands to 128 install statements". The ceiling is meant to describe how COMPLEX a
     * package is; it was measuring how we happened to write it.
     *
     * Twenty rows per statement because D1 caps a query at 100 bound parameters and each
     * row binds five. Batching is invisible to the transaction: still one `db.batch`,
     * still all-or-nothing.
     */
    const owned = [...this.ownedObjects(manifest)];
    const OWNERSHIP_ROWS_PER_STATEMENT = 20;
    for (let start = 0; start < owned.length; start += OWNERSHIP_ROWS_PER_STATEMENT) {
      const chunk = owned.slice(start, start + OWNERSHIP_ROWS_PER_STATEMENT);
      const tuples = chunk
        .map((_, position) => `(?${position * 5 + 1},?${position * 5 + 2},?${position * 5 + 3},?${position * 5 + 4},?${position * 5 + 5})`)
        .join(",");
      statements.push(this.db.prepare(
        `INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope) VALUES${tuples}`,
      ).bind(...chunk.flatMap(([type, scope, name]) => [tenantId, manifest.id, type, name, scope])));
    }
    // One batch is the atomicity boundary. Refuse an oversized package rather than
    // splitting it into transactions and reintroducing partial installation.
    if (statements.length > 100) {
      throw errors.validation(`${manifest.id} expands to ${statements.length} install statements; maximum atomic package size is 100`);
    }
    await this.db.batch(statements);

    return {
      app_id: manifest.id,
      version: manifest.version,
      outcome: existing ? "upgraded" : "installed",
      doctypes: manifest.doctypes.length,
      workflows: manifest.workflows.length,
      print_formats: manifest.print_formats.length,
      roles: manifest.roles.length,
      fixtures: manifest.fixtures.length,
    };
  }

  /**
   * Removes an app and everything it owns.
   *
   * Refuses while any of its DocTypes still hold documents. Deleting the
   * definition would leave rows whose schema no longer exists — unreadable,
   * unexportable, and impossible to recover without reinstalling the exact
   * package. Data outlives apps, so the data wins.
   */
  async uninstall(tenantId: string, appId: string, now: string): Promise<UninstallResult> {
    const record = await this.db.prepare(
      `SELECT manifest_json FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
    ).bind(tenantId, appId).first<{ manifest_json: string }>();
    if (!record) throw errors.notFound(`App is not installed: ${appId}`);
    const manifest = JSON.parse(record.manifest_json) as AppManifest;

    const dependents = await this.db.prepare(
      `SELECT app_id FROM installed_apps
       WHERE tenant_id=?1 AND app_id<>?2
         AND EXISTS(SELECT 1 FROM json_each(json_extract(manifest_json,'$.requires')) WHERE json_extract(json_each.value,'$.id')=?2)`,
    ).bind(tenantId, appId).all<{ app_id: string }>();
    if ((dependents.results ?? []).length) {
      throw errors.validation(`Other apps depend on ${appId}: ${(dependents.results ?? []).map((row) => row.app_id).join(", ")}`);
    }

    for (const doctype of manifest.doctypes) {
      const used = await this.db.prepare(
        `SELECT 1 AS found FROM documents WHERE tenant_id=?1 AND doctype=?2 LIMIT 1`,
      ).bind(tenantId, doctype.name).first<{ found: number }>();
      if (used) throw errors.validation(`${doctype.name} still holds documents; uninstalling would orphan them`);
    }

    const statements: D1PreparedStatement[] = [];
    for (const doctype of manifest.doctypes) {
      statements.push(this.db.prepare(`DELETE FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM workflows WHERE tenant_id=?1 AND document_type=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM print_formats WHERE tenant_id=?1 AND doc_type=?2`).bind(tenantId, doctype.name));
      // Customisations of an app's doctype go with it; keeping them would leave
      // overlay rows referring to a definition that no longer exists.
      statements.push(this.db.prepare(`DELETE FROM custom_fields WHERE tenant_id=?1 AND dt=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM property_setters WHERE tenant_id=?1 AND doc_type=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM customization_revisions WHERE tenant_id=?1 AND doctype=?2`).bind(tenantId, doctype.name));
    }
    for (const fixture of manifest.fixtures) {
      statements.push(this.db.prepare(
        `DELETE FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3`,
      ).bind(tenantId, fixture.record_type, fixture.name));
    }
    // Custom Fields on doctypes the app does NOT own are removed BY NAME. The loop above
    // clears customisations of the app's own doctypes wholesale, which is right there and
    // wrong here: `DELETE ... WHERE dt='Item'` would take the customer's own fields on
    // Item with it, and those were never this app's to remove.
    // `?? []` because this manifest was read back from storage: an app installed before
    // custom fields existed has no such key, and iterating undefined would make it
    // impossible to uninstall exactly the apps that predate the feature.
    const uncustomised = new Set<string>();
    for (const field of manifest.custom_fields ?? []) {
      uncustomised.add(field.dt);
      statements.push(this.db.prepare(
        `DELETE FROM custom_fields WHERE tenant_id=?1 AND name=?2 AND dt=?3`,
      ).bind(tenantId, field.name, field.dt));
    }
    for (const doctype of uncustomised) {
      statements.push(this.db.prepare(
        `INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at) VALUES(?1,?2,1,?3)
         ON CONFLICT(tenant_id,doctype) DO UPDATE SET revision=revision+1, modified_at=excluded.modified_at`,
      ).bind(tenantId, doctype, now));
    }
    // Roles are left in place on purpose: users still hold grants for them, and
    // deleting a role would silently strip permissions that other apps may also rely on.
    statements.push(this.db.prepare(`DELETE FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`).bind(tenantId, appId));
    await this.db.batch(statements);

    return {
      app_id: appId,
      removed: {
        doctypes: manifest.doctypes.length,
        workflows: manifest.workflows.length,
        print_formats: manifest.print_formats.length,
        roles: 0,
        fixtures: manifest.fixtures.length,
      },
    };
  }

  private async assertDependencies(tenantId: string, manifest: AppManifest): Promise<void> {
    for (const dependency of manifest.requires) {
      const installed = await this.db.prepare(
        `SELECT version FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
      ).bind(tenantId, dependency.id).first<{ version: string }>();
      if (!installed) throw errors.validation(`${manifest.id} requires ${dependency.id} ${dependency.version}, which is not installed`);
      if (!satisfiesVersion(installed.version, dependency.version)) {
        throw errors.validation(`${manifest.id} requires ${dependency.id} ${dependency.version} or later; ${installed.version} is installed`);
      }
    }
  }

  /**
   * Refuses to claim an object another app already owns, or a DocType that exists
   * outside any app.
   *
   * The second case matters most: overwriting a definition the customer built by
   * hand would destroy their work, and the app would then own it, so uninstalling
   * the app would delete it too.
   */
  private async assertNoForeignOwnership(tenantId: string, manifest: AppManifest): Promise<void> {
    for (const [type, scope, name] of this.ownedObjects(manifest)) {
      const owner = await this.db.prepare(
        `SELECT app_id FROM app_objects WHERE tenant_id=?1 AND object_type=?2 AND object_scope=?3 AND object_name=?4`,
      ).bind(tenantId, type, scope, name).first<{ app_id: string }>();
      if (owner && owner.app_id !== manifest.id) {
        throw errors.validation(`${type} ${name} is already owned by app ${owner.app_id}`);
      }
      if (!owner && type === "DocType") {
        const unowned = await this.db.prepare(
          `SELECT 1 AS found FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2`,
        ).bind(tenantId, name).first<{ found: number }>();
        if (unowned) throw errors.validation(`DocType ${name} already exists and is not owned by an app`);
      }
    }
  }

  /**
   * Refuses custom routes another installed app already owns.
   *
   * DocType paths are protected by object ownership and system/catalog paths are
   * intentionally shared. Route and Experience paths are app-defined; silently keeping
   * the first would make the later app install successfully with an unreachable screen.
   */
  private async assertNoNavigationConflicts(tenantId: string, manifest: AppManifest): Promise<void> {
    const claimed = new Map<string, string>();
    for (const app of await this.list(tenantId)) {
      if (app.app_id === manifest.id) continue;
      for (const item of app.nav) {
        if (item.kind !== "route" && item.kind !== "experience") continue;
        const route = navItemPath(item);
        if (route) claimed.set(route, app.app_id);
      }
    }
    for (const item of manifest.nav) {
      if (item.kind !== "route" && item.kind !== "experience") continue;
      const route = navItemPath(item);
      const owner = route ? claimed.get(route) : undefined;
      if (route && owner) throw errors.validation(`Navigation route ${route} is already owned by app ${owner}`);
    }
  }

  private ownedObjects(manifest: AppManifest): Array<[ObjectType, string, string]> {
    const owned: Array<[ObjectType, string, string]> = [];
    for (const doctype of manifest.doctypes) owned.push(["DocType", "", doctype.name]);
    for (const workflow of manifest.workflows) owned.push(["Workflow", "", workflow.name]);
    for (const format of manifest.print_formats) owned.push(["Print Format", "", format.name]);
    for (const role of manifest.roles) owned.push(["Role", "", role.role]);
    for (const fixture of manifest.fixtures) owned.push(["Master Record", fixture.record_type, fixture.name]);
    // Scoped by the doctype it extends, so the conflict check reads as "two apps both
    // add a field to Item" rather than as an opaque name collision.
    for (const field of manifest.custom_fields) owned.push(["Custom Field", field.dt, field.name]);
    return owned;
  }
}

/** Combined navigation for the client, in install order. */
export function combinedNavigation(apps: InstalledAppRecord[]): JsonObject[] {
  const items: JsonObject[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    for (const item of app.nav) {
      // Two apps offering the same nav key would give the client two routes that
      // resolve to one path, and only the first would ever be reachable.
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      items.push({ ...item, app_id: app.app_id } as unknown as JsonObject);
    }
  }
  return items;
}
