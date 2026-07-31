# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head sau policy merge: `5d73dcfbd6e0d24776cb4233fc86a45ccd507f53`.
- Working branch handoff: `docs/record-production-first-merge-20260801`.
- GitHub và Cloudflare provider state là nguồn sự thật cho code, CI và release.
- Đọc trước: `DELIVERY_POLICY.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`.

## Production-first policy — MERGED

PR `#108` đã squash-merge production-first delivery policy.

- PR head: `508993c8b0868cfac323e6e06c7a399ca4f44b07`.
- Merge SHA: `5d73dcfbd6e0d24776cb4233fc86a45ccd507f53`.
- Branch compare trước merge: ahead 5, behind 0 so với base `f27d4c6efe37a0cca91e3f1672a199d33b09cbab`.
- Exact-head CI:
  - CI `30654314727`: SUCCESS;
  - PR Validation `30654314760`: SUCCESS;
  - Inventory and Manufacturing CI `30654314685`: SUCCESS;
  - Cloudflare Production Smoke Observation `30654314783`: SKIPPED đúng phạm vi.

Policy canonical nằm ở `DELIVERY_POLICY.md`:

`implement -> verify -> PR -> required CI -> merge -> production deploy -> production smoke -> handoff`

- Không hỏi approval lặp lại ở từng bước.
- Preview/staging không phải gate mặc định và không được dùng thay cho production.
- Yêu cầu làm code bao gồm merge/deploy production trừ khi người dùng ghi rõ code-only/no-merge/no-deploy.
- Không deploy commit đỏ, stale, conflict, thiếu required check, thiếu binding/secret hoặc không có recovery hợp lệ.
- DNS, secret, resource deletion, irreversible migration/data activation và FIFO vẫn là destructive boundary cần lệnh riêng.

## Alumdoor app Worker auto production workflow

`.github/workflows/release-alumdoor-app.yml` đã được đổi từ execution PR one-off sang trusted production workflow:

- trigger khi merged code liên quan xuất hiện trên default branch;
- manual dispatch vẫn hỗ trợ exact `target_sha`;
- checkout đúng SHA;
- install, build server, focused regression;
- Wrangler strict dry-run;
- deploy `cloudforge-app-alumdoor` vào `cloudforge-production`;
- verify script identity và bindings `PLATFORM`, `AI`;
- ghi `$GITHUB_STEP_SUMMARY` và artifact evidence;
- không phụ thuộc PR comment API.

Policy-only merge không thay đổi app Worker source/dependency path, vì vậy không cần release lại sản phẩm chỉ để thay văn bản và workflow.

## Forge Skills runbook 0.2.0

Forge Skills pack ngoài repository đã được nâng lên production-first:

- `npm test`: PASS;
- `npm run build`: PASS, bundle 28 files;
- `npm run validate`: PASS, 7 skills version `0.2.0`;
- artifact: `ForgeSkills-production-first-0.2.0.zip`;
- SHA-256: `6183dedc51d6258f0618feb95db87d27500d2f388671410ffb24595f4b6dee90`.

Repository chưa vendor pack vào `.forge/`; cài pack là task riêng sau khi xử lý product UI và các release workflow còn thiếu.

## Production evidence hiện tại

### Alumdoor app Worker

- Feature merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Release run: `30651057535`.
- Worker: `cloudforge-app-alumdoor`.
- Namespace: `cloudforge-production`.
- Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Build, regression, dry-run, live deploy, identity, namespace và bindings: PASS.

### Tenant Worker

- Run `30649182082`, job `91217965586`: SUCCESS.
- Worker `cloudforge-tenant-alu`, version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Không dùng evidence tenant Worker thay cho app Worker.

## P0 tiếp theo — MetaForge UI PR #81

PR `#81` vẫn là feature branch riêng. Theo policy mới, không dừng ở demo hoặc preview.

1. Đọc lại handoff trên branch `feat/metaforge-misa-workspace-tabs`.
2. Lấy exact head/base/CI mới nhất.
3. Sửa dedicated Meta browser QA bằng log/trace thật.
4. Nối hành trình cần thiết vào live entrypoint với permission thật.
5. Xác định đúng frontend production target, hostname và `VITE_LIVE` build mode.
6. Thêm protected auto-production workflow theo path UI.
7. Merge khi required CI xanh.
8. Deploy production và authenticated desktop/mobile smoke.

Không deploy backend Worker để giả vờ frontend đã live.

## Safety

- Không sửa production secret hoặc DNS.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
