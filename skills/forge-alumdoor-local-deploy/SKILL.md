---
name: forge-alumdoor-local-deploy
description: Hướng dẫn AI agent deploy code Forge/Alumdoor từ branch agent-live xuống máy Windows local C:\alumdoor bằng forge-live deploy-local. Dùng sau khi sửa code GitHub và cần đưa bản build vào local runtime. Không dùng CI làm điều kiện, không tự seed/migrate/import dữ liệu, không đụng Cloudflare remote; bảo toàn local D1 và chỉ kết luận deploy thành công khi machine-readable health status PASS.
---

# Forge Alumdoor Local Deploy Skill

## 1. Mục tiêu

Skill này là runbook ngắn, authoritative cho luồng:

> `GitHub agent-live -> C:\alumdoor -> build server + Desk -> restart Windows services -> health check`

Dùng khi user nói các ý như:

- deploy local;
- kéo code mới về local;
- build bản mới để chạy thử;
- đưa màn TSX/backend fix vừa sửa lên máy local;
- local chưa thấy code mới;
- restart runtime sau khi sửa repo.

Đây là **code deploy local**, không phải data import và không phải production deploy.

## 2. Invariants bắt buộc

1. Live source authority là `origin/agent-live`.
2. Local repo mặc định là `C:\alumdoor`.
3. Không cần kiểm tra CI để deploy local trừ khi user chủ động yêu cầu.
4. Không dùng `wrangler deploy`, không dùng `--remote`, không mutate Cloudflare production.
5. Không tự chạy seed, migration hoặc import dữ liệu trong deploy.
6. Không xóa `.wrangler` hoặc local D1.
7. Không dùng `git clean` trong luồng deploy.
8. Không tự `git reset --hard` nếu chưa biết tracked local edits có được phép bỏ hay không.
9. Chỉ kết luận local đã deploy khi log có `DEPLOY_LOCAL_STATUS=PASS`.
10. Agent làm việc trên GitHub không được tuyên bố đã chạy lệnh trên `C:\alumdoor` nếu không có log/evidence từ máy local hoặc local runner.

## 3. Kiến trúc local hiện hành

### Backend

- Windows service: `ForgeAlumdoorBackend`
- Port: `8799`
- Runtime: Cloudflare Worker chạy bằng Wrangler local.
- D1: local Wrangler state, không phải remote D1.
- Backend được build trước khi service được restart.

Cloudflare Worker không có khái niệm `wrangler deploy local`; local runtime đúng là Wrangler `--local`.

### Desk

- Windows service: `ForgeAlumdoorDesk`
- Port: `5173`
- Runtime: Vite **build + preview**, không phải Vite dev/HMR.
- `/api` trên Desk proxy về `http://127.0.0.1:8799`.

### Entrypoint deploy

Luôn ưu tiên:

```powershell
cd C:\alumdoor
.\forge-live.cmd deploy-local
```

Không yêu cầu user chạy `git pull` riêng trong happy path. Deploy controller tự fetch/align/pull `agent-live`.

## 4. Happy path

Sau khi code đã có trên `agent-live`, yêu cầu local chạy:

```powershell
cd C:\alumdoor
.\forge-live.cmd deploy-local
```

Runner sẽ tự:

1. kiểm tra tracked working tree sạch;
2. fetch `origin/agent-live`;
3. tự switch/align local branch sang `agent-live` nếu cần;
4. kiểm tra hai Windows services tồn tại;
5. stop Desk và Backend;
6. fast-forward `agent-live` từ `origin/agent-live`;
7. install dependency nếu cần;
8. build backend;
9. build workspace dependencies của Runtime;
10. build Vite vào `dist.deploy-next`;
11. promote build sang `dist` bằng Windows-safe copy/rollback;
12. start Backend và Desk;
13. chờ port `8799` và `5173` mở;
14. health check backend, Desk và Desk API proxy.

## 5. Tiêu chí PASS

Deploy hoàn chỉnh phải kết thúc tương đương:

```text
LOCAL_RUNTIME_STOP_STATUS=PASS
PULL_STATUS=PASS branch=agent-live ...
SERVER_BUILD_STATUS=PASS
DESK_BUILD_STATUS=PASS mode=vite_preview
LOCAL_RUNTIME_START_STATUS=PASS
BACKEND_HEALTH_STATUS=PASS http=403
DESK_HEALTH_STATUS=PASS http=200 api_proxy=403
DEPLOY_LOCAL_STATUS=PASS commit=<sha>
```

`http=403` ở `metaforge.api.get_boot` là health hợp lệ khi request chưa đăng nhập. `200` cũng hợp lệ.

Nếu có `DEPLOY_LOCAL_STATUS=FAIL`, deploy **chưa thành công**, kể cả server build hoặc Desk build trước đó đã PASS.

## 6. Sau deploy UI

Nếu thay đổi frontend/TSX/routing:

1. đợi `DEPLOY_LOCAL_STATUS=PASS`;
2. refresh cứng browser bằng `Ctrl+F5`;
3. mở đúng route/screen cần smoke;
4. xác nhận behavior người dùng yêu cầu, không chỉ xác nhận file bundle tồn tại.

Build có chunk TSX không chứng minh route đã mount đúng. Phải kiểm tra routing/extension và smoke màn nếu task yêu cầu UI chạy thật.

## 7. Deploy không được làm gì với dữ liệu

`deploy-local` chỉ deploy code/runtime. Nó không được tự:

- import Item;
- import BOM;
- import Pricing;
- import Customer;
- seed master;
- migrate D1;
- xóa/reset D1.

Local D1 phải được giữ nguyên qua code deploy.

Nếu user yêu cầu **data apply**, đó là thao tác riêng, explicit. Các adapter hiện có:

```powershell
.\forge-live.cmd apply pricing
.\forge-live.cmd apply bom
.\forge-live.cmd apply customer
```

Không ghép `apply` vào `deploy-local` chỉ vì code vừa thay đổi.

## 8. Bootstrap khi local còn forge-live bản cũ

Dấu hiệu: chạy `forge-live.cmd` nhưng usage không có `deploy-local`.

Trước tiên kiểm tra trạng thái Git:

```powershell
cd C:\alumdoor
git status
```

Nếu working tree sạch và user muốn local bám đúng live branch, có thể bootstrap:

```powershell
git fetch origin agent-live
git switch agent-live
# nếu local agent-live đã tồn tại nhưng đang cũ:
git merge --ff-only origin/agent-live
.\forge-live.cmd deploy-local
```

Nếu branch local không tồn tại:

```powershell
git fetch origin agent-live
git switch -c agent-live --track origin/agent-live
.\forge-live.cmd deploy-local
```

Không dùng reset hard như bước mặc định.

## 9. Xử lý merge conflict / unmerged files

Lỗi điển hình:

```text
Pulling is not possible because you have unmerged files.
```

Không tiếp tục deploy mù. Kiểm tra:

```powershell
git status
```

Nếu đó là merge đang dở và không cần giữ merge đó, ưu tiên:

```powershell
git merge --abort
```

Nếu user xác nhận local tracked code chỉ là bản chạy tạm và được phép bỏ toàn bộ thay đổi tracked, khi đó mới dùng:

```powershell
git fetch origin agent-live
git reset --hard origin/agent-live
```

`git reset --hard` làm mất tracked edits. Nó không phải lệnh recovery mặc định và không được dùng nếu chưa xác định intent.

Tuyệt đối không thêm `git clean -fd` chỉ để deploy chạy được; untracked local state có thể chứa dữ liệu/runtime state cần giữ.

## 10. Lỗi tracked changes

Runner cố ý chặn:

```text
DEPLOY_LOCAL_TRACKED_CHANGES_PRESENT
```

Ý nghĩa: local có tracked edits. Agent phải phân loại trước:

- edits cần giữ -> commit hoặc stash phù hợp;
- edits đã có trên GitHub và local không cần nữa -> chỉ discard khi user đã cho phép;
- không tự reset vì tiện.

## 11. Lỗi service

Nếu thấy:

```text
LOCAL_RUNTIME_SERVICE_MISSING=ForgeAlumdoorBackend
```

hoặc Desk tương tự, máy chưa có permanent runtime service đúng tên.

Entrypoint cài live setup hiện có:

```powershell
.\forge-live.cmd install
```

Việc cài service/scheduled task có thể cần elevated setup lần đầu. Sau khi service ACL được grant đúng, restart deploy thường không cần Administrator.

Nếu `SERVICE_STOP_FAILED` / `SERVICE_START_FAILED` là access denied, kiểm tra service ACL/setup; không sửa deploy thành chạy elevated mọi lần.

## 12. Lỗi dependency/build đã biết

Các lỗi Windows sau đã được xử lý trong current deploy tooling; nếu chúng tái xuất hiện, nghi local chưa kéo code mới hoặc có regression:

### `spawnSync pnpm.cmd EINVAL`

Current runner chạy `.cmd/.bat` qua Windows shell, còn executable native vẫn spawn trực tiếp.

### `'tsc' is not recognized`

`forge-live.cmd deploy-local` thêm `client\node_modules\.bin` vào PATH và tự repair dependency nếu thiếu `tsc.cmd`/`vite.cmd`.

### `EPERM ... rename dist.deploy-next -> dist`

Current runner không phụ thuộc rename staging directory trực tiếp. Nó giữ old `dist` làm rollback, copy build mới sang `dist`, rồi cleanup với retry.

Nếu log local cho thấy một trong các implementation cũ này, kéo `origin/agent-live` trước khi tự phát minh workaround mới.

## 13. Warning không phải failure

Không coi các warning sau là deploy failure nếu cuối cùng status PASS:

```text
Some chunks are larger than 500 kB after minification
DEP0169
DEP0190
```

Chunk-size warning là tối ưu bundle riêng. Node deprecation warning cũng là technical debt riêng. Chỉ sửa chúng khi task yêu cầu hoặc chúng thực sự gây lỗi.

## 14. Recovery behavior

Nếu deploy fail sau khi service đã stop, runner cố gắng start lại services trong `finally` để máy không bị cố ý để chết.

Tuy nhiên:

- recovery service start không biến deploy FAIL thành PASS;
- build cũ có thể được giữ/restore;
- luôn đọc `DEPLOY_LOCAL_STATUS` cuối log.

Nếu cần xác nhận runtime sau failure, kiểm tra lại:

```powershell
.\forge-live.cmd status
```

và service/port log phù hợp; không giả định recovery đã thành công.

## 15. Khi agent sửa code trên GitHub

Sau một fix cần local verify:

1. commit thẳng vào `agent-live` theo task hiện hành;
2. không đợi CI nếu user không yêu cầu;
3. nói rõ commit SHA;
4. đưa đúng một lệnh deploy:

```powershell
cd C:\alumdoor
.\forge-live.cmd deploy-local
```

5. yêu cầu đọc/paste output nếu cần xác nhận;
6. chỉ sau log PASS mới nói "local đã deploy".

Nếu user đã paste log PASS, không bắt họ chạy lại chỉ để chứng minh lần nữa.

## 16. Phân biệt trạng thái để báo cáo đúng

### Chỉ sửa repo

Nói:

> Code đã được sửa trên `agent-live`, local chưa được chứng minh đã deploy.

### Build local đang chạy nhưng chưa xong

Nói:

> Server/Desk có thể đã build PASS, nhưng deploy chưa hoàn tất cho tới khi runtime start + health + `DEPLOY_LOCAL_STATUS=PASS`.

### Deploy local PASS

Nói:

> Local build deploy đã PASS; Backend 8799, Desk 5173 và API proxy health đều PASS; D1 local được giữ nguyên.

### Import data PASS

Chỉ nói khi có log riêng từ adapter/import/replay. Không suy import data từ code deploy.

## 17. Các file authority của luồng deploy

Khi behavior thực tế khác skill này, đọc code hiện hành trước:

- `forge-live.cmd`
- `scripts/local-runner/forge-live.mjs`
- `server/scripts/alumdoor-runtime-service-host.mjs`
- `server/scripts/install-alumdoor-runtime-services.ps1`
- `server/scripts/grant-alumdoor-runner-service-control.ps1`
- `server/RUNBOOK_LOCAL.md`

Exact code trên `agent-live` thắng prose trong skill nếu chúng lệch nhau; sau đó cập nhật skill để tránh drift.

## 18. Checklist cuối cho agent

Trước khi kết luận task deploy xong:

- [ ] code cần chạy đã có trên `agent-live`;
- [ ] không dùng CI như blocker ngoài yêu cầu;
- [ ] không remote deploy;
- [ ] không seed/migrate/import ngoài intent;
- [ ] không xóa local D1;
- [ ] không phá tracked edits bằng reset hard vô điều kiện;
- [ ] local chạy `forge-live.cmd deploy-local`;
- [ ] `SERVER_BUILD_STATUS=PASS`;
- [ ] `DESK_BUILD_STATUS=PASS`;
- [ ] `LOCAL_RUNTIME_START_STATUS=PASS`;
- [ ] backend health PASS;
- [ ] Desk + API proxy health PASS;
- [ ] `DEPLOY_LOCAL_STATUS=PASS`;
- [ ] nếu là UI, đã refresh cứng/smoke đúng screen khi cần.
