@echo off
echo ============================================================
echo   Stopping Smartflo Dialer Services (Ports 8000 and 3000)
echo ============================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Stopping Backend PID %%a...
    taskkill /f /pid %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Stopping Frontend PID %%a...
    taskkill /f /pid %%a >nul 2>&1
)

echo All services stopped cleanly.
timeout /t 3 >nul
