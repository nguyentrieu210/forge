# Alumdoor Procurement Tabs — UI / Meta Audit

Date: 2026-08-05

## Requested surface

The procurement workspace must expose exactly these user-facing tabs:

1. `Quy trình` — supplied by `WorkspaceAppShellV2`.
2. `Mua hàng` — inline Purchase Order creation, not list-first and not modal-first.
3. `Nhập hàng` — the existing FIFO receipt flow.
4. `Báo cáo` — existing report `Mua hàng theo nhà cung cấp`.
5. `Lịch sử mua hàng` — the canonical Purchase Order list/history.

Legacy daily entries `Purchase Receipt`, `Nhập nhôm hàng loạt`, and `Đối soát giao hàng NCC` remain installed/callable but are removed from the daily procurement tab strip.

## Ownership decision

| Concern | Owner | Decision |
| --- | --- | --- |
| Tab rendering | shared `WorkspaceAppShellV2` | unchanged |
| Tab membership / label / order | app metadata | `alumdoor-v2.navigation.json` |
| Inline purchase form | generic `AppAction` renderer | new metadata action `tao-don-mua` |
| Repeating purchase lines | generic `BulkTransaction` metadata transport | no app-specific React grid |
| Purchase business document | canonical `Purchase Order` | unchanged |
| Quantity / barem derivation before create | Alumdoor worker controller | compose canonical snapshots from Item + Material Specification |
| Purchase validation / permissions / ledger authority | platform canonical controllers | unchanged |

This follows the declaration-first rule: app declaration first, generic metadata transport second, shared renderer unchanged, no bespoke Alumdoor React workspace.

## Metadata contract

`alumdoor-v2.navigation.json` owns the visible procurement order:

- `action:tao-don-mua`
- `action:nhap-nhom-fifo`
- `report:Mua hàng theo nhà cung cấp`
- `Purchase Order`

The shell prepends its generic `Quy trình` tab, yielding the requested five tabs.

The navigation sidecar transport is extended generically so a sidecar may:

- override presentation metadata for declared reports as it already does for DocTypes/actions;
- prepend explicit `navigation.items` ordering while preserving the remaining existing declaration order.

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

## Release classification

This is not UI-only because a new worker write method is introduced. It is therefore a candidate change requiring normal review/CI and explicit authorization before merge/deploy. No production mutation is performed by this change set itself.

## Regression locks

- procurement navigation contract test asserts the four metadata tabs, their order/labels, and that hidden legacy entries remain installed;
- purchase-order-create test asserts aluminium barem/conversion derivation and rejects incomplete standard-item quantity before document creation.
