# ALUMDOOR — BÁN HÀNG WIZARD

Ngày chốt UX: **2026-08-05**  
Scope: **UI/UX + interaction contract** cho tab Bán hàng của Alumdoor.  
Không thay tab `Quy trình` hiện tại. Không tạo tab `Lịch sử` cấp module.

---

## 1. Quyết định chốt

Thanh tab của module Bán hàng:

```text
[ Quy trình ] [ Bán hàng ] [ Đơn hàng ] [ Phiếu xuất kho ] [ Giao hàng ] [ Báo cáo ]
```

Ý nghĩa:

- `Quy trình`: giữ nguyên màn quy trình hiện tại; không biến thành wizard.
- `Bán hàng`: màn mới, là **wizard tạo đơn hàng trên một trang**.
- `Đơn hàng`: danh sách và xử lý đơn đã tạo.
- `Phiếu xuất kho`: nghiệp vụ xuất kho.
- `Giao hàng`: điều phối/tạo phiếu giao, gồm nghiệp vụ tạo phiếu giao theo ngày.
- `Báo cáo`: dashboard và báo cáo bán hàng tại chỗ.
- Không có tab `Lịch sử`; lịch sử/audit nằm trong từng đơn hàng.
- `Tính công thức cửa` không còn là tab tác nghiệp riêng khi wizard đã hội tụ đủ chức năng; logic tính vẫn thuộc worker/domain authority hiện có.

---

## 2. Mục tiêu của màn Bán hàng

Sale chỉ nhập những gì khách nói và những lựa chọn thương mại cần thiết. Hệ thống phải trả lời ngay trên cùng một màn:

1. Khách nào đang mua?
2. Khách cần bộ cửa nào và kích thước đầu vào là gì?
3. Kích thước sản xuất, số lá và diện tích bán ra là bao nhiêu?
4. Giá bán là bao nhiêu?
5. Kho hiện tại có đủ vật tư phù hợp để nhận đơn không?
6. Nếu đủ, có thể xác nhận đơn; nếu thiếu, phải chỉ rõ thiếu gì trước khi xác nhận.

Màn này không phải Form `Sales Order` truyền thống. Nó là một **sales configurator** dẫn đến việc tạo/submit Sales Order qua authority hiện có.

---

## 3. Mô hình tương tác: one-page accordion wizard

### 3.1 Nguyên tắc

Toàn bộ wizard nằm trên **một route/một trang**. Không chuyển trang giữa các bước và không dùng modal lớn cho từng bước.

Mỗi bước là một section dạng accordion:

- Chỉ **một bước đang mở** ở một thời điểm.
- Bước đang làm mở rộng toàn bộ nội dung.
- Bấm `Tiếp tục` -> validate -> lưu state của bước -> **khép bước hiện tại** -> hiện dòng tóm tắt -> **tự mở bước kế tiếp**.
- Bước đã hoàn thành có dấu `✓` và nút `Sửa`.
- Bấm `Sửa` ở bước trước sẽ mở lại bước đó và khép bước hiện tại.
- Nếu dữ liệu bước trước thay đổi làm ảnh hưởng dữ liệu downstream, các bước sau được đánh dấu `Cần tính lại` thay vì giữ kết quả cũ im lặng.
- Bước cuối `Xác nhận đơn` cũng là một accordion section cùng kiểu, không phải modal xác nhận tách rời.

### 3.2 State của một bước

```text
LOCKED       chưa tới bước này
ACTIVE       đang mở và đang nhập
COMPLETE     đã validate, đang thu gọn và có summary
STALE        dữ liệu upstream đổi, cần tính/kiểm tra lại
ERROR        không qua validation
```

### 3.3 Luật downstream invalidation

Ví dụ:

- đổi khách -> giá/nhóm khách phải tính lại;
- đổi mã cửa/ray/kích thước -> công thức, số lá, m2, giá và ATP phải tính lại;
- đổi màu/tình trạng/khổ yêu cầu -> ATP phải tính lại;
- đổi bảng giá/chiết khấu -> tổng tiền và xác nhận phải tính lại;
- ATP cũ không được coi là còn hiệu lực sau khi cấu hình vật tư thay đổi.

Không được để người dùng sửa bước 2 nhưng bước 4 vẫn hiện `✓ Đủ kho` từ kết quả cũ.

---

## 4. Wireframe desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ BÁN HÀNG                                                     Đơn nháp mới    │
│ Tạo đơn bán từ nhu cầu khách → kỹ thuật → giá → tồn → xác nhận             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✓ 1. KHÁCH HÀNG                                      [Sửa]                 │
│    Nguyễn Văn A · Khách lẻ · 090... · Bình Tân                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. CẤU HÌNH CỬA                                                       │  │
│  │                                                                        │  │
│  │ Mặt hàng       [ AL71N ▼ ]        Màu           [ Trắng sứ ▼ ]        │  │
│  │ Ray            [ U75 ▼ ]          Motor         [ YH500 ▼ ]           │  │
│  │                                                                        │  │
│  │ Khách khai rộng [ Rộng lọt lòng ▼ ]   [ 4.000 ] mm                    │  │
│  │ Khách khai cao  [ Cao lọt lòng ▼ ]    [ 2.300 ] mm                    │  │
│  │ Số bộ           [ 1 ]                                                  │  │
│  │                                                                        │  │
│  │ Hệ thống tính:                                                         │  │
│  │ Phủ bì ray 4.080 mm · Phủ bì cao 2.800 mm · Số lá 42 · 11,42 m²      │  │
│  │                                                                        │  │
│  │                                              [Tiếp tục]                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ○ 3. GIÁ BÁN                                                               │
│    Chưa tính                                                                 │
│                                                                              │
│  ○ 4. KHẢ NĂNG ĐÁP ỨNG KHO                                                  │
│    Chưa kiểm tra                                                             │
│                                                                              │
│  ○ 5. XÁC NHẬN ĐƠN                                                          │
│    Chưa sẵn sàng                                                             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Khi hoàn thành bước 2, section thu lại thành:

```text
✓ 2. CẤU HÌNH CỬA                                             [Sửa]
  AL71N · Trắng sứ · U75 · 4.000 × 2.300 lọt lòng · 42 lá · 11,42 m² · 1 bộ
```

và bước 3 tự mở.

---

## 5. Bước 1 — Khách hàng

### 5.1 Trạng thái ban đầu

Wizard mở trang với duy nhất `Khách hàng` đang xổ ra.

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. KHÁCH HÀNG                                               │
│                                                              │
│ Khách hàng      [ Tìm theo tên / SĐT / mã khách ▼ ]         │
│ Điện thoại      [ tự điền / cho phép bổ sung theo quyền ]    │
│ Địa chỉ giao    [                                      ]     │
│ Công trình      [                                      ]     │
│ Ngày giao mong muốn [ dd/mm/yyyy ]                           │
│                                                              │
│                                         [Tiếp tục]           │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Khi chọn khách

Hệ thống đọc hồ sơ Customer và hiển thị:

- tên khách;
- nhóm khách/nhóm giá theo authority của Customer;
- điện thoại;
- địa chỉ mặc định nếu có;
- thông tin liên hệ cần thiết.

Không để sale chọn tay `customer_group` nếu field này là snapshot derive từ hồ sơ khách.

### 5.3 Hoàn thành bước

Bấm `Tiếp tục`:

1. validate khách;
2. chụp state khách cần cho wizard;
3. khép section;
4. header summary:

```text
✓ 1. KHÁCH HÀNG                                      [Sửa]
  Nguyễn Văn A · Khách lẻ · 090... · 12B ...
```

5. tự mở `2. Cấu hình cửa`.

---

## 6. Bước 2 — Cấu hình cửa

Đây là nơi hội tụ chức năng hiện đang nằm rời ở `Tính công thức cửa`.

### 6.1 Người dùng nhập

Tối thiểu:

- mặt hàng cửa / mã sản phẩm;
- màu;
- đời/tình trạng sản phẩm nếu áp dụng;
- ray;
- motor/phụ kiện cấu hình nếu sản phẩm yêu cầu;
- cách bán `Trọn bộ/Tách món` nếu authority hiện hành hỗ trợ;
- loại kích thước rộng khách đang khai;
- giá trị rộng;
- loại kích thước cao khách đang khai;
- giá trị cao;
- số bộ;
- trường đặc thù theo dòng sản phẩm chỉ hiện khi metadata/rule yêu cầu.

### 6.2 Ngôn ngữ nhập phải theo cách khách nói

Ví dụ khách lẻ nói `rộng lọt lòng 4m, cao lọt lòng 2,3m` thì sale nhập đúng hai số đó.

Hệ thống tự derive và hiển thị read-only:

- rộng phủ bì ray;
- rộng cắt lá;
- cao phủ bì;
- cao liên quan nếu có;
- bản lá;
- số lá;
- diện tích tính giá;
- các output kỹ thuật mà worker hiện có trả về.

Không bắt sale tự biến đổi lọt lòng -> phủ bì trước khi nhập.

### 6.3 Nhiều bộ cửa trong một đơn

Wizard phải cho phép thêm nhiều cấu hình vào cùng đơn:

```text
Bộ 1  AL71N · 4.000 × 2.300 · 1 bộ     [Sửa] [Xóa]
Bộ 2  AL70  · 2.800 × 2.200 · 2 bộ     [Sửa] [Xóa]

[+ Thêm bộ cửa]
```

Mỗi bộ giữ snapshot input/output riêng; không dùng một bộ công thức chung rồi áp ngầm cho tất cả dòng.

### 6.4 Authority

Công thức cửa không được viết lại trong React. Wizard gọi domain/worker calculation hiện có; UI chỉ hiển thị input, result và validation.

---

## 7. Bước 3 — Giá bán

Section tự mở sau khi tất cả cấu hình cửa hợp lệ.

### 7.1 Hiển thị

Theo từng bộ:

```text
AL71N · 11,42 m²
Đơn giá / m²               850.000
Tiền cửa                  9.707.000
Motor                     1.500.000
Ray/phụ kiện                ...
Lắp đặt                     ...
```

Cuối section:

```text
Tạm tính                  ...
Chiết khấu                ...
Thuế                       ...
TỔNG                      ...
```

### 7.2 Pricing authority

- Nếu có `selling_price_list`, giá phải đi qua pricing authority hiện có.
- Không nhân tiền bằng logic riêng trong UI.
- Nếu chính sách hiện hành cho phép không chọn bảng giá và nhập giá tay, giữ behavior đó theo permission; wizard chỉ làm UX thuận tiện hơn.
- `customer_group` là snapshot từ khách nếu authority hiện hành đã quy định như vậy.
- Giá và công thức được snapshot vào chứng từ khi tạo đơn để thay đổi master sau này không làm thay đơn cũ.

### 7.3 Hoàn thành bước

Summary khi thu gọn:

```text
✓ 3. GIÁ BÁN                                            [Sửa]
  3 bộ · 27,84 m² · Tổng 31.250.000đ
```

---

## 8. Bước 4 — Khả năng đáp ứng kho

Đây là **availability check**, không mặc định là mutation/reservation.

### 8.1 Câu hỏi cần trả lời

Không chỉ kiểm `tổng tồn > số lượng cần`.

Đối với nhôm/cửa phải xét đúng các dimension được domain quản lý, tối thiểu khi áp dụng:

- mã nhôm;
- màu;
- đời/tình trạng;
- chiều dài/khổ tối thiểu;
- số lá/cây khả dụng;
- số đã giữ chỗ;
- kho được phép dùng;
- đầu thừa có thể tái sử dụng;
- kerf/hao hụt nếu engine cắt yêu cầu.

### 8.2 Ba trạng thái UX

#### Đủ

```text
✓ ĐỦ VẬT TƯ
AL71N Trắng · cần 42 lá ≥ 4,000 m · khả dụng 68
Có thể nhận đơn với cấu hình hiện tại.
```

#### Cảnh báo nhưng có phương án

```text
⚠ ĐỦ NHƯNG HAO HỤT CAO
Có thể dùng lô 5,8 m nhưng đầu thừa lớn.
Hệ thống đề xuất phương án ít hao hụt hơn nếu có.
```

#### Thiếu

```text
✕ CHƯA ĐỦ VẬT TƯ
AL71N Trắng · cần 42 · khả dụng 27 · thiếu 15 lá
```

Có thể hiển thị next-best-action từ dữ liệu thật nếu có:

- đổi lô;
- đổi màu;
- đổi cấu hình;
- chờ hàng nhập;
- tạo đề nghị mua.

Không tự bịa vật tư thay thế nếu chưa có rule/master cho phép.

### 8.3 Reservation

Wizard kiểm tra khả dụng để sale biết có thể nhận đơn hay không. Việc **giữ chỗ thật** vẫn theo milestone authority hiện hành (ví dụ khi phát lệnh sản xuất) cho tới khi business contract chính thức đổi.

Không biến một lần xem ATP thành trừ tồn hoặc reserve lô im lặng.

### 8.4 Recheck

Kết quả ATP phải có dấu thời điểm/version đủ để UI biết đây là snapshot kiểm tra. Trước submit/xác nhận, server được quyền recheck các invariant cần thiết.

---

## 9. Bước 5 — Xác nhận đơn

Bước cuối cũng mở như một accordion section, không popup toàn màn.

```text
┌──────────────────────────────────────────────────────────────┐
│ 5. XÁC NHẬN ĐƠN                                             │
│                                                              │
│ Khách       Nguyễn Văn A                                     │
│ Số bộ       3                                                │
│ Diện tích   27,84 m²                                         │
│ Tổng tiền   31.250.000đ                                      │
│ Kho         ✓ Đủ                                             │
│ Ngày giao   12/08/2026                                       │
│                                                              │
│ ✓ Khách hợp lệ                                               │
│ ✓ Công thức hợp lệ                                           │
│ ✓ Giá hợp lệ                                                 │
│ ✓ ATP đã kiểm tra                                            │
│                                                              │
│ [Lưu nháp]                         [XÁC NHẬN ĐƠN]            │
└──────────────────────────────────────────────────────────────┘
```

### 9.1 Gate

`XÁC NHẬN ĐƠN` chỉ active khi các gate bắt buộc pass.

Nếu có warning được phép override thì phải đi qua authority/approval tương ứng, không chỉ enable nút ở client.

### 9.2 Commit

Commit phải tạo/update `Sales Order` qua business authority hiện có, không tạo shadow order riêng cho wizard.

Sau thành công:

```text
✓ Đã tạo DH-2026-0125
[Mở đơn hàng] [Tạo đơn mới]
```

---

## 10. Lịch sử

Không có tab `Lịch sử` cấp module.

Lịch sử nằm trong chi tiết một đơn:

```text
Đơn hàng DH-2026-0125
[ Tổng quan ] [ Hàng hóa ] [ Giao hàng ] [ Thanh toán ] [ Lịch sử ]
```

`Lịch sử` đọc audit/version/timeline authority hiện có; không tạo bảng log thứ hai chỉ phục vụ UI.

---

## 11. Responsive

### Desktop

- một cột accordion chính, chiều rộng thoải mái;
- có thể có summary nhỏ sticky bên phải nếu runtime hỗ trợ mà không làm rối luồng;
- CTA của bước nằm cuối section đang mở.

### Mobile

- vẫn **một trang, một accordion**;
- mỗi bước full width;
- summary của bước hoàn thành rút xuống 1–2 dòng;
- CTA `Tiếp tục`/`Xác nhận` sticky bottom trong section active nếu cần;
- không chuyển wizard thành 5 route riêng.

---

## 12. Error/validation UX

- Validation lỗi nằm ngay trong section hiện tại.
- Không nhảy người dùng sang tab khác chỉ để xem lỗi.
- Field lỗi có message cụ thể.
- Server reject phải map về bước/field liên quan khi có thể.
- Không mất dữ liệu đã nhập khi preview/tính giá/ATP lỗi mạng.
- Khi stale version/conflict, giữ draft trên client và yêu cầu refresh/recheck chứ không ghi đè im lặng.

---

## 13. Mapping với authority hiện có

Repo hiện đã có các primitive/domain path liên quan:

- `Customer`;
- `Quotation`;
- `Sales Order`;
- `Delivery Note`;
- `Item Price` / `Price List` / pricing authority;
- action `tinh-cong-thuc-cua` -> `alumdoor.door.calculate`;
- action `bao-gia-thanh-don`;
- action `don-ban-thanh-phieu-xuat`;
- `Stock Reservation`;
- report/logic tồn nhôm theo khổ.

Wizard phải **compose các authority này**, không tạo bản sao.

---

## 14. UI Change Resolver / layer decision

```text
UI Surface: Alumdoor > Bán hàng > Tạo đơn
Owning App/DocType: Alumdoor / Sales Order
Current declaration source: server/briefs/alumdoor.json + V2 derivation/package source
Relevant existing domain action: alumdoor.door.calculate
Requested change: single-page sequential accordion wizard for sales order creation
Chosen target layer: declaration-first; generic reusable wizard/accordion presentation only if current vocabulary cannot express it
Engineering risk when implemented: STANDARD
Release impact when implemented: NEW_CANDIDATE; PILOT_RELOCK only if deployed onto frozen pilot target
```

### Vì sao không hard-code React Alumdoor ngay

Pattern này có giá trị dùng lại cho:

- bán hàng cấu hình sản phẩm;
- onboarding;
- nhập liệu có nhiều stage;
- transaction setup có preview/validation trước commit.

Do đó nếu metadata hiện tại chưa diễn đạt được `steps + accordion + completion summary + downstream stale`, cần mở rộng canonical presentation contract một cách business-neutral thay vì viết `if Alumdoor/Sales Order` trong shared renderer.

Nếu shared contract đang thuộc workstream khác, ghi Dependency Request và vẫn có thể tiếp tục phần Alumdoor declaration/domain mapping độc lập.

---

## 15. Proposed metadata semantics

Tên field cuối cùng do canonical metadata owner quyết định. Semantic tối thiểu cần biểu đạt:

```json
{
  "surface": "wizard",
  "layout": "accordion",
  "expandMode": "single",
  "steps": [
    {
      "key": "customer",
      "label": "Khách hàng",
      "fields": ["customer", "install_address", "delivery_date"],
      "summary": ["customer", "customer_group", "phone"]
    },
    {
      "key": "configuration",
      "label": "Cấu hình cửa",
      "source": "alumdoor.door.calculate",
      "repeatable": true
    },
    {
      "key": "pricing",
      "label": "Giá bán"
    },
    {
      "key": "availability",
      "label": "Khả năng đáp ứng kho",
      "preview": true
    },
    {
      "key": "confirm",
      "label": "Xác nhận đơn",
      "commit": "Sales Order"
    }
  ]
}
```

Đây là semantic proposal, **không phải schema đã được coi là canonical**.

---

## 16. Acceptance criteria

### Navigation

- [ ] Tab `Quy trình` giữ nguyên nội dung hiện tại.
- [ ] Có tab `Bán hàng` riêng mở wizard.
- [ ] Không có tab `Lịch sử` cấp module.
- [ ] `Đơn hàng`, `Phiếu xuất kho`, `Giao hàng`, `Báo cáo` vẫn độc lập.

### Wizard interaction

- [ ] Bước 1 mở mặc định.
- [ ] Chỉ một bước mở tại một thời điểm.
- [ ] `Tiếp tục` hợp lệ -> bước hiện tại thu gọn + summary + bước sau tự mở.
- [ ] Bấm `Sửa` mở lại bước cũ.
- [ ] Sửa upstream làm downstream stale đúng scope.
- [ ] Không mất draft khi preview lỗi.

### Business correctness

- [ ] Customer group/price context không bị client tự bịa.
- [ ] Công thức cửa gọi authority hiện có.
- [ ] Giá gọi pricing authority hiện có.
- [ ] ATP xét tồn khả dụng theo dimension ngành, không chỉ tồn tổng.
- [ ] ATP check không tự reserve/trừ tồn.
- [ ] Confirm tạo Sales Order canonical.
- [ ] Snapshot công thức/giá cần thiết được giữ trên chứng từ theo contract hiện hành.

### UI/QA

- [ ] Desktop không cần modal để đi qua 5 bước.
- [ ] Mobile vẫn dùng one-page accordion.
- [ ] Keyboard focus đi theo step active.
- [ ] Error được gắn đúng section/field.
- [ ] Có browser evidence cho happy path, invalid input, ATP shortage và upstream-edit-stale.

---

## 17. Flow cuối cùng

```text
TAB QUY TRÌNH
  giữ nguyên

TAB BÁN HÀNG
  1. Khách hàng
       ↓ Tiếp tục -> khép
  2. Cấu hình cửa
       ↓ Tiếp tục -> khép
  3. Giá bán
       ↓ Tiếp tục -> khép
  4. Khả năng đáp ứng kho
       ↓ Tiếp tục -> khép
  5. Xác nhận đơn
       ↓
     Sales Order

TAB ĐƠN HÀNG
  quản lý chứng từ đã tạo + lịch sử trong từng đơn
```

Đây là UX authority cho màn Bán hàng wizard cho tới khi có business decision mới hoặc repo evidence mới hơn thay thế.