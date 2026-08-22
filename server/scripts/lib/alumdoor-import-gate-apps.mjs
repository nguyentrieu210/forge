import { createHash } from "node:crypto";

/**
 * Compare reproducibly compiled local app packages with the exact manifests held by D1.
 *
 * Version equality is deliberately insufficient: a package can change without a version
 * bump, and a newer platform parser can produce a different runtime manifest from the same
 * package. The gate therefore requires package hash, version and parsed manifest to agree.
 */
export function evaluateSourceAppPackages({ candidates, installedRows, parseManifest }) {
  const installedById = new Map((installedRows ?? []).map((row) => [String(row.app_id), row]));
  const packages = (candidates ?? []).map((candidate) => {
    const expectedId = String(candidate.expected_id ?? "").trim();
    const file = String(candidate.file ?? "");
    const reasons = [];
    if (candidate.package_value == null) {
      return { app_id: expectedId, file, exact: false, reasons: ["compiled source package is missing or invalid JSON"] };
    }

    let manifest;
    try {
      manifest = parseManifest(candidate.package_value);
    } catch (error) {
      return { app_id: expectedId, file, exact: false, reasons: [`compiled source package is invalid: ${error?.message ?? error}`] };
    }

    const appId = String(manifest?.id ?? "").trim();
    const installed = installedById.get(expectedId);
    const contentHash = createHash("sha256").update(stableStringify(candidate.package_value)).digest("hex");
    const parsedManifestJson = JSON.stringify(manifest);
    if (appId !== expectedId) reasons.push(`package id ${appId || "<empty>"} does not match expected ${expectedId}`);
    if (!installed) reasons.push("app is not installed in the audited tenant");
    if (installed && String(manifest.version) !== String(installed.version)) reasons.push(`source version ${manifest.version} differs from installed ${installed.version}`);
    if (installed && contentHash !== String(installed.content_hash).toLowerCase()) reasons.push("source package content hash differs from installed package");
    if (installed && parsedManifestJson !== String(installed.manifest_json)) reasons.push("current parser manifest differs from stored runtime manifest");

    return {
      app_id: expectedId,
      file,
      source_version: String(manifest.version ?? ""),
      installed_version: installed ? String(installed.version) : null,
      source_content_hash: contentHash,
      installed_content_hash: installed ? String(installed.content_hash) : null,
      package_hash_match: Boolean(installed) && contentHash === String(installed.content_hash).toLowerCase(),
      manifest_match: Boolean(installed) && parsedManifestJson === String(installed.manifest_json),
      exact: reasons.length === 0,
      reasons,
    };
  });

  return { packages, stale_count: packages.filter((entry) => !entry.exact).length };
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) result[key] = sortValue(child);
    }
    return result;
  }
  return String(value);
}
