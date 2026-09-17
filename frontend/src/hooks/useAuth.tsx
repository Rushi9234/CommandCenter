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
  avatar_url?: string;
  avatar_key?: string;
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
  updateUser: (fields: Partial<User>) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isInitializing: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsInitializing(false);
  }, []);

  const persistSession = (sessionUser: User, sessionToken: string) => {
    setUser(sessionUser);
    setToken(sessionToken);
    localStorage.setItem('token', sessionToken);
    localStorage.setItem('user', JSON.stringify(sessionUser));
  };

  const updateUser = (fields: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...fields };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  const login = async (email: string, password: string) => {
    const response = await api.login({ email, password });
    const { user, token } = response.data.data;
    persistSession(user, token);
  };

  const register = async (data: any): Promise<RegisterResult> => {
    const response = await api.register(data);
    const result: RegisterResult = response.data.data;

    if (result.is_verified) {
      await login(data.email, data.password);
    }

    return result;
  };

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
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        completeEmailVerification,
        updateUser,
        logout,
        isAuthenticated: !!token,
        isInitializing,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
