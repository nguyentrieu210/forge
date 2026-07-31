# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

## P0 — hoàn tất PR #81 và deploy MetaForge UI production

### Mục tiêu

Không dừng ở demo hoặc preview. Workspace MetaForge phải xuất hiện trên product thật, đúng permission và có authenticated smoke.

### Việc làm

1. Đọc lại `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` trên branch `feat/metaforge-misa-workspace-tabs`.
2. Lấy exact head, base head, mergeability và CI hiện tại.
3. Lấy log/trace của dedicated Meta browser QA; sửa direct cause, không xoá test.
4. Xác định phần workspace phải nối vào `LiveApp.tsx`, application catalog và permission thật.
5. Xác định frontend production target:
   - Cloudflare Pages/Worker project;
   - production hostname;
   - build command;
   - `VITE_LIVE` mode;
   - required secret/binding names;
   - rollback.
6. Thêm trusted auto-production workflow theo path UI.
7. Merge khi exact-head required CI xanh.
8. Tự deploy production.
9. Chạy authenticated desktop/mobile smoke cho sidebar, tab, create route, refresh route và console/network.
10. Báo URL, merge SHA, workflow run ID, deployment/version ID và smoke result.

### Done condition

- Không còn hành trình đã yêu cầu chỉ tồn tại trong mock/demo.
- Required CI xanh trên exact SHA.
- Production UI live.
- Authenticated smoke PASS.

## P0 — chuẩn hoá tenant Worker auto production

### Mục tiêu

Mọi thay đổi tenant Worker sau merge tự release đúng tenant, không cần execution PR thủ công.

### Việc làm

1. Xác định workflow tenant hiện tại, target mapping và path filters.
2. Giữ backup, recorded migrations, dry-run và health/auth smoke.
3. Trigger từ protected default push hoặc trusted dispatch đúng SHA.
4. Ghi `$GITHUB_STEP_SUMMARY` và artifact.
5. Không phụ thuộc issue-comment API.
6. Không trộn app Worker evidence với tenant Worker evidence.

### Done condition

- Auto release chạy từ merged verified SHA.
- Worker/version/tenant identity được provider xác minh.
- Backup/migration/smoke evidence tồn tại.

## P0 — sửa production observation reporting

- Bỏ issue-comment API khỏi kết luận hoặc làm non-fatal.
- Dùng `$GITHUB_STEP_SUMMARY` và artifact.
- Giữ permissions tối thiểu.
- Chạy lại read-only observation.
- Xác nhận `health=200`, `root=200`, `guest_boot=403` và toàn job `success`.

Evidence cũ:

- run `30648098602`;
- job `91214435446`;
- artifact `8800251206`;
- endpoint smoke PASS, comment API `403`.

## P0 — authenticated Sales smoke

- Mở `https://alu.kairo.vn` bằng tài khoản thử.
- Sales Order mới, bảng giá `Giá niêm yết`.
- Item `TRỤC 114_1.8LY`, UOM `Mét`.
- Rate `180000 VND`, amount đúng, save-time pricing giữ cùng rate.
- Đổi Item/UOM/bảng giá để kiểm không giữ giá cũ hoặc lấy chéo.
- Cleanup chứng từ thử.
- Không ghi credential/cookie/token/dữ liệu khách hàng vào evidence.

## P1 — cài Forge Skills 0.2.0 vào repository

- Dùng pack `ForgeSkills-production-first-0.2.0.zip`.
- SHA-256 `6183dedc51d6258f0618feb95db87d27500d2f388671410ffb24595f4b6dee90`.
- Cài `FORGE.md`, `.forge/manifest.json`, `.forge/skills/**` bằng PR riêng.
- Chạy installer test, build và validate.
- Không trộn generated pack files vào feature PR.

## Đã hoàn tất

- PR `#108` production-first policy đã merge.
- Merge SHA `5d73dcfbd6e0d24776cb4233fc86a45ccd507f53`.
- Exact-head CI, PR Validation và Inventory/Manufacturing CI: SUCCESS.
- Alumdoor app Worker workflow đã chuyển sang automatic production release theo merged path changes.

## Destructive boundary

Các việc sau vẫn không tự làm nếu không có lệnh riêng:

- sửa production secret hoặc DNS;
- xoá Cloudflare resource;
- migration không backup/recovery;
- bật FIFO production;
- mutate dữ liệu khách hàng ngoài smoke an toàn.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- generated evidence;
- credential, cookie hoặc token.
