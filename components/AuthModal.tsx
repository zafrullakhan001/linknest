import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { SecurePasswordInput } from './SecurePasswordInput';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

// Helper function to extract domain from LDAP base DN
// e.g., "DC=example,DC=com" -> "example.com"
// Also handles: "CN=Users,DC=example,DC=com" -> "example.com"
function extractDomainFromBaseDn(baseDn: string): string | null {
  if (!baseDn) return null;
  
  // Match DC= parts and join them with dots
  // This regex finds all DC= components regardless of position
  const matches = baseDn.match(/DC=([^,]+)/gi);
  if (matches && matches.length > 0) {
    // Extract domain components and join with dots
    const domain = matches
      .map(m => m.replace(/DC=/i, '').trim().toLowerCase())
      .filter(d => d.length > 0)
      .join('.');
    return domain.length > 0 ? domain : null;
  }
  
  return null;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMethod, setAuthMethod] = useState<'local' | 'ldap' | 'auto'>('auto');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [ldapDomain, setLdapDomain] = useState<string | null>(null);
  const [ldapEnabled, setLdapEnabled] = useState(false);
  
  const { login, register } = useAuth();
  const { settings: appSettings } = useSettings();

  // Load settings to check LDAP configuration
  useEffect(() => {
    if (isOpen && mode === 'login') {
      // Reset domain when modal opens to ensure fresh data
      setLdapDomain(null);
      // Determine LDAP enabled from global settings context
      const enabled = String(appSettings.ldap_enabled || '0') === '1';
      setLdapEnabled(enabled);

      // Extract domain from settings if LDAP is enabled
      if (enabled) {
        // 1) Prefer explicit login domain if configured in settings
        let domain: string | null = null;
        const explicit = (appSettings as any).ldap_login_domain as string | undefined;
        if (explicit && explicit.trim().length > 0) {
          domain = explicit.trim().toLowerCase();
        } else {
          // 2) Try ldap_base_dn first, then fall back to ldap_user_search_base
          const baseDn = appSettings.ldap_base_dn || appSettings.ldap_user_search_base || '';
          if (baseDn) {
            domain = extractDomainFromBaseDn(baseDn);
          }
          // 3) If still not found, try to extract from server hostname as fallback
          if (!domain) {
            const server = appSettings.ldap_server || '';
            if (server) {
              const parts = server.split('.');
              if (parts.length >= 2) {
                // Skip first part (hostname), use rest as domain
                domain = parts.slice(1).join('.').toLowerCase();
              }
            }
          }
        }

        setLdapDomain(domain);
      } else {
        setLdapDomain(null);
      }
    } else {
      // Reset when not in login mode
      setLdapEnabled(false);
      setLdapDomain(null);
    }
  }, [isOpen, mode, appSettings]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setEmail('');
      setPassword('');
      setAuthMethod('auto');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        // Determine auth method: 'auto' means try LDAP first, then local
        const method = authMethod === 'auto' ? undefined : authMethod;
        await login(username, password, method);
        onClose();
        setUsername('');
        setEmail('');
        setPassword('');
        setAuthMethod('auto');
      } else {
        const result = await register(username, email, password);
        if (result.pending) {
          setSuccess(result.message || 'Registration successful! Your account is pending admin approval.');
          setUsername('');
          setEmail('');
          setPassword('');
          // Don't close modal, show success message
        } else {
          onClose();
          setUsername('');
          setEmail('');
          setPassword('');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-400 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'login' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Authentication Method
                </label>
                {ldapEnabled && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    LDAP Active
                  </span>
                )}
              </div>
              <select
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value as 'local' | 'ldap' | 'auto')}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="auto">
                  {ldapEnabled ? 'Auto (Try LDAP, then Local)' : 'Auto (Local Only)'}
                </option>
                <option value="ldap" disabled={!ldapEnabled}>
                  {ldapDomain
                    ? ldapEnabled
                      ? `LDAP (${ldapDomain})`
                      : `LDAP (${ldapDomain}) - Disabled`
                    : ldapEnabled
                      ? 'LDAP'
                      : 'LDAP (Disabled)'}
                </option>
                <option value="local">Local Account</option>
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Enter your username"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter your email"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Password
            </label>
            <SecurePasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 6 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-brand-500/20"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setSuccess('');
              setAuthMethod('auto');
            }}
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            {mode === 'login' 
              ? "Don't have an account? Sign up" 
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

