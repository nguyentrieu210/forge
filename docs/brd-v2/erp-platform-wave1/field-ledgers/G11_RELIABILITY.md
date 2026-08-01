# Field Ledger — G11 Reliability, backup và release

## Backup Snapshot

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| snapshot_code | payload Data | series | unique | `BKP-.YYYYMMDD.-.#####` | system/readonly | Operator/Auditor | immutable | mã snapshot |
| customer_db_uuid | payload Data | NOT NULL | tenant index | binding resolved fail-closed | system/readonly | Operator; mask role thấp | immutable | DB nguồn |
| schema_version | payload Data | NOT NULL | compatibility index | installed migration version | system/readonly | Operator/Auditor | immutable | schema |
| r2_key | payload Data | NULL | unique | private prefix/tenant | system/readonly | Operator only | immutable after success | artifact |
| checksum | payload Data | NULL | unique/hash | SHA-256 verified | system/readonly | Operator/Auditor | immutable | toàn vẹn |
| started_at | payload Datetime | NOT NULL | time index | server time | system/readonly | Operator | immutable | bắt đầu |
| completed_at | payload Datetime | NULL | time index | >= started | system/readonly | Operator | set on terminal | kết thúc |
| retention_until | payload Date | NOT NULL | cleanup index | policy-computed | system/readonly | Operator | expiry action only | giữ đến |
| status | payload Select | Running | index | Running/Succeeded/Failed/Expired/Quarantined | workflow/readonly | system/operator | Running→Succeeded/Failed/Quarantined; Succeeded→Expired | vòng đời |

## Restore Rehearsal

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| rehearsal_code | payload Data | series | unique | `RST-.YYYY.-.#####` | system/readonly | Operator/Auditor | immutable | mã diễn tập |
| snapshot | payload Link Backup Snapshot | NOT NULL | FK | succeeded/not expired | link/set-once | Operator | immutable | nguồn |
| target_clone | payload Data | NOT NULL | unique | cannot equal production binding | system/set-once | Operator | immutable | clone đích |
| started_at | payload Datetime | NOT NULL | time index | server time | system/readonly | Operator | immutable | bắt đầu |
| rto_seconds | payload Int | 0 | SLO query | >=0 | formula/readonly | Operator/Auditor | terminal result | RTO thực tế |
| reconciliation_json | payload JSON | `{}` | evidence | count/hash/ledger/report schema | system/readonly | Operator/Auditor | immutable after verify | kết quả đối soát |
| certified_by | payload Link User | NULL | index | Auditor khác Operator | workflow/readonly | Auditor | set once | người chứng nhận |
| status | payload Select | Draft | index | Draft/Restoring/Verifying/Passed/Failed/Certified | workflow/readonly | action-specific | Draft→Restoring→Verifying→Passed/Failed; Passed→Certified | vòng đời |

## Verification Run

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| run_code | payload Data | series | unique | `VERIFY-.#####` | system/readonly | CI/Verifier | immutable | mã run |
| commit_sha | payload Data | NOT NULL | index | full git SHA | system/set-once | all release roles | immutable | mã nguồn |
| suite | payload Select | NOT NULL | required-suite index | Unit/Integration/E2E/Oracle/Security/Performance/Restore | system/set-once | CI/Verifier | immutable | bộ kiểm tra |
| started_at | payload Datetime | NOT NULL | time index | server time | system/readonly | release roles | immutable | bắt đầu |
| completed_at | payload Datetime | NULL | time index | >= started | system/readonly | release roles | terminal | kết thúc |
| evidence_key | payload Data | NULL | R2 link | private/checksum | system/readonly | release roles/Auditor | immutable after finish | bằng chứng |
| result_summary_json | payload JSON | `{}` | gate query | suite schema | system/readonly | release roles | immutable after finish | kết quả |
| status | payload Select | Running | index | Running/Passed/Failed/Cancelled | workflow/readonly | CI/Verifier | Running→Passed/Failed/Cancelled | vòng đời |

## Release Candidate

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| version | payload Data | NOT NULL | unique | semver | user/set-once | Release Manager | immutable | phiên bản |
| commit_sha | payload Data | NOT NULL | unique version+SHA | full git SHA | user/set-once | Release Manager | immutable | source |
| manifest_hash | payload Data | NOT NULL | evidence | canonical SHA-256 | formula/readonly | Release/Auditor | immutable | gói cài |
| required_suites_json | payload JSON | NOT NULL | gate query | suite registry | user/set-once | Release Manager | locked after verify starts | cổng bắt buộc |
| gate_summary_json | payload JSON | `{}` | gate query | all required results same SHA | formula/readonly | Release/Auditor | refreshed before transitions | tổng cổng |
| backup_snapshot | payload Link Backup Snapshot | NULL | FK | succeeded/checksum | workflow/readonly | Operator/Auditor | required before canary | backup |
| canary_scope_json | payload JSON | `{}` | rollout index | bounded tenant cohort | user/set-once | Release Manager | immutable after canary | cohort |
| status | payload Select | Draft | index | Draft/Verified/Canary/Released/Rolled Back/Blocked | workflow/readonly | action-specific | Draft→Verified→Canary→Released; any→Blocked; Canary/Released→Rolled Back | vòng đời |

## Incident Record

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| incident_code | payload Data | series | unique | `INC-.YYYY.-.#####` | system/readonly | Operator | immutable | mã sự cố |
| severity | payload Select | SEV3 | priority index | SEV1/SEV2/SEV3/SEV4 | user/editable | Operator/Commander | changes need reason | mức độ |
| title | payload Data | NOT NULL | search/title | 3–200 | user/editable | Operator | editable with history | tiêu đề |
| started_at | payload Datetime | NOT NULL | time index | server time/observed | user/set-once | Operator | immutable | bắt đầu |
| affected_scope_json | payload JSON | `{}` | scope index | tenant/module/release schema | user/editable | Operator; tenant ids masked | history on change | phạm vi |
| release_candidate | payload Link Release Candidate | NULL | lineage | deployed/canary candidate | link/set-once | Operator | immutable after close | release liên quan |
| rollback_ref | payload Data | NULL | lineage | action/commit evidence | system/readonly | Operator/Auditor | immutable | hành động phục hồi |
| reconciliation_json | payload JSON | `{}` | close gate | domain invariant schema | system/readonly | Operator/Auditor | must pass before resolved | an toàn dữ liệu |
| resolved_at | payload Datetime | NULL | time index | >= started | workflow/readonly | Commander | terminal | kết thúc |
| status | payload Select | Open | index | Open/Investigating/Mitigated/Monitoring/Resolved/Closed | workflow/readonly | Commander | Open→Investigating→Mitigated→Monitoring→Resolved→Closed; regress→Investigating | vòng đời |

## State machines G11

- Backup: `Running → Succeeded/Failed/Quarantined`; successful snapshot hết retention thành `Expired`, không xóa evidence trước retention/legal hold.
- Restore: `Draft → Restoring → Verifying → Passed/Failed`; chỉ Auditor khác Operator chuyển `Passed → Certified`.
- Verification: `Running → Passed/Failed/Cancelled`; result immutable theo commit/suite.
- Release: `Draft → Verified → Canary → Released`; gate đỏ vào `Blocked`; `Canary/Released → Rolled Back` tự mở Incident.
- Incident: `Open → Investigating → Mitigated → Monitoring → Resolved → Closed`; chỉ close khi reconciliation xanh và action items có owner.
