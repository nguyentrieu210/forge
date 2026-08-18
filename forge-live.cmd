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

echo Usage:
echo   forge-live install          Install/start permanent live sync
echo   forge-live once             Pull origin/agent-live into C:\alumdoor now
echo   forge-live status           Show last sync status
echo   forge-live start            Start scheduled live sync
echo   forge-live stop             Stop scheduled live sync
echo   forge-live apply pricing    Explicit guarded data apply using live code
echo   forge-live apply bom
echo   forge-live apply customer
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
