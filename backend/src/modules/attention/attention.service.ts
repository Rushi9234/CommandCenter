import { attentionRepository, RawTeamWorkSignals } from './attention.repository';

export type AttentionStatus = 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'NO_ACTIVE_WORK';

export interface AttentionEvidence {
  open_blockers: number;
  critical_high_blockers: number;
  remaining_tasks: number;
  completed_tasks_7d: number;
  reopened_tasks: number;
  stalled_tasks: number;
  submitted_today: boolean;
  total_active_goals: number;
  member_count: number;
}

export type SignalType =
  | 'UNRESOLVED_BLOCKER'
  | 'STALLED_TASK'
  | 'OVERDUE_TASK'
  | 'REOPENED_WORK_FLAPPING'
  | 'GOAL_PROGRESS_STALLED'
  | 'MISSING_DAILY_SUBMISSION'
  | 'PENDING_JOIN_REQUEST'
  | 'SUBTEAM_AT_RISK';

export interface AttentionSignalEvidenceItem {
  key: string;
  label: string;
  value: string;
}

export interface AttentionSignal {
  signal_id: string; // Deterministic tie: `${signal_type}:${source_type}:${source_id}`
  signal_type: SignalType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  evidence: AttentionSignalEvidenceItem[];
  source_type: 'blocker' | 'task' | 'goal' | 'daily_submission' | 'join_request' | 'team';
  source_id: string;
  observed_at: string;
  supports_timeline: boolean;
  supports_guidance: boolean;
  action: {
    label: string;
    route: string;
    params?: Record<string, any>;
  };
}

export interface AttentionEvaluation {
  team_id: string;
  team_name: string;
  status: AttentionStatus;
  badge_label: string;
  badge_class: string;
  summary: string;
  reasons: string[];
  evidence: AttentionEvidence;
  signals?: AttentionSignal[];
}

export interface ContextChildTeamAttention extends AttentionEvaluation {
  has_child_teams?: boolean;
}

export interface TeamAttentionResponse {
  team: AttentionEvaluation;
  sub_teams: ContextChildTeamAttention[];
}

export class AttentionService {
  /**
   * Deterministically evaluates explainable attention & risk intelligence for a raw work signal dataset.
   */
  evaluateSignals(signals: RawTeamWorkSignals): AttentionEvaluation {
    const evidence: AttentionEvidence = {
      open_blockers: signals.open_blockers,
      critical_high_blockers: signals.critical_high_blockers,
      remaining_tasks: signals.remaining_tasks,
      completed_tasks_7d: signals.completed_tasks_7d,
      reopened_tasks: signals.reopened_tasks,
      stalled_tasks: signals.stalled_tasks,
      submitted_today: signals.submitted_today,
      total_active_goals: signals.active_goals,
      member_count: signals.member_count,
    };

    const reasons: string[] = [];

    const hasActiveWork =
      signals.remaining_tasks > 0 ||
      signals.active_goals > 0 ||
      signals.total_assigned_tasks > 0 ||
      signals.total_goals > 0;

    // Rule 1: No Active Work
    if (!hasActiveWork && signals.open_blockers === 0) {
      return {
        team_id: signals.team_id,
        team_name: signals.team_name,
        status: 'NO_ACTIVE_WORK',
        badge_label: '⚪ No Active Work',
        badge_class: 'bg-gray-100 text-gray-700 border-gray-300',
        summary: 'No active tasks or goals currently assigned to this team.',
        reasons: ['Zero active tasks, goals, or blockers found.'],
        evidence,
        signals: [],
      };
    }

    // Evaluate Risk & Attention triggers
    const isAtRisk =
      signals.open_blockers >= 2 ||
      signals.critical_high_blockers >= 1 ||
      signals.reopened_tasks >= 2 ||
      signals.stalled_tasks >= 3;

    if (signals.open_blockers >= 2) {
      reasons.push(`${signals.open_blockers} open SOS blockers require urgent team resolution.`);
    } else if (signals.open_blockers === 1) {
      reasons.push(`1 open SOS blocker requires resolution.`);
    }

    if (signals.critical_high_blockers >= 1) {
      reasons.push(`${signals.critical_high_blockers} high/critical urgency blocker(s) active.`);
    }

    if (signals.reopened_tasks >= 2) {
      reasons.push(`${signals.reopened_tasks} tasks have been reopened after initial completion.`);
    } else if (signals.reopened_tasks === 1) {
      reasons.push(`1 task was reopened after being marked done.`);
    }

    if (signals.stalled_tasks >= 3) {
      reasons.push(`${signals.stalled_tasks} active tasks have shown no state transition for over 5 days.`);
    } else if (signals.stalled_tasks >= 1) {
      reasons.push(`${signals.stalled_tasks} active task(s) with no state transition for over 5 days.`);
    }

    if (hasActiveWork && !signals.submitted_today && signals.member_count > 0) {
      reasons.push(`No confirmed daily work submission recorded today.`);
    }

    // Determine Status
    if (isAtRisk) {
      return {
        team_id: signals.team_id,
        team_name: signals.team_name,
        status: 'AT_RISK',
        badge_label: '🔴 At Risk',
        badge_class: 'bg-rose-100 text-rose-800 border-rose-300',
        summary: 'Multiple high-severity risk factors require immediate leadership support.',
        reasons,
        evidence,
      };
    }

    const needsAttention =
      signals.open_blockers === 1 ||
      signals.reopened_tasks === 1 ||
      (signals.stalled_tasks >= 1 && signals.stalled_tasks <= 2) ||
      (hasActiveWork && !signals.submitted_today && signals.member_count > 0);

    if (needsAttention) {
      return {
        team_id: signals.team_id,
        team_name: signals.team_name,
        status: 'NEEDS_ATTENTION',
        badge_label: '🟡 Needs Attention',
        badge_class: 'bg-amber-100 text-amber-800 border-amber-300',
        summary: 'Work items or daily submissions require attention to maintain team momentum.',
        reasons,
        evidence,
      };
    }

    // On Track Default
    return {
      team_id: signals.team_id,
      team_name: signals.team_name,
      status: 'ON_TRACK',
      badge_label: '🟢 On Track',
      badge_class: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      summary: 'Team work is progressing normally with active transitions and zero open blockers.',
      reasons: [
        'Active task and goal progress confirmed.',
        'Zero open blockers.',
      ],
      evidence,
      signals: [],
    };
  }

  /**
   * Retrieves explainable attention for a team and all its sub-teams.
   */
  async getTeamAttention(teamId: string): Promise<TeamAttentionResponse | null> {
    const rawSignals = await attentionRepository.getRawTeamSignals(teamId);
    if (!rawSignals) {
      return null;
    }

    const teamEval = this.evaluateSignals(rawSignals);

    // Fetch child sub-teams if present
    const childTeams = await attentionRepository.getChildTeamIds(teamId);
    const subTeamsEval: ContextChildTeamAttention[] = [];

    for (const child of childTeams) {
      const childSignals = await attentionRepository.getRawTeamSignals(child.team_id);
      if (childSignals) {
        subTeamsEval.push(this.evaluateSignals(childSignals));
      }
    }

    return {
      team: teamEval,
      sub_teams: subTeamsEval,
    };
  }

  /**
   * Action Center for Individual Scope (My Attention).
   */
  async getIndividualActionCenter(userId: string) {
    const rawItems = await attentionRepository.getIndividualAttentionItems(userId);
    const signals: AttentionSignal[] = [];

    // 1. Open Blockers
    for (const b of rawItems.blockers) {
      const severity = b.urgency === 'critical' || b.urgency === 'high' ? 'critical' : 'high';
      signals.push({
        signal_id: `UNRESOLVED_BLOCKER:blocker:${b.blocker_id}`,
        signal_type: 'UNRESOLVED_BLOCKER',
        severity,
        title: `SOS Blocker: ${b.title}`,
        explanation: `Active SOS Blocker in team '${b.team_name}' requires resolution.`,
        evidence: [
          { key: 'team', label: 'Team', value: b.team_name },
          { key: 'urgency', label: 'Urgency', value: (b.urgency || 'medium').toUpperCase() },
          { key: 'status', label: 'Status', value: b.status },
          { key: 'created_at', label: 'Created At', value: new Date(b.created_at).toLocaleString() },
        ],
        source_type: 'blocker',
        source_id: b.blocker_id,
        observed_at: b.created_at,
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'Resolve in SOS Hub',
          route: '/help',
          params: { blockerId: b.blocker_id, teamId: b.team_id },
        },
      });
    }

    // 2. Overdue Tasks
    for (const t of rawItems.overdueTasks) {
      signals.push({
        signal_id: `OVERDUE_TASK:task:${t.task_id}`,
        signal_type: 'OVERDUE_TASK',
        severity: 'high',
        title: `Overdue Task: ${t.title}`,
        explanation: `Assigned task in project '${t.project_name}' is ${t.days_overdue} day(s) past target deadline.`,
        evidence: [
          { key: 'project', label: 'Project', value: t.project_name },
          { key: 'team', label: 'Team', value: t.team_name },
          { key: 'due_date', label: 'Due Date', value: new Date(t.due_date).toLocaleDateString() },
          { key: 'days_overdue', label: 'Days Overdue', value: `${t.days_overdue} days` },
        ],
        source_type: 'task',
        source_id: t.task_id,
        observed_at: t.due_date,
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'Open Task in Projects',
          route: '/projects',
          params: { taskId: t.task_id, projectId: t.project_id },
        },
      });
    }

    // 3. Stalled Tasks
    for (const t of rawItems.stalledTasks) {
      signals.push({
        signal_id: `STALLED_TASK:task:${t.task_id}`,
        signal_type: 'STALLED_TASK',
        severity: 'medium',
        title: `Stalled Task: ${t.title}`,
        explanation: `Assigned task in project '${t.project_name}' has shown no state update for ${t.days_stalled} days.`,
        evidence: [
          { key: 'project', label: 'Project', value: t.project_name },
          { key: 'team', label: 'Team', value: t.team_name },
          { key: 'days_stalled', label: 'Days Stalled', value: `${t.days_stalled} days` },
        ],
        source_type: 'task',
        source_id: t.task_id,
        observed_at: new Date().toISOString(),
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'Update Task State',
          route: '/projects',
          params: { taskId: t.task_id, projectId: t.project_id },
        },
      });
    }

    // 4. Goals Needing Progress
    for (const g of rawItems.goalsNeedingProgress) {
      signals.push({
        signal_id: `GOAL_PROGRESS_STALLED:goal:${g.goal_id}`,
        signal_type: 'GOAL_PROGRESS_STALLED',
        severity: 'low',
        title: `Goal Pending Progress: ${g.title}`,
        explanation: g.progress === 0 ? 'Active goal currently has 0% progress recorded.' : 'Goal target date has passed with incomplete progress.',
        evidence: [
          { key: 'progress', label: 'Current Progress', value: `${g.progress}%` },
          { key: 'scope', label: 'Scope', value: g.team_name ? `Team (${g.team_name})` : 'Personal' },
          { key: 'target_date', label: 'Target Date', value: g.target_date ? new Date(g.target_date).toLocaleDateString() : 'None' },
        ],
        source_type: 'goal',
        source_id: g.goal_id,
        observed_at: new Date().toISOString(),
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'View Goal in Goals',
          route: '/goals',
          params: { goalId: g.goal_id },
        },
      });
    }

    // Sort signals deterministically
    const severityMap: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
    signals.sort((a, b) => {
      const pA = severityMap[a.severity] || 5;
      const pB = severityMap[b.severity] || 5;
      if (pA !== pB) return pA - pB;
      const tA = new Date(a.observed_at).getTime();
      const tB = new Date(b.observed_at).getTime();
      if (tA !== tB) return tB - tA;
      return a.signal_id.localeCompare(b.signal_id);
    });

    const items = signals.map((sig) => ({
      id: sig.source_id,
      signal_id: sig.signal_id,
      category: sig.signal_type,
      urgency: sig.severity,
      title: sig.title,
      reason: sig.explanation,
      evidence: sig.evidence,
      supports_timeline: sig.supports_timeline,
      supports_guidance: sig.supports_guidance,
      action: sig.action,
    }));

    const attention_status = items.length === 0 ? 'ON_TRACK' : items.some((i) => i.urgency === 'critical' || i.urgency === 'high') ? 'AT_RISK' : 'NEEDS_ATTENTION';

    return {
      scope: 'INDIVIDUAL',
      user_id: userId,
      attention_status,
      summary: items.length === 0 ? 'No attention items right now. All your assigned work items are progressing normally.' : `${items.length} work item(s) require your direct attention.`,
      total_action_items: items.length,
      signals,
      items,
    };
  }

  /**
   * Action Center for Team Leader Scope.
   */
  async getTeamActionCenter(teamId: string) {
    const rawSignals = await attentionRepository.getRawTeamSignals(teamId);
    if (!rawSignals) {
      return null;
    }

    const teamEval = this.evaluateSignals(rawSignals);
    const details = await attentionRepository.getTeamDetailedAttentionSignals(teamId);

    const signals: AttentionSignal[] = [];

    // 1. Team Open Blockers
    for (const b of details.openBlockers) {
      const severity = b.urgency === 'critical' || b.urgency === 'high' ? 'critical' : 'high';
      signals.push({
        signal_id: `UNRESOLVED_BLOCKER:blocker:${b.blocker_id}`,
        signal_type: 'UNRESOLVED_BLOCKER',
        severity,
        title: `Team SOS Blocker: ${b.title}`,
        explanation: `Open SOS blocker raised by ${b.creator_name} requires team leadership resolution.`,
        evidence: [
          { key: 'creator', label: 'Creator', value: b.creator_name },
          { key: 'urgency', label: 'Urgency', value: (b.urgency || 'medium').toUpperCase() },
          { key: 'status', label: 'Status', value: 'Open' },
          { key: 'created_at', label: 'Created At', value: new Date(b.created_at).toLocaleString() },
        ],
        source_type: 'blocker',
        source_id: b.blocker_id,
        observed_at: b.created_at,
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'Resolve Blocker',
          route: '/help',
          params: { blockerId: b.blocker_id, teamId },
        },
      });
    }

    // 2. Team Pending Join Requests
    for (const req of details.pendingJoinRequests) {
      signals.push({
        signal_id: `PENDING_JOIN_REQUEST:join_request:${req.request_id}`,
        signal_type: 'PENDING_JOIN_REQUEST',
        severity: 'high',
        title: `Pending Membership Request: ${req.user_name}`,
        explanation: `${req.user_name} (${req.email}) requested to join this team.`,
        evidence: [
          { key: 'applicant', label: 'Applicant', value: req.user_name },
          { key: 'email', label: 'Email', value: req.email },
          { key: 'requested_at', label: 'Requested Date', value: new Date(req.requested_at).toLocaleDateString() },
        ],
        source_type: 'join_request',
        source_id: req.request_id,
        observed_at: req.requested_at,
        supports_timeline: false,
        supports_guidance: false,
        action: {
          label: 'Manage Join Requests',
          route: `/teams/${teamId}`,
          params: { tab: 'requests' },
        },
      });
    }

    // 3. Team Overdue Tasks
    for (const t of details.overdueTasks) {
      signals.push({
        signal_id: `OVERDUE_TASK:task:${t.task_id}`,
        signal_type: 'OVERDUE_TASK',
        severity: 'high',
        title: `Team Overdue Task: ${t.title}`,
        explanation: `Task assigned to ${t.owner_name} in '${t.project_name}' is ${t.days_overdue} day(s) past due.`,
        evidence: [
          { key: 'assignee', label: 'Assignee', value: t.owner_name },
          { key: 'project', label: 'Project', value: t.project_name },
          { key: 'due_date', label: 'Due Date', value: new Date(t.due_date).toLocaleDateString() },
          { key: 'days_overdue', label: 'Days Overdue', value: `${t.days_overdue} days` },
        ],
        source_type: 'task',
        source_id: t.task_id,
        observed_at: t.due_date,
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'View Project Task',
          route: '/projects',
          params: { taskId: t.task_id, projectId: t.project_id },
        },
      });
    }

    // 4. Team Stalled Tasks
    for (const t of details.stalledTasks) {
      signals.push({
        signal_id: `STALLED_TASK:task:${t.task_id}`,
        signal_type: 'STALLED_TASK',
        severity: 'medium',
        title: `Team Stalled Task: ${t.title}`,
        explanation: `Task assigned to ${t.owner_name} in '${t.project_name}' has shown no update for ${t.days_stalled} days.`,
        evidence: [
          { key: 'assignee', label: 'Assignee', value: t.owner_name },
          { key: 'project', label: 'Project', value: t.project_name },
          { key: 'days_stalled', label: 'Days Stalled', value: `${t.days_stalled} days` },
        ],
        source_type: 'task',
        source_id: t.task_id,
        observed_at: new Date().toISOString(),
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'Check Task Progress',
          route: '/projects',
          params: { taskId: t.task_id, projectId: t.project_id },
        },
      });
    }

    // 5. Team Reopened Tasks
    for (const r of details.reopenedTasks) {
      signals.push({
        signal_id: `REOPENED_WORK_FLAPPING:task:${r.task_id}`,
        signal_type: 'REOPENED_WORK_FLAPPING',
        severity: 'medium',
        title: `Reopened Task: ${r.title}`,
        explanation: `Task '${r.title}' was reopened by ${r.actor_name} after initial completion.`,
        evidence: [
          { key: 'task', label: 'Task Title', value: r.title },
          { key: 'reopened_by', label: 'Reopened By', value: r.actor_name },
          { key: 'reopened_at', label: 'Reopened At', value: new Date(r.reopened_at).toLocaleString() },
        ],
        source_type: 'task',
        source_id: r.task_id,
        observed_at: r.reopened_at,
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'View Task Timeline',
          route: '/projects',
          params: { taskId: r.task_id },
        },
      });
    }

    // 6. Team Goals Needing Progress
    for (const g of details.goalsNeedingProgress) {
      signals.push({
        signal_id: `GOAL_PROGRESS_STALLED:goal:${g.goal_id}`,
        signal_type: 'GOAL_PROGRESS_STALLED',
        severity: 'low',
        title: `Goal Pending Progress: ${g.title}`,
        explanation: `Active goal created by ${g.created_by_name} currently has ${g.progress}% progress.`,
        evidence: [
          { key: 'creator', label: 'Created By', value: g.created_by_name },
          { key: 'progress', label: 'Current Progress', value: `${g.progress}%` },
          { key: 'target_date', label: 'Target Date', value: g.target_date ? new Date(g.target_date).toLocaleDateString() : 'None' },
        ],
        source_type: 'goal',
        source_id: g.goal_id,
        observed_at: new Date().toISOString(),
        supports_timeline: true,
        supports_guidance: true,
        action: {
          label: 'View Goal in Goals',
          route: '/goals',
          params: { goalId: g.goal_id },
        },
      });
    }

    // 7. Missing Daily Submission
    const hasActiveWork = rawSignals.remaining_tasks > 0 || rawSignals.active_goals > 0;
    if (hasActiveWork && !rawSignals.submitted_today && rawSignals.member_count > 0) {
      signals.push({
        signal_id: `MISSING_DAILY_SUBMISSION:daily_submission:${teamId}`,
        signal_type: 'MISSING_DAILY_SUBMISSION',
        severity: 'medium',
        title: 'Missing Daily Work Submission',
        explanation: `No confirmed daily work submission recorded today for team '${rawSignals.team_name}'.`,
        evidence: [
          { key: 'team_name', label: 'Team', value: rawSignals.team_name },
          { key: 'member_count', label: 'Member Count', value: `${rawSignals.member_count} members` },
          { key: 'date', label: 'Date', value: new Date().toISOString().split('T')[0] },
        ],
        source_type: 'daily_submission',
        source_id: teamId,
        observed_at: new Date().toISOString(),
        supports_timeline: false,
        supports_guidance: false,
        action: {
          label: 'Submit Daily Log',
          route: '/daily-log',
        },
      });
    }

    // Sort signals deterministically
    const severityMap: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
    signals.sort((a, b) => {
      const pA = severityMap[a.severity] || 5;
      const pB = severityMap[b.severity] || 5;
      if (pA !== pB) return pA - pB;
      const tA = new Date(a.observed_at).getTime();
      const tB = new Date(b.observed_at).getTime();
      if (tA !== tB) return tB - tA;
      return a.signal_id.localeCompare(b.signal_id);
    });

    const items = signals.map((sig) => ({
      id: sig.source_id,
      signal_id: sig.signal_id,
      category: sig.signal_type,
      urgency: sig.severity,
      title: sig.title,
      reason: sig.explanation,
      evidence: sig.evidence,
      supports_timeline: sig.supports_timeline,
      supports_guidance: sig.supports_guidance,
      action: sig.action,
    }));

    const childTeams = await attentionRepository.getChildTeamIds(teamId);
    const subTeamsEval: ContextChildTeamAttention[] = [];

    for (const child of childTeams) {
      const childSignals = await attentionRepository.getRawTeamSignals(child.team_id);
      if (childSignals) {
        subTeamsEval.push(this.evaluateSignals(childSignals));
      }
    }

    teamEval.signals = signals;

    return {
      scope: 'TEAM',
      team_id: teamId,
      team_name: rawSignals.team_name,
      attention_status: teamEval.status,
      summary: teamEval.summary,
      reasons: teamEval.reasons,
      total_action_items: items.length,
      signals,
      items,
      raw_evaluation: teamEval,
      team: teamEval,
      sub_teams: subTeamsEval,
    };
  }

  /**
   * Action Center for Classroom / Coordinator Scope.
   */
  async getClassroomActionCenter(parentTeamId: string) {
    const parentSignals = await attentionRepository.getRawTeamSignals(parentTeamId);
    if (!parentSignals) {
      return null;
    }

    const childTeams = await attentionRepository.getChildTeamIds(parentTeamId);
    const signals: AttentionSignal[] = [];
    const subTeamsEval: ContextChildTeamAttention[] = [];

    let atRiskCount = 0;
    let needsAttentionCount = 0;

    for (const child of childTeams) {
      const childSignals = await attentionRepository.getRawTeamSignals(child.team_id);
      if (childSignals) {
        const evalRes = this.evaluateSignals(childSignals);
        subTeamsEval.push(evalRes);

        if (evalRes.status === 'AT_RISK' || evalRes.status === 'NEEDS_ATTENTION') {
          if (evalRes.status === 'AT_RISK') atRiskCount++;
          if (evalRes.status === 'NEEDS_ATTENTION') needsAttentionCount++;

          const severity = evalRes.status === 'AT_RISK' ? 'critical' : 'medium';
          signals.push({
            signal_id: `SUBTEAM_AT_RISK:team:${child.team_id}`,
            signal_type: 'SUBTEAM_AT_RISK',
            severity,
            title: `Sub-Team ${evalRes.status === 'AT_RISK' ? 'At Risk' : 'Needs Attention'}: ${child.team_name}`,
            explanation: evalRes.summary,
            evidence: [
              { key: 'sub_team_name', label: 'Sub-Team', value: child.team_name },
              { key: 'status', label: 'Attention Status', value: evalRes.badge_label },
              { key: 'primary_reason', label: 'Risk Factor', value: evalRes.reasons[0] || 'Attention required' },
            ],
            source_type: 'team',
            source_id: child.team_id,
            observed_at: new Date().toISOString(),
            supports_timeline: false,
            supports_guidance: false,
            action: {
              label: 'Drill Into Sub-Team',
              route: `/teams/${child.team_id}`,
              params: { teamId: child.team_id },
            },
          });
        }
      }
    }

    // Sort signals deterministically
    const severityMap: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
    signals.sort((a, b) => {
      const pA = severityMap[a.severity] || 5;
      const pB = severityMap[b.severity] || 5;
      if (pA !== pB) return pA - pB;
      return a.signal_id.localeCompare(b.signal_id);
    });

    const items = signals.map((sig) => ({
      id: sig.source_id,
      signal_id: sig.signal_id,
      category: sig.signal_type,
      urgency: sig.severity,
      title: sig.title,
      reason: sig.explanation,
      evidence: sig.evidence,
      supports_timeline: sig.supports_timeline,
      supports_guidance: sig.supports_guidance,
      action: sig.action,
    }));

    const attention_status = atRiskCount > 0 ? 'AT_RISK' : needsAttentionCount > 0 ? 'NEEDS_ATTENTION' : 'ON_TRACK';

    return {
      scope: 'CLASSROOM',
      parent_team_id: parentTeamId,
      parent_team_name: parentSignals.team_name,
      attention_status,
      summary: atRiskCount > 0
        ? `${atRiskCount} sub-team(s) are At Risk requiring coordinator support.`
        : needsAttentionCount > 0
        ? `${needsAttentionCount} sub-team(s) require attention.`
        : 'All child sub-teams in this classroom are progressing normally.',
      at_risk_teams_count: atRiskCount,
      needs_attention_teams_count: needsAttentionCount,
      total_action_items: items.length,
      signals,
      items,
      sub_teams_evaluations: subTeamsEval,
    };
  }
}

export const attentionService = new AttentionService();
