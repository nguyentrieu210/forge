@echo off
setlocal
cd /d C:\alumdoor

node scripts\local-runner\forge-live.mjs deploy-local
if errorlevel 1 exit /b %errorlevel%

node scripts\local-runner\import-alumdoor-manufacturing-master-local.mjs --apply
if errorlevel 1 exit /b %errorlevel%

echo ALUMDOOR_REMAINING_LOCAL_IMPORT=PASS
endlocal
