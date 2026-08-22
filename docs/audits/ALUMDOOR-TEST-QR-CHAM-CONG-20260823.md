# ALUMDOOR — Màn tạo QR cố định cho trạm chấm công: đã có, chạy được, còn 3 lỗi

Ngày test: 23/08/2026 · môi trường `http://localhost:5173` · tài khoản `dev@example.com`.
Test thủ công trên trình duyệt.

---

## 1. Kết luận ngắn

**Màn đã có sẵn, không cần làm mới.** Nó tên là **"Thiết lập trạm chấm công / In mã QR cố định
của trạm"**, và làm đúng cả 3 thứ anh cần: tạo QR **cố định** (không đổi theo thời gian), gắn
QR vào **một chỗ** (trạm), và **lấy toạ độ** cho chỗ đó.

Đường vào: `http://localhost:5173/x/alumdoor-attendance:kiosk`

Em đã tạo thử trạm thật và **QR ra được**:

```
Tên trạm     Cổng xưởng
Mã trạm      ST-C258FB2048
Vĩ độ        10.762622      Kinh độ  106.660172
Bán kính     50 m
Token        eyJ2IjoyLCJ0ZW5hbnQiOiJkZW1vIiwic3RhdGlvbiI6IlNULUMyNThGQjIwNDgiLCJ0b2tlbl92ZXJzaW9uIjoiMSJ9...
Phiên bản token: 1
```

Ba nút sau khi tạo: **In QR** · **Tạo lại QR** · **Đổi trạm**.

Việc còn lại là **sửa 3 lỗi dưới đây**, không phải viết màn mới.

---

## 2. Thiết kế hiện có (để agent khỏi phải đọc lại code)

**Doctype trạm:** `AlumDoor QR Station` — file khai báo
`server/apps-src/alumdoor-attendance/doctypes/alumdoor-qr-station.json`

| Trường | Nhãn | Có trên UI? |
|---|---|---|
| `station_code` | Mã trạm | hiện, tự sinh |
| `station_name` | Tên trạm | ✅ nhập |
| `company` · `branch` | Công ty · Chi nhánh/Địa điểm | ❌ suy từ cấu hình HR Lite |
| `policy` | Chính sách ca | ❌ tự gán `ATP-HR-LITE-ALUMDOOR` |
| `latitude` · `longitude` | Vĩ độ · Kinh độ | ✅ nhập |
| `allowed_radius_m` | Bán kính cho phép (m) | ✅ nhập, mặc định 50 |
| `max_gps_accuracy_m` | Sai số GPS tối đa (m) | ❌ **không có ô** (mặc định 50) |
| `secret_version` | Phiên bản khoá QR | hiện đọc, `serverEnforced: true` |
| `qr_rotated_at` · `is_active` · `last_seen_at` | | ❌ |

**API đang dùng** (bắt được từ network lúc test):

```
POST alumdoor.attendance.station_create_lite
  { station_name, latitude, longitude, allowed_radius_m, idempotency_key }
  → { name: "ST-C258FB2048", policy: "ATP-HR-LITE-ALUMDOOR", is_active: 1, company, workplace }

POST alumdoor.attendance.station_qr
  { station }
  → { station, station_name, token, token_version }

POST alumdoor.attendance.rotate_station_qr        ← ĐANG HỎNG, xem §3.1
  { station }
```

**Token** giải mã ra `{ v: 2, tenant, station, token_version }` — **không chứa toạ độ, không
chứa nhân viên, không có hạn**. Toạ độ và bán kính được server tra theo `station` mỗi lần quét.
Đúng cách làm cho QR dán cố định.

Mã nguồn màn: `client/apps/runtime/src/experiences/AlumdoorAttendanceOperations.tsx`
(hàm `rotate` ở dòng ~214). Route rotate phía worker:
`server/apps-src/alumdoor-worker/src/index.ts:2756` →
`server/packages/frappe-api/src/alumdoor-methods.ts:334`.

---

## 3. Ba lỗi cần sửa

### 3.1 CHẶN — "Tạo lại QR" không bao giờ chạy được

Bấm **Tạo lại QR** → server trả **417**:

> `Field is server-controlled: secret_version`

`token_version` vẫn đứng ở `1`, QR không đổi.

**Vì sao:** doctype khai `secret_version` là `"serverEnforced": true`, `"valueSource": "system"`.
Kernel chặn mọi lệnh `save` có mang trường đó. Nhưng hàm rotate
(`alumdoor-methods.ts:344`) lại ghi đúng bằng đường `save`:

```ts
const document = { ...current.data, secret_version: version + 1, qr_rotated_at: context.now() };
await context.runCommand(await buildCommand({ ..., action: "save", document }));
```

Nó có thêm role `AlumDoor QR System` vào actor (dòng 345), nhưng guard trường không xét role đó.
**Trường tự chặn chính con đường duy nhất được phép ghi nó.**

**Hậu quả nghiệp vụ:** QR dán ở cổng mà bị chụp lại rồi phát tán thì **không có cách nào thu
hồi**. Đúng thứ mà dòng chữ trên đầu màn đang hứa: *"QR giữ nguyên cho đến khi quản lý chủ động
tạo lại để thu hồi bản in cũ."* — lời hứa đó hiện không thực hiện được.

**Hướng sửa** (chọn 1):
1. Cho guard `serverEnforced` bỏ qua khi actor mang role `AlumDoor QR System` (role đã được
   thêm sẵn, chỉ thiếu chỗ xét).
2. Đổi rotate sang một command/action riêng có quyền ghi trường `valueSource: "system"`, thay
   vì `action: "save"`.
3. Bỏ `serverEnforced` khỏi `secret_version` và bảo vệ bằng permission role của doctype
   (đã có `AlumDoor QR System`, `AlumDoor Attendance Manager`, `HR Manager`, `System Manager`).

### 3.2 CHẶN — Không lưu được cấu hình HR Lite nên không tạo được trạm

Trước khi tạo trạm, màn bắt: *"Hãy lưu cấu hình công ty và nơi làm việc HR Lite trước."*
Sang màn **Cài đặt nhân sự & tiền lương** (`.../hr-payroll-settings-lite`), bấm **Lưu cấu hình**
→ báo lỗi trần: **`App alumdoor returned 422`**.

Payload thực tế gửi đi:

```json
POST alumdoor.hr.payroll_lite_settings_save
{ "company": "", "workplace": "HQ", "currency": "VND", "morning_start": "07:00", ... }
```

`company` **rỗng**, dù ô Công ty đang hiển thị `ALUMDOOR — Cửa cuốn công nghệ Đức/Úc` và thẻ
`<select>` trong DOM có `value = "ALUMDOOR"`.

**Vì sao:** state React khởi tạo `company = ""`; `<select>` render ra và trình duyệt tự chọn
option đầu tiên, nhưng `onChange` chưa từng chạy nên state vẫn rỗng. Kinh điển: select không
controlled đúng.

**Cách chứng minh (em đã làm):** chạm vào ô Công ty — đổi sang công ty khác rồi đổi lại — là
`onChange` chạy, state có giá trị, bấm Lưu → **"Đã lưu cấu hình giờ làm và kỳ lương."** Sau đó
tạo trạm chạy ngay.

**Hướng sửa:** khởi tạo state công ty bằng giá trị mặc định thật (option đầu / công ty của
tenant) thay vì `""`; hoặc dùng `value` + `onChange` controlled đầy đủ. Và trả thông báo lỗi
tiếng Việt nói rõ thiếu trường nào, thay vì `App alumdoor returned 422`.

### 3.3 Không có danh sách trạm — chỉ nhớ được 1 trạm, theo trình duyệt

Màn nhớ trạm đang mở bằng `localStorage["alumdoor-attendance-print-station"]`. Nút **"Đổi trạm"**
chỉ xoá localStorage rồi quay về form trắng — **không có màn nào liệt kê các trạm đã tạo**.

Hệ quả: xưởng có 2–3 cổng thì không mở lại được QR của trạm cũ để in thêm, không tắt được trạm
bỏ đi (`is_active`), không sửa được toạ độ/bán kính. Trạm vẫn nằm trong `AlumDoor QR Station`
(em query ra được), chỉ là không có lối vào.

**Hướng sửa:** thêm màn danh sách trạm (hoặc chỉ cần mở doctype `AlumDoor QR Station` lên menu
Nhân sự), có: mở lại QR để in · sửa toạ độ/bán kính · bật/tắt trạm · nút Tạo lại QR.

---

## 4. Ba việc nên làm thêm (không chặn)

1. **Thiếu ô "Sai số GPS tối đa (m)".** Doctype đã có `max_gps_accuracy_m`, UI không cho nhập,
   mặc định 50. Đo tại chỗ: trình duyệt trên máy tính trả toạ độ với **sai số 113 m** — lớn hơn
   cả bán kính 50 m. Nên (a) hiện ô này cho quản lý chỉnh, và (b) khi bấm **"Dùng vị trí hiện
   tại"** mà sai số lớn hơn bán kính thì cảnh báo tại chỗ.
2. **Lấy toạ độ bằng điện thoại, đứng đúng chỗ dán QR.** Máy tính bàn định vị theo IP/WiFi nên
   lệch hàng trăm mét. Đây là điều nên ghi thẳng lên màn, không phải để người dùng tự đoán.
3. **`window.confirm` và `window.print`.** Nút "Tạo lại QR" dùng `window.confirm`
   (`AlumdoorAttendanceOperations.tsx:215`) — cả app còn lại dùng Dialog component. Nên thống
   nhất; hộp thoại native khoá cả tab và không hợp phong cách màn.

---

## 5. Đường đi để kiểm lại sau khi sửa

```
1. /x/alumdoor-attendance:hr-payroll-settings-lite  → Lưu cấu hình   (phải ra thông báo xanh)
2. /x/alumdoor-attendance:kiosk                     → nhập tên + toạ độ + bán kính → Tạo trạm
3. Kiểm QR hiện ra, "Phiên bản token: 1"
4. Bấm Tạo lại QR                                   → "Phiên bản token: 2", ảnh QR đổi
5. Quét QR cũ (bản in phiên bản 1)                  → phải bị từ chối
6. Đứng ngoài bán kính quét QR mới                  → phải bị từ chối
```

Bước 4 và 5 hiện chưa qua được.
