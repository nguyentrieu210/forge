# BRD — Builder Engine (điểm #12, tách riêng)

> Đặc tả tầng AUTHORING (WYSIWYG) cho 4 builder: M17 DocType · M18 Workflow · M21 Print Format · M22 Dashboard. Đây là phần review đánh giá "mơ hồ nhất" — viết riêng vì độ phức tạp ngang một sản phẩm.
>
> **Nhận thức cốt lõi (đừng ép 1 canvas cho tất cả):** 4 builder là **4 paradigm canvas KHÁC NHAU**. Cái dùng chung KHÔNG phải canvas mà là **BuilderKernel** (lệnh/history/selection/clipboard/keyboard/serialize). Mỗi builder cắm 1 **CanvasAdapter** riêng.

```
                    ┌──────────────── BuilderKernel (dùng chung) ────────────────┐
                    │ CommandBus · History(undo/redo) · Selection · Clipboard ·   │
                    │ KeyboardMap · Serializer(contract) · DirtyTracker · Validate│
                    └───────────────┬───────────────┬───────────────┬────────────┘
        CanvasAdapter:              │               │               │            │
   ┌────────────────────┐  ┌────────▼──────┐ ┌──────▼───────┐ ┌─────▼──────┐ ┌───▼────────┐
   │ Sortable-Tree      │  │ Node-Graph    │ │ Paper-Blocks │ │ Grid       │ │ (mở rộng)  │
   │ M17 DocType Builder│  │ M18 Workflow  │ │ M21 Print    │ │ M22 Dash   │ │ plugin sau │
   └─────────┬──────────┘  └───────┬───────┘ └──────┬───────┘ └─────┬──────┘ └────────────┘
             ▼                     ▼                ▼               ▼
   dnd-kit sortable         React Flow       dnd-kit + @page   react-grid-layout   (✅ chốt PHA 3 — architecture.md §2)
             └─────────────────────┴────────────────┴───────────────┘
                                   ▼
                       Serializer → meta-DocType (qua FrappeAdapter)
```

---

## §1. Canvas model & hệ toạ độ
Mỗi builder có **model canvas** riêng (cây/đồ thị/khối), nhưng cùng đi qua Serializer:
| Builder | Model | Đơn vị vị trí | Ghi ra meta-DocType |
|---|---|---|---|
| M17 DocType | **cây** Tab→Section→Column→Field (theo `idx`) | thứ tự trong cây (không toạ độ tự do) | DocType + DocField[] (+ Custom Field/Property Setter khi Customize) |
| M18 Workflow | **đồ thị** node(state)+edge(transition) | toạ độ (x,y) node (lưu để layout, không ảnh hưởng logic) | Workflow + State[] + Transition[] |
| M21 Print | **khối trên khổ giấy** (rows→columns→blocks) | lưới trên `@page` (mm) | Print Format (builder JSON hoặc html/Jinja) |
| M22 Dashboard | **lưới** ô (x,y,w,h) | react-grid-layout cells | Dashboard + Number Card[] + Dashboard Chart[] |

## §2. Drag engine (#12)
2 kiểu kéo, cả 4 builder:
- **Palette → Canvas** (tạo mới): kéo item từ palette (fieldtype / block / card-chart / state) → thả vào canvas → sinh node mới tại vị trí thả (tree: chèn theo drop-index; graph: tại toạ độ con trỏ; grid/paper: ô/khối gần nhất).
- **Reorder trong canvas**: kéo node đã có đổi vị trí/parent (tree: đổi `idx`/parent; grid: đổi cell; paper: đổi khối; graph: dời toạ độ).
- Yêu cầu: **drop indicator** rõ (đường chèn/ô sáng), **auto-scroll** khi kéo tới mép, **ghost** nửa mờ theo con trỏ, huỷ bằng `Esc` giữa kéo (không đổi gì). Lib: **dnd-kit** (tree/paper/grid) + **React Flow** (graph) + **react-grid-layout** (dashboard) — ✅ chốt PHA 3 (architecture.md §2).

## §3. Grid engine & Snap (#12)
- **M22 Dashboard**: lưới cột (12-col responsive, react-grid-layout), ô có `w×h`, **snap vào cell**, chống chồng lấn, compact dọc.
- **M21 Print**: lưới mm theo khổ (A4/A5), **snap vào guide** (lề, cột), hiện thước; block canh trái/giữa/phải.
- **M17 DocType**: không lưới tự do — "snap" = chèn đúng khe Tab/Section/Column.
- **M18 Workflow**: snap node vào lưới nền (tuỳ chọn) để layout gọn; auto-layout 1 nút bấm.

## §4. Resize (#12)
- M22: kéo mép/góc ô card-chart đổi `w×h` (min/max theo loại), snap cell.
- M21: kéo đổi độ rộng cột block, chiều cao block ảnh.
- M17: đổi `columns` (độ rộng field trong lưới section, Frappe dùng `columns` 1–12).
- M18: node kích thước cố định (không resize); chỉ dời.

## §5. Selection (#12)
- **Single**: click node → chọn, panel property phải hiện thuộc tính node đó.
- **Multi**: `Shift/Ctrl+click` cộng dồn; **marquee** (kéo khung chọn) cho graph/grid/paper (tree: chọn nhiều field liền kề).
- Selection state ở Kernel; thao tác (xoá/copy/di chuyển/đổi property chung) áp cho cả tập chọn.
- Deselect: click nền / `Esc`.

## §6. Clipboard (#12)
- `Ctrl+C/X/V` trên tập chọn → serialize sang clipboard nội bộ (JSON model, không phụ thuộc OS clipboard); paste sinh node mới (đổi id/fieldname để không trùng).
- **Cross-canvas**: copy field ở DocType A → paste sang DocType B (cùng builder loại); copy card giữa 2 dashboard. Không paste chéo loại builder.
- Paste giữ quan hệ nội bộ tập (vd 2 state + edge giữa chúng paste cùng).

## §7. Keyboard map (#12)
| Phím | Hành động |
|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z`(hoặc `Ctrl+Y`) | Undo / Redo |
| `Ctrl+C/X/V` | Copy/Cut/Paste |
| `Delete/Backspace` | xoá tập chọn (confirm nếu có dữ liệu phụ thuộc) |
| `Ctrl+D` | nhân bản tập chọn |
| `Ctrl+A` | chọn tất cả trong canvas |
| `Esc` | deselect / huỷ kéo / đóng panel |
| `Ctrl+S` | lưu (persist meta + migrate) |
| `↑↓←→` | di chuyển node chọn (grid/graph: 1 cell/px; tree: đổi idx) |
| `?` | cheatsheet phím tắt |

## §8. History — Undo/Redo (#12)
- **Command pattern**: mọi thay đổi = 1 `Command {do, undo, label}`. `CommandBus.execute(cmd)` → push vào `History` stack. Không sửa model trực tiếp ngoài command.
- `History`: 2 stack (undo/redo), trần N (vd 100); thao tác mới xoá redo stack. Coalescing: nhiều lần resize/drag liên tiếp gộp 1 command (theo debounce/gesture-end).
- **Persist ranh giới**: undo chỉ trong phiên editing (chưa lưu). Sau `Ctrl+S` → history vẫn giữ để undo tiếp nhưng đánh dấu "đã lưu tại điểm X" (dirty tracker so điểm này).
- Mỗi Command có `label` để hiện "Hoàn tác: Thêm field 'customer'".

## §9. Serialization (#12)
- **Serializer** = cầu 2 chiều: **canvas model ↔ payload meta-DocType** (theo bảng §1). Deserialize khi mở (load meta → dựng model); Serialize khi lưu (model → API create/update meta-DocType qua FrappeAdapter).
- **Versioned** (nối appendix §J): `serializeV16()`; đổi Frappe = thêm mapper, canvas không đổi.
- **Validation trước persist**: fieldname snake_case duy nhất (M17); workflow có state đầu, không edge mồ côi (M18); Jinja hợp lệ (M21); card/chart có nguồn hợp lệ (M22). Lỗi → chặn lưu, chỉ chỗ lỗi trên canvas.
- **Autosave draft** model vào localStorage (như polish §4) — mở lại hỏi khôi phục.

## §10. Đặc tả riêng từng builder (node = meta gì, ràng buộc)
| Builder | Node/khối | Palette | Property panel | Ràng buộc chính |
|---|---|---|---|---|
| **M17 DocType** | Field / Section / Column / Tab | 43 fieldtype authorable + break | mọi thuộc tính DocField (§card M17) | Customize DocType chuẩn = chỉ ghi Custom Field/Property Setter overlay; migrate schema khi lưu |
| **M18 Workflow** | State (node) / Transition (edge) | State, Transition | state: docstatus/role/màu; edge: action/allowed role/condition | phải có state đầu; workflow_state_field là Select tồn tại; không transition trùng (state+action) |
| **M21 Print** | Block: Field/Table-con/Text/Image/QR/Chữ ký/Letter Head/Ngắt trang | các block trên | font/canh/width/điều kiện hiện; khổ A4/A5 | render Jinja hợp lệ; preview dữ liệu thật; đen trắng an toàn |
| **M22 Dashboard** | Number Card / Dashboard Chart (ô grid) | Card, Chart | nguồn DocType/hàm/filter/loại chart/so kỳ | card/chart có nguồn + aggregate hợp lệ; đảm bảo drill-down (M10) |

## §11. Event Lifecycle builder (mở rộng appendix §D)
```
mount → loadMeta(target) → deserialize(model) → canvasInit(adapter) → render
  [loop] userGesture(drag/resize/prop/paste)
        → buildCommand → CommandBus.execute → History.push → DirtyTracker.mark → re-render
  save → validate(model) → serialize → persist(meta-DocType) → migrate/clearMetaCache → markSaved
  destroy → autosave draft nếu dirty → cleanup adapter
```

## §12. State machine builder
```
   Loaded(Clean) ─edit─▶ Dirty ─Ctrl+S─▶ Validating ─ok─▶ Persisting ─ok─▶ Clean(Saved)
        ▲                   │                 │(fail)            │(fail)
        │                   │                 ▼                  ▼
        └──── undo tới ─────┘             Invalid(chỉ lỗi)   PersistError(giữ model, báo)
   (Dirty) ─unmount─▶ hỏi lưu/huỷ (beforeunload)
```

## §13. Acceptance Criteria (builder)
- [ ] Kéo palette→canvas + reorder có drop-indicator + auto-scroll + Esc-huỷ
- [ ] Multi-select (shift/ctrl/marquee) + thao tác nhóm
- [ ] Undo/Redo ≥100 bước, coalescing gesture, label rõ; sau lưu vẫn undo được
- [ ] Copy/Cut/Paste nội bộ + cross-canvas cùng loại (đổi id/fieldname tránh trùng)
- [ ] Keyboard map §7 đủ; `?` cheatsheet
- [ ] Snap/grid đúng paradigm; resize đúng min/max
- [ ] Serialize↔meta-DocType đúng 2 chiều; validate chặn lưu khi lỗi; migrate + clearMetaCache
- [ ] Autosave draft + khôi phục; beforeunload khi dirty
- [ ] Permission: chỉ System Manager(+Dev cho DocType chuẩn/mới) vào được; server chốt
- [ ] Mobile: builder = **xem + sửa property cơ bản**; kéo-thả canvas báo "tốt nhất trên desktop" (không giả vờ full drag trên mobile)
- [ ] Test: unit(command/serializer/validate) + e2e(kéo→lưu→mở lại đúng) + visual baseline

## §14. Out of scope builder v1
- Đồng-tác-giả realtime (nhiều người sửa 1 meta cùng lúc)
- Versioning/diff trực quan giữa 2 phiên bản meta
- Kéo-thả canvas ĐẦY ĐỦ trên mobile (chỉ desktop)
- Print Format Builder: hiệu ứng CSS nâng cao ngoài layout khối cơ bản (dùng chế độ Code Jinja cho ca phức tạp)
- DocType Builder tạo DocType chuẩn KHÔNG bật Developer Mode (chỉ Customize overlay) — đúng luật Frappe
