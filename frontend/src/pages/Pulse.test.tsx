import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Pulse from './Pulse';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Milestone 52: mocks the two external dependencies Pulse has beyond
// React itself (useAuth, services/api) so these tests never make a real
// network call or depend on a running backend -- same pattern
// useAuth.test.tsx/Navigation.test.tsx already established.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { user_id: 'user-1', full_name: 'Ada Lovelace', role: 'member', impact_score: 10, streak_count: 3 };

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha' };
const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta' };

const renderPulse = (user: any = FAKE_USER) => {
  mockUseAuth.mockReturnValue({ user, isAuthenticated: true, token: 'fake-token', login: vi.fn(), register: vi.fn(), logout: vi.fn() });
  return render(<Pulse />);
};

describe('Pulse — Daily Work (Milestone 52)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyLogs).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getLogSuggestions).mockResolvedValue({ data: { data: null } } as any);
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    vi.mocked(api.getTeamWorkSubmissions).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getTodaysWorkEntries).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getWorkHistory).mockResolvedValue({ data: { data: [] } } as any);
  });

  it('loads teams and starts with no team selected', async () => {
    renderPulse();

    await waitFor(() => expect(api.getMyTeams).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Select a team above to log or view today's work.")).toBeInTheDocument();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
    expect(api.getTodaysWorkEntries).not.toHaveBeenCalled();
  });

  it('shows an empty-teams message and makes no Daily Work call when the user has zero teams', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [] } } as any);
    renderPulse();

    await waitFor(() => expect(api.getMyTeams).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/not on any team yet/i)).toBeInTheDocument();
    expect(api.getTeamWorkSubmissions).not.toHaveBeenCalled();
  });

  it('fetches submission state only after a team is explicitly selected', async () => {
    renderPulse();
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });

    await waitFor(() => expect(api.getTeamWorkSubmissions).toHaveBeenCalledWith('team-a'));
    expect(api.getTodaysWorkEntries).toHaveBeenCalledWith('team-a');
  });

  it('shows the read-only submitted card and never fetches today\'s entries when already submitted', async () => {
    vi.mocked(api.getTeamWorkSubmissions).mockResolvedValue({
      data: { data: [{ user_id: 'user-1', confirmed_summary: 'Shipped the thing.', confirmed_at: '2026-08-12T10:00:00Z' }] },
    } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });

    await waitFor(() => expect(screen.getByText("Today's work submitted")).toBeInTheDocument());
    expect(screen.getByText('Shipped the thing.')).toBeInTheDocument();
    expect(api.getTodaysWorkEntries).not.toHaveBeenCalled();
  });

  it('shows the empty-entries state, then adds an entry', async () => {
    vi.mocked(api.createWorkEntry).mockResolvedValue({ data: { data: { entry_id: 'e1', entry_text: 'Fixed the bug' } } } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => expect(screen.getByText('No entries yet today for this team.')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('What did you work on?'), { target: { value: 'Fixed the bug' } });
    fireEvent.click(screen.getByText('Add Entry'));

    await waitFor(() => expect(api.createWorkEntry).toHaveBeenCalledWith('team-a', 'Fixed the bug'));
    expect(await screen.findByText('Fixed the bug')).toBeInTheDocument();
  });

  it('supports adding multiple entries', async () => {
    vi.mocked(api.createWorkEntry)
      .mockResolvedValueOnce({ data: { data: { entry_id: 'e1', entry_text: 'First thing' } } } as any)
      .mockResolvedValueOnce({ data: { data: { entry_id: 'e2', entry_text: 'Second thing' } } } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('No entries yet today for this team.'));

    const input = screen.getByPlaceholderText('What did you work on?');
    fireEvent.change(input, { target: { value: 'First thing' } });
    fireEvent.click(screen.getByText('Add Entry'));
    await screen.findByText('First thing');

    fireEvent.change(input, { target: { value: 'Second thing' } });
    fireEvent.click(screen.getByText('Add Entry'));
    await screen.findByText('Second thing');

    expect(screen.getByText('First thing')).toBeInTheDocument();
    expect(api.createWorkEntry).toHaveBeenCalledTimes(2);
  });

  it('disables Add Entry for empty entry text', async () => {
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('No entries yet today for this team.'));

    expect(screen.getByText('Add Entry')).toBeDisabled();
  });

  it('generates and displays an editable AI summary once entries exist', async () => {
    vi.mocked(api.getTodaysWorkEntries).mockResolvedValue({ data: { data: [{ entry_id: 'e1', entry_text: 'Did stuff' }] } } as any);
    vi.mocked(api.summarizeWork).mockResolvedValue({ data: { data: { draftSummary: 'You did stuff today.' } } } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => expect(screen.getByText('Did stuff')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Get AI Summary'));

    await waitFor(() => expect(api.summarizeWork).toHaveBeenCalledWith('team-a'));
    const textarea = await screen.findByDisplayValue('You did stuff today.');
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Edited summary text here.' } });
    expect(screen.getByDisplayValue('Edited summary text here.')).toBeInTheDocument();
  });

  it('submits the confirmed summary and transitions to the read-only submitted view using the submit response', async () => {
    vi.mocked(api.getTodaysWorkEntries).mockResolvedValue({ data: { data: [{ entry_id: 'e1', entry_text: 'Did stuff' }] } } as any);
    vi.mocked(api.summarizeWork).mockResolvedValue({ data: { data: { draftSummary: 'Draft summary.' } } } as any);
    vi.mocked(api.submitWork).mockResolvedValue({
      data: { data: { user_id: 'user-1', confirmed_summary: 'Draft summary.', confirmed_at: '2026-08-12T11:00:00Z' } },
    } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('Did stuff'));
    fireEvent.click(screen.getByText('Get AI Summary'));
    await screen.findByDisplayValue('Draft summary.');

    fireEvent.click(screen.getByText("Submit Today's Work"));

    await waitFor(() => expect(api.submitWork).toHaveBeenCalledWith('team-a', 'Draft summary.', 'Draft summary.'));
    expect(await screen.findByText("Today's work submitted")).toBeInTheDocument();
    expect(screen.getByText('Draft summary.')).toBeInTheDocument();
    // No extra re-fetch of submissions after a successful submit -- the
    // response itself is used directly (one call from the initial team
    // selection, none afterward).
    expect(api.getTeamWorkSubmissions).toHaveBeenCalledTimes(1);
  });

  it('clears one team\'s state and loads the other team\'s state when the selected team changes', async () => {
    vi.mocked(api.getTeamWorkSubmissions).mockImplementation((teamId: string) =>
      Promise.resolve({
        data: {
          data: teamId === 'team-a' ? [{ user_id: 'user-1', confirmed_summary: 'Team A summary', confirmed_at: '2026-08-12T09:00:00Z' }] : [],
        },
      }) as any
    );
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => expect(screen.getByText('Team A summary')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-b' } });
    await waitFor(() => expect(screen.queryByText('Team A summary')).not.toBeInTheDocument());
    expect(screen.getByText('No entries yet today for this team.')).toBeInTheDocument();
  });

  it('resyncs to the submitted state on a genuine 409 conflict rather than showing a dead-end error', async () => {
    vi.mocked(api.getTodaysWorkEntries).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.createWorkEntry).mockRejectedValue({ response: { status: 409, data: { error: 'Already submitted' } } });
    vi.mocked(api.getTeamWorkSubmissions)
      .mockResolvedValueOnce({ data: { data: [] } } as any)
      .mockResolvedValueOnce({
        data: { data: [{ user_id: 'user-1', confirmed_summary: 'Submitted from another tab.', confirmed_at: '2026-08-12T12:00:00Z' }] },
      } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('No entries yet today for this team.'));

    fireEvent.change(screen.getByPlaceholderText('What did you work on?'), { target: { value: 'Racing entry' } });
    fireEvent.click(screen.getByText('Add Entry'));

    await waitFor(() => expect(screen.getByText("Today's work submitted")).toBeInTheDocument());
    expect(screen.getByText('Submitted from another tab.')).toBeInTheDocument();
    expect(api.getTeamWorkSubmissions).toHaveBeenCalledTimes(2);
  });

  it('surfaces a non-409 API error without crashing the page', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(api.createWorkEntry).mockRejectedValue({ response: { status: 400, data: { error: 'Entry text is required' } } });
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('No entries yet today for this team.'));

    fireEvent.change(screen.getByPlaceholderText('What did you work on?'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Add Entry'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Entry text is required'));
    expect(screen.getByText('No entries yet today for this team.')).toBeInTheDocument();
    alertSpy.mockRestore();
  });

  it('a 403 from the backend (e.g. a viewer-role caller) surfaces as a normal API error, not a frontend bypass', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(api.createWorkEntry).mockRejectedValue({ response: { status: 403, data: { error: 'Insufficient permissions' } } });
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('No entries yet today for this team.'));

    fireEvent.change(screen.getByPlaceholderText('What did you work on?'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Add Entry'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Insufficient permissions'));
    alertSpy.mockRestore();
  });

  it('does not touch the existing personal Daily Logs flow', async () => {
    vi.mocked(api.getMyLogs).mockResolvedValue({ data: { data: [{ log_id: 'l1', entry_text: 'Personal log', log_date: new Date().toISOString(), created_at: new Date().toISOString(), word_count: 2 }] } } as any);
    renderPulse();

    await waitFor(() => expect(api.getMyLogs).toHaveBeenCalledWith(30));
    expect(screen.getByText('Add New Log')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/What are you working on\?/)).toBeInTheDocument();
  });
});

describe('Pulse — Personal Daily Work History (Milestone 53)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyLogs).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getLogSuggestions).mockResolvedValue({ data: { data: null } } as any);
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    vi.mocked(api.getTeamWorkSubmissions).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getTodaysWorkEntries).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getWorkHistory).mockResolvedValue({ data: { data: [] } } as any);
  });

  it('history is collapsed by default and makes no history call before a team is selected', async () => {
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));

    expect(screen.queryByText('View past submissions')).not.toBeInTheDocument();
    expect(api.getWorkHistory).not.toHaveBeenCalled();
  });

  it('does not fetch history merely by selecting a team -- only when explicitly opened', async () => {
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });

    await waitFor(() => expect(screen.getByText('View past submissions')).toBeInTheDocument());
    expect(api.getWorkHistory).not.toHaveBeenCalled();
  });

  it('opening history triggers the API call and shows the empty state when there is none', async () => {
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('View past submissions'));

    fireEvent.click(screen.getByText('View past submissions'));

    await waitFor(() => expect(api.getWorkHistory).toHaveBeenCalledWith('team-a', 30));
    expect(await screen.findByText('No past submissions yet for this team.')).toBeInTheDocument();
  });

  it('renders multiple historical records with correctly displayed dates', async () => {
    vi.mocked(api.getWorkHistory).mockResolvedValue({
      data: {
        data: [
          { work_date: '2026-08-10', confirmed_summary: 'Newest work.', confirmed_at: '2026-08-10T18:00:00Z' },
          { work_date: '2026-08-01', confirmed_summary: 'Older work.', confirmed_at: '2026-08-01T18:00:00Z' },
        ],
      },
    } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('View past submissions'));
    fireEvent.click(screen.getByText('View past submissions'));

    expect(await screen.findByText('Newest work.')).toBeInTheDocument();
    expect(screen.getByText('Older work.')).toBeInTheDocument();
    expect(screen.getByText('Aug 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('Aug 1, 2026')).toBeInTheDocument();
  });

  it('resets/collapses history when switching to a different team -- no cross-team leakage', async () => {
    vi.mocked(api.getWorkHistory).mockImplementation((teamId: string) =>
      Promise.resolve({
        data: { data: teamId === 'team-a' ? [{ work_date: '2026-08-01', confirmed_summary: "Team A's history.", confirmed_at: '2026-08-01T18:00:00Z' }] : [] },
      }) as any
    );
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('View past submissions'));
    fireEvent.click(screen.getByText('View past submissions'));
    await screen.findByText("Team A's history.");

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-b' } });

    await waitFor(() => expect(screen.queryByText("Team A's history.")).not.toBeInTheDocument());
    expect(screen.queryByText('No past submissions yet for this team.')).not.toBeInTheDocument();
    expect(screen.getByText('View past submissions')).toBeInTheDocument();
  });

  it('surfaces a history API error without crashing the page', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(api.getWorkHistory).mockRejectedValue({ response: { data: { error: 'Failed to load history' } } });
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('View past submissions'));

    fireEvent.click(screen.getByText('View past submissions'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to load history'));
    alertSpy.mockRestore();
  });

  it("does not disturb M52's today flow (add entry / summarize / submit still work with history present)", async () => {
    vi.mocked(api.createWorkEntry).mockResolvedValue({ data: { data: { entry_id: 'e1', entry_text: 'Fixed the bug' } } } as any);
    renderPulse();
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-a' } });
    await waitFor(() => screen.getByText('No entries yet today for this team.'));

    fireEvent.click(screen.getByText('View past submissions'));
    await screen.findByText('No past submissions yet for this team.');

    fireEvent.change(screen.getByPlaceholderText('What did you work on?'), { target: { value: 'Fixed the bug' } });
    fireEvent.click(screen.getByText('Add Entry'));

    await waitFor(() => expect(api.createWorkEntry).toHaveBeenCalledWith('team-a', 'Fixed the bug'));
    expect(await screen.findByText('Fixed the bug')).toBeInTheDocument();
  });

  it('does not touch the existing personal Daily Logs flow', async () => {
    renderPulse();
    await waitFor(() => expect(api.getMyLogs).toHaveBeenCalledWith(30));
    expect(screen.getByText('Add New Log')).toBeInTheDocument();
  });
});
