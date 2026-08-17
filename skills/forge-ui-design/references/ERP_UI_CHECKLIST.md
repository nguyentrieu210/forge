# Forge ERP UI Checklist

Dùng checklist này khi build hoặc review operational UI. Không phải mục nào cũng áp dụng; tick theo scope thực tế.

## 1. Authority & routing

- [ ] Đã đọc `skills/forge-ui-change-routing/SKILL.md` và xác định đúng owner.
- [ ] Biết dữ liệu nào authoritative server-side, dữ liệu nào chỉ là draft/presentation.
- [ ] Không duplicate money/stock/BOM/pricing calculation ở client.
- [ ] Không dùng hide/disable client làm permission/security boundary.
- [ ] Nếu screen đọc lineage/provenance, link về authoritative document khi có thể.
- [ ] Nếu generic metadata đủ diễn đạt, không custom TSX vô cớ.

## 2. Operator outcome

- [ ] Primary actor rõ.
- [ ] Primary outcome rõ và hoàn thành được trên một flow liên tục.
- [ ] Action hay dùng nhất dễ thấy và ít click.
- [ ] Rare/advanced settings không che lấp core flow.
- [ ] User không phải nhớ dữ liệu từ tab/page trước để hoàn thành thao tác hiện tại nếu có thể hiển thị context tại chỗ.
- [ ] Critical decision support nằm gần nơi ra quyết định.

## 3. Information hierarchy

- [ ] Context header compact: document, customer/item/warehouse, state, reference.
- [ ] Work area chiếm phần lớn viewport.
- [ ] Support/preview rail chỉ chứa thông tin giúp quyết định.
- [ ] Primary, secondary, danger actions phân cấp rõ.
- [ ] Không có nhiều CTA ngang cấp cạnh tranh nhau.
- [ ] Không dùng giant hero/KPI cards cho dữ liệu vận hành bình thường.
- [ ] Card/container nesting tối thiểu.

## 4. Density & spacing

- [ ] Density phù hợp ERP; không giãn quá mức vì aesthetic.
- [ ] Spacing nhất quán theo token/rhythm.
- [ ] Section break rõ bằng typography/divider/surface trước khi thêm card.
- [ ] Row height đủ đọc/chạm nhưng không lãng phí diện tích.
- [ ] Wide viewport không kéo nội dung chính thành dòng quá dài vô lý.

## 5. Typography & numeric data

- [ ] Heading hierarchy rõ.
- [ ] Body/label đủ readable ở màn hình target.
- [ ] Font family/weight nhất quán với Forge.
- [ ] Số lượng, tiền, kích thước, tỷ lệ có unit/currency rõ.
- [ ] Numeric columns alignment nhất quán.
- [ ] Mã, document no, batch no có style dễ scan nhưng không lấn át label chính.
- [ ] Text dài có wrap/truncate + cách xem đầy đủ.

## 6. Forms

- [ ] Label hiển thị; placeholder không thay label.
- [ ] Required/read-only/derived state rõ.
- [ ] Master-controlled field dùng Link/Select/searchable control phù hợp.
- [ ] Derived/server-owned field không editable.
- [ ] Helper text chỉ dùng khi thực sự cần.
- [ ] Inline validation đặt gần field/row lỗi.
- [ ] Error summary có nếu form dài/nhiều lỗi, nhưng không thay inline error.
- [ ] Dirty state/unsaved navigation có xử lý khi có nguy cơ mất dữ liệu.
- [ ] Submit/irreversible action nói rõ hậu quả nếu không hiển nhiên.
- [ ] Sau submit, editability phản ánh lifecycle thật.

## 7. Child tables / editable grids

- [ ] Column order theo operator workflow, không chỉ schema order.
- [ ] Applicable columns không khiến user phải horizontal-scroll vô lý.
- [ ] Row validation chỉ đúng row/field.
- [ ] Add/remove/reorder semantics rõ.
- [ ] Keyboard path cho nhập lặp lại đã cân nhắc.
- [ ] Bulk paste/import nếu workload thực tế cần.
- [ ] Unit/quantity/source context nhìn thấy tại row.

## 8. Tables / lists / batch work

- [ ] Dataset có search/filter ở vị trí hợp lý.
- [ ] Sticky header nếu list dài.
- [ ] Selection state rõ.
- [ ] Bulk action chỉ hiện/kích hoạt khi selection hợp lệ.
- [ ] Empty dataset khác filter-empty.
- [ ] Loading không làm layout nhảy mạnh.
- [ ] Pagination/virtualization được cân nhắc cho dataset lớn.
- [ ] Sort state nhìn thấy.
- [ ] Total/variance gắn gần dataset liên quan.
- [ ] Horizontal scroll nếu bắt buộc phải có thì intentional và usable.

## 9. Actions & state transitions

- [ ] Primary action đúng với lifecycle hiện tại.
- [ ] Disabled action có lý do hiển thị nếu blocker không hiển nhiên.
- [ ] Loading action chặn duplicate submit theo contract.
- [ ] Destructive action tách khỏi primary.
- [ ] Confirm chỉ dùng cho destructive/irreversible/high-cost action, không confirm mọi click.
- [ ] Success state phản ánh server result, không optimistic giả khi không an toàn.
- [ ] Retry chỉ xuất hiện khi operation idempotent/an toàn.

## 10. Status, warning, lineage

- [ ] Blocking error khác warning/info.
- [ ] Không dựa vào màu đơn độc.
- [ ] Missing master/configuration nói rõ cái gì thiếu và nơi sửa.
- [ ] Provenance/lineage critical có link/reference.
- [ ] Submitted/immutable authority dễ phân biệt với draft.
- [ ] Stale preview/draft state có indicator và cách refresh/re-resolve.

## 11. Loading / empty / error

### Loading
- [ ] Feedback xuất hiện ngay khi operation đủ lâu để user nhận ra.
- [ ] Skeleton chỉ dùng khi có lợi cho perceived stability.
- [ ] Không fake progress percentage nếu backend không cung cấp progress thật.

### Empty
- [ ] Phân biệt no-data, filter-empty, missing-config, no-permission, backend-error.
- [ ] Có next action đúng với từng loại empty.

### Error
- [ ] Error nói được: sai gì, ở đâu, sửa thế nào.
- [ ] Raw stack trace không phải message chính cho operator.
- [ ] Row/field error không bị đẩy hết thành toast.

## 12. Keyboard & focus

- [ ] Interactive elements reachable bằng Tab khi phù hợp.
- [ ] Focus visible.
- [ ] Focus order theo visual/workflow order.
- [ ] Dialog/drawer quản lý focus đúng.
- [ ] Escape đóng transient layer khi semantics phù hợp.
- [ ] Enter/Space behavior đúng control.
- [ ] Keyboard action lặp lại không bị animation làm chậm.
- [ ] Shortcut nếu có thì discoverable và không là đường duy nhất.

## 13. Accessibility

- [ ] Semantic button/link/input thay clickable div khi có thể.
- [ ] Icon-only action có accessible name.
- [ ] Label/control association đúng.
- [ ] Contrast đủ cho text/focus/border quan trọng.
- [ ] Status/error không chỉ bằng color.
- [ ] Reduced-motion support khi có motion đáng kể.
- [ ] Touch target đủ lớn trên touch-supported surface.
- [ ] Heading hierarchy không nhảy vô lý.

## 14. Motion

- [ ] Mỗi animation có purpose rõ.
- [ ] Frequent/repeated action ưu tiên instant hoặc cực ngắn.
- [ ] Không `transition: all`.
- [ ] Không animate layout nặng nếu transform/opacity đủ.
- [ ] Modal/drawer/dropdown timing snappy.
- [ ] Không bounce/playful motion trong critical money/stock/manufacturing flow.
- [ ] Không thêm animation library chỉ để làm một hiệu ứng nhỏ.

## 15. Visual consistency

- [ ] Reuse token/components hiện có trước khi tạo mới.
- [ ] Icon family nhất quán.
- [ ] Border radius/shadow/surface nhất quán.
- [ ] Semantic colors dùng cùng ý nghĩa trên toàn screen.
- [ ] Không raw hex/class random nếu theme token có sẵn.
- [ ] Không gradient/glass/glow/emoji icon vô lý trong operational page.

## 16. Responsive / viewport

Primary ERP checks:

- [ ] 1280px: không overlap, action/context vẫn usable.
- [ ] 1440/1536px: density/hierarchy đúng.
- [ ] 1920px: content không kéo giãn vô hạn; support rail hợp lý.
- [ ] 768px: layout không vỡ; rail/sections collapse có chủ đích.
- [ ] 375–430px nếu mobile là requirement: core flow thực sự usable.
- [ ] Không ẩn critical action/field chỉ để "fit".
- [ ] Không có horizontal page scroll ngoài vùng table/grid intentional.

## 17. Browser visual inspection

Nếu app chạy được:

- [ ] Open đúng route với data gần production shape.
- [ ] Capture/inspect normal state.
- [ ] Inspect loading state.
- [ ] Inspect empty state.
- [ ] Inspect one validation/error state.
- [ ] Inspect disabled/read-only/submitted state nếu relevant.
- [ ] Test keyboard path chính.
- [ ] Resize qua target viewports.
- [ ] Kiểm tra overflow/clipping/long Vietnamese text/document code.
- [ ] Re-inspect sau fix, không chỉ dựa vào source diff.

## 18. Performance sanity

- [ ] Không rerender whole large grid vì một keystroke nếu tránh được.
- [ ] Expensive derived values memoized/handled hợp lý nếu profiling cho thấy cần.
- [ ] Search/filter debounce khi API/network cần, không debounce local action vô cớ.
- [ ] Large list virtualization khi evidence cho thấy cần.
- [ ] Không fetch cùng authority nhiều lần không cần thiết.
- [ ] Layout shift thấp; dimensions/states ổn định.

## 19. Code structure

- [ ] TSX file không ôm toàn bộ fetch + business calculation + mapping + rendering + mutation.
- [ ] Component split theo cohesive region/interaction.
- [ ] Shared primitive chỉ tạo khi có reuse/generic contract thật.
- [ ] Vertical-specific component ở đúng vertical owner.
- [ ] Business/domain rule nằm server/shared domain.
- [ ] Types/contracts lấy từ canonical source hoặc adapter, không duplicate thủ công vô cớ.

## 20. Final verification

- [ ] Targeted tests pass.
- [ ] Typecheck/build theo blast radius pass.
- [ ] `git diff --check` pass.
- [ ] Sentrux check/gate chạy nếu topology/complexity/cross-package thay đổi.
- [ ] Không có route/action dead link.
- [ ] Không có stale generated artifact nếu source/generator thay đổi.
- [ ] Browser re-verification hoàn tất khi môi trường cho phép.
