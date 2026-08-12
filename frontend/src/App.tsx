import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import Navigation from './components/Navigation';
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/pulse" /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/pulse" /> : <Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/pulse"
        element={
          <ProtectedRoute>
            <Navigation />
            <Pulse />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Navigation />
            <Projects />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/teams"
        element={
          <ProtectedRoute>
            <Navigation />
            <Teams />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <Navigation />
            <Goals />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <Navigation />
            <Grid />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <Navigation />
            <SOSHub />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Navigation />
            <ExecutiveBrief />
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
