import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, settingsApi } from '../api/endpoints';
import { setAccessToken } from '../api/client';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user, their effective permissions (fetched from the server)
 * and company branding. `can()` is used across the UI to hide actions the backend
 * would reject anyway — the server remains the source of truth.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);

  const loadCompany = useCallback(async () => {
    try {
      const res = await settingsApi.public();
      setCompany(res.data);
    } catch {
      setCompany({ name: 'EMS' });
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      setPermissions(res.data.permissions || []);
      return res.data;
    } catch {
      setUser(null);
      setPermissions([]);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompany();
    loadSession();
  }, [loadCompany, loadSession]);

  const login = async (credentials) => {
    const res = await authApi.login(credentials);
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setPermissions(res.data.user.permissions || []);
    return res.data.user;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    setPermissions([]);
    window.location.href = '/login';
  };

  const can = useCallback((permission) => {
    if (!permission) return true;
    const list = Array.isArray(permission) ? permission : [permission];
    return list.some((p) => permissions.includes('*') || permissions.includes(p));
  }, [permissions]);

  const hasRole = useCallback((...roles) => !!user && roles.flat().includes(user.role), [user]);

  const value = useMemo(() => ({
    user,
    permissions,
    loading,
    company,
    login,
    logout,
    can,
    hasRole,
    refresh: loadSession,
    isAdmin: !!user && ['super_admin', 'hr_admin', 'hr_manager'].includes(user.role),
    isManager: !!user && ['super_admin', 'hr_admin', 'hr_manager', 'department_manager', 'team_leader'].includes(user.role),
    employeeId: user?.employee?._id || user?.employee || null,
    role: user?.role,
  }), [user, permissions, loading, company, can, hasRole, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
