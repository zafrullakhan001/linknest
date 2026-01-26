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

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMethod, setAuthMethod] = useState<'local' | 'ldap' | 'auto' | 'saml'>('auto');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [ldapDomain, setLdapDomain] = useState<string | null>(null);
  const [ldapEnabled, setLdapEnabled] = useState(false);
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
  const { settings: appSettings } = useSettings();

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

      // Set default auth method based on available options
      // Also reset if current method is not available
      const currentMethod = authMethod;
      
      // If LDAP is disabled but current method is 'ldap' or 'auto', switch to available method first
      if (!enabled && (currentMethod === 'ldap' || currentMethod === 'auto')) {
        if (samlEnabledValue) {
          setAuthMethod('saml');
        } else if (localAuthEnabledValue) {
          setAuthMethod('local');
        }
      } else if (enabled && localAuthEnabledValue) {
        // If both LDAP and local are enabled, default to 'auto'
        if (currentMethod !== 'auto' && currentMethod !== 'ldap' && currentMethod !== 'local' && currentMethod !== 'saml') {
          setAuthMethod('auto');
        }
      } else if (samlEnabledValue && !localAuthEnabledValue && !enabled) {
        // If only SAML is enabled, default to 'saml'
        if (currentMethod !== 'saml') {
          setAuthMethod('saml');
        }
      } else if (enabled && !localAuthEnabledValue) {
        // If only LDAP is enabled, default to 'ldap'
        if (currentMethod !== 'ldap') {
          setAuthMethod('ldap');
        }
      } else if (localAuthEnabledValue && !enabled && !samlEnabledValue) {
        // If only local is enabled, default to 'local'
        if (currentMethod !== 'local') {
          setAuthMethod('local');
        }
      } else if (samlEnabledValue && localAuthEnabledValue && !enabled) {
        // If SAML and local are enabled, default to 'local'
        if (currentMethod === 'ldap' || currentMethod === 'auto') {
          setAuthMethod('local');
        }
      } else if (samlEnabledValue && enabled && !localAuthEnabledValue) {
        // If SAML and LDAP are enabled, default to 'saml'
        if (currentMethod === 'local' || currentMethod === 'auto') {
          setAuthMethod('saml');
        }
      } else if (samlEnabledValue && enabled && localAuthEnabledValue) {
        // If all three are enabled, default to 'auto'
        if (currentMethod !== 'auto' && currentMethod !== 'ldap' && currentMethod !== 'local' && currentMethod !== 'saml') {
          setAuthMethod('auto');
        }
      }

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
      setConfirmPassword('');
      setAuthMethod('auto');
      setRememberMe(false);
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
            // Try login with timeout
            await Promise.race([
              login(username, password, method === 'ldap' ? 'ldap' : undefined, rememberMe),
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

              // Try local authentication
              await login(username, password, 'local', rememberMe);
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
          await login(username, password, 'local', rememberMe);
          setAuthState('success');
          setProgress(100);
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        onClose();
        setUsername('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setAuthMethod('auto');
        setRememberMe(false);
        setAuthState('idle');
        setProgress(0);
        setCurrentMethod(null);
      } else {
        // Register: validate password strength and confirmation
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
        const result = await register(username, email, password, confirmPassword);
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-md sm:max-w-2xl p-4 sm:p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors z-10"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>

        {/* Logo and Application Name */}
        <div className="flex items-center justify-center mb-4 sm:mb-6 relative">
          {/* Mobile: Centered Logo and Title */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            {appSettings.logo_type === 'image' && appSettings.logo_image ? (
              <img
                src={appSettings.logo_image}
                alt={appSettings.app_name || 'LinkNest'}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-contain"
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg text-xl sm:text-2xl">
                {appSettings.logo_icon || '🔗'}
              </div>
            )}
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white text-center sm:text-left">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h2>
          </div>
        </div>

        {error && (
          <div className="mb-2 sm:mb-3 p-2 sm:p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-2 sm:mb-3 p-2 sm:p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
            {success}
          </div>
        )}

        {mode === 'login' && (
          <>
            {/* Status Indicators - Compact on Mobile */}
            <div className="flex items-center gap-1 sm:gap-2 justify-center sm:justify-end mb-2 flex-wrap">
              <span className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] sm:text-xs font-semibold flex items-center gap-1">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="hidden sm:inline">DB Online</span>
                <span className="sm:hidden">DB</span>
              </span>
              {ldapEnabled && (
                <span className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] sm:text-xs font-semibold flex items-center gap-1">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="hidden sm:inline">LDAP Active</span>
                  <span className="sm:hidden">LDAP</span>
                </span>
              )}
              {samlEnabled && (
                <span className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] sm:text-xs font-semibold flex items-center gap-1">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full animate-pulse"></div>
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
              {/* Authentication Method Selection - Radio Buttons */}
              {(ldapEnabled || samlEnabled || localAuthEnabled) && (
                <div className="mb-2 sm:mb-3">
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                    Authentication Method
                  </label>
                  <div className={`grid gap-1.5 sm:gap-2 ${
                    samlEnabled && ldapEnabled && localAuthEnabled ? 'grid-cols-1 sm:grid-cols-4' :
                    (samlEnabled && ldapEnabled) || (samlEnabled && localAuthEnabled) || (ldapEnabled && localAuthEnabled) ? 'grid-cols-1 sm:grid-cols-3' :
                    (samlEnabled && localAuthEnabled) ? 'grid-cols-1 sm:grid-cols-2' :
                    'grid-cols-1'
                  }`}>
                    {/* Auto Option - Only show when LDAP is enabled */}
                    {ldapEnabled && localAuthEnabled && (
                      <label className={`relative flex flex-row sm:flex-col items-center justify-start sm:justify-center p-2 sm:p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        authMethod === 'auto' 
                          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="auto"
                          checked={authMethod === 'auto'}
                          onChange={(e) => setAuthMethod(e.target.value as 'local' | 'ldap' | 'auto' | 'saml')}
                          disabled={loading}
                          className="sr-only"
                        />
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-0 sm:mb-1.5 mr-2 sm:mr-0 text-slate-600 dark:text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1 sm:flex-none text-center sm:text-center">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">Auto</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">Try LDAP, then Local</span>
                        </div>
                      </label>
                    )}
                    
                    {/* LDAP Option */}
                    {ldapEnabled && (
                      <label className={`relative flex flex-row sm:flex-col items-center justify-start sm:justify-center p-2 sm:p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        authMethod === 'ldap' 
                          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                      } ${loading || !ldapEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="ldap"
                          checked={authMethod === 'ldap'}
                          onChange={(e) => setAuthMethod(e.target.value as 'local' | 'ldap' | 'auto' | 'saml')}
                          disabled={loading || !ldapEnabled}
                          className="sr-only"
                        />
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-0 sm:mb-1.5 mr-2 sm:mr-0 text-slate-600 dark:text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <div className="flex-1 sm:flex-none text-center sm:text-center">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">LDAP</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">{ldapDomain || 'Enterprise'}</span>
                        </div>
                      </label>
                    )}
                    
                    {/* Local Option */}
                    {localAuthEnabled && (
                      <label className={`relative flex flex-row sm:flex-col items-center justify-start sm:justify-center p-2 sm:p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        authMethod === 'local' 
                          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="local"
                          checked={authMethod === 'local'}
                          onChange={(e) => setAuthMethod(e.target.value as 'local' | 'ldap' | 'auto' | 'saml')}
                          disabled={loading}
                          className="sr-only"
                        />
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-0 sm:mb-1.5 mr-2 sm:mr-0 text-slate-600 dark:text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <div className="flex-1 sm:flex-none text-center sm:text-center">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">Local</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">Account</span>
                        </div>
                      </label>
                    )}
                    
                    {/* SAML Option */}
                    {samlEnabled && (
                      <label className={`relative flex flex-row sm:flex-col items-center justify-start sm:justify-center p-2 sm:p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        authMethod === 'saml' 
                          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="saml"
                          checked={authMethod === 'saml'}
                          onChange={(e) => setAuthMethod(e.target.value as 'local' | 'ldap' | 'auto' | 'saml')}
                          disabled={loading}
                          className="sr-only"
                        />
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-0 sm:mb-1.5 mr-2 sm:mr-0 text-slate-600 dark:text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <div className="flex-1 sm:flex-none text-center sm:text-center">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">SAML</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">SSO</span>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Authentication Method Explanation - Collapsible on Mobile */}
              {(samlEnabled || ldapEnabled) && (
                <div className="mb-2 sm:mb-3">
                  <button
                    type="button"
                    onClick={() => setShowHelpInfo(!showHelpInfo)}
                    className="w-full flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 sm:p-2.5 text-left"
                  >
                    <span className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300 font-medium">
                      How it works
                    </span>
                    <svg
                      className={`w-3 h-3 sm:w-4 sm:h-4 text-blue-700 dark:text-blue-300 transition-transform ${showHelpInfo ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showHelpInfo && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 sm:p-2.5 mt-1">
                      <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300">
                        The system supports multiple authentication methods: {samlEnabled && 'SAML Single Sign-On, '}{ldapEnabled && 'LDAP, '}and local accounts. {samlEnabled && 'Select SAML to be redirected to your organization\'s login page, or '}enter credentials for {ldapEnabled ? 'LDAP/' : ''}local authentication.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Username/Password fields - only show if not using SAML */}
              {authMethod !== 'saml' && (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={authMethod !== 'saml'}
                    disabled={loading}
                    autoComplete="username"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    placeholder={ldapEnabled ? "Enter username (LDAP or local account)" : "Enter username (local account)"}
                  />
                </div>
              )}

              {/* SAML Info Message */}
              {authMethod === 'saml' && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-2.5 sm:p-3 mb-2 sm:mb-3">
                  <p className="text-xs sm:text-sm text-purple-700 dark:text-purple-300 text-center">
                    Click "Sign In" to be redirected to your organization's SAML login page.
                  </p>
                </div>
              )}
            </>
          )}

          {mode === 'login' && !localAuthEnabled && !samlEnabled && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4 text-center">
              <p className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200">
                No authentication methods are currently enabled. Please contact your administrator.
              </p>
            </div>
          )}

          {mode === 'register' && (
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
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                placeholder="Enter your email"
              />
            </div>
          )}

          {/* Password field - only show if not using SAML */}
          {authMethod !== 'saml' && (
            <>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
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
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    placeholder="Re-enter your password"
                  />
                  {confirmPassword.length > 0 && (
                    <p className={`mt-1 text-xs ${password === confirmPassword ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
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

          {/* Progress Bar Section - Only show during login authentication */}
          {mode === 'login' && loading && (authState === 'connecting' || authState === 'ldap_attempting' || authState === 'ldap_authenticating' || authState === 'local_authenticating') && (
            <div className="bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Animated Icon */}
                <div className="relative flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6">
                  {/* Shield Icon */}
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
                    {/* Checkmark inside shield */}
                    <path
                      d="M10.5 13.5l-2-2 1.06-1.06L10.5 11.38l3.44-3.44 1.06 1.06-4.5 4.5z"
                      fill="white"
                      fillOpacity="0.9"
                    />
                  </svg>
                  {/* Spinning ring animation around shield */}
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
                        ? 'Connecting...'
                        : authState === 'ldap_attempting' || authState === 'ldap_authenticating'
                          ? 'Attempting LDAP...'
                          : authState === 'local_authenticating'
                            ? 'Authenticating...'
                            : 'Signing In...'}
                    </h3>
                    {(authState === 'ldap_attempting' || authState === 'ldap_authenticating') && countdown > 0 && (
                      <span className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400 flex-shrink-0 ml-1">
                        {countdown}s
                      </span>
                    )}
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 sm:h-2 overflow-hidden">
                    <div
                      className="bg-brand-600 dark:bg-brand-500 h-1.5 sm:h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {/* Fallback message for LDAP */}
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
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-xs sm:text-sm"
                disabled
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 12a3 3 0 00-3 3v1a1 1 0 001 1h10a1 1 0 001-1v-1a3 3 0 00-3-3H6z" />
                </svg>
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
                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-xs sm:text-sm"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading && (authState === 'connecting' || authState === 'ldap_attempting')}
              className={`${loading && (authState === 'ldap_authenticating' || authState === 'local_authenticating')
                  ? 'flex-1'
                  : 'flex-1'
                } bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2.5 rounded-lg font-semibold transition-all shadow-lg shadow-brand-500/20 text-xs sm:text-sm`}
            >
              {loading
                ? authState === 'ldap_authenticating' || authState === 'local_authenticating'
                  ? 'Signing In...'
                  : 'Please wait...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </div>
        </form>

        {mode === 'login' && (
          <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement forgot password functionality
                  setError('Password reset functionality coming soon. Please contact your administrator.');
                }}
                className="text-xs sm:text-sm text-brand-600 dark:text-brand-400 hover:underline"
              >
                Forgot your password?
              </button>
            </div>
            {/* Password Reset Info - Collapsible on Mobile */}
            {(samlEnabled || ldapEnabled || localAuthEnabled) && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPasswordResetInfo(!showPasswordResetInfo)}
                  className="w-full flex items-center justify-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <span>Password reset info</span>
                  <svg
                    className={`w-3 h-3 transition-transform ${showPasswordResetInfo ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPasswordResetInfo && (
                  <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 space-y-0.5 sm:space-y-1 px-2 mt-1">
                    {samlEnabled && (
                      <p>SAML Users: Use your organization's password reset option</p>
                    )}
                    {ldapEnabled && (
                      <p>LDAP Users: Use your enterprise password reset option</p>
                    )}
                    {localAuthEnabled && (
                      <p>Local Accounts: Click above to reset via email</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Account Type Info - Compact on Mobile */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 sm:pt-3 space-y-1 sm:space-y-2">
              <div className="flex items-start space-x-1.5 sm:space-x-2 text-[10px] sm:text-xs">
                <span className="text-slate-400 flex-shrink-0">🔒</span>
                <span className="text-slate-600 dark:text-slate-400">Login: Save permanently, file management, advanced features</span>
              </div>
              <div className="flex items-start space-x-1.5 sm:space-x-2 text-[10px] sm:text-xs">
                <span className="text-slate-400 flex-shrink-0">👤</span>
                <span className="text-slate-600 dark:text-slate-400">Guest: Create locally, no saving, basic features only</span>
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
              setAuthMethod('auto');
              setRememberMe(false);
            }}
            className="text-xs sm:text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

