import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TeamLeaderWorklogDashboard from './TeamLeaderWorklogDashboard';
import * as api from '../services/api';

vi.mock('../services/api');

const MOCK_WORKLOG_DATA = {
  team_id: 'team-123',
  team_name: 'Engineering Team',
  team_summary: {
    tasks: {
      assigned: 4,
      in_progress: 1,
      completed: 2,
      remaining: 2,
    },
    goals: {
      total: 2,
      active: 1,
      completed: 1,
      avg_progress: 50,
    },
    daily_work: {
      submissions_today: 1,
      total_submissions: 3,
    },
    blockers: {
      open: 1,
      in_progress: 0,
      resolved: 1,
      total: 2,
    },
  },
  member_summary: [
    {
      user_id: 'user-1',
      full_name: 'Ada Lovelace',
      username: 'ada',
      role: 'owner',
      avatar_key: null,
      tasks: {
        assigned: 3,
        in_progress: 1,
        completed: 1,
        remaining: 2,
      },
    },
    {
      user_id: 'user-2',
      full_name: 'Alan Turing',
      username: 'alan',
      role: 'member',
      avatar_key: null,
      tasks: {
        assigned: 1,
        in_progress: 0,
        completed: 1,
        remaining: 0,
      },
    },
  ],
  work_items: {
    tasks: [
      {
        task_id: 'task-1',
        project_id: 'proj-1',
        project_name: 'Frontend Core',
        title: 'Implement Navigation Bar',
        description: 'Build responsive nav',
        owner: 'user-1',
        owner_name: 'Ada Lovelace',
        contributors: [],
        reviewer: null,
        status: 'done',
        priority: 'high',
        created_at: '2026-09-01T00:00:00Z',
        completed_at: '2026-09-05T00:00:00Z',
      },
      {
        task_id: 'task-2',
        project_id: 'proj-1',
        project_name: 'Frontend Core',
        title: 'Implement Auth Flow',
        description: 'Login page UI',
        owner: 'user-1',
        owner_name: 'Ada Lovelace',
        contributors: [],
        reviewer: null,
        status: 'in_progress',
        priority: 'normal',
        created_at: '2026-09-02T00:00:00Z',
        completed_at: null,
      },
      {
        task_id: 'task-3',
        project_id: 'proj-1',
        project_name: 'Frontend Core',
        title: 'Database Schema Verification',
        description: 'Check constraints',
        owner: 'user-2',
        owner_name: 'Alan Turing',
        contributors: [],
        reviewer: null,
        status: 'done',
        priority: 'normal',
        created_at: '2026-09-03T00:00:00Z',
        completed_at: '2026-09-06T00:00:00Z',
      },
    ],
    goals: [
      {
        goal_id: 'goal-1',
        title: 'Launch Core Work Transparency',
        description: 'Complete Task 1 and Task 2',
        goal_type: 'milestone',
        status: 'active',
        progress: 50,
        created_by: 'user-1',
        created_by_name: 'Ada Lovelace',
        target_date: '2026-09-30',
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    daily_work_submissions: [
      {
        submission_id: 'sub-1',
        user_id: 'user-1',
        user_full_name: 'Ada Lovelace',
        user_username: 'ada',
        work_date: '2026-09-15',
        confirmed_summary: 'Completed nav bar and started auth flow',
        confirmed_at: '2026-09-15T10:00:00Z',
      },
    ],
    blockers: [
      {
        blocker_id: 'blocker-1',
        title: 'DB Connection Timeout on Staging',
        description: 'Investigating pool size',
        urgency: 'high',
        status: 'open',
        created_by: 'user-1',
        created_by_name: 'Ada Lovelace',
        created_at: '2026-09-15T09:00:00Z',
      },
    ],
  },
};

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamLeaderWorklogDashboard', () => {
  it('1. Authorized team leader can render work transparency dashboard', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    expect(screen.getByTestId('worklog-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('team-worklog-dashboard')).toBeInTheDocument();
    expect(screen.getByText('Work Transparency Dashboard')).toBeInTheDocument();
    expect(api.getWorklog).toHaveBeenCalledWith('team-123');
  });

  it('2. Correct member work values are shown', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    const adaMatches = await screen.findAllByText('Ada Lovelace');
    expect(adaMatches.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alan Turing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed: 1').length).toBeGreaterThan(0);
    expect(screen.getByText('In Progress: 1')).toBeInTheDocument();
    expect(screen.getByText('Remaining: 2')).toBeInTheDocument();
  });

  it('3. Aggregate summary values are derived correctly', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    await screen.findByTestId('team-worklog-dashboard');

    // Tasks completed: 2 of 4 = 50%, Goals avg: 50% => Overall 50%
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.getByText('2 of 4 tasks done (50%)')).toBeInTheDocument();
  });

  it('4. Blocker/attention information is shown correctly', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    expect(await screen.findByText('🟡 Needs Attention')).toBeInTheDocument();
    expect(screen.getByText(/1 open blocker needs resolution/)).toBeInTheDocument();
  });

  it('5. Handles empty team / no-work state cleanly', async () => {
    const emptyWorklog = {
      ...MOCK_WORKLOG_DATA,
      team_summary: {
        tasks: { assigned: 0, in_progress: 0, completed: 0, remaining: 0 },
        goals: { total: 0, active: 0, completed: 0, avg_progress: 0 },
        daily_work: { submissions_today: 0, total_submissions: 0 },
        blockers: { open: 0, in_progress: 0, resolved: 0, total: 0 },
      },
      member_summary: [],
      work_items: { tasks: [], goals: [], daily_work_submissions: [], blockers: [] },
    };

    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: emptyWorklog } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    expect(await screen.findByTestId('empty-worklog')).toBeInTheDocument();
    expect(screen.getByText('⚪ No Active Work')).toBeInTheDocument();
    expect(screen.getByText('No Work Items Found')).toBeInTheDocument();
  });

  it('6. Handles API error state gracefully with a retry option', async () => {
    vi.mocked(api.getWorklog).mockRejectedValueOnce({
      response: { data: { error: 'Network error occurred' } },
    });

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    expect(await screen.findByTestId('worklog-error')).toBeInTheDocument();
    expect(screen.getByText('Network error occurred')).toBeInTheDocument();

    // Click retry
    vi.mocked(api.getWorklog).mockResolvedValueOnce({ data: { data: MOCK_WORKLOG_DATA } } as any);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('team-worklog-dashboard')).toBeInTheDocument();
  });

  it('7. Handles forbidden/unauthorized (403) state cleanly', async () => {
    vi.mocked(api.getWorklog).mockRejectedValue({
      response: { status: 403 },
    });

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={false} />);

    expect(await screen.findByTestId('worklog-error')).toBeInTheDocument();
    expect(screen.getByText(/Access Denied/)).toBeInTheDocument();
  });

  it('8. Supports member drilldown behavior to inspect specific work artifacts', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    const viewMemberBtns = await screen.findAllByRole('button', { name: /view member →/i });
    expect(viewMemberBtns.length).toBeGreaterThan(0);

    // Click View Member button for Ada Lovelace to trigger drilldown
    fireEvent.click(viewMemberBtns[0]);

    expect(await screen.findByTestId('member-detail-view')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Implement Navigation Bar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed nav bar and started auth flow').length).toBeGreaterThan(0);

    // Close drilldown
    fireEvent.click(screen.getByRole('button', { name: /back to team view/i }));
    await waitFor(() => expect(screen.queryByTestId('member-detail-view')).not.toBeInTheDocument());
  });

  it('9. Ensures no private chat or personal sensitive data is rendered', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    await screen.findByTestId('team-worklog-dashboard');

    const content = screen.getByTestId('team-worklog-dashboard').textContent || '';
    expect(content).not.toMatch(/password/i);
    expect(content).not.toMatch(/private_chat/i);
    expect(content).not.toMatch(/secret_log/i);
    expect(content).not.toMatch(/token/i);
  });

  it('10. Ensures no surveillance productivity score or arbitrary ranking is rendered', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    await screen.findByTestId('team-worklog-dashboard');

    const content = screen.getByTestId('team-worklog-dashboard').textContent || '';
    expect(content).not.toMatch(/productivity score/i);
    expect(content).not.toMatch(/best employee/i);
    expect(content).not.toMatch(/worst employee/i);
    expect(content).not.toMatch(/keystrokes/i);
    expect(content).not.toMatch(/mouse activity/i);
  });

  it('11. Allows switching between Work Items filter tabs', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    await screen.findByTestId('team-worklog-dashboard');

    // Click Tasks filter tab
    fireEvent.click(screen.getByRole('button', { name: /^Tasks \(/ }));
    expect(screen.getByText('Implement Navigation Bar')).toBeInTheDocument();

    // Click Blockers filter tab
    fireEvent.click(screen.getByRole('button', { name: /^Blockers \(/ }));
    expect(screen.getByText('DB Connection Timeout on Staging')).toBeInTheDocument();
  });

  it('12. Renders Task Completion Progress Trend SVG Chart and Work Status Distribution card', async () => {
    vi.mocked(api.getWorklog).mockResolvedValue({ data: { data: MOCK_WORKLOG_DATA } } as any);

    renderWithRouter(<TeamLeaderWorklogDashboard teamId="team-123" isLeader={true} />);

    await screen.findByTestId('team-worklog-dashboard');

    expect(screen.getByTestId('visual-analytics-section')).toBeInTheDocument();
    expect(screen.getByTestId('status-distribution-card')).toBeInTheDocument();
    expect(screen.getByText('Task Completion Progress Trend (7-Day Window)')).toBeInTheDocument();
    expect(screen.getByText('Work Status Distribution')).toBeInTheDocument();
  });
});
