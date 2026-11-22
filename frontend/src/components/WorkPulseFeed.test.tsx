import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkPulseFeed from './WorkPulseFeed';
import { pulseService, PulseItem } from '../services/pulseService';

vi.mock('../services/pulseService', () => ({
  pulseService: {
    getIndividualPulse: vi.fn(),
    getTeamPulse: vi.fn(),
    getClassroomPulse: vi.fn(),
  },
}));

const mockPulseItems: PulseItem[] = [
  {
    history_id: 'hist-1',
    team_id: 'team-1',
    team_name: 'Alpha Team',
    artifact_type: 'task',
    artifact_id: 'task-1',
    event_type: 'completed',
    actor_id: 'user-1',
    actor_name: 'Alice Leader',
    actor_avatar: null,
    previous_state: { status: 'in_progress' },
    new_state: { status: 'done' },
    created_at: new Date().toISOString(),
    artifact_title: 'Implement Auth Endpoint',
    project_name: 'Core Security',
    context_status: 'active',
  },
  {
    history_id: 'hist-2',
    team_id: 'team-1',
    team_name: 'Alpha Team',
    artifact_type: 'blocker',
    artifact_id: 'blocker-1',
    event_type: 'resolved',
    actor_id: 'user-2',
    actor_name: 'Bob Member',
    actor_avatar: null,
    previous_state: { status: 'open' },
    new_state: { status: 'resolved' },
    created_at: new Date(Date.now() - 3600000).toISOString(),
    artifact_title: 'API Rate Limiter Spike',
    project_name: null,
    context_status: 'active',
  },
  {
    history_id: 'hist-3',
    team_id: 'team-1',
    team_name: 'Alpha Team',
    artifact_type: 'task',
    artifact_id: 'task-deleted',
    event_type: 'completed',
    actor_id: 'user-1',
    actor_name: 'Alice Leader',
    actor_avatar: null,
    previous_state: null,
    new_state: null,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    artifact_title: null,
    project_name: null,
    context_status: 'deleted',
  },
];

describe('WorkPulseFeed Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders pulse feed items with correct badges and titles', async () => {
    vi.mocked(pulseService.getIndividualPulse).mockResolvedValueOnce({
      events: mockPulseItems,
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getAllByText('Alice Leader')[0]).toBeInTheDocument();
    });

    expect(screen.getByText('Implement Auth Endpoint')).toBeInTheDocument();
    expect(screen.getAllByText('Completed')[0]).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('2. Filtering by category updates active pill and calls API with category parameter', async () => {
    vi.mocked(pulseService.getIndividualPulse).mockResolvedValue({
      events: [mockPulseItems[0]],
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tasks'));

    await waitFor(() => {
      expect(pulseService.getIndividualPulse).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'task' })
      );
    });
  });

  it('3. Renders empty state when zero events exist', async () => {
    vi.mocked(pulseService.getIndividualPulse).mockResolvedValueOnce({
      events: [],
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getByText('No recent work changes in this context')).toBeInTheDocument();
    });
  });

  it('4. Renders error state on API failure', async () => {
    vi.mocked(pulseService.getIndividualPulse).mockRejectedValueOnce({
      response: { data: { error: 'Network error loading pulse' } },
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getByText('Network error loading pulse')).toBeInTheDocument();
    });
  });

  it('5. Renders non-clickable "Linked work is no longer available" badge for deleted context', async () => {
    vi.mocked(pulseService.getIndividualPulse).mockResolvedValueOnce({
      events: [mockPulseItems[2]],
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getByText('Linked work is no longer available')).toBeInTheDocument();
    });
  });

  it('6. Clicking active event card invokes navigation callback', async () => {
    const handleNav = vi.fn();
    vi.mocked(pulseService.getIndividualPulse).mockResolvedValueOnce({
      events: [mockPulseItems[0]],
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" onNavigateToItem={handleNav} />);

    await waitFor(() => {
      expect(screen.getByText('Open Target →')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Open Target →'));
    expect(handleNav).toHaveBeenCalledWith(mockPulseItems[0]);
  });

  it('7. Renders pagination button when next_cursor is present', async () => {
    vi.mocked(pulseService.getIndividualPulse).mockResolvedValueOnce({
      events: [mockPulseItems[0]],
      next_cursor: 'cursor-123',
    });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getByText('Load More Changes ↓')).toBeInTheDocument();
    });
  });

  it('8. Deduplicates identical history_id events during pagination load', async () => {
    vi.mocked(pulseService.getIndividualPulse)
      .mockResolvedValueOnce({
        events: [mockPulseItems[0]],
        next_cursor: 'cursor-123',
      })
      .mockResolvedValueOnce({
        events: [mockPulseItems[0], mockPulseItems[1]],
        next_cursor: null,
      });

    render(<WorkPulseFeed scope="INDIVIDUAL" />);

    await waitFor(() => {
      expect(screen.getByText('Load More Changes ↓')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Load More Changes ↓'));

    await waitFor(() => {
      const items = screen.getAllByText(/Alpha Team/);
      expect(items.length).toBe(2);
    });
  });

  it('9. Calls getTeamPulse when scope is TEAM', async () => {
    vi.mocked(pulseService.getTeamPulse).mockResolvedValueOnce({
      events: [mockPulseItems[0]],
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="TEAM" teamId="team-123" />);

    await waitFor(() => {
      expect(pulseService.getTeamPulse).toHaveBeenCalledWith('team-123', expect.anything());
    });
  });

  it('10. Calls getClassroomPulse when scope is CLASSROOM', async () => {
    vi.mocked(pulseService.getClassroomPulse).mockResolvedValueOnce({
      events: [mockPulseItems[0]],
      next_cursor: null,
    });

    render(<WorkPulseFeed scope="CLASSROOM" teamId="parent-team-123" />);

    await waitFor(() => {
      expect(pulseService.getClassroomPulse).toHaveBeenCalledWith('parent-team-123', expect.anything());
    });
  });
});
