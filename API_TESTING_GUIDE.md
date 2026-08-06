# 🧪 API Testing Guide - New Features

## Quick Test Commands

### 1. Test Sub-Teams & RBAC

**Create Main Team:**
```bash
curl -X POST http://localhost:3001/api/teams \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teamName": "Engineering",
    "description": "Main engineering team",
    "teamType": "main"
  }'
```

**Create Sub-Team:**
```bash
curl -X POST http://localhost:3001/api/teams \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teamName": "Frontend Team",
    "description": "UI/UX developers",
    "parentTeamId": "PARENT_TEAM_ID",
    "teamType": "sub-team"
  }'
```

**Get Sub-Teams:**
```bash
curl http://localhost:3001/api/teams/TEAM_ID/sub-teams \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Update Member Role (5 roles):**
```bash
curl -X PUT http://localhost:3001/api/teams/TEAM_ID/members/USER_ID/role \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "manager"
  }'
```

**Update Custom Permissions:**
```bash
curl -X PUT http://localhost:3001/api/teams/TEAM_ID/members/USER_ID/permissions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": {
      "can_assign_tasks": true,
      "can_delete_tasks": false,
      "can_view_analytics": true
    }
  }'
```

---

### 2. Test Responsibility Mapping

**Create Task with Full Responsibility:**
```bash
curl -X POST http://localhost:3001/api/projects/PROJECT_ID/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build authentication system",
    "description": "Implement JWT-based auth",
    "owner": "USER_ID_1",
    "contributors": ["USER_ID_2", "USER_ID_3"],
    "reviewer": "USER_ID_4",
    "dependencies": ["TASK_ID_1"],
    "priority": "high"
  }'
```

**Get Tasks (with full details):**
```bash
curl http://localhost:3001/api/projects/PROJECT_ID/tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response includes:
- `owner_user` - Full user details
- `contributor_users` - Array of contributors
- `reviewer_user` - Reviewer details
- `dependency_tasks` - Linked tasks

---

### 3. Test Structured Blockers with AI

**Create Blocker (AI analyzes automatically):**
```bash
curl -X POST http://localhost:3001/api/blockers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": "TEAM_ID",
    "title": "Database connection timeout",
    "description": "Users experiencing 30-second delays on login",
    "blockerType": "technical",
    "urgency": "critical",
    "impact": "blocks_team",
    "affectedTasks": ["TASK_ID_1", "TASK_ID_2"],
    "attemptedSolutions": "Tried increasing connection pool size, restarted server"
  }'
```

Response includes:
- `ai_suggestions` - AI-generated solutions
- `similar_blockers` - Past resolved blockers
- `suggested_helpers` - Team members who can help

---

### 4. Test AI Standup Generator

**Generate Personal Standup:**
```bash
curl http://localhost:3001/api/logs/standup \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Generate Team Standup:**
```bash
curl "http://localhost:3001/api/logs/standup?teamId=TEAM_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response includes:
```json
{
  "success": true,
  "data": {
    "summary": "Team made good progress today...",
    "highlights": [
      "Completed authentication system",
      "Fixed critical bug in payment flow"
    ],
    "blockers": [
      "Database timeout issues"
    ],
    "team_mood": "positive",
    "logs": [...],
    "generated_at": "2024-01-15T10:30:00Z"
  }
}
```

---

## Testing Workflow

### Step 1: Register & Login
```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "fullName": "Test User",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Save the token from response
```

### Step 2: Create Team Structure
1. Create main team
2. Create sub-teams
3. Add members with different roles
4. Test permissions

### Step 3: Create Project & Tasks
1. Create project
2. Create tasks with owner/contributors/reviewer
3. Add dependencies
4. View task details

### Step 4: Test Blocker System
1. Create blocker with full details
2. Check AI suggestions
3. View similar blockers
4. See suggested helpers

### Step 5: Generate Standup
1. Create daily logs
2. Generate personal standup
3. Generate team standup
4. Review AI summary

---

## Expected Results

### ✅ Sub-Teams:
- Teams can have parent teams
- Sub-teams appear in hierarchy
- Departments can be created

### ✅ RBAC:
- 5 roles work: owner, admin, manager, member, viewer
- Permissions are customizable
- Access control enforced

### ✅ Responsibility Mapping:
- Tasks show owner, contributors, reviewer
- Dependencies are tracked
- User details populated

### ✅ Blocker Intelligence:
- AI generates 3-5 solutions
- Similar blockers found
- Helpers suggested (admins/managers first)

### ✅ Standup Generator:
- Personal standup works
- Team standup aggregates all members
- AI provides summary, highlights, blockers
- Team mood assessed

---

## Troubleshooting

### Issue: "Authorization failed"
**Solution:** Make sure you're using a valid JWT token from login

### Issue: "Access denied to this team"
**Solution:** User must be a team member to access team data

### Issue: "AI suggestions empty"
**Solution:** Check GROQ_API_KEY in backend/.env

### Issue: "Similar blockers not found"
**Solution:** Create and resolve some blockers first for matching

---

## Performance Notes

- AI analysis adds ~1-2 seconds to blocker creation
- Standup generation takes ~2-3 seconds
- All other operations are instant (in-memory DB)

---

## Next Steps

1. ✅ Test all endpoints
2. ✅ Verify AI responses
3. ✅ Check access control
4. 🚧 Build frontend UI (optional)
5. 🚧 Migrate to real databases

---

**Happy Testing! 🚀**
