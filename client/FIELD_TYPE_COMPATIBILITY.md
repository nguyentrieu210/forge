# Fieldtype Compatibility Matrix

> Gate 2 deliverable. Trạng thái mỗi fieldtype khi render qua control registry. `normalizeMeta`
> gắn `_compat` cho từng field ⇒ renderer chẩn đoán được field không hỗ trợ (rule #8), KHÔNG âm
> thầm render như Data/Text. Nguồn logic: `packages/core/src/meta/normalize.ts` (`fieldTypeStatus`).
>
> - **SUPPORTED** — control chuyên dụng, đủ ngữ nghĩa Frappe cho product scope.
> - **PARTIAL** — có control nhưng CHƯA đủ ngữ nghĩa (editor cơ bản / thiếu context) → cần hoàn thiện.
> - **READ_ONLY** — chỉ hiển thị (không nhập).
> - **UNSUPPORTED_VISIBLE** — fieldtype lạ / ngoài 44 → hiện diagnostic, KHÔNG render như Data.

## Ma trận (44 dòng: 43 authorable + Long Int runtime)

| Nhóm | Fieldtype | Status |
|---|---|---|
| Layout | Section Break · Column Break · Tab Break · Heading | SUPPORTED |
| Layout | HTML · Button | SUPPORTED (no-value) |
| Layout | **Fold** | **PARTIAL** (legacy, chưa fold-collapse đầy đủ) |
| Data/text | Data · Small Text · Text · Long Text · Password | SUPPORTED |
| Data/text | Read Only | READ_ONLY |
| Data/text | **Text Editor · HTML Editor · Markdown Editor · Code** | **PARTIAL** (editor cơ bản; chưa đủ toolbar/preview/sanitize-đầy-đủ) |
| Numeric | Int · Float · Currency · Percent | SUPPORTED |
| Numeric | **Rating** | **PARTIAL** (hạ cấp về ô số 0..max; CHƯA có widget sao) |
| Date/time | Date · Datetime · Time | SUPPORTED |
| Date/time | **Duration** | **PARTIAL** (hạ cấp về ô số **giây**; CHƯA có widget nhập ngày/giờ/phút/giây — xem canonical parse/format ở `i18n/format.ts`) |
| Selection | Check · Select | SUPPORTED |
| Relation | Link | SUPPORTED (⚠ subsystem Link đầy đủ = Gate 3: filters/query/title/trang-đầu-gõ-thêm; fallback fail-visible = P1-LINK-01) |
| Relation | **Dynamic Link** | **PARTIAL** (chưa đủ context doctype-động + child-row) |
| Relation | Table · Table MultiSelect | SUPPORTED (⚠ child resolver canonical = Gate 3) |
| Media | Attach · Attach Image · Image · Signature | SUPPORTED (⚠ privacy/upload-context = Gate 4 P1-15) |
| Special | Color · Barcode · Icon · Phone · Autocomplete | SUPPORTED |
| Special | **Geolocation** | **PARTIAL** (map picker cơ bản) |
| Special | **JSON** | **PARTIAL** (editor cơ bản) |
| Runtime | Long Int | SUPPORTED (NumberInput, runtime-only) |
| _khác_ | (fieldtype ngoài danh sách) | **UNSUPPORTED_VISIBLE** → diagnostic |

## Ghi chú (liên gate)
- **Duration/Rating**: đánh dấu PARTIAL (Gate 4) — KHÔNG tuyên bố supported khi chỉ fallback về ô số. Duration có **canonical representation** (giá trị lưu = **giây**, parse/format round-trip lossless `parseDuration`/`formatDuration`); widget d/h/m/s đầy đủ để sau. Builder canonical đọc `_compat=PARTIAL` ⇒ cảnh báo/guard preview/apply.
- **PARTIAL editors** (Text/HTML/Markdown/Code/JSON): hoàn thiện ngữ nghĩa + sanitize → Gate 4/5.
- **Link/Dynamic Link/Table**: subsystem đầy đủ (filters, get_query, title, child resolver) = **Gate 3** (P0-09, P1-06). "Trang đầu + gợi ý gõ thêm khi chạm trần" — **KHÔNG phải phân trang thật** (không có tải-thêm/next-page), đã sửa nhãn (trước ghi nhầm "pagination"). Fallback khi thiếu service/config: fail-visible (chẩn đoán + khoá), KHÔNG còn im lặng cho gõ tự do = **P1-LINK-01**.
- **Attach/Image/Signature**: privacy + upload-context + file URL validate = **Gate 4** (P1-15).
- Mọi PARTIAL/UNSUPPORTED_VISIBLE hiện `_compat` ⇒ có thể bật developer diagnostic panel (Gate 8 P2).
