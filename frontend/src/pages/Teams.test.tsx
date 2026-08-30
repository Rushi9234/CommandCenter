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
const SECOND_USER = { user_id: 'user-2', full_name: 'Bob Smith', role: 'member' };

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha', description: 'Alpha team', is_public: true, created_at: '2026-08-01T00:00:00Z', team_type: 'main' };
const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta', description: 'Beta team', is_public: true, created_at: '2026-08-02T00:00:00Z', team_type: 'main' };

// Milestone (Teams Phase A): teams.repository.ts's getTeamMembers returns
// FLAT columns (tm.*, u.full_name, u.username, u.email) -- there is no
// nested `.user` object. The previous fixtures here used a nested shape
// that didn't match the real API response, which is exactly what caused
// the "U" / "@" placeholder bug this phase fixed (Teams.tsx read
// member.user?.full_name against a real response that had no .user at
// all). These fixtures now mirror the actual backend shape.
const OWNER_MEMBER = { user_id: 'user-1', role: 'owner', full_name: 'Ada Lovelace', username: 'ada' };
const PLAIN_MEMBER = { user_id: 'user-1', role: 'member', full_name: 'Ada Lovelace', username: 'ada' };
const BOB_MEMBER = { user_id: 'user-2', role: 'member', full_name: 'Bob Smith', username: 'bob' };
const PLAIN_MEMBER_SELF = BOB_MEMBER;
const CARL_ADMIN = { user_id: 'user-3', role: 'admin', full_name: 'Carl Admin', username: 'carladmin' };

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
  it('approves a pending join request and the request disappears from the UI without a manual refresh', async () => {
    vi.mocked(api.getJoinRequests)
      .mockResolvedValueOnce({ data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] } } as any)
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    vi.mocked(api.approveJoinRequest).mockResolvedValue({} as any);
    renderTeams();

    fireEvent.click(await screen.findByText('Approve'));

    await waitFor(() => expect(api.approveJoinRequest).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument());
  });

  it('rejects a pending join request and it disappears from the UI without a manual refresh', async () => {
    vi.mocked(api.getJoinRequests)
      .mockResolvedValueOnce({ data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] } } as any)
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    vi.mocked(api.rejectJoinRequest).mockResolvedValue({} as any);
    renderTeams();

    fireEvent.click(await screen.findByText('Reject'));

    await waitFor(() => expect(api.rejectJoinRequest).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument());
  });

  it('a plain member never fetches or sees join requests at all (backend is owner/admin-only for this endpoint)', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [PLAIN_MEMBER, BOB_MEMBER] } } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    expect(api.getJoinRequests).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 2/3 (Teams Phase A): authorization-visibility gating and member
// identity display, driven by the caller's real role (myRole), never a
// guessed/hardcoded role name.
// ---------------------------------------------------------------------------

describe('Teams — authorization visibility (Step 2)', () => {
  it('a plain member does not see Settings, Invite, or any per-member management controls', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [PLAIN_MEMBER, BOB_MEMBER] } } as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    expect(screen.queryByText('⚙️ Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('📧 Invite')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    // A plain member CAN leave the team -- that action IS authorized.
    expect(screen.getByText('🚪 Leave')).toBeInTheDocument();
  });

  it('the owner sees Settings and Invite, but not a Leave button (leaving is rejected for the owner)', async () => {
    renderTeams();
    await screen.findByText('Ada Lovelace');

    expect(screen.getByText('⚙️ Settings')).toBeInTheDocument();
    expect(screen.getByText('📧 Invite')).toBeInTheDocument();
    expect(screen.queryByText('🚪 Leave')).not.toBeInTheDocument();
  });

  it('an admin can manage a plain member but NOT another admin -- only the owner can (matches backend hierarchy rule)', async () => {
    const ADMIN_SELF = { user_id: 'user-1', role: 'admin', full_name: 'Ada Lovelace', username: 'ada' };
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [ADMIN_SELF, BOB_MEMBER, CARL_ADMIN] } } as any);
    renderTeams();
    await screen.findByText('Carl Admin');

    // Bob (plain member) is manageable by an admin.
    const bobRow = screen.getByText('Bob Smith').closest('div.pro-card-hover') as HTMLElement;
    expect(bobRow.querySelector('select')).not.toBeNull();
    expect(bobRow.querySelector('button')).not.toBeNull();

    // Carl (another admin) is NOT manageable by a non-owner admin.
    const carlRow = screen.getByText('Carl Admin').closest('div.pro-card-hover') as HTMLElement;
    expect(carlRow.querySelector('select')).toBeNull();
    expect(carlRow.querySelector('button')).toBeNull();
  });
});

describe('Teams — member identity display (Step 3)', () => {
  it("shows each member's real full name, @username, and role badge from the actual (flat) API response", async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER, BOB_MEMBER] } } as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
    expect(screen.getByText('👑 Owner')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
    // "Member" also appears as an <option> inside the role-change select
    // (the viewer here is the owner, so Bob's row is manageable) --
    // getAllByText avoids a false ambiguity error over that.
    expect(screen.getAllByText('Member').length).toBeGreaterThan(0);
    // Never a bare "U" initial or a dangling "@" with nothing after it.
    expect(screen.queryByText('U')).not.toBeInTheDocument();
  });
});

describe('Teams — hierarchy (Step 4)', () => {
  it('labels a team with no parent_team_id as an Independent Team', async () => {
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    expect(screen.getByText('Independent Team')).toBeInTheDocument();
  });

  it('labels a sub-team with its resolved parent name, using the existing team-preview endpoint', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [{ ...TEAM_A, parent_team_id: 'team-parent' }] } } as any);
    vi.mocked(api.getTeamPreview).mockResolvedValue({
      data: { data: { team_id: 'team-parent', team_name: 'Software Engineering — Batch A' } },
    } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    expect(await screen.findByText('Sub-team of Software Engineering — Batch A')).toBeInTheDocument();
    expect(api.getTeamPreview).toHaveBeenCalledWith('team-parent');
  });
});

describe('Teams — Discover Teams loading/empty/error (Step 5)', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
  };

  it('shows a loading state, never "No teams available", while the initial list is still in flight', async () => {
    const allTeamsRequest = deferred<any>();
    vi.mocked(api.getAllTeams).mockReturnValue(allTeamsRequest.promise as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔍 Discover Teams'));

    expect(screen.getByText('Loading teams...')).toBeInTheDocument();
    expect(screen.queryByText('No teams available')).not.toBeInTheDocument();

    allTeamsRequest.resolve({ data: { data: [] } });
    await waitFor(() => expect(screen.getByText('No teams available')).toBeInTheDocument());
  });

  it('shows a visible error with Retry when loading Discover Teams fails', async () => {
    vi.mocked(api.getAllTeams).mockRejectedValue({ response: { data: {} } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });
    fireEvent.click(screen.getByText('🔍 Discover Teams'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load teams');
    expect(screen.queryByText('No teams available')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Membership / roles, including owner protection
// ---------------------------------------------------------------------------

describe('Teams — membership, roles, and owner protection', () => {
  it("updates a non-owner member's role", async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, BOB_MEMBER] },
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
      data: { data: [OWNER_MEMBER, BOB_MEMBER] },
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
      data: { data: [OWNER_MEMBER, BOB_MEMBER] },
    } as any);
    vi.mocked(api.removeTeamMember).mockRejectedValue({ response: { data: { error: 'Cannot remove this member' } } });
    renderTeams();
    await screen.findByText('Bob Smith');

    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Cannot remove this member'));
    alertSpy.mockRestore();
  });

  it('never lets the owner be demoted or removed -- no role select or Remove control on the owner row at all', async () => {
    renderTeams();
    await screen.findByText('Ada Lovelace');

    expect(screen.getByText('👑 Owner')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Leaving a team
// ---------------------------------------------------------------------------

describe('Teams — leaving a team', () => {
  // Milestone (Teams Phase A): the backend's leaveTeam rejects the owner
  // (ForbiddenError) -- Step 2's authorization-visibility fix now
  // correctly hides the Leave button for the owner (see the "authorization
  // visibility" describe block above), so this test uses a non-owner
  // member as the viewer instead of the default owner fixture, matching
  // who is actually allowed to leave.
  it('leaves the team after confirmation and clears the selection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER, PLAIN_MEMBER_SELF] } } as any);
    vi.mocked(api.leaveTeam).mockResolvedValue({} as any);
    renderTeams(SECOND_USER);
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByText('🚪 Leave'));

    await waitFor(() => expect(api.leaveTeam).toHaveBeenCalledWith('team-a'));
    expect(await screen.findByText('No Team Selected')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SHOULD TEST: additional behaviors, kept non-brittle
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Synchronization/loading audit: selectTeam() stale-response race fix.
// ---------------------------------------------------------------------------

describe('Teams — selectTeam() stale-response race protection', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
  };

  it('a stale response for a previous team does not overwrite a faster response for the next team (Team A -> Team B race)', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);

    const teamAMembersRequest = deferred<any>();
    const teamBMembersRequest = deferred<any>();
    vi.mocked(api.getTeamMembers).mockImplementation((teamId: string) => {
      if (teamId === 'team-a') return teamAMembersRequest.promise as any;
      if (teamId === 'team-b') return teamBMembersRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });

    renderTeams();
    // Initial mount auto-selects Team A, starting a selectTeam('team-a')
    // that is now in flight (its members request has not resolved yet).
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledWith('team-a'));

    // Switch to Team B before Team A's members request resolves.
    fireEvent.click(screen.getByText('Team Beta'));
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledWith('team-b'));

    // Resolve Team B's (newer, current) response first.
    teamBMembersRequest.resolve({ data: { data: [BOB_MEMBER] } });
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());

    // Resolve Team A's stale response afterward.
    teamAMembersRequest.resolve({ data: { data: [OWNER_MEMBER] } });
    // Give the stale resolution a chance to (incorrectly) apply.
    await new Promise((r) => setTimeout(r, 0));

    // Team B's member must still be shown; Team A's stale member must not
    // have overwritten it.
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('a stale sub-teams/work-submissions response for a previous team is discarded after switching', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    // A plain member (not owner/admin) so the coordinator dashboard is
    // never fetched/rendered -- otherwise it would take rendering
    // priority over the plain sub-teams view this test asserts on (see
    // the M51 mutual-exclusivity describe block above).
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [PLAIN_MEMBER] } } as any);

    const teamASubTeamsRequest = deferred<any>();
    const teamBSubTeamsRequest = deferred<any>();
    vi.mocked(api.getSubTeams).mockImplementation((teamId: string) => {
      if (teamId === 'team-a') return teamASubTeamsRequest.promise as any;
      if (teamId === 'team-b') return teamBSubTeamsRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });

    renderTeams();
    await waitFor(() => expect(api.getSubTeams).toHaveBeenCalledWith('team-a'));

    fireEvent.click(screen.getByText('Team Beta'));
    await waitFor(() => expect(api.getSubTeams).toHaveBeenCalledWith('team-b'));

    teamBSubTeamsRequest.resolve({ data: { data: [{ team_id: 'sub-b', team_name: 'Sub Under Beta', description: '', is_public: true }] } });
    await waitFor(() => expect(screen.getByText('Sub Under Beta')).toBeInTheDocument());

    teamASubTeamsRequest.resolve({ data: { data: [{ team_id: 'sub-a', team_name: 'Sub Under Alpha', description: '', is_public: true }] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Sub Under Beta')).toBeInTheDocument();
    expect(screen.queryByText('Sub Under Alpha')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Optimize Teams mutation refetches: removeMember/updateMemberRole/
// approve-reject-JoinRequest used to trigger the FULL selectTeam()
// cascade; now each refetches only the resource(s) that endpoint's own
// controller can actually change (verified by reading
// teams.controller.ts -- all four return no body, so nothing else in the
// cascade -- sub-teams, work-submissions, coordinator dashboard, parent-
// team preview -- is ever affected by them).
// ---------------------------------------------------------------------------

describe('Teams — mutation refetch scoping (optimize Teams mutation refetches)', () => {
  it('removing a member refetches only team members -- not sub-teams, submissions, dashboard, or join-requests', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER, BOB_MEMBER] } } as any);
    vi.mocked(api.removeTeamMember).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    vi.mocked(api.getTeamMembers).mockClear();
    vi.mocked(api.getSubTeams).mockClear();
    vi.mocked(api.getTeamWorkSubmissions).mockClear();
    vi.mocked(api.getContextDashboard).mockClear();
    vi.mocked(api.getJoinRequests).mockClear();
    vi.mocked(api.getTeamPreview).mockClear();

    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(api.removeTeamMember).toHaveBeenCalledWith('team-a', 'user-2'));
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(1));
    expect(api.getSubTeams).not.toHaveBeenCalled();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
    expect(api.getContextDashboard).not.toHaveBeenCalled();
    expect(api.getJoinRequests).not.toHaveBeenCalled();
    expect(api.getTeamPreview).not.toHaveBeenCalled();
  });

  it("updating a member's role refetches only team members -- not sub-teams, submissions, dashboard, or join-requests", async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [OWNER_MEMBER, BOB_MEMBER] } } as any);
    vi.mocked(api.updateMemberRole).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Bob Smith');

    vi.mocked(api.getTeamMembers).mockClear();
    vi.mocked(api.getSubTeams).mockClear();
    vi.mocked(api.getTeamWorkSubmissions).mockClear();
    vi.mocked(api.getContextDashboard).mockClear();
    vi.mocked(api.getJoinRequests).mockClear();

    fireEvent.change(screen.getByDisplayValue('Member'), { target: { value: 'admin' } });

    await waitFor(() => expect(api.updateMemberRole).toHaveBeenCalledWith('team-a', 'user-2', 'admin'));
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(1));
    expect(api.getSubTeams).not.toHaveBeenCalled();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
    expect(api.getContextDashboard).not.toHaveBeenCalled();
    expect(api.getJoinRequests).not.toHaveBeenCalled();
  });

  it('approving a join request refetches team members AND join requests -- not sub-teams, submissions, or dashboard', async () => {
    vi.mocked(api.getJoinRequests)
      .mockResolvedValueOnce({ data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] } } as any)
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    vi.mocked(api.approveJoinRequest).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Approve');

    vi.mocked(api.getTeamMembers).mockClear();
    vi.mocked(api.getSubTeams).mockClear();
    vi.mocked(api.getTeamWorkSubmissions).mockClear();
    vi.mocked(api.getContextDashboard).mockClear();

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => expect(api.approveJoinRequest).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument());
    expect(api.getSubTeams).not.toHaveBeenCalled();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
    expect(api.getContextDashboard).not.toHaveBeenCalled();
  });

  it('rejecting a join request refetches only join requests -- not team members, sub-teams, submissions, or dashboard', async () => {
    vi.mocked(api.getJoinRequests)
      .mockResolvedValueOnce({ data: { data: [{ request_id: 'req-1', user: { full_name: 'Bob Smith', username: 'bob' } }] } } as any)
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    vi.mocked(api.rejectJoinRequest).mockResolvedValue({} as any);
    renderTeams();
    await screen.findByText('Reject');

    vi.mocked(api.getTeamMembers).mockClear();
    vi.mocked(api.getSubTeams).mockClear();
    vi.mocked(api.getTeamWorkSubmissions).mockClear();
    vi.mocked(api.getContextDashboard).mockClear();

    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => expect(api.rejectJoinRequest).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(api.getJoinRequests).toHaveBeenCalledTimes(2));
    expect(api.getTeamMembers).not.toHaveBeenCalled();
    expect(api.getSubTeams).not.toHaveBeenCalled();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
    expect(api.getContextDashboard).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Teams settings save — server-truth synchronization: updateTeamSettings'
// controller returns the full updated team row (RETURNING *), which is
// now used directly instead of relying on the settings form's own local
// edits or a follow-up loadTeams() that never re-synced the detail pane.
// ---------------------------------------------------------------------------

describe('Teams — settings save server-truth synchronization', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
  };

  it('synchronizes the selected-team detail pane with the server-confirmed result after a successful save', async () => {
    vi.mocked(api.updateTeamSettings).mockResolvedValue({
      data: { data: { ...TEAM_A, team_name: 'Renamed Alpha', description: 'New description', is_public: false } },
    } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    fireEvent.click(screen.getByText('⚙️ Settings'));
    fireEvent.change(screen.getByDisplayValue('Team Alpha'), { target: { value: 'Renamed Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.updateTeamSettings).toHaveBeenCalledWith('team-a', {
      team_name: 'Renamed Alpha',
      description: 'Alpha team',
      is_public: true,
    }));
    expect(await screen.findByRole('heading', { name: 'Renamed Alpha' })).toBeInTheDocument();
    expect(screen.queryByText('Team Settings')).not.toBeInTheDocument();
  });

  it('synchronizes the sidebar team list with the server-confirmed result after a successful save', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    vi.mocked(api.updateTeamSettings).mockResolvedValue({
      data: { data: { ...TEAM_A, team_name: 'Renamed Alpha' } },
    } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    fireEvent.click(screen.getByText('⚙️ Settings'));
    fireEvent.change(screen.getByDisplayValue('Team Alpha'), { target: { value: 'Renamed Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await screen.findByRole('heading', { name: 'Renamed Alpha' });

    // Both the detail-pane heading AND the sidebar list entry reflect the
    // rename -- not just one of them.
    expect(screen.getAllByText('Renamed Alpha').length).toBeGreaterThan(1);
    expect(screen.queryByText('Team Alpha')).not.toBeInTheDocument();
  });

  it('does not falsely apply the change to the confirmed team state when the save fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(api.updateTeamSettings).mockRejectedValue({ response: { data: { error: 'Team name already exists' } } });
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    fireEvent.click(screen.getByText('⚙️ Settings'));
    fireEvent.change(screen.getByDisplayValue('Team Alpha'), { target: { value: 'Taken Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Team name already exists'));
    // The confirmed detail-pane heading must still show the last
    // server-confirmed name -- the failed edit lives only in the (still
    // open) form, never applied to selectedTeam/the sidebar.
    expect(screen.getByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Taken Name' })).not.toBeInTheDocument();
    expect(screen.getByText('Team Settings')).toBeInTheDocument();
    alertSpy.mockRestore();
  });

  it('a Team A settings save that resolves after switching to Team B does not overwrite Team B', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    const saveRequest = deferred<any>();
    vi.mocked(api.updateTeamSettings).mockReturnValue(saveRequest.promise as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    fireEvent.click(screen.getByText('⚙️ Settings'));
    fireEvent.change(screen.getByDisplayValue('Team Alpha'), { target: { value: 'Renamed Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(api.updateTeamSettings).toHaveBeenCalled());

    // Switch to Team B before the save resolves.
    fireEvent.click(screen.getByText('Team Beta'));
    await screen.findByRole('heading', { name: 'Team Beta' });

    // Team A's save now resolves, stale relative to the team switch.
    saveRequest.resolve({ data: { data: { ...TEAM_A, team_name: 'Renamed Alpha' } } });
    await new Promise((r) => setTimeout(r, 0));

    // Team B must still be displayed -- Team A's stale save response must
    // not overwrite it.
    expect(screen.getByRole('heading', { name: 'Team Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Renamed Alpha' })).not.toBeInTheDocument();
  });

  it('a successful save does not trigger any refetch beyond the settings update itself', async () => {
    vi.mocked(api.updateTeamSettings).mockResolvedValue({
      data: { data: { ...TEAM_A, team_name: 'Renamed Alpha' } },
    } as any);
    renderTeams();
    await screen.findByRole('heading', { name: 'Team Alpha' });

    vi.mocked(api.getMyTeams).mockClear();
    vi.mocked(api.getTeamMembers).mockClear();
    vi.mocked(api.getSubTeams).mockClear();
    vi.mocked(api.getTeamWorkSubmissions).mockClear();
    vi.mocked(api.getContextDashboard).mockClear();
    vi.mocked(api.getJoinRequests).mockClear();

    fireEvent.click(screen.getByText('⚙️ Settings'));
    fireEvent.change(screen.getByDisplayValue('Team Alpha'), { target: { value: 'Renamed Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await screen.findByRole('heading', { name: 'Renamed Alpha' });

    // The response itself is server truth -- nothing else needs refetching.
    expect(api.getMyTeams).not.toHaveBeenCalled();
    expect(api.getTeamMembers).not.toHaveBeenCalled();
    expect(api.getSubTeams).not.toHaveBeenCalled();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
    expect(api.getContextDashboard).not.toHaveBeenCalled();
    expect(api.getJoinRequests).not.toHaveBeenCalled();
  });
});

describe('Teams — additional behaviors', () => {
  it("shows each member's Today's Activity submission badge correctly", async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue({
      data: { data: [OWNER_MEMBER, BOB_MEMBER] },
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
