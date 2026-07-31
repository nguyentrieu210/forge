# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt PR #81 Meta workspace

1. Lấy exact final head sau commit handoff cuối.
2. Kiểm toàn bộ workflow bắt buộc trên đúng SHA:
   - CI;
   - PR Validation;
   - UI Pull Request Validation;
   - Sales Feature CI;
   - Purchase Feature CI;
   - Inventory and Manufacturing CI.
3. Không chuyển PR khỏi draft nếu lint/test/typecheck/build hoặc browser QA chưa PASS.
4. Kiểm browser desktop/mobile/collapsed sidebar:
   - sidebar chỉ chứa phân hệ;
   - tab đầu Quy trình, tab hai Tổng quan, tab sau là DocType;
   - list/form/kanban giữ đúng tab Công việc active;
   - process flow cuộn ngang, không làm tràn viewport;
   - modal Tạo công việc mở draft mới, không mở TASK-0001;
   - modal DocType mới mở `blankDocType()`;
   - query `?new=1` được xóa khi chuyển sang tab quản lý;
   - Command Palette vẫn truy cập toàn bộ route.
5. Kiểm PR conflict-free sau khi GitHub tính lại mergeability.
6. Cập nhật PR body bằng exact final head và kết quả CI.

## P1 — nâng workspace metadata sang LiveApp

1. Thiết kế metadata runtime từ application catalog/manifest thay vì hard-code demo.
2. Khai báo route và permission thật cho DocType/Workflow/Print Format/Dashboard builder.
3. Không hiện module Meta nếu user không có quyền hoặc route chưa tồn tại.
4. Giữ Command Palette và business context hoạt động trên toàn bộ module.
5. Bổ sung authenticated smoke cho live navigation.

## P1 — chất lượng UI tiếp theo

- Derive số liệu Báo cáo tổng quan Meta từ runtime data thay vì số mock.
- Thêm overflow menu cho thanh tab khi màn hình rất hẹp.
- Lưu module/tab gần nhất theo app/user nếu route không chỉ rõ.
- Nâng workspace primitive vào `@metaforge/shell` sau khi prototype được duyệt.

## P0 — authenticated functional smoke cho hotfix giá bán

1. Đăng nhập bằng tài khoản thử phù hợp.
2. Mở Sales Order mới và chọn `Giá niêm yết` + `TRỤC 114_1.8LY`.
3. Xác minh ĐVT `Mét`, đơn giá `180000 VND`, thành tiền và không lấy chéo UOM.
4. Lưu rồi huỷ/xoá chứng từ thử an toàn.
5. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## P0 — production smoke read-only

- Chỉ dùng workflow `Cloudflare Production Smoke Observation`.
- Xác nhận health `200`, root `200`, guest boot `403`, job success và artifact evidence.
- Không deploy Cloudflare chỉ để chạy smoke.

## Purchase/FIFO activation gates

- Read-only readiness trên staging/sanitized copy.
- `unresolved_count=0`, checksum/counts được review.
- Staging execute dùng exact approved checksum, rollout giữ `enabled=0`.
- Production activation chỉ sau explicit approval riêng.

## Không được làm

- Không deploy Cloudflare trong PR UI nếu chưa được yêu cầu rõ.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1 trong observation workflow.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
