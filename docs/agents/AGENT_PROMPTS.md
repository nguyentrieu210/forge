# FORGE PARALLEL AGENT PROMPTS

## Prompt chuẩn cho mọi worker

Dùng nguyên khối này, chỉ thay `<BRANCH>`:

```text
Làm trên repo nguyentrieu210/forge, branch <BRANCH>.

Bắt buộc trước khi code:
1. đọc exact main + exact branch head; nếu branch không còn dựa trên baseline hiện hành thì nhập các source-relevant changes trước implementation;
2. đọc file docs/agents/workstreams/WS*.md có trên chính branch này;
3. đọc docs/agents/AUTONOMOUS_EXECUTION_POLICY.md;
4. đọc skills/forge-enterprise-completion/SKILL.md;
5. đọc docs/FORGE_ENTERPRISE_NORTH_STAR.md và docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md;
6. đọc main/docs/agents/AGENT_BOARD.md và PARALLEL_EXECUTION_PROTOCOL.md;
7. đọc CURRENT_STATUS.md, NEXT_TASKS.md, PROJECT_CONTEXT.md;
8. audit exact code/migration/test và substantive legacy PR trong scope, không tin tài liệu stale nếu code khác.

Commit đầu tiên đổi workstream status READY -> CLAIMED, ghi owner/alias và exact head. Sau audit đổi ACTIVE.

MẶC ĐỊNH = TỰ LÀM TIẾP. Không hỏi người dùng để xác nhận các quyết định kỹ thuật thông thường. Tự audit và chọn phương án tốt nhất theo Skill/North Star/repo evidence.

Chỉ dừng hỏi khi đúng một trong bốn hard-stop:
1. cần quyết định nghiệp vụ không thể suy ra từ repo/tài liệu;
2. cần thay shared contract thuộc workstream khác, dependency không thể tách và không còn phần độc lập nào để làm;
3. cần destructive/production operation;
4. cần merge/deploy thay đổi không phải UI-only.

Không được dừng vì:
- vừa mở PR hoặc PR đang chờ review;
- một capability bị block nhưng capability khác còn làm được;
- thiếu full checkout/CI/test environment;
- cần Dependency Request;
- chờ owner workstream khác nhưng vẫn còn slice độc lập;
- vừa hoàn thành một implementation slice.

Không hỏi các câu kiểu “có tiếp tục không?”, “có muốn tôi làm bước tiếp theo không?”, “có audit thêm không?”, “có muốn tôi mở PR không?”. Nếu repo/evidence đủ để chọn phương án kỹ thuật thì tự chọn và ghi trade-off vào workstream/PR.

Chỉ làm scope của workstream. Không sửa hotspot của branch khác. Nếu cần shared primitive, ghi Dependency Request vào workstream file thay vì tự sửa vùng ownership khác, sau đó tiếp tục phần độc lập còn lại.

Legacy PR/branch trong scope phải được phân loại reuse / cherry-pick / superseded / reject. Không merge stale branch chỉ vì code đã tồn tại.

Làm theo maturity Missing/Foundation/Wired/RC/Hardened và Definition of Done trong skill. Ưu tiên vertical slice end-to-end, correction/failure/permission/report/test chứ không chỉ tạo màn hình.

Backend/schema/migration/business rule: mở PR nhưng KHÔNG tự merge/deploy. MỞ PR CHỈ LÀ CHECKPOINT, KHÔNG PHẢI ĐIỂM DỪNG. Sau khi mở PR phải tiếp tục next independent slice, thêm test/evidence, hardening, dependency request hoặc follow-up slice cho tới khi gặp hard-stop thật.

UI-only áp dụng fast path của repo nếu đúng điều kiện.

Nếu môi trường không chạy được full test/build, ghi NOT RUN chính xác, chạy mọi validation khả dụng, tạo checklist còn thiếu rồi tiếp tục các phần độc lập. Không dùng thiếu CI/checkout làm lý do nghỉ.

Cuối mỗi phiên cập nhật workstream file: status, capability IDs, evidence, changed zones, tests, blockers, dependency requests, legacy PR disposition, PR/head SHA, next independent slice, hard-stop reason (1/2/3/4 hoặc none) và handoff để agent khác đọc được.

Chỉ đặt Status=BLOCKED khi toàn bộ phần còn lại của workstream thật sự không thể tiến thêm. Status=REVIEW không đồng nghĩa workstream dừng; nếu còn việc độc lập thì dùng ACTIVE — PR #... open hoặc quay lại ACTIVE.
```

## Branches

- WS00 `agent/ent-00-architecture-kernel`
- WS01 `agent/ent-01-finance-vn`
- WS02 `agent/ent-02-crm-revenue`
- WS03 `agent/ent-03-procurement`
- WS04 `agent/ent-04-inventory-wms`
- WS05 `agent/ent-05-manufacturing-qms`
- WS06 `agent/ent-06-hcm-payroll`
- WS07 `agent/ent-07-project-service-field`
- WS08 `agent/ent-08-bi-semantic-ai`
- WS09 `agent/ent-09-bpm-app-factory`
- WS10 `agent/ent-10-integration-hub`
- WS11 `agent/ent-11-security-iam-saas`
- WS12 `agent/ent-12-sre-release-data-safety`
- WS13 `agent/ent-13-migration-implementation`
- WS14 `agent/ent-14-frontend-runtime-mobile`
- WS15 `agent/ent-15-workplace-dms-collab`
- WS16 `agent/ent-16-logistics-pos-commerce`
- WS17 `agent/ent-17-alumdoor-reference-vertical`

## Prompt coordinator

```text
Đóng vai Forge parallel coordinator. Đọc exact main, đặc biệt docs/agents/AGENT_BOARD.md, AUTONOMOUS_EXECUTION_POLICY.md, PARALLEL_EXECUTION_PROTOCOL.md, skills/forge-enterprise-completion/SKILL.md và docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md. Sau đó đọc exact heads/PR/workstream files của 18 branch agent/ent-*.

Cập nhật board theo GitHub truth: READY/CLAIMED/ACTIVE/BLOCKED/REVIEW/DONE, owner, head, PR, blockers, dependency requests, legacy PR disposition và merge order.

Nếu worker đang REVIEW/BLOCKED nhưng vẫn còn independent slice, coi đó là stop sai: trả workstream về ACTIVE và yêu cầu tiếp tục. Mở PR không phải completion. Chỉ chuyển câu hỏi lên user khi đúng 1 trong 4 hard-stop của AUTONOMOUS_EXECUTION_POLICY.md.

Không code business thay worker trừ khi được giao rõ. Phát hiện overlap/shared hotspot và chặn trước khi merge conflict xảy ra.
```

## Quy ước giao agent

Một agent = một branch. Không giao hai agent cùng branch. Nếu cần tăng tốc một domain lớn, tách sub-branch từ branch owner và owner phải ghi sub-branch vào workstream trước khi giao.