# Thiết kế Gói bán hàng — Alumdoor

## Ranh giới nghiệp vụ

`Gói bán hàng` trả lời: một dòng bán đã chốt thì phải giao những mặt hàng vật lý nào và số lượng bao nhiêu.

- Không dùng gói để lưu đơn giá hoặc chiết khấu; phần đó thuộc Bảng giá, Đơn giá theo bảng giá và Chính sách giá.
- Không dùng gói để mô tả vật tư sản xuất; phần đó thuộc BOM/định mức.
- `Phương án bán` chọn cách bán và có thể trỏ tới một gói giao hàng.
- Đơn bán chụp phiên bản gói tại thời điểm chốt để sửa gói sau này không làm đổi nghĩa vụ giao của đơn cũ.
- Gói `ALL` giao toàn bộ component theo một giá thương mại của dòng cha. Gói `SELECTABLE` cho phép `Tách món`: người dùng tích component, mỗi component lấy giá/chính sách hiện hành của chính Item và vẫn được lưu là child của dòng bộ.

## Form người dùng

### Gói bán hàng

- Mã gói: máy tự gợi ý khi tạo và khóa sau khi lưu.
- Tên gói: bắt buộc.
- Mặt hàng bán áp dụng: bắt buộc, đúng một mã thành phẩm cửa.
- Các món phải giao: bảng chi tiết.
- Ngừng dùng.

Một gói không được áp dụng mơ hồ cho cả nhóm hàng. Luồng giao/đổi/trả cần đúng mã mặt hàng nguồn, còn mô hình hiện tại cũng chỉ kiểm tra phạm vi theo `item_code`.

### Món trong gói

- Mặt hàng giao.
- ĐVT giao.
- Tính số lượng theo: cố định, chiều cao, chiều rộng, rộng cắt lá, diện tích, số bộ hoặc số lá.
- Hệ số / số lượng.
- Với gói `SELECTABLE`: chọn sẵn/bắt buộc, có trừ khỏi giá bộ không, có trừ khỏi cơ sở chiết khấu của bộ không và Sales Option áp dụng cho món.

`Mã dòng` và vai trò kỹ thuật được máy quản lý. Mã dòng tự sinh `MON-001`, `MON-002`… và là định danh để theo dõi giao, đổi, trả. Các cờ chọn/trừ giá chỉ hiện trong màn quản trị gói, không nằm trên đơn hàng thường.

## Ví dụ diễn giải

- Mô tơ: `Theo số bộ × 1`.
- Ray ngang theo bề rộng cửa: `Theo chiều rộng × 1`.
- Một phụ kiện cố định cho mỗi dòng bán: `Số lượng cố định × 1`.

Không tạo dữ liệu gói mẫu nếu chưa xác nhận chính xác mã cửa, mã ray/mô tơ/phụ kiện và công thức số lượng từ tài liệu nguồn.
