# R9-01 — Projected material availability for MRP

Date: 2026-10-04

## Vấn đề thực tế

MRP trước R9 chỉ có hai mức:

- nhu cầu gộp từ BOM;
- một bản xem thử chỉ trừ tồn đang có.

Nó chưa được phép tự giảm Yêu cầu vật tư bằng hàng đang mua về, hàng đang sản xuất dở,
giữ chỗ và tồn an toàn. Nếu lấy riêng số tồn hiện tại để quyết định mua/sản xuất, kế hoạch
có thể đặt thừa. Nếu tự cộng các nguồn đang về mà không kiểm soát ngày, giữ chỗ hoặc độ chắc
của dữ liệu, kế hoạch lại có thể đặt thiếu.

## Hành vi R9-01

R9-01 thêm một phép tính phục vụ **kế hoạch vật tư**:

`tồn hiện tại + PO còn phải nhận trước ngày cần + WO còn phải hoàn thành trước ngày cần
- giữ chỗ đang hiệu lực - tồn an toàn`.

Kết quả được chia theo ngày cần và mỗi đơn vị nguồn chỉ được dùng một lần cho các nhu cầu
xếp theo ngày. Nguồn đến sau ngày cần không được tính sớm.

Đây là `PROJECTED_MRP_V1`, không được gọi là ATP bán hàng tổng quát.

## Nguồn dữ liệu có thẩm quyền

Không tạo bảng tồn hoặc sổ phụ mới.

- tồn hiện tại: canonical Stock Ledger qua `getStockBalanceMicros`;
- hàng mua đang về: Purchase Order đã submit, trừ tiến độ Receipt theo đúng PO child row;
- hàng sản xuất đang về: Work Order đã submit, trừ tiến độ Manufacture;
- giữ chỗ: Stock Reservation đang ở trạng thái `Đang giữ` và chưa hết hạn;
- tồn an toàn: Item `reorder_levels` theo đúng warehouse, với fallback trường top-level cũ.

## Fail-closed

Một giữ chỗ còn hiệu lực nhưng không chỉ ra kho có thể thuộc bất kỳ kho nào. R9 không bỏ qua
nó để làm số khả dụng đẹp hơn. Snapshot được đánh `complete=false`; dòng MRP đó giữ nguyên
nhu cầu gộp thay vì giảm nhu cầu bằng một con số không chắc.

Tương tự, hai cấu hình safety stock cho cùng item + warehouse làm snapshot không đầy đủ.

PO/WO thiếu ngày được bỏ khỏi nguồn cung dự kiến và phát warning. Đây là under-count an toàn:
có thể đề nghị mua/sản xuất nhiều hơn, nhưng không làm hệ thống tin vào hàng chưa chứng minh
được sẽ có trước ngày cần.

## API

Preview:

- cũ: `net_on_hand=1` -> `ON_HAND_ONLY_NOT_ATP`;
- mới: `net_projected_mrp=1` -> `PROJECTED_MRP_V1`;
- hai chế độ không được bật cùng lúc.

Tạo Material Request:

- mặc định vẫn giữ hành vi gross cũ;
- chỉ khi caller gửi `net_projected_mrp=1` mới tạo số lượng sau netting;
- nếu nguồn dự kiến đã đủ, không tạo Material Request;
- fingerprint chứa cả các thành phần projected availability để retry không vô tình coi hai
  trạng thái cung ứng khác nhau là cùng một kế hoạch.

## Bằng chứng chạy được

Các test mới nằm trong pattern `manufacturing-*.test.mjs`, nên chạy cùng gate R8 manufacturing:

- `server/tests/manufacturing-mrp-projected-netting.test.mjs`;
- `server/tests/manufacturing-mrp-projected-availability.test.mjs`;
- `server/tests/manufacturing-mrp-projected-api.test.mjs`.

Head implementation `4e282de417a55f5051cac42953f7c6225186cf07` đã qua:

- R8-B Business Closure run `37200359656`: success;
- R7 Frappe 16 Closure run `37200359648`: success.

## Giới hạn còn lại

R9-01 không tự nhận đã đóng toàn bộ R8-F09/R8-F10.

- chưa phải ATP bán hàng đa kho;
- chưa có lead-time policy hay tự dời ngày mua;
- chưa có automatic reservation consumption/expiry mutation;
- chưa xử lý phantom/substitute/alternate BOM;
- Material Request tạo ra là draft; thay đổi cung ứng sau thời điểm lập kế hoạch sẽ xuất hiện
  như fingerprint khác ở lần lập kế hoạch tiếp theo, không tự sửa ngược lịch sử.

Không có production deploy hoặc production data migration trong lane này.
