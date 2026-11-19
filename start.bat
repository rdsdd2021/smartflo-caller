@echo off
echo ============================================================
echo   Starting Smartflo Auto-Dialer ^& DTMF Logger Dashboard
echo ============================================================

echo Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Smartflo Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Next.js Frontend on http://localhost:3000 ...
start "Smartflo Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo Dashboard will be available at: http://localhost:3000
echo Backend API docs available at:  http://127.0.0.1:8000/docs
echo ============================================================
pause
