# RC4-A10 — Dependency Requests

Owner: A10 CRM / Revenue  
Branch: `agent/rc4-10-crm-revenue`  
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`

## DR-A10-01 — Commercial Contract / due-date bridge

**Status:** OPEN  
**Requested from:** A16 Workplace / DMS / Collaboration, with A9 Architecture / Kernel if a shared contract surface is required.  
**A10 impact:** commercial-contract and due-date residual remains blocked; Customer 360 and the existing O2C closure are independent and continue without this dependency.

### Repo evidence

- A shared `Contract` already exists at `server/apps-src/workplace/doctypes/contract.json` under Contract Management.
- It owns company, customer/supplier/employee/service contract classification, effective/end dates, renewal, terms/SLA, contract value/currency, signed files and amendment lineage.
- RC4-A10 must not introduce a competing `Sales Contract` or mutate A16-owned schema without an explicit shared contract.

### Required consumer contract

A10 needs a stable server-readable contract surface that can be consumed by Sales Order / Sales Invoice without taking ownership of Contract Management:

1. typed Customer relation scoped by tenant + company;
2. effective-date and active/cancelled/amended semantics;
3. explicit commercial due policy (payment-term/due-date semantics) and, if owned by Contract Management, delivery commitment semantics;
4. currency compatibility and deterministic effective-date validation;
5. amendment/revision provenance so O2C can retain the exact contract generation used;
6. a read-only lookup/validation contract that does not transfer Finance ledger authority into CRM.

### Acceptance for A10 continuation

A10 can attach/validate one exact contract revision on Sales Order / Sales Invoice and derive due-date semantics from that shared authority without redefining Contract, Payment Entry, AR ledger or IAM rules.

### Interim rule

No duplicate Sales Contract will be created on A10. Existing Quotation → Sales Order provenance remains the canonical handoff until this dependency is resolved.

---

## DR-A10-02 — In-memory outstanding tenant parity

**Status:** OPEN  
**Requested from:** A9 Architecture / Kernel.  
**A10 impact:** production D1 tenant isolation is verified; in-memory multi-tenant parity for outstanding aggregation is not safe enough for a cross-tenant regression claim.

### Repo evidence

- `D1MutationStore.getOutstandingMinor` filters `payment_ledger_entries` by `tenant_id`, voucher type and voucher number.
- `InMemoryMutationStore.getOutstandingMinor` currently accepts `tenantId` but aggregates matching voucher type/number without filtering tenant. `getBaseOutstandingMinor` has the same parity issue.

### Requested correction

Filter in-memory payment-ledger aggregation by tenant exactly as D1 does, with a regression fixture using the same voucher number in two tenants.

### Interim rule

RC4-A10 Customer 360 remains tenant-scoped for document discovery and uses the production-safe reader contract. A10 will not modify the shared kernel store on this workstream; its handoff must not claim in-memory cross-tenant parity until A9 closes this request.
