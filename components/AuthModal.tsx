import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { SecurePasswordInput } from './SecurePasswordInput';
import { PasswordCriteriaList } from './PasswordCriteriaList';
import { validatePassword } from '../services/passwordValidation';

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

type AuthState = 'idle' | 'connecting' | 'ldap_attempting' | 'ldap_authenticating' | 'local_authenticating' | 'success';
type AuthMethodChoice = 'local' | 'ldap' | 'auto' | 'saml';

const AUTH_METHOD_STORAGE_KEY = 'linknest_preferred_auth_method';
const LDAP_SERVER_STORAGE_KEY = 'linknest_preferred_ldap_server_index';

const VALID_AUTH_METHODS: AuthMethodChoice[] = ['local', 'ldap', 'auto', 'saml'];

function readStoredAuthMethod(): AuthMethodChoice | null {
  try {
    const stored = localStorage.getItem(AUTH_METHOD_STORAGE_KEY);
    if (stored && VALID_AUTH_METHODS.includes(stored as AuthMethodChoice)) {
      return stored as AuthMethodChoice;
    }
  } catch {
    // ignore storage errors (private mode, blocked storage, etc.)
  }
  return null;
}

function writeStoredAuthMethod(method: AuthMethodChoice): void {
  try {
    localStorage.setItem(AUTH_METHOD_STORAGE_KEY, method);
  } catch {
    // ignore storage errors
  }
}

function readStoredLdapServerIndex(): number | null {
  try {
    const stored = localStorage.getItem(LDAP_SERVER_STORAGE_KEY);
    if (stored === null) return null;
    const index = parseInt(stored, 10);
    return Number.isFinite(index) && index >= 0 ? index : null;
  } catch {
    return null;
  }
}

function writeStoredLdapServerIndex(index: number): void {
  try {
    localStorage.setItem(LDAP_SERVER_STORAGE_KEY, String(index));
  } catch {
    // ignore storage errors
  }
}

function isAuthMethodAvailable(
  method: AuthMethodChoice,
  ldapOn: boolean,
  localOn: boolean,
  samlOn: boolean
): boolean {
  switch (method) {
    case 'auto':
      return ldapOn && localOn;
    case 'ldap':
      return ldapOn;
    case 'local':
      return localOn;
    case 'saml':
      return samlOn;
    default:
      return false;
  }
}

function resolveDefaultAuthMethod(ldapOn: boolean, localOn: boolean, samlOn: boolean): AuthMethodChoice {
  if (ldapOn && localOn) return 'auto';
  if (samlOn && !localOn && !ldapOn) return 'saml';
  if (ldapOn && !localOn) return 'ldap';
  if (localOn) return 'local';
  if (samlOn) return 'saml';
  return 'local';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethodChoice>(() => readStoredAuthMethod() ?? 'auto');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [ldapDomain, setLdapDomain] = useState<string | null>(null);
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapServers, setLdapServers] = useState<Array<{ name: string; server: string; login_domain?: string }>>([]);
  const [selectedLdapServerIndex, setSelectedLdapServerIndex] = useState<number>(() => readStoredLdapServerIndex() ?? 0);
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(30);
  const [currentMethod, setCurrentMethod] = useState<'ldap' | 'local' | null>(null);
  const [showHelpInfo, setShowHelpInfo] = useState(false);
  const [showPasswordResetInfo, setShowPasswordResetInfo] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { login, register } = useAuth();
  const { settings: appSettings, loading: settingsLoading } = useSettings();

  // Load settings to check LDAP configuration
  useEffect(() => {
    if (isOpen && mode === 'login') {
      // Reset domain when modal opens to ensure fresh data
      setLdapDomain(null);
      // Determine LDAP enabled from global settings context
      // Explicitly check for '0', empty string, null, undefined, or false
      const ldapEnabledSetting = appSettings.ldap_enabled;
      const enabled = ldapEnabledSetting === '1' || ldapEnabledSetting === 1 || ldapEnabledSetting === true;
      setLdapEnabled(enabled);
      
      // Determine SAML enabled from global settings context
      const samlEnabledValue = String(appSettings.saml_enabled || '0') === '1';
      setSamlEnabled(samlEnabledValue);
      
      // Determine local auth enabled from global settings context
      const localAuthEnabledValue = String(appSettings.local_auth_enabled || '1') === '1';
      setLocalAuthEnabled(localAuthEnabledValue);

      // Prefer last-used auth method from browser storage when still available
      const storedMethod = readStoredAuthMethod();
      const preferredMethod = storedMethod && isAuthMethodAvailable(storedMethod, enabled, localAuthEnabledValue, samlEnabledValue)
        ? storedMethod
        : resolveDefaultAuthMethod(enabled, localAuthEnabledValue, samlEnabledValue);

      if (!isAuthMethodAvailable(authMethod, enabled, localAuthEnabledValue, samlEnabledValue)) {
        setAuthMethod(preferredMethod);
      } else if (storedMethod && storedMethod !== authMethod && isAuthMethodAvailable(storedMethod, enabled, localAuthEnabledValue, samlEnabledValue)) {
        setAuthMethod(storedMethod);
      }

      // Load LDAP servers list if LDAP is enabled
      if (enabled) {
        // Check for new multi-server format
        const ldapServersJson = (appSettings as any).ldap_servers as string | undefined;
        let servers: Array<{ name: string; server: string; login_domain?: string }> = [];
        
        if (ldapServersJson) {
          try {
            const parsed = JSON.parse(ldapServersJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              servers = parsed.map((s: any) => ({
                name: s.name || s.server || 'LDAP Server',
                server: s.server || '',
                login_domain: s.login_domain || ''
              }));
            }
          } catch (e) {
            console.error('Failed to parse LDAP servers:', e);
          }
        }
        
        // Fallback to old single-server format
        if (servers.length === 0) {
          const server = appSettings.ldap_server || '';
          if (server) {
            const loginDomain = (appSettings as any).ldap_login_domain as string | undefined;
            servers = [{
              name: loginDomain || server,
              server: server,
              login_domain: loginDomain || ''
            }];
          }
        }
        
        setLdapServers(servers);

        const storedLdapIndex = readStoredLdapServerIndex();
        const restoredIndex =
          storedLdapIndex !== null && storedLdapIndex < servers.length
            ? storedLdapIndex
            : 0;
        setSelectedLdapServerIndex(restoredIndex);
        
        // Extract domain from first server for display
        if (servers.length > 0) {
          const firstServer = servers[0];
          let domain: string | null = null;
          
          if (firstServer.login_domain) {
            domain = firstServer.login_domain.toLowerCase();
          } else {
            // Try to extract from base DN
            const baseDn = appSettings.ldap_base_dn || appSettings.ldap_user_search_base || '';
            if (baseDn) {
              domain = extractDomainFromBaseDn(baseDn);
            }
            // If still not found, try to extract from server hostname
            if (!domain && firstServer.server) {
              const parts = firstServer.server.split('.');
              if (parts.length >= 2) {
                domain = parts.slice(1).join('.').toLowerCase();
              }
            }
          }
          
          setLdapDomain(domain);
        } else {
          setLdapDomain(null);
        }
      } else {
        setLdapServers([]);
        setLdapDomain(null);
      }
    } else {
      // Reset when not in login mode
      setLdapEnabled(false);
      setLdapDomain(null);
    }
  }, [isOpen, mode, appSettings]);

  // Reset form when modal closes (keep preferred auth method / LDAP server in state + localStorage)
  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setRememberMe(false);
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  const selectAuthMethod = (method: AuthMethodChoice) => {
    setAuthMethod(method);
    writeStoredAuthMethod(method);
  };

  const selectLdapServerIndex = (index: number) => {
    setSelectedLdapServerIndex(index);
    writeStoredLdapServerIndex(index);
  };
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

  // Progress bar animation effect
  useEffect(() => {
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Only start animation for active authentication states
    if (authState === 'connecting' || authState === 'ldap_attempting' || authState === 'ldap_authenticating' || authState === 'local_authenticating') {
      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev; // Cap at 90% until authentication completes
          return prev + 2;
        });
      }, 150);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [authState]);

  // Countdown timer effect
  useEffect(() => {
    // Clear any existing timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (authState === 'ldap_attempting' || authState === 'ldap_authenticating') {
      // Reset countdown when starting LDAP authentication
      setCountdown(30);

      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [authState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Handle SAML login separately
    if (mode === 'login' && authMethod === 'saml') {
      const API_BASE = import.meta.env.VITE_API_BASE || '/api';
      window.location.href = `${API_BASE}/saml?action=login`;
      return;
    }
    
    setLoading(true);
    setProgress(0);
    setCountdown(30);

    try {
      if (mode === 'login') {
        // Determine auth method: 'auto' means try LDAP first, then local
        const method = authMethod === 'auto' ? undefined : authMethod;

        // Set initial state based on method
        if (method === 'ldap' || (method === undefined && ldapEnabled)) {
          setAuthState('connecting');
          setCurrentMethod('ldap');

          // Brief delay to show connecting state
          await new Promise(resolve => setTimeout(resolve, 300));

          setAuthState('ldap_attempting');

          // Set up timeout for LDAP attempt (30 seconds)
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('LDAP_TIMEOUT')), 30000)
          );

          try {
            // Try login with timeout - pass selected LDAP server index if LDAP method
            const ldapServerIndex = (method === 'ldap' || (method === undefined && ldapEnabled)) ? selectedLdapServerIndex : undefined;
            await Promise.race([
              login(username, password, method === 'ldap' ? 'ldap' : undefined, rememberMe, ldapServerIndex),
              timeoutPromise
            ]);

            // Success
            setAuthState('success');
            setProgress(100);
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (err: any) {
            // If timeout or LDAP error and in auto mode, try local
            if ((err.message === 'LDAP_TIMEOUT' || err.message?.includes('LDAP') || err.message?.includes('timeout')) && method === undefined) {
              setAuthState('local_authenticating');
              setCurrentMethod('local');
              setProgress(50); // Reset progress

              // Try local authentication (no LDAP server index needed)
              await login(username, password, 'local', rememberMe, undefined);
              setAuthState('success');
              setProgress(100);
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              // Re-throw error for error handling
              throw err;
            }
          }
        } else {
          // Direct local authentication
          setAuthState('local_authenticating');
          setCurrentMethod('local');
          await login(username, password, 'local', rememberMe, undefined);
          setAuthState('success');
          setProgress(100);
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        onClose();
        setUsername('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setRememberMe(false);
        setAuthState('idle');
        setProgress(0);
        setCurrentMethod(null);
      } else {
        // Register: validate username, password strength and confirmation
        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 3) {
          setError('Username must be at least 3 characters');
          setLoading(false);
          return;
        }
        const pwValidation = validatePassword(password);
        if (!pwValidation.valid) {
          setError(pwValidation.message || 'Invalid password');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Password and confirmation do not match');
          setLoading(false);
          return;
        }
        setAuthState('connecting');
        const result = await register(trimmedUsername, email, password, confirmPassword);
        if (result.pending) {
          setSuccess(result.message || 'Registration successful! Your account is pending admin approval.');
          setUsername('');
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          // Don't close modal, show success message
        } else {
          onClose();
          setUsername('');
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        }
        setAuthState('idle');
        setProgress(0);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setAuthState('idle');
      setProgress(0);
      setCurrentMethod(null);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const methodCardBase =
    'relative flex flex-col items-center justify-center p-2 sm:p-3.5 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md min-w-0';
  const methodCardSelected =
    'auth-method-card-selected border-brand-500 bg-gradient-to-br from-brand-50 to-violet-50 dark:from-brand-900/30 dark:to-violet-900/20 dark:border-brand-400 shadow-md shadow-brand-500/15 ring-2 ring-brand-500/20';
  const methodCardIdle =
    'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600 bg-white dark:bg-slate-800/80';

  const authMethodCount =
    (ldapEnabled && localAuthEnabled ? 1 : 0) +
    (ldapEnabled ? 1 : 0) +
    (localAuthEnabled ? 1 : 0) +
    (samlEnabled ? 1 : 0);
  const authMethodGridClass =
    authMethodCount >= 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : authMethodCount === 3
        ? 'grid-cols-3'
        : authMethodCount === 2
          ? 'grid-cols-2'
          : 'grid-cols-1';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
      <div
        className="auth-modal-backdrop absolute inset-0 bg-slate-900/65 dark:bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="auth-modal-panel relative w-full max-w-md sm:max-w-2xl max-h-[95vh] overflow-y-auto scrollbar-hide rounded-2xl sm:rounded-3xl border border-white/40 dark:border-slate-600/60 shadow-2xl shadow-brand-900/20 bg-white dark:bg-slate-800">
        {/* Soft faded brand wash — short height, fades quickly into the card */}
        <div className="auth-modal-wash pointer-events-none absolute inset-x-0 top-0 h-16 sm:h-20 overflow-hidden rounded-t-2xl sm:rounded-t-3xl">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-400/45 via-brand-300/20 to-transparent dark:from-brand-500/35 dark:via-brand-600/15 dark:to-transparent" />
          <div className="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-violet-300/20 blur-2xl" />
          <div className="absolute top-4 -left-8 w-24 h-24 rounded-full bg-sky-300/15 blur-2xl" />
        </div>

        <div className="relative p-4 sm:p-6">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 p-1.5 sm:p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/60 transition-colors z-10"
            type="button"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>

          {/* Branding row */}
          <div className="flex items-center justify-center mb-3 sm:mb-4 pt-1">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              {settingsLoading ? (
                <div className="auth-modal-logo w-12 h-12 sm:w-14 sm:h-14" aria-hidden="true" />
              ) : appSettings.logo_type === 'image' && appSettings.logo_image ? (
                <img
                  src={appSettings.logo_image}
                  alt={appSettings.app_name || ''}
                  className="auth-modal-logo rounded-xl object-contain bg-white/90 p-1 shadow-md ring-1 ring-slate-200/80 dark:ring-slate-600/50"
                  style={{
                    height: Math.min(80, Math.max(32, parseInt(appSettings.logo_size || '32', 10) || 32) * 1.5),
                    width: Math.min(80, Math.max(32, parseInt(appSettings.logo_size || '32', 10) || 32) * 1.5)
                  }}
                />
              ) : appSettings.logo_type !== 'image' && appSettings.logo_icon ? (
                <div
                  className="auth-modal-logo rounded-xl bg-white/95 flex items-center justify-center shadow-md ring-1 ring-slate-200/80 dark:ring-slate-600/50"
                  style={{
                    height: Math.min(80, Math.max(32, parseInt(appSettings.logo_size || '32', 10) || 32) * 1.5),
                    width: Math.min(80, Math.max(32, parseInt(appSettings.logo_size || '32', 10) || 32) * 1.5),
                    fontSize: Math.max(20, Math.min(80, Math.max(32, parseInt(appSettings.logo_size || '32', 10) || 32) * 1.5) * 0.45)
                  }}
                >
                  {appSettings.logo_icon}
                </div>
              ) : null}
              {!settingsLoading && appSettings.app_name ? (
                <div className="text-center sm:text-left">
                  <p className="linknest-brand-app-name auth-modal-app-name text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
                    {appSettings.app_name}
                  </p>
                  {appSettings.app_subheading ? (
                    <p className="linknest-brand-subheading auth-modal-app-subheading text-xs sm:text-sm text-slate-500 dark:text-slate-300 mt-0.5">
                      {appSettings.app_subheading}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Sign In / Create Account — own centered row */}
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
              {mode === 'login' ? (
                <>
                  <span className="mr-1.5" aria-hidden>👋</span>Sign In
                </>
              ) : (
                <>
                  <span className="mr-1.5" aria-hidden>✨</span>Create Account
                </>
              )}
            </h2>
            {!settingsLoading && appSettings.app_name ? (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-300 font-medium mt-0.5">
                Welcome to {appSettings.app_name}
              </p>
            ) : null}
          </div>

        {error && (
          <div className="mb-2 sm:mb-3 p-2 sm:p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-xs sm:text-sm flex items-start gap-2 animate-fadeIn">
            <span className="text-base leading-none" aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-2 sm:mb-3 p-2 sm:p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm flex items-start gap-2 animate-fadeIn">
            <span className="text-base leading-none" aria-hidden>✅</span>
            <span>{success}</span>
          </div>
        )}

        {mode === 'login' && (
          <>
            {/* Status Indicators */}
            <div className="flex items-center gap-1.5 sm:gap-2 justify-center sm:justify-end mb-3 flex-wrap">
              <span className="auth-status-live px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] sm:text-xs font-semibold flex items-center gap-1 border border-emerald-200/80 dark:border-emerald-500/30">
                <span aria-hidden>🟢</span>
                <span className="hidden sm:inline">DB Online</span>
                <span className="sm:hidden">DB</span>
              </span>
              {ldapEnabled && (
                <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] sm:text-xs font-semibold flex items-center gap-1 border border-sky-200/80 dark:border-sky-500/30">
                  <span aria-hidden>🏢</span>
                  <span className="hidden sm:inline">
                    LDAP Active{ldapServers.length > 0 ? ` (${ldapServers.length})` : ''}
                  </span>
                  <span className="sm:hidden">
                    LDAP{ldapServers.length > 0 ? ` (${ldapServers.length})` : ''}
                  </span>
                </span>
              )}
              {samlEnabled && (
                <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] sm:text-xs font-semibold flex items-center gap-1 border border-sky-200/80 dark:border-sky-500/30">
                  <span aria-hidden>🔐</span>
                  <span className="hidden sm:inline">SAML Active</span>
                  <span className="sm:hidden">SAML</span>
                </span>
              )}
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {mode === 'login' && (localAuthEnabled || samlEnabled || ldapEnabled) && (
            <>
              {/* Authentication Method Selection */}
              {(ldapEnabled || samlEnabled || localAuthEnabled) && (
                <div className="mb-2 sm:mb-3">
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 sm:mb-2">
                    <span className="mr-1" aria-hidden>🔑</span>Authentication Method
                  </label>
                  <div className={`grid gap-1.5 sm:gap-2.5 ${authMethodGridClass}`}>
                    {ldapEnabled && localAuthEnabled && (
                      <label className={`${methodCardBase} ${authMethod === 'auto' ? methodCardSelected : methodCardIdle} ${loading ? 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="auto"
                          checked={authMethod === 'auto'}
                          onChange={(e) => selectAuthMethod(e.target.value as AuthMethodChoice)}
                          disabled={loading}
                          className="sr-only"
                        />
                        <span className="text-xl sm:text-2xl mb-1 flex-shrink-0" aria-hidden>⚡</span>
                        <div className="text-center min-w-0 w-full">
                          <span className={`text-xs font-semibold block truncate ${authMethod === 'auto' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}>Auto</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">Try LDAP, then Local</span>
                        </div>
                      </label>
                    )}

                    {ldapEnabled && (
                      <label className={`${methodCardBase} ${authMethod === 'ldap' ? methodCardSelected : methodCardIdle} ${loading || !ldapEnabled ? 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="ldap"
                          checked={authMethod === 'ldap'}
                          onChange={(e) => selectAuthMethod(e.target.value as AuthMethodChoice)}
                          disabled={loading || !ldapEnabled}
                          className="sr-only"
                        />
                        <span className="text-xl sm:text-2xl mb-1 flex-shrink-0" aria-hidden>🏢</span>
                        <div className="text-center min-w-0 w-full">
                          <span className={`text-xs font-semibold block truncate ${authMethod === 'ldap' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}>LDAP</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight truncate">
                            {ldapServers.length > 1
                              ? `${ldapServers.length} server(s)`
                              : ldapServers.length === 1
                                ? (ldapServers[0].login_domain || ldapServers[0].name || ldapDomain || 'Enterprise')
                                : (ldapDomain || 'Enterprise')}
                          </span>
                        </div>
                      </label>
                    )}

                    {localAuthEnabled && (
                      <label className={`${methodCardBase} ${authMethod === 'local' ? methodCardSelected : methodCardIdle} ${loading ? 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="local"
                          checked={authMethod === 'local'}
                          onChange={(e) => selectAuthMethod(e.target.value as AuthMethodChoice)}
                          disabled={loading}
                          className="sr-only"
                        />
                        <span className="text-xl sm:text-2xl mb-1 flex-shrink-0" aria-hidden>👤</span>
                        <div className="text-center min-w-0 w-full">
                          <span className={`text-xs font-semibold block truncate ${authMethod === 'local' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}>Local</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">Account</span>
                        </div>
                      </label>
                    )}

                    {samlEnabled && (
                      <label className={`${methodCardBase} ${authMethod === 'saml' ? methodCardSelected : methodCardIdle} ${loading ? 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="saml"
                          checked={authMethod === 'saml'}
                          onChange={(e) => selectAuthMethod(e.target.value as AuthMethodChoice)}
                          disabled={loading}
                          className="sr-only"
                        />
                        <span className="text-xl sm:text-2xl mb-1 flex-shrink-0" aria-hidden>🔐</span>
                        <div className="text-center min-w-0 w-full">
                          <span className={`text-xs font-semibold block truncate ${authMethod === 'saml' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}>SAML</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">SSO</span>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Authentication Method Explanation */}
              {(samlEnabled || ldapEnabled) && (
                <div className="mb-2 sm:mb-3">
                  <button
                    type="button"
                    onClick={() => setShowHelpInfo(!showHelpInfo)}
                    className="w-full flex items-center justify-between bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-900/25 dark:to-violet-900/20 border border-brand-200/80 dark:border-brand-700/50 rounded-xl p-2 sm:p-2.5 text-left transition-colors hover:from-brand-100/80 hover:to-violet-100/80"
                  >
                    <span className="text-[10px] sm:text-xs text-brand-700 dark:text-brand-300 font-semibold flex items-center gap-1.5">
                      <span aria-hidden>💡</span>How it works
                    </span>
                    <svg
                      className={`w-3 h-3 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-300 transition-transform duration-200 ${showHelpInfo ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showHelpInfo && (
                    <div className="bg-brand-50/80 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-2 sm:p-2.5 mt-1.5 animate-fadeIn">
                      <p className="text-[10px] sm:text-xs text-brand-800 dark:text-brand-200">
                        The system supports multiple authentication methods: {samlEnabled && 'SAML Single Sign-On, '}{ldapEnabled && 'LDAP, '}and local accounts. {samlEnabled && 'Select SAML to be redirected to your organization\'s login page, or '}enter credentials for {ldapEnabled ? 'LDAP/' : ''}local authentication.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* LDAP Server Selection Dropdown */}
              {((authMethod === 'ldap' || authMethod === 'auto') && ldapEnabled && ldapServers.length >= 1) && (
                <div className="animate-fadeIn rounded-xl bg-gradient-to-r from-sky-50 to-teal-50/70 dark:from-sky-950/30 dark:to-teal-950/20 border border-sky-200/80 dark:border-sky-800/40 p-3 sm:p-3.5 shadow-sm shadow-sky-500/5">
                  <label className="block text-xs sm:text-sm font-semibold text-sky-800 dark:text-sky-200 mb-1.5 sm:mb-2">
                    <span className="mr-1" aria-hidden>🌐</span>LDAP Server / Domain
                  </label>
                  <select
                    value={selectedLdapServerIndex}
                    onChange={(e) => selectLdapServerIndex(parseInt(e.target.value, 10))}
                    disabled={loading}
                    className="w-full bg-white/90 dark:bg-slate-900/80 border border-sky-200 dark:border-sky-700/50 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    title="Select which LDAP server or domain to authenticate against"
                  >
                    {ldapServers.map((server, index) => {
                      const showHost = String(appSettings.ldap_dropdown_show_host ?? '1') !== '0';
                      const namePart = server.name || `LDAP Server ${index + 1}`;
                      const domainPart = server.login_domain && server.login_domain !== namePart
                        ? ` (${server.login_domain})`
                        : '';
                      const hostPart = showHost && server.server
                        ? ` - ${server.server}`
                        : '';
                      return (
                        <option key={index} value={index}>
                          {namePart}{domainPart}{hostPart}
                        </option>
                      );
                    })}
                  </select>
                  {ldapServers.length > 1 && (
                    <p className="text-[10px] text-sky-700/80 dark:text-sky-300/70 mt-1.5 flex items-center gap-1">
                      <span aria-hidden>💡</span>
                      Choose the LDAP server or domain for your account.
                    </p>
                  )}
                </div>
              )}

              {/* Username/Password fields - only show if not using SAML */}
              {authMethod !== 'saml' && (
                <div className="animate-fadeIn">
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                    <span className="mr-1" aria-hidden>{(authMethod === 'ldap' || authMethod === 'auto') && ldapEnabled ? '🏢' : '👤'}</span>
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={authMethod !== 'saml'}
                    disabled={loading}
                    autoComplete="username"
                    className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-shadow ${(authMethod === 'ldap' || authMethod === 'auto') && ldapEnabled ? 'border-sky-200 dark:border-sky-800/50 focus:ring-sky-400 focus:border-sky-400' : 'border-slate-200 dark:border-slate-700 focus:ring-brand-500 focus:border-brand-400'}`}
                    placeholder={ldapEnabled ? "Enter username (LDAP or local account)" : "Enter username (local account)"}
                  />
                </div>
              )}

              {/* SAML Info Message */}
              {authMethod === 'saml' && (
                <div className="bg-gradient-to-r from-sky-50 to-teal-50/70 dark:from-sky-900/30 dark:to-teal-900/20 border border-sky-200 dark:border-sky-700/60 rounded-xl p-3 sm:p-3.5 mb-2 sm:mb-3 animate-fadeIn shadow-sm shadow-sky-500/10">
                  <p className="text-xs sm:text-sm text-sky-800 dark:text-sky-200 text-center font-medium flex items-center justify-center gap-2">
                    <span className="text-lg" aria-hidden>🚀</span>
                    <span>Click &quot;Sign In&quot; to be redirected to your organization&apos;s SAML login page.</span>
                  </p>
                </div>
              )}
            </>
          )}

          {mode === 'login' && !localAuthEnabled && !samlEnabled && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
                <span className="mr-1" aria-hidden>🚧</span>
                No authentication methods are currently enabled. Please contact your administrator.
              </p>
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  disabled={loading}
                  autoComplete="username"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  placeholder="Choose a username (min 3 characters)"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  placeholder="Enter your email"
                />
              </div>
            </>
          )}

          {/* Password field - only show if not using SAML */}
          {authMethod !== 'saml' && (
            <>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                  <span className="mr-1" aria-hidden>🔒</span>
                  Password
                </label>
                <SecurePasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={authMethod !== 'saml'}
                  disabled={loading}
                  minLength={mode === 'register' ? 8 : undefined}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  showToggle
                  className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm ${mode === 'login' && (authMethod === 'ldap' || authMethod === 'auto') && ldapEnabled ? 'border-sky-200 dark:border-sky-800/50 focus:ring-sky-400' : 'border-slate-200 dark:border-slate-700 focus:ring-brand-500'}`}
                  placeholder={mode === 'register' ? 'Min 8 chars, 1 upper, 1 number, 1 special' : 'Enter your password'}
                />
                {mode === 'register' && <PasswordCriteriaList password={password} />}
              </div>
              {mode === 'register' && (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                    Confirm Password
                  </label>
                  <SecurePasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    autoComplete="new-password"
                    showToggle
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    placeholder="Re-enter your password"
                  />
                  {confirmPassword.length > 0 && (
                    <p className={`mt-1 text-xs ${password === confirmPassword ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {password === confirmPassword ? '✅ Passwords match' : '❌ Passwords do not match'}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'login' && authMethod !== 'saml' && (
            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor="rememberMe" className="ml-2 block text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                Keep me logged in
              </label>
            </div>
          )}

          {/* Progress Bar Section */}
          {mode === 'login' && loading && (authState === 'connecting' || authState === 'ldap_attempting' || authState === 'ldap_authenticating' || authState === 'local_authenticating') && (
            <div className="bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-900/30 dark:to-violet-900/20 border border-brand-200 dark:border-brand-700/50 rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-3 animate-fadeIn">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="relative flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600 dark:text-brand-400"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 01.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z"
                      clipRule="evenodd"
                    />
                    <path
                      d="M10.5 13.5l-2-2 1.06-1.06L10.5 11.38l3.44-3.44 1.06 1.06-4.5 4.5z"
                      fill="white"
                      fillOpacity="0.9"
                    />
                  </svg>
                  {(authState === 'connecting' || authState === 'ldap_attempting' || authState === 'ldap_authenticating') && (
                    <svg
                      className="absolute inset-0 w-5 h-5 sm:w-6 sm:h-6 text-brand-600/30 dark:text-brand-400/30 -z-10"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="20"
                        strokeDashoffset="10"
                        className="animate-spin"
                        style={{ animationDuration: '1.5s', transformOrigin: '12px 12px' }}
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {authState === 'connecting'
                        ? '🔄 Connecting...'
                        : authState === 'ldap_attempting' || authState === 'ldap_authenticating'
                          ? '🏢 Attempting LDAP...'
                          : authState === 'local_authenticating'
                            ? '👤 Authenticating...'
                            : 'Signing In...'}
                    </h3>
                    {(authState === 'ldap_attempting' || authState === 'ldap_authenticating') && countdown > 0 && (
                      <span className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400 flex-shrink-0 ml-1">
                        {countdown}s
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 sm:h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-brand-600 to-violet-600 h-1.5 sm:h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {(authState === 'ldap_attempting' || authState === 'ldap_authenticating') && authMethod === 'auto' && (
                    <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1.5 sm:mt-2">
                      Will automatically switch to local authentication if LDAP times out.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Button Group */}
          <div className="flex gap-2 sm:gap-3 pt-1">
            {loading && mode === 'login' && (authState === 'connecting' || authState === 'ldap_attempting') && (
              <button
                type="button"
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-xs sm:text-sm"
                disabled
              >
                <span aria-hidden>🔗</span>
                <span className="hidden sm:inline">Connecting...</span>
                <span className="sm:hidden">Connecting</span>
              </button>
            )}
            {loading && (
              <button
                type="button"
                onClick={() => {
                  setLoading(false);
                  setAuthState('idle');
                  setProgress(0);
                  setCurrentMethod(null);
                  setCountdown(30);
                }}
                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-xs sm:text-sm"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading && (authState === 'connecting' || authState === 'ldap_attempting')}
              className={`auth-modal-btn-shimmer flex-1 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-brand-500/30 hover:shadow-brand-500/45 hover:-translate-y-0.5 active:translate-y-0 text-xs sm:text-sm`}
            >
              {loading
                ? authState === 'ldap_authenticating' || authState === 'local_authenticating'
                  ? 'Signing In...'
                  : 'Please wait...'
                : mode === 'login'
                  ? (authMethod === 'saml' ? '🔐 Continue with SAML' : 'Sign In')
                  : '✨ Create Account'}
            </button>
          </div>
        </form>

        {mode === 'login' && (
          <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setError('Password reset functionality coming soon. Please contact your administrator.');
                }}
                className="text-xs sm:text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                Forgot your password?
              </button>
            </div>
            {(samlEnabled || ldapEnabled || localAuthEnabled) && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPasswordResetInfo(!showPasswordResetInfo)}
                  className="w-full flex items-center justify-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <span>Password reset info</span>
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${showPasswordResetInfo ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPasswordResetInfo && (
                  <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 space-y-0.5 sm:space-y-1 px-2 mt-1 animate-fadeIn">
                    {samlEnabled && (
                      <p>🔐 SAML Users: Use your organization&apos;s password reset option</p>
                    )}
                    {ldapEnabled && (
                      <p>🏢 LDAP Users: Use your enterprise password reset option</p>
                    )}
                    {localAuthEnabled && (
                      <p>👤 Local Accounts: Click above to reset via email</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 sm:pt-3 grid sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-2 text-[10px] sm:text-xs rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/40 p-2">
                <span className="text-sm leading-none flex-shrink-0" aria-hidden>🔒</span>
                <span className="text-orange-800/90 dark:text-orange-200/90">Login: Save permanently, file management, advanced features</span>
              </div>
              <div className="flex items-start gap-2 text-[10px] sm:text-xs rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 p-2">
                <span className="text-sm leading-none flex-shrink-0" aria-hidden>👤</span>
                <span className="text-violet-800/90 dark:text-violet-200/90">Guest: Create locally, no saving, basic features only</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 sm:mt-4 text-center">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setSuccess('');
              setRememberMe(false);
            }}
            className="text-xs sm:text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

