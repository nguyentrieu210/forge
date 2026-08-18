@echo off
setlocal EnableExtensions
set "ROOT=C:\alumdoor"
set "SERVICE_HOME=C:\ForgeServices\Alumdoor"
set "TASK=ForgeAlumdoorLiveSync"

if /I "%~1"=="install" goto :install
if /I "%~1"=="once" goto :once
if /I "%~1"=="status" goto :status
if /I "%~1"=="start" goto :start
if /I "%~1"=="stop" goto :stop
if /I "%~1"=="apply" goto :apply
if /I "%~1"=="deploy-local" goto :deploylocal

echo Usage:
echo   forge-live install          Install/start permanent live sync
echo   forge-live once             Pull origin/agent-live into C:\alumdoor now
echo   forge-live status           Show last sync status
echo   forge-live start            Start scheduled live sync
echo   forge-live stop             Stop scheduled live sync
echo   forge-live deploy-local     Pull, build, restart local runtime, health check
echo   forge-live apply pricing    Explicit guarded data apply using live code
echo   forge-live apply bom
echo   forge-live apply customer
echo   forge-live apply manufacturing-master
exit /b 2

:install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\live-sync\install-forge-live-sync.ps1"
exit /b %ERRORLEVEL%

:once
cd /d "%ROOT%" || exit /b 1
node scripts\live-sync\forge-live-sync.mjs --once
exit /b %ERRORLEVEL%

:status
if exist "%SERVICE_HOME%\live-sync.status.json" (
  type "%SERVICE_HOME%\live-sync.status.json"
  exit /b 0
)
echo FORGE_LIVE_STATUS=NOT_INSTALLED
exit /b 1

:start
powershell.exe -NoProfile -Command "Start-ScheduledTask -TaskName '%TASK%'"
exit /b %ERRORLEVEL%

:stop
powershell.exe -NoProfile -Command "Stop-ScheduledTask -TaskName '%TASK%'"
exit /b %ERRORLEVEL%

:apply
if "%~2"=="" (
  echo [BLOCKED] Missing adapter. Example: forge-live apply pricing
  exit /b 2
)
cd /d "%ROOT%" || exit /b 1
node scripts\live-sync\forge-live-apply.mjs "%~2"
exit /b %ERRORLEVEL%

:deploylocal
cd /d "%ROOT%" || exit /b 1
rem MetaForge workspace packages intentionally call bare `tsc`; make the client
rem package toolchain visible to recursive pnpm scripts. If a partial/old pnpm
rem install left the workspace links missing, repair them before the deploy.
set "PATH=%ROOT%\client\node_modules\.bin;%PATH%"
if not exist "%ROOT%\client\node_modules\.bin\tsc.cmd" goto :deploydeps
if not exist "%ROOT%\client\apps\runtime\node_modules\.bin\vite.cmd" goto :deploydeps
goto :deployrun

:deploydeps
echo DEPENDENCY_INSTALL_STATUS=START reason=client_tooling_missing
call pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b %ERRORLEVEL%
echo DEPENDENCY_INSTALL_STATUS=PASS reason=client_tooling_missing

:deployrun
node scripts\local-runner\forge-live.mjs deploy-local
exit /b %ERRORLEVEL%