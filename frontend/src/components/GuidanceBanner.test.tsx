import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GuidanceBanner from './GuidanceBanner';
import * as guidanceService from '../services/guidanceService';
import { GuidanceItem } from '../services/guidanceService';

vi.mock('../services/guidanceService');

const MOCK_GUIDANCE_ITEMS: GuidanceItem[] = [
  {
    guidance_id: 'g-1',
    context_type: 'task',
    context_id: 'task-100',
    team_id: 'team-1',
    author_id: 'leader-1',
    recipient_id: 'member-1',
    author_name: 'Lead Manager',
    message: 'Please unblock the login service.',
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('GuidanceBanner Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Returns null when guidance list is empty', () => {
    const { container } = render(<GuidanceBanner guidanceList={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('2. Renders open guidance item with acknowledge and resolve buttons for recipient', () => {
    render(
      <GuidanceBanner
        guidanceList={MOCK_GUIDANCE_ITEMS}
        currentUserId="member-1"
      />
    );

    expect(screen.getByTestId('guidance-banner-g-1')).toBeInTheDocument();
    expect(screen.getByText('Please unblock the login service.')).toBeInTheDocument();
    expect(screen.getByTestId('ack-guidance-btn-g-1')).toBeInTheDocument();
    expect(screen.getByTestId('resolve-guidance-btn-g-1')).toBeInTheDocument();
  });

  it('3. Successfully acknowledges guidance', async () => {
    vi.mocked(guidanceService.updateGuidanceStatus).mockResolvedValue({
      data: { data: { ...MOCK_GUIDANCE_ITEMS[0], status: 'acknowledged' } },
    } as any);

    const onUpdate = vi.fn();

    render(
      <GuidanceBanner
        guidanceList={MOCK_GUIDANCE_ITEMS}
        currentUserId="member-1"
        onStatusUpdated={onUpdate}
      />
    );

    const ackBtn = screen.getByTestId('ack-guidance-btn-g-1');
    fireEvent.click(ackBtn);

    await waitFor(() => {
      expect(guidanceService.updateGuidanceStatus).toHaveBeenCalledWith('g-1', 'acknowledged');
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it('4. Handles conflict / 409 error on status update', async () => {
    vi.mocked(guidanceService.updateGuidanceStatus).mockRejectedValue({
      response: { data: { error: 'Guidance is already in status acknowledged' } },
    });

    render(
      <GuidanceBanner
        guidanceList={MOCK_GUIDANCE_ITEMS}
        currentUserId="member-1"
      />
    );

    const ackBtn = screen.getByTestId('ack-guidance-btn-g-1');
    fireEvent.click(ackBtn);

    expect(await screen.findByTestId('guidance-banner-error')).toBeInTheDocument();
    expect(screen.getByText(/already in status acknowledged/i)).toBeInTheDocument();
  });
});
