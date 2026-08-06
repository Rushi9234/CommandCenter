@echo off
echo ========================================
echo CommandCenter - Quick Start
echo ========================================
echo.

echo [1/3] Installing Backend Dependencies...
cd backend
call npm install
cd ..

echo.
echo [2/3] Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo [3/3] Setup Complete!
echo.
echo ========================================
echo Next Steps:
echo ========================================
echo 1. Setup databases (PostgreSQL, Redis, MongoDB)
echo 2. Create backend/.env file (see backend/.env.example)
echo 3. Run database schema: psql -d commandcenter -f database/schema.sql
echo 4. Start backend: cd backend ^&^& npm run dev
echo 5. Start frontend: cd frontend ^&^& npm run dev
echo.
echo See SETUP.md for detailed instructions
echo ========================================
pause
