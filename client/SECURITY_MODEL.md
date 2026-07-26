# SECURITY_MODEL — MetaForge

> Ranh giới bảo mật = SERVER (Frappe). Client phòng thủ sâu: KHÔNG thực thi code tuỳ ý, KHÔNG inject, KHÔNG lộ bí mật/stack.

## 1) Đánh giá biểu thức — KHÔNG `new Function`/`eval` (P0-06)
`meta/safe-eval.ts` — parser recursive-descent **ALLOWLIST** cho `depends_on`/`eval:`:
- Hỗ trợ: literal (số/chuỗi/bool/null/mảng) · `doc`/`parent` + member (`.f`/`['f']`/`.length`) · toán tử `! && || == === != !== < > <= >= + -` · **unary minus** · ngoặc · hàm whitelist (`in_list/cint/flt/strip`).
- **Chặn**: định danh ngoài `doc`/`parent` · hàm ngoài whitelist · `__proto__`/`constructor`/`prototype` (member guard chỉ đọc own-prop) · global/window/alert. Ngoài allowlist ⇒ ném → caller coi điều kiện = false + diagnostic.
- `fn:` (function body) → KHÔNG thực thi (unsupported, bảo mật).
- Verify: selfcheck probe window/alert/constructor/fn: → false.

## 2) HTML injection — sanitize (P0-07)
`security/sanitize.ts` `sanitizeHtml(html)`: DOMParser inert + **allowlist tag/attr**; loại `script/style/iframe`, `on*` handler, `javascript:`. SSR fallback = strip toàn bộ tag. Dùng cho print/report/HTML field render.

## 3) URL scheme — sanitize (Gate 5)
`security/url.ts`:
- `sanitizeUrl(url)` — CHO http/https/mailto/tel/ftp + relative/anchor; **CHẶN** `javascript:`/`vbscript:`/`data:`/`file:` kể cả obfuscate (control-char/space/hoa-thường; chuẩn hoá bằng lọc codepoint trước khi dò scheme).
- `sanitizeImageUrl(url)` — thêm `data:image/{png,jpe?g,gif,webp,avif}` (KHÔNG svg+xml — SVG data-URI mang script được).
- Nối vào media controls (Attach/Attach Image/Image): `file_url` từ dữ liệu → qua sanitizer trước khi render `href`/`src`; không hợp lệ → hiện "URL không hợp lệ".
- Verify: selfcheck malicious-payload suite.

## 4) Bí mật AI — KHÔNG persist localStorage (Gate 5)
`system/ai-config.ts`: baseUrl/model (không nhạy) → localStorage; **apiKey → sessionStorage** (mất khi đóng tab, không tồn tại qua phiên trình duyệt → giảm cửa sổ lộ XSS/máy chung). Chuẩn production nên proxy backend (ghi debt).

## 5) Error mapping — không lộ stack/SQL (P0-10)
`types/error.ts` `mapError`: đào axios-nested + shape ném; parse `exception`→`exc_type` (regex `...Error`); `_server_messages` (double-encoded) → message + `fieldErrors`; ưu tiên text server cho validation/permission; `network` chỉ khi `ERR_NETWORK`/`network error`/`failed to fetch` (không generic). Thông điệp VN an toàn, KHÔNG lộ stack/SQL. `fieldErrors` map vào đúng control (Form).

## 6) Authorization
Xem PERMISSION_MODEL: capabilities fail-closed, permlevel, masked_fields server-authoritative. Client KHÔNG là ranh giới; server enforce.

## 7) CSP + transport (deploy-level)
- Runtime app gọi Frappe **same-origin** (`/api/...`); deploy dưới nginx chung (không CORS). Token auth CHỈ cho E2E (proxy); **production dùng session cookie + CSRF của Frappe**.
- **CSP header** = trách nhiệm nginx/frontend khi deploy (app SPA self-contained, không cần external host). Mẫu đề xuất (chỉnh theo asset thật):
  ```
  Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';        # Tailwind/inline style của design system
    img-src 'self' data:;                    # data:image raster (sanitizeImageUrl)
    font-src 'self' data:;
    connect-src 'self';                      # /api same-origin
    frame-ancestors 'none';                  # chống clickjack
    object-src 'none'; base-uri 'self'
  ```
  Cần loại `unsafe-eval` (đã đảm bảo: KHÔNG `new Function`/`eval` — safe-eval allowlist). Nếu bỏ được `unsafe-inline` cho style thì tốt (hiện design tokens dùng inline @theme → cân nhắc nonce).

## 8) Bí mật trong source/CI — KHÔNG hard-code (P0-SEC-01/02, sự cố thật đã xử lý)
Sự cố: 1 token Administrator thật bị hard-code trong 6 file (5 script live-test + 1 doc) VÀ tồn tại
trong 8 commit git history — phát hiện qua review độc lập trên 1 bản zip gửi đi. Đã xử lý triệt để
(chi tiết bằng chứng: `TEST_REPORT.md` §Phase 0), và dựng cơ chế phòng tái diễn:
- **KHÔNG credential nào được hard-code** trong source — mọi script live-test đọc qua biến môi trường
  bắt buộc (`requireLiveEnv()`, `apps/demo/_live-env.mjs`) — thiếu env → ném lỗi rõ, KHÔNG fallback bí
  mật. Nguồn thật: `.env.live.local` (gitignore, KHÔNG commit).
- **`scripts/scan-secrets.mjs`** — scanner tự viết, 0 dependency, quét pattern token Frappe (`key:secret`
  15+ hex ký tự), private-key block, AWS key, gán trực tiếp `api_key`/`password`/... = chuỗi literal.
  Wire vào **CI** (`ci.yml`, bước đầu tiên, trước cả `pnpm install`) VÀ **pre-commit hook** local
  (`scripts/install-hooks.mjs`, tự cài qua npm `prepare`) — đã verify THẬT bắt được secret giả lập
  (exit 1, đúng rule khớp) trước khi coi là hoạt động.
- **`e2e-factory/serve-proxy.mjs`** (proxy test tiêm token Administrator, đứng vai nginx same-origin)
  hardening: bind CỨNG `127.0.0.1` (không bao giờ `0.0.0.0`), allowlist path (`/api/method`+
  `/api/resource` — đúng những gì test dùng, KHÔNG proxy mù mọi thứ), allowlist method, containment-
  check chống path-traversal ở phần serve static, và **tự chặn khởi động nếu TOKEN xác thực là
  Administrator** trừ khi `E2E_ALLOW_ADMINISTRATOR=1` (opt-in tường minh, chỉ dùng cho smoke test hạ
  tầng đã dán nhãn rõ — permission-sensitive E2E dùng `serve-proxy-cookie.mjs` (KHÔNG token, chỉ
  forward cookie/CSRF thật của trình duyệt) + user hạn chế thật, xem PERMISSION_MODEL.md).

## Bất biến
1. KHÔNG `new Function`/`eval`/`fn:` — chỉ allowlist parser.
2. Mọi HTML/URL từ dữ liệu → sanitize trước render.
3. Bí mật không vào localStorage; lý tưởng không giữ ở client.
4. Lỗi hiển thị = thông điệp an toàn, không stack/SQL.
5. Server là ranh giới cuối; client fail-closed.
6. KHÔNG credential nào hard-code trong source/history — chỉ qua biến môi trường, chặn bằng secret-scan
   CI+pre-commit (§8).
