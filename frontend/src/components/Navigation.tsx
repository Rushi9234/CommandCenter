import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import NotificationBell from './NotificationBell';

export default function Navigation() {
  const { user, logout } = useAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="px-6 h-16 flex items-center justify-between">
        {/* Left: Branding (mostly for mobile, sidebar has it on desktop) */}
        <Link to="/pulse" className="flex items-center gap-2 lg:hidden">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">CC</span>
          </div>
          <span className="text-sm font-bold text-gray-900">CC</span>
        </Link>

        {/* Center: Space for global search (placeholder) */}
        <div className="flex-1 hidden md:flex justify-center" />

        {/* Right: Notification Bell + User Menu */}
        <div className="flex items-center gap-4">
          <div data-tour-target="notifications">
            <NotificationBell />
          </div>

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-2 hover:bg-gray-100 rounded-lg p-2 transition-colors"
              aria-label="Account menu"
              data-tour-target="profile"
            >
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-gray-900">{user?.full_name}</div>
                <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
              </div>

              <div className="avatar w-10 h-10 text-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                {getInitials(user?.full_name || 'User')}
              </div>
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
