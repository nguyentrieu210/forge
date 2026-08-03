# UI Factory Agent — NO-STOP RULE

Áp dụng bắt buộc cho agent làm việc trên nhánh này.

## Mặc định: tự làm tiếp, không dừng hỏi

Agent KHÔNG được dừng giữa chừng để xin người dùng xác nhận các quyết định kỹ thuật thông thường.

Không hỏi các câu kiểu:

- "Có muốn tôi tiếp tục không?"
- "Tôi có nên sửa file này không?"
- "Chọn phương án A hay B?" khi repo/Skill/North Star đủ bằng chứng để tự chọn.
- "Có muốn tôi chạy test/build không?"
- "Có muốn tôi tạo PR không?" khi task yêu cầu hoàn thành branch/handoff.
- "Tôi bị lỗi X, giờ làm gì?" khi vẫn còn phần độc lập có thể tiếp tục.

Agent phải tự audit exact repo state, Forge Enterprise Completion Skill, North Star, ownership boundary, tests và code evidence rồi chọn phương án kỹ thuật tốt nhất.

Nếu có nhiều phương án kỹ thuật hợp lệ, ưu tiên theo thứ tự:

1. exact code/migration/test/GitHub state;
2. Forge Enterprise Completion Skill;
3. North Star + capability map;
4. owner/workstream contract;
5. giải pháp metadata-first, generic, ít coupling, fail-closed;
6. backward compatibility và blast radius nhỏ nhất.

## Khi bị block một phần

Không được dừng toàn bộ task chỉ vì một blocker cục bộ.

Phải ghi:

```text
Dependency Request
Owner: <owner/branch>
Need: <contract/change/evidence cần>
Why: <vì sao cần>
Blocked scope: <phần nào đang bị chặn>
Can continue independently: yes/no
Next independent work: <phần sẽ tiếp tục làm ngay>
```

Sau đó tiếp tục mọi phần độc lập còn lại: audit, implementation không phụ thuộc blocker, fixtures, tests, negative cases, docs, evidence, refactor trong ownership, hoặc chuẩn bị adapter/handoff.

Không được dùng blocker của workstream khác làm lý do kết thúc sớm nếu vẫn còn công việc hữu ích trong scope.

## Chỉ được dừng hỏi trong đúng 4 trường hợp

1. **Quyết định nghiệp vụ** không thể suy ra từ repo, tài liệu, fixture hoặc hành vi hiện có và nhiều lựa chọn sẽ tạo kết quả kinh doanh khác nhau.
2. **Shared contract thuộc workstream khác** bắt buộc phải thay và dependency không thể tách bằng adapter/local view-model/fixture/Dependency Request.
3. **Destructive hoặc production operation**: production migration, xóa/mutate dữ liệu thật, secrets/DNS, rollback destructive, hoặc operation có blast radius production cần xác nhận rõ.
4. **Merge/deploy thay đổi không phải UI-only**. Agent phải dừng trước merge/deploy và trình evidence để người dùng duyệt.

Ngoài 4 trường hợp trên: **không hỏi, tự quyết và tiếp tục**.

## Merge/deploy rule

- UI-only thật sự, đã verify blast radius: theo fast path của dự án, có thể merge/deploy theo chỉ dẫn project hiện hành.
- Backend/schema/migration/business rule/shared contract: branch + PR + verify, nhưng KHÔNG merge/deploy khi chưa có user approval rõ.
- Không lách rule bằng cách gọi thay đổi business behavior là "UI".

## Completion behavior

Agent phải làm tới điểm xa nhất có thể trong một lượt làm việc và kết thúc bằng handoff có:

- exact branch/head/base;
- việc đã làm;
- file đã chạm;
- test/evidence;
- unresolved Dependency Requests;
- phần còn lại thực sự bị block;
- maturity hiện tại;
- merge/deploy status.

Không kết thúc bằng lời mời mơ hồ. Nếu còn việc trong scope và không thuộc 4 stop conditions, agent phải tiếp tục làm luôn.