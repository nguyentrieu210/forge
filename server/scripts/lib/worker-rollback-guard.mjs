export const REGULAR_ROLLBACK_WORKERS = Object.freeze([
  "cloudforge-gateway",
  "cloudforge-jobs",
  "cloudforge-control-plane",
  "cloudforge-social-ingress",
  "cloudforge-query-demo",
]);

const allowed = new Set(REGULAR_ROLLBACK_WORKERS);

export function assertWorkerRollbackRequest({ worker, versionId, execute = false, confirm, reason }) {
  if (!worker || !allowed.has(worker)) {
    throw new Error(`--worker must be one of: ${REGULAR_ROLLBACK_WORKERS.join(", ")}`);
  }
  if (!versionId || !/^[0-9a-f-]{16,64}$/i.test(versionId)) {
    throw new Error("--version <exact Worker version id> is required");
  }
  if (execute && confirm !== worker) throw new Error(`refusing rollback: add --confirm ${worker}`);
  if (execute && !String(reason ?? "").trim()) throw new Error("refusing rollback without --reason <text>");
  return { worker, versionId, execute };
}

export function containsString(value, needle) {
  if (typeof value === "string") return value === needle || value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => containsString(item, needle));
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((item) => containsString(item, needle));
}
