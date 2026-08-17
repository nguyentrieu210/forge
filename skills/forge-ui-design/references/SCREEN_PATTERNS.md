# Forge Operational Screen Patterns

Các pattern này là UX blueprint cho custom operational TSX. Không phải schema contract. Exact DocType/API/server authority hiện tại luôn thắng.

## 1. Master Data Workbench

### Khi nào custom

Master CRUD đơn giản không cần custom TSX riêng. Một Master Data workbench chỉ nên là **index/navigation/overview layer** giúp user đi đúng nhóm danh mục; create/edit chi tiết vẫn dùng generic form khi metadata đủ.

### Layout gợi ý

- compact page title + mô tả ngắn;
- nhóm master theo job/domain, không theo alphabet;
- search/filter danh mục nếu số lượng lớn;
- primary operational masters nổi bật hơn setup hiếm dùng;
- mỗi entry có label, một câu purpose, status/permission nếu cần;
- không biến mỗi master thành một giant card.

### Guardrails

- menu/index không trở thành authority về master availability;
- route phải resolve tới surface thật;
- removed/deprecated master phải sweep cả canonical manifest/navigation/compatibility layer theo `forge-ui-change-routing`.

---

## 2. Sales Configurator / Sales Order Experience

### Primary outcome

Operator cấu hình một sản phẩm/cửa đủ điều kiện để:

1. xác định sản phẩm/variant;
2. nhập kích thước/quy cách/màu/context cần thiết;
3. lấy giá authoritative;
4. preview geometry/BOM requirement;
5. hoàn tất Sales Order hoặc chuẩn bị production mà không nhập lại cùng dữ liệu.

### Recommended regions

#### A. Order context header

Compact:

- customer;
- price list/pricing context;
- order/date/status;
- sales owner/branch nếu relevant.

Không dùng hero.

#### B. Configured item grid

Mỗi row là một sản phẩm cấu hình. Ưu tiên columns theo workflow:

- product/item;
- configuration summary;
- dimensions;
- color/finish;
- quantity;
- price result;
- validation/BOM readiness;
- row actions.

Chi tiết hiếm dùng mở side panel/drawer/expanded row thay vì nhồi 30 columns.

#### C. Row configurator

Một row đang edit có thể mở structured editor:

- identification;
- size/geometry inputs;
- finish/color;
- explicit actual material slots nếu template yêu cầu;
- notes/rare options.

Server preview phải là nguồn cho derived geometry/price/BOM readiness.

#### D. Decision rail / summary

Chỉ giữ:

- totals;
- pricing warnings;
- BOM readiness/missing requirements;
- source/provenance khi hữu ích;
- blockers trước production.

Không dump toàn bộ BOM nếu user chỉ cần biết readiness; full BOM xem ở preview/detail phù hợp.

#### E. Actions

Typical hierarchy:

- Save draft;
- Preview/Resolve nếu explicit action cần;
- Submit order;
- Create production chỉ khi contract cho phép và blockers đã rõ.

Disabled create-production phải hiển thị missing requirement cụ thể, không chỉ xám nút.

### Interaction notes

- row add/edit phải keyboard-friendly;
- pricing/BOM preview có stale indicator nếu inputs đổi;
- không re-resolve server trên từng keystroke nếu API nặng; trigger ở meaningful boundary/debounce hợp lý;
- không giữ client-calculated authoritative total khi server có calculation endpoint.

---

## 3. BOM Preview & Actual Component Guidance

### Primary outcome

Cho user hiểu **BOM nào sẽ được materialize** và input nào còn thiếu trước khi tạo production.

### Structure

#### Resolution summary

- static vs generated/configurator BOM;
- template/template code/revision nếu có;
- reusable submitted BOM reference nếu resolver tìm thấy;
- fingerprint/provenance ở secondary metadata, không chiếm headline.

#### Deterministic components

Dense table:

- item/material;
- quantity per set / total nếu relevant;
- UOM;
- source warehouse nếu authority có;
- formula/source note nếu operator thực sự cần kiểm chứng.

#### Required actual slots

Mỗi slot hiển thị:

- component key/label;
- allowed source/item constraints;
- provided selection(s);
- quantity;
- complete/missing/error state.

Missing slot là actionable state, không phải generic red banner.

#### Validation

- wrong-source item -> error ngay tại slot;
- incomplete -> guidance trong draft;
- production transition -> fail-closed theo server contract.

### Guardrail

UI preview không tự tạo BOM trừ khi user đi qua action/endpoint materialization authoritative.

---

## 4. Production Request / Work Order Traceability

### Primary outcome

Planner/operator thấy order/product nào đang sản xuất, BOM nào authoritative, trạng thái nào tiếp theo và có blocker gì.

### Layout

#### Context

- Production Request / Work Order no;
- Sales Order/reference;
- item/configuration summary;
- qty;
- status;
- planned/actual dates nếu relevant.

#### BOM authority panel

- navigable `bom_no`;
- template/static/configurator provenance;
- revision/fingerprint secondary;
- frozen material rows read directly từ authoritative BOM khi contract hiện tại dùng BOM làm source.

#### Progress/timeline

Chỉ dùng timeline nếu lifecycle thực sự có sequence operator cần theo dõi. Không tạo decorative timeline cho 3 status đơn giản.

#### Actions

- next valid transition nổi bật;
- action bị block nói rõ bởi material/BOM/approval/state nào;
- correction/cancel/rework theo contract, không giấu trong kebab menu nếu operationally critical.

### Guardrail

Production Request/Work Order screen không tạo material snapshot thứ hai chỉ để hiển thị nếu BOM đã là authority.

---

## 5. Cutting Workbench

### Primary outcome

Operator lập/kiểm tra/apply Cut Order đúng Work Order, đúng BOM material, đúng warehouse và đúng source batch/bundle; offcut lineage vẫn trace được.

### Recommended regions

#### A. Authority strip

Compact nhưng luôn nhìn thấy:

- Work Order;
- BOM;
- material item;
- source warehouse;
- quantity/sheets target;
- Cut Order status.

Reference nên navigable khi có route.

#### B. Source stock / batch picker

Table hoặc focused selector thể hiện:

- batch no;
- available qty;
- warehouse;
- received/age/FIFO context nếu backend trả;
- reservation/eligibility state;
- selected qty.

Không cho chọn batch bị authority guard loại chỉ vì client list stale. Server vẫn revalidate khi apply.

#### C. Cut plan / geometry area

Tùy workflow:

- sheet/bar dimensions;
- piece dimensions/count;
- waste/offcut estimate;
- plan visualization chỉ khi giúp operator kiểm chứng, không phải decoration.

Nếu có graphical cut plan, luôn có text/table equivalent cho dimensions/count/status quan trọng.

#### D. Offcut output

Hiển thị:

- reusable/offcut status;
- resulting qty/dimension;
- child batch/bundle reference;
- parent/source batch lineage.

Lineage là read-only evidence, không text input.

#### E. Commit area

- Draft/Calculate;
- Apply/Submit;
- clear blockers nếu source bundle/BOM/warehouse mismatch.

`Apply` là high-cost inventory effect: loading/idempotency/disabled state phải rất rõ.

### Visual rules

- stock/batch table ưu tiên density và scanability;
- source batch no dùng monospace nhẹ nếu Forge token hỗ trợ;
- warnings nằm gần batch/row liên quan;
- không che inventory-critical data sau hover-only tooltip.

---

## 6. Generic Operational Workbench

Dùng khi một screen không thuộc các pattern trên.

### Template

```text
[Compact context header]                  [status] [primary action]

[filters/search] [secondary actions]

┌──────────────────────── main work area ───────────────────────┐
│ table/grid/form/configurator                                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌──────────── decision/support rail or lower panel ─────────────┐
│ totals | blockers | preview | provenance | next-step guidance │
└───────────────────────────────────────────────────────────────┘
```

Rail có thể bên phải ở wide desktop và stack xuống dưới ở 1280/tablet nếu cần.

### Use split-view khi

- user cần duyệt nhiều records và xem detail liên tục;
- context switching cost cao;
- detail không cần full-width editor.

### Use full-page editor khi

- one record có workflow sâu;
- nhiều child grids/sections;
- user cần tập trung vào một transaction.

### Use modal/drawer khi

- action phụ, ngắn, không cần deep-link;
- context hiện tại cần giữ visible;
- form không quá dài.

Không nhét một workflow 20 field + child table vào modal chỉ để "không rời trang".

---

## 7. Dense status/metric summary

KPI cards chỉ dùng khi user thực sự cần compare vài metric cấp màn.

Thay vì:

```text
[Card 1] [Card 2] [Card 3] [Card 4] [Card 5] ...
```

ưu tiên compact summary bar khi metric chỉ là context:

```text
Pending 12  ·  Blocked 3  ·  Today 28  ·  Qty 146  ·  Variance 1.8%
```

Dùng color/icon chỉ cho status cần attention.

---

## 8. Long-running operations

Nếu operation gọi backend lâu:

1. immediate acknowledgement;
2. disable duplicate action;
3. show real phase/status nếu backend có;
4. cho user tiếp tục việc khác nếu architecture hỗ trợ async job;
5. khi hoàn tất, refresh authoritative data;
6. error phải phân biệt safe retry vs unknown outcome.

Không fake progress 0→100 chỉ bằng timer.

---

## 9. Review questions cho mọi operational screen

1. Nếu operator dùng màn này 50 lần/ngày, phần nào gây mệt nhất?
2. Có dữ liệu nào đang bắt họ nhớ thay vì nhìn thấy?
3. Có action nào dễ click nhầm vì hierarchy kém?
4. Có state nào chỉ hiểu được nhờ màu?
5. Có field nào user chỉnh được nhưng thực ra server-owned?
6. Có preview nào stale mà user không biết?
7. Có table nào bị card hóa khiến scan chậm?
8. Có animation nào lặp lại và làm cảm giác chậm?
9. Có blocker nào chỉ thể hiện bằng disabled button?
10. Browser inspect ở 1280 và 1920 có cho cùng information hierarchy hợp lý không?
