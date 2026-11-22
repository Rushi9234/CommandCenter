import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AttentionActionCenter from './AttentionActionCenter';
import * as api from '../services/api';

vi.mock('../services/api');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_INDIVIDUAL_ATTENTION = {
  scope: 'INDIVIDUAL',
  user_id: 'user-123',
  attention_status: 'AT_RISK',
  summary: '1 work item(s) require your direct attention.',
  total_action_items: 1,
  items: [
    {
      id: 'blocker-b1',
      category: 'BLOCKER',
      urgency: 'critical',
      title: 'SOS Blocker: Database Outage',
      reason: 'Active SOS Blocker in team Engineering requires resolution.',
      evidence: [
        { key: 'Team', label: 'Team', value: 'Engineering' },
        { key: 'Urgency', label: 'Urgency', value: 'CRITICAL' },
        { key: 'Status', label: 'Status', value: 'open' },
      ],
      action: {
        label: 'Resolve in SOS Hub',
        route: '/help',
        params: { blockerId: 'b1' },
      },
    },
  ],
};

const MOCK_EMPTY_ATTENTION = {
  scope: 'INDIVIDUAL',
  user_id: 'user-123',
  attention_status: 'ON_TRACK',
  summary: 'No attention items right now. All your assigned work items are progressing normally.',
  total_action_items: 0,
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AttentionActionCenter Frontend Component', () => {
  it('1. Renders loading state initially', () => {
    vi.mocked(api.getMyAttention).mockReturnValue(new Promise(() => {}) as any);

    render(
      <MemoryRouter>
        <AttentionActionCenter scope="INDIVIDUAL" />
      </MemoryRouter>
    );

    expect(screen.getByTestId('action-center-loading')).toBeInTheDocument();
  });

  it('2. Individual scope: renders attention items with evidence and action button', async () => {
    vi.mocked(api.getMyAttention).mockResolvedValue({ data: { data: MOCK_INDIVIDUAL_ATTENTION } } as any);

    render(
      <MemoryRouter>
        <AttentionActionCenter scope="INDIVIDUAL" />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('attention-action-center')).toBeInTheDocument();
    expect(screen.getByText('Action Center (My Work Attention)')).toBeInTheDocument();
    expect(screen.getByText('SOS Blocker: Database Outage')).toBeInTheDocument();
    expect(screen.getByText('Active SOS Blocker in team Engineering requires resolution.')).toBeInTheDocument();

    // Verify Evidence Box ("WHY IS THIS SHOWING?")
    expect(screen.getByText('🔍 Underlying Evidence:')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();

    // Action button
    const actionBtn = screen.getByTestId('action-btn-blocker-b1');
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/help?blockerId=b1');
  });

  it('3. Honest Empty State: Renders "No attention items right now" when 0 items exist', async () => {
    vi.mocked(api.getMyAttention).mockResolvedValue({ data: { data: MOCK_EMPTY_ATTENTION } } as any);

    render(
      <MemoryRouter>
        <AttentionActionCenter scope="INDIVIDUAL" />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('action-center-empty')).toBeInTheDocument();
    expect(screen.getByText('No attention items right now')).toBeInTheDocument();
    expect(screen.getByText('🟢 On Track')).toBeInTheDocument();
  });

  it('5. Target #5: Renders signals array, evidence key-values, View Timeline button, and Guidance button', async () => {
    const MOCK_TEAM_SIGNAL_ATTENTION = {
      scope: 'TEAM',
      team_id: 'team-456',
      team_name: 'Engineering Team',
      attention_status: 'NEEDS_ATTENTION',
      summary: '1 work signal(s) active on this team.',
      total_action_items: 1,
      items: [],
      signals: [
        {
          signal_id: 'STALLED_TASK:task:t123',
          signal_type: 'STALLED_TASK',
          severity: 'HIGH',
          title: 'Task Stalled > 5 Days',
          explanation: 'Task "Fix Database Auth" has had zero state transitions in 6 days.',
          observed_at: '2026-09-16T12:00:00Z',
          evidence: [
            { key: 'Task ID', label: 'Task ID', value: 't123' },
            { key: 'Task Title', label: 'Task Title', value: 'Fix Database Auth' },
            { key: 'Days Inactive', label: 'Days Inactive', value: '6' },
            { key: 'Assignee', label: 'Assignee', value: 'Alice' },
          ],
          supports_timeline: true,
          supports_guidance: true,
          action: {
            label: 'Open Task Board',
            route: '/tasks',
            params: { taskId: 't123' },
          },
        },
      ],
    };

    vi.mocked(api.getTeamAttentionDetails).mockResolvedValue({ data: { data: MOCK_TEAM_SIGNAL_ATTENTION } } as any);

    render(
      <MemoryRouter>
        <AttentionActionCenter scope="TEAM" teamId="team-456" />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('attention-action-center')).toBeInTheDocument();
    expect(screen.getByText('Task Stalled > 5 Days')).toBeInTheDocument();
    expect(screen.getByText('Task "Fix Database Auth" has had zero state transitions in 6 days.')).toBeInTheDocument();

    // Verify Evidence Box
    expect(screen.getByText('🔍 Underlying Evidence:')).toBeInTheDocument();
    expect(screen.getByText('Fix Database Auth')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    // Action buttons: Timeline and Guidance buttons
    const timelineBtn = screen.getByTestId('view-timeline-btn-STALLED_TASK:task:t123');
    expect(timelineBtn).toBeInTheDocument();
    expect(timelineBtn).toHaveTextContent('Timeline');

    const guidanceBtn = screen.getByTestId('provide-guidance-btn-STALLED_TASK:task:t123');
    expect(guidanceBtn).toBeInTheDocument();
    expect(guidanceBtn).toHaveTextContent('Guidance');

    // Click Timeline button - verify modal trigger
    fireEvent.click(timelineBtn);
    expect(screen.getByTestId('work-activity-timeline')).toBeInTheDocument();
  });
});
