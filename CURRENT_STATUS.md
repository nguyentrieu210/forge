# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Audited default head: `f27d4c6efe37a0cca91e3f1672a199d33b09cbab`.
- Working branch: `docs/alumdoor-process-audit-20260801`.
- Audit source: `25.7 QUY TRÌNH.docx` supplied by the project owner.
- Audit report: `server/docs/ALUMDOOR-PROCESS-TRACEABILITY-AUDIT-20260801.md`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Whole-process verdict

**Chưa đạt quy trình end-to-end.**

Nền tảng documents/permissions/ledger, kho vật lý, BOM phiên bản, Work Order snapshot, mua hàng và bán hàng đã có nhiều phần chắc. Tuy nhiên, default hiện chưa chứng minh đủ luồng liên phòng ban trong tài liệu 25.7:

- chưa có màn theo dõi đơn hàng–xuất hàng trung tâm đủ cột/lệnh/trạng thái;
- chưa có orchestration đã chứng minh từ Sales Order sang lịch sản xuất, đơn sản xuất theo loại, lịch sơn và danh sách lỗi;
- chưa có lịch sản xuất cùng phép tính năng lực 8 giờ/tăng ca;
- chưa có sổ chi tiết chốt theo ngày với quyền sửa giới hạn sau cập nhật;
- Warranty Claim đã có nhưng nguyên nhân lỗi còn là dữ liệu tự do, chưa khóa đủ bốn nguyên nhân và hệ quả bảo hành/công nợ;
- finance/customer debt end-to-end chưa nằm trên default;
- operator UI/report cho physical stock, WIP, shortage, variance, scrap/offcut và Work Order progress vẫn ở draft PR `#82`;
- authenticated Purchase lifecycle QA vẫn ở draft PR `#103`.

Không được dùng điểm review cao của từng slice để tuyên bố toàn quy trình hoàn tất.

## Process compliance

- GitHub đã được dùng làm nguồn sự thật cho source, PR và provider evidence.
- `FORGE.md` và `.forge/manifest.json` đang **thiếu** trên default; onboarding pack là P0.
- Current default head `f27d4c...` không có workflow run/combined status được GitHub trả về; không được gọi current default là exact-head CI green.
- Default branch vẫn mang tên hotfix, và còn nhiều PR cũ/conflicted/backup/superseded đang mở.
- Audit branch chỉ thay đổi tài liệu; không deploy, không migrate, không sửa secrets/DNS và không mutate tenant data.

## Formula and manufacturing status

### Đã có bằng chứng tốt

- `server/apps-src/alumdoor-worker/src/slats.ts`:
  - allowance `0.13 m`;
  - divisors theo profile;
  - quyết định AL70 không trừ một lá;
  - công thức Úc với offset `2`, `1.5`, `1.3`;
  - làm tròn Úc về `0 / 0.3 / 0.7 / 1` theo chữ số thập phân đầu tiên.
- `server/apps-src/alumdoor-worker/src/door-formulas.ts` dùng `Cutting Policy` chung cho bán hàng, sản xuất và dự toán mua.
- PR `#49` đã merge canonical physical stock identity và warehouse roles.
- PR `#50` đã merge versioned BOM, immutable Work Order snapshot, production progress, offcut/scrap và exact reversal.

### Chưa hoàn tất

- `Cửa Siêu Trường` vẫn dùng policy tạm giống cửa Đức trong generator.
- AL70 khóa ngang/lỗ thoáng, ray-specific deduction, bộ ba lá đáy và đơn sản xuất đầy đủ chưa có acceptance end-to-end.
- Chưa có production schedule/capacity/overtime và painting queue lifecycle.
- PR `#82` vẫn draft vì endpoint/UI/operational reports chưa hoàn tất.

## Warranty / defects

- `Warranty Claim` đã có customer, supplier, item description, nguyên nhân, hướng xử lý, ngày trừ công nợ và trạng thái hai chiều.
- `issue_cause` hiện là `Data`, chưa phải danh mục bốn nguyên nhân bắt buộc.
- Chưa chứng minh:
  - bảo hành motor/bình lưu điện đúng một năm từ ngày giao;
  - người chịu trách nhiệm và kế toán tổng hợp xác nhận lỗi sản xuất;
  - posting/hold công nợ nhà cung cấp khi đang chờ đổi;
  - chi phí lỗi khách hàng theo công đoạn.

## Finance / detailed ledger

- Core GL/stock/payment ledgers là nền tảng authoritative.
- Finance AR/AP aging PR `#15` vẫn open draft, conflicted/stale và chưa nằm trên default.
- PR này cũng ghi rõ Payment Allocation, Party Statement, Debt Summary, Advance Balance và report navigation/UI chưa thuộc phạm vi đã hoàn tất.
- Chưa có daily detailed-ledger snapshot/update/freeze/amendment workflow theo vai trò kế toán tổng hợp, kế toán trưởng và giám đốc.

## Bán hàng — Unicode Item Price đã release đúng app Worker

### Feature

- PR `#91` đã squash-merge.
- Exact feature head: `c0d9df33a9fbde7540683107fd948c388a026682`.
- Merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Exact-head CI của feature đã PASS.
- Fix bao phủ Unicode NFC, exact-probe failure fallback và cùng canonical matching cho preview/save/submit.

### App Worker production release

- Release workflow PR `#100`; workflow-order fix PR `#102`.
- Lượt execution thành công: PR `#104`, đã đóng và không merge.
- Release run `30651057535`: SUCCESS.
- Release job `91224118455`: SUCCESS.
- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Production Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Deployment time: `2026-07-31T17:25:19.115Z`.
- Build, focused regression, Wrangler dry-run, live deploy, provider identity/namespace và bindings: PASS.

### Functional acceptance còn lại

- Cần authenticated Sales smoke trực tiếp để xác minh child grid tự điền `180000 VND`, Thành tiền và save-time authoritative pricing.
- Cần đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.

## Purchase/FIFO

- Purchase/FIFO backend và release safety đã có nhiều lớp bảo vệ.
- PR `#77` khóa write mode bằng approved checksum.
- FIFO rollout vẫn **disabled**.
- Authenticated PO → Receipt lifecycle QA là draft PR `#103`, chưa được tính là default acceptance.

## Gate hiện tại

- Whole-process work ở **G0/G1**: audit đã có, business decisions và acceptance contract chưa được chủ dự án duyệt.
- Không mở G2 implementation cho workflow toàn cõi trước khi chốt các quyết định trong audit.
- Các slice riêng chỉ được tiến lên G4/G5 khi CI xanh trên exact head và có staging journey tương ứng.

## Safety

- Audit chỉ thay đổi tài liệu.
- Không sửa production secrets hoặc DNS.
- Không thay đổi D1, KV hoặc dữ liệu nghiệp vụ.
- Không bật FIFO.
