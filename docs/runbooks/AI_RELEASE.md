# Forge Release Runbook for AI Agents

Ngày cập nhật: **2026-07-31**.

## Nguyên tắc

- Release chỉ khi người dùng yêu cầu rõ.
- PR xanh không đồng nghĩa được deploy.
- Candidate và production release là hai bước tách biệt.
- Exact SHA và provider version ID là bắt buộc.
- Cloudflare Git Build giữ tắt để tránh deploy song song.

## Gateway

### Candidate

1. Target SHA phải có required CI PASS.
2. Chạy `Gateway Release Candidate` thủ công.
3. Nhập exact SHA và `BUILD_GATEWAY_CANDIDATE`.
4. Workflow build/stage một lần và chạy `wrangler versions upload`.
5. Lưu `release.json`: SHA, immutable version ID, run ID, timestamp.
6. Candidate không chuyển traffic.

### Production

1. Đối chiếu SHA/version ID với cùng `release.json`.
2. Chạy `Gateway Production Release` thủ công.
3. Nhập exact SHA, version ID và `RELEASE_GATEWAY`.
4. Approve environment `production` nếu repository yêu cầu.
5. Workflow verify version, promote 100%, smoke và lưu provider evidence.
6. Không build frontend lại.

PASS chỉ khi đúng version ID được deploy, `/health=200`, `/=200`, guest boot `403` và evidence artifact tồn tại.

## Tenant

1. Target SHA có required CI PASS.
2. Có migration plan, backup và rollback plan.
3. Chạy `Tenant Production Release` thủ công.
4. Nhập `alu`, exact SHA và `RELEASE_TENANT`.
5. Không bỏ qua backup hoặc dry-run.
6. PASS khi backup artifact tồn tại, migration/deploy PASS, `/health=200`, guest boot `403` và có Tenant Worker version ID.
7. FIFO vẫn disabled trừ khi có approval kích hoạt riêng.

## Rollback

- Gateway: promote lại immutable version ID đã biết tốt, không build source mới.
- Tenant: đánh giá migration compatibility trước khi rollback version/commit.
- Nếu migration không backward-compatible, dừng và lập kế hoạch khôi phục dữ liệu.
- Ghi version cũ/mới, run ID và lý do rollback.

## Không được làm

- Không dùng version ID không khớp target SHA.
- Không deploy branch/SHA chưa được phê duyệt.
- Không hard-code SHA lâu dài.
- Không dùng PR validation để deploy.
- Không gọi candidate là production release.
- Không tuyên bố thành công khi thiếu smoke hoặc provider evidence.

Sau release cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` với SHA, version ID, run/job ID, backup/migration, smoke và rủi ro còn lại.
