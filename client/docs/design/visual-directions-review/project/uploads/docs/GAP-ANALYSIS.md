# MetaForge — Gap Analysis (implementation vs spec) — soi HẾT

> Đối chiếu code thật (v0.1.0) với: §0 (13 contract) · §2 (19 nghiệp vụ) · 23 screen card · appendix §A–§S · flows F0–F9. Đánh giá thẳng, không tô hồng. Ký hiệu: ✅ xong · ⚠️ mỏng/một phần · ❌ chưa có.

## A. CORE ENGINE SERVICES (appendix §A/§B) — cái spec coi là nền
| Service (§A) | TT | Ghi chú |
|---|---|---|
| FrappeAdapter | ✅ | full contract, verified live |
| MetaResolver | ✅ | field-state/depends_on/permlevel/docstatus |
| PermissionResolver | ✅ | trong resolver (verified server-side) |
| Field Registry + Controls | ✅ | 36/43 |
| Cache | ⚠️ | TanStack keys có; **thiếu LRU meta (200 dt/15MB), invalidate-on-Customize/Property Setter, snapshot** |
| **ClientScriptExecutor** (§F3) | ❌ | **CHƯA CÓ** — `new Function(frm, frappe.call proxy, msgprint, db.get_value…)`. Không chạy Client Script + `__js/__custom_js` |
| **WorkflowResolver** | ❌ | adapter có `apply_workflow`/`get_transitions` nhưng **không có resolver tính nút action theo state+role** để hiện trên Form |
| **NamingPreview** | ❌ | "mã dự kiến" từ naming_series/autoname — chưa có |
| **Format** (`shared/format.ts`) | ❌ | số/ngày/tiền VN, tiền-bằng-chữ — chưa viết |
| **Router** (§A URL /app/*) | ❌ | **KHÔNG có routing** — demo dùng useState switch, không phải `/app/<dt>`, `/app/<dt>/<name>`, `/view/<x>` |
| **Versioned meta-mapper** `mapMetaV16()` (§J) | ❌ | adapter trả meta raw, chưa chuẩn hoá qua mapper |

## B. E06 — CLIENT BEHAVIOR ASSETS (bundle FormMeta) — ❌ FETCH nhưng KHÔNG THỰC THI
`getdoctype` trả `__js/__custom_js/__list_js/__custom_list_js/__calendar_js/__tree_js/__dashboard/__kanban_column_fields/__workflow_docs/__templates/__form_grid_templates/__css`. Adapter khai báo `getAssets`, nhưng **không renderer nào chạy chúng** ⇒ Client Script + hành vi view tuỳ biến của site **KHÔNG hoạt động** → phá "1:1". (Risk §L đã liệt: cần executor best-effort + fallback mở Desk gốc — cũng chưa có fallback.)

## C. §D LIFECYCLE (Form) — bước còn thiếu
| Bước §D | TT |
|---|---|
| resolveMeta / resolvePermission / loadDoc / buildSchema(Zod) / computeDynamic(depends_on) | ✅ |
| `registerScripts` (executor nạp __js) | ❌ |
| `afterRender` runScript('refresh') | ❌ |
| `runFetchFrom` (Link đổi → get_value ô chưa dirty) | ❌ **autofill fetch_from chưa có** |
| `runScript(<field>)` on change | ❌ |
| `runScript('validate','before_save')` | ❌ |
| `onSaved` reload docinfo/**timeline** | ⚠️ invalidate có, timeline không |
| `cleanup` clear autosave draft | ❌ (không autosave) |

## D. §E STATE MACHINE — ⚠️/❌
- Form doc state `Clean→Dirty→Validating→Saving→Conflict→Reload`: **chỉ có cờ conflict**, không có máy trạng thái đầy đủ.
- Docstatus overlay (submit/cancel/amend) trên UI: ❌ (adapter có, **Form không có action bar** submit/cancel/amend).
- List row bulk/inline `Idle→Selected→Mutating`: ❌.

## E. 13 CONTRACT (§0)
| Contract | TT | Thiếu |
|---|---|---|
| screen-catalog (3 cột list-detail-context) | ❌ | **không có 3 cột**; bấm dòng không co-trái+giữa+phải |
| data-table | ❌ | thiếu checkbox pin, STT cố định, cột ảnh, **resize + chọn cột lưu localStorage**, import wizard |
| form-workflow | ⚠️ | Link là datalist; **thiếu "+Thêm mới" mở FORM GỐC nested + prefill + focus field kế**; **autofill fetch_from ❌** |
| mobile-pwa | ❌ | **BottomNav, FAB, mobile full-screen, PWA install/update — chưa có** |
| master-data | ⚠️ | Link cơ chế đúng nhưng "+Thêm mới" chưa mở form gốc |
| media-capture | ⚠️ | Attach/Signature ✅; **QR sinh mã ❌, OCR "Điền từ ảnh" ❌** |
| print | ⚠️ | iframe render HTML; **route `/print/`, `@page`, `window.print()`, QR, số-tiền-bằng-chữ ❌**, tải PDF/email ❌ |
| notify | ❌ | bell/badge/deep-link/Zalo/opt-out — chưa có |
| polish | ❌ | virtualize, optimistic-UI <100ms, **autosave draft**, `?` cheatsheet — chưa (417 lock ✅) |
| backend (ADAPT) | ✅ | Frappe lo auth/perm/audit; adapter mapError ✅ |
| pos-fnb | N/A | — |

## F. §2 — 19 NGHIỆP VỤ BẮT BUỘC
| # | Mục | TT |
|---|---|---|
| 1 | Phân quyền | ✅ (server verified) |
| 2 | Thùng rác/bất biến | ⚠️ delete qua adapter; **docstatus bất biến chưa ép ở UI**, chưa có "Deleted Documents" |
| 3 | Audit log (Version/Activity ở timeline) | ❌ **timeline chưa có** |
| 4 | Báo cáo | ⚠️ ReportView mỏng, chưa export Excel |
| 5 | Thông báo | ❌ Notification UI chưa có |
| 6 | Barcode fieldtype | ⚠️ control input; **quét súng/camera ❌** |
| 7 | Kanban chip lý do | ❌ **luật trọng yếu — chưa** |
| 8 | AI (OCR/Hỏi AI) | ❌ **luật trọng yếu — không điểm AI nào** |
| 9 | Layout 3 cột | ❌ **luật trọng yếu — chưa** |
| 10 | Ảnh/chữ ký/QR/OCR | ⚠️ Signature ✅; QR/OCR ❌ |
| 11 | In ấn (A4/A5, QR, tiền bằng chữ) | ⚠️ render HTML; format/QR/@page ❌ |
| 12 | Zalo/đa kênh | ❌ |
| 13 | Mã sinh tự động + preview | ❌ NamingPreview chưa có |
| 14 | Calendar (Ngày/Tuần/Tháng + kéo) | ⚠️ chỉ Tháng |
| 15 | Tiện VN (tìm không dấu, bấm gọi, format) | ❌ chưa |
| 16 | Autofill (fetch_from/default/session) | ❌ chưa |
| 17 | Polish (virtualize/autosave/cheatsheet) | ❌ chưa |
| 18 | Lịch sử & vòng đời (timeline gộp) | ❌ **luật trọng yếu — chưa** |
| 19 | Danh mục (Link) | ⚠️ Link có; "+Thêm mới form gốc" chưa |

## G. 23 SCREEN — mức hoàn thiện
**Có UI, khá:** M17 DocType Builder ✅ · M22 Dashboard Builder ⚠️
**Có UI, mỏng:** M00 Shell (thiếu BottomNav/PWA/mobile) · M03 Awesomebar (chỉ nav, thiếu search doc/report + Hỏi-AI) · M04 List (thiếu filter/bulk/3-cột/checkbox/resize) · M05 Report ⚠️ · M06 Kanban (thiếu chip dialog + dnd) · M07 Calendar (chỉ tháng) · M08 Gantt (read-only) · M09 Tree (chưa container) · M10 Dashboard (mock, chưa container) · **M11 Form (thiếu 3-cột + timeline + action bar + scripts + fetch_from + naming — thiếu rất nhiều)** · M12 Child-grid (cơ bản) · M13 Print (thiếu selector/PDF/email/QR) · M15 Report Runner (thiếu filter/script/export) · M18 Workflow Builder (graph read-only) · M21 Print Builder (không WYSIWYG paper)
**CHƯA có UI (adapter có, component ❌):** M01 Login · M02 Workspace · M14 Data Import (wizard) · M16 Permission Manager · M19 Notifications · M20 Settings

## H. §K PLUGIN REGISTRIES — chỉ 1/6
`FieldTypeRegistry` ✅ (ControlRegistry). **Thiếu:** ViewRegistry ❌ · ActionRegistry ❌ · ThemeRegistry ❌ · HookRegistry ❌ · AdapterRegistry ❌ · cấu trúc plugin `{name,version,register(engine)}` ❌.

## I. §H PERF / §I NFR
- Virtualize list (5000 dòng 60fps) ❌ · optimistic-UI <100ms ❌ · LCP/frame chưa đo · chunk main 235KB gzip (≤300 ✅).
- a11y WCAG AA (keyboard/aria/focus) ❌ · i18n VI/EN (Frappe translations) ❌ · timezone Datetime local↔UTC ❌ · PWA ❌ · dark mode ✅.

## J. §O TEST MATRIX
| Tầng | TT |
|---|---|
| Unit (Vitest) | ⚠️ có `selfcheck` (46) tương đương, **chưa Vitest chuẩn/CI** |
| Integration/API (quyền/CRUD/workflow/mask) | ⚠️ curl smoke thủ công, **chưa automated** |
| Contract/snapshot (golden getdoctype fixture) | ❌ |
| Visual (Playwright screenshot 390/768/1280 light+dark) | ❌ |
| E2E (login→list→form→save→submit→print) | ❌ |
| **Regression 4 luật trọng yếu** | ❌ (bản thân 4 luật chưa build) |
| Perf/a11y | ❌ |

## K. FLOWS F0–F9 — wiring
Adapter có method cho hầu hết; nhưng **container/UI wiring** chỉ List+Form. F4 Workflow transition (nút action + chip), F7 Import wizard, timeline, assign/comment — **chưa nối UI**.

---

## CHỐT THẬT (recalibrated — bản trước tao nói "engine 90%" là VỐNG)
| Mảng | % thật |
|---|---|
| Adapter contract + MetaResolver + field-state + mapError + security (verified live) | ~**85%** |
| **Core engine services đầy đủ** (executor/router/workflow-resolver/naming/format/meta-mapper/plugin/cache) | ~**40%** |
| 9 view renderer (presentational) | tồn tại nhưng mỏng |
| Screen feature-completeness vs 23 card | ~**40%** |
| **4 luật trọng yếu (bắt buộc)** | **0/4** |
| Contract §0 thoả đủ | ~4/11 đạt, 6 thiếu nhiều, 1 N/A |
| Test theo §O | ~1.5/8 tầng |

**Kết:** MetaForge hiện là **engine-skeleton chạy thật + renderer cơ bản + tích hợp/bảo mật đã chứng minh** — KHÔNG phải "1:1 Frappe Desk gần xong". Để đạt spec còn thiếu: **Router · ClientScriptExecutor + chạy E06 assets · Form Detail 3-cột + timeline + action bar + fetch_from + naming preview · Kanban chip · AI · 6 màn UISS · Format/VN · virtualize/autosave/a11y/i18n/PWA · plugin registries · test matrix (Vitest/Playwright/snapshot)**. Ước lượng khối lượng còn ~**50–60%** công so với đã làm.
