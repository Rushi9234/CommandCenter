import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as api from '../services/api';

interface User {
  user_id: string;
  email: string;
  username: string;
  full_name: string;
  role: string;
  impact_score: number;
  streak_count: number;
}

interface RegisterResult {
  email: string;
  username: string;
  is_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<RegisterResult>;
  completeEmailVerification: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Milestone 55: the one place that actually establishes a session
  // (state + localStorage) -- login, register's auto-verify case, and
  // email-verification success all funnel through this instead of each
  // duplicating the same four lines (and, before this milestone,
  // sometimes calling them with values that weren't actually a session).
  const persistSession = (sessionUser: User, sessionToken: string) => {
    setUser(sessionUser);
    setToken(sessionToken);
    localStorage.setItem('token', sessionToken);
    localStorage.setItem('user', JSON.stringify(sessionUser));
  };

  const login = async (email: string, password: string) => {
    const response = await api.login({ email, password });
    const { user, token } = response.data.data;
    persistSession(user, token);
  };

  // Milestone 55: the backend's register() NEVER returns a session --
  // always {email, username, is_verified}, in both the auto-verify and
  // verification-pending cases (confirmed directly against
  // auth.service.ts). The previous implementation here unconditionally
  // destructured {user, token} from that shape, which meant every
  // registration -- not just the production one -- silently stored
  // `undefined` as the session. Fixed by never assuming a session came
  // back: when the account is already verified (dev/AUTO_VERIFY), log the
  // user in for real via the existing login() call; otherwise, return the
  // result so the caller (Register.tsx) can show a "check your email"
  // state instead of navigating anywhere.
  const register = async (data: any): Promise<RegisterResult> => {
    const response = await api.register(data);
    const result: RegisterResult = response.data.data;

    if (result.is_verified) {
      await login(data.email, data.password);
    }

    return result;
  };

  // Milestone 55: POST /auth/verify-email's response shape is identical to
  // login's ({user, token} inside data) -- confirmed against
  // authController.ts's verifyEmail handler -- so verifying an email
  // establishes a real session the exact same way login does.
  const completeEmailVerification = async (token: string) => {
    const response = await api.verifyEmail(token);
    const { user, token: sessionToken } = response.data.data;
    persistSession(user, sessionToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, completeEmailVerification, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
