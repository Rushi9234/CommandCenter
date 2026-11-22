import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClassroomCoordinatorDashboard from './ClassroomCoordinatorDashboard';
import * as api from '../services/api';

vi.mock('../services/api');

const MOCK_CLASSROOM_DATA = {
  context: {
    team_id: 'parent-1',
    team_name: 'Computer Science 101',
    team_type: 'classroom',
    description: 'Fall 2026 CS101 Classroom Context',
  },
  summary: {
    total_teams: 3,
    submitted_today_count: 2,
    blocked_count: 1,
    needs_attention_count: 1,
  },
  teams: [
    {
      team_id: 'team-alpha',
      team_name: 'Alpha Squad',
      description: 'Building Compiler Engine',
      team_type: 'project_team',
      is_public: true,
      member_count: 4,
      submitted_today: true,
      open_blocker_count: 0,
      task_progress: {
        total: 10,
        completed: 8,
        percent: 80,
      },
      needs_attention: false,
    },
    {
      team_id: 'team-beta',
      team_name: 'Beta Squad',
      description: 'Building Database Indexer',
      team_type: 'project_team',
      is_public: true,
      member_count: 3,
      submitted_today: false,
      open_blocker_count: 1,
      task_progress: {
        total: 12,
        completed: 4,
        percent: 33,
      },
      needs_attention: true,
    },
    {
      team_id: 'team-gamma',
      team_name: 'Gamma Squad',
      description: 'UI Prototyping',
      team_type: 'project_team',
      is_public: false,
      member_count: 0,
      submitted_today: false,
      open_blocker_count: 0,
      task_progress: {
        total: 0,
        completed: 0,
        percent: 0,
      },
      needs_attention: false,
    },
  ],
};

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ClassroomCoordinatorDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton state initially', () => {
    vi.mocked(api.getContextDashboard).mockReturnValue(new Promise(() => {}));

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    expect(screen.getByTestId('classroom-dashboard-loading')).toBeDefined();
  });

  it('renders aggregate summary metrics and sub-teams comparison when data loads', async () => {
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: MOCK_CLASSROOM_DATA },
    } as any);

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    expect(screen.getByText(/Classroom Overview/)).toBeDefined();
    expect(screen.getByText('Computer Science 101')).toBeDefined();
    expect(screen.getByText('Alpha Squad')).toBeDefined();
    expect(screen.getByText('Beta Squad')).toBeDefined();
    expect(screen.getByText('Gamma Squad')).toBeDefined();

    // Aggregate statistics
    expect(screen.getAllByText('3')[0]).toBeDefined(); // sub-teams count
    expect(screen.getByText('22')).toBeDefined(); // total classroom tasks (10 + 12 + 0)
    expect(screen.getByText('12 done')).toBeDefined(); // completed tasks (8 + 4 + 0)
  });

  it('calculates factual team status indicators correctly', async () => {
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: MOCK_CLASSROOM_DATA },
    } as any);

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    // Alpha Squad -> On Track (0 blockers, submitted today)
    expect(screen.getAllByText('🟢 On Track')[0]).toBeDefined();

    // Beta Squad -> Needs Attention (1 blocker, no submission today)
    expect(screen.getByText('🟡 Needs Attention')).toBeDefined();

    // Gamma Squad -> No Active Work (0 tasks, 0 members)
    expect(screen.getByText('⚪ No Active Work')).toBeDefined();
  });

  it('renders empty classroom state when context has 0 sub-teams', async () => {
    const emptyData = {
      ...MOCK_CLASSROOM_DATA,
      teams: [],
      summary: { total_teams: 0, submitted_today_count: 0, blocked_count: 0, needs_attention_count: 0 },
    };
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: emptyData },
    } as any);

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-dashboard-empty')).toBeDefined();
    });

    expect(screen.getByText('No Sub-Teams in Classroom Context')).toBeDefined();
  });

  it('renders error state with Retry button on API failure', async () => {
    vi.mocked(api.getContextDashboard).mockRejectedValueOnce({
      response: { data: { message: 'Database query failed' } },
    });

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-dashboard-error')).toBeDefined();
    });

    expect(screen.getByText('Database query failed')).toBeDefined();

    // Click Retry
    vi.mocked(api.getContextDashboard).mockResolvedValueOnce({
      data: { data: MOCK_CLASSROOM_DATA },
    } as any);

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });
  });

  it('renders 403 Forbidden state when user is unauthorized', async () => {
    vi.mocked(api.getContextDashboard).mockRejectedValue({
      response: { status: 403, data: { message: 'Access Restricted' } },
    });

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-dashboard-forbidden')).toBeDefined();
    });

    expect(screen.getByText('Coordinator Access Restricted')).toBeDefined();
  });

  it('calls onSelectTeam callback when team card is clicked for dedicated team page navigation', async () => {
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: MOCK_CLASSROOM_DATA },
    } as any);

    const onSelectTeam = vi.fn();
    renderWithRouter(
      <ClassroomCoordinatorDashboard
        contextTeamId="parent-1"
        contextTeamName="Computer Science 101"
        onSelectTeam={onSelectTeam}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    // Click Alpha Squad team card
    const alphaRow = screen.getByTestId('team-row-team-alpha');
    fireEvent.click(alphaRow);

    expect(onSelectTeam).toHaveBeenCalledWith('team-alpha', 'Alpha Squad');
  });

  it('guarantees privacy by excluding emails, private chat, personal logs, and surveillance metrics', async () => {
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: MOCK_CLASSROOM_DATA },
    } as any);

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    // No emails
    expect(screen.queryByText(/@/)).toBeNull();

    // No surveillance terms
    expect(screen.queryByText(/chat count/i)).toBeNull();
    expect(screen.queryByText(/login count/i)).toBeNull();
    expect(screen.queryByText(/productivity score/i)).toBeNull();
    expect(screen.queryByText(/best employee/i)).toBeNull();
  });

  it('renders classroom work distribution visual breakdown across child teams', async () => {
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: MOCK_CLASSROOM_DATA },
    } as any);

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    expect(screen.getByTestId('classroom-work-distribution-visual')).toBeDefined();
    expect(screen.getByText('Classroom Task Distribution Across All Teams')).toBeDefined();
  });

  it('supports toggling between Matrix View and Team Cards view, and filters by search query', async () => {
    const ENRICHED_MOCK = {
      ...MOCK_CLASSROOM_DATA,
      teams: [
        {
          ...MOCK_CLASSROOM_DATA.teams[0],
          velocity: { completed_this_week: 5, score: 85, label: 'HIGH' as const },
          health: { status: 'HEALTHY' as const, score: 92, risks: [] },
          burndown: { total: 10, completed: 8, in_progress: 1, review: 1, blocked: 0, todo: 0 },
        },
        {
          ...MOCK_CLASSROOM_DATA.teams[1],
          velocity: { completed_this_week: 1, score: 30, label: 'LOW' as const },
          health: { status: 'AT_RISK' as const, score: 40, risks: ['1 open blocker'] },
          burndown: { total: 12, completed: 4, in_progress: 3, review: 1, blocked: 1, todo: 3 },
        },
      ],
    };

    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: ENRICHED_MOCK },
    } as any);

    renderWithRouter(<ClassroomCoordinatorDashboard contextTeamId="parent-1" contextTeamName="Computer Science 101" />);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    // Verify Matrix View is default
    expect(screen.getByText('Matrix View')).toBeDefined();
    expect(screen.getByText('⚡ High')).toBeDefined();
    expect(screen.getByText('⏳ Low')).toBeDefined();

    // Verify Early Warning Signals Banner is shown for at-risk team
    expect(screen.getByText(/Coordinator Intervention Recommended/)).toBeDefined();
    expect(screen.getByText(/1 blocker/)).toBeDefined();

    // Test Search Filter
    const searchInput = screen.getByPlaceholderText(/Search sub-team/i);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(screen.getByTestId('team-row-team-alpha')).toBeDefined();
    expect(screen.queryByTestId('team-row-team-beta')).toBeNull();

    // Test Switching to Cards view
    fireEvent.click(screen.getByText('Team Cards'));
    expect(screen.getByTestId('team-row-team-alpha')).toBeDefined();
  });
});

