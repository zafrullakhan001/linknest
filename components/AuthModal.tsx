import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { SecurePasswordInput } from './SecurePasswordInput';
import { PasswordCriteriaList } from './PasswordCriteriaList';
import { validatePassword } from '../services/passwordValidation';
import { authService, type TwoFactorChallenge, type TwoFactorApiError } from '../services/authService';
import { useTileAnimation, getTileAnimationClass } from './TileAnimationSelector';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'forgot' | 'reset';
  resetToken?: string | null;
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
type AuthMethodChoice = 'local' | 'ldap' | 'auto' | 'saml' | 'passkey';

const AUTH_METHOD_STORAGE_KEY = 'linknest_preferred_auth_method';
const LDAP_SERVER_STORAGE_KEY = 'linknest_preferred_ldap_server_index';

const VALID_AUTH_METHODS: AuthMethodChoice[] = ['local', 'ldap', 'auto', 'saml', 'passkey'];

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
  samlOn: boolean,
  passkeyOn: boolean
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
    case 'passkey':
      return passkeyOn;
    default:
      return false;
  }
}

function resolveDefaultAuthMethod(
  ldapOn: boolean,
  localOn: boolean,
  samlOn: boolean,
  passkeyOn: boolean
): AuthMethodChoice {
  if (ldapOn && localOn) return 'auto';
  if (samlOn && !localOn && !ldapOn && !passkeyOn) return 'saml';
  if (passkeyOn && !localOn && !ldapOn && !samlOn) return 'passkey';
  if (ldapOn && !localOn) return 'ldap';
  if (localOn) return 'local';
  if (samlOn) return 'saml';
  if (passkeyOn) return 'passkey';
  return 'local';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login', resetToken = null }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode);
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
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(30);
  const [currentMethod, setCurrentMethod] = useState<'ldap' | 'local' | null>(null);
  const [showHelpInfo, setShowHelpInfo] = useState(false);
  const [showPasswordResetInfo, setShowPasswordResetInfo] = useState(false);
  const [activeResetToken, setActiveResetToken] = useState<string | null>(resetToken);
  /** Set when the credentials were accepted but a TOTP code is still required. */
  const [twoFactor, setTwoFactor] = useState<TwoFactorChallenge | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorTrust, setTwoFactorTrust] = useState(true);
  const [twoFactorUseRecovery, setTwoFactorUseRecovery] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState('');
  const [twoFactorClockSkew, setTwoFactorClockSkew] = useState<number | null>(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const twoFactorInputRef = useRef<HTMLInputElement>(null);
  /** First credential field of the panel (Sign In / Create Account username, Forgot password email) */
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const registerUsernameInputRef = useRef<HTMLInputElement>(null);
  const forgotEmailInputRef = useRef<HTMLInputElement>(null);

  const { login, completeTwoFactorLogin, loginWithPasskey, register } = useAuth();
  const { settings: appSettings, loading: settingsLoading } = useSettings();
  const { animation: tileAnimation } = useTileAnimation();
  const tileAnimationClass = getTileAnimationClass(tileAnimation);
  const tileAnimatedClass = tileAnimationClass ? 'linknest-tile-animated' : '';
  const localRegistrationEnabled =
    String(appSettings.local_auth_enabled || '1') === '1' &&
    String(appSettings.local_registration_enabled || '1') === '1';

  useEffect(() => {
    if (!isOpen) return;
    if (initialMode === 'reset' && resetToken) {
      setMode('reset');
      setActiveResetToken(resetToken);
      setError('');
      setSuccess('');
      setPassword('');
      setConfirmPassword('');
      return;
    }
    if (initialMode === 'forgot') {
      setMode('forgot');
      setError('');
      setSuccess('');
      return;
    }
    if (initialMode === 'register' || initialMode === 'login') {
      setMode(initialMode);
    }
  }, [isOpen, initialMode, resetToken]);

  useEffect(() => {
    if (!isOpen || localRegistrationEnabled || mode !== 'register') return;
    setMode('login');
    setError('');
    setSuccess('');
  }, [isOpen, localRegistrationEnabled, mode]);

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

      const passkeyEnabledValue = String(appSettings.passkey_enabled || '0') === '1';
      setPasskeyEnabled(passkeyEnabledValue);
      
      // Determine local auth enabled from global settings context
      const localAuthEnabledValue = String(appSettings.local_auth_enabled || '1') === '1';
      setLocalAuthEnabled(localAuthEnabledValue);

      // Prefer last-used auth method from browser storage when still available
      const storedMethod = readStoredAuthMethod();
      const preferredMethod = storedMethod && isAuthMethodAvailable(storedMethod, enabled, localAuthEnabledValue, samlEnabledValue, passkeyEnabledValue)
        ? storedMethod
        : resolveDefaultAuthMethod(enabled, localAuthEnabledValue, samlEnabledValue, passkeyEnabledValue);

      if (!isAuthMethodAvailable(authMethod, enabled, localAuthEnabledValue, samlEnabledValue, passkeyEnabledValue)) {
        setAuthMethod(preferredMethod);
      } else if (storedMethod && storedMethod !== authMethod && isAuthMethodAvailable(storedMethod, enabled, localAuthEnabledValue, samlEnabledValue, passkeyEnabledValue)) {
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
      setTwoFactor(null);
      setTwoFactorCode('');
      setTwoFactorError('');
      setTwoFactorClockSkew(null);
      setTwoFactorBusy(false);
      setTwoFactorUseRecovery(false);
    }
  }, [isOpen]);

  /**
   * Put the caret in the first credential field as soon as the dialog appears so the user can
   * start typing without clicking into the field first. Also re-runs when the panel switches
   * (Sign In / Create Account / Forgot password), when the auth method resolves after settings
   * load, and when coming back from the two-factor step. The field can render a tick later
   * (settings still loading, panel fade-in), so a short retry loop covers that.
   */
  useEffect(() => {
    // The Reset Password panel leads with a password field, which is intentionally left alone.
    if (!isOpen || twoFactor || mode === 'reset') return;

    // Touch-first devices: leave the field alone so the on-screen keyboard is not forced open
    // (the dialog can also be opened automatically by protected routes, without a tap).
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    } catch {
      // matchMedia unavailable — keep the desktop behaviour
    }

    const pickTarget = (): HTMLInputElement | null => {
      if (mode === 'forgot') return forgotEmailInputRef.current;
      if (mode === 'register') return registerUsernameInputRef.current;
      return usernameInputRef.current;
    };

    const isEditable = (el: Element | null): boolean => {
      if (!el) return false;
      if (el instanceof HTMLElement && el.isContentEditable) return true;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
    };

    // Keyboard users arrow through the sr-only auth-method radios — never yank focus away from them.
    const isKeyboardFocusedAuthMethod = (): boolean => {
      const active = document.activeElement as HTMLInputElement | null;
      if (!active || active.type !== 'radio' || active.name !== 'authMethod') return false;
      try {
        return active.matches(':focus-visible');
      } catch {
        return false;
      }
    };

    const tryFocus = (): boolean => {
      const target = pickTarget();
      if (!target || target.disabled) return false;
      const active = document.activeElement;
      if (active === target) return true;
      // Never steal focus from a radio being navigated by keyboard, or from a field already in use.
      if (isKeyboardFocusedAuthMethod() || isEditable(active)) return true;
      target.focus();
      // Keep any existing value but place the caret after it, ready for typing.
      if (target.value && typeof target.setSelectionRange === 'function') {
        try {
          target.setSelectionRange(target.value.length, target.value.length);
        } catch {
          // Some input types reject setSelectionRange — focus alone is enough
        }
      }
      return true;
    };

    if (tryFocus()) return;

    const timers: number[] = [];
    const clearTimers = () => timers.forEach((timer) => window.clearTimeout(timer));
    [50, 150, 350, 600].forEach((delay) => {
      timers.push(window.setTimeout(() => {
        if (tryFocus()) clearTimers();
      }, delay));
    });
    return clearTimers;
  }, [isOpen, mode, authMethod, twoFactor]);

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
      // Auto mode uses a short LDAP window; explicit LDAP keeps 30s
      const initialCountdown = authMethod === 'auto' ? 5 : 30;
      setCountdown(initialCountdown);

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

  /**
   * Credentials were accepted but the account still needs its second factor.
   * Returns false so handleSubmit can stop before closing the modal.
   */
  const handleTwoFactorRequired = (result: { twoFactor?: TwoFactorChallenge } | undefined): boolean => {
    if (!result?.twoFactor) {
      return true;
    }
    setTwoFactor(result.twoFactor);
    setTwoFactorCode('');
    setTwoFactorError('');
    setTwoFactorClockSkew(null);
    setTwoFactorUseRecovery(false);
    setTwoFactorTrust(true);
    setPassword('');
    setError('');
    setSuccess('');
    setAuthState('idle');
    setProgress(0);
    setCurrentMethod(null);
    window.setTimeout(() => twoFactorInputRef.current?.focus(), 60);
    return false;
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactor) return;

    const value = twoFactorCode.trim();
    if (!value) {
      setTwoFactorError(
        twoFactorUseRecovery
          ? 'Enter one of your recovery codes'
          : 'Enter the 6-digit code from your authenticator app'
      );
      return;
    }

    setTwoFactorBusy(true);
    setTwoFactorError('');
    try {
      await completeTwoFactorLogin(twoFactor.challengeId, value, twoFactorTrust);
      setTwoFactor(null);
      setTwoFactorCode('');
      onClose();
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setRememberMe(false);
      setAuthState('idle');
      setProgress(0);
      setCurrentMethod(null);
    } catch (err: any) {
      const apiError = err as TwoFactorApiError;
      setTwoFactorError(apiError?.message || 'Verification failed');
      setTwoFactorClockSkew(typeof apiError?.clockSkewSeconds === 'number' ? apiError.clockSkewSeconds : null);
      setTwoFactorCode('');
      setTwoFactor((current) => current ? {
        ...current,
        attemptsRemaining: typeof apiError?.attemptsRemaining === 'number' ? apiError.attemptsRemaining : current.attemptsRemaining,
        lockedUntil: apiError?.lockedUntil ?? current.lockedUntil,
      } : current);

      // Expired, ended or unenrolled challenges cannot be retried.
      if (apiError?.reason && ['no_challenge', 'challenge_mismatch', 'not_enrolled', 'secret_unreadable'].includes(apiError.reason)) {
        setTwoFactor(null);
      }
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleTwoFactorBack = async () => {
    await authService.cancelTwoFactor();
    setTwoFactor(null);
    setTwoFactorCode('');
    setTwoFactorError('');
    setTwoFactorUseRecovery(false);
  };

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

    // Passkey: WebAuthn ceremony (no username/password)
    if (mode === 'login' && authMethod === 'passkey') {
      setLoading(true);
      setError('');
      try {
        await loginWithPasskey(rememberMe);
        onClose();
      } catch (err: any) {
        const msg = err?.message || 'Passkey sign-in failed';
        if (/cancel|abort|not allowed/i.test(msg)) {
          setError('Passkey sign-in was cancelled.');
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
          setError('Please enter your email address');
          return;
        }
        const result = await authService.forgotPassword(trimmedEmail);
        setSuccess(result.message);
        setEmail('');
      } catch (err: any) {
        setError(err.message || 'Failed to request password reset');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'reset') {
      setLoading(true);
      try {
        if (!activeResetToken) {
          setError('Invalid or missing reset token. Request a new password reset link.');
          return;
        }
        const strength = validatePassword(password);
        if (!strength.valid) {
          setError(strength.message || 'Password does not meet requirements');
          return;
        }
        if (password !== confirmPassword) {
          setError('Password and confirmation do not match');
          return;
        }
        const result = await authService.resetPasswordWithToken(activeResetToken, password, confirmPassword);
        setSuccess(result.message);
        setPassword('');
        setConfirmPassword('');
        setActiveResetToken(null);
        setTimeout(() => {
          setMode('login');
          setSuccess('');
          try {
            if (window.location.hash.toLowerCase().startsWith('#/reset-password')) {
              window.location.hash = '#/signin';
            }
          } catch {
            // ignore
          }
        }, 1500);
      } catch (err: any) {
        setError(err.message || 'Failed to reset password');
      } finally {
        setLoading(false);
      }
      return;
    }
    
    setLoading(true);
    setProgress(0);
    setCountdown(30);

    try {
      if (mode === 'login') {
        // Auto: server tries LDAP briefly then local. Explicit methods stay as selected.
        const method: 'local' | 'ldap' | 'auto' | undefined =
          authMethod === 'auto' ? 'auto' : authMethod === 'ldap' || authMethod === 'local' ? authMethod : undefined;

        // Set initial state based on method
        if (method === 'ldap' || (method === 'auto' && ldapEnabled)) {
          setAuthState('connecting');
          setCurrentMethod('ldap');

          // Brief delay to show connecting state
          await new Promise(resolve => setTimeout(resolve, 300));

          setAuthState('ldap_attempting');

          // Auto mode: short client timeout so unreachable LDAP does not leave the spinner stuck.
          // Explicit LDAP keeps a longer window for real directory auth.
          const ldapClientTimeoutMs = method === 'auto' ? 5000 : 30000;
          const abortController = new AbortController();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => {
              abortController.abort();
              reject(new Error('LDAP_TIMEOUT'));
            }, ldapClientTimeoutMs)
          );

          try {
            const ldapServerIndex = (method === 'ldap' || method === 'auto') ? selectedLdapServerIndex : undefined;
            const ldapResult = await Promise.race([
              login(username, password, method === 'ldap' ? 'ldap' : 'auto', rememberMe, ldapServerIndex, abortController.signal),
              timeoutPromise
            ]);

            // Second factor: keep the modal open on the code prompt.
            if (!handleTwoFactorRequired(ldapResult)) {
              return;
            }

            // Success
            setAuthState('success');
            setProgress(100);
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (err: any) {
            // Abort any in-flight auto/LDAP request before local fallback
            if (!abortController.signal.aborted) {
              abortController.abort();
            }

            // Auto mode: any LDAP failure/timeout falls through to local auth
            const canFallbackToLocal =
              method === 'auto' &&
              localAuthEnabled &&
              (err.message === 'LDAP_TIMEOUT' ||
                err.name === 'AbortError' ||
                err.message?.includes('LDAP') ||
                err.message?.includes('timeout') ||
                err.message?.includes('Failed to connect') ||
                err.message?.includes('Login failed'));

            if (canFallbackToLocal) {
              setAuthState('local_authenticating');
              setCurrentMethod('local');
              setProgress(50);

              const localResult = await login(username, password, 'local', rememberMe, undefined);
              if (!handleTwoFactorRequired(localResult)) {
                return;
              }
              setAuthState('success');
              setProgress(100);
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              throw err;
            }
          }
        } else {
          // Direct local authentication
          setAuthState('local_authenticating');
          setCurrentMethod('local');
          const localResult = await login(username, password, 'local', rememberMe, undefined);
          if (!handleTwoFactorRequired(localResult)) {
            return;
          }
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
        if (!localRegistrationEnabled) {
          setError('Local account registration is disabled. Contact an administrator.');
          setLoading(false);
          setMode('login');
          return;
        }
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

  const twoFactorLocked = !!twoFactor && twoFactor.lockedUntil > 0;
  const twoFactorLockMinutes = twoFactor && twoFactor.lockedUntil > 0
    ? Math.max(1, Math.ceil((twoFactor.lockedUntil - Date.now() / 1000) / 60))
    : 0;

  const twoFactorPanel = twoFactor ? (
    <>
      <div className="text-center space-y-1">
        <div className="text-3xl" aria-hidden>🛡️</div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {twoFactorUseRecovery ? 'Enter a recovery code' : 'Two-factor verification'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {twoFactorUseRecovery
            ? 'Use one of the one-time recovery codes you saved when you turned on two-factor authentication.'
            : 'Enter the 6-digit code from your authenticator app to finish signing in.'}
        </p>
      </div>

      {twoFactorLocked && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100">
          Too many incorrect codes. Please wait about {twoFactorLockMinutes} minute{twoFactorLockMinutes === 1 ? '' : 's'} and sign in again.
        </div>
      )}

      {twoFactorClockSkew !== null && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 px-3 py-2.5 text-xs text-orange-900 dark:text-orange-100">
          <p className="font-semibold">Authenticator clock is out of sync</p>
          <p className="mt-0.5 leading-relaxed">
            That code is valid, but the app/device generating it is about {Math.abs(twoFactorClockSkew)} seconds
            {' '}{twoFactorClockSkew > 0 ? 'ahead of' : 'behind'} the server. Turn on “set time automatically” on
            that device, or ask an administrator to sync the server clock, then enter the next code.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
          {twoFactorUseRecovery ? 'Recovery code' : 'Authentication code'}
        </label>
        <input
          ref={twoFactorInputRef}
          type="text"
          value={twoFactorCode}
          onChange={(e) => setTwoFactorCode(
            twoFactorUseRecovery
              ? e.target.value.toUpperCase().slice(0, 11)
              : e.target.value.replace(/[^\d]/g, '').slice(0, 6)
          )}
          inputMode={twoFactorUseRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          disabled={twoFactorBusy || twoFactorLocked}
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 text-center text-lg font-mono tracking-[0.25em]"
          placeholder={twoFactorUseRecovery ? 'XXXXX-XXXXX' : '000000'}
        />
      </div>

      {!twoFactorUseRecovery && (
        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={twoFactorTrust}
            onChange={(e) => setTwoFactorTrust(e.target.checked)}
            disabled={twoFactorBusy}
            className="mt-0.5 accent-brand-600"
          />
          <span>Trust this browser for 30 days (no code needed here)</span>
        </label>
      )}

      {twoFactorError && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{twoFactorError}</p>
      )}

      <button
        type="submit"
        disabled={twoFactorBusy || twoFactorLocked}
        className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
      >
        {twoFactorBusy ? 'Verifying…' : 'Verify and sign in'}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setTwoFactorUseRecovery((v) => !v);
            setTwoFactorCode('');
            setTwoFactorError('');
          }}
          className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
        >
          {twoFactorUseRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
        <button
          type="button"
          onClick={() => void handleTwoFactorBack()}
          className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          Back to sign in
        </button>
      </div>
    </>
  ) : null;

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
    (samlEnabled ? 1 : 0) +
    (passkeyEnabled ? 1 : 0);
  const authMethodGridClass =
    authMethodCount >= 5
      ? 'grid-cols-2 sm:grid-cols-3'
      : authMethodCount >= 4
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
      <div className={`auth-modal-panel relative w-full max-w-md sm:max-w-2xl max-h-[95vh] overflow-y-auto scrollbar-hide rounded-2xl sm:rounded-3xl border border-white/40 dark:border-slate-600/60 shadow-2xl shadow-brand-900/20 bg-white dark:bg-slate-800 ${tileAnimatedClass} ${tileAnimationClass}`.trim()}>
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
              ) : mode === 'forgot' ? (
                <>
                  <span className="mr-1.5" aria-hidden>🔑</span>Reset Password
                </>
              ) : mode === 'reset' ? (
                <>
                  <span className="mr-1.5" aria-hidden>🔒</span>Choose New Password
                </>
              ) : (
                <>
                  <span className="mr-1.5" aria-hidden>✨</span>Create Account
                </>
              )}
            </h2>
            {!settingsLoading && appSettings.app_name ? (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-300 font-medium mt-0.5">
                {mode === 'forgot'
                  ? 'Enter your local account email to receive a reset link'
                  : mode === 'reset'
                    ? 'Set a new password for your local account'
                    : `Welcome to ${appSettings.app_name}`}
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
              {passkeyEnabled && (
                <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[10px] sm:text-xs font-semibold flex items-center gap-1 border border-violet-200/80 dark:border-violet-500/30">
                  <span aria-hidden>🔑</span>
                  <span className="hidden sm:inline">Passkeys On</span>
                  <span className="sm:hidden">Passkey</span>
                </span>
              )}
            </div>
          </>
        )}

        {twoFactor ? (
          <form onSubmit={handleTwoFactorSubmit} className="space-y-3 sm:space-y-4">
            {twoFactorPanel}
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {(mode === 'forgot' || mode === 'reset') && (
            <>
              {mode === 'forgot' && (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                    Email
                  </label>
                  <input
                    ref={forgotEmailInputRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    placeholder="Enter your account email"
                  />
                </div>
              )}
              {mode === 'reset' && (
                <>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                      New password
                    </label>
                    <SecurePasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="new-password"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      placeholder="Min 8 chars, 1 upper, 1 number, 1 special"
                    />
                    <PasswordCriteriaList password={password} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                      Confirm password
                    </label>
                    <SecurePasswordInput
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="new-password"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      placeholder="Re-enter your new password"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2 sm:gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccess('');
                    setPassword('');
                    setConfirmPassword('');
                    setActiveResetToken(null);
                  }}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-xs sm:text-sm"
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-modal-btn-shimmer flex-1 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-brand-500/30 hover:shadow-brand-500/45 hover:-translate-y-0.5 active:translate-y-0 text-xs sm:text-sm"
                >
                  {loading ? 'Please wait...' : mode === 'forgot' ? 'Send reset link' : 'Update password'}
                </button>
              </div>
            </>
          )}

          {(mode === 'login' || mode === 'register') && (
          <>
          {mode === 'login' && (localAuthEnabled || samlEnabled || ldapEnabled || passkeyEnabled) && (
            <>
              {/* Authentication Method Selection */}
              {(ldapEnabled || samlEnabled || localAuthEnabled || passkeyEnabled) && (
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

                    {passkeyEnabled && (
                      <label className={`${methodCardBase} ${authMethod === 'passkey' ? methodCardSelected : methodCardIdle} ${loading ? 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none' : ''}`}>
                        <input
                          type="radio"
                          name="authMethod"
                          value="passkey"
                          checked={authMethod === 'passkey'}
                          onChange={(e) => selectAuthMethod(e.target.value as AuthMethodChoice)}
                          disabled={loading}
                          className="sr-only"
                        />
                        <span className="text-xl sm:text-2xl mb-1 flex-shrink-0" aria-hidden>🔑</span>
                        <div className="text-center min-w-0 w-full">
                          <span className={`text-xs font-semibold block truncate ${authMethod === 'passkey' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}>Passkey</span>
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5">Hello / Face ID</span>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Authentication Method Explanation */}
              {(samlEnabled || ldapEnabled || passkeyEnabled) && (
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
                        The system supports multiple authentication methods: {samlEnabled && 'SAML Single Sign-On, '}{ldapEnabled && 'LDAP, '}{passkeyEnabled && 'passkeys, '}and local accounts. {samlEnabled && 'Select SAML to be redirected to your organization\'s login page. '}{passkeyEnabled && 'Select Passkey to use Windows Hello, Face ID, or a security key. '}Enter credentials for {ldapEnabled ? 'LDAP/' : ''}local authentication when needed.
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

              {/* Username/Password fields - only show if not using SAML or Passkey */}
              {authMethod !== 'saml' && authMethod !== 'passkey' && (
                <div className="animate-fadeIn">
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                    <span className="mr-1" aria-hidden>{(authMethod === 'ldap' || authMethod === 'auto') && ldapEnabled ? '🏢' : '👤'}</span>
                    Username or Email
                  </label>
                  <input
                    ref={usernameInputRef}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={authMethod !== 'saml' && authMethod !== 'passkey'}
                    disabled={loading}
                    autoComplete="username"
                    className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-shadow ${(authMethod === 'ldap' || authMethod === 'auto') && ldapEnabled ? 'border-sky-200 dark:border-sky-800/50 focus:ring-sky-400 focus:border-sky-400' : 'border-slate-200 dark:border-slate-700 focus:ring-brand-500 focus:border-brand-400'}`}
                    placeholder={
                      ldapEnabled && localAuthEnabled
                        ? 'Enter username (LDAP or local account)'
                        : ldapEnabled
                          ? 'Enter username (LDAP account)'
                          : 'Enter username (local account)'
                    }
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

              {/* Passkey Info Message */}
              {authMethod === 'passkey' && (
                <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50/70 dark:from-violet-900/30 dark:to-fuchsia-900/20 border border-violet-200 dark:border-violet-700/60 rounded-xl p-3 sm:p-3.5 mb-2 sm:mb-3 animate-fadeIn shadow-sm shadow-violet-500/10">
                  <p className="text-xs sm:text-sm text-violet-800 dark:text-violet-200 text-center font-medium flex items-center justify-center gap-2">
                    <span className="text-lg" aria-hidden>🔑</span>
                    <span>Click &quot;Sign In&quot; to use a registered passkey (Windows Hello, Face ID, or security key).</span>
                  </p>
                </div>
              )}
            </>
          )}

          {mode === 'login' && !localAuthEnabled && !samlEnabled && !ldapEnabled && !passkeyEnabled && (
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
                  ref={registerUsernameInputRef}
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

          {/* Password field - only show if not using SAML or Passkey */}
          {authMethod !== 'saml' && authMethod !== 'passkey' && (
            <>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
                  <span className="mr-1" aria-hidden>🔒</span>
                  Password
                </label>
                <SecurePasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={authMethod !== 'saml' && authMethod !== 'passkey'}
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
                  ? (authMethod === 'saml'
                    ? '🔐 Continue with SAML'
                    : authMethod === 'passkey'
                      ? '🔑 Continue with Passkey'
                      : 'Sign In')
                  : '✨ Create Account'}
            </button>
          </div>
          </>
          )}
        </form>
        )}

        {mode === 'login' && !twoFactor && (
          <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
            {localAuthEnabled && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setSuccess('');
                  setEmail('');
                }}
                className="text-xs sm:text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                Forgot your password?
              </button>
            </div>
            )}
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
                      <p>👤 Local Accounts: Use Forgot password above to receive a reset email (requires System Email SMTP)</p>
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

        {(mode === 'register' || (mode === 'login' && localRegistrationEnabled)) && (
        <div className="mt-3 sm:mt-4 text-center">
          <button
            type="button"
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
        )}
        </div>
      </div>
    </div>,
    document.body
  );
};

