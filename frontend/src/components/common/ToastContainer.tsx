import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast, ToastItem } from '../../hooks/useToast';

export function getCategoryBadge(category?: string): { label: string; icon: string; badgeClass: string } {
  if (!category) return { label: 'Notification', icon: '🔔', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  if (category.startsWith('blocker.')) return { label: 'Blocker Alert', icon: '🚨', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (category.startsWith('goal.')) return { label: 'Goal Update', icon: '🎯', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (category.startsWith('team.')) return { label: 'Team Activity', icon: '👥', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (category.startsWith('task.')) return { label: 'Task Update', icon: '📋', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' };
  if (category.startsWith('chat.')) return { label: 'New Message', icon: '💬', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (category.startsWith('project.')) return { label: 'Project Update', icon: '📁', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (category.startsWith('guidance')) return { label: 'Guidance', icon: '💡', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' };
  if (category.startsWith('support.')) return { label: 'Support Ticket', icon: '🎫', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' };
  if (category.includes('password') || category.includes('email') || category.includes('auth')) {
    return { label: 'Security Alert', icon: '🛡️', badgeClass: 'bg-red-50 text-red-700 border-red-200' };
  }
  return { label: 'Notification', icon: '🔔', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
}

const ToastCard = React.forwardRef<
  HTMLDivElement,
  {
    toast: ToastItem;
    onDismiss: (id: string) => void;
  }
>(({ toast, onDismiss }, ref) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const remainingTimeRef = useRef(toast.duration || 5000);
  const lastTickRef = useRef(Date.now());

  const duration = toast.duration !== undefined ? toast.duration : 5000;
  const isAutoDismissing = duration > 0;

  useEffect(() => {
    if (!isAutoDismissing) return;

    remainingTimeRef.current = duration;
    lastTickRef.current = Date.now();

    const interval = window.setInterval(() => {
      if (isHovered) {
        lastTickRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      const pct = Math.max(0, (remainingTimeRef.current / duration) * 100);
      setProgress(pct);

      if (remainingTimeRef.current <= 0) {
        window.clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);

    return () => {
      window.clearInterval(interval);
    };
  }, [duration, isAutoDismissing, isHovered, onDismiss, toast.id]);

  const handleAction = () => {
    if (toast.action) {
      toast.action.onClick();
      onDismiss(toast.id);
      return;
    }

    if (toast.destination) {
      const url = toast.destination.params && Object.keys(toast.destination.params).length > 0
        ? `${toast.destination.path}?${new URLSearchParams(toast.destination.params).toString()}`
        : toast.destination.path;
      navigate(url);
      onDismiss(toast.id);
    }
  };

  // Type styling
  const typeStyles = {
    success: {
      border: 'border-emerald-300 dark:border-emerald-800',
      accent: 'bg-emerald-500',
      iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
      progressBar: 'bg-emerald-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ),
      defaultTitle: 'Success',
    },
    error: {
      border: 'border-rose-300 dark:border-rose-800',
      accent: 'bg-rose-500',
      iconBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
      progressBar: 'bg-rose-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      defaultTitle: 'Error',
    },
    warning: {
      border: 'border-amber-300 dark:border-amber-800',
      accent: 'bg-amber-500',
      iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
      progressBar: 'bg-amber-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      defaultTitle: 'Warning',
    },
    info: {
      border: 'border-blue-300 dark:border-blue-800',
      accent: 'bg-blue-500',
      iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
      progressBar: 'bg-blue-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      defaultTitle: 'Information',
    },
    notification: {
      border: 'border-indigo-300 dark:border-indigo-800',
      accent: 'bg-indigo-600',
      iconBg: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
      progressBar: 'bg-indigo-600',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      defaultTitle: 'New Notification',
    },
  }[toast.type];

  const categoryBadge = toast.type === 'notification' ? getCategoryBadge(toast.category) : null;
  const title = toast.title || typeStyles.defaultTitle;
  const hasAction = Boolean(toast.action || toast.destination);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="status"
      aria-live="polite"
      className={`relative w-full max-w-sm sm:max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-xl border ${typeStyles.border} overflow-hidden pointer-events-auto transition-shadow hover:shadow-2xl`}
    >
      <div className="flex items-start p-3.5 gap-3">
        {/* Type / Category Icon */}
        <div className={`p-2 rounded-lg flex-shrink-0 ${typeStyles.iconBg}`}>
          {categoryBadge ? <span className="text-base select-none">{categoryBadge.icon}</span> : typeStyles.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
              {title}
            </h4>

            {categoryBadge && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${categoryBadge.badgeClass}`}
              >
                {categoryBadge.label}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed break-words line-clamp-3">
            {toast.message}
          </p>

          {/* Action Button */}
          {hasAction && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAction}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-md text-xs font-medium shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {toast.action ? toast.action.label : 'View Details'}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          aria-label="Dismiss notification"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Countdown Progress Bar */}
      {isAutoDismissing && (
        <div className="w-full bg-gray-100 dark:bg-slate-800 h-1 overflow-hidden">
          <div
            className={`h-full ${typeStyles.progressBar} transition-all duration-75 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  );
});

ToastCard.displayName = 'ToastCard';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast, clearToasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-2 left-2 sm:left-auto sm:right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-auto sm:w-full pointer-events-none px-2 sm:px-0"
    >
      {toasts.length > 2 && (
        <div className="flex justify-end pointer-events-auto">
          <button
            type="button"
            onClick={clearToasts}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-800 shadow-xs transition-colors"
          >
            Clear all ({toasts.length})
          </button>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </AnimatePresence>
    </div>
  );
};
