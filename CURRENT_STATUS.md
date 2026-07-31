# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/production-first-delivery-runbook`.
- Mục tiêu branch: đổi delivery model từ preview/staging-first sang production-first, ít hỏi lại và có evidence đầy đủ.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Delivery policy

`DELIVERY_POLICY.md` là policy mới trên branch:

- yêu cầu làm code mặc định bao gồm merge và deploy production;
- không hỏi lại approval ở mỗi chặng;
- preview/staging là ngoại lệ, không phải done condition;
- required CI phải xanh trên exact SHA;
- production deploy phải có target identity, run ID, version/deployment ID và smoke;
- DNS, secret, resource deletion, irreversible migration/data activation và FIFO vẫn là destructive boundary cần lệnh riêng.

## Alumdoor app Worker workflow

`.github/workflows/release-alumdoor-app.yml` đã được chuyển từ workflow one-off phụ thuộc execution PR sang tự động production delivery.

### Trigger

- push/merge vào `hotfix/alumdoor-print-list-delete`;
- chỉ khi thay đổi:
  - `server/apps-src/alumdoor-worker/**`;
  - `server/src/**`;
  - `server/package.json`;
  - root `package.json`;
  - `pnpm-lock.yaml`;
- manual `workflow_dispatch` vẫn có `target_sha` để re-release đúng commit khi cần.

### Gate và evidence

- checkout đúng target SHA;
- verify Worker `cloudforge-app-alumdoor` và namespace `cloudforge-production`;
- install dependency bằng lockfile;
- build server;
- focused Sales Unicode regression;
- Wrangler strict dry-run;
- live deploy;
- Cloudflare script identity và bindings `PLATFORM`, `AI`;
- `$GITHUB_STEP_SUMMARY` và artifact evidence;
- không dùng issue-comment API làm điều kiện kết luận.

Workflow commit: `e7a28ff9153b03da8b015f57a00c153dc24bbcf2`.

## Forge Skills runbook 0.2.0

Bản pack ngoài repository đã được cập nhật đồng bộ:

- production-first flow;
- initial code request là authorization cho merge/deploy trừ khi user opt-out;
- staging optional;
- CI và deploy tách trusted boundary;
- handoff ghi production evidence;
- BRD/build giảm approval ceremony, chỉ dừng ở destructive ambiguity.

Validation:

- `npm test`: PASS;
- `npm run build`: PASS, 28 files;
- `npm run validate`: PASS, 7 skills version `0.2.0`;
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
- Không dùng evidence này thay cho app Worker.

## MetaForge UI

- PR `#81` đang ở branch `feat/metaforge-misa-workspace-tabs` và vẫn tách khỏi policy branch.
- Prototype hiện có phần mock/demo; không được gọi là production UI.
- Exact known head `1ed3d8e578e060984f68549eb868dfb550eb4167` từng fail dedicated Meta browser QA dù lint/test/typecheck/build pass.
- Production frontend target và live permission mapping chưa được ghi rõ trong repository.
- Theo policy mới, việc UI chỉ hoàn tất sau khi sửa QA, nối live entrypoint, xác định target, deploy production và authenticated smoke.

## Gate hiện tại

1. Mở PR policy branch.
2. Chạy required CI trên exact branch head.
3. Merge tự động khi xanh và mergeable.
4. Không có production deploy cho policy-only change vì path app Worker không thay đổi.
5. Sau merge, thay đổi app Worker tương lai sẽ tự deploy production.
6. Tiếp tục chuẩn hoá auto production cho tenant Worker và frontend.

## Safety

- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không mutate D1, KV hoặc dữ liệu nghiệp vụ trong policy change.
