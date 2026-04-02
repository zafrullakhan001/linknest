import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, User } from '../services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, authMethod?: 'local' | 'ldap', rememberMe?: boolean, ldapServerIndex?: number) => Promise<void>;
  register: (username: string, email: string, password: string, confirmPassword?: string) => Promise<{ pending: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    authService.getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string, authMethod?: 'local' | 'ldap', rememberMe?: boolean, ldapServerIndex?: number) => {
    const user = await authService.login(username, password, authMethod, rememberMe, ldapServerIndex);
    setUser(user);
  };

  const register = async (username: string, email: string, password: string, confirmPassword?: string) => {
    const result = await authService.register(username, email, password, confirmPassword);
    // Don't set user if pending approval
    if (!result.pending) {
      // This shouldn't happen with new approval system, but handle it
      const user = await authService.getCurrentUser();
      setUser(user);
    }
    return result;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    const u = await authService.getCurrentUser();
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      logout,
      refreshUser,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

