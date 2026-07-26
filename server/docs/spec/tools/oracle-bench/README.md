# Oracle bench provisioner (Gate 2E S4/S5)

Provisions a **disposable, commit-pinned** Frappe/ERPNext bench so the runtime
oracle stages can run. Requires a host with a **working Docker engine**.

```bash
bash docs/spec/tools/oracle-bench/provision_oracle_bench.sh
# on success:
CLOUDFORGE_ORACLE_SITE=oracle.localhost npm run oracle:o2c:bench
```

- Pins Frappe `v16.19.0` and ERPNext `v16.20.0` and **fails closed** unless the
  installed git HEADs equal the SHAs in `source-lock.json`.
- Synthetic credentials + data only; nothing here is production.
## EXECUTED — 2026-07-27, on a remote Docker host

The capture in `../../source-exact/oracle/runtime/` is no longer inherited: it was
reproduced from scratch on a bench provisioned for the purpose. What was learned, so the
next person does not repeat the search:

**The image build is unnecessary.** The official `frappe/erpnext:v16.20.0` on Docker Hub
already contains exactly frappe 16.19.0 + erpnext 16.20.0 — the locked pair. Building
the layered image from source takes tens of minutes and a lot of RAM; pulling this one
takes a moment.

**But the fail-closed check has to change with it.** The official image ships the apps
WITHOUT `.git`, so `git rev-parse HEAD` cannot verify anything there. Verify by CONTENT
instead, which is a stronger claim than a commit id anyway: hash the O2C controllers
inside the image and compare against the pinned tree in `../../../../upstream`, whose
own hashes `npm run source:verify` already checks.

    sales_order.py · delivery_note.py · sales_invoice.py · payment_entry.py
    frappe/model/document.py                         → all five matched byte for byte

**Five raw files, not one.** `build_matrix_oracle.py` folds `matrix-raw.json`,
`adv-raw.json`, `val-raw.json`, `rpst-raw.json` and `bs-raw.json` — 71 + 15 + 11 + 6 + 12
= 115 fixtures. Running only the matrix runner produces a capture that looks complete
(`ORACLE_OK`, same headline claim) while silently dropping 44 real fixtures. Run all five.

**On a shared host, publish no ports.** The runners are driven by `docker exec`, never
over the network, so the compose needs no `ports:` at all — and on a box that also serves
production, binding 8000 is how you take something else down.

**Reproduction result:** 115/115 captured, 0 handler failures, and **112 of 115 fixtures
byte-identical** to the previously committed capture. The three that differ do so only in
the wall-clock timestamp the fixture itself embeds — the business values are identical.
The inherited capture was genuine.
