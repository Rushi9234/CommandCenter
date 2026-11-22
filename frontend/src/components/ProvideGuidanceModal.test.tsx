import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProvideGuidanceModal } from './ProvideGuidanceModal';
import * as guidanceService from '../services/guidanceService';

vi.mock('../services/guidanceService');

describe('ProvideGuidanceModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Does not render when isOpen is false', () => {
    render(
      <ProvideGuidanceModal
        isOpen={false}
        onClose={vi.fn()}
        contextType="task"
        contextId="task-123"
      />
    );
    expect(screen.queryByTestId('provide-guidance-modal')).toBeNull();
  });

  it('2. Renders modal elements when open', () => {
    render(
      <ProvideGuidanceModal
        isOpen={true}
        onClose={vi.fn()}
        contextType="task"
        contextId="task-123"
        contextTitle="Fix Login Bug"
        recipientName="Alice Member"
      />
    );

    expect(screen.getByTestId('provide-guidance-modal')).toBeInTheDocument();
    expect(screen.getByText('Provide Actionable Guidance')).toBeInTheDocument();
    expect(screen.getByText('Fix Login Bug')).toBeInTheDocument();
    expect(screen.getByText('👤 Alice Member')).toBeInTheDocument();
  });

  it('3. Validates message length (< 3 chars)', async () => {
    render(
      <ProvideGuidanceModal
        isOpen={true}
        onClose={vi.fn()}
        contextType="task"
        contextId="task-123"
      />
    );

    const input = screen.getByTestId('guidance-message-input');
    fireEvent.change(input, { target: { value: 'ab' } });

    const submitBtn = screen.getByTestId('submit-guidance-btn');
    fireEvent.click(submitBtn);

    expect(await screen.findByTestId('guidance-error')).toBeInTheDocument();
    expect(screen.getByText(/must be at least 3 characters/i)).toBeInTheDocument();
  });

  it('4. Successfully submits guidance message', async () => {
    vi.mocked(guidanceService.createGuidance).mockResolvedValue({
      data: { data: { guidance_id: 'g1' } },
    } as any);

    const onClose = vi.fn();
    const onSent = vi.fn();

    render(
      <ProvideGuidanceModal
        isOpen={true}
        onClose={onClose}
        contextType="task"
        contextId="task-123"
        onGuidanceSent={onSent}
      />
    );

    const input = screen.getByTestId('guidance-message-input');
    fireEvent.change(input, { target: { value: 'Please update status on task 123' } });

    const submitBtn = screen.getByTestId('submit-guidance-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(guidanceService.createGuidance).toHaveBeenCalledWith({
        contextType: 'task',
        contextId: 'task-123',
        teamId: undefined,
        recipientId: undefined,
        message: 'Please update status on task 123',
      });
      expect(onSent).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('5. Handles API error during submission', async () => {
    vi.mocked(guidanceService.createGuidance).mockRejectedValue({
      response: { data: { error: 'Leader permission required.' } },
    });

    render(
      <ProvideGuidanceModal
        isOpen={true}
        onClose={vi.fn()}
        contextType="task"
        contextId="task-123"
      />
    );

    const input = screen.getByTestId('guidance-message-input');
    fireEvent.change(input, { target: { value: 'Valid guidance message text' } });

    const submitBtn = screen.getByTestId('submit-guidance-btn');
    fireEvent.click(submitBtn);

    expect(await screen.findByTestId('guidance-error')).toBeInTheDocument();
    expect(screen.getByText(/Leader permission required/i)).toBeInTheDocument();
  });
});
