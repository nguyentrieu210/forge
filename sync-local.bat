@echo off
setlocal EnableExtensions
REM Safe one-shot GitHub -> local source refresh.
REM
REM Source-only sync remains callable on a clean local main. The --bootstrap path
REM is INTERNAL and requires process ancestry under the active canonical
REM `run-local-import.mjs bootstrap` lock.
set "BOOTSTRAP="
set "SKIP_SOURCE_VERIFY="
for %%A in (%*) do (
  if /I "%%~A"=="--bootstrap" set "BOOTSTRAP=1"
  if /I "%%~A"=="--skip-source-verify" set "SKIP_SOURCE_VERIFY=1"
)

cd /d C:\alumdoor
if errorlevel 1 (echo [LOI] Khong vao duoc C:\alumdoor & exit /b 1)

if defined BOOTSTRAP (
  call node scripts\local-runner\assert-bootstrap-helper-context.mjs
  if errorlevel 1 (
    echo [BLOCKED] sync-local.bat --bootstrap chi duoc goi tu canonical bootstrap runner.
    exit /b 73
  )
)

call node server\scripts\sync-local-from-github.mjs --check
set "SYNC_RESULT=%ERRORLEVEL%"
if "%SYNC_RESULT%"=="0" (
  if not defined BOOTSTRAP (
    echo [OK] Local da dung commit main tren GitHub. Khong can build lai.
    exit /b 0
  )
  echo [OK] Source da dung GitHub main. Tiep tuc canonical bootstrap helper.
  goto :bootstrap
)
if not "%SYNC_RESULT%"=="10" (
  echo [DUNG] Khong dong bo de tranh mat thay doi local.
  exit /b %SYNC_RESULT%
)

echo.
echo === 1. Dua runtime vao maintenance va yeu cau ports quiet ===
if exist server\scripts\alumdoor-runtime-maintenance.mjs (
  call node server\scripts\alumdoor-runtime-maintenance.mjs on
  if errorlevel 1 (echo [LOI] Khong bat duoc maintenance cho Windows services & exit /b 1)
)
call node scripts\local-runner\assert-ports-quiet.mjs --ports=8799,5173
if errorlevel 1 (
  echo [DUNG] Runtime van co listener. Source sync khong kill process theo port.
  exit /b 1
)

echo.
echo === 2. Sao luu D1/R2/DO local ===
call node server\scripts\backup-local-state.mjs
if errorlevel 1 (echo [LOI] Sao luu local state that bai & exit /b 1)

echo.
echo === 3. Dong bo main tu GitHub ===
call node server\scripts\sync-local-from-github.mjs --apply
if errorlevel 1 (echo [LOI] Khong the fast-forward main tu GitHub & exit /b 1)

if not defined BOOTSTRAP (
  echo [OK] Source-only sync hoan tat. Runtime van o maintenance; dung canonical bootstrap de build/migrate/start.
  exit /b 0
)

:bootstrap
call node scripts\local-runner\assert-bootstrap-helper-context.mjs
if errorlevel 1 (
  echo [BLOCKED] Canonical bootstrap lock context khong con hop le.
  exit /b 73
)

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
echo === 5. Build, migrate, seed, smoke, cai metadata va khoi dong local ===
if defined SKIP_SOURCE_VERIFY (
  echo [INFO] Bo qua repo-wide source verification; van chay toan bo runtime validation.
  call C:\alumdoor\run-local.bat --noninteractive
) else (
  call C:\alumdoor\run-local.bat --noninteractive --verify
)
exit /b %ERRORLEVEL%
