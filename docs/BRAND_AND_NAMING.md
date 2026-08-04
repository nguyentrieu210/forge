# Forge Brand & Naming Authority

Ngày cập nhật: **2026-08-05**.

Tài liệu này khóa cách gọi sản phẩm trong repo. Mục tiêu là giảm drift thương hiệu nhưng không phá technical/runtime contract chỉ để đổi tên.

## 1. Product brand

**Forge** là product brand duy nhất ở cấp platform.

Mô tả chuẩn:

> **Forge — enterprise operating platform metadata-driven, multi-tenant, Cloudflare-native, với ERP core, App Factory và vertical apps.**

Không dùng các tagline cũ như “CloudForge”, “MetaForge”, “ERPNext clone”, “Frappe replacement” hoặc “ERP tương thích Frappe” làm định vị sản phẩm.

## 2. Tên được phép giữ

### Technical namespace / compatibility identifiers

Các tên sau có thể giữ nguyên khi chúng là identifier đã tồn tại trong source, package, API, migration, worker, environment hoặc compatibility contract:

- `@metaforge/*`;
- `create-metaforge-app`;
- `metaforge.api.*`;
- `metaforge-cloudforge-adapter`;
- `cloudforge-*` worker/resource identifiers;
- path/file/module names có `metaforge` hoặc `cloudforge` nếu rename tạo migration/import/runtime blast radius;
- `kairo.vn` trong exact environment URLs/evidence;
- Frappe/ERPNext trong compatibility adapter, source-lock, benchmark và parity evidence.

Các identifier này **không phải product brand hiện hành**.

## 3. Vertical/app brand

- **Alumdoor** được giữ là reference vertical/app name.
- Domain app có thể có tên nghiệp vụ riêng nếu thật sự là product surface cho user.
- App generic như HRM nên dùng `Forge <domain>` hoặc tên domain thuần, không tạo thêm umbrella brand.

Ví dụ chuẩn: `Forge Nhân sự`, `Forge Runtime`, `Forge Server`.

## 4. Kairo

`Kairo` không phải umbrella product brand của repo.

Giữ `kairo.vn` khi nó là exact deployed hostname, route hoặc historical evidence. Không đưa `Kairo` vào title/app manifest/product copy mới nếu không có business contract riêng yêu cầu.

## 5. Frappe / ERPNext

Frappe/ERPNext là:

- compatibility target tại API boundary khi cần;
- upstream/reference benchmark;
- source-lock/parity evidence.

Không dùng Frappe/ERPNext để định nghĩa Forge là sản phẩm phụ thuộc hoặc bản sao. Forge có authoritative kernel, package model, Cloudflare runtime và vertical architecture riêng.

## 6. Documentation rule

Trong prose hiện hành:

1. gọi platform là **Forge**;
2. gọi frontend là **Forge client/runtime**; chỉ nhắc `@metaforge/*` khi nói technical namespace;
3. gọi backend là **Forge server/platform runtime**; chỉ nhắc `cloudforge-*` khi nói exact worker/resource identifier;
4. tách rõ current authority khỏi historical component/release snapshot;
5. mọi file mô tả brand/version cũ nhưng không còn contract/evidence phải update hoặc xóa theo `docs/README.md` retention policy.

## 7. Rename boundary

Không mass-rename technical identifiers trong một docs/brand cleanup.

Rename package/API/worker/resource/domain chỉ được làm khi có migration plan, compatibility impact assessment, tests và release evidence tương ứng. Brand consistency không được đánh đổi bằng runtime regression.
