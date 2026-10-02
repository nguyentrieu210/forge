# R7-A Completion Record

## Current decision

`R7-A FRAPPE_PLATFORM_CLOSED`.

The machine matrix has **0 GAP / 0 UNRESOLVED** across the pinned 28-domain Frappe v16.19.0 denominator. Implementation/certification head `ce64f77f8c2a1991a6d88ced76592d44aecd23d5` passed GitHub Actions R7 run `36984495200`, including the executable `r7:frappe:certify` gate, changed-authority TypeScript guard, runtime safety regression and Workerd facade regression.

## Exact identity

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`.
- Pull request: `#994`, branch `codex/r7-frappe-platform-closure`.
- Frappe: `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`.
- Denominator: 28 domains from `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.

## Certified matrix

| Classification | Count |
|---|---:|
| UNRESOLVED | 0 |
| GAP | 0 |
| INTENTIONAL_DIFFERENCE | 15 |
| OUT_OF_SCOPE | 1 |
| SEMANTIC_PARITY | 12 |
| EXACT_PARITY | 0 |
| FORGE_SUPERSET | 0 |
| **Total** | **28** |

## Final convergence

- **FRAPPE-19 Migrations and patches:** pinned Frappe transaction behavior reviewed. Forge deliberately reserves exact SQL bytes/SHA256 before Wrangler transport, blocks automatic replay of uncertain outcomes, and requires immutable evidence-bound reconciliation. No provider transaction/rollback proof is fabricated.
- **FRAPPE-23 Website and portal:** pinned routing/Web Form/Portal Settings source reviewed. Forge keeps bounded published website data and owner-scoped portal reads/updates; arbitrary Python/Jinja/dynamic routes are not extension surfaces, and portal delete/single-entry races remain explicit 501 until canonical kernel primitives exist.
- **FRAPPE-26 Integrations:** backend/service-principal OAuth client-credentials is implemented with encrypted cache + CAS lease. Pinned Frappe dynamic webhook behavior is explicitly rejected in Forge subscriptions; trusted static mapping/HTTPS host policy/durable delivery is the intentional replacement contract.

## Certification gates

From `server/`:

```bash
npm run test:r7-frappe
npm run r7:frappe:audit
npm run r7:frappe:audit-complete
npm run r7:frappe:certify
npm run test:r7-runtime
```

The certifier also rejects a closed row that retains stale non-empty `gaps`, so a cosmetic classification flip cannot hide unresolved text. Run `36984495200` passed this gate on the exact implementation head before this documentation-only closure record.

## Boundary

This is source/runtime closure evidence only. It does **not** authorize production deploys, production migrations, provider mutation or customer-data mutation. Those still require the existing release/runbook authorization and exact environment evidence.
