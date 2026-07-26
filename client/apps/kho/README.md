# Kho

App MetaForge mỏng sinh bởi create-metaforge-app. Runtime có sẵn:

- Global Business Context theo role/User Permission (Company · Fiscal Year · Warehouse).
- Tổng quan KPI và Quy trình nghiệp vụ.
- Danh mục đầy đủ từ Workspace Frappe, lọc theo quyền hiệu lực.
- Form/List/Link/Child Table, modal tạo mới và display-title resolver.

## Chạy
```bash
pnpm install
pnpm dev
pnpm build
```

Sửa `src/app-manifest.ts` để đổi domain, brand, home và mục tùy chỉnh. Engine không bị copy vào app.
