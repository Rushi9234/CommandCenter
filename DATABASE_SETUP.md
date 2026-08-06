# Database Setup Guide for CommandCenter

## 🚀 Quick Setup (Recommended)

### Prerequisites
- Docker Desktop installed and running
- Git for cloning the repository

### Step 1: Start Databases with Docker
```powershell
# Run the PowerShell setup script
.\setup-databases.ps1
```

Or manually:
```bash
docker-compose up -d
```

### Step 2: Configure Environment
```powershell
# Copy the Docker environment file
Copy-Item backend\.env.docker backend\.env

# Edit the .env file to add your API keys
notepad backend\.env
```

### Step 3: Start the Backend
```bash
cd backend
npm start
```

## 📦 Alternative Installation Options

### Option 1: Install PostgreSQL Directly

#### Windows
1. **Download**: https://www.postgresql.org/download/windows/
2. **Install**: Run the installer with these settings:
   - Password: `password123` (remember this!)
   - Port: `5432`
   - Install pgAdmin 4 (optional GUI)
3. **Create Database**:
   ```sql
   CREATE DATABASE commandcenter;
   ```
4. **Update .env**:
   ```
   DATABASE_URL=postgresql://postgres:password123@localhost:5432/commandcenter
   ```

#### macOS
```bash
# Using Homebrew
brew install postgresql
brew services start postgresql

# Create database
createdb commandcenter
```

#### Linux (Ubuntu)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo -u postgres createdb commandcenter
```

### Option 2: Install MongoDB Directly

> **Not currently required.** MongoDB is not used by the running app today — this section is kept for when it's deliberately reintroduced (see the rebuild blueprint's roadmap). Skip this for now.

#### Windows
1. **Download**: https://www.mongodb.com/try/download/community
2. **Install**: Run the MSI installer
3. **Start Service**: MongoDB should start automatically
4. **Update .env**:
   ```
   MONGODB_URL=mongodb://localhost:27017/commandcenter
   ```

#### macOS
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb/brew/mongodb-community
```

#### Linux (Ubuntu)
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc
sudo apt-get install gnupg
wget -qO - https://repo.mongodb.org/apt/ubuntu/dists/jammy/mongodb-org/7.0/arm64/mongodb-org-server_7.0_amd64.deb
sudo dpkg -i mongodb-org-server_7.0_amd64.deb
sudo systemctl start mongod
```

### Option 3: Cloud Database Services

#### Neon PostgreSQL (Recommended for Production)
1. **Sign Up**: https://neon.tech/
2. **Create Database**: Get connection string
3. **Update .env**:
   ```
   DATABASE_URL=postgresql://[user]:[password]@[host]:[port]/[dbname]
   ```

#### MongoDB Atlas
1. **Sign Up**: https://www.mongodb.com/cloud/atlas
2. **Create Cluster**: Free tier available
3. **Get Connection String**: Update .env

## 🔧 Configuration Files

### backend/.env (Required)
```env
# PostgreSQL (Primary Database)
DATABASE_URL=postgresql://postgres:password123@localhost:5432/commandcenter

# MongoDB and Redis are not currently used by the app — omit them.

# JWT Secret (Change this!)
JWT_SECRET=your-secure-jwt-secret-key

# Groq API Key (For AI features)
GROQ_API_KEY=your-groq-api-key

# Server Port
PORT=3001
```

### docker-compose.yml (For Docker Setup)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    container_name: postgres-commandcenter
    environment:
      POSTGRES_DB: commandcenter
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  mongodb:
    image: mongo:7
    container_name: mongodb-commandcenter
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:7-alpine
    container_name: redis-commandcenter
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
```

## 🧪 Verification Commands

### Test PostgreSQL Connection
```bash
# Using Docker
docker exec postgres-commandcenter psql -U postgres -d commandcenter -c "SELECT version();"

# Using Local Installation
psql -U postgres -d commandcenter -c "SELECT version();"
```

### Test MongoDB Connection
```bash
# Using Docker
docker exec mongodb-commandcenter mongosh --eval "db.runCommand({ping: 1})"

# Using Local Installation
mongosh --eval "db.runCommand({ping: 1})"
```

### Test Redis Connection
```bash
# Using Docker
docker exec redis-commandcenter redis-cli ping

# Using Local Installation
redis-cli ping
```

## 🚨 Troubleshooting

### Port Conflicts
- PostgreSQL: Default 5432
- MongoDB: Default 27017
- Redis: Default 6379

Change ports in docker-compose.yml if conflicts occur.

### Connection Issues
1. **Check Docker**: `docker ps`
2. **Check Logs**: `docker logs postgres-commandcenter`
3. **Reset Database**: `docker-compose down -v && docker-compose up -d`

### Windows Specific Issues
- Enable WSL2 for better Docker performance
- Run PowerShell as Administrator
- Check Windows Firewall settings

## 📚 Next Steps

1. **Start Backend**: `cd backend && npm start`
2. **Start Frontend**: `cd frontend && npm run dev`
3. **Test Registration**: Create a test account
4. **Verify Persistence**: Create teams/logs and restart server

## 🎯 Production Deployment

For production deployment:
1. Use cloud database services (Neon, MongoDB Atlas)
2. Set environment variables in deployment platform
3. Ensure SSL connections for databases
4. Configure proper backup strategies

---

**Need Help?**
- Check the logs: `docker-compose logs -f`
- Verify environment variables
- Ensure all services are running: `docker-compose ps`
