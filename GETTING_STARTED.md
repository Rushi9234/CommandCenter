# 🚀 GETTING STARTED - CommandCenter

## ✅ INSTALLATION COMPLETE!

Dependencies have been installed for both backend and frontend.

---

## 📋 PREREQUISITES CHECKLIST

Before running CommandCenter, ensure you have:

- [ ] **PostgreSQL 14+** installed and running
- [ ] **Redis 7+** installed and running  
- [ ] **MongoDB 6+** installed and running
- [ ] **Anthropic API Key** (get from https://console.anthropic.com)

---

## 🔧 SETUP STEPS

### Step 1: Install Databases (if not already installed)

**PostgreSQL:**
- Download: https://www.postgresql.org/download/windows/
- Install and remember your password

**Redis:**
- Download: https://github.com/microsoftarchive/redis/releases
- Or use WSL: `sudo apt install redis-server`

**MongoDB:**
- Download: https://www.mongodb.com/try/download/community
- Install as a service

### Step 2: Setup Database

Run the database setup script:
```bash
setup-database.bat
```

This will:
- Create the `commandcenter` database
- Apply the schema (10 tables)
- Optionally load sample data

### Step 3: Configure API Key

1. Get your Anthropic API key from https://console.anthropic.com
2. Open `backend\.env`
3. Replace `your_key_here` with your actual API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-YOUR_ACTUAL_KEY_HERE
   ```

### Step 4: Start Services

Make sure these are running:
```bash
# PostgreSQL (usually runs as service)
# Check: pg_isready

# Redis
redis-server

# MongoDB  
mongod
```

### Step 5: Start CommandCenter

Run the startup script:
```bash
start.bat
```

This will open two terminal windows:
- **Backend** (port 3001)
- **Frontend** (port 3000)

### Step 6: Open Browser

Navigate to:
```
http://localhost:3000
```

---

## 🎯 FIRST TIME USAGE

1. **Register Account**
   - Click "Register" 
   - Fill in your details
   - Create your account

2. **Submit First Log**
   - Go to "THE PULSE"
   - Write about your work (min 10 chars)
   - Click "🚀 Deploy Log"
   - Watch the confetti! 🎉

3. **Check AI Analysis**
   - See sentiment score
   - Read AI-generated summary
   - View quality score

4. **Build Your Streak**
   - Log daily to increase streak 🔥
   - Earn badges at 7, 30, 100 days

---

## 🐛 TROUBLESHOOTING

### Backend won't start
```bash
# Check PostgreSQL
pg_isready

# Check Redis
redis-cli ping
# Should return: PONG

# Check MongoDB
mongosh
# Should connect
```

### Database connection error
- Verify PostgreSQL is running
- Check password in `backend\.env`
- Ensure database exists: `psql -l`

### Port already in use
- Backend: Change PORT in `backend\.env`
- Frontend: Change port in `frontend\vite.config.ts`

### AI analysis not working
- Check Anthropic API key in `backend\.env`
- Verify key is valid at https://console.anthropic.com
- Check backend console for errors

---

## 📚 USEFUL COMMANDS

### Backend
```bash
cd backend
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Run production build
```

### Frontend
```bash
cd frontend
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

### Database
```bash
# Connect to database
psql -d commandcenter

# View tables
\dt

# View users
SELECT * FROM users;

# View logs
SELECT * FROM daily_logs;

# Reset database
dropdb commandcenter
createdb commandcenter
psql -d commandcenter -f database\schema.sql
```

---

## 🎨 FEATURES TO TRY

- ✨ **Focus Mode** - Distraction-free writing
- 🔥 **Streak Tracking** - Log daily to build streaks
- 🤖 **AI Analysis** - Get instant insights
- ✏️ **Edit Logs** - Update within 24 hours
- 📊 **Recent Logs** - View your history

---

## 📖 DOCUMENTATION

- **README.md** - Project overview
- **SETUP.md** - Detailed setup guide
- **PROJECT_STATUS.md** - Features & roadmap
- **QUICK_REFERENCE.md** - Command cheat sheet
- **BUILD_COMPLETE.md** - Build summary

---

## 🆘 NEED HELP?

1. Check the documentation files
2. Review error messages in terminal
3. Verify all services are running
4. Check `.env` configuration

---

## 🎉 YOU'RE READY!

Everything is set up and ready to go!

**Next:** Run `start.bat` and open http://localhost:3000

**Happy logging!** 🚀
