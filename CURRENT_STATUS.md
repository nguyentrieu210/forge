# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `hotfix/child-grid-dropdown-scroll-20260731`.
- PR `#58`: `fix(ui): remove recent links and restore child-grid scroll`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp`, backup SQL hoặc generated artifacts.

## UI Link dropdown trong child table — đang ở PR, chưa deploy

### Lỗi production được báo

- Link dropdown vẫn có nhóm `Lựa chọn gần đây` và lưu lịch sử chọn vào localStorage.
- Khi dropdown mở trong child table, wheel bị giữ trong Radix portal. Dropdown chạm đầu/cuối nhưng vùng child grid gắn với ô Link không tiếp tục cuộn.

### Implementation

- `client/packages/controls/src/recent-links.ts`:
  - luôn trả danh sách rỗng;
  - không ghi lựa chọn mới;
  - dọn key `mf-recent-link:v2:<doctype>` cũ khi dropdown mở.
- `client/packages/ui/src/components/ui/popover.tsx`:
  - ưu tiên để dropdown tự cuộn khi còn khoảng cuộn;
  - khi dropdown chạm biên, tìm trigger đúng qua `aria-controls`;
  - chỉ relay wheel nếu trigger nằm trong `.mf-grid`;
  - tìm scroll ancestor từ trigger và cuộn đúng child grid;
  - xử lý cả event phát sinh trên phần tử con như SVG.
- `client/packages/ui/src/index.ts` export helper thuần `canConsumeScrollDelta`.
- `client/apps/demo/src/child-grid-dropdown-scroll-selfcheck.ts` kiểm đầu/giữa/cuối vùng cuộn và vùng không tràn.
- `client/apps/demo/package.json` đưa regression mới vào client selfcheck.

### Git

- Branch được mở từ default HEAD `602a820308e3edb1b9230a80c861f60719dee752`.
- Code head trước cập nhật handoff: `7e84c94f65374a071aa8be44ab14f943f72c5a7f`.
- PR `#58` hiện mở và mergeable theo lần kiểm gần nhất.
- Required workflows đã được kích hoạt; phải đọc exact final HEAD sau các commit handoff trước khi kết luận gate.

### An toàn

- Chưa merge PR `#58`.
- Chưa deploy Gateway hoặc tenant Worker.
- Không migration, không mutate D1, không sửa production secrets.
- FIFO vẫn disabled.

## Bán hàng production hiện hành

- Hotfix lọc Item bán trong child grid PR `#53` đã merge thành `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- Gateway release run `30630931291`, job `91156832579`: build, deploy, smoke và provider evidence **PASS**.
- Gateway version production: `dc6eada4-e4a1-451a-a92f-66fe04050707`.
- Tenant Worker production: `e15bc6ad-e343-49af-aa2f-c65d31c09fea`.
- Giá vẫn theo đúng `Bảng giá + Mặt hàng + ĐVT`; tồn preview theo Item + Kho + ĐVT qua `alumdoor.sales.item_context`.
- Functional browser smoke production cho picker và multi-UOM vẫn cần evidence riêng; endpoint smoke không thay thế browser acceptance.

## Các luồng khác

- Inventory/manufacturing, purchase/FIFO, RBAC và release automation không nằm trong phạm vi PR `#58`.
- Trước mọi merge/deploy của các luồng đó phải đọc PR body, exact-head CI và handoff hiện hành.
- Không merge hoặc deploy luồng khác nếu chưa có yêu cầu rõ.
