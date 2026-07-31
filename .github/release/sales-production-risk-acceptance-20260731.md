# Sales production release risk acceptance

- PR: #25
- Feature: multi-UOM pricing and stock availability
- Decision date: 2026-07-31
- Decision: merge and deploy approved by repository owner despite missing browser smoke on a dedicated staging tenant.
- Verified before merge: Sales Feature CI, PR Validation, UI Pull Request Validation on exact PR head `96a8fcf9d9d700e5c8720a19762c8d38ddc6f3b5`.
- Residual risk: Quotation and Sales Order multi-UOM interactions have not been exercised with real staging accounts and prepared stock/price fixtures.
- Safety constraints: FIFO rollout remains disabled; no production secrets are changed; release must use backup, tenant migration wrapper, tenant deploy wrapper, and health/guest-boot smoke.
