# Dependency Resolution — Alumdoor Item pricing detail tab

Date opened: **2026-08-07**  
Date resolved: **2026-08-07**  
Original PR: **#784**  
Resolution branch: `feat/alumdoor-item-price-tab-20260807`  
Risk: **STANDARD + NEW_CANDIDATE**

## Original need

Provide an app-scoped Item detail extension so Alumdoor can expose:

`Mặt hàng -> Thông tin | Giá`

without adding `if (doctype === "Item")` to shared `DoctypeWorkspace` or forking generic Form/CRUD behavior.

The `Giá` surface must reuse an existing price authority/UI path rather than create another competing Item Price source, and should include read-only purchase-price history.

## Resolved seam

The repository already has the required app-owned extension seam:

`client/apps/runtime/src/experience-registry.tsx -> resolveRuntimeDoctypeExperience()`.

That resolver is intentionally documented as the place where app-owned DocType detail/new presentation lives while shared Form/CRUD remains generic. The Alumdoor registry can therefore recognize `Item` without leaking that business name into `client/packages/views/src/app/DoctypeWorkspace.tsx`.

Resolution:

- existing Item records under the Alumdoor app resolve to `AlumdoorItemDetailWorkspace`;
- new Item creation remains on the generic `NewFormContainer` path;
- the `Thông tin` tab embeds the canonical `FormContainer` and remains mounted while switching tabs so unsaved form state is not discarded;
- the `Giá` tab reuses the existing `ItemPriceMatrixPanel`, locked to the Item currently open;
- no second Item Price CRUD implementation is added by the Alumdoor experience;
- purchase history uses `alumdoor.purchase.item_price_history`, already merged through PR #784;
- shared `DoctypeWorkspace` receives no Item/Alumdoor conditional.

## Pricing authority boundary

This resolves the Item-tab composition dependency without claiming the broader Matrix transport debt is finished.

`ItemPriceMatrixPanel` is the repository's current compatibility price manager and still carries the known UI03 debt of direct multi-document Item/UOM/Item Price mutation. This change **reuses that one existing compatibility path** rather than cloning it. When the generic Matrix named-source/action bridge becomes authoritative, the tab can swap its inner price surface without changing the app-owned detail routing contract.

## Purchase history behavior

The tab shows read-only:

`Ngày mua | Nhà cung cấp | Đơn giá`

from submitted Purchase Orders plus direct Purchase Receipts that have no Purchase Order link. It does not write a purchase-price master table and does not overwrite current buying or selling rates.

## Merge / deploy

Dependency is **RESOLVED FOR SOURCE MERGE** through the existing app-owned runtime detail resolver.

This is a new UI/runtime candidate. Source merge is approved by the owner in the task that requested the tab restoration. Production deployment/relock remains a separate release action under the controlled-pilot change doctrine.
