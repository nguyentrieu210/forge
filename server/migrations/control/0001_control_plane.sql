
CREATE TABLE IF NOT EXISTS tenant_routes (
  route_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','suspended','provisioning')),
  plan TEXT NOT NULL,
  routing_version INTEGER NOT NULL,
  modified_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_routes_tenant ON tenant_routes(tenant_id);
