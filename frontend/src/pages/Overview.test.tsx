import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Overview from './Overview';
import * as api from '../services/api';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/api');

vi.mock('../services/pulseService', () => ({
  default: {
    getIndividualPulse: vi.fn().mockResolvedValue({ events: [] }),
    getTeamPulse: vi.fn().mockResolvedValue({ events: [] }),
    getClassroomPulse: vi.fn().mockResolvedValue({ events: [] }),
  },
  pulseService: {
    getIndividualPulse: vi.fn().mockResolvedValue({ events: [] }),
    getTeamPulse: vi.fn().mockResolvedValue({ events: [] }),
    getClassroomPulse: vi.fn().mockResolvedValue({ events: [] }),
  },
}));

vi.mock('../hooks/useRealtime', () => ({
  useRealtime: vi.fn(),
}));

vi.mock('../components/ClassroomCoordinatorDashboard', () => ({
  default: ({ contextTeamId }: { contextTeamId: string }) => (
    <div data-testid="classroom-coordinator-dashboard">
      <div>Computer Science 101</div>
      <div>Alpha Squad</div>
      <div>Beta Squad</div>
      <span>Classroom: {contextTeamId}</span>
    </div>
  ),
}));

vi.mock('../components/TeamLeaderWorklogDashboard', () => ({
  default: ({ teamId, teamName }: any) => (
    <div data-testid="team-leader-dashboard">Team: {teamName} ({teamId})</div>
  ),
}));

vi.mock('../components/MemberDetailView', () => ({
  default: ({ member }: any) => (
    <div data-testid="member-detail-view">Member: {member?.full_name}</div>
  ),
}));

vi.mock('../components/AssignWorkModal', () => ({
  default: () => null,
  AssignWorkModal: () => null,
}));

vi.mock('../components/ai/AIAssistantDrawer', () => ({
  default: () => null,
  AIAssistantDrawer: () => null,
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const MOCK_TEAMS = [
  {
    team_id: 'class-1',
    team_name: 'Computer Science 101',
    description: 'Fall CS101 Classroom Context',
    team_type: 'classroom',
  },
];

const MOCK_CONTEXT_DASHBOARD = {
  context: {
    team_id: 'class-1',
    team_name: 'Computer Science 101',
    team_type: 'classroom',
    description: 'Fall CS101 Classroom Context',
  },
  summary: {
    total_teams: 2,
    submitted_today_count: 1,
    blocked_count: 0,
    needs_attention_count: 0,
  },
  teams: [
    {
      team_id: 'team-alpha',
      team_name: 'Alpha Squad',
      description: 'Compiler Team',
      team_type: 'project_team',
      member_count: 4,
      open_blocker_count: 0,
      submitted_today: true,
      task_progress: { total: 10, completed: 8, percent: 80 },
      needs_attention: false,
    },
    {
      team_id: 'team-beta',
      team_name: 'Beta Squad',
      description: 'Database Team',
      team_type: 'project_team',
      member_count: 3,
      open_blocker_count: 1,
      submitted_today: false,
      task_progress: { total: 12, completed: 4, percent: 33 },
      needs_attention: true,
    },
  ],
};

const renderWithRouter = (initialEntries = ['/overview']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/overview" element={<Overview />} />
        <Route path="/classes" element={<Overview />} />
        <Route path="/classes/:classId" element={<Overview />} />
        <Route path="/classes/:classId/teams/:teamId" element={<Overview />} />
        <Route path="/classes/:classId/teams/:teamId/members/:memberId" element={<Overview />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Overview Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        user_id: 'user-1',
        full_name: 'Professor Test',
        username: 'prof_test',
        role: 'owner',
      },
      isAuthenticated: true,
      token: 'fake-token',
    });
    vi.mocked(api.getMyTeams).mockResolvedValue({
      data: { data: MOCK_TEAMS },
    } as any);
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: { data: MOCK_CONTEXT_DASHBOARD },
    } as any);
    vi.mocked(api.getMyProjects).mockResolvedValue({
      data: { data: [] },
    } as any);
    vi.mocked(api.getProjectTasks).mockResolvedValue({
      data: { data: [] },
    } as any);
    vi.mocked(api.getGoals).mockResolvedValue({
      data: { data: [] },
    } as any);
    vi.mocked(api.getClassroomAttentionDetails).mockResolvedValue({
      data: { data: null },
    } as any);
    vi.mocked(api.getMyAttention).mockResolvedValue({
      data: { data: null },
    } as any);
    vi.mocked(api.getTeamAttentionDetails).mockResolvedValue({
      data: { data: null },
    } as any);
  });

  it('renders root overview page with MY CLASSES cards grid for Class Owner', async () => {
    renderWithRouter(['/overview']);

    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-overview')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-classes')).not.toBeInTheDocument();
    });

    expect(screen.getByText(/MY CLASSES \(1\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('class-card-class-1')).toBeInTheDocument();
    expect(within(screen.getByTestId('class-card-class-1')).getByText('Computer Science 101')).toBeInTheDocument();
    expect(screen.getByText(/Open Class/i)).toBeInTheDocument();
  });

  it('navigates to Class Overview when clicking a class card', async () => {
    renderWithRouter(['/overview']);

    await waitFor(() => {
      expect(screen.getByTestId('class-card-class-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('class-card-class-1'));

    await waitFor(() => {
      expect(api.getContextDashboard).toHaveBeenCalledWith('class-1');
    });
  });

  it('renders Class Overview directly when visiting /classes/class-1 route', async () => {
    renderWithRouter(['/classes/class-1']);

    await waitFor(() => {
      expect(screen.getByTestId('classroom-coordinator-dashboard')).toBeDefined();
    });

    expect(screen.getByTestId('breadcrumb-class')).toBeDefined();
    expect(screen.getByText('Computer Science 101')).toBeDefined();
    expect(screen.getByText('Alpha Squad')).toBeDefined();
    expect(screen.getByText('Beta Squad')).toBeDefined();
  });

  it('preserves zero employee surveillance metrics across all levels', async () => {
    renderWithRouter(['/overview']);

    await waitFor(() => {
      expect(screen.getByTestId('overview-page')).toBeDefined();
    });

    expect(screen.queryByText(/keystrokes/i)).toBeNull();
    expect(screen.queryByText(/screen time/i)).toBeNull();
    expect(screen.queryByText(/productivity score/i)).toBeNull();
    expect(screen.queryByText(/worker ranking/i)).toBeNull();
  });
});
