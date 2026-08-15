# I18N_MODEL — MetaForge

> Hai tầng tách bạch: (A) chrome khung theo KEY, (B) dịch DỮ LIỆU server theo CHUỖI NGUỒN (Frappe). Cộng LocaleContext định dạng số/tiền/ngày/duration.

## A) Chrome khung (key-based) — `@metaforge/shell/i18n`
`I18nProvider` + `useT()` + `useLocale()`. Từ điển theo key (vd `common.save`), VI/EN, mặc định VI. Thiếu key → fallback VI → chính key. Dùng cho nhãn khung (nav/nút hệ thống). Locale ở localStorage. Có fallback an toàn khi ngoài provider.

## B) Dịch dữ liệu server (source-string) — metadata/Form/List
MÔ HÌNH FRAPPE: dịch theo **chuỗi nguồn**, không key tuỳ ý (label field, description, tên DocType và nhãn Select từ server).

### Luồng đang chạy
`FrappeAdapter.getMeta()` lấy metadata → gom DocType label + field label + description + Select option → `metaforge.api.translate_strings` → `D1TranslationStore` → metadata đã dịch → Form/List/ChildGrid/Quick Create dùng chung.

Thứ tự ưu tiên cho tiếng Việt:
1. **Translation D1 của tenant** — cho thuật ngữ riêng/override của doanh nghiệp.
2. **Vietnamese ERP fallback của platform** — bộ thuật ngữ chung cho Company, Item, Warehouse, mua/bán, sản xuất, nhân sự, kế toán, chất lượng…
3. **Chuỗi nguồn** — chỉ còn khi hệ thống không đủ căn cứ dịch an toàn.

Không dịch đè giá trị dữ liệu của `Select`: `field.options` luôn giữ canonical value (vd `Material Transfer`), bản dịch chỉ nằm ở `optionLabels`. Như vậy UI có thể hiện `Chuyển kho` nhưng DB và business rules vẫn nhận giá trị chuẩn.

`@metaforge/core/i18n/translate` vẫn cung cấp translator thuần cho các consumer cần catalog tiêm trực tiếp:
```ts
makeTranslator(catalog) → __(text, replace?, context?)
```
- `context` ⇒ khoá `${context}:${text}`; ngược lại khoá `text`; thiếu ⇒ trả nguyên `text`.
- `formatMessage(str, args)` — thay `{0}`/`{1}` (mảng) · `{}` (tự tăng) · `{name}` (object); thiếu tham số → giữ placeholder.
- Catalog rỗng ⇒ identity.

### Coverage gate
`server/tests/vietnamese-translations.test.mjs` quét canonical `alumdoor-v2.json`, gồm tên DocType, label field và option Select. Mọi chuỗi được nhận diện là English ERP UI label phải sinh ra output tiếng Việt. Script `server/scripts/audit-alumdoor-vietnamese-i18n.mjs` in số liệu coverage và fail nếu còn label English-like chưa xử lý.

## C) Locale format (số/tiền/ngày/duration) — `core/i18n/format` (P1-16)
Nguồn cấu hình = **boot.sysdefaults** (`number_format` / `currency` / `date_format` / `float_precision`).
```ts
makeLocaleFormat(config) → { number, currency, date, duration, config }
```
- `formatNumber(v, number_format, precision)` — bảng number_format Frappe: `#,###.##` (US) · `#.###,##` (EU hoán đổi) · `#,##,###.##` (Ấn Độ lakh 2,2,3) · precision override thắng format · âm giữ dấu.
- `formatCurrency(v, symbol, …)` — symbol trước + space; âm: dấu trước symbol.
- `formatDate(v, date_format)` — `dd-mm-yyyy`/`yyyy-mm-dd`/`dd/mm/yyyy`…
- `formatDuration(sec, {hideDays,hideSeconds})` / `parseDuration(str)` — **Duration canonical = GIÂY**; round-trip **lossless** (`1d 2h 3m 4s` ↔ 93784; số thuần = giây). Duration = PARTIAL (chưa widget d/h/m/s đầy đủ).

### LocaleContext — 1 nguồn duy nhất
`MetaForgeProvider` nhận prop `locale` (từ boot.sysdefaults) → dựng `fmt = makeLocaleFormat(...)`, expose `useLocaleFormat()`. **Memo theo `localeKey`** (JSON của config) ⇒ đổi user/site/lang → dựng lại, **KHÔNG dùng cache locale cũ** (prop-driven, không module singleton).
- Nối: **list cells** (Currency/Float/Int/Percent/Duration/Date) qua prop `fmt` (ListView router-agnostic); **Builder preview** dùng chung provider. `apps/*/main.tsx` truyền `boot.sysdefaults`.
- CÒN (follow-up): format field read-only trong Form + Datetime-locale ở cells (cùng dùng `useLocaleFormat`).

## Verify
- Translation: exact Vietnamese ERP terms, tenant D1 override, non-VI fallback, canonical Alumdoor metadata sweep.
- Locale: translator formatting placeholders, number EU/Ấn Độ/precision/fallback, scope-switch, Duration round-trip.
- Live: metadata generic Form/List lấy label qua cùng `FrappeAdapter.getMeta()`; không vá label riêng từng màn.