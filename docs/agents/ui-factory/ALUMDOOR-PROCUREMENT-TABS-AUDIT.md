# Alumdoor Procurement Tabs — UI / Meta Audit

Date: 2026-08-05

## Requested surface

The procurement workspace must expose exactly these user-facing tabs:

1. `Quy trình` — supplied by `WorkspaceAppShellV2`.
2. `Mua hàng` — inline Purchase Order creation, not list-first and not modal-first.
3. `Nhập hàng` — inline Purchase Receipt Item child grid, with FIFO preview before commit.
4. `Báo cáo` — existing report `Mua hàng theo nhà cung cấp`.
5. `Lịch sử mua hàng` — the canonical Purchase Order list/history.

Legacy daily entries `Purchase Receipt`, `Nhập nhôm FIFO theo đơn cũ`, and `Đối soát giao hàng NCC` remain installed/callable but are removed from the daily procurement tab strip.

## Ownership decision

| Concern | Owner | Decision |
| --- | --- | --- |
| Tab rendering | shared `WorkspaceAppShellV2` | unchanged |
| Tab membership / label / order | app metadata | `alumdoor-v2.navigation.json` |
| Inline purchase form | generic `AppAction` renderer | metadata action `tao-don-mua` |
| Inline receipt form | generic `AppAction` renderer | metadata action `nhap-nhom-hang-loat` |
| Repeating purchase/receipt lines | generic `BulkTransaction` metadata transport | no app-specific React grid |
| Purchase business document | canonical `Purchase Order` | unchanged |
| Receipt business document | canonical `Purchase Receipt` | unchanged |
| Quantity / barem derivation before create | Alumdoor worker controller | compose canonical snapshots from Item + Material Specification |
| Purchase validation / permissions / ledger authority | platform canonical controllers | unchanged |

This follows the declaration-first rule: app declaration first, generic metadata transport second, shared renderer unchanged, no bespoke Alumdoor React workspace for the visible purchase/receipt entry tabs.

## Metadata contract

`alumdoor-v2.navigation.json` owns the visible procurement order:

- `action:tao-don-mua`
- `action:nhap-nhom-hang-loat`
- `report:Mua hàng theo nhà cung cấp`
- `Purchase Order`

The shell prepends its generic `Quy trình` tab, yielding the requested five tabs.

The legacy `action:nhap-nhom-fifo` remains installed/direct-addressable but is not part of the daily tab strip. `action:nhap-nhom-hang-loat` is the visible `Nhập hàng` entry so the child-grid metadata declared in `alumdoor-v2.actions.json` is actually the user-facing receipt surface.

No runtime route table or customer-specific label map is added.

## Inline Mua hàng contract

The `tao-don-mua` AppAction declares header fields and a `BulkTransaction` item grid in metadata. The generic ActionScreen renders the form in-page.

On commit, `alumdoor.purchase.create_order`:

1. reads Item master data under the current user identity;
2. for aluminium, reads Material Specification and derives `theoretical_kg_per_m`, `theoretical_kg`, quantity, amount and dynamic stock conversion;
3. for standard items, derives the declared purchase-UOM conversion from Item metadata;
4. for square-metre finished goods, derives billable quantity from dimensions when applicable;
5. creates one canonical `Purchase Order` **draft** through the platform resource API.

It does not submit the document and does not own purchase ledger logic.

## Inline Nhập hàng contract

The `nhap-nhom-hang-loat` AppAction declares a compact receipt header plus a `Purchase Receipt Item` child-grid presentation. The generic rich action renderer owns preview-before-commit UX and renders the line metadata in-page.

The existing Alumdoor bulk FIFO worker remains backend authority for the current FIFO allocation behavior. This navigation change does not expand backend support to non-aluminium FIFO and does not introduce a second receipt, stock or procurement ledger.

## Release classification

This patch is metadata/presentation only. It changes which already-installed action is visible in the procurement tab strip and bumps the compiled Alumdoor package identity to `2.2.8`. It does not change backend business authority, schema, migration, ledger or permissions.

## Regression locks

- procurement navigation contract test asserts the four metadata tabs, their order/labels, visible child-grid receipt action, and that hidden legacy entries remain installed;
- purchase-order-create test continues to assert aluminium barem/conversion derivation and rejects incomplete standard-item quantity before document creation.
