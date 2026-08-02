# CHANGELOG

## 0.2.0 — Enterprise Parallel Baseline — 2026-08-03

### Added

- Forge Enterprise Completion Skill.
- Enterprise North Star và capability map có ID ổn định.
- Parallel Agent Board, execution protocol và prompt chuẩn.
- 18 workstream branch cho architecture/kernel, finance/VN, CRM, procurement, inventory/WMS, manufacturing/QMS, HCM/payroll, project/service, BI/AI, BPM/App Factory, integrations, security/SaaS, SRE/data safety, migration/implementation, frontend/mobile, workplace/DMS, logistics/POS/commerce và Alumdoor reference vertical.
- Product versioning policy cho monorepo Forge.

### Changed

- Root Forge product/integration version: `0.1.0` -> `0.2.0`.
- Enterprise completion được đo bằng capability maturity/evidence thay vì số màn hình/module.
- Parallel development dùng explicit branch ownership và dependency requests thay vì nhiều agent cùng sửa shared hotspots.

### Cleanup

- PR coordination #293 merged vào `main`.
- Đóng các PR stale/superseded/temporary đã xác định rõ: #224, #248, #256, #257, #259, #285.
- Giữ các PR substantive chưa supersede để agent owner audit/cherry-pick/rebase theo exact state thay vì xóa mất lịch sử có giá trị.

### Release boundary

Đây là **source baseline**, không phải xác nhận production release. Không production migration/deploy/secret/DNS/customer-data mutation chỉ vì version được bump.
