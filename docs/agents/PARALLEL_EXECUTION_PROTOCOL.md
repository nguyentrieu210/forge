# FORGE MULTI-AGENT EXECUTION PROTOCOL

## 1. Mục tiêu

Cho phép nhiều agent audit và triển khai Forge song song mà không biến monorepo thành bãi merge conflict, đồng thời không để worker dừng liên tục để hỏi các quyết định kỹ thuật thông thường.

**Bắt buộc đọc và tuân thủ:** `docs/agents/AUTONOMOUS_EXECUTION_POLICY.md`.

Default của mọi worker là **CONTINUE**. Mở PR, gặp blocker cục bộ, thiếu full CI hoặc hoàn thành một slice không phải lý do dừng workstream.

## 2. Trước khi làm

Mỗi worker phải đọc theo thứ tự:
1. exact branch head của chính mình và exact current `main`;
2. `docs/agents/AUTONOMOUS_EXECUTION_POLICY.md`;
3. `skills/forge-enterprise-completion/SKILL.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
5. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
6. workstream file riêng của nhánh;
7. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
8. code/migration/test/spec và substantive legacy PR liên quan.

Code + migration + tests + exact GitHub state thắng tài liệu stale.

## 3. Claim nhánh

Agent được giao một branch đã tạo sẵn. Commit đầu tiên phải sửa workstream file riêng:
- `Status: CLAIMED`;
- `Owner: <alias>`;
- `Started from: <exact branch SHA>`;
- ghi audit plan ngắn.

Sau audit chuyển `ACTIVE`.

Có PR không bắt buộc chuyển sang trạng thái nghỉ. Có thể ghi `ACTIVE — PR #... open`. `REVIEW` chỉ là trạng thái checkpoint reviewable khi slice đã đủ review, không có nghĩa workstream được dừng nếu vẫn còn việc độc lập.

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

**Sau khi ghi Dependency Request phải chuyển sang phần độc lập tiếp theo.** Chỉ dùng `BLOCKED` nếu toàn bộ phần còn lại của WS thật sự không thể tiến thêm.

## 6. Autonomous execution / stop conditions

Worker **không hỏi user để xác nhận quyết định kỹ thuật thông thường**. Tự audit và chọn phương án tốt nhất theo Skill/North Star/repo evidence.

Chỉ được dừng hỏi khi:
1. cần quyết định nghiệp vụ không thể suy ra từ repo/tài liệu;
2. cần thay shared contract thuộc workstream khác và dependency không thể tách, đồng thời không còn slice độc lập;
3. cần destructive/production operation;
4. cần merge/deploy thay đổi không phải UI-only.

Các trường hợp sau **không phải stop condition**:
- vừa mở PR;
- PR đang chờ review;
- một capability bị block nhưng capability khác vẫn làm được;
- thiếu local checkout/full CI;
- chưa chạy được một loại test nhưng vẫn còn audit/code/docs/evidence độc lập;
- cần tạo Dependency Request;
- phải chờ owner khác trả contract nhưng vẫn còn slice khác.

Worker không được hỏi “có tiếp tục không?”, “có muốn làm bước tiếp theo không?”, “có audit thêm không?”, hoặc bắt user chọn A/B khi evidence kỹ thuật đủ để tự quyết.

## 7. PR là checkpoint, không phải kết thúc

Backend/schema/migration/business rule vẫn phải mở PR và không tự merge/deploy. Nhưng sau khi mở PR, worker phải tiếp tục:
- audit gap tiếp theo;
- thêm test/evidence;
- harden failure/correction path;
- xử lý legacy PR disposition;
- chuẩn bị follow-up slice;
- ghi Dependency Request;
- làm mọi phần không phụ thuộc merge.

Chỉ dừng tại merge gate khi **không còn bất kỳ phần độc lập nào** và merge/deploy thuộc stop condition #4.

## 8. Workstream deliverables

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
10. legacy PR disposition;
11. PR/handoff rõ file nào authoritative;
12. next independent slice nếu workstream chưa đạt target.

## 9. Definition of Done

Theo `forge-enterprise-completion` skill. Không gọi xong chỉ vì có màn hình, happy path hoặc một PR đã mở.

Finance/stock/payroll/legal/migration/security bắt buộc xem correction/reversal, reconciliation, tenant/permission, backdate/effective-date và migration replay theo scope.

Workstream chỉ `DONE` khi target capability trong scope đạt Definition of Done hoặc coordinator/user chốt scope kết thúc. `REVIEW` không đồng nghĩa `DONE`.

## 10. Verification khi môi trường hạn chế

Nếu không có checkout/dependency tree/full CI:
- ghi `NOT RUN` chính xác;
- chạy mọi validation khả dụng;
- review exact diff/contracts;
- tạo verification checklist;
- tiếp tục slice độc lập khác.

Không được dừng workstream chỉ vì môi trường hiện tại thiếu một gate thực thi.

## 11. Merge discipline

- Backend/schema/business rule: branch + PR + review, không tự merge/deploy nếu chưa được user duyệt.
- UI-only có thể theo fast path riêng của dự án sau verify.
- PR phải liệt kê capability IDs và dependency stream.
- Sync latest relevant `main` trước final verification nếu base đã trôi đáng kể; không rebase chỉ vì ops/evidence-only commit không ảnh hưởng source.
- Không sửa migration đã chạy.
- Không commit secret, backup, generated runtime artifact ngoài source-control contract.

## 12. Handoff format

```text
Workstream: WSxx
Branch: ...
Owner: ...
Head: ...
Status: ACTIVE/REVIEW/BLOCKED
Capabilities: ...
Changed zones: ...
Tests: ...
Migration: ...
Dependency requests: ...
Known gaps: ...
Next independent slice: ...
Hard-stop reason (nếu có): 1/2/3/4 hoặc none
Recommended merge order: ...
```

## 13. Continuous execution loop

```text
SYNC EXACT STATE
  -> AUDIT NEXT GAP
  -> CHOOSE BEST TECHNICAL SLICE
  -> IMPLEMENT / VERIFY
  -> UPDATE EVIDENCE
  -> RECORD DEPENDENCIES
  -> OPEN/UPDATE PR CHECKPOINT
  -> CONTINUE NEXT INDEPENDENT SLICE
```

Không có bước `ASK USER WHETHER TO CONTINUE`.

## 14. Coordinator

Coordinator không code thay worker trừ khi user chỉ định. Vai trò:
- đọc exact branch heads/PRs;
- cập nhật `AGENT_BOARD.md`;
- phát hiện overlap;
- điều phối dependency;
- đề xuất merge order;
- tránh hai agent cùng triển khai một primitive;
- phát hiện worker dừng sai lý do.

Khi worker chuyển `REVIEW` hoặc `BLOCKED`, coordinator phải kiểm xem còn independent slice không. Nếu còn, trả workstream về `ACTIVE` và yêu cầu tiếp tục thay vì đẩy câu hỏi kỹ thuật thông thường lên user.

Nếu board khác GitHub, GitHub thắng.