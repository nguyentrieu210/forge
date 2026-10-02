-- R7 / FRAPPE-11: durable replay log for Frappe-shaped realtime events.
--
-- Each tenant normally has its own D1 database; tenant_id remains explicit because every
-- Forge authority is tenant-scoped and local/workerd fixtures can share one database.
-- sequence is monotonic and is the reconnect watermark. Events are persisted BEFORE live
-- fan-out so a sleeping/restarting RealtimeHub cannot create an unrecoverable gap.
CREATE TABLE IF NOT EXISTS realtime_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (length(trim(event)) BETWEEN 1 AND 160),
  room TEXT NOT NULL CHECK (length(trim(room)) BETWEEN 1 AND 320),
  message_json TEXT NOT NULL CHECK (json_valid(message_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_tenant_sequence
  ON realtime_events(tenant_id, sequence);

CREATE INDEX IF NOT EXISTS idx_realtime_events_tenant_room_sequence
  ON realtime_events(tenant_id, room, sequence);
