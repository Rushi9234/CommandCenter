import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SOSHub from './SOSHub';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha' };
const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta' };
const BLOCKER_A = {
  blocker_id: 'blocker-a',
  title: 'Team A blocker',
  description: 'A blocker',
  blocker_type: 'technical',
  severity: 'high',
  status: 'open',
  message_count: 0,
};
const BLOCKER_B = {
  blocker_id: 'blocker-b',
  title: 'Team B blocker',
  description: 'B blocker',
  blocker_type: 'technical',
  severity: 'medium',
  status: 'open',
  message_count: 0,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const renderHub = () => {
  mockUseAuth.mockReturnValue({ user: { user_id: 'user-1' } });
  return render(<SOSHub />);
};

const setVisibility = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' });
};

beforeEach(() => {
  vi.clearAllMocks();
  setVisibility(false);
  vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
  vi.mocked(api.getTeamBlockers).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getMessages).mockResolvedValue({ data: { data: [] } } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setVisibility(false);
});

describe('SOS Hub synchronization', () => {
  it('does not let a stale team response overwrite the selected team', async () => {
    const teamABlockers = deferred<any>();
    vi.mocked(api.getTeamBlockers).mockImplementation((teamId: string) => {
      if (teamId === 'team-a') return teamABlockers.promise;
      return Promise.resolve({ data: { data: [BLOCKER_B] } }) as any;
    });
    renderHub();

    await waitFor(() => expect(api.getTeamBlockers).toHaveBeenCalledWith('team-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Team Beta' }));

    teamABlockers.resolve({ data: { data: [BLOCKER_A] } });

    await waitFor(() => expect(api.getTeamBlockers).toHaveBeenCalledWith('team-b'));
    expect(await screen.findByText('Team B blocker')).toBeInTheDocument();
    expect(screen.queryByText('Team A blocker')).not.toBeInTheDocument();
  });

  it('does not let a stale blocker response overwrite the selected blocker', async () => {
    vi.mocked(api.getTeamBlockers).mockResolvedValue({ data: { data: [BLOCKER_A, BLOCKER_B] } } as any);
    const blockerAMessages = deferred<any>();
    vi.mocked(api.getMessages).mockImplementation((blockerId: string) => {
      if (blockerId === 'blocker-a') return blockerAMessages.promise;
      return Promise.resolve({ data: { data: [] } }) as any;
    });
    renderHub();

    await screen.findByText('Team A blocker');
    fireEvent.click(screen.getByRole('button', { name: /Team A blocker/ }));
    await waitFor(() => expect(api.getMessages).toHaveBeenCalledWith('blocker-a'));
    fireEvent.click(screen.getByRole('button', { name: /Team B blocker/ }));

    blockerAMessages.resolve({ data: { data: [{ message_id: 'message-a', message_text: 'Stale A message', user_id: 'user-2', user: { full_name: 'User A' } }] } });

    await waitFor(() => expect(api.getMessages).toHaveBeenCalledWith('blocker-b'));
    expect(screen.queryByText('Stale A message')).not.toBeInTheDocument();
  });

  it('prevents overlapping blocker polls while a previous request is in flight', async () => {
    const blockersRequest = deferred<any>();
    vi.mocked(api.getTeamBlockers).mockReturnValue(blockersRequest.promise);
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    renderHub();

    await waitFor(() => expect(api.getTeamBlockers).toHaveBeenCalledTimes(1));
    const poll = intervalSpy.mock.calls[0][0] as () => void;
    poll();
    poll();
    expect(api.getTeamBlockers).toHaveBeenCalledTimes(1);

    blockersRequest.resolve({ data: { data: [] } });
    intervalSpy.mockRestore();
  });

  it('skips hidden-tab polling and synchronizes when the document becomes visible', async () => {
    setVisibility(true);
    renderHub();

    await waitFor(() => expect(api.getMyTeams).toHaveBeenCalledTimes(1));
    expect(api.getTeamBlockers).not.toHaveBeenCalled();

    setVisibility(false);
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => expect(api.getTeamBlockers).toHaveBeenCalledWith('team-a'));
  });
});

// ---------------------------------------------------------------------------
// Cross-section audit fix: none of these loading/error states existed
// before -- a fetch in flight was visually indistinguishable from "nothing
// here," and a failed load was silently swallowed with no feedback.
// ---------------------------------------------------------------------------

describe('SOS Hub — loading/empty/error states', () => {
  it('shows a loading state for blockers while the team switch is in flight, never an empty list', async () => {
    const request = deferred<any>();
    vi.mocked(api.getTeamBlockers).mockReturnValue(request.promise as any);
    renderHub();

    expect(await screen.findByText('Loading blockers...')).toBeInTheDocument();

    request.resolve({ data: { data: [BLOCKER_A] } });
    await waitFor(() => expect(screen.getByText('Team A blocker')).toBeInTheDocument());
    expect(screen.queryByText('Loading blockers...')).not.toBeInTheDocument();
  });

  it('shows the empty state once loaded with zero active blockers', async () => {
    renderHub();

    expect(await screen.findByText('No active blockers.')).toBeInTheDocument();
  });

  it('shows a visible error with Retry when loading blockers fails, and Retry re-fetches', async () => {
    vi.mocked(api.getTeamBlockers).mockRejectedValueOnce({ response: { data: {} } });
    renderHub();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load blockers');

    vi.mocked(api.getTeamBlockers).mockResolvedValueOnce({ data: { data: [BLOCKER_A] } } as any);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Team A blocker')).toBeInTheDocument());
  });

  it('shows a loading state for messages while a blocker is selected, then the empty state once loaded', async () => {
    vi.mocked(api.getTeamBlockers).mockResolvedValue({ data: { data: [BLOCKER_A] } } as any);
    const request = deferred<any>();
    renderHub();
    await screen.findByText('Team A blocker');

    vi.mocked(api.getMessages).mockReturnValue(request.promise as any);
    fireEvent.click(screen.getByText('Team A blocker'));

    expect(await screen.findByText('Loading messages...')).toBeInTheDocument();

    request.resolve({ data: { data: [] } });
    await waitFor(() => expect(screen.getByText(/No messages yet/)).toBeInTheDocument());
  });

  it('shows a visible error with Retry when loading messages fails', async () => {
    vi.mocked(api.getTeamBlockers).mockResolvedValue({ data: { data: [BLOCKER_A] } } as any);
    renderHub();
    await screen.findByText('Team A blocker');

    vi.mocked(api.getMessages).mockRejectedValueOnce({ response: { data: {} } });
    fireEvent.click(screen.getByText('Team A blocker'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load messages');
  });

  it('shows a visible error with Retry when loading teams fails', async () => {
    vi.mocked(api.getMyTeams).mockRejectedValueOnce({ response: { data: {} } });
    renderHub();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load your teams');
  });
});
