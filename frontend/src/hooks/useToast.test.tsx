import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider, useToast } from './useToast';
import { ToastContainer } from '../components/common/ToastContainer';

// Mock useAuth
vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', full_name: 'Test User' },
    isAuthenticated: true,
  }),
}));

// Mock useRealtime
vi.mock('./useRealtime', () => ({
  useRealtime: vi.fn(),
}));

// Mock api
vi.mock('../services/api', () => ({
  getMyNotifications: vi.fn().mockResolvedValue({
    data: {
      data: {
        notifications: [],
        unreadCount: 0,
      },
    },
  }),
}));

const TestComponent = () => {
  const { showToast, success, error, warning, info, dismissToast, clearToasts, toasts } = useToast();

  return (
    <div>
      <div data-testid="toast-count">{toasts.length}</div>
      <button onClick={() => success('Data saved successfully!', 'Saved')}>Trigger Success</button>
      <button onClick={() => error('Something went wrong', 'Failed')}>Trigger Error</button>
      <button onClick={() => warning('High server load', 'Alert')}>Trigger Warning</button>
      <button onClick={() => info('New update available')}>Trigger Info</button>
      <button
        onClick={() =>
          showToast({
            title: 'Assigned to Blocker',
            message: 'You were assigned to blocker #42',
            type: 'notification',
            category: 'blocker.assigned',
            duration: 0,
          })
        }
      >
        Trigger Notification
      </button>
      <button onClick={() => clearToasts()}>Clear All</button>
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismissToast(t.id)}>
          Dismiss {t.id}
        </button>
      ))}
    </div>
  );
};

describe('useToast & ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns safe fallback context when useToast is used outside ToastProvider', () => {
    let capturedToast: any;
    const StandaloneComponent = () => {
      capturedToast = useToast();
      return null;
    };

    expect(() => render(<StandaloneComponent />)).not.toThrow();
    expect(capturedToast).toBeDefined();
    expect(capturedToast.toasts).toEqual([]);
    expect(typeof capturedToast.showToast).toBe('function');
    expect(capturedToast.showToast('Test')).toBe('');
    expect(typeof capturedToast.success).toBe('function');
  });

  it('renders ToastContainer and displays toast when triggered', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastContainer />
          <TestComponent />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

    // Trigger success toast
    act(() => {
      screen.getByText('Trigger Success').click();
    });

    expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Data saved successfully!')).toBeInTheDocument();
  });

  it('supports notification type with category badge and icon', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastContainer />
          <TestComponent />
        </ToastProvider>
      </MemoryRouter>
    );

    // Trigger notification toast
    act(() => {
      screen.getByText('Trigger Notification').click();
    });

    expect(screen.getByText('Assigned to Blocker')).toBeInTheDocument();
    expect(screen.getByText('You were assigned to blocker #42')).toBeInTheDocument();
    expect(screen.getByText(/blocker alert/i)).toBeInTheDocument();
  });

  it('dismisses toast on dismiss button click', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastContainer />
          <TestComponent />
        </ToastProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByText('Trigger Info').click();
    });

    expect(screen.getByText('New update available')).toBeInTheDocument();

    // Click the dismiss button on the toast card
    const dismissBtn = screen.getByLabelText('Dismiss notification');
    act(() => {
      dismissBtn.click();
    });

    expect(screen.queryByText('New update available')).not.toBeInTheDocument();
  });

  it('clears all toasts when clearToasts is called', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastContainer />
          <TestComponent />
        </ToastProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByText('Trigger Success').click();
      screen.getByText('Trigger Error').click();
    });

    expect(screen.getByTestId('toast-count')).toHaveTextContent('2');

    act(() => {
      screen.getByText('Clear All').click();
    });

    expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
  });
});
