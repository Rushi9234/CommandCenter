import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import GoalDetailView from './GoalDetailView';
import * as api from '../services/api';

vi.mock('../services/api');

describe('GoalDetailView Component', () => {
  const mockGetGoalEvidence = vi.spyOn(api, 'getGoalEvidence');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders goal title, hybrid progress, linked tasks, and evidence feed', async () => {
    mockGetGoalEvidence.mockResolvedValue({
      data: {
        data: {
          goal: {
            goal_id: 'goal-123',
            title: 'Launch Enterprise Support AI',
            description: 'Customer success automation milestone',
            status: 'active',
            progress: 50,
          },
          linked_tasks: [
            {
              task_id: 'task-1',
              title: 'Build Chatbot Interface',
              status: 'done',
              owner_name: 'Alice Dev',
              reviewer_name: 'Bob Lead',
            },
            {
              task_id: 'task-2',
              title: 'Backend Database Integration',
              status: 'review',
              owner_name: 'Alice Dev',
              reviewer_name: 'Bob Lead',
            },
          ],
          evidence: [
            {
              history_id: 'ev-1',
              artifact_type: 'task',
              artifact_id: 'task-1',
              event_type: 'approved',
              category: 'VERIFIED',
              created_at: new Date().toISOString(),
              new_state: { title: 'Build Chatbot Interface', status: 'done' },
            },
            {
              history_id: 'ev-2',
              artifact_type: 'task',
              artifact_id: 'task-2',
              event_type: 'submitted_for_review',
              category: 'IN_FLIGHT',
              created_at: new Date().toISOString(),
              new_state: { title: 'Backend Database Integration', status: 'review' },
            },
          ],
          progress_summary: {
            progress: 50,
            completed: 1,
            total: 2,
            pending_review: 1,
            mode: 'tasks',
          },
        },
      },
    } as any);

    render(<GoalDetailView goalId="goal-123" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Launch Enterprise Support AI')).toBeDefined();
    });

    expect(screen.getByText('Customer success automation milestone')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getAllByText('Build Chatbot Interface').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Backend Database Integration').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VERIFIED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IN_FLIGHT').length).toBeGreaterThan(0);
  });

  it('2. Renders error message if evidence fetch fails', async () => {
    mockGetGoalEvidence.mockRejectedValue({
      response: { data: { error: 'Access denied to this goal' } },
    });

    render(<GoalDetailView goalId="goal-unauthorized" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Goal')).toBeDefined();
    });

    expect(screen.getByText('Access denied to this goal')).toBeDefined();
  });
});
