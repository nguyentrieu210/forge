# I18N_MODEL — MetaForge

> Hai tầng tách bạch: (A) chrome khung theo KEY, (B) dịch DỮ LIỆU server theo CHUỖI NGUỒN (Frappe). Cộng LocaleContext định dạng số/tiền/ngày/duration.

## A) Chrome khung (key-based) — `@metaforge/shell/i18n`
`I18nProvider` + `useT()` + `useLocale()`. Từ điển theo key (vd `common.save`), VI/EN, mặc định VI. Thiếu key → fallback VI → chính key. Dùng cho nhãn khung (nav/nút hệ thống). Locale ở localStorage. Có fallback an toàn khi ngoài provider.

## B) Dịch dữ liệu server (source-string) — `@metaforge/core/i18n/translate` (P1-12)
MÔ HÌNH FRAPPE: dịch theo **chuỗi nguồn**, không key tuỳ ý (cho label field/message/tên doctype từ server).
```ts
makeTranslator(catalog) → __(text, replace?, context?)
```
- `context` ⇒ khoá `${context}:${text}`; ngược lại khoá `text`; thiếu ⇒ trả nguyên `text`.
- `formatMessage(str, args)` — thay `{0}`/`{1}` (mảng) · `{}` (tự tăng) · `{name}` (object); thiếu tham số → giữ placeholder.
- Catalog rỗng ⇒ identity. Thuần + test (selfcheck).
- **CHƯA XÂY**: nạp catalog từ endpoint server (catalog để TIÊM; chưa nối `frappe.translate`). Ghi KNOWN_GAPS — KHÔNG gọi là "unverified".

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
selfcheck: translator (source-string/context/`{n}`/`{name}`/fallback) · number EU/Ấn Độ/precision/fallback · **scope-switch** (config khác → output khác) · Duration round-trip. Live: dates format đúng ở list app sinh ra (TEST_REPORT §C3b).
