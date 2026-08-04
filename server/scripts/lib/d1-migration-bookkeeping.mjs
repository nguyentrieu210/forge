const TRACKING_TABLE_EXISTS_SQL = `SELECT COUNT(*) AS total FROM sqlite_schema
WHERE type='table' AND name='d1_migrations'`;

const CREATE_TRACKING_TABLE_SQL = `CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const READ_APPLIED_SQL = "SELECT name FROM d1_migrations ORDER BY id";

/**
 * Reads remote migration bookkeeping without violating dry-run semantics.
 *
 * A dry-run is strictly read-only: if the tracking table does not exist, it is
 * treated as an empty applied set and no CREATE statement is issued. Live apply
 * may create the compatible Wrangler bookkeeping table before reading it.
 */
export function readAppliedMigrationNames({ database, dryRun, query }) {
  const rows = query(database, TRACKING_TABLE_EXISTS_SQL);
  const trackingTablePresent = Number(rows?.[0]?.total ?? 0) > 0;

  if (!trackingTablePresent && dryRun) {
    return { names: [], trackingTablePresent: false, trackingTableCreated: false };
  }

  let trackingTableCreated = false;
  if (!trackingTablePresent) {
    query(database, CREATE_TRACKING_TABLE_SQL);
    trackingTableCreated = true;
  }

  const applied = query(database, READ_APPLIED_SQL);
  return {
    names: applied.map((row) => String(row.name)),
    trackingTablePresent: trackingTablePresent || trackingTableCreated,
    trackingTableCreated,
  };
}

export const migrationBookkeepingSql = Object.freeze({
  trackingTableExists: TRACKING_TABLE_EXISTS_SQL,
  createTrackingTable: CREATE_TRACKING_TABLE_SQL,
  readApplied: READ_APPLIED_SQL,
});
