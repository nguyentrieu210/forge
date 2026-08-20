# Forge / Alumdoor — hợp đồng làm việc cho agent

## Mở tối đa agent

Kho này **quá lớn để làm tuần tự**. Chủ dự án yêu cầu: **mở tối đa agent chạy song song**,
không hỏi xin phép từng lần. Đây là uỷ quyền thường trực cho repo này.

- Spawn nhiều agent cùng lúc, cho chạy nền, đừng chờ từng cái xong mới gọi cái tiếp theo.
- Việc chỉ đọc — dò mã, đối chiếu, đếm, rà quy ước đặt tên — fan-out thoải mái.
- **Agent có ghi file thì BẮT BUỘC làm trong worktree riêng.** Không phải chuyện lý thuyết:
  repo có script tự `git reset --hard origin/main` và xoá nhánh local, hai agent chung một
  cây làm việc là giẫm nhau và mất việc chưa commit.
- Cổng chặn vẫn giữ nguyên: agent KHÔNG tự chạy importer đụng D1, KHÔNG tự push, KHÔNG tự
  xoá nhánh. Song song là để làm nhanh, không phải để bỏ bảo hiểm.

## Nhánh — đã đổi hẳn từ 2026-08-20

**Chỉ còn MỘT nhánh: `main`.** Làm việc và base đều trên `main`.

Nhánh `agent-live` **đã bị xoá** khỏi origin cùng 81 nhánh khác. Bản chép duy nhất của 74
nhánh còn việc riêng nằm ở `work/nhanh-cu.bundle` — khôi phục một nhánh:

```
git fetch work\nhanh-cu.bundle refs/remotes/origin/TÊN:refs/heads/TÊN
```

Mọi hướng dẫn cũ kiểu "commit thẳng vào `agent-live`", "đừng merge `agent-live` vào `main`"
đều **hết hiệu lực**. Hai làn `redesign/ui-runtime` và `agent-live` đã gom vào `main`, kiểm
chứng bằng test alumdoor: 476→644 test, 55→54 lỗi, **0 lỗi mới do gom**.

## Live sync — hiện đang TẮT

`C:\alumdoor` từng là bản sao runtime của `origin/agent-live`: tác vụ `ForgeAlumdoorLiveSync`
poll 2 giây/lần rồi reset cây làm việc về đúng commit đó. Nhánh nguồn đã xoá, và tác vụ đó
hiện ở trạng thái **Disabled**.

Trước khi dùng lại bất kỳ lệnh `forge-live` nào, biết rằng **6 file còn ghim cứng tên nhánh
`agent-live`** (`scripts/live-sync/*.mjs`, `scripts/local-runner/forge-live.mjs`,
`install-forge-live-sync.ps1`, `forge-live.cmd`). Cả 6 đều đọc biến `FORGE_LIVE_BRANCH`
trước, nên đặt `FORGE_LIVE_BRANCH=main` là chạy được; không đặt thì trỏ vào nhánh chết.

## Nhập liệu

Đồng bộ mã nguồn và nhập liệu là hai chuyện tách rời. **Không bao giờ tự chạy importer chỉ
vì code đổi.**

Khi người dùng yêu cầu rõ một lần nhập liệu thật, dùng `forge-live apply <adapter>` — adapter
gồm `reason-master`, `item-master`, `uom`, `layer0`, `real-purchase`, `pricing`, `bom`,
`customer`. Giữ nguyên hợp đồng an toàn của importer: thẩm quyền local-only, khoá D1, backup
đã kiểm, hậu kiểm, idempotency, dọn dẹp. Đừng nới các cổng đó.

## Chỗ đang đỏ

`forge-live apply bom` **đang hỏng** (lần cuối 20/08 01:22, exit 1). Không phải lỗi code:
bảng ĐM còn viết mã cấu phần theo hệ mã CŨ trong khi danh mục Item đã đổi mã, nên **207/230
mã cấu phần không khớp Item nào** → cổng BOM đóng fail-closed với 570 blocker.

Ví dụ: ĐM ghi `NVL-TOLE1.2x190-CORON`, vật tư thật giờ tên `RAY-TOLE1.2X190-RON`. Lệch cùng
lúc tiền tố nhóm, hoa/thường, và chữ "CÓ". `alumdoor-source-code-resolver.mjs` chỉ xử lý phép
rút gọn dấu cách, chưa xử lý đổi tiền tố nhóm.

Trong 207 mã: 109 mã khớp duy nhất một Item (nạp bằng bằng chứng được), 10 mã mơ hồ, **88 mã
phải người quyết**. Đừng đoán 88 mã đó — đoán mã hàng là đoán xem một dòng định mức nói về
vật tư nào, sai là ra sai vật tư trong BOM mà không có gì báo.
