import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useQuickOverview } from '../hooks/useQuickOverview';

interface NavSection {
  title?: string;
  items: Array<{
    path: string;
    label: string;
    tourTarget?: string;
    isButton?: boolean;
  }>;
}

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const { onReopenGuide } = useQuickOverview();
  const [isOpen, setIsOpen] = useState(true);

  const navSections: NavSection[] = [
    {
      title: 'Primary',
      items: [
        { path: '/pulse', label: 'Pulse', tourTarget: 'pulse' },
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
        { path: '#chat', label: 'Chat' },
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

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Sidebar Toggle Button (Mobile) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-60 lg:hidden bg-white border border-gray-200 rounded-lg p-2 hover:bg-gray-50"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay for Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-40 ${
          isOpen ? 'w-64' : 'w-0 -ml-64'
        } lg:w-64 lg:ml-0 lg:translate-x-0 overflow-hidden`}
      >
        <div className="h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200">
            <Link to="/pulse" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">CC</span>
              </div>
              <span className="text-sm font-bold text-gray-900">CommandCenter</span>
            </Link>
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
            {navSections.map((section, idx) => (
              <div key={idx}>
                {section.title && (
                  <h3 className="px-3 mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
                            if (window.innerWidth < 1024) setIsOpen(false);
                          }}
                          className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:bg-gray-100"
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
                          if (window.innerWidth < 1024) setIsOpen(false);
                        }}
                        className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isDisabled
                            ? 'text-gray-400 cursor-not-allowed'
                            : active
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer - User Info */}
          <div className="p-4 border-t border-gray-200">
            <div className="px-3 py-2 text-xs">
              <div className="font-medium text-gray-900">{user?.full_name}</div>
              <div className="text-gray-500 capitalize">{user?.role}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
