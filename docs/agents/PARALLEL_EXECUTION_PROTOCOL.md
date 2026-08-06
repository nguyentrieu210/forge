# FORGE MULTI-AGENT EXECUTION PROTOCOL

Ngày cập nhật: **2026-08-07**.

Protocol này áp dụng khi một Forge task được phân loại `PROGRAM`. Exact GitHub state và `skills/forge-enterprise-completion/SKILL.md` là authority cao hơn mọi board/handoff snapshot.

## 1. Chọn topology

Coordinator tự chọn:

- `SINGLE` — một owner là an toàn/nhanh nhất;
- `PROGRAM` — nhiều ownership hotspot độc lập có thể chạy song song.

Không fan-out để tăng số agent. Dùng số worker ít nhất đủ tách authority sạch.

Default `PROGRAM` khi có nhiều domain/package authority, shared foundation + independent consumers, hoặc audit/implementation/integration/QA có thể tách rõ.

Giữ `SINGLE` khi nhiều worker sẽ cùng sửa một authority hoặc invariant cần chứng minh nguyên khối.

## 2. Required reading

Trước implementation:

1. exact current `main`, active branch/PR/diff;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `PROJECT_CONTEXT.md`;
5. `docs/README.md`;
6. Forge Enterprise Completion Skill;
7. North Star + capability map/status;
8. scope-specific code/migration/test/spec/evidence.

Code + migration + tests + exact GitHub state thắng prose stale.

## 3. PROGRAM bootstrap

Coordinator phải:

1. tạo control/program branch từ exact current `main`;
2. khóa mission, scope, risk và acceptance gate;
3. tạo **program-local** spec + agent board/dependency graph khi cần;
4. định nghĩa từng worker: ownership, forbidden/shared hotspots, dependencies, evidence, merge/deploy boundary;
5. tạo worker branches từ cùng exact program baseline;
6. seed branch-local handoff/startup prompt nếu cần;
7. verify worker topology trước fan-out.

Không dùng một global long-lived `AGENT_BOARD.md` làm live authority cho mọi program. Board là artifact của chính program và có thể bị xóa sau convergence.

Bootstrap kỳ vọng:

```text
ahead: chỉ coordination/handoff commits được giải thích
behind: 0
implementation leakage từ worker khác: none
```

## 4. Worker status

Dùng vocabulary nhất quán:

- `BOOTSTRAPPED`
- `RUNNING`
- `BLOCKED`
- `READY`
- `CONVERGING`
- `DONE`
- `SUPERSEDED/CLOSED`

Không gọi branch là `RUNNING` chỉ vì nó tồn tại.

## 5. Ownership

- Một authoritative hotspot chỉ có một primary owner tại một thời điểm.
- Shared primitive thuộc platform/domain owner, không copy xuống consumer để né dependency.
- Vertical không fork Finance/Stock/IAM/App Factory/runtime authority.
- Business writes không bypass Document Kernel/aggregate path.
- Permission/tenant isolation phải enforce server-side.
- Migration mới phải audit exact current numbering/applied-state contract; không sửa migration có thể đã applied.

## 6. NO-STOP behavior

Worker không hỏi user cho quyết định kỹ thuật thông thường nếu repo/Skill/spec đủ bằng chứng.

Chỉ dừng khi:

1. cần business/product decision không thể suy ra;
2. shared authoritative contract dependency không thể cô lập;
3. destructive/production operation;
4. non-UI merge/deploy cần explicit approval.

Blocker cục bộ: ghi Dependency Request và tiếp tục phần độc lập.

## 7. Dependency Request

Format tối thiểu:

```text
Dependency Request
Owner: <target worker/domain>
Need: <specific contract/evidence/change>
Why: <why target owns it>
Blocked scope: <exact subsection>
Can continue independently: yes/no
Next independent work: <what continues>
```

Không sửa hotspot của owner khác để “tạm unblock” nếu tạo duplicate source of truth.

## 8. Worker deliverables

Mỗi worker phải để lại:

- exact branch/head + scope;
- capability IDs nếu áp dụng;
- current/target maturity và evidence;
- contract/invariants;
- changed zones;
- tests/verification thực chạy;
- dependency requests/blockers;
- known gaps/non-claims;
- PR/handoff và merge boundary.

Không claim PASS từ authored tests chưa chạy. Không claim `Hardened` từ test count.

## 9. Coordinator reporting

Mỗi checkpoint program phải công khai:

- worker agent count;
- active worker branch count + exact names;
- control branch + current head;
- từng worker: branch, PR, mission, status, dependency/blocker;
- merged/closed/superseded workers vẫn xuất hiện trong final convergence record.

## 10. Convergence

Coordinator phải integrate theo dependency/authority order, không theo worker hoàn thành trước.

Final candidate phải được verify trên **một exact combined head**. Worker-level green evidence không tự động chứng minh combined candidate.

Khi main drift đáng kể, re-audit/rebase/reconcile trước final validation.

### 10.1 Branch freshness trước merge — bắt buộc

Nhiều worker/tab có thể bắt đầu từ cùng hoặc khác snapshot của `main`; điều đó được phép trong lúc phát triển. Nhưng **branch merge sau không được merge dựa trên baseline stale**.

Trước mỗi merge của branch/PR khi `main` có thể đã thay đổi:

1. `git fetch origin` và xác định exact latest `origin/main`.
2. So sánh worker baseline/head với latest `origin/main`.
3. Nếu `origin/main` đã advance kể từ baseline hoặc lần sync cuối, phải `rebase origin/main` hoặc `merge origin/main` theo strategy của workstream **trước final verification**.
4. Sau sync, audit `git diff origin/main...HEAD` hoặc compare tương đương để chứng minh branch chỉ còn mang intent của chính workstream.
5. Nếu branch đã merge trước chạm cùng file, metadata declaration, renderer, shared contract hoặc hotspot liên quan, phải review **semantic composition**, không chỉ dựa vào việc Git không báo textual conflict.
6. Sau conflict resolution/sync, rerun targeted typecheck/build/test/browser evidence theo blast radius.
7. Ngay trước merge, kiểm tra lại latest `origin/main`; nếu `main` lại advance, lặp lại freshness check.

Merge readiness tối thiểu:

```text
latest origin/main fetched: yes
branch reconciled with latest main: yes
behind latest main for required convergence: 0
final diff audited against latest main: yes
semantic overlap with earlier merged workers: reviewed/none
targeted verification after reconciliation: pass
```

### 10.2 Anti-overwrite rule

Khi resolve conflict hoặc reconcile branch stale:

- phải giữ intent hợp lệ của **cả thay đổi đã có trên latest `main` và thay đổi của worker hiện tại**;
- cấm mặc định dùng whole-file `ours/theirs`, `checkout origin/main -- <path>`, reset hoặc thay nguyên file chỉ để làm conflict biến mất;
- chỉ được chọn một phía hoặc thay nguyên file khi diff/authority evidence chứng minh phía còn lại thực sự phải bị loại bỏ;
- UI-only fast path **không được miễn** branch-freshness và anti-overwrite rule;
- nếu reconciliation lộ ra shared-contract conflict thuộc owner/workstream khác, ghi `Dependency Request`, tiếp tục phần độc lập và không tự overwrite authority đó.

Mục tiêu: hai tab/worker có thể lấy `main` ở thời điểm khác nhau, nhưng **tab/worker merge sau luôn phải hội tụ trên latest main và chứng minh không làm mất thay đổi đã merge trước**.

## 11. Merge/deploy discipline

- UI-only FAST: có thể theo fast path sau blast-radius verification nếu project policy cho phép.
- Backend/schema/migration/business/security/legal/shared contract: branch + PR + verify, dừng trước merge/deploy nếu chưa có explicit approval.
- Production migration, restore/PITR, provider/DNS/secret/customer-data mutation luôn cần explicit authorization.
- Merge != deploy; source/config != provider/live evidence.

## 12. Program closure + documentation cleanup

Sau khi program đã converge và canonical final evidence tồn tại:

- giữ final spec/evidence/convergence record nếu còn giá trị audit;
- cập nhật `CURRENT_STATUS.md` và `NEXT_TASKS.md`;
- xóa program board, startup prompts, duplicate NO-STOP rules, bootstrap topology snapshots và handoff đã superseded khỏi `main` nếu không còn là evidence cần thiết;
- provenance vẫn tồn tại trong Git/PR history.

Mục tiêu là không để coordination artifacts của wave cũ trở thành live documentation debt.
