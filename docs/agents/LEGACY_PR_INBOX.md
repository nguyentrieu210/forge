# FORGE LEGACY PR INBOX

> Canonical purpose: giúp 18 workstream tận dụng code/evidence cũ mà không merge nhầm branch stale.
>
> Exact GitHub diff/branch state luôn thắng file này. Agent phải cập nhật disposition trong workstream handoff khi đã audit.

## Disposition vocabulary

- `AUDIT`: chưa quyết định, owner phải đọc exact diff/evidence.
- `REUSE`: branch/PR còn phù hợp để tiếp tục trực tiếp sau khi sync current main.
- `CHERRY-PICK`: chỉ lấy một phần commit/file/contract sang workstream canonical.
- `SUPERSEDED`: implementation hiện tại hoặc workstream mới đã thay thế.
- `REJECT`: không dùng vì sai contract/invariant/architecture.
- `MERGED`: capability đã vào main, PR chỉ còn lịch sử.

## Open substantive PR candidates at Forge 0.2.0 baseline

| PR | Scope | Primary workstream | Secondary | Initial disposition |
|---|---|---|---|---|
| #295 | Tiến Đạt FIFO delivery + payable operations | WS03 Procurement | WS01, WS04, WS17 | AUDIT |
| #286 | TT99 localization + tax/e-invoice controls | WS01 Finance/VN | WS06, WS10, WS11 | AUDIT |
| #278 | VN accounting integrity technical closure | WS01 Finance/VN | WS00, WS04, WS11 | AUDIT |
| #269 | HRM statutory payroll + self-service | WS06 HCM/Payroll | WS01, WS11, WS14 | AUDIT |
| #267 | Bulk Stock Reconciliation | WS04 Inventory/WMS | WS09, WS14 | AUDIT |
| #216 | Pricing management matrix | WS02 CRM/Revenue | WS09, WS14 | AUDIT |
| #208 | Plastic ERP Production Run/shop-floor | WS05 Manufacturing/QMS | WS04, WS14 | AUDIT |
| #201 | Actual manufacturing costing | WS05 Manufacturing/QMS | WS01, WS04 | AUDIT |
| #199 | Daily detailed ledger hardening | WS01 Finance/VN | WS08, WS12 | AUDIT |

## Closed during Forge 0.2.0 cleanup

Các PR sau đã được xác định rõ là temporary/stale/superseded và đã đóng, nhưng history vẫn còn để tra cứu:

- #224 accounting-period iteration cũ.
- #248 decimal UI hotfix đã có fix canonical mới hơn.
- #256 obsolete CURRENT_STATUS recovery.
- #257 accounting-period iteration cũ.
- #259 accounting-period iteration cũ.
- #285 temporary accounting transplant/integration check.

Không reopen/merge các PR này chỉ vì thấy code hữu ích. Nếu cần, cherry-pick ý tưởng/commit có kiểm chứng vào workstream canonical.

## Agent rule

Khi CLAIMED một workstream:

1. search open + recently closed PR theo domain;
2. đọc exact diff và current main equivalent;
3. ghi từng PR vào workstream file với disposition;
4. nếu chọn REUSE, sync branch với exact current main trước code;
5. nếu chọn CHERRY-PICK, chỉ lấy phần còn đúng contract và chạy lại evidence;
6. coordinator cập nhật `AGENT_BOARD.md` khi disposition ảnh hưởng dependency/merge order.

Không để hai workstream cùng nhận một PR làm canonical owner. Secondary workstream chỉ review contract/touchpoint.