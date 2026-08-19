# Bộ kiểm tầng thiết kế (không cần backend)

Trang tĩnh nạp đúng bundle CSS đã build, để soi các mặt thị giác mà không phải dựng
worker + proxy + đăng nhập.

Lý do tồn tại: `wrangler dev` ở máy Windows này hay tự thoát sau một hai phút
(`InspectorProxyWorker` crash), nên mọi lần muốn nhìn một thay đổi CSS lại phải dựng lại
cả stack. Thay đổi CSS thì không cần backend để kiểm.

    cd client && pnpm build
    cp apps/runtime/dist/assets/index-*.css e2e-forge/design-harness/forge.css
    # mở e2e-forge/design-harness/index.html

Đổi `data-theme="dark"` trên `<html>` để xem bản tối; đổi `data-brand` để xem brand khác.

KHÔNG thay cho việc soi trên app thật: trang này chỉ dựng markup đại diện, không chạy
React, không có dữ liệu thật. Dùng nó để bắt lỗi màu/khoảng cách/hình dạng sớm, rồi vẫn
phải xác nhận lại trên Desk khi thay đổi chạm hành vi.
