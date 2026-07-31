# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/production-first-delivery-runbook`.
- GitHub và Cloudflare provider state là nguồn sự thật cho code, CI và release.
- Đọc trước: `DELIVERY_POLICY.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`.

## Quyết định delivery mới

Mặc định mọi yêu cầu làm code bao gồm toàn bộ chuỗi:

`implement -> verify -> PR -> required CI -> merge -> production deploy -> production smoke -> handoff`

- Không hỏi lại approval ở từng bước.
- Preview/staging không còn là gate mặc định và không được dùng thay cho production.
- Chỉ dùng preview/staging khi người dùng yêu cầu, provider bắt buộc, target chưa xác định hoặc có rủi ro migration/data/permission không rollback an toàn.
- Không deploy commit đỏ, stale, conflict, thiếu required check, thiếu binding/secret hoặc không có recovery hợp lệ.
- Các hành động phá huỷ như đổi DNS/secret, xoá resource, bật FIFO hoặc migration không recovery vẫn cần lệnh riêng.

Chi tiết nằm trong `DELIVERY_POLICY.md`.

## Workflow đã đổi

`.github/workflows/release-alumdoor-app.yml` đã được đổi từ execution PR một lần sang production workflow tự động:

- trigger khi push/merge vào default branch có thay đổi Alumdoor app Worker hoặc dependency server liên quan;
- hỗ trợ manual dispatch với `target_sha` khi cần phục hồi/re-release đúng SHA;
- checkout đúng target SHA;
- install, build server, chạy focused regression;
- Wrangler strict dry-run;
- deploy `cloudforge-app-alumdoor` vào dispatch namespace `cloudforge-production`;
- xác minh provider script identity và bindings `PLATFORM`, `AI`;
- ghi `$GITHUB_STEP_SUMMARY` và upload artifact evidence;
- không còn phụ thuộc vào PR đặc biệt hoặc comment API.

Workflow change commit đầu tiên: `e7a28ff9153b03da8b015f57a00c153dc24bbcf2`.

## Forge Skills runbook

Forge Skills pack ngoài repository đã được nâng từ `0.1.0` lên `0.2.0` theo production-first delivery:

- `npm test`: PASS;
- `npm run build`: PASS, bundle 28 files;
- `npm run validate`: PASS, 7 skills;
- artifact: `ForgeSkills-production-first-0.2.0.zip`;
- SHA-256: `6183dedc51d6258f0618feb95db87d27500d2f388671410ffb24595f4b6dee90`.

Repository hiện chưa vendor pack vào `.forge/`; việc cài pack là task riêng sau khi policy PR xanh để tránh trộn generated files vào workflow change.

## Production evidence đang giữ nguyên

### Alumdoor app Worker

- Feature merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Release run: `30651057535`.
- Worker: `cloudforge-app-alumdoor`.
- Namespace: `cloudforge-production`.
- Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Build, focused regression, dry-run, live deploy, identity, namespace và bindings: PASS.

### Tenant Worker

- Run `30649182082`, job `91217965586`: SUCCESS.
- Worker `cloudforge-tenant-alu`, version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Đây không phải bằng chứng Alumdoor app Worker đã cập nhật.

## UI / MetaForge

PR `#81` vẫn là nhánh feature riêng. Không coi demo `App.tsx` là production UI. Trước deploy UI phải:

1. sửa dedicated browser QA trên exact head;
2. nối hành trình cần thiết vào live entrypoint với permission thật;
3. xác định đúng Cloudflare frontend target, hostname và `VITE_LIVE` build mode;
4. thêm protected production workflow theo `DELIVERY_POLICY.md`;
5. deploy và authenticated smoke production.

Không deploy backend Worker để giả vờ UI đã live.

## Việc tiếp theo

1. Mở PR cho branch `chore/production-first-delivery-runbook`.
2. Chạy CI trên exact head; sửa lỗi trực tiếp nếu có.
3. Merge khi required checks xanh; không chờ approval lặp lại.
4. Workflow mới sẽ áp dụng cho thay đổi Alumdoor app Worker sau merge.
5. Tiếp tục chuẩn hoá tenant Worker và frontend production mapping.
6. Sau đó quay lại PR `#81`, sửa QA/live integration và deploy production.

## Safety

- Không sửa production secret hoặc DNS.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
