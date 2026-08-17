@echo off
setlocal EnableDelayedExpansion
REM ==========================================================================
REM  Forge local runtime bootstrap helper.
REM
REM  IMPORTANT: this file is INTERNAL to the canonical local-runner bootstrap.
REM  Direct invocation is blocked unless this process is a descendant of the
REM  active bootstrap lock owner. Public mutation entry point:
REM
REM    node scripts\local-runner\run-local-import.mjs bootstrap
REM
REM  All D1 commands remain --local and use the repo-pinned Wrangler binary.
REM ==========================================================================
set "NONINTERACTIVE="
set "VERIFY="
for %%A in (%*) do (
  if /I "%%~A"=="--noninteractive" set "NONINTERACTIVE=1"
  if /I "%%~A"=="--verify" set "VERIFY=1"
)

cd /d C:\alumdoor
if errorlevel 1 (echo [LOI] Khong vao duoc C:\alumdoor & call :pause_if_interactive & exit /b 1)
set LOG=C:\alumdoor\run-local.log
echo Forge canonical bootstrap helper - %DATE% %TIME% > "%LOG%"
echo   Log: %LOG%

call node scripts\local-runner\assert-bootstrap-helper-context.mjs >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [BLOCKED] run-local.bat chi duoc goi tu canonical bootstrap runner - xem %LOG%
  call :pause_if_interactive
  exit /b 73
)

echo.
echo === 0. Kiem tra moi truong ===
call node --version || (echo [LOI] Chua cai Node 22+ & call :pause_if_interactive & exit /b 1)
call corepack enable >nul 2>&1
call pnpm --version || (echo [LOI] Chua co pnpm. Chay: corepack enable & call :pause_if_interactive & exit /b 1)

if not exist node_modules (
  echo.
  echo === Cai dependency lan dau - co the vai phut ===
  call pnpm install || (echo [LOI] pnpm install that bai. Neu chet o "xlsx" thi may can ra duoc cdn.sheetjs.com & call :pause_if_interactive & exit /b 1)
)

echo.
echo === 1. Secret cuc bo ===
call node server\scripts\ensure-dev-vars.mjs
if errorlevel 1 (echo [LOI] Khong sinh duoc .dev.vars & call :pause_if_interactive & exit /b 1)
call node server\scripts\ensure-alumdoor-local-vars.mjs
if errorlevel 1 (echo [LOI] Khong dong bo duoc secret cho Alumdoor validator & call :pause_if_interactive & exit /b 1)

if defined VERIFY (
  echo.
  echo === 1.5. Kiem tra toan bo ma nguon ===
  cd /d C:\alumdoor
  call node server\scripts\verify-local-source.mjs >> "%LOG%" 2>&1
  if errorlevel 1 (echo [LOI] Kiem tra toan bo that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
)

echo.
echo === 1.8. Xac nhan runtime dang maintenance va ports da quiet ===
call node server\scripts\alumdoor-runtime-maintenance.mjs on >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Khong bat duoc runtime maintenance - xem %LOG% & call :pause_if_interactive & exit /b 1)
call node scripts\local-runner\assert-ports-quiet.mjs --ports=8799,5173 >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Runtime van co listener; canonical runner phai quiesce truoc - xem %LOG% & call :pause_if_interactive & exit /b 1)

echo.
echo === 2. Build server ===
cd /d C:\alumdoor\server
call pnpm run build >> "%LOG%" 2>&1 || (echo [LOI] Build server that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)

echo.
echo === 3. Migration len D1 CUC BO qua pinned Wrangler ===
cd /d C:\alumdoor
call node scripts\local-runner\assert-bootstrap-helper-context.mjs >> "%LOG%" 2>&1
if errorlevel 1 (echo [BLOCKED] Bootstrap lock context mat truoc migration - xem %LOG% & call :pause_if_interactive & exit /b 73)
set "WRANGLER=C:\alumdoor\server\node_modules\.bin\wrangler.cmd"
if not exist "%WRANGLER%" (echo [LOI] Khong tim thay pinned Wrangler: %WRANGLER% & call :pause_if_interactive & exit /b 1)
cd /d C:\alumdoor\server
call "%WRANGLER%" d1 migrations apply cloudforge-demo --local --config apps/tenant-worker/wrangler.jsonc >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Migration that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)

echo.
echo === 4. Seed tai khoan dang nhap ===
call pnpm run dev:seed >> "%LOG%" 2>&1 || (echo [LOI] Seed that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)

echo.
echo === 5. Chay worker ===
set PORT=8799
set REUSE=
set BACKEND_SERVICE=
call node scripts\alumdoor-runtime-maintenance.mjs off backend >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Khong tat duoc backend runtime maintenance - xem %LOG% & call :pause_if_interactive & exit /b 1)
if exist C:\ForgeServices\Alumdoor\ForgeAlumdoorBackend.exe if exist C:\ForgeServices\Alumdoor\ForgeAlumdoorBackend.xml (
  sc.exe query ForgeAlumdoorBackend >nul 2>&1
  if not errorlevel 1 set BACKEND_SERVICE=1
)
if defined GITHUB_ACTIONS (
  echo   Runner mode: tach worker/Desk khoi process cleanup cua GitHub Actions.
  set "RUNNER_TRACKING_ID="
)
if defined BACKEND_SERVICE (
  echo   Backend duoc quan ly boi Windows Service ForgeAlumdoorBackend.
) else (
  node -e "fetch('http://127.0.0.1:8799/api/method/metaforge.api.get_boot',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit((r.status===401||r.status===403||r.ok)?0:1)).catch(()=>process.exit(1))" >nul 2>&1
  if not errorlevel 1 (
    powershell -NoProfile -Command "$ok=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*wrangler.alumdoor-local.jsonc*' }; if($ok){exit 0}else{exit 1}" >nul 2>&1
    if not errorlevel 1 set REUSE=1
  )
  if defined REUSE (
    echo   Dung lai cum Alumdoor worker dang chay tren 8799.
  ) else (
    cd /d C:\alumdoor
    call node scripts\local-runner\assert-ports-quiet.mjs --ports=8799 >> "%LOG%" 2>&1
    if errorlevel 1 (echo [LOI] Cong 8799 khong quiet; khong kill blind - xem %LOG% & call :pause_if_interactive & exit /b 1)
    echo   Khoi dong worker tren cong !PORT! ...
    start "Forge workers Alumdoor (local)" cmd /k "cd /d C:\alumdoor\server && pnpm run dev:alumdoor-local"
  )
)

echo   Cho worker san sang ^(toi da 180 giay^)...
set READY=
for /l %%i in (1,1,90) do (
  if not defined READY (
    node -e "fetch('http://127.0.0.1:!PORT!/api/method/metaforge.api.get_boot',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit((r.status===401||r.status===403||r.ok)?0:1)).catch(()=>process.exit(1))" >nul 2>&1
    if not errorlevel 1 (set READY=1) else (node -e "setTimeout(()=>process.exit(0),2000)" >nul 2>&1)
  )
)
if not defined READY (
  echo.
  echo [LOI] Worker khong san sang sau 180 giay tren cong !PORT!.
  if defined BACKEND_SERVICE echo       Xem log Windows Service trong C:\ForgeServices\Alumdoor\logs\ForgeAlumdoorBackend.
  if not defined BACKEND_SERVICE echo       Mo cua so "Forge worker" de doc log.
  call :pause_if_interactive
  exit /b 1
)
echo   Worker san sang tren cong !PORT!.

echo.
echo === 6. Smoke test HTTP ===
cd /d C:\alumdoor\server
call node scripts\http-smoke.mjs --base http://127.0.0.1:!PORT! > "%LOG%.smoke" 2>&1
type "%LOG%.smoke"
findstr /c:"HTTP_SMOKE_PASS" "%LOG%.smoke" >nul
if errorlevel 1 (
  echo.
  echo [CANH BAO] Smoke test KHONG xanh. Backend chua san sang - dung mo UI voi.
  echo            Log day du: %LOG%.smoke
  call :pause_if_interactive
  exit /b 1
)

echo.
echo === 7. Cai app vao tenant cuc bo ===
cd /d C:\alumdoor
call node scripts\local-runner\assert-bootstrap-helper-context.mjs >> "%LOG%" 2>&1
if errorlevel 1 (echo [BLOCKED] Bootstrap lock context mat truoc metadata install - xem %LOG% & call :pause_if_interactive & exit /b 73)
cd /d C:\alumdoor\server
echo   Chuoi phu thuoc: hrm -^> alumdoor-attendance; hrm -^> vn-accounting -^> alumdoor
set FORGE_ADMIN_PASSWORD=local-dev-password-1
call node scripts\forge-app.mjs apps-src\hrm --origin http://127.0.0.1:!PORT! --admin dev@example.com --provision-standard >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Cai hrm that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
call node scripts\forge-app.mjs apps-src\alumdoor-attendance --origin http://127.0.0.1:!PORT! --admin dev@example.com >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Cai alumdoor-attendance that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
call node scripts\forge-app.mjs apps-src\vn-accounting --origin http://127.0.0.1:!PORT! --admin dev@example.com >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Cai vn-accounting that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
call node scripts\forge-app.mjs briefs\alumdoor-v2.json --origin http://127.0.0.1:!PORT! --admin dev@example.com >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Cai alumdoor that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
set FORGE_ADMIN_PASSWORD=

echo.
echo === 8. Build package client (dist cho vite resolve) ===
cd /d C:\alumdoor\client
call npx tsc -b >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Build package client that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
set MISSING=
for %%p in (core adapter-frappe ui controls charts visual views builder shell stock-vn) do (
  if not exist "packages\%%p\dist\index.js" set MISSING=1
)
if defined MISSING (
  echo   Thieu dist - build cuong buc...
  call npx tsc -b --force >> "%LOG%" 2>&1
  if errorlevel 1 (echo [LOI] Build cuong buc that bai - xem %LOG% & call :pause_if_interactive & exit /b 1)
)
set MISSING=
for %%p in (core adapter-frappe ui controls charts visual views builder shell stock-vn) do (
  if not exist "packages\%%p\dist\index.js" (
    echo   [LOI] van thieu dist: packages\%%p
    set MISSING=1
  )
)
if defined MISSING (call :pause_if_interactive & exit /b 1)
echo   Package client da co dist day du.

echo.
echo === 9. Chay MetaForge Desk ===
cd /d C:\alumdoor
call node server\scripts\alumdoor-runtime-maintenance.mjs off desk >> "%LOG%" 2>&1
if errorlevel 1 (echo [LOI] Khong tat duoc Desk runtime maintenance - xem %LOG% & call :pause_if_interactive & exit /b 1)
cd /d C:\alumdoor\client
set DESK_SERVICE=
if exist C:\ForgeServices\Alumdoor\ForgeAlumdoorDesk.exe if exist C:\ForgeServices\Alumdoor\ForgeAlumdoorDesk.xml (
  sc.exe query ForgeAlumdoorDesk >nul 2>&1
  if not errorlevel 1 set DESK_SERVICE=1
)
if defined DESK_SERVICE (
  echo   Desk duoc quan ly boi Windows Service ForgeAlumdoorDesk.
) else (
  start "Forge Desk (local 5173)" cmd /k "cd /d C:\alumdoor\client\apps\runtime && set \"VITE_FORGE_BACKEND=http://127.0.0.1:!PORT!\" && pnpm run dev"
)

echo.
echo ==========================================================
echo   XONG.
echo.
echo   Desk    : http://localhost:5173
echo   Backend : http://localhost:!PORT!   (Desk proxy /api sang day)
echo.
echo   Dang nhap: dev@example.com / local-dev-password-1
echo.
if defined BACKEND_SERVICE echo   Runtime : Windows Services, khong can mo CMD worker/Desk.
if not defined BACKEND_SERVICE echo   Dung lai : dong hai cua so "Forge worker" va "Forge Desk".
echo ==========================================================
echo.
call :pause_if_interactive
exit /b 0

:pause_if_interactive
if not defined NONINTERACTIVE pause
exit /b 0
