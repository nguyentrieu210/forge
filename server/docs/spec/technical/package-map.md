# Monorepo Package Map

```text
apps/
  control-plane-worker/
  gateway-worker/
  meta-worker/
  document-worker/
  query-worker/
  jobs-worker/
  metaforge-demo/
packages/
  contracts meta policy document query workflow ledger audit outbox files realtime
  cloudflare-adapters test-harness parity-scanner migration-kit
  clouderp/{accounts,selling,buying,stock,manufacturing,assets,projects,quality,support,pos,regional}
  cloudhr/{core,recruitment,leave,attendance,shift,payroll,expenses,performance,training}
  cloudcrm/{core,pipeline,activities,automation,integrations,analytics}
  cloudinsights/{sources,query,python,charts,dashboards,sharing,scheduler,lineage}
  metaforge/{core,renderer,controls,builders,cloudforge-adapter}
tools/
  source-scanner fixture-converter oracle-runner benchmark migration-cli
```
