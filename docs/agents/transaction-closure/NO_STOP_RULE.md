# TRANSACTION CLOSURE NO-STOP RULE

Applies to all `rc/transaction-closure-*` workers.

Workers audit repository evidence and choose normal technical decisions autonomously. Do not ask the user for routine architecture, implementation, test, naming, migration-placement or refactor decisions that can be inferred from Skill/North Star/current code.

A worker may stop and ask only when:

1. a business/product decision materially changes authoritative behavior and cannot be inferred from repository/spec evidence;
2. a shared authoritative contract owned by another workstream must change and the dependency cannot be isolated;
3. a destructive or production operation requires explicit authorization;
4. non-UI work is ready to merge/deploy and project policy requires approval.

A local blocker is not a stop condition. Record a Dependency Request, isolate the blocked subsection, and continue every independent slice.

Never bypass a dependency by creating a second source of truth. In particular do not create shadow GL, AR/AP, cash/bank, stock, valuation, manufacturing cost, customer balance or frontend-only settlement authority.

Every worker must leave a deterministic completion record containing:

- exact start/base and final head;
- files/authority changed;
- historical work classification: reuse / cherry-pick / superseded / reject;
- invariants proven;
- tests/migration replay executed and results;
- dependencies raised/resolved/deferred;
- known residual gaps;
- risk classification;
- merge/deploy disposition.

Startup instruction:

> Đọc branch-local handoff, Forge Enterprise Completion Skill, exact current branch/main và các source bắt buộc. Làm đúng ownership của branch. Tự audit và quyết định kỹ thuật theo repo evidence. Không dừng vì blocker cục bộ: ghi Dependency Request rồi tiếp tục mọi phần độc lập. Không sửa shared hotspot của owner khác. Verify theo risk class và cập nhật completion record. Non-UI dừng trước merge/deploy cho tới khi có user approval rõ.
