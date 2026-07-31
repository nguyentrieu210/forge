# Forge Release Runbook for AI Agents

Ngày cập nhật: **2026-07-31**.

## 1. Boundary

Release là thao tác riêng, không phải phần mở rộng tự động của PR validation.

AI không được chạy release chỉ vì:

- PR đã xanh;
- code đã merge;
- release candidate đã được upload;
- người dùng nói chung chung rằng cần tối ưu CI/CD.

Production release cần yêu cầu rõ ràng về hành động phát hành.

## 2. Gateway release model

Gateway dùng hai bước bất biến:

1. `Gateway Release Candidate`
   - manual-only;
   - nhận exact verified 40-character commit SHA;
   - build và stage frontend đúng một lần;
   - chạy `wrangler versions upload`;
   - không chuyển production traffic;
   - sinh `release.json` chứa `target_sha`, `version_id`, `run_id`, `created_at`.

2. `Gateway Production Release`
   - manual-only;
   - nhận đúng `target_sha` và `version_id` từ `release.json`;
   - không build frontend;
   - xác minh version tồn tại bằng `wrangler versions view`;
   - promote đúng version lên 100% traffic bằng `wrangler versions deploy`;
   - smoke `/health`, `/` và unauthenticated boot;
   - lưu provider output và release evidence.

Upload candidate không phải production deployment. Promote version mới là production deployment.

## 3. Gateway candidate gate

Trước khi chạy `Gateway Release Candidate`:

1. Exact target SHA phải thuộc code đã được phê duyệt.
2. Required CI của exact SHA phải PASS.
3. Cloudflare Git Build phải tắt để tránh deployment song song.
4. Không dùng branch name thay cho SHA.
5. Nhập confirmation chính xác: `BUILD_GATEWAY_CANDIDATE`.

Sau khi workflow hoàn tất:

1. Tải artifact `gateway-release-candidate-<sha>-<run_id>`.
2. Đọc `release.json`.
3. Xác minh `target_sha` đúng SHA dự kiến.
4. Xác minh `version_id` không rỗng.
5. Không chỉnh tay `release.json`.
6. Ghi run ID và version ID vào release evidence hoặc status khi chuẩn bị phát hành.

## 4. Gateway production gate

Trước khi chạy `Gateway Production Release`:

1. Người dùng yêu cầu deploy production rõ ràng.
2. Có `release.json` từ candidate workflow thành công.
3. `target_sha` và `version_id` phải được copy nguyên trạng từ cùng một manifest.
4. Production environment approval phải được giữ bật nếu repository hỗ trợ reviewer.
5. Nhập confirmation chính xác: `RELEASE_GATEWAY`.

Không được:

- build lại code trong production release;
- dùng version ID lấy từ một candidate khác;
- sửa target SHA để khớp version bằng phỏng đoán;
- bỏ qua smoke hoặc provider evidence;
- deploy lại chỉ để làm Actions chuyển xanh.

## 5. Tenant production release

Tenant release vẫn là manual workflow riêng:

1. Nhập tenant `alu`.
2. Nhập exact verified 40-character SHA.
3. Nhập confirmation `RELEASE_TENANT`.
4. Workflow thực hiện backup, upload backup, migration dry-run, migration execute, deploy dry-run, deploy execute, smoke và provider evidence.

Tenant release không dùng Gateway `version_id`. Gateway release không migrate D1.

## 6. Failure handling

### Candidate build failure

- Không có version để promote.
- Đọc failed step thật.
- Không chạy production release.

### Candidate upload failure

- Build có thể đã PASS nhưng `release.json` không hợp lệ hoặc không tồn tại.
- Không tự truy tìm một version gần nhất để thay thế.

### Production verification failure

- Nếu `versions view` không khớp `version_id`, dừng release.
- Không deploy version khác.

### Production smoke failure

- Ghi lại run ID, version ID và endpoint status.
- Không tuyên bố release thành công.
- Xem xét rollback về version đã biết tốt bằng quy trình riêng sau khi có yêu cầu rõ ràng.

## 7. Evidence

Gateway candidate artifact tối thiểu:

- `release.json`;
- `state.txt`;
- `build.log`;
- `stage.log`;
- `upload.log`;
- Wrangler NDJSON output.

Gateway production artifact tối thiểu:

- `state.txt`;
- `version.json`;
- `deploy.log`;
- health/root/guest-boot responses;
- Wrangler NDJSON output.

Không commit các artifact này vào repository.

## 8. Handoff report

Sau mỗi release-related work batch, báo rõ:

- branch và PR;
- exact HEAD;
- candidate run ID và version ID nếu candidate đã chạy;
- production run ID nếu production đã chạy;
- smoke result;
- file workflow/runbook đã sửa;
- có hay không deploy, migration, secret change và rollout activation.
