import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTeamsGuide } from './useTeamsGuide';
import { useAuth } from './useAuth';

// Mock useAuth
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('useTeamsGuide', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the guide on first authenticated visit', () => {
    const { result } = renderHook(() => useTeamsGuide());
    expect(result.current.isOpen).toBe(true);
    expect(sessionStorage.getItem('teamsGuideFirstVisit')).toBe('true');
  });

  it('does not show the guide on subsequent visits after dismissal', () => {
    localStorage.setItem('teamsGuideDismissed', 'true');
    const { result } = renderHook(() => useTeamsGuide());
    expect(result.current.isOpen).toBe(false);
  });

  it('closes the guide and sets dismissal flag when onClose is called', () => {
    const { result } = renderHook(() => useTeamsGuide());
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.onClose();
    });

    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem('teamsGuideDismissed')).toBe('true');
  });

  it('clears dismissal flag and reopens when onReopenGuide is called', () => {
    // First, dismiss the guide
    localStorage.setItem('teamsGuideDismissed', 'true');
    const { result, rerender } = renderHook(() => useTeamsGuide());
    expect(result.current.isOpen).toBe(false);

    // Now reopen it
    act(() => {
      result.current.onReopenGuide();
    });

    // Re-render to see the effect take hold
    rerender();
    expect(result.current.isOpen).toBe(true);
    expect(localStorage.getItem('teamsGuideDismissed')).toBeNull();
  });

  it('allows multiple reopens after dismissal', () => {
    const { result, rerender } = renderHook(() => useTeamsGuide());

    // First open (from first visit)
    expect(result.current.isOpen).toBe(true);

    // Close it
    act(() => {
      result.current.onClose();
    });
    rerender();
    expect(result.current.isOpen).toBe(false);

    // Reopen it
    act(() => {
      result.current.onReopenGuide();
    });
    rerender();
    expect(result.current.isOpen).toBe(true);

    // Close it again
    act(() => {
      result.current.onClose();
    });
    rerender();
    expect(result.current.isOpen).toBe(false);

    // Reopen it again (multiple reopens work)
    act(() => {
      result.current.onReopenGuide();
    });
    rerender();
    expect(result.current.isOpen).toBe(true);
  });

  it('hides the guide during auth initialization', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isInitializing: true,
    });
    const { result } = renderHook(() => useTeamsGuide());
    expect(result.current.isOpen).toBe(false);
  });

  it('hides the guide when not authenticated', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isInitializing: false,
    });
    const { result } = renderHook(() => useTeamsGuide());
    expect(result.current.isOpen).toBe(false);
  });

  it('does not reopen guide on subsequent visits after dismissal', () => {
    const { result: result1, rerender: rerender1 } = renderHook(() => useTeamsGuide());

    // First visit, guide opens
    expect(result1.current.isOpen).toBe(true);

    // Dismiss it
    act(() => {
      result1.current.onClose();
    });
    rerender1();
    expect(result1.current.isOpen).toBe(false);

    // Simulate a new hook instance (like a page reload or re-entry)
    // The dismissal flag should persist
    const { result: result2 } = renderHook(() => useTeamsGuide());
    expect(result2.current.isOpen).toBe(false);
  });

  it('respects dismissal flag across multiple sessions', () => {
    const { result: result1 } = renderHook(() => useTeamsGuide());
    expect(result1.current.isOpen).toBe(true);

    // Dismiss the guide (sets localStorage flag)
    act(() => {
      result1.current.onClose();
    });

    // Simulate logout by clearing sessionStorage (but not localStorage)
    sessionStorage.clear();

    // Mock logout state
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isInitializing: false,
    });

    const { result: result2 } = renderHook(() => useTeamsGuide());
    expect(result2.current.isOpen).toBe(false);

    // Simulate new login
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
    });

    // Dismiss flag is still set in localStorage, so guide shouldn't show
    // even though sessionStorage was cleared
    const { result: result3 } = renderHook(() => useTeamsGuide());
    expect(result3.current.isOpen).toBe(false);
  });
});
