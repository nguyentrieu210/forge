# BUILD REPORT — Gate 0 baseline

> **ARCHIVE — snapshot Gate 0 (7 lib package, selfcheck 45/45), KHÔNG còn cập nhật.** Số liệu build/
> test/selfcheck HIỆN TẠI (8 package, count mới nhất) xem [`TEST_REPORT.md`](../../TEST_REPORT.md) —
> báo cáo sống duy nhất. File này giữ nguyên trạng chỉ để tham khảo lịch sử Gate 0.

> Theo audit `MetaForge_FULL_PROJECT_REVIEW.md` / repair prompt. Chương trình 8-gate.
> Cập nhật: 2026-07-24. Chỉ ghi kết quả ĐÃ CHẠY + exit code (rule #3: không nói pass nếu chưa chạy).

## Môi trường
- Node **v24.17.0** · pnpm **9.15.0** (qua corepack).
- ⚠️ `corepack enable` bị **EPERM** (ghi `C:\Program Files\nodejs` cần admin) ở sandbox này → pnpm KHÔNG shim lên PATH. Invoke qua `corepack pnpm@9.15.0 …`. Trên CI/máy có quyền: `corepack enable` chuẩn → mọi root script chạy trực tiếp.
- TypeScript pin **5.6.3** (root devDep). Monorepo pnpm workspaces + tsc project references (`tsc -b`).

## Kết quả lệnh (exit code THẬT)
| Lệnh | Exit | Ghi chú |
|---|---|---|
| `pnpm typecheck` (`tsc -b`) | **0** ✓ | 0 lỗi TS trên toàn workspace |
| `pnpm lint` (`node scripts/check-native-ui.mjs`) | **0** ✓ | 0 vi phạm no-native-UI |
| `pnpm test` (`--filter @metaforge/demo selfcheck`) | **45/45 ✓** | verify qua filter trực tiếp; root script cần pnpm-on-PATH (corepack enable) |
| `pnpm build` (demo vite) | **✓** | `built in ~9s`; verify qua filter trực tiếp |
| `pnpm e2e` (mock) | *chưa chạy lại phiên này* | trước đó 13 mock + 17 live xanh |

**Lưu ý trung thực:** root `test`/`build`/`e2e` gọi `pnpm …` (bare) → chỉ chạy khi pnpm trên PATH (`corepack enable`). Task nền (selfcheck/build) tự thân PASS (đã verify qua `corepack pnpm@9.15.0 --filter …`). Audit "build FAIL" trước đây là do zip `MetaForge(4).zip` đóng gói node_modules hỏng — repo git thật KHÔNG track node_modules/dist (`git ls-files` = 0 dist/tsbuildinfo).

## Gate 0 — ĐÓNG ✅ (nền reproducibility, không sa đà publish npm)
- [x] Không track `node_modules`/`dist`/`*.tsbuildinfo` (git sạch) + `.gitignore` đủ (+`*.zip`).
- [x] Root scripts thật, chạy được: `typecheck · lint · test · build · e2e · clean`.
- [x] Clean typecheck = 0 lỗi.
- [x] **7 lib package build ra `dist` + `.d.ts`** (`tsc -b`, `tsconfig.base` đã `declaration:true`+`declarationMap`; per-package `outDir:dist/rootDir:src`). Verify: `js✓ dts✓` cả core/adapter-frappe/ui/controls/views/builder/shell.
- [x] **`main/types/exports` trỏ DIST** (`./dist/index.js` · `./dist/index.d.ts` · `exports {".":{types,import}}`); ui giữ thêm `./styles.css → ./src/styles.css` (CSS không compile). `files:["dist","src"]`.
- [x] **Per-package `build` (`tsc -b`) + root build topological** (`pnpm -r run build` — chạy theo thứ tự phụ thuộc: libs dist → demo bundle). Exit 0.
- [x] **Demo resolve + build khi TIÊU THỤ DIST** (không phải src) — `built in ~8s`, 0 lỗi resolve → xác nhận không type-leak/missing-export/circular ẩn. selfcheck **45/45** với dist (esbuild).
- [x] **`pnpm install --frozen-lockfile`** exit 0, "Done in 1.2s" — reproducible, không drift lockfile.
- [x] **CI** `.github/workflows/ci.yml`: corepack enable → frozen install → typecheck → lint → test → `pnpm -r run build` → playwright chromium → mock e2e.
- [x] **corepack EPERM KHÔNG phải blocker**: `packageManager: pnpm@9.15.0` đã pin. Máy không admin: cài pnpm bằng `corepack pnpm@9.15.0 <script>` (không cần `corepack enable`); CI dùng `corepack enable` chuẩn.

**Chưa làm (đúng phạm vi — KHÔNG sa đà):** npm publish, semantic-release, bundle-optimization, versioning phức tạp, đổi behavior metadata/runtime. Package vẫn `private:true`.

### Lệnh verify Gate-0 (exit code THẬT phiên này)
| Lệnh | Kết quả |
|---|---|
| `tsc -b --clean && tsc -b` | exit 0 · 7×(js✓ dts✓) |
| `pnpm -r run build` (topological) | exit 0 · all Done · demo built 7.67s |
| `--filter demo run build` (consume dist) | ✓ built 8.37s |
| `--filter demo run selfcheck` | 45/45 ✓ |
| `pnpm install --frozen-lockfile` | exit 0 (no drift) |

## Đã sửa ngoài Gate 0 (security P0-07, commit `fb0478b`)
- PrintView iframe `sandbox=""`; ReportView message qua `sanitizeHtml` (core, DOM allowlist).

## Kế tiếp — Gate 1 (thứ tự chốt với user)
API inventory/contract → DTO schema + normalized error-envelope → **global_search** backend/frontend contract → cache scope site/user/language → **effective capabilities FAIL-CLOSED** (KHÔNG optimistic full-perm fallback) → contract tests với response Frappe thật. Tracker: `METAFORGE_REPAIR_BACKLOG.md` (trong review).
