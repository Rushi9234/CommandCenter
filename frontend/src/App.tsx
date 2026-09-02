import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import Sidebar from './components/Sidebar';
import SpotlightTour from './components/SpotlightTour';
import { useQuickOverview } from './hooks/useQuickOverview';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
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

// Milestone: on a hard refresh, useAuth's token is briefly null before its
// own effect reads localStorage (see useAuth.tsx). Deciding isAuthenticated
// during that gap used to redirect an already logged-in user to /login,
// which then immediately redirected on to /pulse once the real token
// showed up -- silently losing whatever route (e.g. /teams) they refreshed
// on. Rendering nothing until isInitializing clears avoids acting on that
// transient value.
function ProtectedLayoutWithWalkthrough({ children }: { children: React.ReactNode }) {
  const { isOpen, onClose } = useQuickOverview();
  return (
    <div className="flex flex-col h-screen">
      <SpotlightTour isOpen={isOpen} onClose={onClose} />
      <Sidebar />
      <Navigation />
      <main className="flex-1 overflow-auto lg:ml-64">
        {children}
      </main>
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
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
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
