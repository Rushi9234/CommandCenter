import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

const TEAMS_GUIDE_DISMISSED_KEY = 'teamsGuideDismissed';
const TEAMS_GUIDE_FIRST_VISIT_KEY = 'teamsGuideFirstVisit';

/**
 * Manage Teams contextual guide state and persistence.
 *
 * Strategy: localStorage-based persistence for user-specific "dismiss" state.
 * Shows on first meaningful Teams visit (after teams have loaded), then respects
 * user's dismiss preference on subsequent visits.
 *
 * Separate from the global quick overview guide:
 * - Global tour answers "What is CommandCenter?"
 * - Teams guide answers "How do I use Teams?"
 * - Dismissal/completion of one does NOT affect the other
 */
export function useTeamsGuide() {
  const { isAuthenticated, isInitializing } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Don't show during auth initialization or if not authenticated
    if (isInitializing || !isAuthenticated) {
      setIsOpen(false);
      return;
    }

    // Check if user has already dismissed the Teams guide
    const isDismissed = localStorage.getItem(TEAMS_GUIDE_DISMISSED_KEY) === 'true';
    if (isDismissed) {
      setIsOpen(false);
      return;
    }

    // Check if this is the user's first meaningful Teams visit
    // After logout/login, this flag resets so they see it again if they come back
    const hasSeenFirst = sessionStorage.getItem(TEAMS_GUIDE_FIRST_VISIT_KEY) === 'true';
    if (!hasSeenFirst) {
      setIsOpen(true);
      sessionStorage.setItem(TEAMS_GUIDE_FIRST_VISIT_KEY, 'true');
    }
  }, [isAuthenticated, isInitializing]);

  const handleClose = () => {
    setIsOpen(false);
    // Persist the dismissal in localStorage so it doesn't reopen on next visit
    localStorage.setItem(TEAMS_GUIDE_DISMISSED_KEY, 'true');
  };

  /**
   * Allow users to reopen the Teams guide from a button/menu.
   * This is called from the "How to Use Teams" replay button in the Teams page.
   */
  const handleReopenGuide = () => {
    localStorage.removeItem(TEAMS_GUIDE_DISMISSED_KEY);
    setIsOpen(true);
  };

  return { isOpen, onClose: handleClose, onReopenGuide: handleReopenGuide };
}
