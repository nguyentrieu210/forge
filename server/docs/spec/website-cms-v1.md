# Website/CMS multi-tenant v1

## 1. Phạm vi và giả định

Website/CMS là capability dùng chung của Forge, cài như app metadata vào tenant và render bằng runtime chung. Website mà khách tạo là dữ liệu tenant, không phải source code riêng và không được fork Core theo khách.

V1 phục vụ website public doanh nghiệp với ba preset đầu tiên: `business-landing`, `catalogue`, `sales`. Preset chỉ là metadata/versioned data. Ecommerce không có engine thứ hai: block sản phẩm và CTA bán hàng tái sử dụng `forge.storefront.*` hiện có.

Custom domain/DNS provisioning, arbitrary HTML/CSS/JavaScript, checkout thanh toán trực tuyến và drag-drop tự do nằm ngoài v1. Domain riêng tiếp tục dùng tenant routing/control-plane hiện có khi được productize ở phase sau.

## 2. Bài toán

Khách Forge cần một website public dùng cùng dữ liệu ERP mà không phải vận hành WordPress/hosting/codebase riêng. Người dùng phải có thể đăng nhập Forge, chọn mẫu + theme, chỉnh nội dung bằng metadata, publish và có website public ngay trên cùng runtime.

## 3. Mục tiêu và acceptance

1. Cài `website` app vào tenant tạo được Website Settings + Web Page + Web Page Block và roles quản trị.
2. System Manager/Website Manager cấu hình preset, theme token, branding và trang qua CRUD MetaForge hiện có.
3. Guest chỉ đọc được site/page khi `Website Settings.enabled=1`, `published=1` và page được publish; không mở generic `get_list` cho Guest.
4. Public page resolver chỉ trả block thuộc allowlist; không trả arbitrary HTML/JS hoặc field nội bộ.
5. Tenant A không thể đọc website tenant B vì mọi query bind `tenant_id` từ trusted tenant context.
6. `/shop*` tiếp tục dùng Storefront hiện có; website `product-grid` chỉ liên kết/tái sử dụng Storefront, không tính giá hay tạo Sales Order trực tiếp.
7. Khi không có site public, các route nội bộ Forge tiếp tục chạy AuthBoundary như trước.
8. Preset được pin bằng `id + version`; app upgrade thêm preset version mới không được âm thầm đổi website tenant cũ.
9. Chọn/đổi preset hoặc theme không cần build frontend.
10. Client build/typecheck và server tests/typecheck/build liên quan phải pass trước PR ready.

## 4. Actor, dữ liệu và authority

| Actor | Hành động |
|---|---|
| Guest | đọc manifest/page đã publish, mở shop/storefront hiện có |
| Website Editor | sửa Website Settings, tạo/sửa Web Page và blocks |
| Website Manager | toàn quyền nội dung website trong boundary DocPerm |
| System Manager | như Website Manager + cài/upgrade app |

Authority bảo mật nằm server. Ẩn menu hoặc block ở client không phải permission boundary.

## 5. Entities

### Website Settings (Single)

- `enabled`, `published`
- `site_title`, `site_description`
- `template_preset`: `business-landing`, `catalogue`, `sales`
- `template_version`: version đã pin, mặc định `1`
- `theme_preset`: `business-blue`, `industrial-dark`, `warm`
- `theme_version`: version đã pin, mặc định `1`
- branding: `logo`, `favicon`
- design tokens override: primary/secondary/background/text, heading/body font, radius, density
- contact/footer metadata

`template_version` và `theme_version` là read-only ở form v1. Việc nâng preset version sau này phải đi qua action/migration có chủ đích, không thay đổi ngầm khi app package được upgrade.

### Web Page

- `slug` unique, normalized path
- title + nav metadata
- `published`
- SEO title/description
- child table `blocks`

### Web Page Block (child)

Allowlist v1: `hero`, `text`, `features`, `image-gallery`, `project-gallery`, `product-grid`, `cta`, `contact`.

Field là data có cấu trúc: heading, eyebrow, body plain text, image, button label/url, tone, alignment, columns, source, limit. Không có arbitrary script/html.

### Preset data

App fixtures trong `master_records`:

- `Website Template`: versioned page/block tree.
- `Website Theme Preset`: versioned design tokens.

Identity lưu theo `${preset_id}@${version}`, ví dụ `business-landing@1`, `sales@1`, `business-blue@1`. Data vẫn mang `preset_id` và `version` để self-describe và phục vụ kiểm tra/migration.

Public resolver lấy đúng preset version đã pin, sau đó overlay tenant `Web Page` records theo slug. Do đó package có thể bổ sung `business-landing@2` mà tenant đang pin `business-landing@1` vẫn giữ nguyên giao diện cho tới khi có upgrade được yêu cầu rõ.

### Preset resolution thay vì sinh source code

V1 không tạo frontend/source code hoặc bắt buộc materialize toàn bộ preset thành hàng chục `Web Page` record khi người dùng chọn mẫu. Resolver dùng preset versioned làm base metadata, còn tenant chỉ lưu những trang cần override hoặc bổ sung.

Hành vi người dùng vẫn là một lần chọn mẫu/theme thì website xuất hiện ngay. Cách này giảm dữ liệu trùng lặp và làm update an toàn hơn. Nếu UX tương lai cần "tách mẫu thành bản sao để sửa toàn bộ", action `apply template` có thể materialize các trang một cách idempotent, nhưng đó không phải điều kiện để public website v1 hoạt động.

## 6. Luồng chính

### Tạo website

1. Admin cài/full-solution đã có Website app.
2. Người dùng mở Website Settings.
3. Chọn template + theme, nhập brand/contact và bật `enabled`.
4. Settings pin `template_version` và `theme_version` tương ứng.
5. Preview bằng public resolver.
6. Bật `published` khi sẵn sàng.
7. Guest vào `/` hoặc slug public và runtime render metadata đã resolve.

### Tùy biến trang

1. Editor tạo `Web Page` cùng slug muốn override hoặc trang mới.
2. Sắp xếp child `Web Page Block` trong form MetaForge.
3. Lưu draft không làm page public nếu `published=0`.
4. Publish page chỉ ảnh hưởng tenant hiện tại.
5. Override không sửa fixture/preset gốc nên tenant khác không bị ảnh hưởng.

### Bán hàng

1. Template `sales` có block `product-grid` trỏ `/shop`.
2. Catalogue/product/cart/order vẫn gọi `forge.storefront.*`.
3. Server tiếp tục quyết định field public, giá, rate limit và order request.

## 7. Failure branches

- Website chưa enabled/published: public API trả not found, runtime rơi về Forge login/internal routing.
- Slug không tồn tại/unpublished: trả not found, không tiết lộ record draft.
- Preset/theme hoặc exact version đã pin không tồn tại: validation fail closed; không tự nhảy sang version khác.
- Block type hoặc URL không hợp lệ: server từ chối/loại khỏi public shape.
- Storefront chưa cài nhưng template có product-grid: website vẫn render CTA/catalogue fallback; shop API 404 trung thực.

## 8. Invariants

1. Customer customization là tenant data, không `if tenant === ...` trong Core.
2. Một shared runtime cho mọi tenant.
3. Public website API là allowlist riêng, không biến Guest thành user có quyền đọc DocType.
4. Website không direct-write stock/accounting/sales ledger.
5. Ecommerce reuse Storefront canonical.
6. Theme dùng token có kiểm soát, không arbitrary JS/CSS.
7. Preset identity là immutable `id@version`; package upgrade không được overwrite hành vi tenant đã pin.
8. Explicit Forge runtime modes như `?app=`, `?alumdoor=1`, `?landing=1` không bị Website bootstrap chiếm route.
9. App install/upgrade và production deploy là hai boundary riêng.

## 9. Phân phối

`website` là first-party installable app/capability. Industry solution như Alumdoor có thể cài sẵn app này và chỉ ẩn capability khi khách không dùng. Khách mua solution hoàn chỉnh, không phải tự quản package dependency.
