# W12 — Sẵn sàng vận hành & release

## Khối 1 — Định danh

- Route: `/operations/readiness`; route con `/backups`, `/verification`, `/releases`, `/incidents`, `/performance`.
- Tác nhân: Platform Operator, Release Manager, Auditor, Tenant Owner read-only summary.
- Dữ liệu: Backup Snapshot, Restore Rehearsal, Verification Run, Release Candidate, Incident Record, SLO metric/read model.

## Khối 2 — Layout desktop/mobile

- Desktop: readiness dashboard có gate cards; backup timeline/restore detail; test/oracle matrix; release diff/canary cohort; SLO và incident panel.
- Mobile: status cards và approval/rollback actions khẩn; log lớn chỉ hiển thị summary + private artifact, không nhồi desktop table.
- Mọi KPI có `as_of`, so kỳ và drill-down evidence; metrics không thay canonical audit/ledger; job có progress thật.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Release `candidate→verified→canary→released/rolled_back`; incident board theo SEV/status. |
| #8 AI | Tóm tắt log/evidence và gợi ý runbook có nguồn; không deploy/rollback/restore tự động. |
| #18 Vòng đời | Backup/run/release/incident state machines như Entity Catalog; state action server-only. |
| #2 Xóa | Evidence/release/incident/audit không xóa; backup expire theo retention + legal hold. |
| #4 Báo cáo | SLO, error budget, test/oracle pass, restore RPO/RTO, release failure/MTTR; drill-down 100%. |
| #5+#12 Thông báo | In-app/email/Zalo cho backup/test/release/SEV; escalation/dedupe; không Web Push. |
| #6 Barcode | Không áp dụng. |
| #10 Media/QR/OCR | Evidence/log/export R2 private có checksum; không OCR. |
| #11 In | Release evidence, restore certificate, incident PIR PDF/ZIP manifest. |
| #13 Mã tự động | Snapshot/run/release/incident code + correlation ID server cấp. |
| #14 Lịch | Backup/restore drill/release window/certificate expiry/on-call schedule. |
| #15 Tiện ích VN | Ngày tương đối, badge gate đỏ, action ngay trong cảnh báo, recent releases/incidents, settings search. |
| #19 Master data | Suite registry, gate policy, RPO/RTO, cohort, retention, severity/runbook versioned; không hardcode. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `ReadinessGateBoard` | code/test/oracle/security/perf/restore/reconcile status + evidence | operator/release/auditor |
| `BackupRestoreTimeline` | snapshot/checksum/retention/rehearsal/RPO-RTO | Operator; Auditor read |
| `VerificationMatrix` | suite×SHA×environment×result, rerun links | Verifier/Release Manager |
| `ReleaseCanaryPanel` | diff/migration/cohort/SLO/business invariant/rollback | Release Manager/Operator |
| `IncidentSLOPanel` | SEV/timeline/blast radius/actions/PIR | Operator/Auditor |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Tạo backup/rehearse restore | đúng customer DB, private target clone, checksum | evidence RPO/RTO; mismatch blocks certify |
| Chạy/rerun verify | immutable SHA, suite registry, isolated env | result/evidence; rerun không ghi đè run cũ |
| Tạo candidate/canary/rollout | manifest, backup, all required gates green | cohort status + audit |
| Pause/rollback | threshold/incident/recent-auth, artifact compatible | traffic/release state changed + reconciliation |
| Mở/đóng incident | SEV, scope, release, evidence; close cần reconcile green | timeline/PIR/action items |

## Khối 5 — Autofill

- Candidate prefill commit SHA/manifest/version từ release pipeline; người dùng không sửa SHA sau tạo.
- Gate summary tính từ Verification Run thật; không cho đánh dấu tay pass.
- Incident prefill release/tenant/correlation/metric từ alert; operator xác nhận severity/scope.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton gates/timeline; progress job theo bước. |
| Chưa có dữ liệu | CTA chạy verify/backup đầu tiên; không hiển thị “healthy” giả. |
| Lọc không ra | Xóa filter SHA/env/status. |
| Error | Gate/job/provider lỗi riêng, correlation ID + retry/runbook. |
| Thiếu quyền | Tenant Owner chỉ summary; artifact/log private trả 403. |
| Saved/success | Gate/release/incident highlight, toast có Xem evidence. |
| Mạng gián đoạn | Không deploy/rollback/restore; dashboard báo stale `as_of`; không queue/PWA. |
