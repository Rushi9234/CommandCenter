import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useQuickOverview } from '../hooks/useQuickOverview';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';

interface NavSection {
  title?: string;
  items: Array<{
    path: string;
    label: string;
    tourTarget?: string;
    isButton?: boolean;
    badge?: number;
  }>;
}

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onToggleMobile?: () => void;
}

export default function Sidebar({ isOpenMobile, onCloseMobile, onToggleMobile }: SidebarProps = {}) {
  const location = useLocation();
  const { user } = useAuth();
  const { onReopenGuide } = useQuickOverview();
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const chatUnreadCount = useChatUnreadCount();

  const isControlled = isOpenMobile !== undefined;
  const isMobileOpen = isControlled ? isOpenMobile : internalIsOpen;

  const handleCloseMobile = () => {
    if (onCloseMobile) {
      onCloseMobile();
    }
    setInternalIsOpen(false);
  };

  const handleToggleMobile = () => {
    if (onToggleMobile) {
      onToggleMobile();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  const navSections: NavSection[] = [
    {
      title: 'Primary',
      items: [
        { path: '/overview', label: 'Overview', tourTarget: 'overview' },
        { path: '/pulse', label: 'Work Activity', tourTarget: 'pulse' },
        { path: '/goals', label: 'Goals', tourTarget: 'goals' },
        { path: '/projects', label: 'Projects', tourTarget: 'projects' },
        { path: '/teams', label: 'Teams', tourTarget: 'teams' },
        { path: '/help', label: 'SOS Hub', tourTarget: 'sos-hub' },
        { path: '/leaderboard', label: 'Leaderboard', tourTarget: 'leaderboard' },
        { path: '/analytics', label: 'Analytics', tourTarget: 'analytics' },
      ],
    },
    {
      title: 'Workspace',
      items: [
        { path: '/chat', label: 'Chat', tourTarget: 'chat', badge: chatUnreadCount > 0 ? chatUnreadCount : undefined },
      ],
    },
    {
      title: 'Help',
      items: [
        { path: '#how-to-use', label: 'How to Use', isButton: true },
        { path: '#help-center', label: 'Help Center' },
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === '/analytics') {
      return location.pathname.startsWith('/analytics');
    }
    if (path === '/overview') {
      return location.pathname === '/overview';
    }
    if (path === '/teams') {
      return location.pathname.startsWith('/teams/') || location.pathname.startsWith('/classrooms/');
    }
    return location.pathname === path;
  };

  return (
    <>
      {/* Standalone Sidebar Toggle Button for standalone test / un-parented rendering */}
      {!isControlled && (
        <button
          onClick={handleToggleMobile}
          className="fixed top-4 left-4 z-50 lg:hidden bg-white border border-gray-200 rounded-lg p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Backdrop for Mobile Drawer */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-200"
          onClick={handleCloseMobile}
          aria-hidden="true"
          data-testid="sidebar-backdrop"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed left-0 top-0 bottom-0 h-screen bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out z-50 w-64 ${
          isMobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        } lg:translate-x-0 lg:shadow-none overflow-hidden`}
        aria-label="Sidebar navigation"
      >
        <div className="h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <Link to="/pulse" onClick={handleCloseMobile} className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
                <span className="text-white font-bold text-xs">CC</span>
              </div>
              <span className="text-sm font-bold text-gray-900 tracking-tight">CommandCenter</span>
            </Link>

            {/* Close Button for Mobile Drawer */}
            <button
              onClick={handleCloseMobile}
              className="lg:hidden text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            {navSections.map((section, idx) => (
              <div key={idx}>
                {section.title && (
                  <h3 className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {section.title}
                  </h3>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const active = isActive(item.path);
                    const isDisabled = item.path.startsWith('#') && !item.isButton;

                    if (item.isButton) {
                      return (
                        <button
                          key={item.path}
                          onClick={() => {
                            if (item.path === '#how-to-use') {
                              onReopenGuide();
                            }
                            handleCloseMobile();
                          }}
                          className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {item.label}
                        </button>
                      );
                    }

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        data-tour-target={item.tourTarget}
                        onClick={(e) => {
                          if (isDisabled) e.preventDefault();
                          handleCloseMobile();
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDisabled
                            ? 'text-gray-400 cursor-not-allowed'
                            : active
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span>{item.label}</span>
                        {!!item.badge && (
                          <span
                            aria-label={`${item.badge} unread`}
                            className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-semibold"
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer - User Info */}
          <div className="p-4 border-t border-gray-200 bg-gray-50/50">
            <div className="px-3 py-2 text-xs">
              <div className="font-semibold text-gray-900 truncate">{user?.full_name}</div>
              <div className="text-gray-500 capitalize">{user?.role}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
