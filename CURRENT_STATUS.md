# CURRENT STATUS

Ngày cập nhật: **2026-08-03**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Không hardcode exact current `main` vào status dài hạn; phải đọc GitHub khi bắt đầu/tiếp tục.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Forge product/integration baseline: **0.2.0 — Enterprise Parallel Baseline**.
- Component versioning độc lập theo `docs/VERSIONING.md`; bump root version không đồng nghĩa production deploy.
- Warehouse Cash Alumdoor merge checkpoint: `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.

## DONE — Enterprise North Star + parallel execution baseline

- Enterprise Completion Skill, North Star và capability map đã merge vào `main`; đây là chuẩn để audit/ưu tiên/đóng capability theo `Missing/Foundation/Wired/RC/Hardened`.
- Parallel Agent Board/Protocol/Prompts đã merge qua PR `#293` và canonical location là `main/docs/agents/`.
- 18 branch `agent/ent-00-*` tới `agent/ent-17-*` chia ownership architecture/kernel, ERP domains, BI/AI, BPM/App Factory, integrations, security/SaaS, SRE, frontend/mobile, migration và Alumdoor reference vertical.
- Cleanup baseline đã đóng các PR temporary/superseded rõ ràng `#224`, `#248`, `#256`, `#257`, `#259`, `#285`; branch/history vẫn giữ để agent audit/reuse/cherry-pick khi cần.
- Các substantive legacy PR còn mở không tự động là canonical; workstream owner phải phân loại `reuse/cherry-pick/superseded/reject` bằng exact diff + evidence.
- Alumdoor được định vị là reference vertical chạy trên Forge, không fork core; primitive generic phải được kéo xuống platform/domain package khi chứng minh tái sử dụng.

## DONE — HRM operational 1.5

- Canonical PR `#261` đã squash-merge vào `main` tại `b3dc2cf59ec5c85a977833da6edc986ac1bfe6fb`; PR `#253` là stale/diverged iteration đã đóng superseded.
- HRM đã mở rộng xuyên suốt tuyển dụng, hire-to-retire, nghỉ phép, ca/check-in/chấm công/tăng ca, payroll input, tạm ứng/công tác, mục tiêu/đánh giá và đào tạo.
- Payroll giữ canonical `SalarySlipController -> PayrollEntryController -> GL`; không tạo payroll/accounting ledger cạnh tranh.
- Generated Salary Slip có salary assignment luôn recompute authoritative inputs khi save/submit; submitted slip khóa các nguồn Attendance/Leave/OT/Salary Assignment/Additional Salary đã dùng cho tới correction bằng cancel/amendment/rerun.
- `VN Payroll Rule` được effective-date validate và trace `rule_code`, văn bản pháp lý, source URL, approval metadata, SHA-256 của canonical `formula_json`; migration `0041` khóa update/delete/disable/record-type mutation sau khi rule đã được dùng.
- Migrations `0039-0041` giữ tenant-scoped/race-safe overlap, duplicate, payroll-source freeze và payroll-rule integrity.
- Validation trên application blobs đã merge: isolated TypeScript strict PASS; HRM operational regressions 4/4 PASS; migrations `0035+0039+0040+0041` acceptance PASS; Python migration syntax PASS; metadata JSON 44/44 PASS. GitHub development CI = N/A theo policy hiện hành vì Actions chỉ dùng build/deploy.
- Không production deploy/migration trong task HRM này.
- Boundary còn lại: `formula_json` là versioned/audited legal-rule evidence, chưa phải statutory PIT/BHXH evaluator. Nếu cần tự động hóa luật Việt Nam phải làm task CRITICAL riêng với schema công thức explicit, effective versions, nguồn chính thức và regression pháp lý.

## ACTIVE — VN Accounting Period Integrity Hardening r8

- Canonical branch: `fix/vn-accounting-period-integrity-20260803-r8`, clean-based on current `main@560c7cfc140f04e5ca555c87dfa31541c8867ec1` sau khi main thay đổi handoff/process docs.
- Migration accounting dùng số kế tiếp `0042_vn_accounting_period_hardening.sql`; không đụng lại HRM migrations `0039-0041`.
- Hard Locked chặn submit, cancel và payload scope move vào/ra kỳ khóa. Soft Closed chỉ cho approved adjustment khi period bật `allow_approved_adjustments` và chứng từ có reason + approver.
- Accounting period chặn invalid range và overlap theo tenant/company/branch; company-wide period conflict với branch period cùng khoảng ngày.
- Guard bao phủ Journal/Invoice/Payment, Purchase Receipt, Delivery Note, Payroll, Stock Entry/Reconciliation và Warehouse Cash Voucher/Transfer.
- Regression riêng `server/scripts/test-vn-accounting-period-hardening.py` replay `0035+0039+0040+0041+0042`, giữ acceptance HRM hiện có độc lập.
- Targeted SQLite regression của logic `0042` đã PASS trong session cho legacy-trigger replacement, hard/soft close, draft->submit, cancel, move-in/move-out, tenant isolation, range/overlap/update-overlap và expanded posting doctypes.
- Full exact regression script, Python syntax và relevant backend/typecheck/lint/build trên full checkout chưa có evidence vì shell hiện không có repository checkout/dependencies và DNS tới GitHub. Chưa mở PR, chưa merge, chưa production migration/deploy.

## DONE — exact production release evidence

- `server/scripts/stage-client-bundle.mjs` ghi public `release.json` khi có release SHA; marker chứa `releaseSha` + `bundleHash`, không chứa secret.
- `ALU Build and Deploy` smoke yêu cầu `/health` và `/release.json`; fail nếu production `releaseSha` khác `TARGET_SHA`.
- Canonical merge checkpoint: `a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.

## ACTIVE — fast UI auto deploy

- Working branch: `fix/ui-deploy-fastpath-20260802`, clean-based on exact `main@a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- UI deploy chỉ trigger trên `push` của `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*`, `refactor/ui-*` khi có `client/**`; không còn `pull_request` deploy trigger.
- Checkout dùng `fetch-depth: 2`, không fetch toàn bộ history/main.
- Scope guard đọc file từ push event; không còn stale-main ancestor check gây fail chỉ vì `main` tiến lên sau khi branch UI được mở.
- Build chỉ dependency graph của `runtime` + warehouse mobile bundle cần cho Gateway; không build toàn 18/19 MetaForge workspace project.
- Push mới cùng UI branch cancel run cũ để tránh queue/deploy artifact cũ.
- Production proof vẫn bắt buộc `/health` + `/release.json` đúng SHA/hash.
- Chưa có production run mới của fast path này; cần một UI push thực tế sau merge để chốt performance/e2e evidence.

## DONE — Website/CMS multi-tenant v1

- Canonical PR `#254` đã squash-merge vào `main` tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- First-party `website` app gồm Website Settings, Web Page, Web Page Block, roles và version-pinned template/theme presets.
- Public API chỉ allowlist `forge.website.manifest` và `forge.website.page`; Guest không có generic DocType read; mọi Website query bind trusted tenant context; draft/unpublished fail closed.
- Shared runtime render `/` và one-segment slug, giữ nguyên reserved Forge runtime modes; product grid reuse canonical Storefront public API.
- Mobile navigation fix đã targeted regression bằng Chromium trên final blob `82e25b446885b8719340a38013c801135e2a52c2`: mobile 390x844 PASS, tablet 834x1112 PASS, desktop 1440x1000 PASS.

## DONE — GitHub build/deploy only

- GitHub Actions không còn là CI phát triển; validation chạy local theo blast radius.
- Một workflow `ALU Build and Deploy` là release pipeline duy nhất.
- Full ALU release vẫn manual với confirm `alu`: build once -> backup/migrate -> Tenant -> Alumdoor App -> Gateway -> exact-release smoke.

## DONE — Minimal risk-based gates

- Canonical PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL` trong historical process docs trước khi main dọn process files; accounting/migration vẫn được xử lý theo mức CRITICAL trong session này.

## DONE — Alumdoor Warehouse Cash integration

- Canonical delivery PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor consume qua integration metadata và generic routes.

## DONE — Warehouse Petty Cash backend

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- `gl_entries` là money source of truth; projections chỉ rebuildable.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.

## Chưa hoàn tất

1. Hoàn tất exact regression/verification cho `fix/vn-accounting-period-integrity-20260803-r8` rồi mới PR/merge hoặc chuyển evidence/implementation hợp lệ sang WS01.
2. Một UI push thực tế sau fast-path merge để đo duration và xác nhận `Deploy Gateway + /release.json` PASS.
3. HRM statutory payroll-rule evaluator nếu cần tự động PIT/BHXH theo luật; phải có schema/version/nguồn chính thức và không sửa rule đã dùng; WS06 là owner mới.
4. Bulk Transaction cho Stock Reconciliation; WS04 phải audit PR lịch sử trước khi viết lại.
5. Bulk Transaction cho BOM parent + child/version; WS05/WS09 phối hợp nếu cần input-table primitive chung.
6. First-class AppAction input-table contract; WS09 owner.
7. Batch Print / QR label queue; phân owner theo shared platform trước implementation.
8. P1 Daily detailed ledger hardening/closure; WS01/WS08/WS12 phối hợp theo source-of-truth và evidence.
9. Plastic ERP các wave sau P0-A; chỉ mở lại dưới workstream/vertical ownership rõ.
10. Rebase 18 agent branches lên exact Forge 0.2.0 main baseline trước khi implementation nếu branch head còn dựa trên snapshot cũ.

## Guardrails

- Không sửa production secrets/DNS hoặc mutate customer data khi chưa có yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
