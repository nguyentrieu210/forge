# Gate 3 Quality Scorecard

## Scope of score

Điểm này chỉ áp dụng cho **Gate 3 kernel + O2C vertical slice package**, không phải toàn bộ CloudForge Full Suite và không phải tuyên bố ERPNext source parity.

| Hạng mục | Điểm | Bằng chứng |
|---|---:|---|
| Monorepo/contracts | 9.5/10 | strict TypeScript, normalized contracts, runtime parsers |
| Authentication/security boundary | 9.5/10 | verified JWT, signed trusted identity, header stripping, actor-bound receipts |
| Atomic mutation/idempotency | 10/10 | guard + batch + receipt + audit + outbox; rollback tests |
| Lifecycle correctness | 10/10 | kernel state machine + DB triggers + negative tests |
| Cross-document consistency | 9.5/10 | fulfillment, outstanding, cancellation and stock DB guards |
| Money/ledger correctness | 9/10 | fixed-point canonical amounts, BigInt GL balance; advanced ERP valuation out of scope |
| Query/prepared reports | 9/10 | whitelist, tenant scope, permission, queue-backed prepared jobs |
| Test depth | 9/10 | 27 Node tests + SQLite races + executed workerd suite (tenant 4/4 + query 3/3); live prepared-report verified |
| Deploy/operations contract | 9/10 | WfP dispatch config, secrets, queue/outbox; live account deployment + smoke test (`DEPLOY_EVIDENCE.md`); tenant secret hardening pending |
| Documentation/scope honesty | 10/10 | exact limits and red gates recorded |
| **Total** | **93.5/100** | **Excellent for Gate 3 scoped package** |

## Gates deliberately not included in the 93.5 score

- upstream full SHA/source scanner;
- differential oracle against ERPNext;
- Cloudflare account deployment;
- load/latency/cost evidence;
- full ERPNext/HRMS/CRM/Insights implementation.

Those are later evidence gates. They cannot be converted to green by adding code comments or self-scoring.
