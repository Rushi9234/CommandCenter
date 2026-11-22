import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReviewWorkModal from './ReviewWorkModal';
import * as api from '../services/api';

vi.mock('../services/api');

const MOCK_TASK = {
  task_id: 't-review-1',
  title: 'Compiler AST Parser',
  description: 'Implemented recursive descent parser for expression ASTs',
  status: 'submitted_for_review',
  priority: 'high',
  owner_name: 'Raju Sharma',
  team_name: 'Alpha Squad',
  created_at: '2026-09-15T10:00:00Z',
};

describe('ReviewWorkModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders task details correctly when open', () => {
    render(
      <ReviewWorkModal
        isOpen={true}
        onClose={vi.fn()}
        task={MOCK_TASK}
      />
    );

    expect(screen.getByTestId('review-work-modal')).toBeDefined();
    expect(screen.getByText('Compiler AST Parser')).toBeDefined();
    expect(screen.getByText(/Implemented recursive descent parser/)).toBeDefined();
    expect(screen.getByText(/Approve Work/)).toBeDefined();
    expect(screen.getByText(/Request Changes/)).toBeDefined();
  });

  it('calls approveTask on clicking Approve Work button', async () => {
    vi.mocked(api.approveTask).mockResolvedValue({ data: { success: true } } as any);
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ReviewWorkModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        task={MOCK_TASK}
      />
    );

    fireEvent.click(screen.getByText(/Approve Work/));

    await waitFor(() => {
      expect(api.approveTask).toHaveBeenCalledWith('t-review-1');
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('prompts for feedback when requesting changes and calls requestTaskChanges', async () => {
    vi.mocked(api.requestTaskChanges).mockResolvedValue({ data: { success: true } } as any);
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ReviewWorkModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        task={MOCK_TASK}
      />
    );

    fireEvent.click(screen.getByText(/Request Changes/));

    // Feedback textarea should appear
    const textarea = screen.getByPlaceholderText(/Explain what needs adjustment/i);
    fireEvent.change(textarea, { target: { value: 'Please add unit test coverage for edge cases.' } });

    fireEvent.click(screen.getByText('Send Feedback & Request Changes'));

    await waitFor(() => {
      expect(api.requestTaskChanges).toHaveBeenCalledWith('t-review-1', 'Please add unit test coverage for edge cases.');
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
