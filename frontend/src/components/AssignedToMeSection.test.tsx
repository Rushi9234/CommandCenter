import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssignedToMeSection from './AssignedToMeSection';
import * as api from '../services/api';

vi.mock('../services/api');

const MOCK_TASKS = [
  {
    task_id: 't-me-1',
    project_id: 'p1',
    title: 'Implement Dark Mode CSS Variables',
    description: 'Add Tailwind/CSS token support for high-contrast dark mode',
    status: 'in_progress',
    priority: 'high',
    reviewer_user: { full_name: 'Jayesh Patel', username: 'jayesh' },
    created_at: '2026-09-16T10:00:00Z',
  },
  {
    task_id: 't-me-2',
    project_id: 'p1',
    title: 'Refactor Auth Middleware',
    description: 'Enforce RBAC role assertion on project endpoints',
    status: 'submitted_for_review',
    priority: 'medium',
    reviewer_user: { full_name: 'Jayesh Patel', username: 'jayesh' },
    created_at: '2026-09-15T10:00:00Z',
  },
];

describe('AssignedToMeSection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no tasks are assigned', () => {
    render(<AssignedToMeSection tasks={[]} />);
    expect(screen.getByTestId('assigned-to-me-empty')).toBeDefined();
    expect(screen.getByText('No Work Assigned to You')).toBeDefined();
  });

  it('renders assigned task list with details and status badges', () => {
    render(<AssignedToMeSection tasks={MOCK_TASKS} />);
    expect(screen.getByTestId('assigned-to-me-section')).toBeDefined();
    expect(screen.getByText('Implement Dark Mode CSS Variables')).toBeDefined();
    expect(screen.getByText('Refactor Auth Middleware')).toBeDefined();
    expect(screen.getByText('Awaiting Reviewer Sign-Off ⏳')).toBeDefined();
  });

  it('submits task for review on button click with window.confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.submitTaskForReview).mockResolvedValue({ data: { success: true } } as any);
    const onRefresh = vi.fn();

    render(<AssignedToMeSection tasks={MOCK_TASKS} onRefresh={onRefresh} />);

    const submitBtn = screen.getByText('Submit for Review 📤');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.submitTaskForReview).toHaveBeenCalledWith('t-me-1');
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
