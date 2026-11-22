import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import WorkActivityTimeline from './WorkActivityTimeline';
import * as timelineService from '../services/timelineService';

vi.mock('../services/timelineService');

describe('WorkActivityTimeline Component', () => {
  const mockGetTimeline = vi.spyOn(timelineService, 'getWorkActivityTimeline');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders loading state initially', async () => {
    mockGetTimeline.mockReturnValue(new Promise(() => {})); // pending promise

    render(<WorkActivityTimeline artifactType="task" artifactId="12345678-1234-1234-1234-123456789012" />);

    expect(screen.getByTestId('timeline-loading')).toBeDefined();
    expect(screen.getByText(/Loading work activity story.../i)).toBeDefined();
  });

  it('2. Renders events with actor, description, state diffs, and timestamp', async () => {
    mockGetTimeline.mockResolvedValue({
      artifact: {
        artifact_id: '12345678-1234-1234-1234-123456789012',
        artifact_type: 'task',
        title: 'Refactor Auth Pipeline',
        current_status: 'active',
        context_status: 'active',
      },
      events: [
        {
          history_id: 'hist-1',
          team_id: 'team-1',
          artifact_type: 'task',
          artifact_id: '12345678-1234-1234-1234-123456789012',
          event_type: 'status_changed',
          created_at: new Date().toISOString(),
          actor: {
            user_id: 'u-1',
            full_name: 'Jane Developer',
            username: 'janedev',
          },
          description: 'Status changed from In Progress to Done',
          change_summary: {
            status: { from: 'in_progress', to: 'done' },
          },
        },
      ],
      next_cursor: null,
    });

    render(<WorkActivityTimeline artifactType="task" artifactId="12345678-1234-1234-1234-123456789012" />);

    await waitFor(() => {
      expect(screen.getByText('Refactor Auth Pipeline')).toBeDefined();
    });

    expect(screen.getByText('Jane Developer')).toBeDefined();
    expect(screen.getByText('Status changed from In Progress to Done')).toBeDefined();
    expect(screen.getByText(/Status: in_progress → done/i)).toBeDefined();
  });

  it('3. Renders empty state when no events exist', async () => {
    mockGetTimeline.mockResolvedValue({
      artifact: {
        artifact_id: '12345678-1234-1234-1234-123456789012',
        artifact_type: 'goal',
        title: 'New Goal',
        current_status: 'active',
        context_status: 'active',
      },
      events: [],
      next_cursor: null,
    });

    render(<WorkActivityTimeline artifactType="goal" artifactId="12345678-1234-1234-1234-123456789012" />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-empty')).toBeDefined();
    });

    expect(screen.getByText(/No recorded activity for this work item yet./i)).toBeDefined();
  });

  it('4. Renders error state with retry button', async () => {
    mockGetTimeline.mockRejectedValue(new Error('Network error loading timeline'));

    render(<WorkActivityTimeline artifactType="blocker" artifactId="12345678-1234-1234-1234-123456789012" />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-error')).toBeDefined();
    });

    expect(screen.getByText(/Network error loading timeline/i)).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('5. Renders deleted context warning banner', async () => {
    mockGetTimeline.mockResolvedValue({
      artifact: {
        artifact_id: '12345678-1234-1234-1234-123456789012',
        artifact_type: 'blocker',
        title: 'Linked work is no longer available',
        current_status: 'deleted',
        context_status: 'deleted',
      },
      events: [
        {
          history_id: 'hist-del',
          team_id: 'team-1',
          artifact_type: 'blocker',
          artifact_id: '12345678-1234-1234-1234-123456789012',
          event_type: 'resolved',
          created_at: new Date().toISOString(),
          actor: { user_id: 'u-1', full_name: 'Bob Admin', username: 'bob' },
          description: 'Blocker resolved',
          change_summary: null,
        },
      ],
      next_cursor: null,
    });

    render(<WorkActivityTimeline artifactType="blocker" artifactId="12345678-1234-1234-1234-123456789012" />);

    await waitFor(() => {
      expect(screen.getByTestId('deleted-context-warning')).toBeDefined();
    });

    expect(screen.getAllByText('Linked work is no longer available').length).toBeGreaterThan(0);
  });

  it('6. Handles load-more pagination button click', async () => {
    mockGetTimeline
      .mockResolvedValueOnce({
        artifact: {
          artifact_id: '12345678-1234-1234-1234-123456789012',
          artifact_type: 'task',
          title: 'Pagination Task',
          current_status: 'active',
          context_status: 'active',
        },
        events: [
          {
            history_id: 'hist-1',
            team_id: 'team-1',
            artifact_type: 'task',
            artifact_id: '12345678-1234-1234-1234-123456789012',
            event_type: 'created',
            created_at: '2026-09-16T10:00:00.000Z',
            actor: { user_id: 'u-1', full_name: 'Alice', username: 'alice' },
            description: 'Task created',
            change_summary: null,
          },
        ],
        next_cursor: {
          beforeTimestamp: '2026-09-16T10:00:00.000Z',
          beforeHistoryId: 'hist-1',
        },
      })
      .mockResolvedValueOnce({
        artifact: {
          artifact_id: '12345678-1234-1234-1234-123456789012',
          artifact_type: 'task',
          title: 'Pagination Task',
          current_status: 'active',
          context_status: 'active',
        },
        events: [
          {
            history_id: 'hist-0',
            team_id: 'team-1',
            artifact_type: 'task',
            artifact_id: '12345678-1234-1234-1234-123456789012',
            event_type: 'created',
            created_at: '2026-09-16T09:00:00.000Z',
            actor: { user_id: 'u-1', full_name: 'Alice', username: 'alice' },
            description: 'Initial draft saved',
            change_summary: null,
          },
        ],
        next_cursor: null,
      });

    render(<WorkActivityTimeline artifactType="task" artifactId="12345678-1234-1234-1234-123456789012" />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-load-more')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('timeline-load-more'));

    await waitFor(() => {
      expect(screen.getByText('Initial draft saved')).toBeDefined();
    });

    expect(mockGetTimeline).toHaveBeenCalledTimes(2);
  });
});
