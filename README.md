# CommandCenter - Team Productivity & AI-Mentorship Ecosystem

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- MongoDB 6+

### Installation

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Add your Anthropic API key to .env
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

Create `backend/.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/commandcenter
REDIS_URL=redis://localhost:6379
MONGODB_URL=mongodb://localhost:27017/commandcenter
ANTHROPIC_API_KEY=your_api_key_here
JWT_SECRET=your_secret_here
PORT=3001
```

## 📚 Documentation

See the main project documentation for complete feature specifications.

## 🎯 Current Implementation

- ✅ The Pulse (Daily Logging with AI Analysis)
- ✅ Crypto Signing & Immutability
- ✅ Streak Tracking & Gamification
- 🚧 The Grid (Leaderboard) - Coming Next
- 🚧 SOS Hub (Blocker Chat)
- 🚧 Executive Brief

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL, Redis, MongoDB
- **AI:** Anthropic Claude Sonnet 4.5
