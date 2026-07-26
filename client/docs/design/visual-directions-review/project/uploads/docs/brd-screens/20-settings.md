# M20 — Settings / My Settings + module launcher

> Cài đặt cá nhân (theme/hồ sơ/đổi mật khẩu) + lối vào cấu hình site (System Settings, các Single DocType). "Danh mục" = module launcher (nhóm DocType master). Đối chiếu: Frappe My Settings + System Settings v16.

## Khối 1 — Định danh
- **Tên**: Settings — **route**: `/app/settings` (+ `/app/user-profile`, `/app/<single-doctype>`).
- **Role**: mọi role (mục cá nhân); System Manager (mục site).
- **Contract**: `screen-catalog-contract.md` Settings + `master-data-contract.md` (module launcher) + `polish-contract.md` §8.
- **Nguồn**: `User` (của mình) + **Single DocType** (System Settings, Website Settings, Print Settings…) render qua M11.

## Khối 2 — Layout
**Desktop:** trang nhóm (không dồn 1 trang dài), có ô **tìm cài đặt**:
- **Cá nhân**: hồ sơ (User) + **đổi mật khẩu** tự phục vụ + theme 3 chế độ + cỡ chữ + ngôn ngữ.
- **Bảo mật**: **đăng xuất tất cả thiết bị khác** (V1 — không liệt kê/đăng xuất từng thiết bị vì Frappe chưa có API an toàn cho việc đó); 2FA (nếu site bật).
- **Tổ chức/Site** (System Manager): các **Single DocType** cấu hình (System Settings, Print Settings, Website Settings…) mở dạng M11 Form.
- **Danh mục / Module launcher**: lưới nhóm DocType master theo module (Item Group, Territory, Department… → mở List M04). Cũng là mục "Danh mục" trên sidebar.
- **Người dùng & phân quyền**: link tới List User + M16 Permission Manager.
- **Dữ liệu**: **liệt kê + tải bản backup gần nhất** (`fetch_latest_backups` = LIST 30 ngày, KHÔNG tạo mới), thùng rác (Deleted Documents). Tạo backup/Data Export mới = luồng riêng (chưa vào V1 nếu chưa có wrapper).

**Mobile:** list + route con (không form khổng lồ).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 1 Phân quyền | **Áp dụng** — hồ sơ + đổi mật khẩu; link Users/Permission Manager (M16) |
| 15 Tiện VN | **Áp dụng** — ngôn ngữ VI/EN; cỡ chữ; theme; định dạng số/ngày |
| 19 Danh mục | **Áp dụng — cốt lõi** — module launcher = nhóm DocType master (Danh mục), mỗi cái mở List M04 |
| 4 báo cáo | **Áp dụng (một phần)** — mục "Dữ liệu": liệt kê/tải backup gần nhất (`fetch_latest_backups` = list, không tạo) |
| 8/7/18/2/6/10/11/13/14/5/12 | | Không áp dụng trực tiếp (Single DocType cấu hình render qua M11) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `SettingsSearch` | mục cài đặt | gõ ra mục liên quan | mọi role | — |
| `ProfileForm` | User (của mình) | sửa hồ sơ + đổi mật khẩu | chính mình | — |
| `ThemeFontControls` | localStorage | theme 3 chế độ + cỡ chữ 3 mức | mọi role | — |
| `SessionManager` | orch `metaforge.api.logout_other_sessions` | **V1 chỉ 1 nút "đăng xuất tất cả thiết bị khác"** = orch wrap `frappe.sessions.clear_sessions(keep_current=True)` (⚠️ `clear_sessions` KHÔNG whitelisted — chỉ gọi qua orch). Đổi mật khẩu + đăng xuất khác = `update_password(logout_all_sessions=1)`. **KHÔNG liệt kê/đăng xuất từng thiết bị** (Frappe chưa có `get_my_sessions` an toàn — để P2) | chính mình | — |
| `SingleDoctypeLink` | Single DocType | mở M11 (System Settings…) | System Manager | ẩn nếu không quyền |
| `ModuleLauncher` | DocType master theo module | lưới → List M04 | theo `read` | — |
| `BackupList` | `frappe.utils.backups.fetch_latest_backups()` → `{database, public, private, config}` | **CHỈ liệt kê + tải** path backup 30 ngày gần nhất (KHÔNG tạo backup/export mới) | System Manager | ẩn nếu không quyền |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Đổi mật khẩu | `frappe.core.doctype.user.user.update_password(new_password, logout_all_sessions=0, key=None, old_password=None)` (grep-verify) | old+new theo policy site; `test_password_strength` | toast "Đã đổi mật khẩu"; `logout_all_sessions=1` → re-login | "Mật khẩu chưa đủ mạnh"; "Sai mật khẩu hiện tại" |
| Đổi theme/cỡ chữ/ngôn ngữ | local + User | — | áp ngay | — |
| Đăng xuất tất cả thiết bị khác | orch `metaforge.api.logout_other_sessions` (wrap `clear_sessions(keep_current=True)`) | chính mình | các phiên khác bị huỷ, phiên hiện tại giữ | — |
| Mở Single DocType | M11 | System Manager | form cấu hình | "Không có quyền" |
| Liệt kê / tải backup gần nhất | `frappe.utils.backups.fetch_latest_backups()` → `{database, public, private, config}` (**LIST 30 ngày, KHÔNG tạo**) | System Manager | hiện path + link tải | "Chưa có backup trong 30 ngày" |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Mở hồ sơ | field User hiện tại | — |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton nhóm cài đặt |
| Empty | không áp dụng (luôn có mục cá nhân) |
| Error | tiếng Việt + Thử lại |
| Offline | banner; đổi theme/cỡ chữ vẫn được (local) |
| Thiếu quyền | mục site ẩn với non-admin |
| Dữ liệu dài | nhóm gập; tìm cài đặt |
| In-flight | nút Lưu spinner |

## Acceptance Criteria (theo appendix §N)
- [ ] Render 100% từ metadata (bật 1 DocType chưa từng thấy → đúng như Desk v16, KHÔNG hardcode)
- [ ] Desktop/mobile tách cây riêng; test 390/412/768/1280
- [ ] Keyboard shortcut của màn + `?` cheatsheet (mục áp dụng)
- [ ] Permission chốt ở **SERVER** (role thấp bypass UI → 403/mask, không chỉ ẩn nút)
- [ ] Loading skeleton khớp cấu trúc + empty 3 trạng thái + error tiếng Việt (không lộ stack/SQL)
- [ ] Optimistic + rollback (thao tác nhẹ); 417 conflict không ghi đè (màn nào có ghi)
- [ ] Lifecycle §D + State machine §E đúng (không tự chế state)
- [ ] Error Matrix §F map đủ; Cache §G; Perf §H đạt ngân sách của màn
- [ ] Test: unit(logic) + integration(API+quyền) + visual baseline 390/768/1280 (light+dark)
- [ ] Mục nghiệp vụ không áp dụng → ghi "N/A + lý do", không bỏ trống
