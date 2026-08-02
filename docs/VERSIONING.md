# FORGE VERSIONING

## 1. Product version

`package.json` ở root là **Forge product/integration version**. Đây là version dùng để đánh dấu các mốc kiến trúc và mức hoàn thiện của toàn monorepo.

Hiện tại: **Forge 0.2.0**.

Forge vẫn ở `0.x` vì North Star chưa đạt business-complete ở toàn bộ ERP core/enterprise depth. Không dùng version lớn để thay cho maturity evidence.

## 2. Component versions

Các component có release line riêng và **không bắt buộc bằng root version**:

- `server/package.json` = CloudForge backend/kernel component version.
- `client/package.json` = MetaForge frontend/runtime component version.
- first-party apps như HRM, VN Accounting, Website, Alumdoor có version trong manifest/brief/package riêng.

Không bump component version chỉ để làm số đẹp. Chỉ bump khi contract/source của component đó thực sự thay đổi.

## 3. SemVer policy cho root Forge

- `PATCH` (`0.2.1`): sửa lỗi/cleanup không mở capability family mới và không đổi product contract lớn.
- `MINOR` (`0.3.0`): thêm một wave/capability family đáng kể, thay đổi kiến trúc tích hợp có kiểm soát hoặc nâng maturity tổng thể rõ ràng.
- `1.0.0`: chỉ khi L0 Platform và L1 ERP Core đạt exit criteria trong `docs/FORGE_ENTERPRISE_NORTH_STAR.md`, release gates có evidence và migration/onboarding đủ để coi là product baseline ổn định.

## 4. Version không đồng nghĩa deploy

Bump source version, merge source và production deploy là ba hành động khác nhau.

Một version chỉ được gọi là **production release** khi có:

1. exact source SHA;
2. required verification theo risk class;
3. migration/backup evidence nếu có;
4. release/deploy evidence đúng SHA;
5. production smoke/release marker nếu deploy;
6. không có blocker CRITICAL chưa xử lý trong scope công bố.

Nếu chưa có các bằng chứng trên thì gọi là **source baseline** hoặc **release candidate**, không gọi production live.

## 5. Mốc 0.2.0

Forge 0.2.0 là **Enterprise Parallel Baseline**:

- Enterprise North Star + capability map trở thành kim chỉ nam chính thức.
- Multi-agent board/protocol/prompt trở thành cơ chế điều phối chuẩn.
- 18 workstream có branch ownership rõ để audit/implementation song song.
- Stale/superseded PR được đóng dần để giảm nhầm nguồn sự thật.
- Alumdoor được định vị là reference vertical, không phải fork của Forge core.

0.2.0 **không tuyên bố** ERP parity với MISA/ERPNext và không tự động cấp quyền deploy production.
