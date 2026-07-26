## Trạng thái chốt

| Pha | Nội dung | |
|---|---|---|
| 0 | Gộp repo, workspace, ADR-001 | ✅ |
| 1 | Lớp vỏ Frappe Tier 1 + phiên cookie + xoá tài liệu | ✅ |
| 2 | amend, rename, autoname 7 dạng, Dynamic Link, mandatory_depends_on, modified_by, is_single | ✅ (trừ `track_seen`) |
| 3 | Custom Field + Property Setter | ✅ |
| 4 | Gói app + installer + endpoint install/uninstall | ✅ (chưa có CLI đóng gói) |
| 5 | Hooks qua Workers for Platforms | ✅ |
| 6 | Tier 2 + Tier 3 + Tier 4 + i18n + global search | ✅ — phần còn lại **cố ý không làm**, lý do từng cái ở [API_SURFACE.md](API_SURFACE.md) |
| 7 | Deploy + cổng phát hành | ◐ **chặn bởi thông tin đăng nhập Cloudflare** |

Bằng chứng chạy thật: [VERIFICATION.md](VERIFICATION.md) — Workerd 70/70 (47 kịch
bản E2E lớp vỏ) + 3/3, Node 248/248, SQL 6/6, build production cả hai bên.

## Pha 7 — cái gì chặn, và vì sao tôi không tự làm được

| Việc | Cần |
|---|---|
| Deploy Cloudflare, smoke staging, queue/outbox health | **API token + account Cloudflare** |
| Test tải, đa tenant trên hạ tầng thật | môi trường đã deploy |
| Diễn tập rollback + khôi phục tenant | môi trường đã deploy |
| Render thật trên trình duyệt (MetaForge Desk vẽ màn hình) | `wrangler dev` + client trỏ vào |
| `npm ci` sạch trên Linux | CI Linux (repo dùng pnpm) |
| Đối chiếu ERPNext oracle v0.8–v1.0 | clone Frappe/ERPNext v16 đã khoá SHA |
| Review pháp lý hoá đơn điện tử / lương | không phải việc kỹ thuật |

Ba hạng mục bản gốc ghi `NOT VERIFIED`/`NOT RUN` — Workerd, web typecheck, Vite
build — **đã chạy và xanh**. Phần còn lại của Pha 7 đòi hoặc thông tin đăng nhập
chỉ chủ tài khoản có, hoặc một môi trường đã deploy, hoặc thẩm định pháp lý.

## Việc còn mở, không chặn bởi gì

- CLI đóng gói app từ thư mục nguồn (nối với `create-metaforge-app` bên FE).
- Đóng gói lại chính bộ ERP hiện tại (`clouderp-*`) thành app đầu tiên, để tự chứng
  minh cơ chế cài app trên một bộ thật thay vì một app mẫu.
- `track_seen`.

---

# Lộ trình gốc (giữ lại làm hồ sơ)

## Pha 0 — Gộp repo ✅

- `server/` ← CloudForge (483 file), `client/` ← MetaForge (476 file), không sửa nội dung.
- pnpm workspace nối hai bên. Không xung đột tên: `@cloudforge/*` vs `@metaforge/*`.
- Tài liệu kiến trúc + bề mặt API + lộ trình.

**Cổng:** `pnpm install` chạy được, `pnpm run typecheck` xanh cả hai bên.

---

## Pha 1 — Lớp vỏ Frappe, Tier 1

Viết `server/packages/frappe-api`: transport (cookie session, CSRF, envelope `message`, 417) + 15
endpoint Tier 1 + REST `/api/resource/*`. Gắn vào `gateway-worker`.

Việc khó nằm ở ba chỗ, không phải ở số lượng endpoint:

1. **Dịch khoá lạc quan** `version` (int) ⇄ `modified` (timestamp). Phải đảm bảo `modified` đơn điệu
   và duy nhất cho mỗi lần ghi, nếu không hai client cùng ghi sẽ không phát hiện được xung đột.
2. **Idempotency**: sinh `command_id` tất định từ (tenant, doctype, name, action, hash payload) vì REST
   Frappe không có khái niệm này. Sai chỗ này = bút toán kép khi mạng chập chờn.
3. **Xoá tài liệu**: kernel hiện **không có** thao tác delete. Phải thiết kế cho đúng — chứng từ đã
   submit thì không được xoá, phải chặn ở cả controller lẫn trigger D1.

**Cổng:** Desk MetaForge boot thật trên CloudForge; mở list, mở form, sửa, lưu, submit, cancel một
DocType; test tích hợp Workerd cho từng endpoint; không sửa một dòng nào trong `client/`.

---

## Pha 2 — Vá tầng framework cho đúng chuẩn Frappe

Những lỗ hổng kiểm toán tìm ra, xếp theo mức nghiêm trọng:

| Việc | Vì sao cần |
|---|---|
| `amended_from` + luồng amend | Frappe: huỷ rồi sửa lại = bản mới `SO-0001-1`. Hiện **huỷ xong là hết đường** — với chứng từ kế toán đây là thiếu sót nghiệp vụ thật |
| `modified_by` trên bảng `documents` | Hiện chỉ có `owner`. **Không lưu ai sửa lần cuối** — lỗ hổng vết kiểm toán |
| `rename` (`allow_rename`) | `frappe.client.rename_doc`; hiện là metadata chết |
| `is_single` | Trang Settings kiểu Single DocType; hiện là metadata chết |
| `autoname` đầy đủ | Hiện chỉ có `hash` và `PREFIX.####`. Thiếu `naming_series`, `field:`, `format:`, `prompt`, `expression` |
| `Dynamic Link` giải quyết thật | Fieldtype đã khai báo nhưng `validateReference` chỉ xử lý `Link` → hiện **lọt thẳng không kiểm tra** |
| `mandatory_depends_on` cưỡng chế server | FE đã eval được, nhưng hàng rào phải ở server |
| `no_copy`, `track_seen` | Metadata chết, làm nốt cho nhất quán |
| Tag (`_user_tags`) + global search index | Tier 1/4 cần |

**Cổng:** mỗi mục có test đơn vị + test SQL; migration mới có diễn tập; không có metadata nào còn ở
trạng thái "khai báo mà không ai đọc".

---

## Pha 3 — Tầng tuỳ biến: Custom Field + Property Setter

Đây là **thứ quyết định có "cài app nhanh" được hay không**. Không có tầng này thì mỗi lần khách cần
thêm một trường là phải sửa metadata gốc → mất đường nâng cấp sạch.

- DocType `Custom Field` và `Property Setter` trong kernel.
- Meta hiệu dụng = DocType chuẩn + Custom Field + Property Setter, **hợp nhất lúc đọc**, có cache theo
  revision.
- `customize_form.save_customization`.
- Builder MetaForge (`DocTypeBuilder`, `WorkflowBuilder`, `PrintFormatBuilder`) chạy được — bên FE
  serializer cho Custom Field/Property Setter **đã verify live với Frappe thật**, nên đây thuần là việc
  của server.

**Cổng:** round-trip thật từ builder — tạo DocType, thêm Custom Field vào DocType chuẩn, sửa nhãn qua
Property Setter, reload, so sánh ngữ nghĩa, phát hiện xung đột 417.

---

## Pha 4 — Gói app và cài app

- Định dạng gói app (xem [ARCHITECTURE.md](ARCHITECTURE.md#cơ-chế-cài-app-mục-tiêu-cài-app-mới-nhanh)).
- `installed_apps` mỗi tenant, có version và thứ tự phụ thuộc.
- `install` / `uninstall` / `migrate` — nguyên tử, có rollback.
- CLI đóng gói app từ thư mục nguồn; nối với `create-metaforge-app` sẵn có bên FE.
- Đóng gói lại chính bộ ERP hiện tại (`clouderp-*`) thành app đầu tiên để tự chứng minh cơ chế.

**Cổng:** dựng tenant trắng → cài app → dùng được ngay, không deploy lại; gỡ app không để lại rác;
cài trùng version là no-op.

---

## Pha 5 — Hooks qua Workers for Platforms

Chỗ Frappe dùng `hooks.py`. Trên Cloudflare: mỗi app có thể kèm một Worker trong dispatch namespace,
nhận sự kiện vòng đời từ outbox.

- Hợp đồng sự kiện (before/after insert/submit/cancel), có bảo đảm giao ít nhất một lần.
- Đăng ký hook trong manifest app.
- Timeout, giới hạn tài nguyên, cách ly lỗi — một app hỏng không được kéo sập tenant.

**Cổng:** app mẫu có Worker riêng, chặn được một thao tác submit sai nghiệp vụ, và khi Worker chết thì
kernel vẫn đúng.

---

## Pha 6 — Bề rộng view + đa ngữ

Tier 4 của [API_SURFACE.md](API_SURFACE.md): kanban, treeview, notification, data import, print, email,
query report, tag, workspace, dashboard chart, number card.

Cộng **catalog dịch phía server** — MetaForge đã có translator core nhưng chưa có nguồn catalog. Với
khách Việt đây là việc bắt buộc, không phải tuỳ chọn.

---

## Pha 7 — Deploy và cổng phát hành

CloudForge **chưa từng được deploy** (`cloudflare_current_release_deployed: false`) và chưa chạy Workerd
lần nào ở bản hiện tại. Phải làm thật:

- `npm ci` sạch trên Linux, Workerd suite, web typecheck + build production.
- Diễn tập migration hình dạng production, đối chiếu.
- Test đa tenant, tải, đồng thời, bảo mật.
- Smoke trên Cloudflare staging, sức khoẻ queue/outbox.
- Diễn tập rollback và khôi phục tenant.

---

## Ước lượng trung thực

Đây **không phải việc vài ngày**. Bề mặt đã đếm được: 68 endpoint + 9 lỗ hổng framework + tầng tuỳ biến
+ cơ chế cài app. Pha 1–3 là phần cốt lõi phải có trước khi nói tới "cài app nhanh"; Pha 4–5 mới là thứ
trực tiếp trả lời yêu cầu đó.

Điều đáng mừng: **không có pha nào cần nghiên cứu mở**. Mọi thứ đều là việc kỹ thuật xác định, có hợp
đồng rõ, có bên đối chiếu (Frappe v16 đã khoá SHA) và có sẵn một FE đã test live để làm thước đo.
