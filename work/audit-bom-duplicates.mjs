const origin = 'http://127.0.0.1:8799';
const cookies = new Map();
let csrf = '';
function remember(response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const pair = value.split(';', 1)[0];
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}
function cookieHeader() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
async function request(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookieHeader() ? { cookie: cookieHeader() } : {}) };
  if (csrf && options.method && options.method !== 'GET') headers['x-frappe-csrf-token'] = csrf;
  const response = await fetch(`${origin}${path}`, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  remember(response);
  csrf = response.headers.get('x-frappe-csrf-token') ?? csrf;
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} ${response.status}: ${text}`);
  return body?.data ?? body?.message ?? body;
}
await request('/api/method/login', { method: 'POST', body: { usr: 'dev@example.com', pwd: 'local-dev-password-1' } });
const all = [];
for (let start = 0; ; start += 100) {
  const fields = encodeURIComponent(JSON.stringify(['name','item','company','quantity','docstatus','status','note','bom_fingerprint','modified','creation']));
  const rows = await request(`/api/resource/Bill%20of%20Materials?fields=${fields}&limit_page_length=100&limit_start=${start}`);
  if (!Array.isArray(rows) || rows.length === 0) break;
  all.push(...rows);
  if (rows.length < 100) break;
}
const groups = new Map();
for (const row of all) {
  const key = `${row.company ?? ''}||${row.item ?? ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const byItem = new Map();
for (const row of all) {
  if (!byItem.has(row.item)) byItem.set(row.item, []);
  byItem.get(row.item).push(row);
}
const duplicates = [...byItem.values()].filter(rows => rows.length > 1).sort((a,b) => a[0].item.localeCompare(b[0].item));
const detailed = [];
for (const rows of duplicates) {
  const entries = [];
  for (const row of rows) {
    const doc = await request(`/api/resource/Bill%20of%20Materials/${encodeURIComponent(row.name)}`);
    entries.push({
      name: doc.name,
      item: doc.item,
      company: doc.company,
      bom_status: doc.bom_status,
      status: doc.status,
      docstatus: doc.docstatus,
      quantity: doc.quantity,
      child_count: Array.isArray(doc.items) ? doc.items.length : null,
      fingerprint: doc.bom_fingerprint ?? null,
      note: doc.note ?? null,
      creation: doc.creation ?? null,
      modified: doc.modified ?? null,
      items: Array.isArray(doc.items) ? doc.items.map(line => ({ item_code: line.item_code, qty: line.qty, uom: line.uom })) : null,
    });
  }
  detailed.push(entries);
}
const noncanonical = all.filter(row => !String(row.note ?? '').startsWith('Alumdoor canonical '));
console.log(JSON.stringify({ total: all.length, duplicate_groups: detailed.length, noncanonical, duplicates: detailed }, null, 2));
