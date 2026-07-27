# Nguồn tham chiếu — KHÔNG code lại ở đó

`C:\Forge` là bản **duy nhất còn phát triển**. Hai thư mục dưới đây là nguồn gốc, giữ lại chỉ để
**tra cứu và đối chiếu**. Sửa code ở đó sẽ không đi tới đâu: không có đường nào merge ngược về Forge.

| Thư mục | Vai trò | Trạng thái so với Forge |
|---|---|---|
| `C:\MetaForge` | FE meta-driven gốc | 468/500 file trùng · 10 file **Forge mới hơn** · 22 file chỉ có ở đó |
| `C:\CloudForge` | Kernel Cloudflare gốc | 439/483 trùng · 44 file **Forge mới hơn** · **0** file riêng |

Đối chiếu chạy ngày 2026-07-27, so theo nội dung (bỏ qua khác biệt CRLF/LF, `node_modules`, `dist`).

## Đã cứu sang Forge

- `client/.env.live.local` — token API site test trên VPS 222 (đã xoay ngày 2026-07-24 sau P0-SEC-01).
  Gitignored. Đây là thứ **không tạo lại được** nếu xoá thư mục cũ.
- `client/apps/demo/video-tools/quay-video.mjs` + `ghep-video.mjs` — bộ quay và dựng video demo 9 cảnh.

19 file còn lại chỉ có ở `C:\MetaForge` là rác gỡ lỗi (`diag*.mjs`, ảnh chụp màn hình, `test-results`).

## Lưu ý về ngày 26/07

Có lúc tưởng đã sửa vài màn app Kho hôm 26/07. Quét toàn ổ C cho thấy **0 file `*Screen.tsx` được ghi
trong ngày đó**, ở bất kỳ đâu; mã nguồn `kho`/`kho-vn` ở hai cây **trùng khớp từng byte**. Thứ duy nhất
động vào là `C:\MetaForge\apps\kho-vn\dist\` lúc 09:23 — kết quả build từ nguồn không đổi.

Nếu về sau phát hiện thiếu thật, hai thư mục cũ vẫn còn nguyên để đối chiếu — đó là lý do chưa xoá.
