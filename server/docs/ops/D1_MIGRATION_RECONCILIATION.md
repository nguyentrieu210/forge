# D1 migration identity and reconciliation

The remote runner hashes the exact SQL bytes sent to Wrangler and reserves an immutable
content identity before execution. Successful receipt verification changes the journal
from reserved to applied. A process crash or lost provider response leaves an uncertain
reservation; the runner refuses automatic replay.

Existing name-only d1_migrations records require explicit evidence-backed adoption.
The tool never assumes that today's SQL file matches historical execution.

## Operator procedure

1. Identify the exact database, committed source and historical SQL content.
2. Collect independent provider receipt, backup comparison, or schema **and data**
   verification evidence for every migration. For a not-applied decision, verify that
   all statements have no residual partial effects before authorizing another attempt.
3. Create an approval artifact outside the worktree. Its source_sha must equal the
   exact clean checkout. Each evidence reference carries its own SHA256 digest.
4. Run the read-only plan:

   ```bash
   node scripts/d1-reconcile-migrations.mjs --config <config.jsonc> --approval <approval.json>
   ```

5. A separately authorized operator may record the evidence:

   ```bash
   node scripts/d1-reconcile-migrations.mjs --config <config.jsonc> --approval <approval.json> --execute --confirm <database-id>
   ```

Reconciliation changes bookkeeping only; it never executes migration SQL. A
verified_not_applied decision can be consumed once by the ordinary guarded migration
runner. Consumption records a unique attempt identifier before sending SQL. If that
attempt becomes uncertain, the next approval must reference its identifier; the old
approval cannot authorize another replay.

Example artifact:

```json
{
  "schema_version": 1,
  "source_sha": "<40-character exact checkout SHA>",
  "database_id": "<exact D1 database id>",
  "database_name": "<exact D1 database name>",
  "approved_by": "<authorized operator>",
  "approved_at": "2026-10-02T07:00:00Z",
  "approval_ref": "<recorded change approval>",
  "reason": "<reason for reconciliation>",
  "entries": [
    {
      "decision_id": "<unique immutable decision id>",
      "name": "0001_example.sql",
      "content_sha256": "<SHA256 of exact historical SQL bytes>",
      "prior_attempt": "legacy",
      "outcome": "verified_applied",
      "evidence": [
        {
          "kind": "provider_receipt",
          "reference": "<historical evidence artifact reference>",
          "sha256": "<SHA256 of evidence artifact>"
        }
      ]
    }
  ]
}
```

Allowed evidence kinds: provider_receipt, backup_diff, schema_and_data_verification.
Legacy adoption requires prior_attempt=legacy and verified_applied. Initial uncertain
execution requires prior_attempt=initial. A recovery attempt requires the consumed_by
identifier from the latest reconciliation record. verified_not_applied additionally
requires no_partial_effects=true and is rejected when durable applied bookkeeping
already exists.

Approval artifacts are explicit operator attestations. The tool validates identities,
digests, required evidence fields and durable state consistency; it does not independently
fetch external evidence or authenticate approval-reference systems. Operators must verify
the evidence and hold separate production authorization before invoking --execute.

## Evidence boundary

Local Node/SQLite tests prove content checks, immutable evidence, unique retry claiming,
concurrent stale-attempt rejection, legacy adoption and lost-response recovery. They do
not prove a production provider rollback or real historical database state.

Cloudflare documents transactional rollback for D1 binding batch():
https://developers.cloudflare.com/d1/worker-api/d1-database/

The current runner uses Wrangler remote file import and separate receipt calls.
It deliberately does not infer the binding batch guarantee for this transport.
Unknown outcomes require reconciliation; Workers-for-Platforms rollback evidence remains
an independent FRAPPE-19 gap.
