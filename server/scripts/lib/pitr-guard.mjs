export function assertPitrRequest({
  tenant,
  timestamp,
  bookmark,
  execute = false,
  confirm,
  reason,
  backupDir,
  nowMs = Date.now(),
}) {
  if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) throw new Error("--tenant <id> is required");
  if (Boolean(timestamp) === Boolean(bookmark)) throw new Error("provide exactly one of --timestamp or --bookmark");
  if (timestamp) assertPastTimestamp(timestamp, nowMs);
  if (bookmark && !/^[0-9A-Za-z-]{16,256}$/.test(bookmark)) {
    throw new Error("--bookmark has an unsafe or implausible format");
  }
  if (execute && confirm !== tenant) throw new Error(`refusing destructive PITR: add --confirm ${tenant}`);
  if (execute && !String(reason ?? "").trim()) throw new Error("refusing destructive PITR without --reason <text>");
  if (execute && !String(backupDir ?? "").trim()) {
    throw new Error("refusing destructive PITR without --backup-dir <secure directory>");
  }
  return { tenant, timestamp: timestamp ?? null, bookmark: bookmark ?? null, execute };
}

export function assertPastTimestamp(value, nowMs = Date.now()) {
  if (/^\d{10,13}$/.test(value)) {
    const numeric = Number(value);
    const millis = value.length === 13 ? numeric : numeric * 1000;
    if (!Number.isFinite(millis) || millis <= 0 || millis > nowMs) {
      throw new Error("--timestamp must be a past Unix timestamp");
    }
    return millis;
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error("RFC3339 --timestamp must include an explicit timezone (Z or +/-HH:MM)");
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > nowMs) {
    throw new Error("--timestamp must be a valid past RFC3339 timestamp");
  }
  return millis;
}

export function findString(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, key);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (typeof value[key] === "string") return value[key];
  for (const item of Object.values(value)) {
    const found = findString(item, key);
    if (found) return found;
  }
  return null;
}

export function requireBookmark(value, label) {
  const found = findString(value, "bookmark");
  if (!found) throw new Error(`${label} Time Travel response has no bookmark`);
  return found;
}
