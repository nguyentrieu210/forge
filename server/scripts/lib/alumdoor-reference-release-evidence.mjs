function text(value) {
  return String(value ?? "").trim();
}

const SHA40 = /^[0-9a-f]{40}$/i;
const BUNDLE16 = /^[0-9a-f]{16}$/i;

export function evaluateReferenceReleaseEvidence(input) {
  const marker = input?.releaseMarker ?? {};
  const sourceApp = input?.sourceApp ?? {};
  const liveManifest = input?.liveManifest ?? {};
  const expectedReleaseSha = text(input?.expectedReleaseSha);
  const expectedBundleHash = text(input?.expectedBundleHash);

  if (marker.ok !== true || marker.service !== "gateway-ui") {
    throw new Error("release.json không phải Gateway UI release marker hợp lệ.");
  }
  const releaseSha = text(marker.releaseSha);
  const bundleHash = text(marker.bundleHash);
  if (!SHA40.test(releaseSha)) throw new Error("release.json thiếu releaseSha Git SHA 40 ký tự hợp lệ.");
  if (!BUNDLE16.test(bundleHash)) throw new Error("release.json thiếu bundleHash 16 hex hợp lệ.");

  const sourceId = text(sourceApp.id);
  const sourceVersion = text(sourceApp.version);
  if (sourceId !== "alumdoor" || !sourceVersion) {
    throw new Error("Source package không xác định được alumdoor version hiện hành.");
  }

  const liveId = text(liveManifest.id);
  const liveVersion = text(liveManifest.version);
  if (liveId !== sourceId) throw new Error(`Live manifest app id ${liveId || "?"} không khớp source ${sourceId}.`);
  if (liveVersion !== sourceVersion) {
    throw new Error(`Live Alumdoor ${liveVersion || "?"} không khớp source ${sourceVersion}; từ chối dùng historical deployment làm evidence.`);
  }

  if (!expectedReleaseSha) throw new Error("Thiếu exact expected release SHA; live evidence phải được pin vào một source revision cụ thể.");
  if (!SHA40.test(expectedReleaseSha)) throw new Error("Expected release SHA phải là Git SHA 40 ký tự.");
  if (releaseSha.toLowerCase() !== expectedReleaseSha.toLowerCase()) {
    throw new Error(`Production release ${releaseSha} không khớp expected source ${expectedReleaseSha}.`);
  }

  if (expectedBundleHash) {
    if (!BUNDLE16.test(expectedBundleHash)) throw new Error("Expected bundle hash phải là 16 hex ký tự.");
    if (bundleHash.toLowerCase() !== expectedBundleHash.toLowerCase()) {
      throw new Error(`Production bundle ${bundleHash} không khớp expected ${expectedBundleHash}.`);
    }
  }

  return {
    release_sha: releaseSha,
    bundle_hash: bundleHash,
    app_id: sourceId,
    source_version: sourceVersion,
    live_version: liveVersion,
    expected_release_sha: expectedReleaseSha,
    expected_bundle_hash: expectedBundleHash || null,
    release_matches_source: true,
    bundle_matches_expected: expectedBundleHash ? true : null,
  };
}

export function warrantyLookupFilters(salesOrderName, deliveryNames = []) {
  const salesOrder = text(salesOrderName);
  if (!salesOrder) throw new Error("Thiếu Sales Order để tìm Warranty Claim.");
  const filters = [["sales_order", "=", salesOrder]];
  for (const deliveryName of new Set(deliveryNames.map(text).filter(Boolean))) {
    filters.push(["delivery_note", "=", deliveryName]);
  }
  return filters;
}
