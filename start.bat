@echo off
echo ============================================================
echo   Starting Smartflo Auto-Dialer & CRM Command Center
echo ============================================================

set PYTHON_BIN=python
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set PYTHON_BIN="%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
)

echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Smartflo Backend" cmd /k "cd /d %~dp0backend && %PYTHON_BIN% -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting Next.js Frontend on http://localhost:3000 ...
start "Smartflo Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================================
echo   Dashboard: http://localhost:3000
echo   API Docs:  http://127.0.0.1:8000/docs
echo ============================================================
echo Opening dashboard in your default browser...
timeout /t 3 >nul
start http://localhost:3000
