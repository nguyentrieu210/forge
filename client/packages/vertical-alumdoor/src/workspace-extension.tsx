/** @jsxImportSource react */
import { lazy, Suspense } from "react";
import { buildPrintPath } from "@metaforge/views";
import type { DoctypeWorkspaceExtension } from "@metaforge/views";

const AlumdoorSalesOrderCreate = lazy(() => import("./AlumdoorSalesOrderCreate.js").then((module) => ({ default: module.AlumdoorSalesOrderCreate })));
const AlumdoorPurchaseOrderCreate = lazy(() => import("./AlumdoorPurchaseOrderCreate.js").then((module) => ({ default: module.AlumdoorPurchaseOrderCreate })));
const AlumdoorDeliveryNoteCreate = lazy(() => import("./AlumdoorDeliveryNoteCreate.js").then((module) => ({ default: module.AlumdoorDeliveryNoteCreate })));
const AlumdoorPurchaseReceiptCreate = lazy(() => import("./AlumdoorPurchaseReceiptCreate.js").then((module) => ({ default: module.AlumdoorPurchaseReceiptCreate })));
const AlumdoorProductionRequestDetail = lazy(() => import("./AlumdoorProductionRequestDetail.js").then((module) => ({ default: module.AlumdoorProductionRequestDetail })));
const AlumdoorWorkOrderDetail = lazy(() => import("./AlumdoorWorkOrderDetail.js").then((module) => ({ default: module.AlumdoorWorkOrderDetail })));
const AlumdoorManufacturingStockEntryCreate = lazy(() => import("./AlumdoorManufacturingStockEntryCreate.js").then((module) => ({ default: module.AlumdoorManufacturingStockEntryCreate })));
const AlumdoorBomRuleEditor = lazy(() => import("./AlumdoorBomRuleEditor.js").then((module) => ({ default: module.AlumdoorBomRuleEditor })));

type ManufacturingStockPurpose = "Material Transfer" | "Manufacture";

function stockPurpose(raw: string | null): ManufacturingStockPurpose | undefined {
  return raw === "Material Transfer" || raw === "Manufacture" ? raw : undefined;
}

/**
 * AlumDoor owns only the workbenches that materially differ from canonical CRUD.
 * All ordinary DocTypes deliberately fall through to DoctypeWorkspace's List/Form runtime.
 */
export const alumdoorWorkspaceExtension: DoctypeWorkspaceExtension = {
  id: "alumdoor",
  suppressAdvancedFilter: true,
  resolve(context) {
    const { doctype, isNew, decoded, bridge, base, printBase, listPath, closeRequest, onNavigate } = context;

    if (isNew && doctype === "BOM Rule") {
      return {
        createSurface: "full",
        createDataSurface: "alumdoor-bom-rule-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở danh mục Quy tắc BOM…</div>}>
            <AlumdoorBomRuleEditor
              onSaved={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "BOM Rule") {
      return {
        hasDetail: true,
        suppressBulk: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở Quy tắc BOM…</div>}>
            <AlumdoorBomRuleEditor
              key={`alumdoor-bom-rule/${decoded}`}
              name={decoded}
              onSaved={(savedName) => {
                if (savedName && savedName !== decoded) onNavigate(`${listPath}/${encodeURIComponent(savedName)}`);
              }}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (isNew && doctype === "Purchase Order") {
      return {
        createSurface: "full",
        createDataSurface: "alumdoor-purchase-order-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn mua hàng AlumDoor…</div>}>
            <AlumdoorPurchaseOrderCreate
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Purchase Order") {
      return {
        hasDetail: true,
        suppressBulk: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở đơn mua hàng AlumDoor…</div>}>
            <AlumdoorPurchaseOrderCreate
              key={`${doctype}/${decoded}`}
              name={decoded}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onSaved={() => {}}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (isNew && doctype === "Purchase Receipt") {
      return {
        createSurface: "full",
        createDataSurface: "alumdoor-purchase-receipt-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn nhập hàng FIFO…</div>}>
            <AlumdoorPurchaseReceiptCreate
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Purchase Receipt") {
      return {
        hasDetail: true,
        suppressBulk: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở phiếu nhập hàng…</div>}>
            <AlumdoorPurchaseReceiptCreate
              key={`${doctype}/${decoded}`}
              name={decoded}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onSaved={() => {}}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (isNew && doctype === "Sales Order") {
      return {
        createSurface: "full",
        createDataSurface: "alumdoor-sales-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn bán hàng AlumDoor…</div>}>
            <AlumdoorSalesOrderCreate
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onPreviewCreated={(newName) => onNavigate(printBase === "/print"
                ? buildPrintPath(doctype, newName)
                : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Sales Order") {
      return {
        hasDetail: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở đơn hàng AlumDoor…</div>}>
            <AlumdoorSalesOrderCreate
              key={`${doctype}/${decoded}`}
              name={decoded}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onSaved={() => {}}
              onPreviewCreated={(currentName) => onNavigate(printBase === "/print"
                ? buildPrintPath(doctype, currentName)
                : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(currentName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (isNew && doctype === "Delivery Note") {
      return {
        createSurface: "full",
        createDataSurface: "alumdoor-delivery-note-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn xuất kho AlumDoor…</div>}>
            <AlumdoorDeliveryNoteCreate
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onPreviewCreated={(newName) => onNavigate(printBase === "/print"
                ? buildPrintPath(doctype, newName)
                : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Delivery Note") {
      return {
        hasDetail: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở phiếu xuất kho AlumDoor…</div>}>
            <AlumdoorDeliveryNoteCreate
              key={`${doctype}/${decoded}`}
              name={decoded}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onSaved={() => {}}
              onPreviewCreated={(currentName) => onNavigate(printBase === "/print"
                ? buildPrintPath(doctype, currentName)
                : `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(currentName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Production Request") {
      return {
        hasDetail: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở yêu cầu sản xuất…</div>}>
            <AlumdoorProductionRequestDetail key={`alumdoor-production-request/${decoded}`} name={decoded} onNavigate={onNavigate} />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Work Order") {
      return {
        hasDetail: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở phiếu sản xuất…</div>}>
            <AlumdoorWorkOrderDetail key={`alumdoor-work-order/${decoded}`} name={decoded} onNavigate={onNavigate} />
          </Suspense>
        ),
      };
    }

    const manufacturingWorkOrder = bridge.get("f_work_order")?.trim() ?? "";
    const manufacturingPurpose = stockPurpose(bridge.get("f_purpose"));
    if (!isNew && !decoded && doctype === "Stock Entry" && manufacturingWorkOrder && manufacturingPurpose) {
      return {
        hasDetail: true,
        suppressBulk: true,
        contextTitle: manufacturingWorkOrder,
        onCloseDetail: () => onNavigate(`${base}/${encodeURIComponent("Work Order")}/${encodeURIComponent(manufacturingWorkOrder)}`),
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở phiếu kho sản xuất…</div>}>
            <AlumdoorManufacturingStockEntryCreate
              key={`alumdoor-stock-entry/${manufacturingWorkOrder}/${manufacturingPurpose}`}
              workOrder={manufacturingWorkOrder}
              purpose={manufacturingPurpose}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(`${base}/${encodeURIComponent("Work Order")}/${encodeURIComponent(manufacturingWorkOrder)}`)}
              onNavigate={onNavigate}
            />
          </Suspense>
        ),
      };
    }

    return undefined;
  },
};
