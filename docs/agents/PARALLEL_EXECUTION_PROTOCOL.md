# FORGE MULTI-AGENT EXECUTION PROTOCOL

## 1. Mục tiêu

Cho phép nhiều agent audit và triển khai Forge song song mà không biến monorepo thành bãi merge conflict.

## 2. Trước khi làm

Mỗi worker phải đọc theo thứ tự:
1. exact branch head của chính mình;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
4. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
5. workstream file riêng của nhánh;
6. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
7. code/migration/test/spec liên quan.

Code + migration + tests + exact GitHub state thắng tài liệu stale.

## 3. Claim nhánh

Agent được giao một branch đã tạo sẵn. Commit đầu tiên phải sửa workstream file riêng:
- `Status: CLAIMED`;
- `Owner: <alias>`;
- `Started from: <exact branch SHA>`;
- ghi audit plan ngắn.

Sau audit chuyển `ACTIVE`. Khi có PR/handoff chuyển `REVIEW`.

Không tự lấy branch khác nếu branch mình blocked.

## 4. Quy tắc ownership

- Chỉ sửa primary ownership của workstream.
- Shared hotspot phải thông qua owner tương ứng.
- Nếu phát hiện primitive dùng chung đang nằm sai layer, không copy logic. Ghi dependency request.
- Domain agent ưu tiên metadata/app package; không hard-code schema app vào shared runtime.
- Frontend domain-specific nên đi qua metadata trước; thay đổi shared renderer thuộc WS14.
- Business write không bypass kernel/Durable Object.
- Permission phải server-side.

## 5. Dependency request

Trong workstream file ghi:

```md
### Dependency request DR-<WS>-<NN>
- Target stream: WSxx
- Need: ...
- Why generic: ...
- Contract proposed: ...
- Blocking: yes/no
- Temporary workaround: none / ...
```

Không tự sửa target hotspot khi chưa phối hợp.

## 6. Workstream deliverables

Mỗi nhánh phải để lại tối thiểu:

1. capability audit có ID;
2. current maturity + evidence;
3. target architecture;
4. data/API/state/invariant contract;
5. implementation slices theo dependency;
6. code/migrations/tests nếu được giao implementation;
7. risk class;
8. blockers/dependency requests;
9. verification evidence;
10. PR/handoff rõ file nào authoritative.

## 7. Definition of Done

Theo `forge-enterprise-completion` skill. Không gọi xong chỉ vì có màn hình hoặc happy path.

Finance/stock/payroll/legal/migration/security bắt buộc xem correction/reversal, reconciliation, tenant/permission, backdate/effective-date và migration replay theo scope.

## 8. Merge discipline

- Backend/schema/business rule: branch + PR + review, không tự merge/deploy nếu chưa được user duyệt.
- UI-only có thể theo fast path riêng của dự án sau verify.
- PR phải liệt kê capability IDs và dependency stream.
- Rebase/merge latest main trước final verification nếu base đã trôi đáng kể.
- Không sửa migration đã chạy.
- Không commit secret, backup, generated runtime artifact ngoài source-control contract.

## 9. Handoff format

```text
Workstream: WSxx
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

## 10. Coordinator

Coordinator không code thay worker trừ khi user chỉ định. Vai trò:
- đọc exact branch heads/PRs;
- cập nhật `AGENT_BOARD.md`;
- phát hiện overlap;
- điều phối dependency;
- đề xuất merge order;
- tránh hai agent cùng triển khai một primitive.

Nếu board khác GitHub, GitHub thắng.