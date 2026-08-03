# FORGE MULTI-AGENT EXECUTION PROTOCOL

## 1. Mục tiêu

Cho phép nhiều agent audit và triển khai Forge song song mà không biến monorepo thành bãi merge conflict.

Multi-agent execution không cần user phải yêu cầu thủ công. Coordinator phải tự phân loại task theo `skills/forge-enterprise-completion/SKILL.md` và `docs/agents/AUTO_AGENT_ORCHESTRATION.md`.

## 2. Trước khi làm

Mỗi worker phải đọc theo thứ tự:
1. exact branch head của chính mình;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
4. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
5. workstream/branch-local handoff file riêng;
6. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
7. code/migration/test/spec liên quan.

Code + migration + tests + exact GitHub state thắng tài liệu stale.

## 2A. Automatic execution topology

Trước implementation, coordinator phải tự chọn:

- `SINGLE`: một owner là execution model tốt nhất;
- `PROGRAM`: fan-out thành nhiều worker agent.

Không hỏi user xem có cần agent không khi repo evidence đã đủ.

Default `PROGRAM` khi có clean parallel boundaries như:

- từ hai ownership hotspot độc lập trở lên;
- nhiều workstream/domain/package authority;
- shared foundation/contract rồi nhiều consumer;
- audit/source-lock, implementation, integration và QA có thể tách;
- platform rebuild/convergence/hardening wave có nhiều slice độc lập;
- UI FAST và backend/shared-contract STANDARD/CRITICAL có merge boundary khác nhau.

Giữ `SINGLE` khi concurrency sẽ làm nhiều worker cùng sửa một authority, invariant cần chứng minh nguyên khối, hoặc coordination overhead lớn hơn lợi ích.

Chi tiết canonical: `docs/agents/AUTO_AGENT_ORCHESTRATION.md`.

## 2B. PROGRAM bootstrap — coordinator tự làm

Khi chọn `PROGRAM`, coordinator không chờ user nhắc. Phải:

1. audit exact current `main`, active branch/PR và historical substantive work trong scope;
2. tạo program/control branch từ exact current `main`;
3. tạo technical/program spec;
4. tạo Agent Board;
5. tạo common NO-STOP rule;
6. tạo source-lock/parity matrix nếu benchmark/reference bên ngoài là material;
7. khóa ownership/hotspot/forbidden zone/risk/dependency/acceptance của từng worker;
8. tạo worker branches từ exact program baseline;
9. seed branch-local handoff + startup prompt;
10. compare từng worker với program baseline để chứng minh topology sạch trước implementation.

Bootstrap branch mong đợi:

```text
ahead: 1 hoặc số commit coordination được giải thích
behind: 0
changes: handoff/coordination artifacts của chính worker
```

Không dùng stale historical branch làm base chỉ vì đã có code gần giống.

## 3. Claim nhánh

Trong `PROGRAM`, coordinator tạo branch trước; worker nhận branch đã được seed handoff.

Commit/record đầu tiên của worker phải ghi trong workstream/handoff file:
- `Status: CLAIMED`;
- `Owner: <alias>`;
- `Started from: <exact branch SHA>`;
- audit plan ngắn.

Sau audit chuyển `ACTIVE`. Khi có PR/handoff chuyển `REVIEW`.

Không tự lấy branch khác nếu branch mình blocked.

Nếu một task ban đầu là `SINGLE` nhưng audit phát hiện clean parallel boundaries, coordinator có thể promote thành `PROGRAM` rồi bootstrap theo mục 2B.

## 4. Quy tắc ownership

- Chỉ sửa primary ownership của workstream.
- Shared hotspot phải thông qua owner tương ứng.
- Nếu phát hiện primitive dùng chung đang nằm sai layer, không copy logic. Ghi dependency request.
- Domain agent ưu tiên metadata/app package; không hard-code schema app vào shared runtime.
- Frontend domain-specific nên đi qua metadata trước; thay đổi shared renderer thuộc owner frontend/runtime tương ứng.
- Business write không bypass kernel/Durable Object.
- Permission phải server-side.
- Không có hai worker cùng primary-own một shared hotspot.
- Coordinator chịu trách nhiệm phát hiện overlap sớm, không đợi tới merge conflict mới phát hiện rằng hai agent đã cùng "tối ưu" một file.

## 5. NO-STOP behavior

Worker không hỏi user về quyết định kỹ thuật thông thường.

Worker phải tự audit Skill/North Star/repo evidence và chọn phương án tốt nhất trong ownership của mình.

Chỉ dừng hỏi user khi:

1. cần quyết định nghiệp vụ không thể suy ra từ repo/spec;
2. cần thay shared authoritative contract thuộc stream khác và dependency không thể cô lập;
3. cần destructive/production operation;
4. non-UI work đã sẵn sàng merge/deploy nhưng project policy yêu cầu user duyệt.

Blocker cục bộ không phải lý do dừng.

Nếu bị block một phần:

1. ghi Dependency Request;
2. ghi exact blocked scope;
3. tiếp tục mọi phần độc lập;
4. để lại fixture/interface/test/handoff giúp convergence deterministic.

## 6. Dependency request

Trong workstream file ghi tối thiểu:

```md
### Dependency request DR-<WS>-<NN>
- Target stream: WSxx
- Need: ...
- Why generic: ...
- Contract proposed: ...
- Blocking: yes/no
- Temporary workaround: none / ...
```

Hoặc dùng format program-neutral:

```text
Dependency Request
Owner: <target worker/workstream>
Need: <specific contract/evidence/change>
Why: <why this belongs to target owner>
Blocked scope: <exact subsection>
Can continue independently: yes/no
Next independent work: <what the worker continues now>
```

Không tự sửa target hotspot khi chưa phối hợp. Không copy logic sang local layer để né dependency nếu điều đó tạo duplicate source of truth.

## 7. Workstream deliverables

Mỗi nhánh phải để lại tối thiểu:

1. capability audit có ID khi capability map áp dụng;
2. current maturity + evidence;
3. target architecture;
4. data/API/state/invariant contract;
5. implementation slices theo dependency;
6. code/migrations/tests nếu được giao implementation;
7. risk class;
8. blockers/dependency requests;
9. verification evidence;
10. PR/handoff rõ file nào authoritative;
11. completion record trong branch-local handoff;
12. exact changed zones và remaining gaps.

## 8. Definition of Done

Theo `forge-enterprise-completion` skill. Không gọi xong chỉ vì có màn hình hoặc happy path.

Finance/stock/payroll/legal/migration/security bắt buộc xem correction/reversal, reconciliation, tenant/permission, backdate/effective-date và migration replay theo scope.

Một program cũng không hoàn tất chỉ vì mọi worker đều có commit. Coordinator phải convergence và chứng minh shared authority duy nhất.

## 9. Merge discipline

- Backend/schema/business rule/shared authoritative contract: branch + PR + review, không tự merge/deploy nếu chưa được user duyệt theo project policy.
- UI-only có thể theo fast path riêng của dự án sau verify blast radius.
- Destructive production operation luôn cần explicit authorization.
- PR phải liệt kê capability IDs và dependency stream khi áp dụng.
- Rebase/merge latest main trước final verification nếu base đã trôi đáng kể.
- Không sửa migration đã chạy.
- Không commit secret, backup, generated runtime artifact ngoài source-control contract.
- Worker không tự merge chỉ vì dependency branch đã xong; coordinator quyết định convergence order.

## 10. Handoff format

```text
Workstream: WSxx / <program worker>
Branch: ...
Owner: ...
Head: ...
Status: REVIEW/BLOCKED
Capabilities: ...
Changed zones: ...
Tests: ...
Migration: ...
Dependency requests: ...
Known gaps: ...
Recommended merge order: ...
```

## 11. Coordinator

Coordinator là control plane, không phải worker thứ N+1.

Vai trò:
- đọc exact current `main`, worker heads, PRs và diffs;
- tự quyết định `SINGLE` hay `PROGRAM`;
- bootstrap program/worker branches khi cần;
- cập nhật `AGENT_BOARD.md` hoặc program board;
- phát hiện overlap;
- điều phối dependency;
- audit concurrent main drift;
- tìm reusable work thay vì kéo stale branch nguyên khối;
- ngăn duplicate primitive/source of truth;
- đề xuất/quyết định convergence order theo evidence;
- giữ đúng risk-specific merge/deploy boundary;
- chỉ cập nhật canonical status/maturity sau merge + verification.

Coordinator không code thay worker trừ khi:
- task thật sự quay về `SINGLE`;
- user chỉ định;
- hoặc một integration seam thuộc chính control/convergence ownership.

Nếu board khác GitHub, GitHub thắng.

## 12. Program convergence gate

Trước khi gọi một multi-agent program hoàn tất, coordinator phải kiểm:

- worker ownership sạch;
- không còn overlap chưa xử lý;
- dependency requests resolved hoặc explicit deferred;
- shared contracts chỉ còn một authority;
- không có duplicate runtime/domain primitive;
- tests/build/typecheck/migration/browser evidence đạt theo risk;
- final integrated diff được audit lại với exact current `main`;
- status/capability evidence không tự nâng maturity quá chứng cứ;
- merge/deploy tuân đúng production boundary.

Canonical bootstrap/detail: `docs/agents/AUTO_AGENT_ORCHESTRATION.md`.
