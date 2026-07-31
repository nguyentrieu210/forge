# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head trước docs handoff: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Sales-to-Production PR #131 merge: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Tiến Đạt purchase FIFO PR #134 merge: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Quy tắc giao hàng: `DELIVERY_POLICY.md`.

## Tiến Đạt purchase FIFO — DONE / MERGED

Yêu cầu đã có trên default:

- form chi tiết đặt nhôm hiển thị STT, ngày chứng từ, mã hàng, chiều dài, kg/m, số cây, kg barem, đơn giá, thành tiền, màu và dập/không dập;
- chỉ đọc Purchase Order và Purchase Receipt đã ghi sổ của đúng nhà cung cấp;
- khớp nghĩa vụ theo mã hàng + chiều dài + màu + trạng thái dập;
- phân bổ số cây nhận vào đơn có ngày xa nhất trước;
- mỗi dòng phiếu nhập nháp giữ liên kết `purchase_order` và diễn giải ngày đơn bị trừ;
- preview trả lịch sử phiếu nhập, số cây, số mét, kg barem, kg thực tế và số dư từng đơn;
- công nợ gồm số còn thiếu danh nghĩa và khoảng giao thêm hợp lệ theo dung sai;
- Tiến Đạt mặc định dung sai `5%` khi Supplier chưa khai riêng; cấu hình trên Supplier được ưu tiên;
- nhận vượt tổng số đặt cộng dung sai bị từ chối;
- dữ liệu lịch sử vượt capacity hoặc cùng quy cách có nhiều kg/m bị fail closed.

### Ví dụ đã khóa bằng regression

- Ngày 1: `200` cây AL71, `7.2 m`, `0.389 kg/m` → `560.16 kg` barem.
- Ngày 2: `100` cây → `280.08 kg` barem.
- Nhận `230` cây → phân bổ `200` cây vào ngày 1 và `30` cây vào ngày 2.
- Nợ danh nghĩa còn `70` cây = `504 m`.
- Dung sai cộng dồn `±15` cây → khoảng giao thêm hợp lệ `55–85` cây.
- Barem lần nhận: `644.184 kg`.

### Exact-head evidence PR #134

Head `39eb6f25b337dd3fc973bf2b7a9d6b0e7204a420`:

- CI `30666118057`: SUCCESS — tests, typecheck, build.
- PR Validation `30666118031`: SUCCESS.
- Purchase Feature CI `30666118118`: SUCCESS.
- UI Pull Request Validation `30666118096`: SUCCESS — browser QA, purchase allocation QA và cookie-auth smoke.
- Sales Feature CI `30666118049`: SUCCESS.
- Inventory and Manufacturing CI `30666118064`: SUCCESS.

Merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.

### File chính

- `server/apps-src/alumdoor-worker/src/purchase-fifo-receipt.ts`
- `server/apps-src/alumdoor-worker/src/entry.ts`
- `client/packages/views/src/form/ChildGridWithExtensions.tsx`
- `server/tests/tien-dat-purchase-fifo.test.mjs`

## Release boundary

- Không deploy Cloudflare trong đợt này.
- Không sửa secret hoặc DNS.
- Không thay đổi `purchase_allocation_rollout_state`; generic FIFO production vẫn disabled.
- Không mutate dữ liệu tenant production.
- App-level flow tạo Purchase Receipt nháp và theo dõi bằng chứng từ đã ghi sổ; authenticated acceptance với dữ liệu QA vẫn là bước tiếp theo.

## Hàng đợi nghiệp vụ

1. Purchase authenticated QA — `NEXT / CLEAN REBUILD`.
2. Finance — `QUEUED / REBUILD`.
3. Daily ledger — `QUEUED`.
4. Warranty / Capacity — `QUEUED`.
5. End-to-end acceptance — `QUEUED`.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- Generic FIFO production vẫn disabled.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
