# 🚀 GROQ SETUP GUIDE (100% FREE - NO CREDIT CARD!)

## ✅ STEP 1: Get FREE Groq API Key (2 minutes)

### 1.1 Go to Groq Console
Open your browser and visit:
```
https://console.groq.com
```

### 1.2 Sign Up (Free)
- Click "Sign Up" or "Get Started"
- Use your Google account OR email
- **NO CREDIT CARD REQUIRED!** ✅

### 1.3 Create API Key
1. After login, click on "API Keys" in the left menu
2. Click "Create API Key"
3. Give it a name (e.g., "CommandCenter")
4. Click "Create"
5. **COPY THE KEY** (starts with `gsk_...`)
6. Save it somewhere safe!

---

## ✅ STEP 2: Add API Key to CommandCenter

### 2.1 Open the .env file
```
D:\CommandCenter\backend\.env
```

### 2.2 Replace the API key
Find this line:
```
GROQ_API_KEY=your_groq_api_key_here_get_from_console_groq_com
```

Replace with your actual key:
```
GROQ_API_KEY=gsk_your_actual_key_here
```

### 2.3 Save the file
Press `Ctrl + S` to save.

---

## ✅ STEP 3: Setup Database

### 3.1 Open Command Prompt (CMD)
Press `Windows Key + R`, type `cmd`, press Enter

### 3.2 Navigate to project
```bash
cd D:\CommandCenter
```

### 3.3 Run database setup
```bash
setup-database.bat
```

When asked "Load sample data? (Y/N):", type `Y` and press Enter.

---

## ✅ STEP 4: Start Required Services

### 4.1 Start Redis (Terminal 1)
Open a NEW Command Prompt and run:
```bash
redis-server
```
Leave this window open!

### 4.2 Start MongoDB (Terminal 2)
Open ANOTHER Command Prompt and run:
```bash
mongod
```
Leave this window open!

**Note:** PostgreSQL usually starts automatically. If not:
```bash
pg_ctl start
```

---

## ✅ STEP 5: Launch CommandCenter

### 5.1 Open Command Prompt
Open a NEW Command Prompt

### 5.2 Navigate to project
```bash
cd D:\CommandCenter
```

### 5.3 Start the app
```bash
start.bat
```

This will open TWO new windows:
- **Backend** (port 3001) - Wait for "CommandCenter Backend running"
- **Frontend** (port 3000) - Wait for "Local: http://localhost:3000"

---

## ✅ STEP 6: Use CommandCenter!

### 6.1 Open Browser
Go to:
```
http://localhost:3000
```

### 6.2 Register Account
1. Click "Register"
2. Fill in:
   - Full Name: Your Name
   - Username: yourname
   - Email: your@email.com
   - Password: (min 6 chars)
3. Click "Register"

### 6.3 Submit Your First Log
1. You'll see "THE PULSE" page
2. Type in the text area (min 10 characters):
   ```
   Today I set up CommandCenter! Configured the database, 
   added Groq API key, and got everything running. 
   Next I'll explore the features and start daily logging.
   ```
3. Click "🚀 Deploy Log"
4. Watch the confetti! 🎉
5. See AI analysis appear!

---

## 🎉 SUCCESS!

You should now see:
- ✅ Your log submitted
- ✅ AI-generated summary
- ✅ Sentiment score
- ✅ Streak counter (1 day)
- ✅ Recent logs sidebar

---

## 🐛 TROUBLESHOOTING

### "Cannot connect to database"
- Make sure PostgreSQL is running
- Check if database exists: `psql -l`
- Re-run: `setup-database.bat`

### "Redis connection failed"
- Start Redis: `redis-server`
- Check if running: `redis-cli ping` (should return "PONG")

### "MongoDB connection failed"
- Start MongoDB: `mongod`
- Check if running: `mongosh` (should connect)

### "AI analysis not working"
- Check your Groq API key in `backend\.env`
- Make sure it starts with `gsk_`
- Check backend terminal for errors

### "Port already in use"
- Close other apps using ports 3000 or 3001
- Or change ports in configs

---

## 📝 QUICK REFERENCE

**Start Everything:**
```bash
# Terminal 1
redis-server

# Terminal 2
mongod

# Terminal 3
cd D:\CommandCenter
start.bat
```

**Open App:**
```
http://localhost:3000
```

**Stop Everything:**
- Close all terminal windows
- Or press `Ctrl + C` in each terminal

---

## 💡 TIPS

1. **Log Daily** - Build your streak! 🔥
2. **Write 200+ words** - Better AI analysis
3. **Use Focus Mode** - Click "Focus Mode" for distraction-free writing
4. **Check AI Summary** - See what the AI extracted from your log
5. **Edit within 24hrs** - You can update logs for 24 hours

---

## 🎯 WHAT'S NEXT?

After your first log:
- Check your streak counter
- View recent logs
- Try editing a log
- Explore the UI
- Log daily to earn badges!

---

**🎉 Enjoy CommandCenter! 🚀**

**Questions?** Check the other documentation files:
- README.md
- DATABASE_SETUP.md
- DEPLOYMENT_GUIDE.md
