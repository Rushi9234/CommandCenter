# COMMANDCENTER — CORE WORK TRANSPARENCY & PRIVACY DESIGN SPECIFICATION

**Document Version:** 1.0
**Date:** 2026-09-15
**Status:** Authoritative Architectural Design Specification (DESIGN ONLY)
**Target Workspace:** `D:\CommandCenter - Copy (2)`
**Audience:** Product, Engineering, Architecture, Security

---

## 1. EXECUTIVE SUMMARY

This document establishes the comprehensive architectural and product design specification for **CommandCenter's Core Work Transparency & Privacy System**.

CommandCenter addresses a fundamental challenge in team management: enabling decision-useful work visibility across individual, team, and coordinator levels while maintaining strict privacy boundaries for private communication and personal data.

This specification unifies existing domain entities (**Projects, Tasks, Goals, Daily Work, SOS Blockers**) into a formal **Work Transparency Model**. It defines exact organizational visibility rules, progress calculations, visual analytics, attention indicators, and cross-feature privacy inheritance. Furthermore, it introduces the **Chat Historical Membership Privacy Boundary** specification to ensure team communication remains strictly isolated to authorized visibility epochs.

---

## 2. PRODUCT NORTH STAR & CORE PRINCIPLES

### Product North Star Statement
> **"CommandCenter makes team work transparent at the right organizational level while keeping private communication and personal information private."**

### Inseparable Core Principles

1. **Work Transparency is a Core Product Value**
   The system must explicitly visualize assigned work, work in progress, completed work, remaining work, overdue work, confirmed Daily Work, and verified progress trends over time.

2. **Transparency is Hierarchical (`Individual → Team → Classroom/Coordinator`)**
   - **Individual**: Understands own workload, active responsibilities, daily logs, and personal progress.
   - **Team**: Team leader sees member-level assigned, completed, in-progress, remaining, and overdue work.
   - **Classroom / Coordinator**: Teacher/coordinator sees team-level comparative progress and aggregate metrics, with authorized drill-down strictly bounded by team ownership.

3. **Work Transparency Dashboard is a First-Class Direction**
   Dashboards exist to serve specific operational decision-making needs (e.g., progress trends, workload distribution, risk indicators). Decorative charts without a decision use case are strictly forbidden.

4. **Contribution Must Be Based on Real Work Artifacts**
   Productivity and contribution are evaluated solely through objective, verifiable work artifacts: Tasks, Goals, Projects/Deliverables, confirmed Daily Work, and Milestones.
   *Surveillance Rule:* The system strictly forbids using chat message count, login frequency, online presence indicators, page views, keyboard/mouse activity, or arbitrary engagement signals to measure contribution or productivity.

5. **Privacy is a Core Product Value**
   Transparency of work artifacts must never compromise the privacy of personal conversations, direct messages, or sensitive user data.

6. **Backend Authorization is the Security Boundary**
   Frontend visibility rules are UX conveniences only. Every sensitive read, write, or aggregation request must be strictly validated server-side based on live database authorization.

---

## 3. CORE WORK TRANSPARENCY MODEL

### 3.1 Work Item Lifecycle States

CommandCenter unifies task, goal, and project states into a standardized lifecycle model:

```
[ Assigned / Backlog ] ──> [ In Progress ] ──> [ Completed ]
        │                        │
        ├──> [ Blocked ] <───────┤
        │                        │
        └──> [ Overdue ] <───────┘
```

1. **Assigned (Backlog / Todo)**: Work item is explicitly created and assigned to an owner, but active effort has not yet commenced.
   - *Task State*: `status = 'todo'`.
   - *Goal State*: `status = 'active'`, `progress = 0`.
2. **In Progress**: Work item is currently under active execution.
   - *Task State*: `status = 'in_progress'` or `status = 'review'`.
   - *Goal State*: `status = 'active'`, `progress > 0` and `progress < 100`.
3. **Completed**: Work item is verified finished.
   - *Task State*: `status = 'done'`, `completed_at IS NOT NULL`.
   - *Goal State*: `status = 'completed'`, `progress = 100`, `completed_at IS NOT NULL` (after required leader review approval for team goals).
4. **Remaining**: Derived state representing work that is incomplete.
   - *Formula*: `Remaining = Assigned + In_Progress + Blocked + Overdue`.
5. **Overdue**: Incomplete work item whose target deadline has elapsed.
   - *Task Condition*: `status != 'done'` AND `due_date < CURRENT_TIMESTAMP`.
   - *Goal Condition*: `status != 'completed'` AND `target_date < CURRENT_DATE`.
6. **Blocked**: Work item with an active, unresolved SOS Blocker linked via `affected_tasks` or team blocker context.
   - *Condition*: Associated with an open/in-progress row in `blockers` table (`status IN ('open', 'in_progress')`).
7. **Cancelled / Reopened**:
   - *Reopened Task*: Status transitioned from `done` back to `in_progress` or `todo`. `completed_at` is cleared to `NULL`.
   - *Cancelled Goal/Task*: Deleted via creator/owner action or archived via status mutation.

### 3.2 Contributing Artifact Entities

| Entity | Raw Work Facts | Derived Metrics | Visual Summaries |
|---|---|---|---|
| **Tasks** (`tasks`) | `status`, `priority`, `owner_id`, `due_date`, `completed_at`, `project_id` | Count done/todo/in_progress, % task completion rate, overdue task count. | Stacked progress bar (Done / In Progress / Todo), Task distribution list. |
| **Goals** (`goals`) | `progress` (0-100), `status`, `created_by`, `target_date`, `parent_goal_id` | Average goal progress %, count active vs completed goals, milestone approval state. | Progress ring, Goal hierarchy tree view. |
| **Daily Work** (`daily_logs`) | `log_text`, `quality` (1-5), `date`, `user_id` | Log submission count today, average quality rating, streak count (`streak_count`). | Daily submission status badge, streak counter pill. |
| **Blockers** (`blockers`) | `urgency`, `impact`, `status`, `affected_tasks` | Open blocker count per team, average resolution time, critical blocker flag. | SOS Alert banner, Blocker list badge. |

---

## 4. ORGANIZATIONAL VISIBILITY HIERARCHY

CommandCenter structures work visibility across three distinct tiers:

```
Individual Contributor
        ↓
    Team Level
        ↓
Classroom / Coordinator
```

### 4.1 Individual Tier
- **Viewer**: Authenticated user (`req.user.userId`).
- **Can View**:
  - Own assigned tasks across all teams (`owner_id = userId` or listed in `contributors`).
  - Own created goals and personal goals (`created_by = userId` or `team_id IS NULL`).
  - Own Daily Work entries (`daily_logs` where `user_id = userId`).
  - Own impact score, streak count, and personal notification list.
- **Privacy Restriction**: Individual cannot view private tasks, goals, or daily logs of users in teams where the viewer has no active membership.

### 4.2 Team Tier
- **Viewer**: Team Member (`member`, `manager`), Team Leader (`owner`, `admin`).
- **Can View**:
  - All team-scoped projects, tasks, goals, and daily work submissions for that team.
  - Member-level work breakdown (who is assigned to what task/goal within the team).
  - Team open blockers and team activity feed.
- **Leader Extensions (`owner`, `admin`)**:
  - Member-level assigned vs completed vs remaining work breakdown.
  - Overdue tasks and stalled goals across the team.
  - Goal creation approvals and goal completion review workflow.
- **Privacy Restriction**: Team members cannot view private communications (Direct Messages or private notes) of other team members, nor data from unassociated teams.

### 4.3 Classroom / Coordinator Tier
- **Viewer**: Parent Team Leader / Teacher / Coordinator (`owner` or `admin` of a parent team with `parent_team_id` sub-teams).
- **Can View**:
  - Aggregate metrics across all sub-teams (`GET /api/teams/:id/context-dashboard`): total member count, daily submission counts, open blocker count, aggregate task completion counts (`done_tasks` / `total_tasks`).
  - Comparative team progress metrics across child teams.
  - Sub-team drill-down: Can navigate into an authorized child team to view team work items.
- **Strict Privacy Restrictions**:
  - Coordinator access is **aggregate-first**. Child team member-level task/log detail is accessible only through explicit authorized team drill-down.
  - Coordinators do **NOT** gain access to child-team private chat channels or DMs.
  - Parent-team membership does NOT grant administrative write control over child teams unless explicitly assigned in `team_members`.

---

## 5. VISIBILITY MATRIX

The following matrix specifies permission boundaries across all CommandCenter roles and product surfaces.

### Roles Reference:
- **Global Roles**: `admin`, `user` (`req.user.role`).
- **Team Roles**: `owner`, `admin`, `manager`, `member`, `viewer` (`team_members.role`).

| Feature / Artifact | Individual (Self) | Team Member | Team Manager | Team Leader (Owner/Admin) | Coordinator (Parent Owner/Admin) | Non-Member / Foreign |
|---|---|---|---|---|---|---|
| **User Profile / Settings** | View/Edit Own | View Public | View Public | View Public | View Public | View Public |
| **Assigned Tasks** | View/Edit Own | View Team | View/Edit Team | View/Edit/Manage Team | View (via Drill-down) | Never Allowed |
| **Completed Tasks** | View Own | View Team | View Team | View/Manage Team | View Aggregate / Drill-down | Never Allowed |
| **Projects** | View/Edit Own | View Team | View/Edit Team | View/Edit/Manage Team | View Aggregate / Drill-down | Never Allowed |
| **Goals (Personal)** | View/Edit/Delete | Never Allowed | Never Allowed | Never Allowed | Never Allowed | Never Allowed |
| **Goals (Team)** | View Own | View Team | View/Submit Team | View/Approve/Manage Team | View Aggregate / Drill-down | Never Allowed |
| **Daily Work (Logs)** | View/Edit Own | View Team Feed | View Team Feed | View Team Feed | View Aggregate Count | Never Allowed |
| **SOS Blockers** | View/Edit Own | View/Comment Team | View/Comment Team | View/Resolve Team | View Aggregate Count | Never Allowed |
| **Team Progress** | View Own Teams | View Team | View Team | View Team | View Comparative Teams | Never Allowed |
| **Work Distribution** | View Own | View Team | View Team | View Full Team Breakdown | View Sub-team Summaries | Never Allowed |
| **Team Chat** | View/Send (Active) | View/Send (Active) | View/Send (Active) | View/Send (Active) | Never (unless Member) | Never Allowed |
| **Direct Messages** | View/Send (Participant) | Never (unless Part.) | Never (unless Part.) | Never (unless Part.) | Never Allowed | Never Allowed |
| **Notifications** | View/Manage Own | View Own | View Own | View Own | View Own | Never Allowed |
| **Analytics (Context)** | View Own | View Team | View Team | View Team Analytics | View Coordinator Dashboard | Never Allowed |
| **AI Insights** | View Own Scope | View Team Scope | View Team Scope | View Team Scope | View Aggregate Scope | Never Allowed |
| **Realtime Events** | Filtered (Self) | Filtered (Team) | Filtered (Team) | Filtered (Team) | Filtered (Parent Team) | Never Allowed |
| **Future Search** | Filtered (Self) | Filtered (Team) | Filtered (Team) | Filtered (Team) | Filtered (Coordinator Scope) | Never Allowed |
| **Future Exports** | Export Own | Export Team | Export Team | Export Team | Export Class Aggregate | Never Allowed |
| **Work-State History** | View Own | View Team | View Team | View Team History | View Aggregate History | Never Allowed |

---

## 6. TEAM LEADER DASHBOARD SPECIFICATION

The Team Leader Dashboard provides team leads (`owner`, `admin`, `manager`) with immediate, operational answers to critical work management questions.

### 6.1 Core Questions Answered
1. What is the team's total progress across active projects and goals?
2. How many tasks are completed, in-progress, remaining, and overdue?
3. What is each member currently assigned to and working on?
4. Which workstreams or members require immediate leader attention?
5. Is team velocity and log consistency improving over time?

### 6.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SUMMARY CARDS: Team Progress | Completed Work | Overdue | Open Blockers │
├─────────────────────────────────────────────────────────────────────────┤
│ ATTENTION / RISK BANNER: Member X Stalled | Task Y Overdue | SOS Alert │
├──────────────────────────────────┬──────────────────────────────────────┤
│ WORK DISTRIBUTION (Stacked Bar)  │ PROGRESS TREND (Line Chart)          │
│ Member A: [Done|InProg|Remaining]│ Goal/Task Completion Over Time       │
│ Member B: [Done|InProg|Remaining]│                                      │
├──────────────────────────────────┴──────────────────────────────────────┤
│ MEMBER DRILL-DOWN TABLE                                                 │
│ Member Name | Active Tasks | Completed | Overdue | Daily Log | Status   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### A. Summary Cards
- **Overall Team Progress**: Weighted average of active goal progress % and task completion %.
- **Task Completion Breakdown**: Total Tasks = `Completed` + `In Progress` + `Todo` + `Overdue`.
- **Overdue Work Alert**: Count of tasks/goals past deadline.
- **Open SOS Blockers**: Active unresolved blockers count.

#### B. Member Work Distribution (Stacked Bar)
- Visualizes work allocation per team member.
- *Segments*: Completed (Green), In Progress (Blue), Todo (Gray), Overdue (Red).
- *Source*: `tasks WHERE project_id IN (team_projects) GROUP BY owner_id, status`.

#### C. Assigned vs Completed vs Remaining
- Comparative metric showing total workload vs completed output.

#### D. Overdue Work Section
- List of tasks/goals where `due_date < NOW()` and `status != 'done'`. Shows owner name, due date, and days overdue.

#### E. Progress Trend (Line Chart)
- 7-day or 30-day cumulative work completion trend line.

#### F. Attention Indicators
- Rule-based alerts pointing out blocked, overdue, or unlogged team members.

#### G. Team → Member → Work Item Drill-Down
- Clicking a team member expands their active task list, goal contributions, and daily log submission status.

---

## 7. CLASSROOM / COORDINATOR DASHBOARD SPECIFICATION

The Coordinator Dashboard enables instructors, department heads, and coordinators (`owner`/`admin` of a parent team) to monitor multiple sub-teams without invading private spaces.

### 7.1 Hierarchical Drill-Down Model

```
Parent Team (Classroom / Department)
    ↓
Sub-Team Comparative Grid (Team A, Team B, Team C)
    ↓
Sub-Team Detail (Context Dashboard Aggregates)
    ↓
Authorized Member Work Items (Work Artifacts Only)
```

### 7.2 Metrics & Views

1. **Class Progress Summary Card**:
   - Total Enrolled Sub-Teams.
   - Aggregate Member Count across all sub-teams.
   - Total Daily Log Submissions Today across all sub-teams.
   - Total Open Blockers across class.
   - Class Task Completion Rate: `SUM(child_done_tasks) / SUM(child_total_tasks)`.

2. **Team Comparison Grid**:
   - Card/Table per child team displaying:
     - Team Name & Leader Name.
     - Direct & Recursive Member Count.
     - Today's Daily Log Submission Rate (`submissions / member_count`).
     - Open SOS Blocker Count.
     - Task Completion Progress Bar (`done_tasks / total_tasks`).
     - Attention Status: `On Track`, `Needs Attention`, or `At Risk`.

3. **Teams Needing Attention Panel**:
   - Automatically surfaces child teams with >2 open blockers, <50% daily log submission rate, or >20% overdue tasks.

4. **Drill-Down Constraints**:
   - Clicking a child team loads the child team's detail pane (`selectTeam`).
   - The coordinator can view child team tasks, goals, and blocker status.
   - The coordinator CANNOT view child team private chat channels or direct messages.

---

## 8. VISUALIZATION DESIGN SPECIFICATION

Every chart and visual indicator in CommandCenter must serve an explicit operational decision-making purpose.

| Visualization | Primary Purpose | Source Data | Intended Viewer | Use Case & Action | Privacy Scoping |
|---|---|---|---|---|---|
| **Line Chart** | Progress Trend Over Time | Historical completed task timestamps & goal updates (`completed_at`). | Team Lead, Coordinator | Detects acceleration or velocity drops over 7-30 days. | Team-level or Class aggregate data only. |
| **Stacked Bar Chart** | Work Distribution per Member | `tasks` grouped by `owner_id` and `status`. | Team Lead | Identifies workload imbalance (e.g. Member A overloaded while Member B has 0 assigned). | Team-scoped work items only. |
| **Bar Chart** | Team Comparison | Sub-team aggregate metrics (`tasks_done`, `log_submissions`). | Coordinator, Instructor | Identifies underperforming or struggling sub-teams in a class. | Aggregate sub-team counts only. |
| **Donut / Pie Chart** | Work Status Breakdown | Team `tasks` status (`todo`, `in_progress`, `review`, `done`). | Team Lead, Member | Instant snapshot of team workload stage distribution. | Team-scoped tasks only. |
| **Attention Cards** | Actionable Risk Alerts | `blockers`, overdue `tasks`, missing `daily_logs`. | Team Lead, Coordinator | Direct call to action: resolve blocker, reassign overdue task, check on unlogged member. | Rule-based signals, no surveillance data. |
| **Activity Heatmap** | Daily Work Consistency | `daily_logs.date` matrix for current user or team. | Individual, Team Lead | Encourages personal daily logging habit; tracks team log consistency. | Log submission dates only (no private log text). |

---

## 9. PROGRESS CALCULATION MODEL

CommandCenter enforces strict mathematical models for calculating progress across individual, team, and coordinator scopes.

### 9.1 Fundamental Rule: Concept Separation
Stored Goal Progress (`goals.progress` 0-100%) and Task Completion Percentage (`done_tasks / total_tasks` 0-100%) represent two distinct operational concepts and MUST NOT be blindly merged into a single unweighted average.

### 9.2 Calculation Formulas

#### 1. Task Progress Percentage ($P_{\text{task}}$)
$$P_{\text{task}} = \begin{cases}
0\% & \text{if } N_{\text{total}} = 0 \\
\left( \frac{N_{\text{done}}}{N_{\text{total}}} \right) \times 100\% & \text{if } N_{\text{total}} > 0
\end{cases}$$
- **Numerator ($N_{\text{done}}$)**: Tasks with `status = 'done'`.
- **Denominator ($N_{\text{total}}$)**: Total active tasks (`status IN ('todo', 'in_progress', 'review', 'done')`). Cancelled/deleted tasks excluded.

#### 2. Goal Progress Percentage ($P_{\text{goal}}$)
$$P_{\text{goal}} = \begin{cases}
0\% & \text{if } G_{\text{total}} = 0 \\
\frac{\sum_{i=1}^{G_{\text{total}}} \text{progress}_i}{G_{\text{total}}} & \text{if } G_{\text{total}} > 0
\end{cases}$$
- Includes approved active/completed goals. Goals pending creation approval are excluded from the denominator.

#### 3. Overall Team Progress Index ($P_{\text{team}}$)
When a single composite progress index is displayed for a team:
$$P_{\text{team}} = (W_{\text{task}} \times P_{\text{task}}) + (W_{\text{goal}} \times P_{\text{goal}})$$
- **Default Weights**: $W_{\text{task}} = 0.5$, $W_{\text{goal}} = 0.5$.
- If $G_{\text{total}} = 0$, $P_{\text{team}} = P_{\text{task}}$.

#### 4. Coordinator Class Progress Index ($P_{\text{class}}$)
$$P_{\text{class}} = \frac{\sum_{j=1}^{T_{\text{sub}}} P_{\text{team}, j}}{T_{\text{sub}}}$$
- Unweighted average of overall team progress across $T_{\text{sub}}$ child teams.

### 9.3 Edge Cases & State Rules
- **Overdue Work**: Does not alter progress percentage directly, but increments `overdue_count` and triggers `At Risk` attention state.
- **Blocked Work**: Tasks linked to active blockers remain in denominator $N_{\text{total}}$.
- **Reopened Work**: Transitioning task from `done` to `in_progress` decrements $N_{\text{done}}$, reducing $P_{\text{task}}$ immediately.
- **Missing Data**: Teams with zero tasks and zero goals display `No Active Work` state ($P = \text{N/A}$).

---

## 10. CONTRIBUTION & WORK DISTRIBUTION MODEL

CommandCenter defines work distribution objectively, ensuring transparency without creating toxic surveillance rankings.

### 10.1 Work Distribution Principles
- **Objective Artifact Basis**: Contribution is measured by assigned tasks, completed tasks, active goals, and submitted daily logs.
- **No Surveillance Metrics**: Message frequency, login count, online indicator, or mouse clicks are strictly excluded.
- **Work Distribution vs. Productivity Score**: CommandCenter displays *what people are working on* (work distribution), NOT an opaque score declaring who is "best".

### 10.2 Transparent Impact Score Formula (Existing Verified Model)
CommandCenter retains its existing, transparent, verified impact scoring model (`users.impact_score`):

$$\text{Impact Score} = \text{workPoints} + \text{consistencyPoints}$$

Where:
$$\text{workPoints} = (\text{Completed Tasks} \times 5) + \text{Average Daily Log Quality (1-5)}$$
$$\text{consistencyPoints} = \text{Streak Count} \times 2$$

- **Explainability**: Every component is explicitly broken down for the user (e.g. "10 tasks completed = 50 pts + avg quality 4.0 = 54 workPoints + 5-day streak = 10 consistencyPoints -> Total 64 pts").

---

## 11. ATTENTION & RISK MODEL

The Attention & Risk Model automatically surfaces teams or members requiring leader support using transparent, rule-based triggers.

### 11.1 Risk Levels & Rule Matrix

| Attention Level | Visual Badge | Trigger Conditions (Any 1 triggers state) | Audience | Displayed Explanation |
|---|---|---|---|---|
| **On Track** | 🟢 Green Pill | Progress on schedule, 0 open blockers, <10% overdue tasks, >80% daily log rate. | Team Lead, Coordinator | "Team is progressing normally with active work logs." |
| **Needs Attention** | 🟡 Yellow Pill | 1-2 open blockers OR 10-25% overdue tasks OR daily log rate between 50-80% OR stalled progress (0 completion in 5 days). | Team Lead, Coordinator | "Attention needed: [Count] open blocker / overdue tasks pending." |
| **At Risk** | 🔴 Red Pill | >2 open blockers OR >25% overdue tasks OR daily log rate <50% OR critical urgency blocker open >48 hrs. | Team Lead, Coordinator | "At Risk: Multiple unresolved blockers or high overdue task volume." |

### 11.2 Individual Member Attention Triggers (Team Lead View)
- **Stalled Member Alert**: Assigned >3 tasks with 0 completed in last 7 days.
- **Unlogged Work Alert**: Member has not submitted a Daily Work entry in >2 consecutive workdays.
- **Blocked Member Alert**: Assigned to a task linked to an active SOS Blocker.

---

## 12. WORK-STATE HISTORY & AUDIT MODEL

CommandCenter specifies a lightweight audit log model for tracking meaningful state transitions across work artifacts.

### 12.1 Tracked Transitions
1. **Task Transitions**: `created`, `assigned`, `status_changed` (`todo` → `in_progress` → `review` → `done`), `reopened`, `due_date_changed`.
2. **Goal Transitions**: `created`, `submitted_for_review`, `creation_approved`, `creation_rejected`, `review_approved`, `returned`.
3. **Blocker Transitions**: `created`, `status_changed`, `resolved`.
4. **Team Membership Transitions**: `join_requested`, `approved`, `rejected`, `role_changed`, `member_removed`.

### 12.2 Retained Event Schema Specification (Design Only)
```sql
-- Design specification for future audit model (NOT implemented in current task)
CREATE TABLE work_state_audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL, -- 'task', 'goal', 'blocker', 'team_member'
    entity_id UUID NOT NULL,
    team_id UUID NULL,
    actor_user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    previous_state JSONB NULL,
    new_state JSONB NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 13. CHAT HISTORICAL MEMBERSHIP PRIVACY SPECIFICATION

This section details the mandatory privacy specification for team chat message visibility across membership changes.

### 13.1 Problem Scenario
User Alice, Bob, and Charlie create messages in Team Alpha's chat channel during Week 1. On Week 2, User David joins Team Alpha. On Week 3, User Charlie leaves Team Alpha.

### 13.2 Required Privacy Rules

```
Week 1: [Alice, Bob, Charlie chat] ──> Messages M1..M10 created
Week 2: [David joins Team Alpha] ───> David's Visibility Boundary = M11
        - David CANNOT see M1..M10 (Pre-membership messages)
        - David CAN see M11+ (Post-membership messages)
Week 3: [Charlie removed from Team] ─> Charlie's access REVOKED immediately
        - Charlie CANNOT see any team chat messages.
        - Alice, Bob, David CAN still see Charlie's historical messages M1..M10.
```

1. **Pre-Membership Boundary**: A newly joined team member MUST NOT see team-chat messages created prior to their authorized membership start timestamp (`joined_at`).
2. **Immediate Revocation on Removal**: A user removed from a team loses read and write access to team chat IMMEDIATELY.
3. **Rejoin Isolation**: If a removed member later rejoins the team, they MUST NOT automatically regain access to historical chat messages from their earlier membership epoch unless an explicit future policy grants it.
4. **Retention for Remaining Members**: Messages created by a user who subsequently leaves the team remain visible to remaining authorized team members who were active when the message was sent.

### 13.3 Architectural Data Design (`visibility_start_seq` / `joined_at`)
To enforce this without complex message duplication, team chat authorization queries will filter messages by:

$$\text{WHERE } \text{conversation\_id} = C \text{ AND } \text{seq} \ge \text{user\_membership\_start\_seq}$$

Where `user_membership_start_seq` is the monotonic message `seq` counter recorded in `conversation_participants.joined_at` or a `membership_epochs` table when the user joined the team.

---

## 14. CROSS-FEATURE PRIVACY INHERITANCE

Visibility boundaries defined for core entities must propagate consistently across all secondary product surfaces.

```
                  ┌─────────────────────────────┐
                  │ Core Authorization Boundary │
                  └──────────────┬──────────────┘
                                 │
   ┌──────────────┬──────────────┼──────────────┬──────────────┐
   ↓              ↓              ↓              ↓              ↓
Chat Search   Notifications   Realtime (SSE)  AI Insights   Exports
```

1. **Notifications**: Notification delivery (`notifyUser`) must re-verify live recipient authorization. A user removed from a team must not receive SSE notifications or unread bell items for team events occurring post-removal.
2. **Realtime (SSE)**: SSE event publishers (`inMemoryRealtimeProvider`) must verify recipient membership before emitting events. If a user is removed from a team, their active SSE connection must stop receiving team-scoped event pings.
3. **Chat Search**: Future search queries across team messages must append the user's `visibility_start_seq` boundary to prevent indexing or returning pre-membership messages.
4. **Data Exports**: CSV/JSON exports must execute through the identical server-side authorization layer as dashboard views. Exporting team data returns only work items the requesting user is authorized to view.
5. **Client Caching**: Client-side storage (React state / refetch caches) must be purged upon team removal or logout to prevent stale unauthorized data display.

---

## 15. AI PRIVACY BOUNDARY SPECIFICATION

CommandCenter's AI capabilities (Groq / Gemini / Claude mentor advice and blocker suggestions) must adhere strictly to user authorization boundaries.

### 15.1 Core Rule: $\text{AI Access Scope} = \text{Caller's Authorized Scope}$
The AI engine is treated as an automated proxy for the requesting user. It MUST NOT execute database queries or analyze data beyond what the calling user could explicitly read directly.

### 15.2 Authorized vs. Prohibited AI Queries

| Scenario | Requesting Role | Prompt / Query | Allowed / Prohibited | Technical Enforcement |
|---|---|---|---|---|
| **Blocker Suggestion** | Team Member | "How do we resolve this blocker on Task X?" | ✅ ALLOWED | Context includes only blocker details and linked team task description. |
| **Team Progress Summary** | Team Leader | "Summarize work completed by my team this week." | ✅ ALLOWED | Context includes team tasks and daily log summaries for team members. |
| **Coordinator Summary** | Coordinator | "Which sub-teams are behind schedule?" | ✅ ALLOWED | Context includes aggregate completion rates across child teams. |
| **Private Chat Summarization** | Coordinator | "Summarize Team Alpha's private team chat." | ❌ PROHIBITED | AI prompt construction rejects private chat text for non-participants. |
| **Cross-Team Data Leak** | Team Member | "What is Team Beta working on?" (Unassociated team) | ❌ PROHIBITED | Service layer rejects fetching Team Beta rows before prompt assembly. |
| **Personal Data Extraction** | Any Role | "Show me User Y's password hash / phone number." | ❌ PROHIBITED | Personal/security fields excluded from AI context builder schemas. |

---

## 16. NOTIFICATION PRIVACY SPECIFICATION

Notifications (`backend/src/modules/notifications/`) carry sensitive work and collaboration alerts.

### 16.1 Rules
1. **Server-Computed Recipients**: Notification recipient user IDs are computed strictly server-side based on live membership rules (`notifyTeamMembersByRole`).
2. **No Content Leaks in SSE Pings**: `notification.created` SSE pings carry thin metadata (`id`, `category`, `recipientUserId`). Full message content is fetched via authenticated REST API (`GET /notifications`).
3. **Deep-Link Authorization Re-check**: Clicking a notification deep-link (`/teams?teamId=X` or `/chat?conversation=Y`) forces a live server-side authorization check upon navigation. If access was revoked after notification delivery, the user receives a clean `403 Forbidden` / `404 Not Found` page rather than leaked data.
4. **Chat Notification Previews**: Chat notifications carry generic previews ("New message from Alice") rather than full message text.

---

## 17. SEARCH & EXPORT PRIVACY SPECIFICATION

Future search endpoints (`GET /api/search`) and export utilities (`GET /api/export`) must execute within the primary security perimeter.

### 17.1 Rules
1. **Search Scoping**: Global search queries must inject authorization `WHERE` clauses matching entity retrieval:
   - Tasks search: `WHERE project_id IN (authorized_projects)`.
   - Goals search: `WHERE team_id IN (authorized_teams) OR created_by = userId`.
   - Chat search: `WHERE conversation_id IN (authorized_conversations) AND seq >= visibility_start_seq`.
2. **Export Parity**: File exports (CSV, PDF, JSON) must reuse the repository queries of standard UI views, guaranteeing zero data leakage.

---

## 18. CURRENT CAPABILITY GAP MATRIX

Comparison of North-Star specifications against current workspace implementation:

| Capability Area | Status | Current Verified Implementation State | Gap / Required Next Work |
|---|---|---|---|
| **Work Transparency Model** | 🟡 PARTIAL | Tasks, Goals, Daily Work, and Blockers fully implemented with status fields; no unified decision-useful Worklog view. | Design unified Worklog UI & API endpoint aggregating work items. |
| **Individual Progress View** | 🟡 PARTIAL | Pulse daily log form, streak count, personal goals, and assigned tasks exist across separate pages. | Create unified personal workload dashboard view. |
| **Team Leader Dashboard** | 🟡 PARTIAL | Teams detail pane shows member list, work submissions, sub-teams, and context dashboard. | Add visual work distribution (stacked bar) and progress trends. |
| **Classroom / Coordinator Dashboard** | 🟡 PARTIAL | `GET /api/teams/:id/context-dashboard` returns aggregate child team metrics; child team preview works. | Add comparative team grid and attention/risk indicators. |
| **Team → Member → Work Drill-down** | 🟡 PARTIAL | Parent team → sub-teams → work submissions navigation functional in `Teams.tsx`. | Formalize member-level task/goal drill-down pane. |
| **Progress Trends (Charts)** | ❌ NOT IMPLEMENTED | No line chart component or cumulative completion time-series endpoint exists. | Implement time-series task/goal completion API + SVG line chart. |
| **Work Distribution (Charts)** | ❌ NOT IMPLEMENTED | Member task counts exist, but no visual stacked bar distribution chart exists. | Implement stacked bar chart component for team work distribution. |
| **Team Comparison (Grid)** | ❌ NOT IMPLEMENTED | Sub-teams rendered as list; no comparative progress metrics grid. | Implement comparative team progress card grid for coordinators. |
| **Attention / Risk Indicators** | 🟡 PARTIAL | SOS Hub / Blockers track open issues; urgency/impact fields exist. | Build rule-based `On Track` / `Needs Attention` / `At Risk` badge system. |
| **Accurate Contribution Model** | 🟡 PARTIAL | `impact_score` formula verified (`workPoints + consistencyPoints`); surveillance metrics strictly excluded. | Maintain existing formula; add clear UI breakdown modal. |
| **Work-State Audit History** | ✅ VERIFIED IMPLEMENTED | Append-only `work_state_history` model, migration, server-timestamped transitions (tasks, goals, daily work, blockers), and bounded `GET /api/teams/:teamId/work-history` API verified. | Maintain append-only invariants & baseline rules. |
| **Chat Historical Membership Privacy** | 🔒 DESIGN REQUIRED | `conversations`, `chat_messages` tables exist; live `team_members` check enforced. `visibility_start_seq` filtering not implemented. | Add `visibility_start_seq` / `joined_at` sequence filtering to chat repository. |
| **Visibility Matrix Enforcement** | ✅ VERIFIED IMPLEMENTED | Backend middleware (`requireTeamRole`, `requireTeamMembership`, JWT auth) enforces 100% of endpoints. | Maintain strict server-side authorization checks. |
| **Cross-Feature Privacy Inheritance** | ✅ VERIFIED IMPLEMENTED | Enforced across 20 data surfaces: REST endpoints, chat historical privacy (`m.created_at >= tm.joined_at`), thin SSE notifications, PII-masked AI prompts, and React version-token cache clearing. Audited and verified in Task #9. | Maintain strict server-side authorization boundaries across all future data surfaces. |

---

## 19. IMPLEMENTATION DECOMPOSITION & DEPENDENCY PLAN

To execute the core work transparency and privacy model safely, implementation should proceed in sequential, isolated, test-verified phases.

```
Phase 1: Work Transparency Foundation (APIs & Data Aggregators)
   │
Phase 2: Team Leader Dashboard & Work Distribution UI
   │
Phase 3: Classroom / Coordinator Dashboard & Team Comparison
   │
Phase 4: Progress Trends & Visualization Components
   │
Phase 5: Attention / Risk Rule Engine
   │
Phase 6: Chat Historical Membership Privacy Hardening
   │
Phase 7: Work-State Audit History System
```

### Proposed Phase Sequence

1. **Phase 1: Work Transparency Foundation**
   - Build `GET /api/teams/:id/worklog` backend endpoint aggregating tasks, goals, daily logs, and blockers.
   - Add unit/integration tests for server-side worklog authorization.
2. **Phase 2: Team Leader Dashboard & Work Distribution**
   - Implement Team Leader Summary Cards and Work Distribution UI (`Teams.tsx`).
   - Add stacked bar visual component for member workload (`Done` / `In Progress` / `Todo` / `Overdue`).
3. **Phase 3: Classroom / Coordinator Dashboard & Team Comparison**
   - Expand `ContextDashboard.tsx` with sub-team comparative progress grid and aggregate class metrics.
   - Verify drill-down authorization constraints.
4. **Phase 4: Progress Trends & Visualization Layer**
   - Implement time-series completion API endpoint (`GET /api/teams/:id/progress-trends`).
   - Add lightweight SVG line chart component for 7-day and 30-day velocity visualization.
5. **Phase 5: Attention / Risk Engine**
   - Implement rule-based risk evaluation service (`On Track`, `Needs Attention`, `At Risk`).
   - Surface risk badges on Team Leader and Coordinator dashboards.
6. **Phase 6: Chat Historical Membership Privacy Hardening**
   - Add `joined_at` / `visibility_start_seq` tracking to chat membership repository.
   - Update `chat_messages` retrieval query to filter by `seq >= visibility_start_seq`.
   - Add integration tests verifying new team members cannot view pre-membership messages.
7. **Phase 7: Work-State History & Audit Log**
   - Add `work_state_audit_logs` table migration and event recorder service.
   - Implement UI timeline component for work-state transitions.

---

## 20. EXPLICIT DESIGN DECISIONS & OPEN DECISIONS

### Explicit Design Decisions (Signed Off)
1. **Zero Surveillance Metrics**: Contribution is strictly derived from Tasks, Goals, Daily Work, and Milestones. Chat counts, login times, and activity tracking are permanently forbidden.
2. **Server-Authoritative Security**: All visibility rules, drill-down permissions, and aggregate metrics are computed and enforced server-side.
3. **No Decorative Charts**: Visualizations must answer specific operational questions (progress trend, workload distribution, risk alerts, team comparison).
4. **Chat Historical Membership Boundary**: New team members must not view pre-membership team chat history. Access is strictly scoped to authorized membership epochs.
5. **Preservation of Existing Architecture**: The specification builds directly upon CommandCenter's verified Postgres schema, express routes, JWT auth, and `parent_team_id` team hierarchy.

### Open Decisions Remaining (Requires Future Product Review)
1. **Exact Historical Chat Boundary Mechanism**: Should the historical boundary use a message sequence counter (`visibility_start_seq`) or a timestamp (`joined_at`)? *(Recommendation: Use `visibility_start_seq` for exact, race-free sequence precision).*
2. **Rejoined Member Historical Policy**: Should a user who rejoins a team after 3 months ever be granted access to their *previous* membership epoch's chat messages via an explicit admin toggle? *(Current Spec: Default NO access to past epoch).*
3. **Custom Progress Weighting**: Should team leads be allowed to customize task vs goal weighting ($W_{\text{task}}$ / $W_{\text{goal}}$) in progress calculations, or remain fixed at 50/50? *(Current Spec: Fixed 50/50 default).*

---

*End of Design Specification Specification Document.*
