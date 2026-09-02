import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import * as api from '../services/api';
import { useRealtime } from '../hooks/useRealtime';
import { RealtimeEvent } from '../services/realtime';
import { NOTIFICATION_PREFERENCE_LABELS } from './notificationPreferenceLabels';
import { getNotificationDestination } from './notificationDestination';

// Global header bell -- mounted once inside Navigation.tsx (which itself
// mounts on every authenticated route), so this is the app's single
// notification entry point. Deliberately self-contained: list, mark-read,
// mark-all-read, and preferences all live in one dropdown panel rather
// than a separate settings page, since the full feature is small enough
// that a second route would just be indirection.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<Record<string, boolean> | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // Stale-response/race protection -- same version-token pattern already
  // proven in Teams.tsx/Goals.tsx/SOSHub.tsx: every list-affecting fetch
  // (panel open, realtime-triggered refresh, retry) bumps this and only
  // applies its response if still current, so a slow realtime refresh
  // can't clobber a faster manual one or vice versa.
  const listRequestVersion = useRef(0);
  const inFlight = useRef(false);

  // Lightweight unread-count-only fetch -- used on mount (badge should be
  // accurate even before the user ever opens the panel) and on a realtime
  // event while the panel is closed (no reason to fetch the full list for
  // a closed panel).
  const refreshUnreadCount = async () => {
    try {
      const res = await api.getMyNotifications(1, 0);
      setUnreadCount(res.data.data.unreadCount);
    } catch {
      // Silent -- a failed background badge refresh isn't worth an error
      // state; the next successful fetch (panel open, next realtime
      // event) will correct it. The panel's own loadNotifications has a
      // real error state for when the user is actually looking at it.
    }
  };

  const loadNotifications = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestVersion = ++listRequestVersion.current;
    setListLoading(true);
    setListError('');
    try {
      const res = await api.getMyNotifications(20, 0);
      if (listRequestVersion.current !== requestVersion) return;
      setNotifications(res.data.data.notifications);
      setUnreadCount(res.data.data.unreadCount);
      setHasLoadedOnce(true);
    } catch (error: any) {
      if (listRequestVersion.current !== requestVersion) return;
      setListError(error.response?.data?.error || 'Failed to load notifications');
    } finally {
      inFlight.current = false;
      if (listRequestVersion.current === requestVersion) setListLoading(false);
    }
  };

  useEffect(() => {
    void refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOpen) void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Realtime: notification.created carries no payload beyond who it's for
  // (matching join_request.*'s existing thin shape) -- this is always a
  // narrowly-scoped authoritative refetch, never a client-side guess at
  // what the new notification says. Panel open -> full scoped refresh
  // (reuses the same inFlight/version guard as a manual load, so it can
  // never race a concurrent open/retry). Panel closed -> just the cheap
  // unread-count fetch, no reason to load the full list for a closed
  // panel.
  useRealtime((event: RealtimeEvent) => {
    if (event.type !== 'notification.created') return;
    if (isOpen) void loadNotifications();
    else void refreshUnreadCount();
  });

  // Click-outside and Escape to close -- a genuinely new interaction
  // pattern for this codebase (no existing modal does this; they all
  // close only via an explicit button), but necessary for a dropdown
  // panel anchored to a header icon rather than a full-screen modal.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleMarkRead = async (notificationId: string) => {
    if (markingReadId) return;
    setMarkingReadId(notificationId);
    try {
      await api.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notificationId ? { ...n, read_at: n.read_at || new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Non-fatal -- the item just stays unread; no destructive state to
      // roll back since this is an optimistic local patch after a
      // confirmed server response, not before one.
    } finally {
      setMarkingReadId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    try {
      await api.markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
      setUnreadCount(0);
    } catch {
      // Leave state as-is on failure -- nothing was optimistically
      // changed yet, so there's nothing to revert.
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Guards against a genuine double-click/double-Enter firing navigate()
  // twice in the same tick (before React has a chance to close the panel
  // and unmount the row) -- react-router's navigate() would otherwise push
  // two history entries for the same destination.
  const navigatingRef = useRef(false);

  const handleNotificationClick = (notification: any) => {
    if (navigatingRef.current) return;
    const destination = getNotificationDestination(notification);
    if (!destination) return;

    navigatingRef.current = true;
    // Fire-and-forget: a failed mark-read must never block navigation --
    // the user should still land where they wanted even if this
    // particular network call fails. Only fired for a still-unread
    // notification; handleMarkRead itself already guards against double
    // firing per-row.
    if (!notification.read_at) void handleMarkRead(notification.notification_id);
    setIsOpen(false);

    const query = new URLSearchParams(destination.params).toString();
    navigate(`${destination.path}?${query}`);

    // Released on the next tick -- long enough to absorb a genuine
    // double-click, short enough to never block a legitimate second
    // notification click once the panel (and this row) is gone.
    window.setTimeout(() => {
      navigatingRef.current = false;
    }, 0);
  };

  const handleNotificationKeyDown = (e: React.KeyboardEvent, notification: any) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNotificationClick(notification);
    }
  };

  const openPreferences = async () => {
    setShowPreferences(true);
    if (preferences) return;
    setPreferencesLoading(true);
    setPreferencesError('');
    try {
      const res = await api.getNotificationPreferences();
      setPreferences(res.data.data);
    } catch (error: any) {
      setPreferencesError(error.response?.data?.error || 'Failed to load preferences');
    } finally {
      setPreferencesLoading(false);
    }
  };

  const togglePreference = async (key: string) => {
    if (!preferences || savingPreferenceKey) return;
    const nextValue = !preferences[key];
    setSavingPreferenceKey(key);
    // Server-authoritative: this is a UI convenience, not the source of
    // truth -- the checkbox reflects the confirmed server response, not
    // an assumed-successful local flip, so a failed save never leaves the
    // UI claiming a preference took effect when it didn't.
    try {
      const res = await api.updateNotificationPreferences({ [key]: nextValue });
      setPreferences(res.data.data);
    } catch {
      // Preferences unchanged on failure -- checkbox visually stays at
      // its last confirmed state.
    } finally {
      setSavingPreferenceKey(null);
    }
  };

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6 text-gray-700"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
            {displayCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="pro-card absolute right-0 mt-2 w-80 sm:w-96 max-h-[28rem] overflow-hidden flex flex-col z-50"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => (showPreferences ? setShowPreferences(false) : openPreferences())}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {showPreferences ? 'Back' : 'Settings'}
                </button>
                {!showPreferences && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    disabled={markingAllRead || unreadCount === 0}
                    className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {markingAllRead ? 'Marking...' : 'Mark all read'}
                  </button>
                )}
              </div>
            </div>

            {showPreferences ? (
              <div className="overflow-y-auto p-4 space-y-3">
                {preferencesLoading && !preferences && (
                  <div role="status" className="text-sm text-gray-500 text-center py-6">
                    Loading preferences...
                  </div>
                )}
                {preferencesError && !preferences && (
                  <div role="alert" className="text-sm text-red-600 text-center py-6">
                    {preferencesError}
                  </div>
                )}
                {preferences &&
                  Object.entries(NOTIFICATION_PREFERENCE_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between text-sm text-gray-700 py-1">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={preferences[key] !== false}
                        disabled={savingPreferenceKey === key}
                        onChange={() => togglePreference(key)}
                        aria-label={`${label} notifications`}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                  ))}
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                {listLoading && !hasLoadedOnce && (
                  <div role="status" className="text-sm text-gray-500 text-center py-8">
                    <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                    Loading notifications...
                  </div>
                )}

                {listError && !hasLoadedOnce && (
                  <div role="alert" className="text-sm text-center py-8 px-4">
                    <p className="text-red-600 mb-2">{listError}</p>
                    <button type="button" onClick={loadNotifications} className="btn-secondary text-xs">
                      Retry
                    </button>
                  </div>
                )}

                {hasLoadedOnce && notifications.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-8">You're all caught up -- no notifications yet.</div>
                )}

                {hasLoadedOnce && listError && (
                  <div role="alert" className="text-xs text-red-600 text-center py-2 px-4 border-b border-gray-100">
                    Failed to refresh. Showing the last known notifications.
                  </div>
                )}

                {notifications.map((notification) => {
                  const isUnread = !notification.read_at;
                  const destination = getNotificationDestination(notification);
                  return (
                    <div
                      key={notification.notification_id}
                      role={destination ? 'button' : undefined}
                      tabIndex={destination ? 0 : undefined}
                      onClick={destination ? () => handleNotificationClick(notification) : undefined}
                      onKeyDown={destination ? (e) => handleNotificationKeyDown(e, notification) : undefined}
                      aria-label={destination ? `${notification.title}. ${isUnread ? 'Unread. ' : ''}Open` : undefined}
                      className={`px-4 py-3 border-b border-gray-100 last:border-b-0 ${isUnread ? 'bg-blue-50/50' : ''} ${
                        destination ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isUnread && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" aria-hidden="true" />}
                            <p className="text-sm font-medium text-gray-900 truncate">{notification.title}</p>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{notification.message}</p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkRead(notification.notification_id);
                            }}
                            disabled={markingReadId === notification.notification_id}
                            className="text-[11px] text-blue-600 hover:text-blue-700 disabled:opacity-40 flex-shrink-0"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
