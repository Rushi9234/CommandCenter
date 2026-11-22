@echo off
echo Setting up CommandCenter Database Environment...
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not installed. Please install Docker first:
    echo https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo Docker found. Starting databases...

REM Start Docker containers
docker-compose up -d

echo.
echo Waiting for databases to start...
timeout /t 10 /nobreak >nul

echo.
echo Testing PostgreSQL connection...
docker exec postgres-commandcenter psql -U postgres -d commandcenter -c "SELECT version();" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ PostgreSQL is running successfully
) else (
    echo ❌ PostgreSQL connection failed
)

echo.
echo Testing MongoDB connection...
docker exec mongodb-commandcenter mongosh --eval "db.runCommand({ping: 1})" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ MongoDB is running successfully
) else (
    echo ❌ MongoDB connection failed
)

echo.
echo Testing Redis connection...
docker exec redis-commandcenter redis-cli ping >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Redis is running successfully
) else (
    echo ❌ Redis connection failed
)

echo.
echo Database setup complete!
echo.
echo Next steps:
echo 1. Copy backend\.env.docker to backend\.env
echo 2. Update ANTHROPIC_API_KEY in .env file
echo 3. Run: cd backend ^&^& npm start
echo.
pause
