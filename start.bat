@echo off
echo ============================================================
echo   Starting Smartflo Auto-Dialer & DTMF Command Center
echo ============================================================

echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Smartflo Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting Next.js Frontend on http://localhost:3000 ...
start "Smartflo Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo ============================================================
echo   Dashboard: http://localhost:3000
echo   API Docs:  http://127.0.0.1:8000/docs
echo ============================================================
echo Opening dashboard in your default browser...
timeout /t 3 >nul
start http://localhost:3000
