@echo off
title DIF3 — Firewall Setup
cd /d "%~dp0"
echo.
echo Adding Windows Firewall rule for DIF3 (port 3000)...
echo This requires administrator privileges.
echo.

netsh advfirewall firewall add rule name="DIF3 Game Server" dir=in action=allow protocol=TCP localport=3000 profile=private,public

if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS: Firewall rule added. LAN players can now connect.
) else (
    echo.
    echo ERROR: Failed to add rule. Right-click this file and select "Run as administrator".
)

echo.
pause
