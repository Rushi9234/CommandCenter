import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Chat from './Chat';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

// Same pattern Teams.test.tsx already established: capture the latest
// callback Chat.tsx registers so a test can simulate an SSE event
// arriving without any real EventSource/fetch involved.
let latestRealtimeCallback: ((event: any) => void) | null = null;
vi.mock('../hooks/useRealtime', () => ({
  useRealtime: (cb: (event: any) => void) => {
    latestRealtimeCallback = cb;
  },
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const CURRENT_USER = { user_id: 'user-me', full_name: 'Ada Lovelace', role: 'member' };
const OTHER_USER = { user_id: 'user-other', full_name: 'Bob Smith', username: 'bob' };

const DIRECT_CONVO = {
  conversation_id: 'convo-direct-1',
  type: 'direct' as const,
  team_id: null,
  team_name: null,
  other_user: OTHER_USER,
  last_message_preview: 'Hey there',
  last_message_at: '2026-09-14T10:00:00Z',
  unread_count: 2,
};

const TEAM_CONVO = {
  conversation_id: 'convo-team-1',
  type: 'team' as const,
  team_id: 'team-a',
  team_name: 'Team Alpha',
  other_user: null,
  last_message_preview: 'Standup at 10',
  last_message_at: '2026-09-14T09:00:00Z',
  unread_count: 0,
};

const MSG_FROM_OTHER = {
  message_id: 'm1',
  conversation_id: 'convo-direct-1',
  sender_user_id: 'user-other',
  body: 'Hello there',
  created_at: '2026-09-14T09:59:00Z',
  seq: '1',
};
const MSG_FROM_ME = {
  message_id: 'm2',
  conversation_id: 'convo-direct-1',
  sender_user_id: 'user-me',
  body: 'Hi back',
  created_at: '2026-09-14T10:00:00Z',
  seq: '2',
};

const renderChat = (initialEntries: string[] = ['/chat']) => {
  mockUseAuth.mockReturnValue({ user: CURRENT_USER, isAuthenticated: true, token: 'tok', login: vi.fn(), register: vi.fn(), logout: vi.fn() });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Chat />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  latestRealtimeCallback = null;
  vi.mocked(api.getChatConversations).mockResolvedValue({ data: { data: [DIRECT_CONVO, TEAM_CONVO] } } as any);
  vi.mocked(api.getChatMessages).mockResolvedValue({ data: { data: { messages: [MSG_FROM_ME, MSG_FROM_OTHER], next_cursor: null } } } as any);
  vi.mocked(api.sendChatMessage).mockResolvedValue({
    data: { data: { message: { message_id: 'm3', conversation_id: 'convo-direct-1', sender_user_id: 'user-me', body: 'New message', created_at: '2026-09-14T10:05:00Z', seq: '3' } } },
  } as any);
  vi.mocked(api.getAllUsers).mockResolvedValue({ data: { data: [OTHER_USER, CURRENT_USER] } } as any);
  vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [{ team_id: 'team-a', team_name: 'Team Alpha' }] } } as any);
  vi.mocked(api.getTeamMembers).mockResolvedValue({
    data: { data: [{ user_id: 'user-me', full_name: 'Ada Lovelace' }, { user_id: 'user-other', full_name: 'Bob Smith' }] },
  } as any);
  vi.mocked(api.createDirectConversation).mockResolvedValue({ data: { data: { conversation_id: 'convo-direct-new' } } } as any);
  vi.mocked(api.createTeamConversation).mockResolvedValue({ data: { data: { conversation_id: 'convo-team-1' } } } as any);
  vi.mocked(api.markConversationRead).mockResolvedValue({ data: { success: true } } as any);
});

describe('Conversation list', () => {
  it('loads and renders both a direct and a team conversation', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
  });

  it('visually distinguishes team conversations with a Team label, direct conversations without one', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    const directRow = screen.getByText('Bob Smith').closest('button')!;
    const teamRow = screen.getByText('Team Alpha').closest('button')!;
    expect(within(teamRow).getByText('Team')).toBeInTheDocument();
    expect(within(directRow).queryByText('Team')).not.toBeInTheDocument();
  });

  it('shows the unread count on a conversation with unread messages', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument();
  });

  it('shows a loading state before conversations arrive', () => {
    vi.mocked(api.getChatConversations).mockReturnValue(new Promise(() => {}) as any);
    renderChat();
    expect(screen.getByText(/loading conversations/i)).toBeInTheDocument();
  });

  it('shows an empty state with no conversations', async () => {
    vi.mocked(api.getChatConversations).mockResolvedValue({ data: { data: [] } } as any);
    renderChat();
    await waitFor(() => expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument());
  });

  it('shows an error state with a retry option on failure', async () => {
    vi.mocked(api.getChatConversations).mockRejectedValue({ response: { data: { error: 'Server error' } } });
    renderChat();
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('filters the already-loaded list via search, with no new backend call', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    const callsBefore = vi.mocked(api.getChatConversations).mock.calls.length;

    fireEvent.change(screen.getByLabelText(/search conversations/i), { target: { value: 'Alpha' } });

    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    expect(vi.mocked(api.getChatConversations).mock.calls.length).toBe(callsBefore);

    fireEvent.click(screen.getByLabelText(/clear search/i));
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });
});

describe('Conversation selection via URL', () => {
  it('selects the conversation named in ?conversation= and calls markConversationRead', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(api.getChatMessages).toHaveBeenCalledWith('convo-direct-1'));
    await waitFor(() => expect(api.markConversationRead).toHaveBeenCalledWith('convo-direct-1'));
    expect(screen.getAllByText('Bob Smith').length).toBeGreaterThan(0);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('shows a clean unavailable state for a conversation not in the caller\'s list, without crashing', async () => {
    renderChat(['/chat?conversation=convo-nonexistent']);
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /back to conversations/i })).toBeInTheDocument();
  });

  it('shows the unavailable state when the messages endpoint itself 404s', async () => {
    vi.mocked(api.getChatMessages).mockRejectedValue({ response: { status: 404 } });
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());
  });

  it('clicking a conversation in the list selects it', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bob Smith').closest('button')!);
    await waitFor(() => expect(api.getChatMessages).toHaveBeenCalledWith('convo-direct-1'));
  });

  it('returning to /chat (no conversation param) clears the active thread', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/back to conversations/i));

    await waitFor(() => expect(screen.queryByText('Hello there')).not.toBeInTheDocument());
  });
});

describe('Messages', () => {
  it('renders outgoing and incoming messages distinctly', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());

    const outgoing = screen.getByText('Hi back');
    const incoming = screen.getByText('Hello there');
    expect(outgoing.className).toContain('bg-blue-600');
    expect(incoming.className).toContain('bg-gray-100');
  });

  it('renders message bodies as plain text (no HTML execution)', async () => {
    vi.mocked(api.getChatMessages).mockResolvedValue({
      data: { data: { messages: [{ ...MSG_FROM_OTHER, body: '<img src=x onerror="window.__pwned=true">' }], next_cursor: null } },
    } as any);
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('<img src=x onerror="window.__pwned=true">')).toBeInTheDocument());
    expect((window as any).__pwned).toBeUndefined();
    expect(document.querySelector('img[src="x"]')).not.toBeInTheDocument();
  });

  it('shows sender identity in team chat but not in direct chat', async () => {
    vi.mocked(api.getChatMessages).mockResolvedValue({
      data: { data: { messages: [{ ...MSG_FROM_OTHER, conversation_id: 'convo-team-1' }], next_cursor: null } },
    } as any);
    renderChat(['/chat?conversation=convo-team-1']);
    await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
    // 'Bob Smith' already appears once as the direct conversation's own
    // list-item title (the list stays in the DOM alongside the thread in
    // this test environment) -- a second occurrence appearing once team
    // member names resolve is the sender-identity label this test checks
    // for.
    await waitFor(() => expect(screen.getAllByText('Bob Smith').length).toBeGreaterThan(1));
  });

  it('shows a loading state while messages load', () => {
    vi.mocked(api.getChatMessages).mockReturnValue(new Promise(() => {}) as any);
    renderChat(['/chat?conversation=convo-direct-1']);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an empty state for a conversation with no messages', async () => {
    vi.mocked(api.getChatMessages).mockResolvedValue({ data: { data: { messages: [], next_cursor: null } } } as any);
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText(/no messages yet/i)).toBeInTheDocument());
  });

  it('shows a "Load older messages" control when a next_cursor exists, and loads them without duplicates', async () => {
    vi.mocked(api.getChatMessages)
      .mockResolvedValueOnce({ data: { data: { messages: [MSG_FROM_ME], next_cursor: '2' } } } as any)
      .mockResolvedValueOnce({ data: { data: { messages: [MSG_FROM_OTHER], next_cursor: null } } } as any);

    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());

    const loadOlderButton = screen.getByRole('button', { name: /load older messages/i });
    fireEvent.click(loadOlderButton);

    await waitFor(() => expect(api.getChatMessages).toHaveBeenCalledWith('convo-direct-1', '2'));
    await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
    expect(screen.getAllByText('Hi back')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /load older messages/i })).not.toBeInTheDocument();
  });

  it('does not show a "Load older" control on the final page', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /load older messages/i })).not.toBeInTheDocument();
  });
});

describe('Composer', () => {
  it('blocks sending an empty message', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByLabelText(/type a message/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
  });

  it('blocks sending a whitespace-only message', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
  });

  it('sends a trimmed message on button click and clears the composer', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: '  New message  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalledWith('convo-direct-1', 'New message'));
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(''));
  });

  it('Enter sends the message', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'Hello via enter' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalledWith('convo-direct-1', 'Hello via enter'));
  });

  it('Shift+Enter does not send (inserts a newline instead)', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(api.sendChatMessage).not.toHaveBeenCalled();
  });

  it('rejects a message over 4000 characters', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'a'.repeat(4001) } });
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
  });

  it('shows an inline error and keeps the text on a failed send', async () => {
    vi.mocked(api.sendChatMessage).mockRejectedValue({ response: { data: { error: 'Too many messages' } } });
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'will fail' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText('Too many messages')).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe('will fail');
  });

  it('disables the send button while a send is in flight, preventing duplicate submission', async () => {
    let resolveSend: (value: any) => void;
    vi.mocked(api.sendChatMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }) as any
    );
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'in flight' } });
    const sendButton = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendButton);

    await waitFor(() => expect(sendButton).toBeDisabled());
    expect(api.sendChatMessage).toHaveBeenCalledTimes(1);

    resolveSend!({ data: { data: { message: { ...MSG_FROM_ME, message_id: 'm-inflight' } } } });
  });
});

describe('Realtime', () => {
  it('refetches messages when a matching chat.message_created event arrives for the open conversation', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());
    expect(latestRealtimeCallback).not.toBeNull();

    vi.mocked(api.getChatMessages).mockResolvedValueOnce({
      data: { data: { messages: [{ ...MSG_FROM_OTHER, message_id: 'm-new', body: 'Realtime message', seq: '3' }, MSG_FROM_ME, MSG_FROM_OTHER], next_cursor: null } },
    } as any);

    latestRealtimeCallback!({ type: 'chat.message_created', conversationId: 'convo-direct-1' });

    await waitFor(() => expect(screen.getByText('Realtime message')).toBeInTheDocument());
  });

  it('does not refetch messages for an event belonging to a different conversation, but does refresh the list', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());
    const messagesCallsBefore = vi.mocked(api.getChatMessages).mock.calls.length;
    const listCallsBefore = vi.mocked(api.getChatConversations).mock.calls.length;

    latestRealtimeCallback!({ type: 'chat.message_created', conversationId: 'convo-team-1' });

    await waitFor(() => expect(vi.mocked(api.getChatConversations).mock.calls.length).toBeGreaterThan(listCallsBefore));
    expect(vi.mocked(api.getChatMessages).mock.calls.length).toBe(messagesCallsBefore);
  });

  it('a POST response and a subsequent realtime event for the same message do not render it twice', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    const textarea = await screen.findByLabelText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'New message' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(screen.getByText('New message')).toBeInTheDocument());

    // The realtime event for this same message arrives afterward, and a
    // refetch returns the same message_id ('m3') the POST already added.
    vi.mocked(api.getChatMessages).mockResolvedValueOnce({
      data: { data: { messages: [{ message_id: 'm3', conversation_id: 'convo-direct-1', sender_user_id: 'user-me', body: 'New message', created_at: '2026-09-14T10:05:00Z', seq: '3' }, MSG_FROM_ME, MSG_FROM_OTHER], next_cursor: null } },
    } as any);
    latestRealtimeCallback!({ type: 'chat.message_created', conversationId: 'convo-direct-1' });

    await waitFor(() => expect(screen.getAllByText('New message')).toHaveLength(1));
  });

  it('ignores an unrelated realtime event type', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());
    const callsBefore = vi.mocked(api.getChatConversations).mock.calls.length;

    latestRealtimeCallback!({ type: 'notification.created' });

    expect(vi.mocked(api.getChatConversations).mock.calls.length).toBe(callsBefore);
  });
});

describe('Starting a new conversation', () => {
  it('lists eligible teammates and teams, not arbitrary users', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/start a new conversation/i));

    await waitFor(() => expect(api.getAllUsers).toHaveBeenCalled());
    // CURRENT_USER is filtered out of the picker even though the backend
    // list includes them (self-DM is not offered).
    expect(within(screen.getByRole('dialog')).queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Bob Smith')).toBeInTheDocument();
  });

  it('creating a direct conversation refreshes the list and selects it', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/start a new conversation/i));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(within(screen.getByRole('dialog')).getByText('Bob Smith'));

    await waitFor(() => expect(api.createDirectConversation).toHaveBeenCalledWith('user-other'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('only shows teams the current user can access for team chat', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/start a new conversation/i));
    fireEvent.click(screen.getByRole('button', { name: /team chat/i }));

    await waitFor(() => expect(api.getMyTeams).toHaveBeenCalled());
    expect(within(screen.getByRole('dialog')).getByText('Team Alpha')).toBeInTheDocument();
  });
});

describe('Accessibility', () => {
  it('the composer textarea has an accessible label', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByLabelText(/type a message/i)).toBeInTheDocument());
  });

  it('icon-only controls have accessible labels', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByLabelText(/send message/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/back to conversations/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start a new conversation/i)).toBeInTheDocument();
  });

  it('marks the selected conversation with an accessible current-item state', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getAllByText('Bob Smith').length).toBeGreaterThan(0));
    const selectedButton = screen.getAllByText('Bob Smith')[0].closest('button')!;
    expect(selectedButton).toHaveAttribute('aria-current', 'true');
  });

  it('has a live region for incoming-message announcements', async () => {
    renderChat(['/chat?conversation=convo-direct-1']);
    await waitFor(() => expect(screen.getByText('Hi back')).toBeInTheDocument());
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });
});
