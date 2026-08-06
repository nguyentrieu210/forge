# Alumdoor — Operating UX Convergence Audit

Date: 2026-08-06  
Target candidate: `2.3.1`  
Baseline: `main@ede10e8cbedf4ad238834b0e9d9afe0c640080a9` after PR #732 (`operational UX convergence 2.3.0`).

## 1. Decision

Sales and Procurement are the reference interaction model for Alumdoor:

`Sidebar phân hệ -> Quy trình -> daily task tabs -> contextual reports/history`, with canonical documents and server authority unchanged.

The remaining product surface converges to the same operator model. Daily navigation must answer **what the user needs to do now**, not enumerate every installed DocType/action/report.

This slice is presentation/metadata only. It does not add a second ledger, workflow engine, permission authority, payroll engine, stock authority or app-specific Form/List renderer.

## 2. Architecture resolution

| Surface | Business owner | Declaration source | Renderer | Requested change | Chosen layer | Engineering risk | Release impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sales | Alumdoor | `alumdoor-v2.navigation.json` + existing actions/experience | shared shell + existing sales experience/generic actions | Keep as reference | no semantic change | FAST | regression lock only |
| Procurement | Alumdoor | `alumdoor-v2.navigation.json` + `alumdoor-v2.actions.json` | shared shell + generic action renderer | Keep as reference | no semantic change | FAST | regression lock only |
| Stock | Alumdoor + canonical stock | Alumdoor nav for owned actions/docs; dependency reports stay dependency-owned | shared shell / canonical DocTypes/reports/actions | Remove correction/setup noise from daily tabs | declaration first + existing report affinity | FAST | new candidate |
| Manufacturing | Alumdoor + canonical manufacturing | Alumdoor nav for owned actions/docs; dependency reports stay dependency-owned | shared shell / canonical DocTypes/reports/actions | Make order-to-production the entry flow | declaration first + existing report affinity | FAST | new candidate |
| Debt | canonical finance | Alumdoor nav for Payment Entry; finance reports stay dependency-owned | shared shell / canonical Payment Entry + reports | Make collection/payable control visible as one module | declaration first + existing report affinity | FAST | new candidate |
| Warranty | Alumdoor + canonical warranty/finance | navigation sidecar | shared shell / canonical Warranty Claim + Alumdoor actions | Make intake -> case -> resolution explicit | declaration first | FAST | new candidate |
| Warehouse cash | `vn-accounting` | canonical dependency nav | shared shell | Already task-first | unchanged dependency declaration | FAST | no contract change |
| HR & Payroll | `hrm` | canonical dependency nav + Alumdoor presentation projection | shared shell | Replace obsolete HR-lite with one curated operator workspace | existing Alumdoor presentation layer | FAST | new candidate |

### Dependency ownership boundary discovered by CI

`alumdoor-v2.navigation.json` can override only DocTypes/actions/reports/experiences owned by the Alumdoor brief. The first CI run correctly rejected attempts to re-group dependency-owned reports such as `Stock Ledger`, `Work Order Progress`, `Accounts Receivable` and `Accounts Payable`.

The fix is intentionally **not** a new shared metadata contract. Daily tabs contain operator actions/documents owned by the current vertical; dependency reports keep their canonical ownership and are surfaced by the shell's existing `ALUMDOOR_REPORT_WORKSPACES` affinity in the ProcessPanel and global Reports hub.

### Why HR/payroll uses the shell projection

The same ownership rule means the Alumdoor sidecar cannot regroup dependency navigation owned by HRM. Extending the shared navigation metadata contract would turn a contained UI task into a STANDARD cross-platform contract change.

The repo already has an Alumdoor-only dependency presentation filter in `WorkspaceAppShellV2`. This slice updates that existing boundary instead of modifying shared HRM or inventing a parallel HR schema.

## 3. Target operating strips

### Bán hàng — reference

`Quy trình -> Bán hàng -> Đơn hàng -> Phiếu xuất kho -> Giao hàng -> Báo cáo -> Lịch sử bán hàng`

No semantic change in this slice.

### Mua hàng — reference

`Quy trình -> Mua hàng -> Nhập hàng -> Báo cáo -> Lịch sử mua hàng`

Canonical `Purchase Order` / `Purchase Receipt` remain installed; daily entry remains metadata-driven actions.

### Kho

Daily strip:

`Quy trình -> Nhập / xuất / chuyển -> Chọn lô cắt -> Cắt nhôm -> Chốt sổ kiểm kê -> Phiếu kiểm kê -> Duyệt kiểm kê`

Decision support remains adjacent instead of becoming another transaction step: `Stock Balance` and `Stock Ledger` are scoped into the Kho ProcessPanel by the existing shell affinity; specialized reports such as `Tồn nhôm theo khổ` remain available through the canonical Reports surface.

Removed from daily strip but kept installed/callable:

- `Hoàn cắt (ghi nhầm)` — correction path;
- `Trả hàng (đã cắt)` — correction/return path;
- `Giữ chỗ nhôm` / `Nhả giữ chỗ` — supporting reservation operations;
- raw `Cut Order`, `Stock Reservation` — implementation documents, not first-click operator tasks.

### Sản xuất

Daily strip:

`Quy trình -> Lập sản xuất -> Lệnh sản xuất -> Năng lực & tăng ca`

`Work Order Progress` and `Lệnh sản xuất theo mặt hàng` stay in the contextual report panel/global Reports. `Bill of Materials` and `Production Standard` remain installed setup/master data and leave the daily strip.

### Công nợ

Daily strip:

`Quy trình -> Thu / chi công nợ`

`Công nợ theo khách hàng`, `Accounts Receivable` and `Accounts Payable` stay immediately available as contextual reports/global Reports. No new finance logic is created; canonical Payment Entry and finance reporting remain authority.

### Bảo hành

`Quy trình -> Tiếp nhận bảo hành -> Hồ sơ bảo hành -> Xử lý / bù trừ`

The flow keeps the existing authority split: Alumdoor captures domain context; canonical warranty/finance documents own business state and financial posting.

### Quỹ kho

Already operational and unchanged:

`Quy trình -> Quỹ tiền mặt theo kho -> Phiếu thu chi kho -> Chuyển quỹ -> Kiểm quỹ & bàn giao`

Owned by `vn-accounting`; Alumdoor only surfaces it.

### Nhân sự & Tiền lương

One Alumdoor sidebar module projects canonical HRM routes:

`Nhân viên -> Hợp đồng -> Nghỉ phép -> Chấm công -> Tạm ứng -> Điều chỉnh lương -> Bảng lương -> Phiếu lương -> Chuyển lương`

The shared HRM app remains complete. Recruitment, interview, appraisal, talent, training and other long-tail HCM capabilities stay installed for tenants that use them but do not enter the Alumdoor daily sidebar.

This explicitly supersedes the Alumdoor-only presentation decision in `docs/ALUMDOOR-HR-LITE-20260803.md`, which limited the surface to Employee + Attendance. It does **not** supersede or shrink the canonical HRM contract.

## 4. UX principles locked by this audit

1. **Task first, entity second.** Users should see `Nhập hàng`, `Lập sản xuất`, `Tiếp nhận bảo hành`, not a catalog of internal records.
2. **One operational workspace per business concern.** Dependency app group names may not fragment one user job into five sidebar modules.
3. **Exceptions do not become primary navigation.** Reverse/correction/recovery operations remain available but are not daily first-clicks.
4. **Reports stay near the decision, not inside the transaction sequence.** Dependency report ownership is preserved; ProcessPanel affinity keeps analysis beside its business workflow.
5. **No duplicate authority.** UI projection never replaces server permissions, ledger, stock, payroll, HR or finance controllers.
6. **No app-specific renderer fork.** Existing shared shell, generic action screens, canonical Form/List/Report paths and existing sales experience remain authoritative.
7. **Company/Warehouse context stays global.** Do not re-add duplicate scope fields to each operational form.

## 5. Regression locks

`server/tests/alumdoor-operational-ux-contract.test.mjs` locks:

- exact Stock/Manufacturing/Debt/Warranty daily strip membership and order;
- hidden correction/setup entries remain installed;
- dependency operational reports remain mapped to the correct ProcessPanel without being re-owned by the Alumdoor sidecar;
- selected HR/payroll keys exist in canonical HRM;
- the Alumdoor shell projects them into one `Nhân sự & Tiền lương` workspace;
- recruiting/performance/training remain installed in HRM but excluded from the Alumdoor daily projection.

Existing Sales and Procurement navigation tests are relocked to package candidate `2.3.1` without changing their operational contracts.

## 6. Release classification

Engineering risk: **FAST / UI-navigation presentation**.

This branch creates a new package/UI candidate and does **not** change the exact deployed/certified R6 baseline. No production deploy, DNS, secret, migration, schema or destructive operation is part of this slice.

If this candidate is later deployed onto a frozen pilot tenant, source/bundle/package identity must be relocked according to the Enterprise Completion Skill before claiming the deployed pilot is unchanged.
