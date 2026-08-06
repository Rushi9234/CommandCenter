@echo off
title CommandCenter - Starting Servers
color 0A

echo.
echo ========================================
echo   COMMANDCENTER - STARTING SERVERS
echo ========================================
echo.

echo [INFO] Starting Backend Server...
start "CommandCenter Backend" cmd /k "cd /d D:\CommandCenter\backend && npm run dev"

timeout /t 3 /nobreak >nul

echo [INFO] Starting Frontend Server...
start "CommandCenter Frontend" cmd /k "cd /d D:\CommandCenter\frontend && npm run dev"

echo.
echo ========================================
echo   SERVERS STARTED!
echo ========================================
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this window...
echo (Servers will continue running)
echo ========================================
pause >nul
