import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

const STORAGE_KEY = 'quickOverviewDismissed';
const FIRST_VISIT_KEY = 'quickOverviewFirstVisit';

/**
 * Manage walkthrough state and persistence.
 *
 * Strategy: localStorage-based persistence for user-specific "dismiss" state.
 * Shows on first authenticated visit after login/register, then respects
 * user's dismiss preference on subsequent visits.
 *
 * Why localStorage (not backend):
 * - This is a purely local, per-user UX preference
 * - Does not need to sync across devices (unlike user settings)
 * - Avoids unnecessary backend schema/migration for ephemeral UI state
 * - Follows the existing pattern of login/logout tokens already in localStorage
 */
export function useQuickOverview() {
  const { isAuthenticated, isInitializing } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Don't show during auth initialization or if not authenticated
    if (isInitializing || !isAuthenticated) {
      setIsOpen(false);
      return;
    }

    // Check if user has already dismissed the walkthrough
    const isDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (isDismissed) {
      setIsOpen(false);
      return;
    }

    // Check if this is the user's first authenticated visit
    // After logout/login, this flag resets so they see it again if they come back
    const hasSeenFirst = sessionStorage.getItem(FIRST_VISIT_KEY) === 'true';
    if (!hasSeenFirst) {
      setIsOpen(true);
      sessionStorage.setItem(FIRST_VISIT_KEY, 'true');
    }
  }, [isAuthenticated, isInitializing]);

  useEffect(() => {
    const handleReopenEvent = () => {
      localStorage.removeItem(STORAGE_KEY);
      setIsOpen(true);
    };
    window.addEventListener('commandcenter:reopen-tour', handleReopenEvent);
    return () => window.removeEventListener('commandcenter:reopen-tour', handleReopenEvent);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    // Persist the dismissal in localStorage so it doesn't reopen on next visit
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  /**
   * Allow users to reopen the walkthrough from settings or help menu.
   * Dispatches global custom event so the layout instance opens the tour.
   */
  const handleReopenGuide = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsOpen(true);
    window.dispatchEvent(new CustomEvent('commandcenter:reopen-tour'));
  };

  return { isOpen, onClose: handleClose, onReopenGuide: handleReopenGuide };
}
