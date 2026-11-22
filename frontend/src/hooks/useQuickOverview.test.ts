import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuickOverview } from './useQuickOverview';
import { useAuth } from './useAuth';

// Mock useAuth hook
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe('useQuickOverview', () => {
  beforeEach(() => {
    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    mockUseAuth.mockClear();
  });

  describe('initialization', () => {
    it('returns false initially when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isInitializing: true,
        user: null,
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(false);
    });

    it('returns false when auth is initializing', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: true,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('first visit behavior', () => {
    it('shows walkthrough on first authenticated visit', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(true);
    });

    it('sets first visit flag in sessionStorage on first visit', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      renderHook(() => useQuickOverview());

      expect(sessionStorage.getItem('quickOverviewFirstVisit')).toBe('true');
    });

    it('does not show walkthrough if first visit flag already set', () => {
      sessionStorage.setItem('quickOverviewFirstVisit', 'true');

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('dismissal persistence', () => {
    it('does not show walkthrough if previously dismissed', () => {
      localStorage.setItem('quickOverviewDismissed', 'true');

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(false);
    });

    it('persists dismissal to localStorage when closing', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.onClose();
      });

      expect(localStorage.getItem('quickOverviewDismissed')).toBe('true');
    });

    it('walkthrough remains closed after dismissal on subsequent auth', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      act(() => {
        result.current.onClose();
      });

      // Simulate new auth context (e.g., page refresh)
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result: result2 } = renderHook(() => useQuickOverview());

      expect(result2.current.isOpen).toBe(false);
    });
  });

  describe('onReopenGuide', () => {
    it('clears dismissal flag and reopens walkthrough', () => {
      localStorage.setItem('quickOverviewDismissed', 'true');

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.onReopenGuide();
      });

      expect(result.current.isOpen).toBe(true);
      expect(localStorage.getItem('quickOverviewDismissed')).toBe(null);
    });

    it('allows multiple reopens after initial dismissal', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      act(() => {
        result.current.onClose();
      });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.onReopenGuide();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.onClose();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('authentication state changes', () => {
    it('closes walkthrough when user logs out', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result, rerender } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(true);

      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isInitializing: false,
        user: null,
      });

      rerender();

      expect(result.current.isOpen).toBe(false);
    });

    it('resets session flag on logout/login', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      renderHook(() => useQuickOverview());

      expect(sessionStorage.getItem('quickOverviewFirstVisit')).toBe('true');

      // Simulate logout
      sessionStorage.clear();
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isInitializing: false,
        user: null,
      });

      // Simulate login again
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '456' },
      });

      const { result } = renderHook(() => useQuickOverview());

      // Should show again on next login
      expect(result.current.isOpen).toBe(true);
    });
  });

  describe('callback signatures', () => {
    it('onClose is a function', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(typeof result.current.onClose).toBe('function');
    });

    it('onReopenGuide is a function', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result } = renderHook(() => useQuickOverview());

      expect(typeof result.current.onReopenGuide).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('handles rapid toggles of authentication state', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result, rerender } = renderHook(() => useQuickOverview());

      expect(result.current.isOpen).toBe(true);

      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isInitializing: false,
        user: null,
      });

      rerender();

      expect(result.current.isOpen).toBe(false);

      // Simulate dismissal before reauth
      act(() => {
        result.current.onClose();
      });

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      rerender();

      // Should not show again due to dismissal flag
      expect(result.current.isOpen).toBe(false);
    });

    it('localStorage persists across multiple hook instances', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isInitializing: false,
        user: { user_id: '123' },
      });

      const { result: result1 } = renderHook(() => useQuickOverview());

      expect(result1.current.isOpen).toBe(true);

      act(() => {
        result1.current.onClose();
      });

      // Second hook should see the dismissal flag
      const { result: result2 } = renderHook(() => useQuickOverview());

      expect(result2.current.isOpen).toBe(false);
    });
  });
});
