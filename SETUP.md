# CommandCenter Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Setup Databases

**PostgreSQL:**
```bash
# Install PostgreSQL 14+
# Create database
createdb commandcenter

# Run schema
psql -d commandcenter -f ../database/schema.sql
```

**Redis:**
```bash
# Install Redis 7+
# Start Redis server
redis-server
```

**MongoDB:**
```bash
# Install MongoDB 6+
# Start MongoDB
mongod
```

### 3. Configure Environment

Create `backend/.env`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/commandcenter
REDIS_URL=redis://localhost:6379
MONGODB_URL=mongodb://localhost:27017/commandcenter
ANTHROPIC_API_KEY=your_api_key_here
JWT_SECRET=your_secret_key_here_change_in_production
PORT=3001
NODE_ENV=development
```

### 4. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Health Check: http://localhost:3001/health

## 📝 First Steps

1. **Register Account:** Go to http://localhost:3000/register
2. **Create First Log:** Navigate to "THE PULSE" and submit your first daily log
3. **Watch AI Analysis:** See real-time sentiment analysis and summary generation
4. **Track Streak:** Submit logs daily to build your streak 🔥

## 🔑 Getting Anthropic API Key

1. Visit https://console.anthropic.com/
2. Sign up for an account
3. Navigate to API Keys section
4. Create a new API key
5. Add to `backend/.env` as `ANTHROPIC_API_KEY`

## 🐛 Troubleshooting

**Database Connection Error:**
- Ensure PostgreSQL is running: `pg_isready`
- Check connection string in `.env`
- Verify database exists: `psql -l`

**Redis Connection Error:**
- Check if Redis is running: `redis-cli ping`
- Should return "PONG"

**MongoDB Connection Error:**
- Verify MongoDB is running: `mongosh`
- Check connection string format

**Port Already in Use:**
- Backend: Change `PORT` in `.env`
- Frontend: Change port in `vite.config.ts`

## 🎯 Current Features

✅ **Implemented:**
- User Authentication (Register/Login)
- Daily Log Creation with AI Analysis
- Cryptographic Signing
- Streak Tracking
- Recent Logs View
- Focus Mode
- Responsive Design

🚧 **Coming Next:**
- The Grid (Leaderboard)
- SOS Hub (Blocker Chat)
- Executive Brief (Manager Dashboard)
- Badge System
- Impact Score Calculation

## 📚 API Endpoints

**Auth:**
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login user

**Logs:**
- POST `/api/logs` - Create daily log
- GET `/api/logs/my` - Get user's logs
- PUT `/api/logs/:logId` - Update log (24hr window)

## 🎨 Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Node.js, Express, TypeScript
- **Databases:** PostgreSQL, Redis, MongoDB
- **AI:** Anthropic Claude Sonnet 4.5
- **Build Tools:** Vite, TSC

## 🔐 Security Features

- JWT Authentication
- Password Hashing (bcrypt)
- Cryptographic Log Signing (SHA-256)
- Role-Based Access Control
- Audit Trail Logging

## 📈 Next Steps

1. **Add More Users:** Register multiple accounts to test team features
2. **Submit Daily Logs:** Build streaks and test AI analysis
3. **Implement Leaderboard:** Build The Grid feature next
4. **Add Real-time Chat:** Implement SOS Hub with Socket.io
5. **Generate Reports:** Build Executive Brief with charts

## 💡 Development Tips

- Use `npm run dev` for hot-reload during development
- Check browser console for frontend errors
- Check terminal for backend errors
- Use PostgreSQL GUI tools (pgAdmin, DBeaver) for database inspection
- Use Redis CLI for cache inspection: `redis-cli`

## 🎉 Success!

If you see the login page with neon effects and can register/login, you're all set! 🚀

Start logging your daily work and watch the AI analyze your productivity!
