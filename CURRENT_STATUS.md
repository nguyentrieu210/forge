# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head: `5d73dcfbd6e0d24776cb4233fc86a45ccd507f53`.
- Handoff branch: `docs/record-production-first-merge-20260801`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Production-first delivery — ACTIVE

PR `#108` đã squash-merge.

- Exact PR head: `508993c8b0868cfac323e6e06c7a399ca4f44b07`.
- Merge SHA: `5d73dcfbd6e0d24776cb4233fc86a45ccd507f53`.
- CI `30654314727`: SUCCESS.
- PR Validation `30654314760`: SUCCESS.
- Inventory and Manufacturing CI `30654314685`: SUCCESS.
- Production observation `30654314783`: SKIPPED đúng phạm vi.

`DELIVERY_POLICY.md` hiện là policy canonical:

- code request mặc định bao gồm merge và production deploy;
- không hỏi approval lặp lại;
- preview/staging là ngoại lệ, không phải done condition;
- chỉ deploy exact verified SHA;
- production evidence phải có target identity, run ID, version/deployment ID và smoke;
- destructive infrastructure/data boundary vẫn cần lệnh riêng.

## Alumdoor app Worker auto release

`.github/workflows/release-alumdoor-app.yml` hiện:

- tự chạy trên merged/default push khi app Worker hoặc dependency server allowlist thay đổi;
- hỗ trợ manual exact `target_sha`;
- build server và focused regression;
- Wrangler strict dry-run;
- deploy `cloudforge-app-alumdoor` vào `cloudforge-production`;
- verify identity và bindings `PLATFORM`, `AI`;
- ghi step summary và artifact;
- không phụ thuộc issue/PR comment API.

Policy merge không sửa app Worker source/dependency allowlist nên không cần redeploy cùng binary chỉ vì thay runbook.

## Forge Skills runbook 0.2.0

Pack ngoài repository đã đồng bộ production-first:

- `npm test`: PASS;
- `npm run build`: PASS, 28 files;
- `npm run validate`: PASS, 7 skills;
- ZIP SHA-256: `6183dedc51d6258f0618feb95db87d27500d2f388671410ffb24595f4b6dee90`.

## Production hiện tại

### Alumdoor app Worker

- Feature merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Release run `30651057535`, job `91224118455`: SUCCESS.
- Worker `cloudforge-app-alumdoor`.
- Namespace `cloudforge-production`.
- Version ID `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.

### Tenant Worker

- Run `30649182082`, job `91217965586`: SUCCESS.
- Worker `cloudforge-tenant-alu`.
- Version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Không dùng tenant evidence thay cho app Worker.

## MetaForge UI

- PR `#81` vẫn ở branch `feat/metaforge-misa-workspace-tabs`.
- Known head `1ed3d8e578e060984f68549eb868dfb550eb4167` từng fail dedicated Meta browser QA dù lint/test/typecheck/build pass.
- Prototype có phần mock/demo; chưa được coi là production UI.
- Frontend target, hostname, `VITE_LIVE` build mode và live permission mapping chưa được ghi đầy đủ.
- Theo policy mới, task UI chỉ hoàn tất sau live integration, green CI, production deploy và authenticated smoke.

## Gate hiện tại

1. Merge handoff-only PR ghi nhận policy merge.
2. Quay lại PR `#81`.
3. Sửa Meta browser QA bằng evidence thật.
4. Xác định và tự động hoá frontend production target.
5. Merge, deploy production, chạy authenticated smoke.
6. Sau đó chuẩn hoá tenant Worker auto production và observation reporting.

## Safety

- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không mutate D1, KV hoặc dữ liệu nghiệp vụ trong policy/handoff changes.
