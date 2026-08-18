@echo off
setlocal
cd /d C:\alumdoor

call forge-live.cmd once
if errorlevel 1 exit /b %errorlevel%

call forge-live.cmd apply manufacturing-master
if errorlevel 1 exit /b %errorlevel%

echo ALUMDOOR_REMAINING_LOCAL_IMPORT=PASS
endlocal
