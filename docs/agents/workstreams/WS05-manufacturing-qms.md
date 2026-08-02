# WS05 — Manufacturing / MRP II / QMS

Status: **READY**  
Owner: **—**  
Branch: `agent/ent-05-manufacturing-qms`  
Base: `b15378be7c036204f92a6e4c289038aa84d6f286`

## Mission

Nâng Manufacturing từ BOM/WO/Plan/Job Card RC thành MRP II + costing + traceability + QMS, đồng thời rút primitive generic từ Alumdoor thay vì copy logic ngành.

## Capability families

`M01-M04` và Quality families trong capability map.

## Own

BOM version/effective date/alternate/substitute/phantom, routing/operation/workstation, MRP/demand/material planning, capacity/scheduling, WO/Job Card/WIP/scrap/rework/subcontract, manufacturing cost/variance, genealogy/traceability, quality plan/inspection/NCR/CAPA/calibration.

## Phase A audit

Audit exact controller/schema/test hiện có; phân biệt RC thật với metadata-only. Map material/stock dependencies, cost posting, cumulative guards, backflush/WIP, capacity and quality hooks.

## Phase B priority

BOM/version -> MRP/material plan -> capacity -> shop-floor completion/WIP -> cost variance -> traceability -> QMS NCR/CAPA.

## Dependencies

WS04 stock/valuation, WS01 costing/GL, WS00 shared contracts, WS17 Alumdoor reference patterns, WS14 shop-floor UI/mobile.

## Guard

Đặc thù nhôm/cửa/cắt tối ưu giữ ở WS17; chỉ extract primitive nếu dùng chung được.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability maturity, state/invariants, costing/stock integration, tests, dependency requests, PR.