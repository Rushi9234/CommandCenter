import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import NotificationBell from './NotificationBell';
import Avatar from './common/Avatar';

interface NavigationProps {
  onToggleMobileSidebar?: () => void;
  isMobileSidebarOpen?: boolean;
}

export default function Navigation({ onToggleMobileSidebar, isMobileSidebarOpen }: NavigationProps = {}) {
  const { user, logout } = useAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    if (accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [accountMenuOpen]);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs flex-shrink-0 h-16">
      <div className="px-4 sm:px-6 h-full flex items-center justify-between gap-4">
        {/* Left: Mobile Hamburger Toggle + Mobile Branding */}
        <div className="flex items-center gap-3">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg lg:hidden transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileSidebarOpen}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}

          {/* Mobile Branding (hidden on desktop where Sidebar displays primary branding) */}
          <Link to="/pulse" className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
              <span className="text-white font-bold text-xs">CC</span>
            </div>
            <span className="text-sm font-bold text-gray-900 tracking-tight">CommandCenter</span>
          </Link>
        </div>

        {/* Center: Space for header content / breadcrumbs */}
        <div className="flex-1 hidden md:flex items-center" />

        {/* Right: Notification Bell + User Menu */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div data-tour-target="notifications">
            <NotificationBell />
          </div>

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-2 hover:bg-gray-100 rounded-lg p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              data-tour-target="profile"
            >
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-gray-900 leading-snug">{user?.full_name}</div>
                <div className="text-xs text-gray-500 capitalize leading-none">{user?.role}</div>
              </div>

              <Avatar name={user?.full_name || 'User'} src={user?.avatar_url} size="sm" />
            </button>

            {accountMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <Link
                  to="/profile"
                  onClick={() => setAccountMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  My Profile
                </Link>
                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    logout();
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
