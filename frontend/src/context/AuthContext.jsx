import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('nectartrace_token');
    const storedUser = localStorage.getItem('nectartrace_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Verify token is still valid on mount (if token exists)
  useEffect(() => {
    if (!token) return;

    authApi
      .me()
      .then((res) => {
        setUser(res.data.data);
        localStorage.setItem('nectartrace_user', JSON.stringify(res.data.data));
      })
      .catch(() => {
        // Token invalid — clear
        setToken(null);
        setUser(null);
        localStorage.removeItem('nectartrace_token');
        localStorage.removeItem('nectartrace_user');
      });
  }, [token]);

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
    setUser(null);
    setToken(null);
    localStorage.removeItem('nectartrace_token');
    localStorage.removeItem('nectartrace_user');
  }, []);

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