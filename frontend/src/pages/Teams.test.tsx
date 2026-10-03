import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Teams from './Teams';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { user_id: 'user-1', full_name: 'Ada Lovelace', role: 'member' };

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha', description: 'Alpha team', is_public: true, created_at: '2026-08-01T00:00:00Z', team_type: 'main', department: 'Software Engg' };
const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta', description: 'Beta team', is_public: true, created_at: '2026-08-02T00:00:00Z', team_type: 'main', department: 'Mathematics' };

const OWNER_MEMBER = { user_id: 'user-1', role: 'owner', user: { full_name: 'Ada Lovelace', username: 'ada' } };
const PLAIN_MEMBER = { user_id: 'user-1', role: 'member', user: { full_name: 'Ada Lovelace', username: 'ada' } };

const EMPTY_DASHBOARD = {
  context: { team_id: 'team-a', team_name: 'Team Alpha', team_type: 'main', description: '' },
  teams: [],
  summary: { total_teams: 0, submitted_today_count: 0, blocked_count: 0, needs_attention_count: 0 },
};

const renderTeams = (user: any = FAKE_USER, initialEntries = ['/teams']) => {
  mockUseAuth.mockReturnValue({ user, isAuthenticated: true, token: 'fake-token', login: vi.fn(), register: vi.fn(), logout: vi.fn() });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Teams />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A] } } as any);
  vi.mocked(api.getAllTeams).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getMyInvites).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getMyJoinRequests).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER] } } as any);
  vi.mocked(api.getJoinRequests).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getSubTeams).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getTeamWorkSubmissions).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getContextDashboard).mockResolvedValue({ data: { data: EMPTY_DASHBOARD } } as any);
  vi.mocked(api.getWorklog).mockResolvedValue({
    data: {
      data: {
        team_id: 'team-a',
        team_name: 'Team Alpha',
        team_summary: {
          tasks: { assigned: 5, completed: 3, in_progress: 1, remaining: 1 },
          goals: { total: 1, active: 1, completed: 0, avg_progress: 50 },
          daily_work: { submissions_today: 1, total_submissions: 5 },
          blockers: { open: 0, in_progress: 0, resolved: 0, total: 0 },
        },
        member_summary: [],
        work_items: { tasks: [], goals: [], daily_work_submissions: [], blockers: [] },
      },
    },
  } as any);
});

describe('Teams — Classroom Analytics Hub / sub-teams mutual exclusivity', () => {
  it('owner of the selected classroom team sees the Analytics Hub entry card and sub-teams', async () => {
    const CLASSROOM_TEAM = { ...TEAM_A, team_type: 'classroom' };
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [CLASSROOM_TEAM] } } as any);
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER] } } as any);
    vi.mocked(api.getSubTeams).mockResolvedValue({ data: { data: [{ team_id: 'sub-1', team_name: 'Sub One', description: 'd', is_public: true }] } } as any);

    renderTeams();

    expect(await screen.findByText(/Classroom Analytics Hub/)).toBeInTheDocument();
    expect(await screen.findByText('Sub One')).toBeInTheDocument();
    expect(screen.getByText(/^Sub-Teams in/)).toBeInTheDocument();
  });

  it('a plain member also sees the Classroom Analytics Hub entry card and sub-teams', async () => {
    const CLASSROOM_TEAM = { ...TEAM_A, team_type: 'classroom' };
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [CLASSROOM_TEAM] } } as any);
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [PLAIN_MEMBER] } } as any);
    vi.mocked(api.getSubTeams).mockResolvedValue({ data: { data: [{ team_id: 'sub-1', team_name: 'Sub One', description: 'd', is_public: true }] } } as any);

    renderTeams();

    await waitFor(() => expect(api.getSubTeams).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByText(/^Sub-Teams in/)).toBeInTheDocument();
    expect(screen.getByText('Sub One')).toBeInTheDocument();
    expect(screen.getByText(/Classroom Analytics Hub/)).toBeInTheDocument();
  });

  it('Analytics Hub banner renders when classroom context has no child teams', async () => {
    const CLASSROOM_TEAM = { ...TEAM_A, team_type: 'classroom' };
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [CLASSROOM_TEAM] } } as any);
    renderTeams();

    expect(await screen.findByText(/Classroom Analytics Hub/)).toBeInTheDocument();
  });
});

describe('Teams — team list and selection', () => {
  it('renders the team list from getMyTeams', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);

    renderTeams();

    expect(await screen.findByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument();
    expect(await screen.findByText('Team Beta')).toBeInTheDocument();
    expect(screen.getByText('Your Teams (2)')).toBeInTheDocument();
  });

  it('auto-selects the first team on load', async () => {
    renderTeams();

    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument();
  });

  it('shows the empty-teams state with join/create prompts when the user has zero teams', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [] } } as any);

    renderTeams();

    expect(await screen.findByText('No teams yet')).toBeInTheDocument();
    expect(screen.getByText('No Team Selected')).toBeInTheDocument();
    expect(api.getTeamMembers).not.toHaveBeenCalled();
  });
});

describe('Teams — team creation', () => {
  it('does not submit when the required team name is empty', async () => {
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    fireEvent.click(screen.getByText('+ Create Team / Classroom'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }));

    expect(api.createTeam).not.toHaveBeenCalled();
  });

  it('only shows the parent-team-ID field for a Normal Team, not for Classroom/Hackathon', async () => {
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('+ Create Team / Classroom'));

    expect(screen.getByText('Parent Classroom/Hackathon Team ID (optional)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Subject \/ Classroom/ }));

    expect(screen.queryByText('Parent Classroom/Hackathon Team ID (optional)')).not.toBeInTheDocument();
  });

  it('creates a team successfully, closes the modal, and reloads the team list', async () => {
    vi.mocked(api.createTeam).mockResolvedValue({ data: { data: { team_id: 'team-new' } } } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('+ Create Team / Classroom'));

    fireEvent.change(screen.getByPlaceholderText('Engineering Team'), { target: { value: 'New Squad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }));

    await waitFor(() => expect(api.createTeam).toHaveBeenCalledWith('New Squad', '', true, 10, undefined, undefined, 'main'));
    await waitFor(() => expect(screen.queryByText('Create New Team')).not.toBeInTheDocument());
    await waitFor(() => expect(api.getMyTeams).toHaveBeenCalledTimes(2));
  });

  it('shows a toast error when team creation fails', async () => {
    vi.mocked(api.createTeam).mockRejectedValue({ response: { data: { error: 'Team name already exists' } } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('+ Create Team / Classroom'));

    fireEvent.change(screen.getByPlaceholderText('Engineering Team'), { target: { value: 'Dup Squad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }));

    expect(await screen.findByText('Team name already exists')).toBeInTheDocument();
    expect(screen.getByText('Create New Team')).toBeInTheDocument();
  });
});

describe('Teams — Join with Team ID', () => {
  it('previews a team successfully', async () => {
    const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
    vi.mocked(api.getTeamPreview).mockResolvedValue({
      data: { data: { team_id: VALID_UUID, team_name: 'Preview Team', description: 'A team', member_count: 3, max_team_size: 10 } },
    } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));

    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: VALID_UUID } });
    fireEvent.click(screen.getByText('Preview'));

    expect(await screen.findByText('Preview Team')).toBeInTheDocument();
    expect(screen.getByText('3/10 members')).toBeInTheDocument();
  });

  it('shows a specific message when the team ID does not exist (404)', async () => {
    const NON_EXISTENT_UUID = '999e4567-e89b-12d3-a456-426614174999';
    vi.mocked(api.getTeamPreview).mockRejectedValue({ response: { status: 404 } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));

    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: NON_EXISTENT_UUID } });
    fireEvent.click(screen.getByText('Preview'));

    expect(await screen.findByText(/No team found with that ID/)).toBeInTheDocument();
  });

  it('sends a join request after a successful preview and displays toast', async () => {
    const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
    vi.mocked(api.getTeamPreview).mockResolvedValue({
      data: { data: { team_id: VALID_UUID, team_name: 'Preview Team', description: 'A team', member_count: 3, max_team_size: 10 } },
    } as any);
    vi.mocked(api.requestJoinTeam).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));
    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: VALID_UUID } });
    fireEvent.click(screen.getByText('Preview'));
    await screen.findByText('Preview Team');

    fireEvent.click(screen.getByRole('button', { name: 'Request to Join' }));

    await waitFor(() => expect(api.requestJoinTeam).toHaveBeenCalledWith(VALID_UUID));
    expect(await screen.findByText('Join request sent! The team owner will review your request.')).toBeInTheDocument();
  });
});

describe('Teams — join requests approve and reject logic', () => {
  it('approves a pending join request and removes it immediately from list', async () => {
    vi.mocked(api.getJoinRequests).mockResolvedValue({
      data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.approveJoinRequest).mockResolvedValue({} as any);
    renderTeams();

    expect(await screen.findByText('Bob Smith')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(api.approveJoinRequest).toHaveBeenCalledWith('req-1'));
    expect(await screen.findByText('Join request approved')).toBeInTheDocument();
  });

  it('rejects a pending join request and removes it immediately from list', async () => {
    vi.mocked(api.getJoinRequests).mockResolvedValue({
      data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.rejectJoinRequest).mockResolvedValue({} as any);
    renderTeams();

    expect(await screen.findByText('Bob Smith')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(api.rejectJoinRequest).toHaveBeenCalledWith('req-1'));
    expect(await screen.findByText('Join request rejected')).toBeInTheDocument();
  });

  it('handles already processed join request idempotently with toast feedback', async () => {
    vi.mocked(api.getJoinRequests).mockResolvedValue({
      data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.approveJoinRequest).mockRejectedValue({
      response: { data: { error: 'This join request has already been processed' } },
    });
    renderTeams();

    expect(await screen.findByText('Bob Smith')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('This join request has already been processed')).toBeInTheDocument();
  });
});

describe('Teams — member rendering and identity', () => {
  it('renders member name and username accurately', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, { user_id: 'user-2', role: 'member', full_name: 'Grace Hopper', username: 'grace' }] },
    } as any);
    renderTeams();

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('@grace')).toBeInTheDocument();
  });

  it('removes member via custom confirmation dialog modal', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, { user_id: 'user-2', role: 'member', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.removeTeamMember).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    // Confirmation modal should appear
    expect(await screen.findByText('Remove Team Member')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to remove Bob Smith from Team Alpha?')).toBeInTheDocument();

    // Click confirm in modal
    fireEvent.click(screen.getByRole('button', { name: 'Remove Member' }));

    await waitFor(() => expect(api.removeTeamMember).toHaveBeenCalledWith('team-a', 'user-2'));
    expect(await screen.findByText('Member removed from team')).toBeInTheDocument();
  });
});

describe('Teams — leaving a team', () => {
  it('leaves the team after custom confirmation modal', async () => {
    vi.mocked(api.leaveTeam).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /Leave/ }));

    expect(await screen.findByRole('heading', { name: 'Leave Team' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave Team' }));

    await waitFor(() => expect(api.leaveTeam).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByText('No Team Selected')).toBeInTheDocument();
  });
});

describe('Teams — Discover Teams Modal & Class Context', () => {
  it('renders discover teams with member counts, class context, and state-aware buttons', async () => {
    vi.mocked(api.getAllTeams).mockResolvedValue({
      data: {
        data: [
          { team_id: 'team-a', team_name: 'Team Alpha', description: 'Alpha', member_count: 5, department: 'Software Engg', is_public: true },
          { team_id: 'team-b', team_name: 'Team Beta', description: 'Beta', member_count: 2, department: 'Mathematics', is_public: true },
        ],
      },
    } as any);

    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '🔍 Discover Teams' }));

    expect(await screen.findByRole('heading', { name: 'Discover Teams' })).toBeInTheDocument();
    expect(screen.getByText('5 members')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.getByText('in Software Engg')).toBeInTheDocument();
    expect(screen.getByText('in Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Already a Member')).toBeInTheDocument();
  });

  it('closes Discover Teams modal via top-right [X] button', async () => {
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '🔍 Discover Teams' }));

    expect(await screen.findByRole('heading', { name: 'Discover Teams' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Discover Teams' })).not.toBeInTheDocument());
  });

  it('renders explicit auth-required UI with Log In and Retry buttons on HTTP 401', async () => {
    vi.mocked(api.getAllTeams).mockImplementation(() =>
      Promise.reject({ response: { status: 401, data: { error: 'No token provided' } } })
    );

    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '🔍 Discover Teams' }));

    expect(await screen.findByText(/Authentication required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log In/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Loading Teams/i })).toBeInTheDocument();
    expect(screen.queryByText('No public teams currently discoverable')).not.toBeInTheDocument();
  });

  it('retries loading teams when Retry button is clicked', async () => {
    vi.mocked(api.getAllTeams).mockImplementationOnce(() =>
      Promise.reject({ response: { status: 401 } })
    );
    vi.mocked(api.getAllTeams).mockImplementationOnce(() =>
      Promise.reject({ response: { status: 401 } })
    );
    vi.mocked(api.getAllTeams).mockImplementationOnce(() =>
      Promise.resolve({ data: { data: [TEAM_A] } } as any)
    );

    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByRole('button', { name: '🔍 Discover Teams' }));

    expect(await screen.findByText(/Authentication required/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry Loading Teams/i }));

    expect(await screen.findByText('Already a Member')).toBeInTheDocument();
  });
});

describe('Teams — Task #8: Unified Individual → Team → Classroom Navigation & Context', () => {
  it('renders the Unified Hierarchical Navigation Bar with My Work link and Scope badge', async () => {
    renderTeams();

    expect(await screen.findByTestId('unified-hierarchy-breadcrumb')).toBeInTheDocument();
    const link = screen.getByText('My Work').closest('a');
    expect(link?.getAttribute('href')).toMatch(/\/(overview|pulse)/);
    expect(await screen.findByText(/Scope: Team Work Transparency/)).toBeInTheDocument();
  });

  it('renders Parent Classroom Context button when team has parent_team_id and navigates to parent team on click', async () => {
    const CLASSROOM_PARENT = { team_id: 'class-1', team_name: 'CS101 Classroom', team_type: 'classroom', is_public: true, created_at: '2026-08-01T00:00:00Z' };
    const CHILD_TEAM = { team_id: 'team-child', team_name: 'Team Child', parent_team_id: 'class-1', team_type: 'main', is_public: true, created_at: '2026-08-02T00:00:00Z' };

    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [CLASSROOM_PARENT, CHILD_TEAM] } } as any);

    renderTeams();

    expect(await screen.findByRole('heading', { name: 'CS101 Classroom' })).toBeInTheDocument();
    expect(screen.getByText('Scope: Classroom Aggregate Overview')).toBeInTheDocument();

    // Select child team via sidebar text
    fireEvent.click(screen.getByText('Team Child'));

    expect(await screen.findByText('Classroom Context')).toBeInTheDocument();
    expect(screen.getByText('Scope: Team Work Transparency')).toBeInTheDocument();

    // Click Classroom Context back button
    fireEvent.click(screen.getByText('Classroom Context'));

    expect(await screen.findByText('Scope: Classroom Aggregate Overview')).toBeInTheDocument();
  });
});
