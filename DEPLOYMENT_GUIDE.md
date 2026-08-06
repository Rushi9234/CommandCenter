# 🚀 DEPLOYMENT GUIDE - Vercel + PostgreSQL

## ✅ What We're Deploying

- **Frontend:** Vercel (Free)
- **Backend:** Vercel Serverless Functions (Free)
- **Database:** Neon PostgreSQL (Free) or Supabase (Free)

---

## 📋 STEP-BY-STEP DEPLOYMENT

### **STEP 1: Install Required Package**

```bash
cd D:\CommandCenter\backend
npm install pg
npm install --save-dev @types/pg
```

---

### **STEP 2: Setup Free PostgreSQL Database**

#### **Option A: Neon (Recommended - Easiest)**

1. Go to: https://neon.tech
2. Click "Sign Up" (use GitHub/Google)
3. Create new project: "CommandCenter"
4. Copy connection string (starts with `postgresql://`)
5. Save it!

#### **Option B: Supabase**

1. Go to: https://supabase.com
2. Sign up (GitHub/Google)
3. Create new project: "CommandCenter"
4. Go to Settings → Database
5. Copy connection string (URI format)

#### **Option C: Railway**

1. Go to: https://railway.app
2. Sign up with GitHub
3. New Project → Add PostgreSQL
4. Copy connection string

---

### **STEP 3: Initialize Database**

1. **Copy your connection string**
   ```
   postgresql://user:password@host:5432/database
   ```

2. **Update backend/.env**
   ```env
   DATABASE_URL=your_connection_string_here
   ```

3. **Run schema**
   ```bash
   # Install psql or use database GUI
   psql "your_connection_string" -f database/schema.sql
   ```

   **OR use database GUI:**
   - Neon: Use SQL Editor in dashboard
   - Supabase: Use SQL Editor
   - Copy/paste schema.sql content

---

### **STEP 4: Deploy Backend to Vercel**

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Create vercel.json in backend folder**
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "src/server.ts",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "src/server.ts"
       }
     ],
     "env": {
       "NODE_ENV": "production"
     }
   }
   ```

4. **Deploy**
   ```bash
   cd D:\CommandCenter\backend
   vercel
   ```

5. **Add Environment Variables**
   ```bash
   vercel env add DATABASE_URL
   # Paste your PostgreSQL connection string

   vercel env add GROQ_API_KEY
   # Paste your Groq API key

   vercel env add JWT_SECRET
   # Enter a random secret

   vercel env add AUTO_VERIFY
   # Enter: true
   ```

6. **Deploy to production**
   ```bash
   vercel --prod
   ```

7. **Copy backend URL** (e.g., `https://commandcenter-backend.vercel.app`)

---

### **STEP 5: Deploy Frontend to Vercel**

1. **Update API URL in frontend**
   
   Create `frontend/.env.production`:
   ```env
   VITE_API_URL=https://your-backend-url.vercel.app
   ```

2. **Update api.ts**
   ```typescript
   const api = axios.create({
     baseURL: import.meta.env.VITE_API_URL || '/api',
     headers: {
       'Content-Type': 'application/json',
     },
   });
   ```

3. **Deploy**
   ```bash
   cd D:\CommandCenter\frontend
   vercel
   ```

4. **Deploy to production**
   ```bash
   vercel --prod
   ```

5. **Copy frontend URL** (e.g., `https://commandcenter.vercel.app`)

---

### **STEP 6: Configure CORS**

Update `backend/src/server.ts`:
```typescript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://commandcenter.vercel.app', // Your frontend URL
  ],
  credentials: true,
}));
```

Redeploy backend:
```bash
cd backend
vercel --prod
```

---

## ✅ VERIFICATION

### **Test Your Deployment:**

1. **Open frontend URL**
   ```
   https://commandcenter.vercel.app
   ```

2. **Register account**
   - Should work instantly (auto-verify enabled)

3. **Login**
   - Should work immediately

4. **Create data**
   - Daily logs
   - Teams
   - Projects

5. **Refresh page**
   - Data should persist! ✅

---

## 🎯 QUICK DEPLOYMENT (TL;DR)

```bash
# 1. Install dependencies
cd backend && npm install pg @types/pg

# 2. Get free PostgreSQL
# → Go to neon.tech → Create project → Copy connection string

# 3. Setup database
# → Paste schema.sql in Neon SQL Editor → Run

# 4. Deploy backend
cd backend
vercel
vercel env add DATABASE_URL
vercel env add GROQ_API_KEY
vercel env add JWT_SECRET
vercel env add AUTO_VERIFY
vercel --prod

# 5. Deploy frontend
cd ../frontend
# Create .env.production with backend URL
vercel --prod

# 6. Done! 🎉
```

---

## 💰 COSTS

### **FREE TIER:**
- ✅ Vercel: Free (Hobby plan)
- ✅ Neon PostgreSQL: Free (0.5GB storage)
- ✅ Groq API: Free (with limits)

### **LIMITS:**
- Vercel: 100GB bandwidth/month
- Neon: 0.5GB storage, 1 project
- Groq: ~30 requests/minute

**Perfect for:**
- ✅ Demos
- ✅ Small teams (< 10 users)
- ✅ Testing
- ✅ MVP

---

## 🔧 TROUBLESHOOTING

### **Issue: "Cannot connect to database"**
**Solution:**
- Check DATABASE_URL is correct
- Ensure SSL is enabled for production
- Verify database is running

### **Issue: "CORS error"**
**Solution:**
- Add frontend URL to CORS origins
- Redeploy backend

### **Issue: "Environment variables not found"**
**Solution:**
```bash
vercel env pull
vercel --prod
```

### **Issue: "Build failed"**
**Solution:**
- Check package.json has all dependencies
- Ensure TypeScript compiles: `npm run build`

---

## 📊 MONITORING

### **Check Logs:**
```bash
# Backend logs
vercel logs https://your-backend-url.vercel.app

# Frontend logs
vercel logs https://your-frontend-url.vercel.app
```

### **Database Monitoring:**
- Neon: Dashboard → Monitoring
- Supabase: Dashboard → Database → Logs

---

## 🚀 PRODUCTION CHECKLIST

- [ ] PostgreSQL database created
- [ ] Schema applied
- [ ] Backend deployed to Vercel
- [ ] Environment variables set
- [ ] Frontend deployed to Vercel
- [ ] CORS configured
- [ ] Registration works
- [ ] Login works
- [ ] Data persists
- [ ] AI features work

---

## 🎉 SUCCESS!

**Your app is now live and production-ready!**

- ✅ Data saved to PostgreSQL
- ✅ Deployed on Vercel
- ✅ Free hosting
- ✅ Scalable
- ✅ Professional

**Share your URL with your teacher! 🎓**

---

## 📝 EXAMPLE URLS

**After deployment, you'll have:**
- Frontend: `https://commandcenter-abc123.vercel.app`
- Backend: `https://commandcenter-backend-xyz789.vercel.app`
- Database: `postgresql://user:pass@host.neon.tech/db`

**All working together! 🚀**
