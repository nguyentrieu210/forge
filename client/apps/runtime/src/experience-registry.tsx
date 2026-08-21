import { lazy } from "react";

/** Lazy runtime experiences kept behind one narrow app-level boundary. */
export const ApprovalInbox = lazy(() => import("./experiences/ApprovalInbox.js").then((module) => ({ default: module.ApprovalInbox })));
export const SocialCommerce = lazy(() => import("./experiences/SocialCommerce.js").then((module) => ({ default: module.SocialCommerce })));
export const DailyDetailedLedger = lazy(() => import("./experiences/DailyDetailedLedger.js").then((module) => ({ default: module.DailyDetailedLedger })));
export const AlumdoorOperationsCenter = lazy(() => import("./experiences/AlumdoorOperationsCenter.js").then((module) => ({ default: module.AlumdoorOperationsCenter })));
export const AlumdoorAttendanceScanner = lazy(() => import("./experiences/AlumdoorAttendanceScanner.js").then((module) => ({ default: module.AlumdoorAttendanceScanner })));
export const AlumdoorAttendanceOperations = lazy(() => import("./experiences/AlumdoorAttendanceOperations.js").then((module) => ({ default: module.AlumdoorAttendanceOperations })));
export const AlumdoorMasterDataScreen = lazy(() => import("./experiences/AlumdoorMasterDataWithImport.js").then((module) => ({ default: module.AlumdoorMasterDataWithImport })));
// Màn công nợ sống trong vertical (cùng chỗ với đơn bán / nhập FIFO / phiếu sản xuất), không
// phải trong `experiences/` của runtime — runtime chỉ mở nó, không sở hữu nghiệp vụ công nợ.
export const AlumdoorDebtWorkbench = lazy(() => import("@metaforge/vertical-alumdoor").then((module) => ({ default: module.AlumdoorDebtWorkbench })));
