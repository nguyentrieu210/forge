# WS05 — Manufacturing / MRP II / QMS

Status: **CLAIMED**  
Owner: **ChatGPT-WS05**  
Branch: `agent/ent-05-manufacturing-qms`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `64af79ea0d9f3695a73f5e34678f93bcfc5c8d12`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Nâng Manufacturing từ BOM/WO/Plan/Job Card RC thành MRP II + costing + traceability + QMS, đồng thời rút primitive generic từ Alumdoor thay vì copy logic ngành.

## Capability families

`M01-M04` và Quality families trong capability map.

## Own

BOM version/effective date/alternate/substitute/phantom, routing/operation/workstation, MRP/demand/material planning, capacity/scheduling, WO/Job Card/WIP/scrap/rework/subcontract, manufacturing cost/variance, genealogy/traceability, quality plan/inspection/NCR/CAPA/calibration.

## Phase A audit

Audit exact controller/schema/test hiện có; phân biệt RC thật với metadata-only. Map material/stock dependencies, cost posting, cumulative guards, backflush/WIP, capacity and quality hooks. Audit manufacturing-costing/Plastic ERP PR lịch sử và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit plan

1. Compare exact branch head với current `main`; chỉ kéo source-relevant drift ảnh hưởng Manufacturing/QMS.
2. Map `M01-M04` và Quality capability IDs sang schema/controller/API/tests/evidence hiện có.
3. Audit legacy manufacturing-costing/Plastic ERP PR theo exact diff và phân loại disposition.
4. Khóa contract cho BOM/effective-date, MRP/material demand, capacity, WIP/backflush, cost variance, traceability và QMS correction flows.
5. Ghi dependency request thay vì sửa hotspot của WS00/WS01/WS04/WS14/WS17.
6. Chọn thin vertical slice đầu tiên chỉ sau khi audit xác định gap có giá trị cao nhất và dependency không bị block.

## Phase B priority

BOM/version -> MRP/material plan -> capacity -> shop-floor completion/WIP -> cost variance -> traceability -> QMS NCR/CAPA.

## Dependencies

WS04 stock/valuation, WS01 costing/GL, WS00 shared contracts, WS17 Alumdoor reference patterns, WS14 shop-floor UI/mobile.

## Guard

Đặc thù nhôm/cửa/cắt tối ưu giữ ở WS17; chỉ extract primitive nếu dùng chung được.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability maturity, state/invariants, costing/stock integration, tests, legacy PR disposition, dependency requests, PR.
