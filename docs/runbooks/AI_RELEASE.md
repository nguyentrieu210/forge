# Forge Release Runbook for AI Agents

Ngày cập nhật: **2026-07-31**.

## 1. Nguyên tắc

- Release chỉ được thực hiện khi người dùng yêu cầu rõ.
- PR xanh không đồng nghĩa được deploy.
- Candidate build và production release là hai bước tách biệt.
- Exact SHA và provider version ID là bắt buộc.
- Không sửa production secrets trong release.
- Cloudflare Git Build phải giữ tắt để tránh deploy song song.

## 2. Gateway release

### Tạo candidate

1. Xác minh target SHA đã có required CI PASS.
2. Chạy `Gateway Release Candidate` thủ công.
3. Nhập exact target SHA và `BUILD_GATEWAY_CANDIDATE`.
4. Workflow build/stage frontend một lần và chạy `wrangler versions upload`.
5. Tải artifact, đọc `release.json` và lưu target SHA, immutable version ID, run ID, timestamp.
6. Candidate không được chuyển traffic.

### Promote production

1. Đối chiếu target SHA và version ID với cùng `release.json`.
2. Chạy `Gateway Production Release` thủ công.
3. Nhập exact SHA, version ID và `RELEASE_GATEWAY`.
4. GitHub environment `production` phải được approve nếu đã cấu hình reviewer.
5. Workflow verify version, promote 100%, smoke và lưu provider evidence.
6. Không build frontend lại trong bước này.

### Gateway success gate

- Version verify PASS.
- Provider deployment evidence chứa đúng version ID.
- `/health` = 200.
- `/` = 200.
- Unauthenticated boot = 403.
- Artifact evidence tồn tại.

## 3. Tenant release

1. Xác minh exact target SHA đã có required CI PASS.
2. Xác minh migration plan và rollback/backup plan.
3. Chạy `Tenant Production Release` thủ công.
4. Nhập tenant `alu`, exact SHA và `RELEASE_TENANT`.
5. Workflow phải chạy đúng thứ tự: backup dry/live → upload backup → migration dry/live → deploy dry/live → smoke → provider evidence.
6. Không bỏ qua backup hoặc dry-run để rút ngắn thời gian.

### Tenant success gate

- Backup artifact tồn tại.
- Migration và deploy PASS.
- `/health` = 200.
- Unauthenticated boot = 403.
- Tenant Worker version ID được ghi lại.
- FIFO vẫn disabled trừ khi có approval kích hoạt riêng.

## 4. Rollback

- Không rollback bằng cách build source mới.
- Gateway: promote lại immutable version ID đã biết tốt.
- Tenant: dùng version/commit đã biết tốt và đánh giá migration tương thích trước khi rollback.
- Nếu migration không backward-compatible, dừng và yêu cầu kế hoạch khôi phục dữ liệu rõ ràng.
- Luôn ghi target version cũ/mới, run ID và lý do rollback.

## 5. Không được làm

- Không lấy version ID từ log không khớp target SHA.
- Không deploy từ branch chưa merge hoặc SHA chưa được phê duyệt.
- Không hard-code SHA cho release lâu dài.
- Không dùng PR validation để deploy production.
- Không chạy candidate rồi gọi đó là production release.
- Không tuyên bố thành công khi thiếu provider evidence hoặc smoke.

## 6. Handoff sau release

Cập nhật:

- `CURRENT_STATUS.md`: target SHA, version ID, run/job ID, smoke, migration/backup và thời điểm release.
- `NEXT_TASKS.md`: functional smoke, monitoring, rollback risk và việc còn lại.
- `AI_HANDOFF.md`: đường release hiện hành nếu thay đổi.

Báo rõ không sửa secrets, không bật FIFO và không thay DNS nếu các việc đó không xảy ra.
