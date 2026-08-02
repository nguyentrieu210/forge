# FORGE AUTONOMOUS EXECUTION POLICY

## Mục tiêu

Mặc định mọi Forge worker agent phải **tự chạy tiếp** trong phạm vi workstream. Agent không được dừng để xin xác nhận cho các quyết định kỹ thuật thông thường, không được coi việc mở PR là hoàn thành workstream, và không được biến blocker cục bộ thành lý do đứng yên toàn nhánh.

Policy này áp dụng cho toàn bộ `WS00` đến `WS17` và được đọc cùng `PARALLEL_EXECUTION_PROTOCOL.md`, Skill, North Star, Capability Map và workstream file.

## Default: CONTINUE

Khi còn bất kỳ phần độc lập nào có thể audit, thiết kế, code, test, document hoặc chuẩn bị evidence trong scope, agent phải tiếp tục làm.

Agent tự quyết dựa trên thứ tự ưu tiên:
1. exact code / migration / tests / GitHub state;
2. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, workstream evidence;
3. Forge Enterprise Completion Skill;
4. Enterprise North Star + Capability Map;
5. kiến trúc và invariant hiện hữu;
6. phương án kỹ thuật ít tạo coupling/rủi ro nhất.

Không hỏi user các câu kiểu:
- “Có tiếp tục không?”
- “Có muốn tôi làm bước tiếp theo không?”
- “Có muốn tôi audit thêm không?”
- “Có muốn tôi mở PR không?”
- “Tôi nên chọn phương án A hay B?” khi repo/evidence đủ để tự chọn.

## Chỉ được dừng hỏi ở 4 hard-stop

Agent chỉ được dừng và yêu cầu user quyết định khi **ít nhất một** điều sau đúng:

1. **Business decision không thể suy ra**
   - cần chính sách nghiệp vụ thực sự của doanh nghiệp;
   - repo/spec/evidence không đủ xác định;
   - các lựa chọn tạo kết quả kinh doanh khác nhau và không có default an toàn.

2. **Shared contract dependency không thể tách**
   - phải thay shared contract thuộc workstream khác;
   - không có slice độc lập, adapter, compatibility layer hoặc dependency request nào cho phép tiếp tục;
   - toàn bộ phần còn lại của WS thật sự bị chặn.

3. **Destructive / production operation**
   - production/customer-data mutation;
   - destructive migration;
   - secret/DNS/credential rotation;
   - irreversible delete/reset/restore;
   - thao tác production có blast radius đáng kể.

4. **Merge/deploy thay đổi không phải UI-only**
   - backend/schema/migration/business rule/security/platform change đã tới merge/deploy gate;
   - agent phải xin approval trước merge/deploy theo Delivery Policy.

Nếu chưa rơi vào 1 trong 4 trường hợp trên thì **không được dừng hỏi**.

## PR KHÔNG phải điểm dừng

Mở PR chỉ là một **review checkpoint**.

Sau khi mở PR, agent phải tiếp tục phần độc lập còn lại trong workstream, ví dụ:
- audit capability tiếp theo;
- thêm regression/evidence;
- harden correction/failure paths;
- chuẩn bị follow-up slice;
- xử lý legacy PR disposition;
- viết dependency request;
- hoàn thiện docs/contracts không đụng hotspot bị chặn;
- mở follow-up PR nếu cần tách blast radius.

Chỉ dừng ở PR nếu:
- PR cần merge trước và mọi slice còn lại thật sự phụ thuộc merge đó; **và**
- không còn công việc độc lập nào khác trong WS; **và**
- merge thuộc hard-stop #4.

`Status: REVIEW` nghĩa là có checkpoint reviewable, **không có nghĩa worker được nghỉ**. Nếu còn việc độc lập, workstream vẫn phải tiếp tục chạy và status có thể trở lại `ACTIVE` hoặc ghi `ACTIVE — PR #... open`.

## Blocker cục bộ: ghi DR rồi chạy tiếp

Khi gặp dependency:
1. ghi `Dependency Request` trong workstream;
2. nêu exact contract cần, owner WS, blocker yes/no;
3. không sửa hotspot của owner khác;
4. chuyển sang slice độc lập tiếp theo.

Chỉ dùng `BLOCKED` khi **toàn bộ** phần còn lại của workstream không thể tiến thêm. Không dùng `BLOCKED` chỉ vì một capability bị kẹt.

## Thiếu CI / checkout / runtime không phải hard-stop

Nếu môi trường hiện tại không chạy được full test/build/CI:
- ghi rõ `NOT RUN` và lý do;
- thực hiện mọi validation khả dụng: source audit, static contract review, migration reasoning, targeted checks, exact diff review;
- tiếp tục các slice độc lập;
- tạo verification checklist để chạy khi có môi trường phù hợp.

Không được dừng chỉ vì “không có checkout”, “GitHub Actions không chạy dev CI”, “DNS clone unavailable”, hoặc thiếu một loại evidence mà vẫn còn việc khác làm được.

## Technical decision rule

Nếu có nhiều phương án kỹ thuật hợp lệ, agent tự chọn phương án tốt nhất theo:
- giữ source of truth hiện hữu;
- không tạo ledger/store/permission/workflow engine cạnh tranh;
- ưu tiên backward-compatible seam;
- tenant isolation và permission server-side;
- deterministic/idempotent/reversible khi domain yêu cầu;
- ít coupling nhất giữa workstream;
- migration append-only;
- testability và observability tốt hơn;
- chi phí/performance phù hợp Cloudflare stack.

Quyết định và trade-off được ghi vào workstream/PR, không hỏi user chỉ để chuyển trách nhiệm kỹ thuật.

## Continuous execution loop

Worker chạy vòng lặp này cho tới hard-stop hoặc target workstream đạt Definition of Done:

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

Không có bước `ASK USER WHETHER TO CONTINUE` trong loop.

## Khi buộc phải dừng

Nếu thật sự gặp hard-stop, agent phải báo ngắn và cụ thể:
- exact blocker;
- lựa chọn cần user quyết định;
- phần đã hoàn thành;
- phần độc lập đã làm hết;
- PR/head SHA nếu có.

Không kết thúc bằng câu hỏi chung chung. Chỉ hỏi đúng quyết định đang chặn.

## Merge/deploy boundary

- UI-only đủ fast-path gates: được merge/deploy theo policy dự án.
- Non-UI: agent tiếp tục làm tới merge gate, sau đó chờ approval merge/deploy.
- Chờ approval merge không đồng nghĩa workstream dừng nếu vẫn còn slice độc lập có thể làm trên branch/follow-up branch.

## Coordinator responsibility

Coordinator phải phát hiện worker dừng sai lý do. Nếu agent chuyển `REVIEW` hoặc `BLOCKED`, coordinator kiểm:
1. còn independent slice không;
2. blocker có thật thuộc 4 hard-stop không;
3. PR có chỉ là checkpoint không;
4. dependency request đã được ghi chưa.

Nếu còn việc độc lập, coordinator trả workstream về `ACTIVE` và yêu cầu worker tiếp tục, không chuyển câu hỏi kỹ thuật thông thường lên user.