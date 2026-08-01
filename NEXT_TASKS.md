# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact branch head, PR state và CI; đọc `RUNBOOK.md` và `CURRENT_STATUS.md` trước khi làm.

## DONE — P0 QR / lineage + cleanup QA

- PR `#189` merged tại `80496b056fa0f23f18311e5822c21dc826bacd9f`.
- Final validated head `ee396fd26b2355a4f3e1d62c92f41468be489443`.
- Required workflows **6/6 PASS**.
- Lineage exact voucher/batch/bundle/warehouse/item identity, two-identity isolation, Stock Reconciliation print/QR, authenticated desktop/mobile và local D1 cleanup zero-residue đã khóa.
- Không deploy production.

Không mở lại P0 slice nếu không có regression cụ thể.

## DONE UI — Bulk View dirty guard

- PR `#195` merged tại `2e5860b90410845545df33115c6f053925b65c72`.
- Final validated head `7e51b9955a0fca2f864df6ac0a278f61c510d5ec`.
- Required workflows **6/6 PASS**.
- Bulk dirty patch được propagate ra workspace, browser unload có guard, chuyển `Nhập hàng loạt -> Danh sách` cần destructive confirmation khi còn thay đổi chưa lưu.
- PR `#192` và `#196` đã đóng, không merge; #195 là canonical implementation.

Không mở lại dirty-guard nếu không có regression cụ thể.

## ACTIVE P1 — Daily Detailed Ledger authenticated acceptance

- PR `#197` đang mở: `test(daily-ledger): authenticate freeze and adjustment lifecycle`.
- PR được mở từ base `80496b056fa0f23f18311e5822c21dc826bacd9f`; `main` đã tiến tới checkpoint sau #195, nên phải kiểm tra divergence và nếu cần dựng clean branch thay vì merge main vào branch cũ.

### Acceptance bắt buộc

- Purchase Order thật được tạo/submit qua public Frappe API làm nguồn Purchase cho snapshot.
- Role `Kế toán tổng hợp` đăng nhập cookie + CSRF thật trên desktop/mobile.
- Generate snapshot lần đầu và rerun cùng input idempotent cùng snapshot.
- Reconcile live/snapshot PASS và Purchase count > 0.
- Read report thật, freeze snapshot; generate lại trả frozen existing.
- Append-only adjustment sau khóa có reason/actor/timestamp/audit; rerun cùng `adjustment_id` idempotent, đổi payload cùng ID phải fail.
- Report sau adjustment phản ánh adjustment đúng.
- Explicit tenant selector và cross-tenant path fail closed.
- Existing reconciliation coverage Sales/Purchase/Inventory/Manufacturing/Warranty/Finance tiếp tục PASS.
- Exact-head required workflows PASS trên current-main generation trước merge.

## NEXT UI — MetaForge UX V2

Sau khi dirty-guard đã merge, Bulk dependency đủ an toàn để tiếp tục List Workspace V2 trên branch riêng từ exact current `main`, miễn không tranh chấp với task ưu tiên cao hơn.

1. **List Workspace V2 + Bulk integration** — summary bar, saved views, smart filters, responsive table/card, contextual quick actions; Bulk là mode/action của cùng workspace.
2. **Matrix View canonical contract + renderer** — User×Role, User×Warehouse/Department/Company, Item×Color, Item×UOM, Item×Reorder warehouse, Supplier×Item, account mapping.
3. **Presentation authoring / canonical transport** — `presentation` và `viewPolicy.bulk` thành first-class authorable metadata/sidecar với compiler/parser/selfcheck/backward compatibility.
4. **Document context nâng cao** — related-document graph, timeline/activity, exception cards, business progress source thật.
5. **Operational workspace + Mobile V2** — role home/inbox/exception-first, rich list cards, context drawer/bottom sheet, mobile action zone.
6. **Bulk Transaction strategy** — controller/method-backed grids cho Stock Reconciliation/BOM; không mass-update ledger/submitted docs.
7. **Nhập nhôm nhiều mã / Purchase Receipt transaction grid**.
8. **Batch Print / QR label queue** dưới dạng action/workspace.
9. **Resource Scheduler** khi capacity/overtime P2 đi vào runtime.
10. **Personalization / AI context** sau khi các operational surfaces ổn định.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Warranty lifecycle và trách nhiệm chi phí.
- Supplier provisional AP hold/offset có phê duyệt.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime/overload.

## P3 — End-to-end acceptance

Khóa hành trình authenticated xuyên miền:

`Sales Order -> Production -> material/stock -> delivery -> invoice/debt -> daily ledger -> adjustment -> warranty`

## Guardrails

- Mỗi epic/slice độc lập dùng branch/PR riêng từ exact current `main`.
- Không merge `main` vào branch diverged hoặc force-push/rewrite history để cứu branch cũ nếu chưa có yêu cầu riêng.
- Không thay exact PR head khi required CI đang chạy nếu không có lý do kỹ thuật.
- Không deploy Cloudflare/production hoặc sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không mutate customer production data.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifacts/evidence.
