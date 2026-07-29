/**
 * The generated wrangler config for a tenant Worker.
 *
 * Shared rather than duplicated because a tenant that drifts from this shape fails in
 * ways that do not look like configuration: a wrong `database_id` accepts another
 * tenant's passwords on this tenant's hostname, and a missing queue producer leaves an
 * outbox that never drains. Both have happened.
 *
 * A GENERATED file, never a checked-in one: one committed config per tenant does not
 * survive past a handful and rots the moment the template changes.
 */
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { serverRoot } from "./wrangler-cli.mjs";

export function tenantScriptName(tenant) {
  return `cloudforge-tenant-${tenant}`;
}

/**
 * Writes the config and returns its path plus the server-relative path wrangler wants.
 *
 * Deliberately NO `triggers.crons`: a Worker inside a dispatch namespace never runs its
 * own cron, so a schedule here is a schedule that silently never fires. The jobs Worker
 * drives every tenant's maintenance instead.
 */
export function writeTenantConfig({ tenant, databaseId, databaseName = `cloudforge-${tenant}`, publicOrigin }) {
  const configPath = path.join(serverRoot, "apps", "tenant-worker", `wrangler.${tenant}.generated.jsonc`);
  writeFileSync(configPath, `${JSON.stringify({
    $schema: "node_modules/wrangler/config-schema.json",
    name: tenantScriptName(tenant),
    main: "src/index.ts",
    compatibility_date: "2026-07-23",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      TENANT_ID: tenant,
      AUTH_MODE: "production",
      /**
       * Where an app Worker calls BACK into the platform.
       *
       * Without it the platform sends no `x-cloudforge-callback`, so an app validator
       * cannot read anything — and a validator that cannot read must refuse, which turns
       * every write into a failure. Derived from the tenant's registered route rather
       * than guessed from its id: the two need not match, and a wrong origin fails in a
       * way that looks like the app is broken.
       */
      ...(publicOrigin ? { PUBLIC_ORIGIN: publicOrigin } : {}),
    },
    d1_databases: [{ binding: "DB", database_name: databaseName, database_id: databaseId, migrations_dir: "../../migrations/tenant" }],
    /**
     * Attachments and product photographs.
     *
     * ONE bucket for every tenant, with the tenant id as the first key segment: a bucket
     * per customer would make provisioning fail on an account bucket limit long before
     * anything about that customer's data was a problem. Reads stay scoped by the `files`
     * table, which is per tenant.
     *
     * Declared HERE as well as in the checked-in template, and the duplication is the
     * point of this comment: the template is what a developer runs locally, this is what
     * every provisioned customer gets. When the binding existed only in the template, a
     * real tenant came up without it and `upload_file` answered "File storage is not
     * configured" — a failure that appears only after a customer tries to add a photo.
     */
    r2_buckets: [{ binding: "FILES", bucket_name: "cloudforge-files" }],
    durable_objects: { bindings: [{ name: "AGGREGATES", class_name: "AggregateCoordinator" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["AggregateCoordinator"] }],
    queues: { producers: [{ binding: "OUTBOX_QUEUE", queue: "cloudforge-outbox" }] },
    services: [{ binding: "SOCIAL_INGRESS", service: "cloudforge-social-ingress" }],
    /**
     * Cho tenant gọi được Worker RIÊNG của app (validator, app method, hook).
     *
     * Thiếu binding này thì mọi ghi lên doctype có validator đều trả "App validators are
     * declared but this deployment cannot reach app Workers" — nền tảng fail-closed đúng,
     * nhưng app thì không dùng được. Đây là mắt xích khiến đường app-Worker chưa từng
     * chạy thật trên deployment nào.
     */
    dispatch_namespaces: [{ binding: "DISPATCHER", namespace: "cloudforge-production", remote: true }],
    /**
     * Workers AI — trợ lý đọc chứng từ và trả lời câu hỏi về dữ liệu của chính tenant.
     *
     * Chọn Workers AI chứ không phải một nhà cung cấp ngoài vì nó chạy trên CÙNG tài khoản
     * Cloudflare đang chạy tenant: không thêm khoá bí mật nào phải phát cho từng tenant, và
     * ảnh phiếu giao không rời khỏi ranh giới tài khoản. Một khoá API ngoài sẽ phải nằm
     * trong secret của TỪNG tenant, và lộ một cái là lộ hạn mức của tất cả.
     */
    ai: { binding: "AI" },
  }, null, 2)}\n`, "utf8");
  return { configPath, relativeConfig: path.relative(serverRoot, configPath) };
}

/** Derivable at any time and pins an account-specific id, so it is not left behind. */
export function removeTenantConfig(configPath) {
  try { unlinkSync(configPath); } catch { /* already gone */ }
}

/** Looks up a tenant's D1 id by convention (`cloudforge-<tenant>`), so callers need not pass it. */
export function findTenantDatabaseId(tenant, wrangler) {
  const databases = JSON.parse(wrangler(["d1", "list", "--json"]));
  const match = databases.find((entry) => entry.name === `cloudforge-${tenant}`);
  return match?.uuid ?? null;
}

/**
 * The public origin a tenant is reached at, from the routing table.
 *
 * Scans the ROUTES KV for the hostname pointing at this tenant. Returns null when the
 * tenant has no route yet — a freshly provisioned tenant is reachable by nothing, and
 * inventing a URL would put a callback address into its Worker that answers 404.
 */
export function findTenantOrigin(tenant, wrangler, namespaceId = "b4607d01c54042dcbc3d6cb3e1ad2da4") {
  let keys;
  try {
    keys = JSON.parse(wrangler(["kv", "key", "list", "--namespace-id", namespaceId, "--remote"]));
  } catch {
    return null;
  }
  for (const entry of keys) {
    // `__tenant__:<id>` is the reverse index, not a hostname.
    if (!entry.name || entry.name.startsWith("__tenant__:")) continue;
    try {
      const route = JSON.parse(wrangler(["kv", "key", "get", entry.name, "--namespace-id", namespaceId, "--remote"]));
      if (route.tenant_id === tenant) return `https://${entry.name}`;
    } catch { /* unreadable entry contributes nothing */ }
  }
  return null;
}
