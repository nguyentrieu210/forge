
export function randomId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function aggregateKey(tenantId: string, doctype: string, name: string): string {
  return `${tenantId}:${doctype}:${name}`;
}

export function documentKey(doctype: string, name: string): string {
  return `${doctype}:${name}`;
}
