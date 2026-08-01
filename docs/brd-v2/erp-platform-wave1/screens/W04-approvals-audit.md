# W04 — Hộp duyệt & kiểm toán

## Khối 1 — Định danh

- Route: `/security/approvals-audit`; deep-link `/approvals/:id`, `/audit/:entity/:id`.
- Tác nhân: Approver/Delegate, Domain Manager, Auditor, Owner.
- Dữ liệu: Approval Task/Event, Audit Event, Document Version, Notification, Legal Hold.

## Khối 2 — Layout desktop/mobile

- Desktop: ba cột queue → document preview/diff → context rule/SoD/audit; queue mode tự mở phiếu kế sau hành động.
- Mobile: card queue → full document → bottom action sheet; lý do và hậu quả hiện trước nút duyệt/từ chối.
- Filter giữ sau back; hàng dài cursor/virtualize; audit diff tải theo đoạn, export là job nền có progress.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Approval board theo pending/escalated/approved/rejected; audit không Kanban. |
| #8 AI | Tóm tắt phiếu, nêu rule/điểm bất thường và nguồn; không đề xuất như quyết định cuối, không bấm duyệt. |
| #18 Vòng đời | Task `pending→approved/rejected/escalated/expired`; audit append-only; legal hold `active→released`. |
| #2 Xóa | Không xóa approval/audit; notification được archive, không làm mất evidence. |
| #4 Báo cáo | SLA duyệt, bottleneck, self-approval attempt, export/access anomaly; drill-down. |
| #5+#12 Thông báo | In-app + email/Zalo theo T-7/T-3/T-1/SLA; dedupe; không Web Push. |
| #6 Barcode | Không áp dụng. |
| #10 Media/QR/OCR | Preview tệp bằng chứng theo permission; hash/checksum hiển thị, không cho sửa file posted. |
| #11 In | Evidence pack PDF/ZIP có manifest/hash và watermark. |
| #13 Mã tự động | Approval/audit/correlation ID server cấp. |
| #14 Lịch | Calendar deadline/delegation/escalation. |
| #15 Tiện ích VN | Queue mode, phím j/k/Enter/a/r, recent records, ngày tương đối, badge “Chờ duyệt (N)”. |
| #19 Master data | Approval policy/reason/escalation rule là master versioned. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `ApprovalQueueDesktop` / `ApprovalCardsMobile` | sort SLA/amount/risk, bulk chỉ cho action an toàn | effective approver |
| `DocumentPreviewDiff` | source data, before/after, linked docs, amount masked | approver theo task |
| `RuleSoDContext` | policy version, approver path, conflicts, delegation | approver/auditor |
| `AuditTimeline` | immutable event + correlation + actor | Auditor; domain timeline theo field mask |
| `EvidenceExportJob` | chọn phạm vi, progress, private download TTL | Auditor/Owner |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Duyệt/từ chối | task pending, document version, effective approver, SoD | append event; mở phiếu kế; lỗi version có diff |
| Yêu cầu bổ sung | comment bắt buộc + route về creator | task returned, notification dedupe |
| Escalate | SLA/policy | task mới đúng cấp, task cũ đóng |
| Legal hold/release | Auditor + reason + approval | artifact bị chặn purge; audit riêng |
| Export evidence | filter, mask, rate limit | job nền, private link, export audit |

## Khối 5 — Autofill

- Queue mặc định “của tôi, sắp quá hạn trước”; nhớ filter theo user.
- Lý do template theo action nhưng luôn sửa được; không ghi đè nội dung đã dirty.
- Export prefill entity/time range từ màn đang xem và ghi provenance.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton ba cột/card; preview tải cục bộ. |
| Chưa có dữ liệu | “Không có phiếu chờ duyệt”, link lịch sử nếu có quyền. |
| Lọc không ra | Xóa filter và giữ tab. |
| Error | Khối lỗi đúng cột; export job lỗi có retry và mã tra cứu. |
| Thiếu quyền | Không trả document/audit fields; nêu người quản trị quyền. |
| Saved/success | Dòng biến mất/highlight ở lịch sử, toast có “Hoàn tác” chỉ khi workflow cho phép. |
| Mạng gián đoạn | Không cho duyệt/export; giữ comment draft; không queue/PWA. |
