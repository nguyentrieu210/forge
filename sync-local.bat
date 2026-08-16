@echo off
setlocal EnableExtensions
REM Safe one-shot GitHub -> local refresh. It only accepts a clean local main.
REM Pass --bootstrap to run the full local install/build/migrate/start path even
REM when C:\alumdoor is already on the latest GitHub main commit.
set "BOOTSTRAP="
for %%A in (%*) do (
  if /I "%%~A"=="--bootstrap" set "BOOTSTRAP=1"
)

cd /d C:\alumdoor
if errorlevel 1 (echo [LOI] Khong vao duoc C:\alumdoor & exit /b 1)

call node server\scripts\sync-local-from-github.mjs --check
set "SYNC_RESULT=%ERRORLEVEL%"
if "%SYNC_RESULT%"=="0" (
  if not defined BOOTSTRAP (
    echo [OK] Local da dung commit main tren GitHub. Khong can build lai.
    exit /b 0
  )
  echo [OK] Source da dung GitHub main. Tiep tuc bootstrap local day du theo yeu cau.
  goto :bootstrap
)
if not "%SYNC_RESULT%"=="10" (
  echo [DUNG] Khong dong bo de tranh mat thay doi local.
  exit /b %SYNC_RESULT%
)

echo.
echo === 1. Dung server local truoc khi dong vao D1/R2 ===
call node server\scripts\stop-local-dev.mjs --ports=8799,5173
if errorlevel 1 (echo [LOI] Khong dung duoc server local & exit /b 1)

echo.
echo === 2. Sao luu D1/R2/DO local ===
call node server\scripts\backup-local-state.mjs
if errorlevel 1 (echo [LOI] Sao luu local state that bai & exit /b 1)

echo.
echo === 3. Dong bo main tu GitHub ===
call node server\scripts\sync-local-from-github.mjs --apply
if errorlevel 1 (echo [LOI] Khong the fast-forward main tu GitHub & exit /b 1)

:bootstrap
echo.
echo === 4. Dong bo dependency dung lockfile ===
REM Runner service co the khong co quyen corepack enable toan may. Neu pnpm da co
REM trong PATH thi dung thang; chi fallback sang Corepack khi thuc su thieu pnpm.
call pnpm --version >nul 2>&1
if errorlevel 1 (
  call corepack enable >nul 2>&1
  if errorlevel 1 (echo [LOI] Khong co pnpm va khong bat duoc Corepack. Can Node 22+ voi pnpm 9. & exit /b 1)
  call pnpm --version >nul 2>&1
  if errorlevel 1 (echo [LOI] Corepack da bat nhung pnpm van khong dung duoc. & exit /b 1)
)
call pnpm install --frozen-lockfile
if errorlevel 1 (echo [LOI] Dependency khong khop lockfile & exit /b 1)

echo.
echo === 5. Build, test day du, migrate, cai metadata va khoi dong local ===
call C:\alumdoor\run-local.bat --noninteractive --verify
exit /b %ERRORLEVEL%
