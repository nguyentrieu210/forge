# Forge

Forge là nền tảng ERP/enterprise operating platform metadata-driven, multi-tenant, cloud-native trên Cloudflare. CloudForge là authoritative backend/kernel; MetaForge là Desk/runtime/builder; API giữ compatibility theo Frappe shape; App Factory và shared ERP/domain packages cho phép đóng gói capability/vertical mà không fork core authorities. Alumdoor là reference vertical. Mục tiêu sản phẩm là độ phủ ERP/HCM/CRM/WMS/MRP/BPM/BI/compliance với khả năng verticalization nhanh.

## Đọc repo theo thứ tự

1. `SENTRUX_MAP.md` — bản đồ repo, ownership, entrypoint và dependency boundary cho người/AI agent.
2. `CURRENT_STATUS.md` — checkpoint đã xác minh gần nhất; exact GitHub state luôn thắng snapshot prose.
3. `NEXT_TASKS.md` — queue hiện hành, không phải lịch sử dự án.
4. `PROJECT_CONTEXT.md` — các authority/invariant ổn định của sản phẩm.
5. `docs/README.md` — chỉ mục và retention policy của tài liệu.
6. `docs/ARCHITECTURE.md` — kiến trúc hệ thống hiện hành.
7. `skills/forge-enterprise-completion/SKILL.md` — execution policy cấp platform/domain/vertical cho agent.
8. `skills/forge-ui-change-routing/SKILL.md` — route thay đổi UI về đúng owner/source-of-truth.
9. `skills/forge-ui-design/SKILL.md` — thiết kế/polish/review operational UI và custom TSX sau khi đã route đúng owner.
10. `skills/forge-alumdoor-local-deploy/SKILL.md` — deploy code `agent-live` xuống `C:\alumdoor`, build/restart/health local và giữ nguyên D1.
11. Tài liệu domain/vertical/evidence liên quan trực tiếp tới task.

Không suy live state từ tài liệu cũ, tên branch, số PR, release note hay capability snapshot. Khi có mâu thuẫn: **exact code + migration + tests + GitHub state thắng prose**.

## Cấu trúc chính

| Path | Vai trò |
|---|---|
| `client/` | MetaForge runtime, mobile apps, UI packages và Frappe adapter |
| `server/` | Workers, Document Kernel, Frappe facade, ERP/domain packages, migrations và release tooling |
| `apps/` | vertical/app composition ở cấp repo; hiện có Alumdoor |
| `docs/` | architecture, product/domain contracts, operations và retained evidence |
| `skills/` | execution policy, UI routing và design/review guidance cho AI agent |
| `qa/`, `validation/` | verification assets và gates |
| `.github/workflows/` | CI, validation, release và Sentrux automation |
| `.sentrux/rules.toml` | machine-readable architecture guardrails cho Sentrux |

Chi tiết ownership và đường phụ thuộc nằm trong `SENTRUX_MAP.md`.

## Các authority không được fork

- Business/document writes đi qua canonical Document Kernel/aggregate path.
- GL/Payment Ledger và Stock Ledger là shared authoritative ledger families.
- Tenant, permission, identity và security authority nằm server-side.
- Pricing/stock/payroll/manufacturing generic thuộc shared domain/platform; vertical chỉ giữ logic thực sự đặc thù ngành.
- Migration đã có khả năng applied là append-only; không rewrite lịch sử.
- Frontend dùng metadata/runtime shared; client permission chỉ là UX, không phải security boundary.

## Chạy local

```bash
corepack enable
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

Validation theo blast radius:

```bash
pnpm run validate:fast
pnpm run validate:standard
pnpm run validate:critical
```

Sentrux:

```bash
sentrux scan .
sentrux check .
sentrux gate --save .
# sửa code
sentrux gate .
```

## Documentation discipline

`main` chỉ nên giữ current authority, durable contracts, source/legal locks, release/recovery evidence và final convergence/audit records. Prompt, open-order, branch handoff, probe, experiment và status snapshot đã superseded phải được xóa hoặc cô đọng khi wave kết thúc. Git/PR history giữ provenance; không cần để markdown stale làm nhiễu agent.

## Production boundary

Merge source không đồng nghĩa production deploy. Production migration, restore/PITR, secrets/DNS/provider mutation, customer-data write/cutover và non-UI deploy cần authorization rõ theo runbook/policy hiện hành.
