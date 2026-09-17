import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import Sidebar from './components/Sidebar';
import SpotlightTour from './components/SpotlightTour';
import { useQuickOverview } from './hooks/useQuickOverview';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import VerifyEmailChange from './pages/VerifyEmailChange';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Pulse from './pages/Pulse';
import Projects from './pages/Projects';
import Teams from './pages/Teams';
import Goals from './pages/Goals';
import Grid from './pages/Grid';
import SOSHub from './pages/SOSHub';
import ExecutiveBrief from './pages/ExecutiveBrief';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import Overview from './pages/Overview';

function RedirectClass() {
  const { classId } = useParams();
  return <Navigate to={`/analytics/classes/${classId}`} replace />;
}

function RedirectClassTeam() {
  const { classId, teamId } = useParams();
  return <Navigate to={`/analytics/classes/${classId}/teams/${teamId}`} replace />;
}

function RedirectClassTeamMember() {
  const { classId, teamId, memberId } = useParams();
  return <Navigate to={`/analytics/classes/${classId}/teams/${teamId}/members/${memberId}`} replace />;
}

export function ProtectedLayoutWithWalkthrough({ children }: { children: React.ReactNode }) {
  const { isOpen, onClose } = useQuickOverview();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route changes
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Close mobile sidebar on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileSidebarOpen]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      <SpotlightTour isOpen={isOpen} onClose={onClose} />
      <Sidebar
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onToggleMobile={() => setMobileSidebarOpen((prev) => !prev)}
      />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 h-screen overflow-hidden">
        <Navigation
          onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
          isMobileSidebarOpen={mobileSidebarOpen}
        />
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) return null;
  return isAuthenticated ? (
    <ProtectedLayoutWithWalkthrough>{children}</ProtectedLayoutWithWalkthrough>
  ) : (
    <Navigate to="/login" />
  );
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) return null;
  return isAuthenticated ? <Navigate to="/pulse" /> : <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/verify-email-change" element={<VerifyEmailChange />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/pulse"
        element={
          <ProtectedRoute>
            <Pulse />
          </ProtectedRoute>
        }
      />

      <Route
        path="/daily-log"
        element={
          <ProtectedRoute>
            <Pulse />
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-activity"
        element={
          <ProtectedRoute>
            <Pulse />
          </ProtectedRoute>
        }
      />

      <Route
        path="/overview"
        element={
          <ProtectedRoute>
            <Overview />
          </ProtectedRoute>
        }
      />

      <Route path="/classes" element={<Navigate to="/analytics" replace />} />
      <Route path="/classes/:classId" element={<RedirectClass />} />
      <Route path="/classes/:classId/teams/:teamId" element={<RedirectClassTeam />} />
      <Route path="/classes/:classId/teams/:teamId/members/:memberId" element={<RedirectClassTeamMember />} />

      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        }
      />

      <Route
        path="/teams"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />

      <Route
        path="/teams/:teamId"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />

      <Route
        path="/teams/:teamId/members/:memberId"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />

      <Route
        path="/classrooms/:teamId"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />

      <Route
        path="/classrooms/:classId/teams/:teamId"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />

      <Route
        path="/classrooms/:classId/teams/:teamId/members/:memberId"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />

      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <Goals />
          </ProtectedRoute>
        }
      />

      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <Grid />
          </ProtectedRoute>
        }
      />

      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <SOSHub />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics/classes/:classId"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics/classes/:classId/teams/:teamId"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics/classes/:classId/teams/:teamId/members/:memberId"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics/teams/:teamId"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics/teams/:teamId/members/:memberId"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics/members/:memberId"
        element={
          <ProtectedRoute>
            <ExecutiveBrief />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/pulse" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
