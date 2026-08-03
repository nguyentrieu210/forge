# ALUMDOOR — CURRENT HANDOFF

Cập nhật: **2026-08-03 (UTC+7)**.

Tài liệu này thay thế handoff cũ vốn hardcode local worktree, app version và production snapshot ngày 2026-08-01. Những giá trị đó giờ chỉ còn là lịch sử trong Git/GitHub evidence.

## 1. Source of truth

- Repository: `nguyentrieu210/forge`.
- Canonical code: exact current `main`.
- Production: `https://alu.kairo.vn`.
- Tenant: `alu`.
- Không hardcode “release hiện hành” trong handoff dài hạn; khi cần xác minh production phải đọc `/health`, `/release.json` và release evidence hiện tại.
- `CURRENT_STATUS.md` là trạng thái repo hiện tại; GitHub thắng mọi prose stale.

## 2. Repository state

- **Open PR = 0** sau repo reset ngày 2026-08-03.
- Không có Alumdoor PR/branch nào được coi là active delivery queue.
- Các branch/PR cũ vẫn giữ để audit/reference; không tự reopen hoặc tiếp tục mặc định.
- Việc Alumdoor mới phải tạo branch/PR mới từ exact current `main` sau khi audit current code.

Các PR follow-up gần nhất liên quan Alumdoor/Matrix/auth/Employee Lite đã được đóng không merge trong repo reset, gồm `#419`, `#423`, `#424`, `#405`, `#388` và các PR legacy domain liên quan. Nếu một yêu cầu mới trùng scope, chỉ reuse phần còn đúng contract.

## 3. Product direction hiện tại

### 3.1 Nhân sự Alumdoor

- Shared `hrm` của Forge vẫn là application HCM đầy đủ; không thu nhỏ core HRM theo nhu cầu riêng Alumdoor.
- Alumdoor product/shell được giữ **đơn giản**: trọng tâm là **Nhân viên** và **Chấm công**.
- Các capability HRM sâu hơn chỉ xuất hiện khi thực sự cần, không đẩy toàn bộ HR enterprise vào trải nghiệm xưởng.
- Current main HRM đã ở dòng version mới hơn nhiều handoff cũ; phải đọc `server/apps-src/hrm/app.json` và metadata hiện tại trước mọi thay đổi permission/Employee.

### 3.2 Mobile Alumdoor

- Mobile/PWA hiện ưu tiên **bán hàng**, tra cứu **công nợ khách hàng** và chứng từ **giao hàng**.
- Purchase Funding/Warehouse Cash không còn là entry chính trong accessible mobile navigation theo UI direction mới nhất trên main.
- Không phát minh app native riêng nếu PWA hiện tại đáp ứng được use case; app/mobile surface phải dùng API/authority canonical của Forge.

### 3.3 Quỹ/kế toán nội bộ

- Trải nghiệm xưởng ưu tiên mô hình **thu/chi nội bộ đơn giản**.
- `gl_entries` và accounting controllers canonical vẫn là money source of truth; UI đơn giản không được tạo ledger riêng.
- Invoice settlement vẫn qua Payment Entry/payment allocation canonical.

### 3.4 Pricing/Matrix

- Matrix metadata/runtime/pricing foundation đã được hội tụ vào main qua UI00–UI05.
- Các follow-up Matrix PR sau đó đã đóng không merge trong repo reset.
- Không dùng PR Matrix cũ làm current implementation truth; nếu mở wave mới phải audit Matrix code đang có trên main trước.

## 4. Business invariants Alumdoor

Các quyết định vận hành dưới đây vẫn là invariants cần bảo toàn trừ khi user chốt lại nghiệp vụ:

1. **Mua/nhập nhôm:** nhập và định giá theo **kg thực cân**.
2. **Sổ tồn kế toán nhôm nguyên liệu:** giữ theo **kg**.
3. **Tồn vật lý:** có thể theo dõi thêm mã nhôm, màu, tình trạng, khổ/chiều dài, số cây/lá, kho/lô để phục vụ vận hành.
4. **Trích sản xuất:** người dùng chọn theo khẩu độ/khổ và số cây/lá; không bắt quy đổi tay sang kg trong thao tác thường ngày.
5. **Bán cửa/thành phẩm:** giá có thể theo **m²**; phụ kiện theo Mét/Cái/Bộ/Cặp tùy Item/UOM.
6. Không biến hàng nhôm nguyên liệu thành stock-UOM `Bộ` chỉ để thuận UI.
7. Không tạo stock/GL/payment ledger giả khi import dữ liệu lịch sử hoặc projection.

## 5. Architecture boundaries

- Alumdoor là **reference vertical**, không fork Forge core.
- Generic primitive chứng minh tái sử dụng phải được đưa về platform/domain package phù hợp.
- Stock authority, accounting authority, permission authority và document lifecycle phải đi qua controller/kernel canonical.
- Generated metadata phải sửa ở source/compiler/generator, không patch generated output đơn lẻ nếu có nguồn sinh canonical.
- Tenant/organization/permission boundaries fail closed.

## 6. Production/release truth

- Workflow release chính hiện có trên main: `.github/workflows/alu-build-deploy.yml`.
- Tại thời điểm handoff, `main` vẫn còn `.github/workflows/deploy-ui-once.yml` và `.github/workflows/tmp-alumdoor-purchase-funding-release.yml` vì cleanup PR `#427` đã đóng không merge.
- Vì vậy không giả định cleanup workflow đã được áp dụng.
- Mọi production claim phải có exact release evidence; merge/closed PR không tự chứng minh production state.

## 7. Rule cho phiên sau

Nếu user mở một việc Alumdoor mới:

1. đọc `CURRENT_STATUS.md` và exact current `main`;
2. kiểm source/meta/runtime hiện tại trước khi tin handoff lịch sử;
3. search PR/branch cũ chỉ để tham khảo;
4. tạo branch mới cho task;
5. giữ UX xưởng đơn giản, nhưng không phá shared contract/authority của Forge;
6. UI-only theo policy release UI; backend/shared/migration/ops theo gate tương ứng.

Không có “việc đang chờ làm tiếp” mặc định trong handoff này. Task chỉ active khi user mở task mới.
