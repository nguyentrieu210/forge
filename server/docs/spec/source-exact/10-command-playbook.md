# Command Playbook

## Fetch and scan both pinned apps

```bash
python3 docs/spec/tools/run_source_exact_pipeline.py \
  --project-root . \
  --sources-dir ../upstream \
  --apps frappe,erpnext \
  --fetch
```

Set `GITHUB_TOKEN` only when required for rate limits. Public repositories do not require a token for basic access.

## Scan already available checkouts

```bash
python3 docs/spec/tools/run_source_exact_pipeline.py \
  --project-root . \
  --sources-dir ../upstream \
  --apps frappe,erpnext
```

Expected paths:

```text
../upstream/frappe-v16.19.0
../upstream/erpnext-v16.20.0
```

## Verify

```bash
python3 docs/spec/tools/verify_source_exact.py \
  --project-root . \
  --apps frappe,erpnext
```

## Parser regression test

```bash
python3 tests/test_source_exact_parser.py -v
```

## Individual scan

```bash
python3 docs/spec/tools/source_exact_parser.py \
  --app erpnext \
  --root ../upstream/erpnext-v16.20.0 \
  --commit ff46d20b259a2d65a7ded959df9f9a42991a3562 \
  --tag v16.20.0 \
  --license GPL-3.0 \
  --out docs/spec/source-exact/generated/erpnext-v16.20.0
```

## CI recommendation

Run acquisition only in a controlled source-refresh job. Normal CI should use an immutable cached checkout or verified artifact, regenerate outputs, compare tree fingerprints and fail on uncommitted generated diffs.

## Export effective runtime metadata

From a Bench whose apps are pinned to the locked commits:

```bash
./env/bin/python /path/to/CloudForge/docs/spec/tools/frappe_runtime_export.py \
  --site oracle.local \
  --sites-path ./sites \
  --out /tmp/frappe-erpnext-runtime-v16.json
```

For a narrow validation pass, repeat `--doctype`:

```bash
./env/bin/python /path/to/frappe_runtime_export.py \
  --site oracle.local --sites-path ./sites \
  --doctype "Sales Order" \
  --doctype "Sales Invoice" \
  --out /tmp/o2c-runtime.json
```

The exporter reads metadata/configuration only and redacts known secret keys. Run it against a disposable oracle site, not an uncontrolled production database.
