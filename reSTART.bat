@echo off
title DIF3 Restart
cd /d "%~dp0"

echo Stopping DIF3 on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting server...
"%~dp0node.exe" server/index.js
pause
