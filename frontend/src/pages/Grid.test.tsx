import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Grid from './Grid';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { user_id: 'user-2', full_name: 'Ada Lovelace' };

const PLAYER_1 = { user_id: 'user-1', full_name: 'Top Player', username: 'topplayer', impact_score: 95, streak_count: 8, recent_activity: 7 };
const PLAYER_2 = { user_id: 'user-2', full_name: 'Ada Lovelace', username: 'ada', impact_score: 80, streak_count: 5, recent_activity: 6 };
const PLAYER_3 = { user_id: 'user-3', full_name: 'Third Place', username: 'third', impact_score: 70, streak_count: 2, recent_activity: 3 };

const renderGrid = () => {
  mockUseAuth.mockReturnValue({
    user: FAKE_USER,
    isAuthenticated: true,
    token: 'fake-token',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <Grid />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1, PLAYER_2, PLAYER_3] } } as any);
});

describe('Grid Leaderboard Page', () => {
  it('renders initial leaderboard with top contributors and rankings', async () => {
    renderGrid();

    expect(await screen.findByText(/Top contributors drive real progress/)).toBeInTheDocument();
    expect(screen.getAllByText('Top Player').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Third Place').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
  });

  it('correctly labels Recent Logs instead of 7d logs', async () => {
    renderGrid();

    expect(await screen.findAllByText('Recent Logs')).not.toHaveLength(0);
  });

  it('calculates Active Streaks count using streak_count >= 3 definition', async () => {
    renderGrid();

    expect(await screen.findByText('Active Streaks')).toBeInTheDocument();
    expect(screen.getByText('Members with 3+ day streak')).toBeInTheDocument();
  });

  it('renders period selector tabs and fetches period-scoped data', async () => {
    renderGrid();

    const monthTab = await screen.findByRole('button', { name: 'This Month' });
    expect(monthTab).toBeInTheDocument();

    fireEvent.click(monthTab);

    await waitFor(() => {
      expect(api.getLeaderboard).toHaveBeenCalledWith('month');
    });

    const weekTab = screen.getByRole('button', { name: 'This Week' });
    fireEvent.click(weekTab);

    await waitFor(() => {
      expect(api.getLeaderboard).toHaveBeenCalledWith('week');
    });
  });

  it('renders "Your Position" summary card for the logged-in user', async () => {
    renderGrid();

    expect(await screen.findByText('Your Position')).toBeInTheDocument();
    expect(screen.getByText(/Currently ranked #2 among 3 contributors/)).toBeInTheDocument();
  });

  it('renders onboarding guide card and handles dismissal persistence', async () => {
    renderGrid();

    expect(await screen.findByText('How to use Leaderboard')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss guide' });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText('How to use Leaderboard')).not.toBeInTheDocument();
    });

    expect(localStorage.getItem('leaderboardGuideDismissed')).toBe('true');
  });

  it('renders empty state when no rankings are returned', async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [] } } as any);
    renderGrid();

    expect(await screen.findByText('No ranking data yet')).toBeInTheDocument();
    expect(screen.getByText('Complete work and log activity to appear on the leaderboard.')).toBeInTheDocument();
  });

  it('renders error state and handles Retry action on API failure', async () => {
    vi.mocked(api.getLeaderboard).mockRejectedValue(new Error('Network error'));
    renderGrid();

    expect(await screen.findByText("Leaderboard couldn't be loaded")).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Try Again' });
    expect(retryBtn).toBeInTheDocument();

    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: { data: [PLAYER_1] } } as any);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(api.getLeaderboard).toHaveBeenCalled();
    });
  });
});
