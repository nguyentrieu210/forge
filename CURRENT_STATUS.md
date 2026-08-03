# CURRENT STATUS

Ngày cập nhật: **2026-08-03**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Không suy trạng thái từ tài liệu cũ nếu GitHub đã thay đổi.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default/canonical branch: `main`.
- Forge baseline: **0.2.0 — Enterprise Parallel Baseline**.
- **Open pull requests: 0** sau đợt đóng toàn bộ PR còn mở ngày 2026-08-03.
- Không có PR/branch delivery nào được coi là công việc đang active.
- Các branch cũ vẫn được giữ làm lịch sử/audit/cherry-pick reference; **không tự tiếp tục hoặc reopen** chỉ vì branch còn tồn tại.
- Mọi công việc mới phải bắt đầu bằng việc đọc exact current `main`, sau đó tạo **branch/PR mới** phù hợp với scope mới.

## DONE — WS00–WS17 convergence

- Phase WS00–WS17 đã đóng ở repository level; canonical deltas đã merge vào `main`.
- Bản ghi hội tụ: `docs/agents/WS00_17_CONVERGENCE_20260803.md`.
- Shared HRM vẫn là application đầy đủ; Alumdoor chỉ chọn surface phù hợp ở product/shell layer, không fork core.
- Alumdoor tiếp tục là reference vertical chạy trên Forge; primitive generic phải nằm ở platform/domain package khi có bằng chứng tái sử dụng.

## DONE — UI/Matrix convergence foundation

- Matrix metadata/runtime/pricing foundation đã được hội tụ vào `main` qua wave UI00–UI05.
- Các PR follow-up Matrix từng mở sau đó (`#419`, `#423`, `#424`) đã được **đóng không merge** trong đợt repo reset ngày 2026-08-03.
- Không coi các branch Matrix đó là active queue. Nếu cần Matrix wave mới, audit current `main` rồi mở branch mới.

## DONE — Alumdoor current product direction

- Alumdoor production/reference vertical đã có các đợt full sync và UI release trước đây với release evidence riêng trong repo.
- Mobile Alumdoor hiện được định hướng về sales/receivables/delivery use case; các luồng cũ không còn được coi là backlog chỉ vì branch/PR lịch sử còn tồn tại.
- HRM package trên current `main` đã tiến xa hơn các handoff cũ (ví dụ package hiện ở dòng `1.8.x`); không dùng version/permission assumptions từ PR cũ làm current truth.

## Repository reset — 2026-08-03

Theo quyết định của user, toàn bộ PR còn mở được đóng để repo trở về trạng thái sạch về mặt review queue. Batch đóng gồm các PR gần nhất như:

- repo/workflow cleanup: `#427`;
- Matrix follow-up/validation: `#419`, `#423`, `#424`;
- Alumdoor auth/Employee Lite follow-up: `#405`, `#388`;
- UI grammar planning: `#370`;
- Procurement/accounting/inventory/manufacturing/ledger legacy work: `#295`, `#286`, `#278`, `#267`, `#216`, `#208`, `#201`, `#199`.

Các PR trên **không được merge trong thao tác đóng**. Branch/history vẫn còn để tra cứu nếu một task mới cần reuse một phần.

## Release/workflow truth

- Workflow release chính hiện có trên `main`: `.github/workflows/alu-build-deploy.yml`.
- `main` vẫn còn `.github/workflows/deploy-ui-once.yml` và `.github/workflows/tmp-alumdoor-purchase-funding-release.yml` vì cleanup PR `#427` đã được đóng **không merge** theo quyết định reset toàn bộ PR.
- Vì vậy không được suy diễn rằng cleanup workflow đã vào `main`.
- Production proof vẫn phải dựa trên exact release SHA + `/health` + `/release.json`/evidence tương ứng; merge state không tự động là deploy proof.

## Active backlog

**Không có backlog delivery nào đang active.**

Các capability/gap cũ trong `NEXT_TASKS.md`, workstream handoff hoặc PR lịch sử chỉ là **reference/history**, không phải lệnh tiếp tục. Khi user mở một việc mới:

1. đọc exact current `main`;
2. audit code/evidence hiện tại;
3. chỉ reuse/cherry-pick lịch sử nếu còn đúng contract;
4. tạo branch/PR mới cho task đó;
5. không resurrect PR cũ làm canonical chỉ vì nó từng gần hoàn tất.

## Guardrails

- Không sửa production secrets/DNS hoặc mutate customer data khi chưa có yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
- UI-only có thể theo policy UI release hiện hành; non-UI/shared/backend/migration/ops vẫn cần gate phù hợp trước merge/deploy.
