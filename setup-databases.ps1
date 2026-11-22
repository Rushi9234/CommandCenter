# CommandCenter Database Setup Script
Write-Host "Setting up CommandCenter Database Environment..." -ForegroundColor Green
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not found"
    }
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop first:" -ForegroundColor Red
    Write-Host "https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

# Start Docker containers
Write-Host "🚀 Starting databases with Docker Compose..." -ForegroundColor Blue
docker-compose up -d

# Wait for databases to start
Write-Host "⏳ Waiting for databases to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Test PostgreSQL
Write-Host "🔍 Testing PostgreSQL connection..." -ForegroundColor Cyan
try {
    $pgResult = docker exec postgres-commandcenter psql -U postgres -d commandcenter -c "SELECT version();" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL is running successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ PostgreSQL connection failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ PostgreSQL connection failed" -ForegroundColor Red
}

# Test MongoDB
Write-Host "🔍 Testing MongoDB connection..." -ForegroundColor Cyan
try {
    $mongoResult = docker exec mongodb-commandcenter mongosh --eval "db.runCommand({ping: 1})" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ MongoDB is running successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ MongoDB connection failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ MongoDB connection failed" -ForegroundColor Red
}

# Test Redis
Write-Host "🔍 Testing Redis connection..." -ForegroundColor Cyan
try {
    $redisResult = docker exec redis-commandcenter redis-cli ping 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Redis is running successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis connection failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Redis connection failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Copy backend\.env.docker to backend\.env" -ForegroundColor White
Write-Host "2. Update ANTHROPIC_API_KEY in .env file" -ForegroundColor White
Write-Host "3. Run: cd backend; npm start" -ForegroundColor White
Write-Host ""

# Show container status
Write-Host "📊 Container Status:" -ForegroundColor Cyan
docker-compose ps

Read-Host "Press Enter to exit..."
