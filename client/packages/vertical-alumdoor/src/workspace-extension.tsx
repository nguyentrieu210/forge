/** @jsxImportSource react */
import { lazy, Suspense } from "react";
import { buildPrintPath } from "@metaforge/views";
import type { DoctypeWorkspaceExtension } from "@metaforge/views";

const AlumdoorSalesOrderCreate = lazy(() => import("./AlumdoorSalesOrderCreate.js").then((module) => ({ default: module.AlumdoorSalesOrderCreate })));
const AlumdoorPurchaseOrderCreate = lazy(() => import("./AlumdoorPurchaseOrderCreate.js").then((module) => ({ default: module.AlumdoorPurchaseOrderCreate })));
const AlumdoorDeliveryNoteCreate = lazy(() => import("./AlumdoorDeliveryNoteCreate.js").then((module) => ({ default: module.AlumdoorDeliveryNoteCreate })));
const AlumdoorPurchaseReceiptCreate = lazy(() => import("./AlumdoorPurchaseReceiptCreate.js").then((module) => ({ default: module.AlumdoorPurchaseReceiptCreate })));
const AlumdoorProductionRequestDetail = lazy(() => import("./AlumdoorProductionRequestDetail.js").then((module) => ({ default: module.AlumdoorProductionRequestDetail })));
const AlumdoorProductionPlanDetail = lazy(() => import("./AlumdoorProductionPlanDetail.js").then((module) => ({ default: module.AlumdoorProductionPlanDetail })));
const AlumdoorWorkOrderDetail = lazy(() => import("./AlumdoorWorkOrderDetail.js").then((module) => ({ default: module.AlumdoorWorkOrderDetail })));
const AlumdoorManufacturingStockEntryCreate = lazy(() => import("./AlumdoorManufacturingStockEntryCreate.js").then((module) => ({ default: module.AlumdoorManufacturingStockEntryCreate })));
const AlumdoorStockEntryCreate = lazy(() => import("./AlumdoorStockEntryCreate.js").then((module) => ({ default: module.AlumdoorStockEntryCreate })));
const AlumdoorBomRuleEditor = lazy(() => import("./AlumdoorBomRuleEditor.js").then((module) => ({ default: module.AlumdoorBomRuleEditor })));
const AlumdoorQuotationWorkbench = lazy(() => import("./quotation/AlumdoorQuotationWorkbench.js").then((module) => ({ default: module.AlumdoorQuotationWorkbench })));

type ManufacturingStockPurpose = "Material Transfer" | "Manufacture";

function stockPurpose(raw: string | null): ManufacturingStockPurpose | undefined {
  return raw === "Material Transfer" || raw === "Manufacture" ? raw : undefined;
}

/**
 * Mẫu in ALUMDOOR phải mở theo tên, KHÔNG dựa vào "mẫu mặc định" của máy chủ.
 *
 * Máy chủ chọn mẫu mặc định bằng `ORDER BY is_default DESC, name`
 * (server/packages/frappe-model/src/store.ts:149) và PrintContainer lấy phần tử
 * `is_default` đầu tiên (client/packages/views/src/print/PrintContainer.tsx:35).
 * Với Sales Order, tenant có HAI mẫu cùng `is_default=1`: "Standard Sales Order"
 * (mẫu rỗng của nền tảng: mỗi tiêu đề + tổng tiền) và "Đơn bán hàng ALUMDOOR".
 * Sắp xếp nhị phân UTF-8 xếp "S" (0x53) trước "Đ" (0xC4 0x90), nên không truyền tên
 * mẫu thì bản in đơn hàng ra mẫu rỗng tiếng Anh — đúng triệu chứng "mẫu đã có trong
 * source nhưng in không ra". Phiếu xuất kho thoát nạn chỉ vì "P" < "S".
 *
 * Truyền thẳng tên mẫu là cách sửa cục bộ trong vertical AlumDoor, không đụng vào
 * thứ tự mặc định dùng chung cho mọi tenant.
 */
const ALUMDOOR_PRINT_FORMAT: Record<string, string> = {
  "Sales Order": "Đơn bán hàng ALUMDOOR",
  "Delivery Note": "Phiếu giao hàng / lắp đặt ALUMDOOR",
  // Hoá đơn bán dính đúng cái bẫy trên: tenant có BA mẫu cùng `is_default=1` cho
  // `Sales Invoice` (đo 23/08), và "Standard Sales Invoice" thắng theo thứ tự tên nên hoá đơn
  // giao khách in ra mẫu rỗng tiếng Anh. Chỉ đích danh thì hết.
  "Sales Invoice": "Hoá đơn ALUMDOOR",
  "Quotation": "Báo giá ALUMDOOR",
  // Đơn mua có HAI mẫu ALUMDOOR ("Đơn mua hàng" is_default=0, "Đơn nhập hàng" is_default=1);
  // chỉ đích danh để nút In không phụ thuộc vào thứ tự tên.
  "Purchase Order": "Đơn mua hàng ALUMDOOR",
  "Purchase Receipt": "Phiếu nhập kho ALUMDOOR",
  "Production Request": "Phiếu yêu cầu sản xuất ALUMDOOR",
  "Cut Order": "Phiếu cắt nhôm ALUMDOOR",
};

/** Đường dẫn bản in kèm tên mẫu AlumDoor, cho cả shell `/print` lẫn shell có printBase riêng. */
function alumdoorPrintPath(printBase: string, doctype: string, name: string): string {
  const format = ALUMDOOR_PRINT_FORMAT[doctype];
  if (printBase === "/print") return buildPrintPath(doctype, name, format);
  const path = `${printBase}/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;
  return format ? `${path}?format=${encodeURIComponent(format)}` : path;
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

    if (isNew && doctype === "Alumdoor Sales Order") {
      return {
        createSurface: "full",
        createTitle: "Đơn hàng",
        createDataSurface: "alumdoor-sales-order-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở đơn hàng…</div>}>
            <AlumdoorQuotationWorkbench closeRequest={closeRequest} onSaved={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)} onCancel={() => onNavigate(listPath)} />
          </Suspense>
        ),
      };
    }

    if (decoded && doctype === "Alumdoor Sales Order") {
      return {
        hasDetail: true,
        contextTitle: "Đơn hàng",
        suppressBulk: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở đơn hàng…</div>}>
            <AlumdoorQuotationWorkbench key={`${doctype}/${decoded}`} name={decoded} onSaved={(savedName) => { if (savedName !== decoded) onNavigate(`${listPath}/${encodeURIComponent(savedName)}`); }} onCancel={() => onNavigate(listPath)} />
          </Suspense>
        ),
      };
    }

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
              onPreviewCreated={(currentName) => onNavigate(alumdoorPrintPath(printBase, doctype, currentName))}
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
              onPreviewCreated={(newName) => onNavigate(alumdoorPrintPath(printBase, doctype, newName))}
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
              onPreviewCreated={(currentName) => onNavigate(alumdoorPrintPath(printBase, doctype, currentName))}
              onCancel={() => onNavigate(listPath)}
            />
          </Suspense>
        ),
      };
    }

    /*
     * Vào thẳng màn xuất kho cho MỘT đơn cụ thể, mở từ nút "Xuất kho" trên màn đơn hàng.
     *
     * Đi qua route list kèm `?f_sales_order=…` chứ không qua route `/new`, cùng nếp với phiếu
     * kho sản xuất bên dưới. Không có đường này thì thủ kho phải tự nhớ số đơn rồi gõ lại — mà
     * số đơn thì không ai thuộc.
     */
    const xuatChoDonBan = bridge.get("f_sales_order")?.trim() ?? "";
    if (!isNew && !decoded && doctype === "Delivery Note" && xuatChoDonBan) {
      return {
        hasDetail: true,
        suppressBulk: true,
        contextTitle: xuatChoDonBan,
        onCloseDetail: () => onNavigate(`${base}/${encodeURIComponent("Sales Order")}/${encodeURIComponent(xuatChoDonBan)}`),
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn xuất kho AlumDoor…</div>}>
            <AlumdoorDeliveryNoteCreate
              key={`alumdoor-delivery-from/${xuatChoDonBan}`}
              initialSalesOrder={xuatChoDonBan}
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onPreviewCreated={(newName) => onNavigate(alumdoorPrintPath(printBase, doctype, newName))}
              onCancel={() => onNavigate(`${base}/${encodeURIComponent("Sales Order")}/${encodeURIComponent(xuatChoDonBan)}`)}
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
              onPreviewCreated={(newName) => onNavigate(alumdoorPrintPath(printBase, doctype, newName))}
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
              onPreviewCreated={(currentName) => onNavigate(alumdoorPrintPath(printBase, doctype, currentName))}
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

    if (decoded && doctype === "Production Plan") {
      return {
        hasDetail: true,
        detail: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở kế hoạch sản xuất…</div>}>
            <AlumdoorProductionPlanDetail key={`alumdoor-production-plan/${decoded}`} name={decoded} onNavigate={onNavigate} />
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

    /*
     * Phiếu kho lập TAY. Trước đây `Stock Entry` chỉ mở được khi đi từ một lệnh sản xuất (nhánh
     * ngay dưới), nên xưởng không có đường nào lập phiếu xuất vật tư, chuyển kho hay điều chỉnh
     * tồn — mà lệnh sản xuất thì đang bằng không. Đây KHÔNG phải phiếu giao khách: giao khách là
     * `Delivery Note`, có ô "Mục đích xuất" riêng.
     */
    if (isNew && doctype === "Stock Entry") {
      return {
        createSurface: "full",
        createDataSurface: "alumdoor-stock-entry-create",
        suppressBulk: true,
        create: (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở màn phiếu kho AlumDoor…</div>}>
            <AlumdoorStockEntryCreate
              closeRequest={closeRequest}
              onCreated={(newName) => onNavigate(`${listPath}/${encodeURIComponent(newName)}`)}
              onCancel={() => onNavigate(listPath)}
            />
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
