/** @jsxImportSource react */
import { lazy, Suspense } from "react";
import type { DoctypeWorkspaceExtension } from "@metaforge/views";
import type { PricingMasterDoctype } from "./PricingMasterWorkbench.js";
import type { DoorGeometryDoctype } from "./DoorGeometryWorkbench.js";

const ItemMasterWorkbench = lazy(() => import("./ItemMasterWorkbench.js").then((module) => ({ default: module.ItemMasterWorkbench })));
const PricingMasterWorkbench = lazy(() => import("./PricingMasterWorkbench.js").then((module) => ({ default: module.PricingMasterWorkbench })));
const BomMasterWorkbench = lazy(() => import("./BomMasterWorkbench.js").then((module) => ({ default: module.BomMasterWorkbench })));
const DoorGeometryWorkbench = lazy(() => import("./DoorGeometryWorkbench.js").then((module) => ({ default: module.DoorGeometryWorkbench })));

type WorkspaceContext = Parameters<DoctypeWorkspaceExtension["resolve"]>[0];
type WorkspaceResolution = ReturnType<DoctypeWorkspaceExtension["resolve"]>;
const PRICING_MASTERS = new Set<PricingMasterDoctype>(["Item Price", "Pricing Scope", "Pricing Rule"]);
const DOOR_GEOMETRY_MASTERS = new Set<DoorGeometryDoctype>(["Quy cách cửa", "Geometry Profile", "Cutting Policy"]);

/**
 * Registry cho Danh mục Alumdoor có nghiệp vụ vượt quá CRUD thông thường.
 *
 * Luật quan trọng nhất: KHÔNG match thì trả undefined để DoctypeWorkspace generic xử lý.
 * Workbench riêng là ngoại lệ có chủ đích, không phải hệ form thứ hai thay thế nền tảng.
 *
 * `?master_ui=generic` là cửa thoát có chủ đích cho từng record/new route. Nó cho người dùng
 * mở form metadata đầy đủ khi workbench chưa surfacing một field hiếm, đồng thời giúp rollout
 * từng cụm mà không biến việc chưa làm xong thành chỗ cụt.
 */
export function resolveAlumdoorMasterWorkspace(context: WorkspaceContext): WorkspaceResolution {
  const { doctype, isNew, decoded, bridge, base, listPath, onNavigate } = context;
  if (bridge.get("master_ui") === "generic") return undefined;
  if (!isNew && !decoded) return undefined;

  if (doctype === "Item") {
    const editor = (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở hồ sơ mặt hàng…</div>}>
        <ItemMasterWorkbench key={decoded ? `alumdoor-item-master/${decoded}` : "alumdoor-item-master/new"} name={decoded} base={base} listPath={listPath} onNavigate={onNavigate} onSaved={(savedName) => onNavigate(`${listPath}/${encodeURIComponent(savedName)}`)} onCancel={() => onNavigate(listPath)} />
      </Suspense>
    );
    return isNew ? { createSurface: "full", createDataSurface: "alumdoor-item-master-create", suppressBulk: true, create: editor } : { hasDetail: true, suppressBulk: true, detail: editor };
  }

  if (PRICING_MASTERS.has(doctype as PricingMasterDoctype)) {
    const pricingDoctype = doctype as PricingMasterDoctype;
    const editor = (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở danh mục giá…</div>}>
        <PricingMasterWorkbench key={decoded ? `alumdoor-pricing/${pricingDoctype}/${decoded}` : `alumdoor-pricing/${pricingDoctype}/new`} doctype={pricingDoctype} name={decoded} base={base} listPath={listPath} onNavigate={onNavigate} onSaved={(savedName) => onNavigate(`${listPath}/${encodeURIComponent(savedName)}`)} onCancel={() => onNavigate(listPath)} />
      </Suspense>
    );
    return isNew ? { createSurface: "full", createDataSurface: "alumdoor-pricing-master-create", suppressBulk: true, create: editor } : { hasDetail: true, suppressBulk: true, detail: editor };
  }

  if (doctype === "Bill of Materials") {
    const editor = (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở định mức BOM…</div>}>
        <BomMasterWorkbench key={decoded ? `alumdoor-bom-master/${decoded}` : "alumdoor-bom-master/new"} name={decoded} base={base} listPath={listPath} onNavigate={onNavigate} onSaved={(savedName) => onNavigate(`${listPath}/${encodeURIComponent(savedName)}`)} onCancel={() => onNavigate(listPath)} />
      </Suspense>
    );
    return isNew ? { createSurface: "full", createDataSurface: "alumdoor-bom-master-create", suppressBulk: true, create: editor } : { hasDetail: true, suppressBulk: true, detail: editor };
  }

  if (DOOR_GEOMETRY_MASTERS.has(doctype as DoorGeometryDoctype)) {
    const masterDoctype = doctype as DoorGeometryDoctype;
    const editor = (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Đang mở cấu hình cửa…</div>}>
        <DoorGeometryWorkbench key={decoded ? `alumdoor-door-geometry/${masterDoctype}/${decoded}` : `alumdoor-door-geometry/${masterDoctype}/new`} doctype={masterDoctype} name={decoded} base={base} listPath={listPath} onNavigate={onNavigate} onSaved={(savedName) => onNavigate(`${listPath}/${encodeURIComponent(savedName)}`)} onCancel={() => onNavigate(listPath)} />
      </Suspense>
    );
    return isNew ? { createSurface: "full", createDataSurface: "alumdoor-door-geometry-create", suppressBulk: true, create: editor } : { hasDetail: true, suppressBulk: true, detail: editor };
  }

  return undefined;
}
