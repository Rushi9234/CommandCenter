import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useRealtime, RealtimeEvent } from './useRealtime';
import * as api from '../services/api';
import { getNotificationDestination, NotificationDestination } from '../components/notificationDestination';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'notification';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  category?: string;
  duration?: number; // ms, 0 for sticky
  action?: ToastAction;
  destination?: NotificationDestination | null;
  createdAt: number;
}

export interface ShowToastOptions {
  id?: string;
  title?: string;
  message: string;
  type?: ToastType;
  category?: string;
  duration?: number;
  action?: ToastAction;
  destination?: NotificationDestination | null;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (options: ShowToastOptions | string) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  success: (message: string, title?: string, duration?: number) => string;
  error: (message: string, title?: string, duration?: number) => string;
  warning: (message: string, title?: string, duration?: number) => string;
  info: (message: string, title?: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { user } = useAuth();
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const initialFetchDone = useRef(false);

  // Initialize latest notification on mount so we only toast NEW incoming events
  useEffect(() => {
    if (!user) {
      initialFetchDone.current = false;
      seenNotificationIds.current.clear();
      return;
    }

    let isMounted = true;
    api
      .getMyNotifications(5, 0)
      .then((res) => {
        if (!isMounted) return;
        const initial = res.data?.data?.notifications || [];
        initial.forEach((n: any) => {
          if (n?.notification_id) seenNotificationIds.current.add(n.notification_id);
        });
        initialFetchDone.current = true;
      })
      .catch(() => {
        if (isMounted) initialFetchDone.current = true;
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (options: ShowToastOptions | string): string => {
      const opts: ShowToastOptions = typeof options === 'string' ? { message: options } : options;
      const id = opts.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = opts.duration !== undefined ? opts.duration : 5000;
      const type = opts.type || 'info';

      const newToast: ToastItem = {
        id,
        type,
        title: opts.title,
        message: opts.message,
        category: opts.category,
        duration,
        action: opts.action,
        destination: opts.destination,
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        // Prevent duplicate IDs
        const filtered = prev.filter((t) => t.id !== id);
        // Keep max 5 visible toasts to avoid overwhelming viewport
        if (filtered.length >= 5) {
          filtered.shift();
        }
        return [...filtered, newToast];
      });

      return id;
    },
    []
  );

  const success = useCallback(
    (message: string, title?: string, duration?: number) =>
      showToast({ message, title, type: 'success', duration }),
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string, duration?: number) =>
      showToast({ message, title, type: 'error', duration: duration || 7000 }),
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string, duration?: number) =>
      showToast({ message, title, type: 'warning', duration }),
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string, duration?: number) =>
      showToast({ message, title, type: 'info', duration }),
    [showToast]
  );

  // Subscribe to realtime notification events
  useRealtime(
    useCallback(
      (event: RealtimeEvent) => {
        if (!user) return;

        if (event.type === 'notification.created') {
          // Authoritatively fetch newest notifications
          api
            .getMyNotifications(3, 0)
            .then((res) => {
              const notifs = res.data?.data?.notifications || [];
              for (const notif of notifs) {
                if (!notif?.notification_id) continue;
                if (!seenNotificationIds.current.has(notif.notification_id)) {
                  seenNotificationIds.current.add(notif.notification_id);

                  // Calculate deep-link destination
                  const destination = getNotificationDestination(notif);

                  showToast({
                    id: `notif-${notif.notification_id}`,
                    type: 'notification',
                    title: notif.title || 'New Notification',
                    message: notif.message,
                    category: notif.category,
                    duration: 6500,
                    destination,
                  });
                }
              }
            })
            .catch(() => {
              // Non-fatal background fetch
            });
        }
      },
      [user, showToast]
    )
  );

  useEffect(() => {
    const handleCustomToast = (e: any) => {
      if (e?.detail) {
        showToast(e.detail);
      }
    };
    window.addEventListener('commandcenter:toast', handleCustomToast);
    return () => window.removeEventListener('commandcenter:toast', handleCustomToast);
  }, [showToast]);

  const value = {
    toasts,
    showToast,
    dismissToast,
    clearToasts,
    success,
    error,
    warning,
    info,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      showToast: () => '',
      dismissToast: () => {},
      clearToasts: () => {},
      success: () => '',
      error: () => '',
      warning: () => '',
      info: () => '',
    };
  }
  return context;
};
