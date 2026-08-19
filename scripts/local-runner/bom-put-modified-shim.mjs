const originalFetch = globalThis.fetch;
if (typeof originalFetch !== 'function') throw new Error('BOM PUT shim requires global fetch');

// The Frappe-compatible facade requires PUT callers to echo the latest `modified`
// token. BOM Rule reconciliation updates Item conversions, reusable BOM Rules,
// BOM Templates and Draft BOMs, so all of those local-authority writes need the
// same optimistic-concurrency refresh that the canonical BOM importer already uses.
const MODIFIED_AWARE_RESOURCE = /\/api\/resource\/(?:Item|BOM(?:%20| )Rule|BOM(?:%20| )Template|Bill(?:%20| )of(?:%20| )Materials)\/[^/?#]+$/i;

function methodOf(input, init) {
  return String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function urlOf(input) {
  return input instanceof Request ? input.url : String(input);
}

function bodyOf(input, init) {
  if (init?.body !== undefined) return init.body;
  return null;
}

async function parseJsonBody(body) {
  if (body == null) return null;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  return null;
}

function responseData(body) {
  return body?.data ?? body?.message ?? body;
}

globalThis.fetch = async function bomModifiedAwareFetch(input, init = {}) {
  const url = urlOf(input);
  if (methodOf(input, init) !== 'PUT' || !MODIFIED_AWARE_RESOURCE.test(url)) {
    return originalFetch(input, init);
  }

  const payload = await parseJsonBody(bodyOf(input, init));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return originalFetch(input, init);
  }

  // Refresh the token immediately before the write instead of weakening or
  // bypassing optimistic concurrency. If another writer races this PUT, retry
  // with a newly fetched token up to three times.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const getResponse = await originalFetch(url, {
      method: 'GET',
      headers: init.headers,
      redirect: init.redirect,
      signal: init.signal,
    });
    if (!getResponse.ok) return originalFetch(input, init);
    let currentBody = null;
    try { currentBody = await getResponse.json(); } catch { return originalFetch(input, init); }
    const modified = String(responseData(currentBody)?.modified ?? '').trim();
    if (!modified) return originalFetch(input, init);

    const nextPayload = { ...payload, modified };
    const response = await originalFetch(url, {
      ...init,
      method: 'PUT',
      body: JSON.stringify(nextPayload),
    });
    if (response.ok) return response;

    const clone = response.clone();
    const text = await clone.text();
    const mismatch = [409, 417].includes(response.status)
      && /TimestampMismatchError|VERSION_CONFLICT|document changed after it was loaded/i.test(text);
    if (!mismatch || attempt === 3) return response;
    console.log(`ALUMDOOR_BOM_PUT_RETRY attempt=${attempt} reason=timestamp_mismatch url=${url}`);
  }

  return originalFetch(input, init);
};
