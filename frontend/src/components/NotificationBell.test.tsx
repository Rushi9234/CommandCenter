import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NotificationBell from './NotificationBell';
import * as api from '../services/api';

vi.mock('../services/api');

// Deep-link navigation tests need to observe where useNavigate() actually
// sent the user -- captured the same way latestRealtimeCallback captures
// the realtime handler below, rather than asserting against real
// react-router history internals.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderBell = () => render(<MemoryRouter><NotificationBell /></MemoryRouter>);

// Same capture-the-callback pattern proven in Teams.test.tsx's realtime
// race-fix tests -- lets a test simulate a real SSE `notification.created`
// event without a real EventSource/fetch.
let latestRealtimeCallback: ((event: any) => void) | null = null;
vi.mock('../hooks/useRealtime', () => ({
  useRealtime: (cb: (event: any) => void) => {
    latestRealtimeCallback = cb;
  },
}));

const NOTIF_A = {
  notification_id: 'notif-1',
  category: 'team.join_request.created',
  title: 'New join request',
  message: 'Bob requested to join Team Alpha',
  read_at: null,
  created_at: '2026-08-30T10:00:00Z',
};
const NOTIF_B = {
  notification_id: 'notif-2',
  category: 'goal.creation_approved',
  title: 'Your team goal was approved',
  message: '"Ship the feature" is now an official team goal',
  read_at: '2026-08-30T09:00:00Z',
  created_at: '2026-08-30T08:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  latestRealtimeCallback = null;
  vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [], unreadCount: 0 } } } as any);
  vi.mocked(api.markNotificationRead).mockResolvedValue({ data: { data: {} } } as any);
  vi.mocked(api.markAllNotificationsRead).mockResolvedValue({ data: { data: { markedCount: 0 } } } as any);
  vi.mocked(api.getNotificationPreferences).mockResolvedValue({
    data: { data: { team_join_request: true, goal_creation: true, goal_completion: true, task_assignment: true, blocker: true } },
  } as any);
  vi.mocked(api.updateNotificationPreferences).mockResolvedValue({ data: { data: {} } } as any);
});

describe('NotificationBell -- rendering and badge', () => {
  it('renders the bell with an accessible label', async () => {
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('shows the unread count badge when there are unread notifications', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A], unreadCount: 3 } } } as any);
    renderBell();
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
  });

  it('hides the badge when unread count is zero', async () => {
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('caps the badge display at 99+', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [], unreadCount: 142 } } } as any);
    renderBell();
    await waitFor(() => expect(screen.getByText('99+')).toBeInTheDocument());
  });
});

describe('NotificationBell -- panel open/close', () => {
  it('opens the panel on click and loads notifications', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('New join request');
  });

  it('closes when clicking outside the panel', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByRole('dialog', { name: 'Notifications' });

    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument());
  });

  it('closes on Escape', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByRole('dialog', { name: 'Notifications' });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument());
  });

  it('does not close when clicking inside the panel', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });

    fireEvent.mouseDown(panel);

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });
});

describe('NotificationBell -- loading/error/empty states', () => {
  it('shows a loading state while the list is in flight', async () => {
    let resolve!: (value: any) => void;
    const promise = new Promise((r) => { resolve = r; });
    vi.mocked(api.getMyNotifications)
      .mockResolvedValueOnce({ data: { data: { notifications: [], unreadCount: 0 } } } as any)
      .mockReturnValueOnce(promise as any);
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    resolve({ data: { data: { notifications: [], unreadCount: 0 } } });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('shows an explicit empty state when there are no notifications', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
  });

  it('shows an error state with Retry on initial failure', async () => {
    vi.mocked(api.getMyNotifications)
      .mockResolvedValueOnce({ data: { data: { notifications: [], unreadCount: 0 } } } as any)
      .mockRejectedValueOnce({ response: { data: { error: 'Network error' } } });
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByText('Network error');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Retry after a failure succeeds and shows the list', async () => {
    vi.mocked(api.getMyNotifications)
      .mockResolvedValueOnce({ data: { data: { notifications: [], unreadCount: 0 } } } as any)
      .mockRejectedValueOnce({ response: { data: { error: 'Network error' } } })
      .mockResolvedValueOnce({ data: { data: { notifications: [NOTIF_A], unreadCount: 1 } } } as any);
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByText('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('New join request');
  });
});

describe('NotificationBell -- mark read / mark all read', () => {
  it('marks a single notification read and decrements the unread count', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('New join request');

    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('notif-1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument());
  });

  it('a double-click on Mark read does not double-submit', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('New join request');

    const button = screen.getByRole('button', { name: 'Mark read' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledTimes(1));
  });

  it('mark all read clears the unread count and disables further clicks', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('New join request');

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled());
  });

  it('Mark all read is disabled when there is nothing unread', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_B], unreadCount: 0 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Your team goal was approved');

    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });
});

describe('NotificationBell -- preferences', () => {
  it('shows all categories ON by default', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByRole('dialog', { name: 'Notifications' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const checkbox = await screen.findByRole('checkbox', { name: 'Team join requests notifications' });
    expect(checkbox).toBeChecked();
  });

  it('toggling a category off calls the API and unchecks it', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'Blockers notifications' });

    vi.mocked(api.updateNotificationPreferences).mockResolvedValue({
      data: { data: { team_join_request: true, goal_creation: true, goal_completion: true, task_assignment: true, blocker: false } },
    } as any);
    fireEvent.click(checkbox);

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ blocker: false }));
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it('a disabled category shown from a previously saved preference renders unchecked', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue({
      data: { data: { team_join_request: false, goal_creation: true, goal_completion: true, task_assignment: true, blocker: true } },
    } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const checkbox = await screen.findByRole('checkbox', { name: 'Team join requests notifications' });
    expect(checkbox).not.toBeChecked();
  });
});

describe('NotificationBell -- realtime', () => {
  it('a notification.created event while the panel is closed refreshes only the unread count', async () => {
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalledTimes(1));
    expect(latestRealtimeCallback).not.toBeNull();

    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [], unreadCount: 5 } } } as any);
    latestRealtimeCallback!({ type: 'notification.created' });

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  });

  it('a notification.created event while the panel is open triggers a scoped list refresh without blanking existing entries first', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_B], unreadCount: 0 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Your team goal was approved');

    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NOTIF_A, NOTIF_B], unreadCount: 1 } } } as any);
    latestRealtimeCallback!({ type: 'notification.created' });

    // The already-loaded notification must remain visible throughout --
    // never blanked by the background refresh.
    expect(screen.getByText('Your team goal was approved')).toBeInTheDocument();
    await screen.findByText('New join request');
  });

  it('an unrelated realtime event type is ignored', async () => {
    renderBell();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalledTimes(1));
    vi.mocked(api.getMyNotifications).mockClear();

    latestRealtimeCallback!({ type: 'join_request.created', teamId: 'team-a' });

    await new Promise((r) => setTimeout(r, 10));
    expect(api.getMyNotifications).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Deep-link navigation: clicking a notification takes the user to the
// right destination page with the right entity pre-selected, using only
// the category + entity-ID columns the backend already returns (no
// backend change was needed for this).
describe('NotificationBell -- deep-link navigation', () => {
  const TEAM_JOIN_NOTIF = {
    notification_id: 'n-team',
    category: 'team.join_request.created',
    title: 'New join request',
    message: 'Bob requested to join Team Alpha',
    team_id: 'team-1',
    read_at: null,
    created_at: '2026-08-30T10:00:00Z',
  };
  const GOAL_NOTIF = {
    notification_id: 'n-goal',
    category: 'goal.creation_proposed',
    title: 'Goal approval requested',
    message: 'Alex proposed a new team goal',
    team_id: 'team-1',
    goal_id: 'goal-1',
    read_at: null,
    created_at: '2026-08-30T10:00:00Z',
  };
  const TASK_NOTIF = {
    notification_id: 'n-task',
    category: 'task.owner_assigned',
    title: 'Task assigned to you',
    message: 'You were assigned as owner of "Ship it"',
    project_id: 'proj-1',
    task_id: 'task-1',
    read_at: null,
    created_at: '2026-08-30T10:00:00Z',
  };
  const BLOCKER_NOTIF = {
    notification_id: 'n-blocker',
    category: 'blocker.created',
    title: 'New blocker reported',
    message: 'Carl reported a blocker',
    team_id: 'team-1',
    blocker_id: 'blocker-1',
    read_at: null,
    created_at: '2026-08-30T10:00:00Z',
  };
  const NO_DESTINATION_NOTIF = {
    notification_id: 'n-unknown',
    category: 'future.unmapped_category',
    title: 'Something happened',
    message: 'No route known for this yet',
    read_at: null,
    created_at: '2026-08-30T10:00:00Z',
  };

  it('a team.* notification navigates to /teams?teamId=...', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [TEAM_JOIN_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /New join request/ });

    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/teams?teamId=team-1');
  });

  it('a goal.* notification navigates to /goals?teamId=...&goalId=...', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [GOAL_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /Goal approval requested/ });

    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/goals?goalId=goal-1&teamId=team-1');
  });

  it('a task.* notification navigates to /projects?projectId=...&taskId=...', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [TASK_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /Task assigned to you/ });

    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/projects?projectId=proj-1&taskId=task-1');
  });

  it('a blocker.* notification navigates to /help?teamId=...&blockerId=...', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [BLOCKER_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /New blocker reported/ });

    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/help?teamId=team-1&blockerId=blocker-1');
  });

  it('clicking a notification marks it read and closes the panel', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [TEAM_JOIN_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /New join request/ });

    fireEvent.click(row);

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('n-team'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument());
  });

  it('clicking an already-read notification still navigates, without calling markNotificationRead again', async () => {
    const READ_NOTIF = { ...TEAM_JOIN_NOTIF, read_at: '2026-08-30T09:00:00Z' };
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [READ_NOTIF], unreadCount: 0 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /New join request/ });

    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/teams?teamId=team-1');
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('a notification with no known destination (unmapped category) is not clickable and does not navigate', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [NO_DESTINATION_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Something happened');

    expect(screen.queryByRole('button', { name: /Something happened/ })).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('a goal notification missing goal_id (malformed/incomplete row) does not crash and does not navigate', async () => {
    const MALFORMED = { ...GOAL_NOTIF, goal_id: null };
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [MALFORMED], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Goal approval requested');

    expect(screen.queryByRole('button', { name: /Goal approval requested/ })).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clicking a notification twice in quick succession navigates only once', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [TEAM_JOIN_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /New join request/ });

    fireEvent.click(row);
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('the notification row is keyboard-activatable via Enter', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [TEAM_JOIN_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByRole('button', { name: /New join request/ });

    fireEvent.keyDown(row, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/teams?teamId=team-1');
  });

  it('the "Mark read" button inside a clickable row does not also trigger navigation', async () => {
    vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [TEAM_JOIN_NOTIF], unreadCount: 1 } } } as any);
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByRole('button', { name: /New join request/ });

    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('n-team'));
    expect(mockNavigate).not.toHaveBeenCalled();
    // Panel stays open -- Mark read is not a navigation action.
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });
});
