# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi đồng bộ Inventory: `df2dffc3d3303841a76993b4b8acf8bf2e344e17`.
- Working branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Pull request: `#49` — `feat(inventory): canonical physical stock identity and warehouse roles`.
- GitHub là nguồn sự thật cho code, CI và trạng thái release.

## Inventory Slice B

- Canonical physical identity được server xây dựng từ Item, inventory mode/profile, màu, tình trạng, đời, kích thước và physical count.
- Batch/serial/Aluminium Lot lineage, exact bundle quantity và warehouse-role rules đã có.
- `stock_ledger_entries` vẫn là append-only quantity/value ledger duy nhất; không có parallel stock book hoặc migration mới.
- Exact reversal và company-wide inventory coordinator cho Stock Entry/Work Order submit/cancel đã có.
- Review `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`: **97/100**, Critical **0**, High **0**.
- Sync commits với current default: `2f31b2dc74c6f44ca119bb9a53fe7bc13cae844d` và merge sync cuối chứa `df2dffc3d3303841a76993b4b8acf8bf2e344e17`.
- Default được dùng làm lịch sử nền; chỉ implementation/test/review riêng của Slice B được phủ lại.

## Stack tiếp theo

- PR `#50` Manufacturing Slice C đang stack trên branch Slice B; chỉ retarget lên default sau khi #49 merge.
- PR `#82` Inventory Slice D đang stack trên Slice C; chỉ retarget sau khi #50 merge.
- Không merge vượt dependency.

## Default safety/release state được giữ lại

- Sales Unicode Item Price PR `#91` merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Release preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`; không tự động deploy.
- Production observation run `30648098602`: health/root PASS, guest boot expected `403`; workflow reporting từng lỗi `403` ở bước tự comment, không phải endpoint failure.
- Purchase/FIFO checksum lock PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.

## Việc tiếp theo

1. Chờ exact-head CI của #49 PASS sau merge sync cuối.
2. Kiểm `behind_by=0`, mergeability và review threads rồi merge #49 theo approval hiện tại.
3. Retarget #50 lên default mới, chạy lại exact-head CI và chỉ merge khi sạch.
4. Retarget #82 sau #50; tiếp tục tenant report endpoint, physical-stock UI và reports.
5. Không deploy Cloudflare, migrate/mutate tenant hoặc sửa production secrets/DNS trong chuỗi merge này.

## Không commit

- `.env`, `.dev.vars`, secrets.
- `server/work/`, `tmp/`.
- backup SQL, generated evidence hoặc artifacts.
