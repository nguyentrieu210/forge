export function assertProbeTarget(base, { allowRemote = false, confirmHost } = {}) {
  const url = new URL(base);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("probe base must be http(s)");
  const local = new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname);
  if (!local) {
    if (!allowRemote) throw new Error("remote probe requires --allow-remote");
    if (confirmHost !== url.hostname) throw new Error(`remote probe requires --confirm-host ${url.hostname}`);
  }
  return { base: url.origin, host: url.hostname, remote: !local };
}

export function evaluateHealthSnapshot({
  healthStatus,
  healthBody,
  rootStatus,
  guestBootStatus,
  releaseStatus,
  releaseBody,
  expectedReleaseSha,
}) {
  const failures = [];
  if (healthStatus !== 200 || healthBody?.ok !== true) failures.push("health_not_ready");
  if (rootStatus !== 200) failures.push("root_not_served");
  if (guestBootStatus !== 403) failures.push("guest_boot_boundary_changed");
  if (releaseStatus !== 200 || releaseBody?.ok !== true) failures.push("release_marker_missing");
  if (releaseStatus === 200 && (typeof releaseBody?.bundleHash !== "string" || releaseBody.bundleHash.length < 8)) {
    failures.push("release_bundle_hash_missing");
  }
  if (expectedReleaseSha && releaseBody?.releaseSha !== expectedReleaseSha) failures.push("release_sha_mismatch");
  return {
    ok: failures.length === 0,
    failures,
    release_sha: typeof releaseBody?.releaseSha === "string" ? releaseBody.releaseSha : null,
    bundle_hash: typeof releaseBody?.bundleHash === "string" ? releaseBody.bundleHash : null,
  };
}
