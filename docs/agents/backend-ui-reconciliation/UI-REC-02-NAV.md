# UI-REC-02 — ALUMDOOR SIDEBAR / MASTER DATA IA

Branch: `agent/ui-rec-02-sidebar-master-20260811`
Fork point: `program/backend-ui-reconciliation-20260811@c4209b8318ac36110ca84094d905ce724ffae3d5`
Status: BOOTSTRAPPED
Risk: FAST/STANDARD depending on whether changes remain declarative metadata only.

## Mission

Rebuild AlumDoor navigation/catalog from current backend capability truth so operator-maintained masters and core operational surfaces are discoverable, role-correct and free of dead/superseded entries.

## Read first

1. exact branch/main state;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
4. `docs/agents/backend-ui-reconciliation/PROGRAM.md`;
5. UI-REC-01 matrix/findings when available;
6. current AlumDoor brief/app manifests/nav renderer/master-data grouping logic;
7. historical sidebar branches only as behavior evidence, never as live baseline.

## Primary target

Audit and materialize a coherent IA around:

```text
Điều hành
Bán hàng
Mua hàng
Kho
Sản xuất
Chấm công & ca
Lương
Công nợ / Kế toán
Bảo hành / Dịch vụ
Báo cáo
Danh mục
Hệ thống
```

`Danh mục` must expose every confirmed operator-maintained master needed by current workflows. Sales examples to verify from exact backend include `Sales Option`, `Sales Package`, `Price List`, `Item Price`, `Pricing Rule`, Item/Item Group/UOM and door-specific configuration masters.

## Rules

- do not add every DocType to navigation;
- system-owned/internal/child/technical doctypes may remain hidden with an evidence-backed reason;
- role restrictions must match server permission expectations;
- navigation remains declarative in manifest/brief;
- do not hard-code AlumDoor menus into generic React shell;
- generated brief JSON must come from source generators.

## Allowed zones

- AlumDoor source brief / manifest nav declarations;
- `server/scripts/build-alumdoor-v2-brief.mjs` where nav/catalog source is materialized;
- generated AlumDoor brief through the generator;
- focused navigation/master-data tests and docs.

## Forbidden

- shared Grid runtime;
- Sales/Pricing/Stock/Payroll controller logic;
- unrelated form composition.

## Acceptance

- no P0 operator master is unreachable;
- dead/superseded nav entries are removed/hidden with tests;
- role visibility is consistent with server intent;
- `/master-data` or equivalent catalog derives the intended set from declarations;
- exact generated metadata is reproducible;
- no production install/deploy; no merge without applicable gate.

## Startup prompt

`Đọc docs/agents/backend-ui-reconciliation/UI-REC-02-NAV.md, PROGRAM.md và Forge Enterprise Completion Skill. Audit exact current AlumDoor nav/master-data declarations against backend truth. Bổ sung master còn thiếu, đặc biệt commercial masters nếu confirmed, dọn dead entries, tổ chức sidebar theo domain, giữ role-aware và metadata-first. Không sửa shared Grid hay domain controller. Regenerate artifacts từ source. Không merge/deploy.`
