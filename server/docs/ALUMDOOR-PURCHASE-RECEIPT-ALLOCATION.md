# Alumdoor — Contract phân bổ Phiếu nhập vào Đơn mua

Trạng thái: **đã chốt thiết kế v1, chưa implementation**  
Ngày chốt: **2026-07-30**

## 1. Mục tiêu nghiệp vụ

Một nhà cung cấp có thể giao một Purchase Order trong nhiều tuần. Cùng một vật tư có thể được đặt nhiều Purchase Order liên tiếp, và một xe hàng có thể mang nhiều vật tư, mỗi vật tư bù nhiều dòng đơn mua.

Hệ thống phải:

- tự phân bổ số cây/lá theo FIFO vào đúng dòng Purchase Order;
- giữ được lịch sử Receipt nào đã bù PO line nào;
- tách số cây/lá, kg barem và kg cân thực tế;
- cho phép nhà cung cấp giao thiếu hoặc dư trong dung sai đã thoả thuận;
- không sửa hoặc xoá lịch sử khi huỷ, điều chỉnh hoặc nhập chứng từ lùi ngày;
- không double-allocation khi hai Receipt được submit đồng thời.

Kịch bản chuẩn:

- PO-01: AL71, 7,2 m, 0,389 kg/m, 200 cây;
- PO-02: cùng quy cách, 100 cây;
- Receipt: 230 cây, barem 644,184 kg, cân thực tế 630 kg;
- allocation: PO-01 nhận 200, PO-02 nhận 30;
- PO-02 còn nợ danh nghĩa 70 cây.

## 2. Các bất biến

1. **Số cây/lá** quyết định nghĩa vụ giao hàng và FIFO.
2. **Kg barem** là snapshot quy cách lý thuyết, dùng để diễn giải và phân bổ tỷ lệ.
3. **Kg cân thực tế** authoritative duy nhất ở dòng Purchase Receipt; không dùng kg để suy ngược số cây.
4. Allocation ledger là append-only. Huỷ hoặc sửa sai ghi event đảo; không `UPDATE` hoặc `DELETE` lịch sử allocation.
5. Một Receipt line có thể sinh nhiều allocation rows. Một Receipt có thể chạm nhiều PO và nhiều material queue.
6. Dung sai không làm thay đổi FIFO danh nghĩa. PO 200 cây chỉ nhận danh nghĩa tối đa 200; phần dư không được nhét vào PO cuối.
7. Mọi mutation ảnh hưởng queue, allocation hoặc settlement phải được serialize và có commit guard ở D1.
8. Dữ liệu client gửi không được quyết định `material_match_key`, queue hoặc allocation target hợp lệ.

## 3. Hai khái niệm phải tách riêng

### 3.1 Obligation queue

Queue chạy liên tục để trả lời: nhà cung cấp đang còn nợ những PO line nào và Receipt mới phải bù dòng nào trước.

Queue key:

```text
queue_key = SHA-256(canonical JSON {
  schema_version: 1,
  tenant_id,
  company,
  supplier,
  material_match_key
})
```

Queue không đóng theo tháng hoặc theo chuyến xe.

### 3.2 Settlement window

Settlement window là kỳ đối soát hữu hạn để tính dung sai ±%.

- Window tự mở khi PO line đầu tiên của queue được submit mà chưa có window mở.
- PO line mới cùng queue tự gia nhập window đang mở.
- Window chỉ đóng khi người có quyền thực hiện `Đối soát giao cuối / Đóng trong dung sai` và nhập lý do.
- PO line phát sinh sau khi window đã đóng mở window kế tiếp.
- Thành viên, tolerance snapshot và tổng nominal của window đã đóng không thay đổi ngược.

Không dùng queue vô thời hạn làm mẫu số dung sai, vì PO mới sẽ làm thay đổi lịch sử của lần giao cũ.

## 4. Material match key

`material_match_key` do server tạo từ canonical snapshot, không tin chuỗi do client gửi.

Schema v1:

```text
{
  schema_version: 1,
  item_code,
  length_m_micros,
  theoretical_kg_per_m_micros,
  color,
  is_stamped,
  measurement_profile,
  stock_uom
}
```

Chuẩn hoá:

- số thập phân đổi sang fixed-point micros;
- chuỗi Link dùng đúng document name đã resolve;
- chuỗi rỗng và null được chuẩn hoá về một biểu diễn;
- `is_stamped` là 0 hoặc 1;
- canonical JSON dùng thứ tự field cố định;
- lưu cả hash và snapshot giải thích được.

Không dùng riêng `item_code`: AL71 khác chiều dài, barem, màu hoặc trạng thái dập không được bù lẫn.

## 5. Concurrency và transaction boundary

### 5.1 Coordinator

Thêm `PurchaseAllocationCoordinator` Durable Object, key:

```text
tenant_id + company + supplier
```

Mọi command làm thay đổi nghĩa vụ hoặc allocation phải đi qua coordinator này:

- Purchase Order submit/cancel;
- Purchase Receipt submit/cancel;
- settlement close/reverse;
- manual allocation override;
- apply unapplied quantity.

Draft create/save không ảnh hưởng nghĩa vụ có thể tiếp tục dùng Aggregate Coordinator hiện tại.

Một Purchase Receipt chỉ có một supplier, nên một request chỉ giữ một coordinator lock. Không lock riêng từng vật tư để tránh multi-lock/deadlock.

### 5.2 D1 commit guard

Durable Object là lớp serialize chính; D1 revision guard là lớp authoritative phòng route sai, retry hoặc code bypass.

Mỗi queue/window có `revision`. Mutation plan phải chứa `expected_revision`. Trong cùng D1 batch với document, stock, procurement và allocation:

1. insert một revision claim theo `command_id`;
2. trigger kiểm `expected_revision` bằng revision hiện tại;
3. mismatch thì `RAISE(ABORT, 'PURCHASE_ALLOCATION_REVISION_CONFLICT')`;
4. match thì tăng revision đúng một lần;
5. ghi allocation/events và mutation receipt.

Coordinator được phép build lại plan và retry tối đa 3 lần với cùng `command_id` nếu chỉ gặp revision conflict. Idempotency receipt hiện có vẫn là nguồn xác nhận commit.

## 6. Thuật toán FIFO

Khi submit Purchase Receipt:

1. Server resolve supplier, company và canonical material snapshot cho từng line.
2. Đọc toàn bộ PO line còn nghĩa vụ trong queue/window đang mở.
3. Sắp xếp:
   - `transaction_date` của PO;
   - `created_at` của PO;
   - PO name;
   - row `idx`;
   - PO item `row_id` làm tie-break cuối.
4. Phân bổ đến hết Receipt qty hoặc hết nghĩa vụ nominal.
5. Phần còn lại, nếu chính sách/tolerance cho phép, ghi `unapplied_receipt_qty`; không gán vào PO cuối.
6. Ghi document, stock ledger, procurement compatibility projection, allocation events và revision claim trong cùng D1 batch.

FIFO được đánh giá tại thời điểm command commit. Không viết lại lịch sử chỉ vì sau đó có chứng từ nhập lùi ngày hoặc PO backdated.

## 7. Dung sai và settlement

Tolerance được snapshot từ Supplier khi window mở. Đổi tolerance trên Supplier không sửa window đang mở; muốn áp mức mới phải đóng window hiện tại và mở window mới.

Với nominal nguyên theo cây/lá:

```text
minimum = ceil(nominal * (100 - tolerance_pct) / 100)
maximum = floor(nominal * (100 + tolerance_pct) / 100)
```

Dùng integer/fixed-point arithmetic, không dùng floating point cho boundary.

Ví dụ nominal 300, tolerance 5%:

- minimum = 285;
- maximum = 315;
- đã nhận 230 thì chuyến cuối hợp lệ 55–85.

Action đóng window:

- server-side permission riêng;
- reason bắt buộc;
- tổng Receipt net phải nằm trong `[minimum, maximum]`;
- không có legacy unresolved ảnh hưởng window;
- không có mutation đang pending;
- ghi settlement event append-only.

Khi đóng:

- nhận thiếu nominal trở thành `shortage_variance`;
- nhận dư nominal trở thành `overage_variance`;
- nghĩa vụ hợp đồng của window kết thúc;
- allocation cũ không bị sửa.

### Reverse settlement

Không có thao tác reopen tuỳ ý.

Cho phép `Reverse settlement` chỉ khi:

- chưa có PO/Receipt activity trong window kế tiếp của cùng queue;
- người dùng có quyền và nhập lý do;
- ghi event reversal, không xoá event close.

Nếu window kế tiếp đã có activity, phải dùng chứng từ điều chỉnh riêng; không mở lại lịch sử cũ.

## 8. Unapplied receipt quantity

Khi Receipt vượt tổng nominal đang mở nhưng chưa vượt maximum của settlement window:

- phần nominal được phân bổ FIFO;
- phần dư ghi `unapplied_receipt_qty` gắn với Receipt line và window;
- không làm một PO line vượt nominal;
- nếu PO mới cùng queue gia nhập trước khi window đóng, hệ thống áp unapplied cũ trước bằng event `apply_unapplied`;
- sau khi window đóng, unapplied còn lại trở thành overage variance, không chuyển sang window sau.

Nếu Receipt làm tổng nhận vượt maximum hiện tại, submit bị chặn. Người dùng phải nhập PO hợp lệ trước, không được nhận hàng rồi hy vọng phần mềm đoán đơn mua tương lai.

## 9. Huỷ, backdated, cancel/amend PO

### 9.1 Cancel Purchase Receipt

- Nếu settlement window đã đóng, phải reverse settlement hợp lệ trước.
- Cancel ghi stock/procurement reversal và allocation `reverse` trong cùng batch.
- Không tự tái phân bổ các Receipt được commit sau đó.
- PO cũ có thể mở nợ trở lại; Receipt tiếp theo sẽ bù PO cũ theo FIFO.

Lý do không auto-rebalance: FIFO là sự kiện đúng tại thời điểm Receipt được commit. Viết lại hàng loạt allocation sau cancel vừa tốn kém vừa biến lịch sử thành mục tiêu di động.

### 9.2 Receipt nhập lùi ngày

- `posting_at` vẫn dùng cho sổ kho/kế toán và báo cáo ngày chứng từ.
- allocation ordering dùng `stream_sequence/committed_at`.
- UI phải cảnh báo đây là backdated Receipt.
- Không tái phân bổ tự động các Receipt cũ.

### 9.3 Purchase Order

Sau submit, các field sau bất biến:

- company;
- supplier;
- item/material identity snapshot;
- quantity của PO line.

Cancel PO line:

- cho phép khi net allocated = 0 và window chưa settled;
- nếu đã có allocation net khác 0 thì chặn, phải reverse Receipt liên quan trước;
- window đã settled thì chặn.

Amend thực hiện bằng cancel hợp lệ rồi tạo successor `amended_from`; không sửa trực tiếp nghĩa vụ đã submit.

## 10. Manual override

UI luôn hiển thị preview FIFO trước submit.

Override chỉ được phép khi:

- actor có permission server-side `purchase_allocation_override`;
- target PO line cùng tenant/company/supplier/material key và cùng settlement window;
- không vượt remaining nominal của target;
- reason bắt buộc;
- event ghi actor, reason, auto target bị bỏ qua và target được chọn.

Override không cho phép cross-supplier, cross-material hoặc allocation vào window đã đóng.

## 11. Kg barem và kg thực tế

- `actual_weight_kg` authoritative duy nhất ở Receipt line.
- Allocation lưu allocated qty và barem snapshot.
- Kg cân thực tế theo PO là projection versioned:

```text
projected_actual_weight = receipt_actual_weight
  * allocation_barem_weight
  / total_receipt_barem_weight
```

- dùng fixed-point;
- làm tròn theo projection version;
- residual được dồn vào allocation cuối theo sequence để tổng projection bằng đúng Receipt actual weight;
- projection có thể được snapshot để diễn giải, nhưng reconciliation luôn lấy Receipt line làm authoritative.

## 12. Data model v1

Migration append-only `0027_purchase_receipt_allocation.sql` dự kiến thêm:

- `purchase_obligation_queues`;
- `purchase_settlement_windows`;
- `purchase_window_obligations`;
- `purchase_receipt_allocation_entries`;
- `purchase_unapplied_receipt_entries`;
- `purchase_settlement_entries`;
- `purchase_allocation_revision_claims`;
- indexes/unique keys/triggers bảo vệ revision, sign, source row và lifecycle.

Allocation entry tối thiểu:

```text
tenant_id
queue_key
window_id
voucher_type
voucher_no
voucher_revision
receipt_item_row_id
purchase_order
purchase_order_item_row_id nullable only for legacy_unresolved
entry_kind allocate|reverse|manual_allocate|apply_unapplied|legacy
qty_micros
barem_weight_micros
projected_actual_weight_micros nullable
projection_version nullable
allocation_sequence
posting_at
committed_at
actor
reason nullable
source legacy|live
resolution resolved|legacy_unresolved
```

Live allocation bắt buộc có PO item row. Chỉ legacy migration mới được phép null row với `legacy_unresolved`.

## 13. Migration và backfill production

Không nhét heuristic backfill nặng vào migration SQL.

1. Migration `0027_*` chỉ tạo schema, triggers và compatibility views.
2. Script `server/scripts/backfill-purchase-receipt-allocations.mjs` có dry-run bắt buộc.
3. Với mỗi `purchase_order_progress_entries` cũ:
   - đọc `voucher_type/voucher_no/voucher_revision/line_key`;
   - tìm Receipt item từ `versions.snapshot_json` và row id mã hoá trong line key khi có;
   - đọc snapshot Purchase Order đúng revision;
   - dựng material key từ snapshot lịch sử;
   - nếu chỉ có một PO item candidate hợp lệ thì tạo legacy resolved allocation;
   - nếu mơ hồ thì tạo `legacy_unresolved`, giữ đúng tổng PO-level nhưng không bịa row id.
4. Dry-run xuất tổng resolved, unresolved, quantity checksum và danh sách cần đối chiếu.
5. Chỉ cutover projection khi checksum PO-level khớp progress ledger cũ.

Sau cutover:

- allocation ledger là nguồn sự thật;
- `purchase_order_progress_entries` chỉ là compatibility projection được sinh từ allocation plan mới;
- `received_percentage`, tồn danh nghĩa và báo cáo đọc allocation/legacy events mới, không đọc song song hai nguồn.

## 14. Test contract

Bắt buộc cover:

- 200 + 100, Receipt 230 => 200 + 30;
- PO mở qua tháng và 4+ PO cùng vật tư;
- một Receipt line bù ít nhất 10 PO lines;
- nhiều Receipt lines, hàng trăm allocation rows;
- hai Receipt submit đồng thời không double allocation;
- revision conflict và retry idempotent cùng command id;
- Receipt backdated không viết lại allocation cũ;
- cancel Receipt chỉ reverse chính Receipt đó;
- PO cancel/amend guards;
- manual override permission/reason;
- unapplied rồi apply vào PO mới trước settlement;
- settlement 55/85 pass, 54/86 fail cho ví dụ 300/230;
- reverse settlement trước window kế tiếp và block sau khi window kế tiếp có activity;
- cùng item khác chiều dài/barem/màu/dập không trộn;
- kg thực không đổi số cây còn nợ và projection sum khớp source;
- legacy backfill resolved/unresolved và checksum;
- D1 batch failure không để document, stock hoặc allocation commit một phần.

## 15. Review sau khi chốt

Điểm thiết kế: **9,2/10**.

Điểm mạnh:

- đúng nghiệp vụ nhiều PO/nhiều chuyến;
- audit trail bất biến;
- transaction boundary và concurrency có hai lớp bảo vệ;
- dung sai không làm thay đổi lịch sử FIFO;
- edge cases cancel/backdated/amend đã có luật;
- migration legacy không đoán dữ liệu.

Chưa đạt 10/10 vì còn phải chứng minh bằng implementation:

- giới hạn D1 batch khi một xe sinh hàng trăm allocation rows;
- latency/coordinator contention với supplier có lưu lượng cao;
- UX preview/override/settlement trên dữ liệu thật;
- dry-run backfill production và checksum thực tế.

## 16. Thứ tự implementation

1. Migration schema/triggers và contract types.
2. Material canonicalizer + unit tests.
3. Coordinator routing + D1 revision claim.
4. Allocation planner thuần hàm + stress/concurrency tests.
5. Purchase Order/Receipt controller integration.
6. Backfill dry-run và compatibility projection.
7. Settlement actions.
8. UI preview/timeline/report.
9. Full test/typecheck/build, staging smoke, backup, migration và production deploy theo quy trình hiện hành.
