# CommandCenter - Quick Reference

## 🚀 Quick Commands

### Installation
```bash
# Windows
install.bat

# Manual
cd backend && npm install
cd ../frontend && npm install
```

### Database Setup
```bash
# Create database
createdb commandcenter

# Run schema
psql -d commandcenter -f database/schema.sql

# Optional: Add sample data
psql -d commandcenter -f database/seed.sql
```

### Start Development
```bash
# Backend (Terminal 1)
cd backend
npm run dev

# Frontend (Terminal 2)
cd frontend
npm run dev
```

### Build for Production
```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm run preview
```

## 📁 Project Structure

```
CommandCenter/
├── backend/
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── services/       # Business logic
│   │   ├── models/         # Database models
│   │   ├── middleware/     # Auth, validation
│   │   ├── routes/         # API routes
│   │   ├── utils/          # Helpers
│   │   └── server.ts       # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable UI
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API calls
│   │   ├── styles/         # CSS
│   │   └── App.tsx         # Main app
│   ├── package.json
│   └── vite.config.ts
└── database/
    ├── schema.sql          # Database schema
    └── seed.sql            # Sample data
```

## 🔑 Environment Variables

```env
# backend/.env
DATABASE_URL=postgresql://postgres:password@localhost:5432/commandcenter
REDIS_URL=redis://localhost:6379
MONGODB_URL=mongodb://localhost:27017/commandcenter
ANTHROPIC_API_KEY=sk-ant-xxxxx
JWT_SECRET=your-secret-key
PORT=3001
NODE_ENV=development
```

## 🌐 API Endpoints

### Authentication
```
POST /api/auth/register
Body: { email, username, fullName, password }

POST /api/auth/login
Body: { email, password }
```

### Logs (Requires Auth)
```
POST /api/logs
Headers: { Authorization: "Bearer <token>" }
Body: { entryText }

GET /api/logs/my?limit=30
Headers: { Authorization: "Bearer <token>" }

PUT /api/logs/:logId
Headers: { Authorization: "Bearer <token>" }
Body: { entryText }
```

## 🎨 Design Tokens

### Colors
```css
--neon-cyan: #00f0ff
--neon-purple: #8b5cf6
--neon-pink: #ff006e
--neon-green: #10b981
--neon-yellow: #fbbf24
--neon-orange: #f97316
```

### Fonts
```css
font-display: 'Orbitron'  /* Headers */
font-body: 'Inter'        /* Body text */
font-mono: 'JetBrains Mono' /* Code */
```

### Components
```jsx
<div className="glass-card">Glassmorphism</div>
<button className="btn-primary">Primary</button>
<button className="btn-secondary">Secondary</button>
<input className="input-field" />
<span className="neon-text">Glowing text</span>
```

## 🔐 User Roles

- **member:** Can create logs, view own data
- **manager:** Can view team data, access reports
- **admin:** Full access, can edit any data

## 📊 Database Tables

- **users:** User accounts and stats
- **daily_logs:** Work log entries
- **tasks:** Project tasks
- **blockers:** Team blockers
- **badges:** Achievement definitions
- **user_badges:** Earned badges
- **audit_logs:** Action history

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check PostgreSQL
pg_isready

# Check Redis
redis-cli ping

# Check MongoDB
mongosh
```

### Frontend won't start
```bash
# Clear cache
rm -rf node_modules
npm install

# Check port
netstat -ano | findstr :3000
```

### Database errors
```bash
# Reset database
dropdb commandcenter
createdb commandcenter
psql -d commandcenter -f database/schema.sql
```

### API errors
```bash
# Check logs
cd backend
npm run dev
# Watch console for errors
```

## 📱 URLs

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001
- **Health Check:** http://localhost:3001/health
- **API Base:** http://localhost:3001/api

## 🎯 Testing Flow

1. Register: http://localhost:3000/register
2. Login: http://localhost:3000/login
3. Submit log in "THE PULSE"
4. Check AI analysis
5. View streak counter
6. Check recent logs

## 💾 Database Queries

```sql
-- View all users
SELECT * FROM users;

-- View today's logs
SELECT * FROM daily_logs WHERE log_date = CURRENT_DATE;

-- Check streaks
SELECT username, streak_count FROM users ORDER BY streak_count DESC;

-- View badges earned
SELECT u.username, b.badge_name 
FROM user_badges ub
JOIN users u ON ub.user_id = u.user_id
JOIN badges b ON ub.badge_id = b.badge_id;
```

## 🚀 Deployment Checklist

- [ ] Set NODE_ENV=production
- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS
- [ ] Setup database backups
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Setup monitoring
- [ ] Configure logging
- [ ] Add error tracking (Sentry)
- [ ] Setup CI/CD pipeline

## 📚 Resources

- **React Docs:** https://react.dev
- **Tailwind CSS:** https://tailwindcss.com
- **Framer Motion:** https://www.framer.com/motion
- **Anthropic API:** https://docs.anthropic.com
- **PostgreSQL:** https://www.postgresql.org/docs

## 🎉 Features Checklist

✅ User authentication
✅ Daily logging
✅ AI analysis
✅ Streak tracking
✅ Crypto signing
✅ Edit history
✅ Focus mode
✅ Responsive design

🚧 Coming soon:
- Leaderboard
- Badge system
- Real-time chat
- Manager dashboard

---

**Need Help?** Check SETUP.md for detailed instructions!
