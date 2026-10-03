import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeedbackModal from './FeedbackModal';
import * as api from '../services/api';

vi.mock('../services/api');

describe('FeedbackModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal when isOpen is true and submits report successfully', async () => {
    vi.mocked(api.createFeedback).mockResolvedValue({
      data: {
        success: true,
        data: {
          reference_id: 'FB-TEST1234',
        },
      },
    } as any);

    const handleClose = vi.fn();
    render(<FeedbackModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByText('Submit Feedback or Issue Report')).toBeInTheDocument();

    const subjectInput = screen.getByPlaceholderText('Brief summary of your feedback or issue');
    const descInput = screen.getByPlaceholderText('Provide details, steps to reproduce, or suggestions...');

    fireEvent.change(subjectInput, { target: { value: 'Bug in navbar' } });
    fireEvent.change(descInput, { target: { value: 'The notification icon does not display the unread badge on mobile layout.' } });

    fireEvent.click(screen.getByText('Submit Report'));

    await waitFor(() => {
      expect(api.createFeedback).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Thank You! Report Submitted')).toBeInTheDocument();
    expect(screen.getByText('FB-TEST1234')).toBeInTheDocument();
  });

  it('shows error message when description is too short', async () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);

    const subjectInput = screen.getByPlaceholderText('Brief summary of your feedback or issue');
    const descInput = screen.getByPlaceholderText('Provide details, steps to reproduce, or suggestions...');

    fireEvent.change(subjectInput, { target: { value: 'Short' } });
    fireEvent.change(descInput, { target: { value: 'Too short' } });

    fireEvent.click(screen.getByText('Submit Report'));

    expect(await screen.findByText('Description must be at least 10 characters long.')).toBeInTheDocument();
    expect(api.createFeedback).not.toHaveBeenCalled();
  });
});
