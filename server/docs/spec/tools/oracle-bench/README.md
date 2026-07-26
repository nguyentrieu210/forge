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
- **Not executed in the CloudForge dev environment** (no Docker engine — the engine
  service needs an elevation this non-interactive shell does not have; see
  `../../source-exact/GATE2E_ORACLE_STATUS.md`). Authored so the runtime gate is a
  single command away once an engine is available.
