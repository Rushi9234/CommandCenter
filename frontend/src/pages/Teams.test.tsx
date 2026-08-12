import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Teams from './Teams';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Milestone 54: mocks the two external dependencies Teams.tsx has beyond
// React itself (useAuth, services/api) -- same pattern Pulse.test.tsx/
// useAuth.test.tsx already established, so these tests never make a real
// network call or depend on a running backend.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { user_id: 'user-1', full_name: 'Ada Lovelace', role: 'member' };

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha', description: 'Alpha team', is_public: true, created_at: '2026-08-01T00:00:00Z', team_type: 'main' };
const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta', description: 'Beta team', is_public: true, created_at: '2026-08-02T00:00:00Z', team_type: 'main' };

const OWNER_MEMBER = { user_id: 'user-1', role: 'owner', user: { full_name: 'Ada Lovelace', username: 'ada' } };
const PLAIN_MEMBER = { user_id: 'user-1', role: 'member', user: { full_name: 'Ada Lovelace', username: 'ada' } };

const EMPTY_DASHBOARD = {
  context: { team_id: 'team-a', team_name: 'Team Alpha', team_type: 'main', description: '' },
  teams: [],
  summary: { total_teams: 0, submitted_today_count: 0, blocked_count: 0, needs_attention_count: 0 },
};

const renderTeams = (user: any = FAKE_USER) => {
  mockUseAuth.mockReturnValue({ user, isAuthenticated: true, token: 'fake-token', login: vi.fn(), register: vi.fn(), logout: vi.fn() });
  return render(<Teams />);
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
});

// ---------------------------------------------------------------------------
// FIRST PRIORITY: M51 coordinator-dashboard vs. plain sub-teams mutual
// exclusivity -- the highest-value regression protection this milestone
// exists for.
// ---------------------------------------------------------------------------

describe('Teams — M51 coordinator dashboard / sub-teams mutual exclusivity', () => {
  it('owner of the selected team sees the coordinator dashboard, not the plain sub-teams view', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER] } } as any);
    vi.mocked(api.getSubTeams).mockResolvedValue({ data: { data: [{ team_id: 'sub-1', team_name: 'Sub One', description: 'd', is_public: true }] } } as any);
    vi.mocked(api.getContextDashboard).mockResolvedValue({
      data: {
        data: {
          context: { team_id: 'team-a', team_name: 'Team Alpha', team_type: 'classroom', description: '' },
          teams: [{ team_id: 'sub-1', team_name: 'Sub One', description: 'd', member_count: 2, submitted_today: true, open_blocker_count: 0, needs_attention: false, task_progress: null }],
          summary: { total_teams: 1, submitted_today_count: 1, blocked_count: 0, needs_attention_count: 0 },
        },
      },
    } as any);

    renderTeams();

    await waitFor(() => expect(api.getContextDashboard).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByText(/Coordinator Dashboard/)).toBeInTheDocument();
    expect(screen.getByText('Sub One')).toBeInTheDocument();
    expect(screen.queryByText(/^Teams in this/)).not.toBeInTheDocument();
  });

  it('a plain member never sees the coordinator dashboard, and sees the plain sub-teams view instead', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [PLAIN_MEMBER] } } as any);
    vi.mocked(api.getSubTeams).mockResolvedValue({ data: { data: [{ team_id: 'sub-1', team_name: 'Sub One', description: 'd', is_public: true }] } } as any);

    renderTeams();

    await waitFor(() => expect(api.getSubTeams).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByText(/^Teams in this/)).toBeInTheDocument();
    expect(screen.getByText('Sub One')).toBeInTheDocument();
    expect(screen.queryByText(/Coordinator Dashboard/)).not.toBeInTheDocument();
    expect(api.getContextDashboard).not.toHaveBeenCalled();
  });

  it("M51 dashboard empty state renders when the coordinator's context has no child teams", async () => {
    renderTeams();

    expect(await screen.findByText(/No teams have been created in this/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Team list / selection
// ---------------------------------------------------------------------------

describe('Teams — team list and selection', () => {
  it('renders the team list from getMyTeams', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);

    renderTeams();

    expect(await screen.findByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Team Beta')).toBeInTheDocument();
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

    expect(await screen.findByText('You have no teams yet.')).toBeInTheDocument();
    expect(screen.getByText('No Team Selected')).toBeInTheDocument();
    expect(api.getTeamMembers).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Team creation
// ---------------------------------------------------------------------------

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
    expect(screen.queryByText('Create New Team')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getMyTeams).toHaveBeenCalledTimes(2));
  });

  it('shows an alert when team creation fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(api.createTeam).mockRejectedValue({ response: { data: { error: 'Team name already exists' } } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('+ Create Team / Classroom'));

    fireEvent.change(screen.getByPlaceholderText('Engineering Team'), { target: { value: 'Dup Squad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Team name already exists'));
    expect(screen.getByText('Create New Team')).toBeInTheDocument();
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Join with Team ID (preview -> join)
// ---------------------------------------------------------------------------

describe('Teams — Join with Team ID', () => {
  it('previews a team successfully', async () => {
    vi.mocked(api.getTeamPreview).mockResolvedValue({
      data: { data: { team_id: 'team-x', team_name: 'Preview Team', description: 'A team', member_count: 3, max_team_size: 10 } },
    } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));

    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: 'team-x' } });
    fireEvent.click(screen.getByText('Preview'));

    expect(await screen.findByText('Preview Team')).toBeInTheDocument();
    expect(screen.getByText('3/10 members')).toBeInTheDocument();
  });

  it('shows a specific message when the team ID does not exist (404)', async () => {
    vi.mocked(api.getTeamPreview).mockRejectedValue({ response: { status: 404 } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));

    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: 'nonexistent' } });
    fireEvent.click(screen.getByText('Preview'));

    expect(await screen.findByText(/No team found with that ID/)).toBeInTheDocument();
  });

  it('shows the backend error message for a non-404 preview failure', async () => {
    vi.mocked(api.getTeamPreview).mockRejectedValue({ response: { data: { error: 'Something went wrong' } } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));

    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: 'team-x' } });
    fireEvent.click(screen.getByText('Preview'));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('sends a join request after a successful preview', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(api.getTeamPreview).mockResolvedValue({
      data: { data: { team_id: 'team-x', team_name: 'Preview Team', description: 'A team', member_count: 3, max_team_size: 10 } },
    } as any);
    vi.mocked(api.requestJoinTeam).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔑 Join with Team ID'));
    fireEvent.change(screen.getByPlaceholderText('Paste the Team ID'), { target: { value: 'team-x' } });
    fireEvent.click(screen.getByText('Preview'));
    await screen.findByText('Preview Team');

    fireEvent.click(screen.getByText('Request to Join'));

    await waitFor(() => expect(api.requestJoinTeam).toHaveBeenCalledWith('team-x'));
    expect(alertSpy).toHaveBeenCalledWith('Join request sent! The team owner will review your request.');
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

describe('Teams — invitations', () => {
  it('accepts a pending invite', async () => {
    vi.mocked(api.getMyInvites).mockResolvedValue({ data: { data: [{ invite_id: 'inv-1', team: { team_name: 'Invited Team' } }] } } as any);
    vi.mocked(api.acceptInvite).mockResolvedValue({} as any);
    renderTeams();

    fireEvent.click(await screen.findByText('Accept'));

    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalledWith('inv-1'));
    await waitFor(() => expect(api.getMyInvites).toHaveBeenCalledTimes(2));
  });

  it('rejects a pending invite', async () => {
    vi.mocked(api.getMyInvites).mockResolvedValue({ data: { data: [{ invite_id: 'inv-1', team: { team_name: 'Invited Team' } }] } } as any);
    vi.mocked(api.rejectInvite).mockResolvedValue({} as any);
    renderTeams();

    fireEvent.click(await screen.findByText('Decline'));

    await waitFor(() => expect(api.rejectInvite).toHaveBeenCalledWith('inv-1'));
  });
});

// ---------------------------------------------------------------------------
// Join requests (on a team the caller manages)
// ---------------------------------------------------------------------------

describe('Teams — join requests', () => {
  it('approves a pending join request', async () => {
    vi.mocked(api.getJoinRequests).mockResolvedValue({
      data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.approveJoinRequest).mockResolvedValue({} as any);
    renderTeams();

    fireEvent.click(await screen.findByText('Approve'));

    await waitFor(() => expect(api.approveJoinRequest).toHaveBeenCalledWith('req-1'));
  });

  it('rejects a pending join request', async () => {
    vi.mocked(api.getJoinRequests).mockResolvedValue({
      data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.rejectJoinRequest).mockResolvedValue({} as any);
    renderTeams();

    fireEvent.click(await screen.findByText('Reject'));

    await waitFor(() => expect(api.rejectJoinRequest).toHaveBeenCalledWith('req-1'));
  });
});

// ---------------------------------------------------------------------------
// Membership / roles, including owner protection
// ---------------------------------------------------------------------------

describe('Teams — membership, roles, and owner protection', () => {
  it("updates a non-owner member's role", async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, { user_id: 'user-2', role: 'member', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.updateMemberRole).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    fireEvent.change(screen.getByDisplayValue('Member'), { target: { value: 'admin' } });

    await waitFor(() => expect(api.updateMemberRole).toHaveBeenCalledWith('team-a', 'user-2', 'admin'));
  });

  it('removes a non-owner member after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, { user_id: 'user-2', role: 'member', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.removeTeamMember).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(api.removeTeamMember).toHaveBeenCalledWith('team-a', 'user-2'));
  });

  it('shows an alert if removing a member fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, { user_id: 'user-2', role: 'member', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.removeTeamMember).mockRejectedValue({ response: { data: { error: 'Cannot remove this member' } } });
    renderTeams();
    await screen.findByText('Bob Smith');

    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Cannot remove this member'));
    alertSpy.mockRestore();
  });

  it('never lets the owner be demoted or removed', async () => {
    renderTeams();
    await screen.findByText('Ada Lovelace');

    expect(screen.getByDisplayValue('Owner')).toBeDisabled();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Leaving a team
// ---------------------------------------------------------------------------

describe('Teams — leaving a team', () => {
  it('leaves the team after confirmation and clears the selection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.leaveTeam).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByText('🚪 Leave'));

    await waitFor(() => expect(api.leaveTeam).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByText('No Team Selected')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SHOULD TEST: additional behaviors, kept non-brittle
// ---------------------------------------------------------------------------

describe('Teams — additional behaviors', () => {
  it("shows each member's Today's Activity submission badge correctly", async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, { user_id: 'user-2', role: 'member', user: { full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.getTeamWorkSubmissions).mockResolvedValue({ data: { data: [{ user_id: 'user-2' }] } } as any);

    renderTeams();

    expect(await screen.findByText('✅ Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('⚪ Ada Lovelace')).toBeInTheDocument();
  });

  it('shows a classroom/hackathon context badge on the team header', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [{ ...TEAM_A, team_type: 'classroom' }] } } as any);

    renderTeams();

    expect(await screen.findByText(/Subject \/ Classroom/)).toBeInTheDocument();
  });

  it('renders Discover Teams search results', async () => {
    vi.mocked(api.searchTeams).mockResolvedValue({ data: { data: [{ team_id: 'team-y', team_name: 'Found Team', description: 'x', member_count: 1, is_public: true }] } } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔍 Discover Teams'));

    fireEvent.change(screen.getByPlaceholderText('Search teams by name or description...'), { target: { value: 'Found' } });

    expect(await screen.findByText('Found Team')).toBeInTheDocument();
  });

  it('shows the empty state when Discover Teams has no results', async () => {
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔍 Discover Teams'));

    expect(screen.getByText('No teams available')).toBeInTheDocument();
  });
});
