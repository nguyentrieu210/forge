---
name: forge-ui-design
description: Thiết kế, triển khai, polish và review UI/UX cho Forge, đặc biệt custom TSX operational experiences, ERP workbench, form/grid/table, Sales/Production/Cutting và data-dense enterprise screens. Dùng sau khi đã route đúng source-of-truth bằng forge-ui-change-routing. Giữ TSX là experience layer, ưu tiên operator efficiency, keyboard/accessibility, visual consistency, restrained motion và browser re-verification.
---

# Forge UI Design Skill

## 1. Mục tiêu

Skill này biến yêu cầu kiểu "làm màn này đẹp/ngon/dễ dùng hơn", "làm TSX riêng", "review UI", "polish interaction", "thiết kế workbench" thành một quy trình có kỷ luật cho Forge.

Đích không phải Awwwards/landing page. Đích là **enterprise software có mật độ thông tin cao nhưng vẫn rõ, nhanh, có thứ bậc, dễ thao tác và khó làm sai**.

Mặc định cho Forge/Alumdoor:

- desktop-first cho nghiệp vụ vận hành;
- responsive nhưng không hy sinh data density để giả mobile-first;
- keyboard-first ở các thao tác lặp lại nhiều;
- motion thấp và có mục đích;
- bảng/form/action phải tối ưu tốc độ nhập và kiểm tra;
- trạng thái, provenance, authority và lỗi phải nhìn thấy được;
- TSX là experience/orchestration layer, không trở thành business authority thứ hai.

Mental model:

> `route đúng owner -> hiểu job-to-be-done -> chốt information hierarchy -> thiết kế interaction -> implement -> browser inspect -> sửa -> verify`

## 2. Quan hệ với các skill khác

Trước khi thiết kế/sửa UI:

1. Đọc `skills/forge-ui-change-routing/SKILL.md` để xác định surface và source-of-truth đúng.
2. Đọc `skills/forge-enterprise-completion/SKILL.md` nếu thay đổi chạm shared architecture, authority, release/CI hoặc cross-package boundary.
3. Đọc `SENTRUX_MAP.md` và `.sentrux/rules.toml` khi thay đổi có thể làm tăng coupling/depth hoặc tạo god file.
4. Đọc reference của skill này theo nhu cầu:
   - `references/ERP_UI_CHECKLIST.md` cho build/review;
   - `references/SCREEN_PATTERNS.md` cho operational TSX;
   - `references/UPSTREAM_SOURCES.md` cho provenance của design guidance.

Skill này **không thay routing**. Nếu metadata là owner thì sửa metadata; nếu custom TSX là owner thì mới sửa TSX.

## 3. Khi nào dùng

Dùng khi task liên quan:

- custom TSX page/workbench/experience;
- Sales configurator, BOM preview/editor, Production, Work Order, Cutting;
- form/list/grid cần cải thiện UX vượt CRUD mặc định;
- visual hierarchy, spacing, density, typography, status, actions;
- keyboard navigation, focus, accessibility;
- loading/empty/error/disabled/readonly states;
- responsive behavior của màn nghiệp vụ;
- animation/micro-interaction;
- visual inspection hoặc polish sau khi code đã chạy.

Không dùng như excuse để custom TSX cho mọi DocType. Master đơn giản vẫn ưu tiên metadata + generic form/grid.

## 4. Forge design dials mặc định

Nếu user không chỉ định style khác, dùng baseline này:

| Dial | Default | Ý nghĩa |
|---|---:|---|
| Density | 8/10 | ERP/data-dense; khoảng trắng có chủ đích, không phình card |
| Motion | 2/10 | feedback ngắn; không choreography ở luồng nhập liệu |
| Visual variance | 3/10 | nhất quán mạnh; chỉ tạo điểm nhấn tại action/status quan trọng |
| Decoration | 2/10 | border/surface/tone phục vụ phân cấp, không gradient/glow vô nghĩa |
| Keyboard priority | 9/10 | thao tác lặp lại phải nhanh bằng bàn phím khi hợp lý |
| Traceability visibility | 9/10 | operator thấy nguồn, trạng thái, lineage và blocker quan trọng |

Đây là baseline, không phải token màu/cỡ chữ cứng. Reuse token/component hiện có của Forge trước khi tạo mới.

## 5. Bước 0 — Chốt job-to-be-done

Trước khi vẽ layout, ghi ngắn gọn 6 thứ:

1. **Primary actor** — ai dùng màn này?
2. **Primary outcome** — họ phải hoàn thành việc gì?
3. **Frequency** — vài lần/tháng, hàng ngày hay hàng trăm lần/ngày?
4. **Decision points** — họ cần nhìn gì để quyết định?
5. **Failure cost** — sai thao tác gây phiền, sai tiền, sai kho hay sai sản xuất?
6. **Authority chain** — dữ liệu nào chỉ hiển thị, dữ liệu nào user được sửa, server nào quyết định cuối.

Nếu màn không có primary outcome rõ, đừng bắt đầu bằng component tree.

## 6. Chọn surface: generic hay TSX

### Giữ generic metadata-driven khi

- CRUD đơn giản;
- field/section/child table đã diễn đạt được bằng metadata;
- thao tác chủ yếu create/edit/submit một document;
- không cần phối hợp nhiều authority cùng lúc.

### Dùng custom TSX khi

- một workflow phải đọc/điều phối nhiều document/authority;
- operator cần preview/calculate/compare trước khi commit;
- có nhiều vùng thông tin cùng tồn tại: context + editor + preview + warnings + actions;
- cần batch action, board/workbench, timeline, lineage hoặc dense operational table;
- generic form khiến user phải nhảy tab/popup quá nhiều để hoàn thành một outcome.

### Luật bất biến

Custom TSX được phép:

- compose API;
- giữ draft UI state;
- trình bày calculation/preview do server trả về;
- tối ưu thao tác;
- điều hướng giữa authoritative docs.

Custom TSX không được:

- tự định nghĩa business rule khác server;
- tự tính authoritative money/stock/BOM rồi coi kết quả client là thật;
- tạo schema thứ hai thay DocType/contract;
- dùng hide/disable như security boundary;
- copy một snapshot vật tư/trạng thái nếu authority document đã tồn tại và có thể đọc trực tiếp.

## 7. Information hierarchy trước component tree

Mọi operational page nên xác định 4 lớp:

### A. Context

Cho biết user đang làm việc trên cái gì:

- document/order/work order;
- customer/product/warehouse;
- state/status;
- authoritative reference/link.

Context phải compact, không chiếm nửa màn hình bằng hero card.

### B. Work area

Nơi user thực sự thao tác: form, grid, configurator, batch table, cutting plan.

Đây là vùng rộng nhất và ưu tiên keyboard/focus.

### C. Decision support

Preview, totals, warnings, BOM, stock availability, lineage, validation guidance.

Chỉ hiển thị thứ giúp quyết định; không biến sidebar thành dump JSON.

### D. Commit/actions

Primary action phải rõ, gần nơi hoàn tất công việc, và phản ánh server state:

- Save draft;
- Resolve/Preview;
- Submit/Create production;
- Apply/Complete.

Danger/destructive action tách khỏi primary action cả vị trí lẫn tone.

## 8. Layout rules cho ERP workbench

- Ưu tiên 12-column/grid hoặc flex layout ổn định; tránh masonry/asymmetric marketing layout.
- Main work area thường chiếm 60–75%; decision/support rail 25–40% nếu cần.
- Sticky header/action bar chỉ dùng khi giúp thao tác dài; không sticky mọi thứ.
- Không lồng card trong card nhiều tầng. Dùng section, divider, background tone và typography trước khi thêm container.
- Tránh "dashboard syndrome": mọi số liệu đều thành một KPI card lớn.
- Một màn nghiệp vụ không nên có nhiều primary CTA ngang cấp.
- Long form: nhóm theo quyết định nghiệp vụ, không nhóm theo thứ tự field trong schema nếu thứ tự đó không phù hợp operator.
- Dense table: giữ header rõ, row height vừa đủ, numeric alignment nhất quán, column priority rõ; secondary metadata có thể collapse hoặc secondary line.
- Empty space phải giúp phân nhóm, không phải để trông "premium".

## 9. Forms

### Field presentation

- Label luôn nhìn thấy đối với field nghiệp vụ; placeholder không thay label.
- Required/read-only/derived phải phân biệt được nhưng không gây nhiễu.
- Unit/currency phải xuất hiện cạnh giá trị khi có khả năng nhầm.
- Helper text chỉ dùng cho rule không suy ra được từ label.
- Validation đặt gần field/row gây lỗi; summary chỉ bổ sung cho lỗi nhiều vùng.

### Progressive disclosure

- Hiện input cần cho quyết định hiện tại trước.
- Advanced/rare settings có thể thu gọn.
- Field do master quyết định nên là Link/Select/searchable control, không text tự do.
- Derived field không cho chỉnh nếu server là authority.

### Save/submit behavior

- Dirty state phải rõ nếu rời trang có nguy cơ mất dữ liệu.
- Submit/irreversible transition cần thể hiện hậu quả.
- Sau submit, UI phải chuyển từ edit semantics sang trace/read semantics nếu document immutable theo contract.

## 10. Tables, grids và batch work

Data table là first-class UI trong ERP, không phải fallback.

Bắt buộc cân nhắc:

- column priority;
- alignment: text trái, số thường phải phải/decimal-aligned khi phù hợp;
- sticky header khi danh sách dài;
- row selection rõ;
- bulk action chỉ xuất hiện khi có selection;
- filter/search gần dataset;
- empty/filter-empty phân biệt;
- long text truncate có cách xem đầy đủ;
- editable cell phải có focus/validation rõ;
- keyboard navigation cho nhập lặp lại nếu benefit lớn;
- pagination/virtualization nếu dataset đủ lớn;
- tổng/variance phải gắn với dataset, không tách quá xa.

Không dùng 10 card thay cho 10 row chỉ vì card "đẹp" hơn.

## 11. Status, warnings và traceability

Status hierarchy:

1. **Blocking** — user không thể tiếp tục; nói rõ nguyên nhân và cách sửa.
2. **Action required** — cần input/approval nhưng có thể tiếp tục phần khác.
3. **Warning** — rủi ro hoặc bất thường, không giả thành error.
4. **Info** — provenance/context.
5. **Success** — xác nhận action vừa hoàn tất; không giữ banner xanh vĩnh viễn.

Không dùng màu là tín hiệu duy nhất. Dùng icon/text/label/state kết hợp.

Với manufacturing/stock/BOM screens, ưu tiên hiển thị link tới authoritative document/reference hơn copy chi tiết sang một authority mới.

## 12. Motion và perceived speed

Forge default: **motion ít hơn consumer app**.

Trước mỗi animation hỏi:

1. user thấy nó bao nhiêu lần/ngày?
2. nó giải thích state/spatial change hay chỉ trang trí?
3. bỏ animation có làm workflow nhanh và rõ hơn không?

Rules:

- keyboard-initiated/repeated actions: ưu tiên instant;
- hover/focus thường không cần chuyển động hình học;
- button press có thể có feedback rất ngắn;
- tooltip/popover/dropdown phải snappy;
- modal/drawer có transition ngắn nếu giúp spatial continuity;
- không animate width/height/layout lớn khi transform/opacity giải quyết được;
- không dùng `transition: all`;
- support `prefers-reduced-motion` khi có motion đáng kể;
- tránh bounce/playful spring trong money/stock/manufacturing critical flow;
- loading perception ưu tiên immediate feedback + stable layout hơn spinner màu mè.

Không thêm GSAP/framer-motion chỉ để polish một form nếu CSS/component primitive hiện có đủ dùng.

## 13. Accessibility và keyboard

Mức tối thiểu:

- focus visible;
- logical tab order;
- label/control association;
- icon-only action có accessible name;
- status/error không chỉ truyền bằng màu;
- modal/drawer quản lý focus đúng;
- Escape/Enter/Space semantics đúng với control;
- clickable div không thay semantic button/link nếu không có lý do;
- contrast đủ cho text, border quan trọng và focus ring;
- touch target đủ lớn trên surface hỗ trợ touch;
- reduced-motion khi cần.

Keyboard shortcut chỉ thêm khi discoverable và không xung đột browser/system. Shortcut là accelerator, không phải đường duy nhất.

## 14. Loading, empty, error, offline/slow states

Không chỉ thiết kế happy path.

### Loading

- giữ layout ổn định;
- skeleton chỉ khi giúp hiểu cấu trúc; không skeleton mọi label nhỏ;
- action đang chạy phải disable/reconcile duplicate submit đúng contract;
- nếu server job lâu, hiển thị phase/progress khi có dữ liệu thật, không fake percent.

### Empty

Phân biệt:

- chưa có dữ liệu;
- filter không có kết quả;
- thiếu quyền;
- chưa cấu hình master;
- backend lỗi.

Mỗi trạng thái cần next action phù hợp.

### Error

Error message phải trả lời càng nhiều càng tốt:

- chuyện gì sai;
- ở row/field/doc nào;
- user sửa thế nào;
- có retry an toàn không.

Không biến raw stack trace/server exception thành UX chính.

## 15. Responsive strategy

Operational Forge screen mặc định desktop-first.

Primary verification:

- 1280px desktop nhỏ;
- 1440/1536px desktop phổ biến;
- 1920px wide.

Secondary:

- 768px tablet: phải không vỡ layout; rail có thể stack/collapse;
- 375–430px: chỉ bắt buộc full workflow nếu product requirement nói mobile. Nếu desktop-only, mobile vẫn không được tạo page unusable/crash nhưng có thể degrade sang read/limited mode theo contract.

Không ẩn critical field/action chỉ để layout vừa màn nhỏ.

## 16. Visual language

Mặc định Forge:

- neutral surfaces;
- semantic status colors;
- strong typographic hierarchy hơn decoration;
- border/radius/shadow restrained;
- icon set nhất quán;
- spacing tokenized;
- không emoji làm primary icon;
- không gradient/glassmorphism/neon nếu không có product reason;
- không giant heading/hero trong operational pages;
- không dùng font exotic làm giảm tốc độ đọc số liệu;
- không raw hex rải khắp TSX nếu token/theme đã tồn tại.

Một điểm nhấn mạnh cho primary action/status tốt hơn 8 điểm nhấn ngang nhau.

## 17. Forge-specific operational patterns

Đọc `references/SCREEN_PATTERNS.md` khi làm các màn:

- Master Data workbench;
- Sales/configurator;
- BOM preview/actual material guidance;
- Production Request / Work Order traceability;
- Cutting / batch / offcut lineage.

Pattern file là UX blueprint, không phải schema authority. Exact backend/DocType/API hiện tại vẫn thắng.

## 18. Implementation workflow bắt buộc

### Phase A — Inspect

1. Recheck exact `main`/branch/PR state.
2. Route surface bằng `forge-ui-change-routing`.
3. Đọc component/token/layout primitives hiện có.
4. Tìm screen tương tự đã chứng minh trong repo.
5. Xác định server contract và states cần render.

### Phase B — Design contract

Viết ngắn trước khi code:

- actor/outcome;
- information hierarchy;
- editable vs read-only authority;
- primary/secondary/danger actions;
- loading/empty/error states;
- responsive collapse plan;
- keyboard/focus plan;
- motion budget.

### Phase C — Implement

- reuse primitive/token hiện có;
- componentize theo cohesive region, không componentize từng div;
- tránh một TSX god file;
- business logic ở domain/server; client giữ presentation/orchestration;
- trạng thái derived từ authoritative response, không shadow state không cần thiết.

### Phase D — Visual inspect

Nếu có browser target chạy được:

1. mở đúng route;
2. inspect desktop trước;
3. kiểm tra overflow, clipping, hierarchy, focus, disabled/loading/error;
4. kiểm tra 1280 và wide;
5. kiểm tra tablet/mobile theo requirement;
6. test keyboard path chính;
7. chụp/so sánh trước-sau khi hữu ích.

Prioritize:

- P0: không thao tác được, overlap/content mất;
- P1: sai/khó thao tác, unreadable, action/focus broken;
- P2: hierarchy/spacing/consistency ảnh hưởng tốc độ hiểu;
- P3: polish nhỏ.

### Phase E — Re-verify

Sau sửa:

- reload/HMR và inspect lại;
- chạy typecheck/test/build theo blast radius;
- kiểm tra route/metadata/server contract không bị fork;
- chạy Sentrux nếu topology/complexity/cross-package thay đổi;
- `git diff --check`.

Không kết luận "UI xong" chỉ vì TypeScript compile.

## 19. Review format

Khi review một màn đã có, báo cáo theo bảng ngắn:

| Priority | Hiện tại | Đề xuất | Lý do / operator impact |
|---|---|---|---|

Sau bảng, tách:

- **Authority/behavior bugs** — phải sửa trước visual polish;
- **Interaction blockers**;
- **Visual hierarchy/polish**;
- **Verification performed**.

Đừng đánh đồng preference thẩm mỹ với bug.

## 20. Anti-patterns cấm mặc định

- custom TSX cho một master CRUD đơn giản;
- hero/banner marketing trong màn nghiệp vụ;
- card hóa mọi row;
- gradient/glow/glass chỉ để "hiện đại";
- animation trên action lặp lại thường xuyên;
- `transition: all`;
- icon-only action không tooltip/accessible name;
- hide field bằng CSS thay metadata;
- disabled button không giải thích blocker khi blocker không hiển nhiên;
- client-side authoritative calculation;
- duplicate BOM/stock/price authority trong UI state;
- raw JSON làm primary operator UI;
- toast thay inline error cho lỗi field/row;
- table không xử lý long content/empty/loading;
- desktop width cố định gây horizontal scroll vô cớ;
- một file TSX vừa fetch, calculate, map business rules, render và mutate tất cả.

## 21. Definition of Done

Một Forge operational UI chỉ được coi là xong khi:

- đúng owner/source-of-truth;
- primary operator outcome chạy end-to-end;
- editable/read-only authority rõ;
- loading/empty/error/disabled states có chủ đích;
- keyboard/focus path chính hoạt động;
- table/form không overflow/clipping ở viewport target;
- hierarchy/actions/status đọc được nhanh;
- không tạo business authority client-side;
- browser visual re-verification đã chạy khi môi trường cho phép;
- targeted tests/typecheck/build pass theo scope;
- architecture/Sentrux không regression nếu thay đổi có blast radius kiến trúc.
