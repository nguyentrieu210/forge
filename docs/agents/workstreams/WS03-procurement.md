# WS03 — Procurement 360 / Source-to-Pay

Status: **CLAIMED**  
Owner: **ChatGPT / WS03**  
Branch: `agent/ent-03-procurement`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Claimed from exact `main`: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Hoàn thiện Source-to-Pay từ yêu cầu mua tới thanh toán, supplier lifecycle và kiểm soát PO/Receipt/Invoice, giữ compatibility với Tiến Đạt FIFO nhưng không hard-code nhà cung cấp vào generic procurement.

## Capability families

`P01-P02`, liên kết `F03`, `W01`.

## Own

Purchase Request/Material Request, RFQ, Supplier Quotation/comparison, supplier onboarding/rating/contract, PO/receipt/invoice orchestration, landed cost input, three-way match/variance, procurement analytics/portal metadata.

## Phase A audit

Map flow hiện có PO -> Receipt -> Invoice -> Payment; xác định exact gaps của PR/RFQ/comparison/approval/blanket order/contract/3-way match/partial/returns/supplier score và Tiến Đạt FIFO boundary. Audit PR mua hàng/Tiến Đạt lịch sử và phân loại `reuse / cherry-pick / superseded / reject`.

## Phase B priority

PR -> RFQ -> comparison -> approval -> PO; 3-way match; supplier management; blanket/contract; analytics. Supplier-specific FIFO chỉ giữ ở vertical nếu không generic hóa được.

## Dependencies

WS01 AP/payment/financial truth; WS04 receipt/stock/landed cost; WS09 workflow/action; WS17 Alumdoor-specific rules.

## Guard

Không duplicate AP ledger. Không ghi stock ngoài canonical stock path. Không sửa Alumdoor generated JSON trực tiếp.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability IDs, flow/state, variance rules, permission, tests, legacy PR disposition, dependency requests, PR.