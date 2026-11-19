import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);

function getInitialAuth() {
  const storedToken = localStorage.getItem('nectartrace_token');
  const storedUser = localStorage.getItem('nectartrace_user');

  if (!storedToken || !storedUser) {
    return { token: storedToken, user: null };
  }

  try {
    const user = JSON.parse(storedUser);
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      throw new Error('Invalid cached user');
    }
    return { token: storedToken, user };
  } catch {
    localStorage.removeItem('nectartrace_token');
    localStorage.removeItem('nectartrace_user');
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [auth] = useState(getInitialAuth);
  const [user, setUser] = useState(auth.user);
  const [token, setToken] = useState(auth.token);
  const [loading] = useState(false);

  const clearSession = useCallback(() => {
    void queryClient.cancelQueries();
    queryClient.clear();
    setToken(null);
    setUser(null);
    localStorage.removeItem('nectartrace_token');
    localStorage.removeItem('nectartrace_user');
  }, [queryClient]);

  // Verify token is still valid on mount (if token exists)
  useEffect(() => {
    if (!token) return;

    let active = true;

    authApi
      .me()
      .then((res) => {
        if (!active) return;
        setUser(res.data.data);
        localStorage.setItem('nectartrace_user', JSON.stringify(res.data.data));
      })
      .catch(() => {
        if (active) clearSession();
      });

    return () => {
      active = false;
    };
  }, [clearSession, token]);

  const login = useCallback(async (phone, password) => {
    const res = await authApi.login({ phone, password });
    const { user: userData, token: newToken } = res.data.data;

    setUser(userData);
    setToken(newToken);
    localStorage.setItem('nectartrace_token', newToken);
    localStorage.setItem('nectartrace_user', JSON.stringify(userData));

    return userData;
  }, []);

  const register = useCallback(async (data) => {
    const res = await authApi.register(data);
    const { user: userData, token: newToken } = res.data.data;

    setUser(userData);
    setToken(newToken);
    localStorage.setItem('nectartrace_token', newToken);
    localStorage.setItem('nectartrace_user', JSON.stringify(userData));

    return userData;
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
