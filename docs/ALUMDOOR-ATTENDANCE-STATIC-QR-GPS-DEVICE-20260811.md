# AlumDoor Attendance — QR cố định + GPS + thiết bị đăng ký

Ngày: 2026-08-11  
Trạng thái: kiến trúc thay thế QR động; triển khai trong app `alumdoor-attendance` 0.4.0.

## 1. Quyết định kiến trúc

`Employee Checkin` tiếp tục là log gốc bất biến. `AlumDoor Attendance Day` tiếp tục là projection ba ca và nguồn công cho lương. Không tạo attendance engine song song và không đưa logic IN/OUT lên client.

Luồng mới:

```text
STATIC STATION QR + CURRENT GPS + REGISTERED DEVICE
                         ↓
resolve station → validate token/version → validate GPS accuracy
→ Haversine geofence → validate credential → resolve Employee
→ validate policy/branch/shift window → duplicate guard
→ Employee Checkin + AlumDoor Attendance Day + audit evidence
```

`alumdoor.attendance.challenge` trả `410 DYNAMIC_QR_REMOVED`. Không còn countdown, TTL hay kiosk phát mã. Màn quản trị cũ được đổi thành màn in/tải QR cố định.

## 2. Attendance Station

DocType hiện hữu `AlumDoor QR Station` được mở rộng, không tạo concept trùng:

| Field | Quy tắc |
|---|---|
| `station_code`, `station_name` | định danh/tên trạm |
| `company`, `branch` | scope bắt buộc |
| `policy` | chính sách ca đã approved và còn hiệu lực |
| `latitude`, `longitude` | tâm geofence |
| `allowed_radius_m` | mặc định 50 m, cấu hình từng trạm |
| `max_gps_accuracy_m` | mặc định 50 m, cấu hình từng trạm |
| `secret_version` | server-owned; tăng khi rotate |
| `is_active` | disable làm mọi scan bị từ chối |
| `qr_rotated_at` | bằng chứng rotate |

QR token là HMAC-SHA256 version 2, ổn định theo `tenant + station + secret_version`. Token không chứa employee, tọa độ hay secret. Đổi `secret_version` vô hiệu hóa ngay QR cũ mà không sửa lịch sử công.

## 3. GPS contract

Client chỉ gửi `{latitude, longitude, accuracy}` từ `getCurrentPosition({enableHighAccuracy:true, maximumAge:0})`. Backend kiểm tra tọa độ hữu hạn, accuracy dương, so với `max_gps_accuracy_m`, sau đó tính Haversine và so với `allowed_radius_m` theo điều kiện biên `distance <= radius`.

Không theo dõi nền. GPS chỉ được yêu cầu đúng lúc scan. Public resolve không trả tọa độ tâm trạm.

## 4. Device credential

DocType `AlumDoor Attendance Device` lưu `device_id`, Employee, `credential_hash`, trạng thái, thời điểm đăng ký/last seen/revoke và metadata tối thiểu. Credential ngẫu nhiên 256-bit chỉ trả một lần về điện thoại; server chỉ lưu SHA-256. Browser fingerprint, IP, user-agent và kích thước màn hình không phải identity.

Lần đầu, geofence được xác minh trước rồi UI mới hỏi `employee_number`. Lỗi mã nhân viên dùng thông báo đồng nhất để chống enumeration. Mỗi Employee mặc định tối đa hai thiết bị hoạt động; chính sách cấu hình được. Durable Object giới hạn năm lần đăng ký lỗi trên một installation trong 15 phút. Quản lý chỉ có thể revoke; credential đã revoke không được kích hoạt lại.

## 5. Idempotency và audit

Mỗi lần bấm có `request_id` ngẫu nhiên. Retry cùng request trả receipt cũ. Request mới trong `duplicate_scan_window_seconds` (mặc định 60 giây) được gộp, không đảo IN thành OUT.

Checkin lưu server timestamp, Employee, Station, Device, GPS thô, accuracy, khoảng cách server tính, radius snapshot, `verification_method=GPS`, token hash, segment và kết quả IN/OUT. Secret/credential plaintext không được log hoặc persist.

## 6. API và quyền

Public allowlist chỉ gồm:

- `alumdoor.attendance.resolve_station`
- `alumdoor.attendance.scan`

Hai method chạy bằng actor `Guest`, nhưng Employee chỉ được resolve từ credential đã bind. Các method `station_qr` và `rotate_station_qr`, CRUD Station/Device và lịch sử công vẫn cần role quản lý. Callback ghi dữ liệu chỉ nhận app identity AlumDoor đã ký.

## 7. Migration và tương thích

- Không destructive migration và không reinterpret checkin cũ.
- Station cũ phải được bổ sung company/branch/tọa độ/radius/accuracy trước khi dùng QR mới.
- `secret_version` hiện hữu được reuse cho rotate.
- `alu_token_nonce_hash` giữ tên cũ để tương thích dữ liệu nhưng từ 0.4.0 lưu hash static station token.
- App mobile mới không cần login; route runtime `scan` chuyển sang `/mobile/attendance/`.

## 8. Rủi ro còn lại

Web GPS không chống spoof tuyệt đối. Contract evidence đã có `verification_method` để bổ sung Wi-Fi/BLE/NFC/native attestation sau này mà không thay Attendance engine. Phase này không thêm map API, tracking liên tục hay fingerprint authentication.

## 9. Luồng thiết lập Lite — 14/08/2026

Quản lý không tạo Station bằng form metadata đầy đủ. Experience `Thiết lập trạm chấm công` chỉ hỏi tên trạm và bán kính (mặc định 50 m), sau đó lấy GPS hiện tại và gọi callback tin cậy. Backend tự sinh mã trạm, gán Công ty/Nơi làm việc/Policy từ `Cài đặt mặc định`, đặt accuracy 50 m, `secret_version=1` và kích hoạt trạm. Thành công thì UI chọn trạm mới và hiện ngay QR để in.

Policy không còn là một bước thủ công. Lưu `Cài đặt mặc định` tạo/cập nhật Policy đã duyệt; Station không thể được tạo nếu cấu hình này chưa sẵn sàng. Idempotency của Station dựa trên mã trạm sinh tất định từ request key, không cần lưu khóa kỹ thuật do client cung cấp.
