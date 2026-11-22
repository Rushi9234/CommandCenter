@echo off
title CommandCenter - Database Setup
color 0B

echo.
echo ========================================
echo   COMMANDCENTER - DATABASE SETUP
echo ========================================
echo.

echo [1/3] Creating PostgreSQL Database...
createdb commandcenter 2>nul
if %errorlevel% equ 0 (
    echo [SUCCESS] Database 'commandcenter' created
) else (
    echo [INFO] Database may already exist or PostgreSQL not in PATH
)

echo.
echo [2/3] Running Database Schema...
psql -d commandcenter -f database\schema.sql
if %errorlevel% equ 0 (
    echo [SUCCESS] Schema applied successfully
) else (
    echo [ERROR] Failed to apply schema. Check PostgreSQL installation.
)

echo.
echo [3/3] Optional: Load Sample Data? (Y/N)
set /p loaddata="Load sample data? (Y/N): "
if /i "%loaddata%"=="Y" (
    psql -d commandcenter -f database\seed.sql
    echo [SUCCESS] Sample data loaded
)

echo.
echo ========================================
echo   DATABASE SETUP COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Make sure Redis is running: redis-server
echo 2. Make sure MongoDB is running: mongod
echo 3. Edit backend\.env with your Anthropic API key
echo 4. Run: start.bat
echo ========================================
pause
