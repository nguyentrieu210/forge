# Alumdoor — Supplier Delivery Workspace

Ngày cập nhật: 2026-08-03  
WS17 source target: `alumdoor@2.2.2`  
Production historical baseline remains `alumdoor@2.2.1` until an approved non-UI release.

## Mục tiêu

Một workspace vận hành nhà cung cấp phải trả lời được, từ nguồn dữ liệu authoritative:

- đã đặt những gì;
- đã nhận những gì;
- nhà cung cấp còn phải giao bao nhiêu cây, mét và kg barem;
- PO/dòng PO nào đang giao, đã đủ, quá hạn hoặc đã đối soát;
- cân thực tế lệch barem bao nhiêu;
- một xe nhiều mã được nhập thành một Purchase Receipt nháp với đúng ngày/giờ nhận;
- giá mua thay đổi thế nào qua các PO;
- công nợ tiền authoritative hiện bao nhiêu, không trộn với nợ giao hàng;
- chốt hoặc đảo đối soát qua `Purchase Settlement` canonical.

## Source of truth

- Nghĩa vụ giao hàng: Purchase Order + purchase allocation ledger / settlement windows.
- Hàng đã nhận: submitted Purchase Receipt.
- FIFO / tolerance / unapplied / settlement: canonical purchase allocation controller/ledger.
- Công nợ phải trả tiền: Payment Ledger / `Debt Summary`.
- `Purchase Invoice.outstanding_amount` chỉ là fallback có gắn cờ non-authoritative khi Finance report không đọc được.

Alumdoor Worker không ghi D1, Stock Ledger, Payment Ledger hoặc allocation tables trực tiếp.

## Backend read model — WS17

`alumdoor.purchase.supplier_delivery_dashboard` hiện:

- đọc submitted PO / Receipt / Invoice đúng supplier, phân trang 200 bản ghi/trang;
- hard ceiling 5.000 chứng từ và fail closed thay vì trả số liệu bị cắt cụt;
- đọc document detail theo batch giới hạn;
- lấy allocation timeline authoritative theo PO và dedupe settlement windows;
- dùng canonical allocation rows cho số cây đã nhận theo PO khi có timeline;
- fallback về submitted documents khi timeline chưa có nhưng không giả vờ `đã nhận đủ = đã đối soát`;
- trả tổng theo material queue và drill-down từng PO line;
- trả cây / mét / kg barem đặt, nhận, còn;
- trả kg thực cân, chênh kg và % chênh;
- trả receipt history, price history, PO progress;
- đọc AP qua `Debt Summary` và trả outstanding / due / overdue / advance / net exposure.

Material identity vẫn tách theo mã + chiều dài + kg/m + màu + dập + measurement profile + UOM; không gộp chỉ theo item code.

## Bulk Receipt — WS17

Action `nhap-nhom-hang-loat`:

- nhận nhiều mã trong một chuyến;
- preview FIFO trước khi tạo;
- tạo đúng một Purchase Receipt **Draft**;
- giữ `posting_at` người dùng chọn trong preview, synthetic receipts, fingerprint idempotency và Purchase Receipt thật;
- fingerprint gồm supplier + warehouse + supplier invoice + driver + posting time + normalized lines;
- cùng supplier invoice nhưng payload khác fail closed thay vì tạo chứng từ thứ hai;
- submit/stock posting vẫn thuộc canonical Purchase Receipt controller.

Executable + regression blob của phần bulk được selective-port nguyên trạng từ exact #295 validation evidence.

## Settlement / correction — WS17

Method `alumdoor.purchase.supplier_delivery_settlement` chỉ làm composition:

1. nhận `queue_key`, thao tác và lý do;
2. tìm latest `Open` window cho `Đối soát`, hoặc latest `Settled` window cho `Đảo đối soát`;
3. giữ caller authorization / app / identity / signature khi callback;
4. tạo `Purchase Settlement` qua platform resource API;
5. submit chứng từ qua canonical document path.

WS17 không tự kiểm dung sai bằng một thuật toán cạnh tranh. Role, tolerance, OCC/version, Close/Reverse semantics và allocation-ledger mutation vẫn nằm trong canonical `Purchase Settlement` controller.

Action metadata `doi-soat-giao-hang-ncc` dùng permission boundary `Purchase Order` và map nhãn Việt hóa sang `Close` / `Reverse` ở app Worker.

## UI hiện tại và boundary

Current production UI vẫn có shared-runtime special case để biến action `nhap-nhom-fifo` thành Supplier Delivery Workspace. Nó usable nhưng chưa phải kiến trúc đích vì shared React còn biết literal Alumdoor/Tiến Đạt.

WS17 không thêm một special case shared mới. Rich workspace extraction được giao qua:

- DR-WS17-04 -> WS09: first-class AppAction/workspace/input-table metadata;
- DR-WS17-05 -> WS14: generic renderer tiêu thụ metadata, bỏ action/schema/brand literal.

Trong khi dependency chưa merge, settlement được expose bằng generic scalar AppAction riêng, nên không cần sửa shared React để thao tác được.

## Verification

Historical PR #295 exact-head evidence cho executable blobs được giữ ở `docs/agents/workstreams/WS17-legacy-295-disposition.md`.

WS17-specific regressions thêm:

- dashboard authoritative AP + pagination/fail-closed + material/PO-line metrics;
- settlement Close/Reverse + reason + caller identity forwarding;
- bulk `posting_at` contract;
- app boundary / lifecycle ownership;
- Golden Order read-only authority verifier.

Full current WS17 monorepo suite: **NOT RUN** trong connector session vì container không resolve `github.com`; không dùng thiếu CI làm lý do dừng implementation.

## Remaining generic dependencies

- Procurement allocation axis vẫn phải generic hóa khỏi literal `Nhôm cây/lá` / `qty_bar` (DR-WS17-01).
- Catch-weight/multi-measure cần Measurement Profile role contract (DR-WS17-02).
- Shared supplier-debt projection cần generic material measures (DR-WS17-03).
- Rich workspace/UI metadata extraction chờ WS09/WS14 (DR-WS17-04/05).

Không giải các dependency này bằng cách đưa thêm Alumdoor literal vào shared core/runtime.
