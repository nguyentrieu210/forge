#!/usr/bin/env python3
import json
import os
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKSUM = "a" * 64
ENABLED_AT = "2026-07-31T09:30:00.000Z"
PLAN = {
    "tenant_id": "schema-test",
    "checksum": CHECKSUM,
    "generated_at": "2026-07-31T09:00:00.000Z",
    "queues": [
        {
            "queue_key": "q" * 64,
            "company": "Alumdoor",
            "supplier": "FACTORY-1",
            "material_match_key": "m" * 64,
            "material_schema_version": 1,
            "material_snapshot": {"item_code": "AL71"},
            "created_at": "2026-07-31T09:00:00.000Z",
            "modified_at": "2026-07-31T09:00:00.000Z",
        }
    ],
    "windows": [
        {
            "window_id": "WINDOW-1",
            "queue_key": "q" * 64,
            "window_sequence": 1,
            "tolerance_bps": 500,
            "opened_at": "2026-07-31T09:00:00.000Z",
        }
    ],
    "obligations": [],
    "allocations": [],
    "unapplied": [],
}


def render_sql():
    source = """
import { renderActivationSql, renderBackfillSql } from './scripts/backfill-purchase-receipt-allocations.mjs';
const plan = JSON.parse(process.env.PURCHASE_BACKFILL_PLAN);
process.stdout.write(JSON.stringify({
  backfill: renderBackfillSql(plan, 'schema-test-operator'),
  activation: renderActivationSql(
    plan.tenant_id,
    'schema-test-operator',
    plan.checksum,
    process.env.PURCHASE_ENABLED_AT,
  ),
}));
"""
    env = dict(os.environ)
    env["PURCHASE_BACKFILL_PLAN"] = json.dumps(PLAN)
    env["PURCHASE_ENABLED_AT"] = ENABLED_AT
    result = subprocess.run(
        ["node", "--input-type=module", "-e", source],
        cwd=ROOT,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def main():
    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys=ON")
    for migration in (
        "0027_purchase_receipt_allocation.sql",
        "0029_purchase_allocation_rollout.sql",
        "0030_purchase_unapplied_weight_attribution.sql",
    ):
        connection.executescript(
            (ROOT / "migrations" / "tenant" / migration).read_text(encoding="utf-8")
        )

    rendered = render_sql()
    connection.executescript(rendered["backfill"])
    before = connection.execute(
        "SELECT enabled,backfill_checksum,unresolved_count,enabled_by,enabled_at "
        "FROM purchase_allocation_rollout_state WHERE tenant_id=?",
        (PLAN["tenant_id"],),
    ).fetchone()
    assert before == (0, CHECKSUM, 0, None, None), before

    connection.executescript(rendered["activation"])
    after = connection.execute(
        "SELECT enabled,backfill_checksum,unresolved_count,enabled_by,enabled_at "
        "FROM purchase_allocation_rollout_state WHERE tenant_id=?",
        (PLAN["tenant_id"],),
    ).fetchone()
    assert after == (1, CHECKSUM, 0, "schema-test-operator", ENABLED_AT), after
    print("purchase allocation backfill SQL schema integration: PASS")


if __name__ == "__main__":
    main()
