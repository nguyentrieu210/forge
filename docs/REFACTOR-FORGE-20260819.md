# Refactor Forge — kế hoạch nhánh `refactor/forge-core` (2026-08-19)

Nhánh: `refactor/forge-core`, tách từ `agent-live` @ `857064139`, làm trong worktree
`C:\alumdoor-worktrees\refactor` để `C:\alumdoor` giữ nguyên vai trò gương live-sync
(theo `AGENTS.md`).

## 0. Mốc đo trước khi động vào code

Đo trên chính commit gốc của nhánh, **chưa sửa gì**:

| Cổng | Kết quả |
|---|---|
| `server` unit test | **2395 test, 76 rớt** (xem 0b: con số 73 đo lần đầu là sai vì brief đã bị chính bộ test ghi đè) |
| `client:typecheck` | xanh |
| `client:test` (`@metaforge/demo selfcheck`) | **rớt** — `field phụ thuộc null không được làm Link rỗng vĩnh viễn` |

Nghĩa là **cây code đỏ sẵn**. Chạy `npm test` rồi nhìn "có đỏ hay không" là vô nghĩa trên
nhánh này: không phân biệt được lỗi vốn có với lỗi vừa gây ra. Vì vậy bước đầu tiên là
chốt mốc, không phải sửa code.

Nhóm lỗi có sẵn (mẫu):

- **Test trỏ vào code không còn/chưa có**: thiếu export `attendanceStationLiteCreate`,
  `PROFILE_WEIGHT_ITEMS`; thiếu module `dist/apps-src/alumdoor-worker/src/hr-payroll-lite-routes.js`,
  `dist/apps/tenant-worker/src/employee-lite-coordinator.js`.
- **Lỗi ghép đường dẫn Windows**: `ENOENT: open 'C:\C:\alumdoor-worktrees\...'` — nhân đôi ổ đĩa
  khi đổi `file://` URL sang path.
- **Lỗi nghiệp vụ thật**: chấm công (`Exactly one submitted Shift Assignment…`), BOM nguồn 4D/4.6D,
  nhóm giá Sales Order, `Body is unusable: Body has already been read`.
- **Bản dịch tiếng Việt**: nhãn `Website`, `Email` chưa quét qua fallback.

### Cổng dùng suốt nhánh này

```
node scripts/refactor-baseline.mjs --record   # chốt mốc (chỉ chạy khi CỐ Ý dời mốc)
node scripts/refactor-baseline.mjs            # sau mỗi bước; có RỚT MỚI => exit 1
```

Mốc nằm ở `server/qa/refactor-baseline.json`. Cổng chỉ chặn **rớt mới**, đồng thời báo test
đã xanh trở lại và test biến mất khỏi mốc (đổi tên/xoá — chỗ dễ giấu hồi quy nhất).

## 0b. Bắt được ngay khi đo mốc: `npm test` xoá một màn hình rồi tự xanh

`tests/alumdoor-v2-generator-reproducibility.test.mjs` chạy bộ sinh **ghi thẳng** vào
`server/briefs/alumdoor-v2.json` rồi so file trước/sau. Vì brief đang có phần **sửa tay** mà bộ
sinh không biết, hệ quả là:

1. Lần chạy đầu: bộ sinh ghi đè, **xoá mất** phần sửa tay — test đỏ đúng một lần.
2. Lần chạy sau: file đã bằng đúng đầu ra bộ sinh → **xanh**, và mất mát biến khỏi tầm mắt.
3. Ai commit sau khi chạy test là đẩy luôn phần mất mát lên nhánh.

Phần bị xoá không nhỏ:

| Chỗ | Mất gì |
|---|---|
| `actions` | màn **`giao-nhieu-don-fifo`** — "Kho giao hàng nhiều đơn" (gộp nhiều đơn bán thành một phiếu giao theo FIFO) |
| `Quotation Item` | các trường `width_pb_ray_m`, `width_pb_nhua_m` khỏi `form` / `list` / `quickEntry` |
| `doctypes` | 11 doctype khác nội dung (Customer, Pricing Rule, Sales Order, Sales Invoice Item…) |
| `fixtures` | 7 mẫu nguồn `SRC-UC-KT-*` khác nội dung |
| `navigation` | danh sách mục khác |

**Đã sửa:** bộ sinh nhận `--src` / `--out`; test sinh vào thư mục tạm và so với bản đã commit,
không đụng cây làm việc nữa. Sau khi sửa, chạy hết bộ test **không còn file tracked nào bị đổi**.

**Hệ quả với mốc:** mốc đầu tiên (73 rớt) đo trên brief đã bị ghi đè, tức là sai. Mốc thật là
**76 rớt / 2395**, gồm ba test trước đây "xanh nhờ tự ghi đè":

- `alumdoor-v2-generator-reproducibility` — bộ sinh không tái lập được brief đang ship
- `alumdoor-child-presentation::generated AlumDoor brief is materialized from the canonical child-presentation helper`
- `alumdoor-sales-summary-metadata::Sales Order materializes metadata-driven commercial summary`

Ba test này đang nói đúng một việc: **brief sửa tay và bộ sinh đã tách đôi**. Chọn bên nào là
nguồn sự thật (dạy bộ sinh biết phần sửa tay, hay bỏ phần sửa tay) là quyết định nghiệp vụ,
không phải quyết định kỹ thuật — xem mục 5.

## 1. Chẩn đoán: hai bệnh, không phải bốn

Bốn vùng user chọn (server core, client runtime/views, vertical Alumdoor, chống trôi dạt luật)
quy về đúng hai bệnh:

### Bệnh A — vertical Alumdoor mọc vào lõi dùng chung

| Nơi đáng lẽ chỉ chứa nền tảng | Mức lẫn vertical |
|---|---|
| `server/packages/frappe-api/src/router.ts` | 63 dòng nhắc `alumdoor`, 6 method `metaforge.api.*_alumdoor_*` nằm thẳng trong switch chung |
| `server/packages/clouderp-erpnext/src` | 132 chỗ nhắc `alumdoor` trên 15 file |
| `client/packages/views/src/app/` | 7656 dòng, trong đó **7336 dòng là `app/vertical/alumdoor`** (~95%) |

Hệ quả: không thể dựng app thứ hai từ lõi mà không kéo theo Alumdoor; mọi sửa vertical đều
chạm file dùng chung, nên bán kính ảnh hưởng của một thay đổi nhỏ là toàn nền tảng.

### Bệnh B — cùng một luật viết nhiều lần rồi trôi dạt

Đếm trên 1221 file nguồn (bỏ `node_modules`, `vendor`, test):

| Hàm | Số bản sao | Trôi dạt đã xảy ra |
|---|---|---|
| `text` / `requiredText` / `optionalText` | 129 / 55 / 31 | ép kiểu + thông báo lỗi khác nhau |
| `safeAdd` | 26 | có bản nhận `field`, có bản không, thông báo lỗi khác nhau |
| `round` | 13 | **có** — `storefront.ts` làm tròn 2 chữ số **không** cộng `EPSILON`; 12 bản còn lại 6 chữ số **có** `EPSILON` |
| `divideRounded` | 13 | 4 bản `number`, 8 bản `bigint`, 1 bản có `PlanningRoundingMode`; cùng luật nửa-lên nhưng guard/thông báo khác nhau |
| `sha256Hex` | 12 | **có nhà chính thức** `@cloudforge/core` vẫn đang export, 12 bản sao vẫn sống |
| `money` (định dạng) | 12 | tiền tệ, số chữ số, ký hiệu ₫ mỗi nơi một kiểu |

Đây đúng kiểu lỗi đã bắt được trước đây (`resolveNavPath` sao chép thiếu `encodeURIComponent`,
luật self-approval viết ba kiểu): mọi cổng đều xanh vì mỗi bản sao tự đúng với test của nó.

## 2. Thứ tự thi công

Đi từ chỗ **rủi ro thấp nhưng chặn hồi quy tốt nhất** trước; tách lớp để sau, vì tách lớp
an toàn hay không phụ thuộc vào việc đã gom luật lại hay chưa.

| Pha | Nội dung | Rủi ro |
|---|---|---|
| **P0** | Cổng mốc (`refactor-baseline.mjs`) + tài liệu này | không |
| **P1** ✅ | Gom `round` (10 bản) và `divideRounded` (5 bản) về `@cloudforge/core`; `numeric-single-source.test.mjs` ghim luật + sổ bản còn riêng | thấp |
| **P2** ✅ | Gom 10 bản `money()` về `formatMoney` của `@metaforge/core`; `money-single-source.test.mjs` ghim 5 kiểu hiển thị | thấp |
| **P2b** ✅ | Nạp lười 7 biểu đồ nặng + bộ vẽ SVG: chunk `engine` 833 → 662 kB (gzip 285 → 229) | thấp |
| **P3** | Bóc 6 method `*_alumdoor_*` khỏi `router.ts` sang bảng đăng ký method của vertical | trung bình |
| **P4** | Tách `client/packages/views/src/app/vertical/alumdoor` ra khỏi package `views` | trung bình |
| **P5** | Cắt `router.ts` (4530 dòng) theo trục: REST resource · method dispatch · metadata · storefront | cao |
| **P6** | Cắt `alumdoor-worker/src/index.ts` (3689 dòng) và `ChildGrid.tsx` (2200 dòng) | cao |

Mỗi pha là một commit riêng, chạy cổng mốc trước khi commit.

## 3. Nguyên tắc trong lúc refactor

- **Không đổi hành vi mà không nói ra.** Chỗ nào buộc phải thống nhất luật đang lệch nhau
  (ví dụ `round` của storefront), ghi rõ trong commit và trong mục 4 dưới đây.
- **Gom luật thì phải ghim bằng test.** Một luật một nguồn, cộng test import cả nơi dùng để
  so — không để bản sao mới mọc lại.
- **Thao tác vòng đời phải chạy hai lần.** Lỗi installer trước đây chỉ lộ ở lần nâng cấp thứ hai.
- **Không đụng dữ liệu.** Nhánh này chỉ sửa nguồn; không chạy importer, không deploy tenant.

## 4. Thay đổi hành vi cố ý (cập nhật dần)

| Nơi | Trước | Sau | Lý do |
|---|---|---|---|
| `frappe-api/src/storefront.ts` `round` | 2 chữ số, không `EPSILON` | `roundTo(value, 2)` dùng chung, có `EPSILON` | cùng một tên `round` mà hai luật; bản không `EPSILON` làm `1.005` thành `1.00` do sai số nhị phân |

## 5. Câu hỏi cần chủ dự án quyết

1. **Brief Alumdoor**: bản sửa tay (`giao-nhieu-don-fifo`, `width_pb_ray_m`, `width_pb_nhua_m`…)
   là thứ đang chạy thật. Dạy bộ sinh `build-alumdoor-v2-brief.mjs` sinh ra chúng (giữ nguyên
   hành vi, tốn công) hay chấp nhận bỏ? Trước khi chốt, **không** chạy bộ sinh ghi đè brief.
2. **Luật chia trong sản xuất**: 4 file (`manufacturing-lifecycle`, `manufacturing-stock-guard`,
   `manufacturing-work-order-guard`, `manufacturing-capacity`) dùng `(n + d/2) / d` — với BigInt,
   số âm bị cắt về 0 thay vì làm tròn ra xa 0, khác luật nửa-lên của `@cloudforge/money`.
   Gom về một luật là **đổi số** ở nhánh sản xuất khi có giá trị âm (hoàn/hụt/đảo bút toán).
3. **Hiển thị tiền**: mười màn đang in cùng một con số theo **bốn kiểu** — `1.234.567 ₫`,
   `1.234.567₫`, `1.234.567 đ`, `1.234.567`. Refactor đã gom luật nhưng GIỮ NGUYÊN cả bốn
   kiểu để không đổi giao diện. Thống nhất về một kiểu là quyết định giao diện.
   Kèm theo: `null` và `""` được tính là `0` còn `undefined` ra `—` — bất đối xứng có sẵn
   từ mười bản cũ, nay ghim trong `money-single-source.test.mjs`. Có nên coi cả ba là
   "chưa có số" không?

