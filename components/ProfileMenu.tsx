import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import { validatePassword } from '../services/passwordValidation';
import { SecurePasswordInput } from './SecurePasswordInput';
import { PasswordCriteriaList } from './PasswordCriteriaList';

interface ProfileMenuProps {
  onLogout: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ onLogout }) => {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDisplayNameEdit, setShowDisplayNameEdit] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const displayLabel = (user?.display_name && user.display_name.trim()) ? user.display_name.trim() : (user?.username ?? '');
  const canChangePassword = (user?.auth_source ?? 'local') === 'local';

  const updatePosition = () => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (open) {
      const handleResize = () => updatePosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setShowChangePassword(false);
        setShowDisplayNameEdit(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowChangePassword(false);
        setShowDisplayNameEdit(false);
      }
    };
    if (open) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [open]);

  useEffect(() => {
    if (showDisplayNameEdit) {
      setDisplayNameValue((user?.display_name && user.display_name.trim()) ? user.display_name.trim() : (user?.username ?? ''));
    }
  }, [showDisplayNameEdit, user?.display_name, user?.username]);

  const handleSaveDisplayName = async () => {
    if (!user) return;
    setMessage(null);
    setLoading(true);
    try {
      await authService.updateProfile({ display_name: displayNameValue.trim() || null });
      await refreshUser();
      setShowDisplayNameEdit(false);
      setMessage({ type: 'success', text: 'Display name updated' });
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasswordSubmit = async () => {
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    const pwValidation = validatePassword(newPassword);
    if (!pwValidation.valid) {
      setMessage({ type: 'error', text: pwValidation.message || 'Invalid password' });
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
      setMessage({ type: 'success', text: 'Password changed' });
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="relative flex items-center gap-2 ml-1" ref={menuRef}>
      {message && (
        <div className={`absolute bottom-full right-0 mb-1 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap z-[60] ${
          message.type === 'success' ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
        title="Profile menu"
        aria-label="Profile menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-72 max-h-[85vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-2"
          style={{
            top: dropdownPosition.top,
            right: dropdownPosition.right,
            zIndex: 99999,
          }}
        >
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{displayLabel}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>

          {showDisplayNameEdit ? (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Display name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={displayNameValue}
                  onChange={(e) => setDisplayNameValue(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  placeholder="Display name"
                  maxLength={255}
                />
                <button
                  type="button"
                  onClick={handleSaveDisplayName}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisplayNameEdit(false)}
                  className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDisplayNameEdit(true)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Change display name
            </button>
          )}

          {showChangePassword ? (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 space-y-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Change password</p>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">Current password</label>
                <SecurePasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  showToggle
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  placeholder="Current password"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">New password</label>
                <SecurePasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  showToggle
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  placeholder="New password"
                />
                <PasswordCriteriaList password={newPassword} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">Confirm new password</label>
                <SecurePasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  showToggle
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                  placeholder="Confirm new password"
                />
                {(newPassword.length > 0 || confirmPassword.length > 0) && (
                  <p className={`mt-1.5 text-xs font-medium ${newPassword === confirmPassword ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleChangePasswordSubmit}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-50"
                >
                  Update password
                </button>
                <button
                  type="button"
                  onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setMessage(null); }}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : canChangePassword ? (
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Change password
            </button>
          ) : null}

          <div className="pt-1">
            <button
              type="button"
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
              Logout
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
