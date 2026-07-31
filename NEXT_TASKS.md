# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

## P0 — merge production-first delivery policy

### Mục tiêu

Đưa `DELIVERY_POLICY.md` và workflow Alumdoor app Worker mới vào default branch để mọi session sau không quay lại preview/staging-first hoặc hỏi approval lặp lại.

### File

- `DELIVERY_POLICY.md`
- `.github/workflows/release-alumdoor-app.yml`
- `AI_HANDOFF.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`

### Việc làm

1. Mở PR từ `chore/production-first-delivery-runbook` vào `hotfix/alumdoor-print-list-delete`.
2. Chạy CI trên exact head.
3. Nếu fail, đọc đúng log và sửa direct cause; không hạ gate.
4. Khi required checks xanh và PR mergeable, merge luôn; không hỏi lại.
5. Xác nhận policy-only merge không kích hoạt nhầm app Worker deploy vì không thay đổi path app Worker/dependency được allowlist.

### Done condition

- PR merge.
- Exact-head required CI xanh.
- Default branch chứa policy và workflow mới.
- Không có secret/DNS/data mutation.

## P0 — hoàn tất PR #81 rồi deploy MetaForge UI production

### Mục tiêu

Không dừng ở demo hoặc preview. Giao diện workspace phải xuất hiện trên product thật.

### Việc làm

1. Đọc lại `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` trên branch `feat/metaforge-misa-workspace-tabs`.
2. Lấy exact head, base head và CI mới nhất.
3. Lấy log/trace của dedicated Meta browser QA và sửa direct cause.
4. Xác định phần nào phải nối vào `LiveApp.tsx`, application catalog và permission thật.
5. Xác định frontend production target:
   - Cloudflare Pages/Worker project;
   - production hostname;
   - build command và `VITE_LIVE` mode;
   - secret/binding names;
   - rollback.
6. Thêm protected auto-production workflow theo path UI.
7. Merge khi required checks xanh.
8. Tự deploy production và chạy authenticated desktop/mobile smoke.
9. Báo URL, merge SHA, workflow run ID, deployment/version ID và smoke result.

### Done condition

- Không còn route chỉ tồn tại trong mock/demo cho hành trình đã yêu cầu.
- CI xanh trên exact SHA.
- Production UI live và authenticated smoke PASS.

## P0 — chuẩn hoá tenant Worker auto production

### Mục tiêu

Mọi thay đổi tenant Worker sau merge tự release đúng tenant mà không tạo execution PR thủ công.

### Việc làm

1. Xác định workflow tenant hiện tại, target mapping và path filters.
2. Giữ backup, recorded migrations, dry-run và health/auth smoke.
3. Trigger từ protected merge/default push hoặc trusted dispatch đúng SHA.
4. Ghi step summary và artifact; không phụ thuộc comment API.
5. Không trộn app Worker evidence với tenant Worker evidence.

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
