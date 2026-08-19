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
# server (chạy trong thư mục server/)
node scripts/refactor-baseline.mjs --build      # dựng lại dist/ rồi so mốc; RỚT MỚI => exit 1
node scripts/refactor-baseline.mjs --record    # chốt mốc (chỉ khi CỐ Ý dời mốc)
node scripts/refactor-baseline.mjs --build --only <chuỗi>   # vài giây thay vì cả bộ
npm run build:fast                             # chỉ dựng: dọn file mồ côi + tsc tăng dần

# client (chạy trong thư mục client/)
npx tsc -b
node scripts/refactor-baseline-client.mjs      # mốc: 15 rớt / 135 test
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
| **P1** ✅ | Gom `round` (10 bản), `divideRounded` (5 bản), `safeAdd` (19/26 bản) về `@cloudforge/core`; `numeric-single-source.test.mjs` ghim luật + sổ 40 nơi còn giữ hàm cùng tên | thấp |
| **P2** ✅ | Gom 10 bản `money()` về `formatMoney` của `@metaforge/core`; `money-single-source.test.mjs` ghim 5 kiểu hiển thị | thấp |
| **P2b** ✅ | Nạp lười 7 biểu đồ nặng + bộ vẽ SVG: chunk `engine` 833 → 662 kB (gzip 285 → 229) | thấp |
| **P3** ✅ | Bóc sạch vertical khỏi `router.ts`: 6 method → `VERTICAL_METHODS`, hook context → `VerticalRouterHooks`, nhãn "Tài khoản ngân hàng" → `LINK_DISPLAY_RULES`, luật chiết khấu thương mại → `alumdoor-commercial.ts`, `loadReadable`/`loadWritable` → `document-access.ts`. Nhắc `alumdoor`: **63 → 0**, 4530 → 4241 dòng; `router-vertical-free.test.mjs` giữ ranh giới | trung bình |
| **P4a** ✅ | Đảo chiều phụ thuộc phía client: `app/vertical/registry.ts` làm điểm ráp (import tĩnh, đúng khuôn `vertical-methods.ts` bên server), `RuntimeDoctypeWorkspace` tra bảng thay vì gọi tên | trung bình |
| **P4b** ✅ | 7325 dòng vertical thành package `@metaforge/vertical-alumdoor`, phụ thuộc NGƯỢC vào views. `vertical-registration.test.mjs` ghim hai vế: nạp package thì bảng có `alumdoor`, và `apps/runtime` nạp nó trước màn làm việc | trung bình |
| **P5** ✅ | Cắt `router.ts` **4530 → 3244 dòng (−28%)** thành 5 module có ranh giới: `document-access.ts` (đọc/ghi + quyền), `router-helpers.ts`, `link-search.ts` (ô chọn + nhãn), `desk-surfaces.ts` (7 mặt bàn làm việc), `alumdoor-commercial.ts`. Còn lại trong router đúng phần định tuyến: `dispatchMethod` 362 dòng và REST resource | cao |
| **P6** ✅ | `alumdoor-worker/src/index.ts` **3689 → 2815 dòng** (tách `document-validation.ts` 854 dòng + `responses.ts`); `ChildGrid.tsx` **2200 → 1907 dòng** (tách `child-grid-columns.ts` 313 dòng luật thuần) | cao |
| **P7** ✅ | Hiệu năng: chuỗi tải lúc mở app đi từ 5 chặng nối đuôi xuống 2 (tải trước theo làn, phát ngay trong `<head>`); vòng lặp dựng-test của repo 19 s → 6 s. Xem mục 7 | trung bình |
| **P8** ✅ | Hỏi trước phiên + manifest ngay trong `<head>` (sớm hơn ~300 ms); tách trang bán hàng và trang marketing khỏi `main-base` (378 → 325 kB). Xem mục 8 | trung bình |

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
| `bootstrap.ts` giải mã đường dẫn | `decodeURIComponent` trần | `safeDecode` trong `boot-route.ts` | một URL có `%` hỏng (ví dụ `/%`) ném lỗi trước khi kịp nạp gì — màn hình trắng, không thông báo |
| Lời gọi `forge.website.page` | xuất phát sau khi chunk bootstrap tải xong | xuất phát từ script nội tuyến trong `<head>` | cùng một lời gọi, chỉ sớm hơn ~2 chặng mạng; số lần gọi không đổi (nhớ theo `globalThis`) |

## 5. Câu hỏi cần chủ dự án quyết

1. ~~**Brief Alumdoor**~~ — ĐÃ XỬ LÝ phần lớn: bộ sinh nay tái lập được 19/20 điểm sửa tay.
   **Còn đúng một điểm cần quyết**: lineage số dòng nguồn của 7 fixture BOM. Brief đang ship
   và bộ test đều dùng `686-711` (rule code `SRC-687-*`); riêng module catalog dùng `687-712`
   (`SRC-688-*`) do commit `ffe8a1049` ngày 18/08 cố ý dịch +1 với lý do "row thật của Excel,
   không phải index 0-based" — nhưng commit đó **không sửa test nào** và cũng chưa từng sinh
   lại brief, nên hiện 7 test BOM đỏ trong mốc. Chọn bên nào cũng được, nhưng nếu theo bản
   `687-712` thì `rule_code` của BOM Template đang chạy sẽ đổi — đó là danh tính dòng dữ liệu
   trong app thật, tôi không tự đổi.
2. ~~**Luật chia trong sản xuất**~~ — ĐÃ XỬ LÝ. Test vét cạn (mọi tử số 0..400 trên 10 mẫu số)
   chứng minh `(n + d/2)/d` và luật nửa-lên cho kết quả **y hệt với mọi đầu vào không âm**;
   khác biệt chỉ ở số âm, mà các đường vào đó đều chặn số âm từ trước. Đã gom, cổng không
   nhúc nhích.
3. **Hiển thị tiền**: mười màn đang in cùng một con số theo **bốn kiểu** — `1.234.567 ₫`,
   `1.234.567₫`, `1.234.567 đ`, `1.234.567`. Refactor đã gom luật nhưng GIỮ NGUYÊN cả bốn
   kiểu để không đổi giao diện. Thống nhất về một kiểu là quyết định giao diện.
   Kèm theo: `null` và `""` được tính là `0` còn `undefined` ra `—` — bất đối xứng có sẵn
   từ mười bản cũ, nay ghim trong `money-single-source.test.mjs`. Có nên coi cả ba là
   "chưa có số" không?

## 6. Trộn với `agent-live` (19/08)

Trong lúc nhánh này chạy, `agent-live` đi thêm 4 commit và **sửa đúng file tôi đang cắt**
(`alumdoor-worker/src/index.ts`) — thêm `ray_type` vào khoá chọn chính sách cửa và đọc danh
mục `Quy cách cửa` thay cho bảng bản lá biên dịch sẵn.

Đã trộn `agent-live` vào nhánh này (không đụng `agent-live`, không đụng `main`). Một cụm
xung đột duy nhất, giải bằng cách lấy nguyên bản của họ rồi **chạy lại lát cắt** lên đó, nên
cả hai phía đều còn nguyên: `readSlatCatalog` của họ nằm cùng nhóm đọc master trong
`document-validation.ts`, hai sửa đổi `ray_type` của họ đi theo đúng hàm đã dời.

Sau khi trộn, cổng báo 4 rớt mới. **Cả bốn đều đỏ sẵn trên `agent-live`** — kiểm bằng cách
dựng worktree riêng tại `agent-live` và chạy chính hai file test đó:

| Test | Trên nhánh này | Trên `agent-live` |
|---|---|---|
| `sales-production-flow::Cửa tấm liền Úc dùng ray từng dòng…` | đỏ | **đỏ** |
| `sales-production-flow::…thiếu hoặc sai ray thì fail closed` | đỏ | **đỏ** |
| `alumdoor-sales-order-v2-complete::PB ray and PB plastic…` | đỏ | **đỏ** |
| `alumdoor-sales-order-v2-complete::commercial row keeps rate fixed…` | đỏ | **đỏ** |

Mốc được chụp lại theo trạng thái sau trộn: **server 75 rớt / 2413**, **client 17 rớt / 135**
(server bớt một so mốc cũ vì 3 test của họ đã xanh trở lại).

## 7. P7 — hiệu năng: mở app và vòng lặp dựng-test (19/08)

### 7.1 Bệnh: bundle mở app theo kiểu nối đuôi

Trình duyệt chỉ biết tên file tiếp theo sau khi đã đọc xong file trước, nên chuỗi khởi động
là năm vòng mạng xếp hàng:

```
index.html → index-*.js (2,2 kB) → bootstrap-*.js (2,6 kB) → main-*.js (193 kB)
           → main-base-*.js (378 kB) → [2 lời gọi API] → RuntimeDoctypeWorkspace-*.js (277 kB)
```

Hai chặng đầu tiêu tốn một vòng mạng đầy đủ chỉ để đọc chưa tới 5 kB. Đo thật trên
`alu.kairo.vn` từ VN (biên SIN): asset đã cache biên `ttfb` ~65 ms, một lời gọi `/api/method`
~185 ms, HTML ~190 ms. Nặng hơn cả độ trễ: các file lớn tải **nối đuôi** thay vì song song,
nên trên 4G phần chênh còn lớn hơn nhiều.

Còn hai chỗ nữa cùng một bệnh:

- `DoctypeWorkspace` nạp package vertical rồi mới nạp màn làm việc — hai `await` liên tiếp,
  trong khi `RuntimeDoctypeWorkspace` chỉ TRA bảng đăng ký lúc render, không phải lúc import.
  Một vòng mạng trả cho một ràng buộc không tồn tại.
- Trên đường `/`, `bootstrap.ts` hỏi `forge.website.page` rồi mới bắt đầu nạp Desk. Với tenant
  không có website (Alumdoor), mỗi lần gõ tên miền trần là chờ hết một lời gọi API mới bắt
  đầu tải app.

### 7.2 Đã làm

| Chỗ | Trước | Sau |
|---|---|---|
| `index.html` | `import("/src/bootstrap.ts")` động | import **tĩnh** — bootstrap nằm luôn trong chunk entry, bớt một chặng |
| `scripts/boot-preload.mjs` (mới) | không có | plugin Vite nhúng danh sách file băm + script phát `modulepreload` **ngay trong `<head>`**, theo đúng làn |
| `src/boot-route.ts` (mới) | luật chia làn nằm trong `bootstrap.ts` | một nguồn duy nhất, bản nội tuyến do build **biên dịch từ chính file này** |
| `main-base.tsx` | `await` vertical rồi `await` màn làm việc | `Promise.all` |
| `forge.website.page` | gọi sau khi bootstrap tải xong | gọi từ script nội tuyến; 404 thì phát tiếp bó Desk ngay |

Tải trước **theo làn** là phần phải cẩn thận: khách vào trang bán hàng công khai không được
gánh 108 kB gzip của Desk, và ngược lại người mở `/app/<DocType>` phải có sẵn cả chunk màn
làm việc. Vì thế danh sách được sinh từ đồ thị bundle lúc build — ba làn `website`, `desk`,
`desk-workspace` — và **build sẽ dừng** nếu không tìm thấy mắt xích nào trong đồ thị, thay vì
im lặng bỏ tải trước.

### 7.3 Đo được gì

Bản build thật, phục vụ qua server tĩnh có bơm đúng độ trễ đã đo ở trên (asset 65 ms, API
185 ms, HTML 130 ms), Chromium headless, 4 lượt xen kẽ:

| | trước | sau |
|---|---|---|
| `main-base` sẵn sàng | 515–539 ms | **343–370 ms** |
| lời gọi API đầu tiên xuất phát | ~545 ms | **~450 ms** |
| chunk màn làm việc (277 kB) | chỉ bắt đầu tải SAU khi boot + manifest trả về | tải xong ở ~500 ms, trước cả khi API trả lời |

FCP trong khung đo này dao động lớn (login screen chỉ vẽ sau khi API 401 trả về, mà API là
phần chi phối) nên không lấy làm số công bố.

### 7.4 Vòng lặp dựng-test của repo

`test:unit` xoá sạch `dist/` rồi dựng lại 503 file mỗi lần chạy. Lý do có thật: bộ test chạy
TRÊN `dist/`, nên một file `.js` còn sót lại khi nguồn đã xoá vẫn import được và vẫn xanh.

Nay giữ nguyên tính chất đó mà không phải xoá sạch: `tsc` bật `incremental`, và
`scripts/prune-stale-dist.mjs` đối chiếu từng sản phẩm với nguồn của nó rồi xoá cái mồ côi
(`tests/prune-stale-dist.test.mjs` canh đúng tính chất này). Cờ `--build` của cổng mốc —
được ghi trong hướng dẫn từ đầu nhưng **chưa bao giờ được cài** — nay gọi thẳng `build:fast`.

| | trước | sau |
|---|---|---|
| dựng lại trước khi chạy test | ~19 s | **~6 s** |
| `--build --only <chuỗi>` trọn vòng | không có (phải tự nhớ dựng) | **~6 s** |

Cổng sau P7: server **75 rớt / 2414**, client **17 rớt / 140** — đúng mốc, không rớt mới.


## 8. P8 — hai lời gọi API đi trước, và cắt tiếp `main-base` (19/08)

### 8.1 `get_boot` + `get_app_manifest` xuất phát từ `<head>`

Sau P7 chuỗi tải file đã song song, nhưng hai lời gọi API vẫn phải đợi `main-base` chạy mới
khởi hành — mà mỗi lời gọi ~185 ms, dài hơn bất kỳ chunk nào. Nay script nội tuyến bắn chúng
trước cả khi xếp hàng tải file.

Chỗ dễ hỏng là địa chỉ hai lời gọi bị viết ở hai nơi. Vì thế
`packages/adapter-frappe/src/boot-prefetch.ts` là **nơi duy nhất** biết chúng, và được dùng
ở cả hai đầu: `vite.config.ts` biên dịch nó vào script nội tuyến (bên GỌI), `frappe-adapter.ts`
import nó để NHẬN. Cùng một nguồn nên không có bản sao nào để trôi dạt — cùng khuôn với
`boot-route.ts` ở P7.

Ba tính chất được ghim bằng test (`apps/runtime/tests/boot-prefetch.test.mjs`):

- **URL dựng giống hệt `frappe-js-sdk`** (bỏ tham số rỗng). Sai một ly thì lời hỏi trước
  không bao giờ dùng được, mà cũng chẳng ai thấy vì bên nhận lặng lẽ gọi lại.
- **Dùng đúng một lần.** Lần gọi thứ hai luôn nghĩa là trạng thái đã đổi (vừa đăng nhập,
  vừa đổi app), mà kết quả cũ thì không biết chuyện đó.
- **Hỏng thì nhường.** 401 lúc chưa đăng nhập, mạng chập, manifest của app khác — tất cả đều
  trả về `undefined` để đường gọi thật chạy nguyên vẹn.

Chỉ hỏi ở mặt CẦN đăng nhập: trang bán hàng `/shop*` và các trang marketing của Social
Commerce là mặt công khai, hỏi trước chỉ tổ nhận 401. Luật đó nằm ở `shouldPrefetchSession`
trong `boot-route.ts`, và `resolveStorefrontPage` dời từ `main-base.tsx` sang đó vì nay cả
hai bên đều cần.

### 8.2 Cắt `main-base`

Trang bán hàng (`Storefront`) và trang marketing (`SocialCommerceLanding`) là hai mặt công
khai không dính gì tới Desk, nhưng đang được import tĩnh: mỗi nhân viên mở Desk đều tải kèm
chúng.

| | trước | sau |
|---|---|---|
| `main-base` | 377,8 kB (108,0 kB gzip) | **324,9 kB (94,2 kB gzip)** |
| `Storefront` | trong `main-base` | chunk riêng 17,1 kB |
| `SocialCommerceLanding` | trong `main-base` | chunk riêng 36,6 kB |

### 8.3 Đo lại toàn chuỗi (so với gốc P6, cùng khung đo ở mục 7.3)

| | gốc | sau P7+P8 |
|---|---|---|
| `main-base` sẵn sàng | 527–541 ms | **335–360 ms** |
| lời gọi API đầu tiên xuất phát | 544–557 ms | **236–257 ms** |
| chuỗi tải xong | 531 ms (8 file) | 550–573 ms (**17 file**, gồm cả chunk màn làm việc 277 kB) |

Nói cách khác: tải nhiều hơn gấp đôi số file mà vẫn xong gần như cùng lúc, còn dữ liệu boot
— thứ quyết định lúc nào vẽ được màn hình — có sớm hơn khoảng **300 ms**.

Cổng sau P8: server **75 rớt / 2414**, client **17 rớt / 146** — đúng mốc, không rớt mới.
