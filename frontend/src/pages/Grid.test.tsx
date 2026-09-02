import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Grid from './Grid';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Cross-section audit: Grid.tsx had no test coverage at all. Mocks the two
// external dependencies (useAuth, services/api), same pattern
// Teams.test.tsx/Pulse.test.tsx already established.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { user_id: 'user-1', full_name: 'Ada Lovelace' };

const PLAYER_1 = { user_id: 'user-2', full_name: 'Top Player', username: 'topplayer', impact_score: 90, streak_count: 5, recent_activity: 10 };
const PLAYER_2 = { user_id: 'user-1', full_name: 'Ada Lovelace', username: 'ada', impact_score: 80, streak_count: 3, recent_activity: 7 };
const PLAYER_3 = { user_id: 'user-3', full_name: 'Third Place', username: 'third', impact_score: 70, streak_count: 1, recent_activity: 2 };

const renderGrid = () => {
  mockUseAuth.mockReturnValue({ user: FAKE_USER, isAuthenticated: true, token: 'fake-token', login: vi.fn(), register: vi.fn(), logout: vi.fn() });
  return render(<Grid />);
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Hidden-tab polling pause tests need to control document.hidden/
// visibilityState -- jsdom doesn't implement real tab visibility, so
// these are simulated the same way any real browser change would be
// observed: redefine the properties, then dispatch the event Grid.tsx
// actually listens for.
const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setDocumentHidden(false);
});

describe('Grid — loading/empty/error/loaded states', () => {
  it('shows a loading state before the leaderboard resolves, never an empty message', async () => {
    const request = deferred<any>();
    vi.mocked(api.getLeaderboard).mockReturnValue(request.promise as any);
    renderGrid();

    expect(screen.getByText('Loading rankings...')).toBeInTheDocument();
    expect(screen.queryByText(/No rankings yet/)).not.toBeInTheDocument();

    request.resolve({ data: { data: [] } });
    await waitFor(() => expect(screen.getByText(/No rankings yet/)).toBeInTheDocument());
  });

  it('shows the empty state once loaded with zero players', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [] } } as any);
    renderGrid();

    expect(await screen.findByText(/No rankings yet/)).toBeInTheDocument();
    expect(screen.queryByText('Loading rankings...')).not.toBeInTheDocument();
  });

  it('renders the loaded leaderboard with rankings and the current user highlighted', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1, PLAYER_2, PLAYER_3] } } as any);
    renderGrid();

    expect((await screen.findAllByText('Top Player')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Your Rank')).toBeInTheDocument();
  });

  it('does not start a second request while the previous 30s poll is still in flight (overlap guard)', async () => {
    const firstRequest = deferred<any>();
    vi.mocked(api.getLeaderboard).mockReturnValueOnce(firstRequest.promise as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();

    // Initial mount call is in flight (not yet resolved).
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    // A 30s poll tick fires while the first request is still pending.
    await vi.advanceTimersByTimeAsync(30000);

    // The old (pre-fix) implementation would start a second request here;
    // the overlap guard must keep it from firing while #1 is unresolved.
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    firstRequest.resolve({ data: { data: [PLAYER_1] } });
    await vi.waitFor(() => expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0));

    // Once the in-flight request resolves, the guard is released and the
    // next poll tick fires normally.
    await vi.advanceTimersByTimeAsync(30000);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('shows a visible error while keeping the last-known rankings on screen (no data wipe)', async () => {
    vi.mocked(api.getLeaderboard)
      .mockResolvedValueOnce({ data: { data: [PLAYER_1, PLAYER_2, PLAYER_3] } } as any)
      .mockRejectedValueOnce(new Error('network error'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();

    await vi.waitFor(() => expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0));

    await vi.advanceTimersByTimeAsync(30000);

    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to refresh rankings'));
    // Stale-data grace: the previously loaded rankings must still be visible.
    expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});

describe('Grid — initial-load error vs. empty-state distinction ([P3])', () => {
  it('shows a clear error (not "No rankings yet") when the initial load fails, and offers Retry', async () => {
    vi.mocked(api.getLeaderboard).mockRejectedValue(new Error('network error'));
    renderGrid();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load leaderboard');
    expect(screen.queryByText(/No rankings yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading rankings...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retrying after an initial failure succeeds and transitions to the loaded leaderboard', async () => {
    vi.mocked(api.getLeaderboard)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ data: { data: [PLAYER_1] } } as any);
    renderGrid();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText('Top Player')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Unable to load leaderboard')).not.toBeInTheDocument();
  });

  it('a failed retry remains a clear error state, never a false "No rankings yet"', async () => {
    vi.mocked(api.getLeaderboard).mockRejectedValue(new Error('still down'));
    renderGrid();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load leaderboard');
    expect(screen.queryByText(/No rankings yet/)).not.toBeInTheDocument();
  });

  it('a refresh failure after a successful EMPTY load shows the non-blocking banner, not the initial-error state', async () => {
    vi.mocked(api.getLeaderboard)
      .mockResolvedValueOnce({ data: { data: [] } } as any)
      .mockRejectedValueOnce(new Error('network error'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(screen.getByText(/No rankings yet/)).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(30000);

    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to refresh rankings'));
    // Still correctly the "loaded, genuinely empty" state, not "never
    // loaded" -- the data WAS successfully fetched once (as an empty
    // array), a later refresh just failed.
    expect(screen.getByText(/No rankings yet/)).toBeInTheDocument();
    expect(screen.queryByText('Unable to load leaderboard')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('a background 30s poll refresh does not replace the leaderboard with the full-page loading spinner (newly-found defect)', async () => {
    const secondRequest = deferred<any>();
    vi.mocked(api.getLeaderboard)
      .mockResolvedValueOnce({ data: { data: [PLAYER_1] } } as any)
      .mockReturnValueOnce(secondRequest.promise as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0));

    await vi.advanceTimersByTimeAsync(30000);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);

    // The background refresh (2nd call) is still in flight -- before this
    // fix, useApiRequest's `loading: true` (set on every execute() call,
    // not just the first) blanked the ENTIRE leaderboard behind a
    // full-page spinner on every single 30s tick, even successful ones.
    expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading rankings...')).not.toBeInTheDocument();

    secondRequest.resolve({ data: { data: [PLAYER_1] } });
    vi.useRealTimers();
  });
});

describe('Grid — leaderboard period filter', () => {
  it('defaults to "All Time" and fetches with the "all" period value', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    renderGrid();

    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledWith('all'));
    const allTimeButton = screen.getByRole('button', { name: 'All Time' });
    expect(allTimeButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders exactly the four supported period options', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    renderGrid();
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    const group = screen.getByRole('group', { name: 'Leaderboard time period' });
    expect(group.querySelectorAll('button').length).toBe(4);
    ['All Time', 'Today', 'This Week', 'This Month'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('clicking a period option calls getLeaderboard with the correct value and updates the selected state', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    renderGrid();
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'This Week' }));

    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledWith('week'));
    expect(screen.getByRole('button', { name: 'This Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All Time' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the already-selected period does not issue a duplicate request', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    renderGrid();
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'All Time' }));

    // Give any accidental async call a chance to fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('a period response that was already in flight when the period changed cannot overwrite the newly-selected period\'s data', async () => {
    const staleAllRequest = deferred<any>();
    const freshWeekRequest = deferred<any>();
    vi.mocked(api.getLeaderboard)
      .mockReturnValueOnce(staleAllRequest.promise as any) // initial mount ('all')
      .mockReturnValueOnce(freshWeekRequest.promise as any); // queued follow-up ('week')
    renderGrid();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    // Switch period WHILE the initial 'all' request is still in flight.
    fireEvent.click(screen.getByRole('button', { name: 'This Week' }));
    // The queued follow-up must not fire yet -- the in-flight request for
    // the old period hasn't settled.
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    // The stale 'all' response resolves first...
    staleAllRequest.resolve({ data: { data: [PLAYER_1] } });
    // ...which must immediately trigger the queued 'week' fetch.
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(2));
    expect(api.getLeaderboard).toHaveBeenLastCalledWith('week');

    // The fresh 'week' response resolves after -- it must be the one shown.
    freshWeekRequest.resolve({ data: { data: [PLAYER_2] } });
    await waitFor(() => expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0));
    expect(screen.queryByText('Top Player')).not.toBeInTheDocument();
  });

  it('polling uses the currently selected period, not the period selected at mount', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'This Month' }));
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(2));
    expect(api.getLeaderboard).toHaveBeenLastCalledWith('month');

    await vi.advanceTimersByTimeAsync(30000);

    expect(api.getLeaderboard).toHaveBeenCalledTimes(3);
    expect(api.getLeaderboard).toHaveBeenLastCalledWith('month');
    vi.useRealTimers();
  });

  it('a period change does not create a second polling interval (30s cadence stays exactly once per tick)', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(30000);
    // Exactly one more call from the single 30s interval -- not two (which
    // would indicate a duplicate interval was created).
    expect(api.getLeaderboard).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('changing period while idle (no request in flight) shows loading feedback without blanking the previously loaded leaderboard', async () => {
    const weekRequest = deferred<any>();
    vi.mocked(api.getLeaderboard)
      .mockResolvedValueOnce({ data: { data: [PLAYER_1] } } as any)
      .mockReturnValueOnce(weekRequest.promise as any);
    renderGrid();
    await waitFor(() => expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'This Week' }));

    await waitFor(() => expect(screen.getByText('Updating…')).toBeInTheDocument());
    // Previously-loaded results remain visible during the background fetch.
    expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading rankings...')).not.toBeInTheDocument();

    weekRequest.resolve({ data: { data: [PLAYER_2] } });
    await waitFor(() => expect(screen.queryByText('Updating…')).not.toBeInTheDocument());
  });

  it('the period selector remains visible and interactive during the initial-load error state', async () => {
    vi.mocked(api.getLeaderboard).mockRejectedValue(new Error('network error'));
    renderGrid();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load leaderboard');
    expect(screen.getByRole('button', { name: 'This Week' })).toBeInTheDocument();
  });

  it('changing period during the loaded-empty state fetches the newly selected period correctly', async () => {
    vi.mocked(api.getLeaderboard)
      .mockResolvedValueOnce({ data: { data: [] } } as any)
      .mockResolvedValueOnce({ data: { data: [PLAYER_1] } } as any);
    renderGrid();
    await screen.findByText(/No rankings yet/);

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledWith('today'));
    expect((await screen.findAllByText('Top Player')).length).toBeGreaterThan(0);
  });
});

describe('Grid — hidden-tab polling pause', () => {
  it('does not start new polling requests while the tab is hidden', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    setDocumentHidden(true);
    // Two poll ticks' worth of time passes while hidden.
    await vi.advanceTimersByTimeAsync(60000);

    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('continues polling every 30s while the tab stays visible (regression)', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30000);

    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('performs exactly one fresh fetch when the tab becomes visible again after being hidden', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderGrid();
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    setDocumentHidden(true);
    await vi.advanceTimersByTimeAsync(45000);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    setDocumentHidden(false);
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(2));

    // Normal 30s cadence resumes from here, it isn't reset to a new interval.
    await vi.advanceTimersByTimeAsync(30000);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not start a second request if one is already in flight when the tab becomes visible', async () => {
    const request = deferred<any>();
    vi.mocked(api.getLeaderboard).mockReturnValueOnce(request.promise as any);
    renderGrid();

    // Initial mount request is in flight (not yet resolved).
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    setDocumentHidden(true);
    setDocumentHidden(false);

    // The existing in-flight request remains authoritative -- no second
    // request is started just because visibility changed.
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    request.resolve({ data: { data: [PLAYER_1] } });
    await waitFor(() => expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0));
  });

  it('removes the visibilitychange listener and stops polling on unmount', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderGrid();
    await vi.waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(1));

    unmount();

    await vi.advanceTimersByTimeAsync(60000);
    setDocumentHidden(true);
    setDocumentHidden(false);

    // Neither the (cleared) interval nor a visibilitychange event on an
    // unmounted component should trigger another request.
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
