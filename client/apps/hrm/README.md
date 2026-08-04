# Forge Nhân sự

HRM app surface chạy trên shared Forge client/runtime.

`@metaforge/*` và `create-metaforge-app` là technical package/tool namespace được giữ để tránh breaking change; chúng không phải product brand riêng.

App sử dụng runtime có sẵn cho:

- server-resolved Business Context;
- role/User Permission-aware navigation and data access;
- Form/List/Link/Child Table và shared interaction primitives;
- metadata/workspace-driven catalog;
- mobile-oriented experience routes như duyệt nghỉ phép.

## Chạy local

```bash
pnpm install
pnpm dev
pnpm build
```

Business/domain behavior phải tái sử dụng shared HRM/platform authorities. Không copy engine hoặc dựng shadow permission/business state trong app.

Current repository status: xem `../../../CURRENT_STATUS.md`. Naming policy: `../../../docs/BRAND_AND_NAMING.md`.
