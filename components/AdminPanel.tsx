import React, { useState, useEffect, useRef } from 'react';
import { authService, PendingUser, AllUser } from '../services/authService';
import { settingsService, AppSettings } from '../services/settingsService';
import { databaseService } from '../services/databaseService';
import { useSettings } from '../contexts/SettingsContext';
import { getTiles, createTile } from '../services/storageService';
import { bulkImportTiles } from '../services/storageService';
import { exportAllCategoriesToFile, parseSpaceExportObject, normalizeImportedTiles } from '../services/spaceTransferService';
import { Tile } from '../types';
import { getCategoryArrangement } from '../services/storageService';
import { SecurePasswordInput } from './SecurePasswordInput';

interface AdminPanelProps {
  onUserApproved?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onUserApproved }) => {
  const { refreshSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'settings' | 'database' | 'spaces' | 'ldap'>('pending');
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<{ open: boolean; userId: number | null; username: string }>({ open: false, userId: null, username: '' });
  const [newPassword, setNewPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Settings state
  const [settings, setSettings] = useState<AppSettings>({
    app_name: 'LinkNest',
    page_title: 'LinkNest',
    spaces_title: 'My Spaces',
    logo_type: 'icon',
    logo_icon: '🔗',
    logo_image: '',
    favicon: ''
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [adminPasswordModal, setAdminPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);

  // Database export/import state
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // Spaces export/import state
  const [spacesExporting, setSpacesExporting] = useState(false);
  const [spacesImporting, setSpacesImporting] = useState(false);
  const [spacesBulkImporting, setSpacesBulkImporting] = useState(false);
  const [spacesImportFile, setSpacesImportFile] = useState<File | null>(null);
  const [spacesBulkImportFile, setSpacesBulkImportFile] = useState<File | null>(null);
  const [spacesTiles, setSpacesTiles] = useState<Tile[]>([]);
  const [spacesCategoryOrder, setSpacesCategoryOrder] = useState<string[]>([]);

  // LDAP export/import state
  const [ldapExporting, setLdapExporting] = useState(false);
  const [ldapImporting, setLdapImporting] = useState(false);
  const [ldapImportFile, setLdapImportFile] = useState<File | null>(null);

  // LDAP Test state
  const [ldapTestLoading, setLdapTestLoading] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ldapTestUser, setLdapTestUser] = useState('');
  const [ldapTestPassword, setLdapTestPassword] = useState('');
  
  // Ref to store bind password for immediate access (avoids React state timing issues)
  const ldapBindPasswordRef = useRef<string>('');

  const loadPendingUsers = async () => {
    try {
      setError('');
      const users = await authService.getPendingUsers();
      setPendingUsers(users);
    } catch (err: any) {
      setError(err.message || 'Failed to load pending users');
    }
  };

  const loadAllUsers = async () => {
    try {
      setError('');
      const users = await authService.getAllUsers();
      setAllUsers(users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadPendingUsers(), loadAllUsers()]);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      setSettingsLoading(true);
      const loadedSettings = await settingsService.getSettings();
      setSettings(loadedSettings);
      // Update ref with loaded password
      ldapBindPasswordRef.current = loadedSettings.ldap_bind_password || '';
      // Set preview if logo image exists
      if (loadedSettings.logo_image) {
        setLogoPreview(loadedSettings.logo_image);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadSettings();
    if (activeTab === 'spaces') {
      loadSpaces();
    }
  }, [activeTab]);

  const loadSpaces = async () => {
    try {
      const tiles = await getTiles();
      setSpacesTiles(tiles);
      const categoryArrangement = await getCategoryArrangement();
      if (categoryArrangement.length > 0) {
        setSpacesCategoryOrder(categoryArrangement.map(c => c.categoryName));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load spaces');
    }
  };

  const handleApprove = async (userId: number) => {
    try {
      setProcessing(userId);
      await authService.approveUser(userId);
      await loadData();
      if (onUserApproved) {
        onUserApproved();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve user');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId: number) => {
    if (!confirm('Are you sure you want to reject this user? This will delete their account.')) {
      return;
    }

    try {
      setProcessing(userId);
      await authService.rejectUser(userId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reject user');
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This will permanently delete their account and all their data.`)) {
      return;
    }

    try {
      setProcessing(userId);
      await authService.deleteUser(userId);
      await loadData();
      if (onUserApproved) {
        onUserApproved();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setProcessing(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordModal.userId || !newPassword.trim()) {
      setError('Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setResetPasswordLoading(true);
      setError('');
      await authService.resetUserPassword(resetPasswordModal.userId, newPassword);
      setResetPasswordModal({ open: false, userId: null, username: '' });
      setNewPassword('');
      alert('Password reset successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Panel</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage users and approvals</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'pending'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Pending Users
          {pendingUsers.length > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs font-semibold">
              {pendingUsers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'all'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          All Users
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'settings'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'database'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Database
        </button>
        <button
          onClick={() => setActiveTab('spaces')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'spaces'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Spaces
        </button>
        <button
          onClick={() => setActiveTab('ldap')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'ldap'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          LDAP
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      ) : (
        <>
          {/* Pending Users Tab */}
          {activeTab === 'pending' && (
            pendingUsers.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-slate-600 dark:text-slate-400 font-medium">No pending users</p>
                <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">All users have been processed</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Registered</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {pendingUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white font-bold">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-white">{user.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-500">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApprove(user.id)}
                                disabled={processing === user.id}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                              >
                                {processing === user.id ? (
                                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                  </svg>
                                )}
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(user.id)}
                                disabled={processing === user.id}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                              >
                                {processing === user.id ? (
                                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                  </svg>
                                )}
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* All Users Tab */}
          {activeTab === 'all' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Registered</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {allUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${user.is_admin
                              ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                              : 'bg-gradient-to-br from-brand-500 to-brand-600'
                              }`}>
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900 dark:text-white">{user.username}</span>
                              <div className="flex items-center gap-2 mt-1">
                                {user.is_admin && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                                    Admin
                                  </span>
                                )}
                                {user.auth_source === 'ldap' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                                    LDAP
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                                    Local
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.is_approved ? (
                            <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                              Approved
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-semibold">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-500">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {!user.is_admin && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    setProcessing(user.id);
                                    setError('');
                                    const result = await authService.toggleAuthSource(user.id);
                                    // Update the user in the local state
                                    setAllUsers(prevUsers => 
                                      prevUsers.map(u => 
                                        u.id === user.id ? { ...u, auth_source: result.auth_source } : u
                                      )
                                    );
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to toggle auth source');
                                  } finally {
                                    setProcessing(null);
                                  }
                                }}
                                disabled={processing === user.id}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                                title={`Toggle Auth Source (Current: ${user.auth_source === 'ldap' ? 'LDAP' : 'Local'})`}
                              >
                                {processing === user.id ? (
                                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                  </svg>
                                )}
                                Toggle
                              </button>
                              <button
                                onClick={() => setResetPasswordModal({ open: true, userId: user.id, username: user.username })}
                                disabled={processing === user.id}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                                title="Reset Password"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                </svg>
                                Reset
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                disabled={processing === user.id}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                                title="Delete User"
                              >
                                {processing === user.id ? (
                                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                  </svg>
                                )}
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Database Tab */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Database Export & Import</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  Export your database as a JSON file for backup or import it to restore data on a new instance.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Export Section */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Export Database</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Download all database data (users, tiles, sections, links, settings) as a JSON file.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            setExporting(true);
                            setError('');
                            await databaseService.exportDatabase();
                            alert('Database exported successfully!');
                          } catch (err: any) {
                            setError(err.message || 'Failed to export database');
                          } finally {
                            setExporting(false);
                          }
                        }}
                        disabled={exporting}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        {exporting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Exporting...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                            </svg>
                            Export Database
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Import Section */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Import Database</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Import a previously exported JSON file. This will replace all existing data.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                            Select JSON File
                          </label>
                          <input
                            type="file"
                            accept=".json,application/json"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setImportFile(file);
                                setError('');
                              }
                            }}
                            className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                          />
                          {importFile && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                              Selected: {importFile.name}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            if (!importFile) {
                              setError('Please select a JSON file to import');
                              return;
                            }

                            if (!confirm('WARNING: This will replace ALL existing data in the database. Are you sure you want to continue?')) {
                              return;
                            }

                            try {
                              setImporting(true);
                              setError('');
                              const result = await databaseService.importDatabase(importFile);
                              setImportFile(null);
                              const importedDetails = [
                                `Users: ${result.imported.users}`,
                                `Tiles: ${result.imported.tiles}`,
                                `Tabs: ${result.imported.tabs || 0}`,
                                `Sections: ${result.imported.sections}`,
                                `Links: ${result.imported.links}`,
                                `Settings: ${result.imported.settings}`
                              ];
                              if (result.imported.tile_arrangements !== undefined) {
                                importedDetails.push(`Tile Arrangements: ${result.imported.tile_arrangements}`);
                              }
                              if (result.imported.category_arrangements !== undefined) {
                                importedDetails.push(`Category Arrangements: ${result.imported.category_arrangements}`);
                              }
                              alert(`Database imported successfully!\n\nImported:\n- ${importedDetails.join('\n- ')}`);
                              // Reload data after import
                              await loadData();
                              await loadSettings();
                            } catch (err: any) {
                              setError(err.message || 'Failed to import database');
                            } finally {
                              setImporting(false);
                            }
                          }}
                          disabled={importing || !importFile}
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          {importing ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Importing...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03l2.955-3.129V13.25z" />
                                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                              </svg>
                              Import Database
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Important Notes</p>
                      <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                        <li>Export creates a complete backup of all database tables (users, tiles, sections, links, settings, arrangements)</li>
                        <li>Export includes all data: user authentication sources, link health status, visibility settings, notes, and tooltips</li>
                        <li>Import will replace ALL existing data - use with caution</li>
                        <li>Always export before importing to avoid data loss</li>
                        <li>The exported file contains sensitive information - keep it secure</li>
                        <li>Database indexes are automatically recreated after import for optimal performance</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Spaces Tab */}
          {activeTab === 'spaces' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Spaces Export & Import</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  Export your spaces to JSON or CSV format, or import spaces from previously exported files or CSV spreadsheets.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Export Section */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Export Spaces</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Export all spaces to JSON or CSV format for backup or sharing.
                      </p>
                      <div className="space-y-2">
                        <button
                          onClick={async () => {
                            try {
                              setSpacesExporting(true);
                              setError('');
                              await loadSpaces();
                              exportAllCategoriesToFile(spacesTiles, spacesCategoryOrder);
                              alert('Spaces exported successfully!');
                            } catch (err: any) {
                              setError(err.message || 'Failed to export spaces');
                            } finally {
                              setSpacesExporting(false);
                            }
                          }}
                          disabled={spacesExporting || spacesTiles.length === 0}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          {spacesExporting ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Exporting...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                              </svg>
                              Export to JSON
                            </>
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              setSpacesExporting(true);
                              setError('');
                              await loadSpaces();
                              
                              // Convert tiles to CSV format
                              const csvRows: string[] = [];
                              csvRows.push('Tile Title,Tile Description,Tile Emoji,Tile Theme Color,Tile Group,Tab Title,Section Title,Link Label,Link URL,Link Visibility,Link Notes,Link Tooltip');
                              
                              spacesTiles.forEach(tile => {
                                // Handle tabs structure (new structure)
                                if (tile.tabs && tile.tabs.length > 0) {
                                  tile.tabs.forEach(tab => {
                                    if (tab.sections && tab.sections.length > 0) {
                                      tab.sections.forEach(section => {
                                        if (section.links && section.links.length > 0) {
                                          section.links.forEach(link => {
                                            const row = [
                                              `"${(tile.title || '').replace(/"/g, '""')}"`,
                                              `"${(tile.description || '').replace(/"/g, '""')}"`,
                                              `"${(tile.emoji || '📁').replace(/"/g, '""')}"`,
                                              `"${(tile.themeColor || 'blue').replace(/"/g, '""')}"`,
                                              `"${(tile.group || 'General').replace(/"/g, '""')}"`,
                                              `"${(tab.title || '').replace(/"/g, '""')}"`,
                                              `"${(section.title || '').replace(/"/g, '""')}"`,
                                              `"${(link.label || '').replace(/"/g, '""')}"`,
                                              `"${(link.url || '').replace(/"/g, '""')}"`,
                                              `"${(link.visibility || 'public').replace(/"/g, '""')}"`,
                                              `"${((link.notes || '').replace(/"/g, '""'))}"`,
                                              `"${((link.tooltip || '').replace(/"/g, '""'))}"`
                                            ];
                                            csvRows.push(row.join(','));
                                          });
                                        }
                                      });
                                    }
                                  });
                                }
                                // Handle sections structure (backward compatibility)
                                else if (tile.sections && tile.sections.length > 0) {
                                  tile.sections.forEach(section => {
                                    if (section.links && section.links.length > 0) {
                                      section.links.forEach(link => {
                                        const row = [
                                          `"${(tile.title || '').replace(/"/g, '""')}"`,
                                          `"${(tile.description || '').replace(/"/g, '""')}"`,
                                          `"${(tile.emoji || '📁').replace(/"/g, '""')}"`,
                                          `"${(tile.themeColor || 'blue').replace(/"/g, '""')}"`,
                                          `"${(tile.group || 'General').replace(/"/g, '""')}"`,
                                          `""`, // No tab title for legacy sections
                                          `"${(section.title || '').replace(/"/g, '""')}"`,
                                          `"${(link.label || '').replace(/"/g, '""')}"`,
                                          `"${(link.url || '').replace(/"/g, '""')}"`,
                                          `"${(link.visibility || 'public').replace(/"/g, '""')}"`,
                                          `"${((link.notes || '').replace(/"/g, '""'))}"`,
                                          `"${((link.tooltip || '').replace(/"/g, '""'))}"`
                                        ];
                                        csvRows.push(row.join(','));
                                      });
                                    }
                                  });
                                }
                              });
                              
                              const csvContent = csvRows.join('\n');
                              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'linknest-spaces-export.csv';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              window.URL.revokeObjectURL(url);
                              
                              alert('Spaces exported to CSV successfully!');
                            } catch (err: any) {
                              setError(err.message || 'Failed to export spaces to CSV');
                            } finally {
                              setSpacesExporting(false);
                            }
                          }}
                          disabled={spacesExporting || spacesTiles.length === 0}
                          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          {spacesExporting ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Exporting...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.06l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.451 3.45a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd" />
                              </svg>
                              Export to CSV
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Import Section */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Import Spaces</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Import spaces from exported JSON files or CSV spreadsheets.
                      </p>
                      <div className="space-y-3">
                        {/* JSON Import - Supports Single Space, Category, or All Categories */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                            Import from JSON
                            <span className="text-xs text-slate-500 dark:text-slate-500 ml-1">(Single Space / Category / All Categories)</span>
                          </label>
                          <input
                            type="file"
                            accept=".json,application/json"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSpacesImportFile(file);
                                setError('');
                              }
                            }}
                            className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                          />
                          {spacesImportFile && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                              Selected: {spacesImportFile.name}
                            </p>
                          )}
                          <button
                            onClick={async () => {
                              if (!spacesImportFile) {
                                setError('Please select a JSON file to import');
                                return;
                              }

                              try {
                                setSpacesImporting(true);
                                setError('');
                                const text = await spacesImportFile.text();
                                const data = JSON.parse(text);
                                
                                // Validate and parse the import file
                                const parsed = parseSpaceExportObject(data);
                                
                                // Check if it's a single tile, category, or all categories
                                let importType = '';
                                let tileCount = 0;
                                
                                if (parsed.type === 'tile') {
                                  importType = 'single space';
                                  tileCount = parsed.tiles.length;
                                } else if (parsed.type === 'category') {
                                  importType = `category "${parsed.categoryName || 'Unknown'}"`;
                                  tileCount = parsed.tiles.length;
                                } else if (parsed.type === 'all_categories') {
                                  importType = 'all categories';
                                  tileCount = parsed.tiles.length;
                                }
                                
                                const newTiles = normalizeImportedTiles(parsed);

                                if (!newTiles.length) {
                                  setError('No spaces found to import.');
                                  return;
                                }

                                // Import tiles one by one using createTile API
                                let imported = 0;
                                let errors: string[] = [];
                                
                                for (const tile of newTiles) {
                                  try {
                                    await createTile(tile);
                                    imported++;
                                  } catch (err: any) {
                                    const errorMsg = err.message || 'Unknown error';
                                    errors.push(`Failed to import "${tile.title}": ${errorMsg}`);
                                    console.error('Failed to import tile:', tile.title, err);
                                  }
                                }

                                const result = {
                                  success: imported > 0,
                                  created: imported,
                                  errors: errors.length,
                                  createdTiles: newTiles.slice(0, imported).map(t => ({ id: t.id, title: t.title })),
                                  errorMessages: errors
                                };

                                setSpacesImportFile(null);
                                
                                if (result.success) {
                                  let message = `Successfully imported ${result.created} space(s) from ${importType}.`;
                                  if (result.errors > 0) {
                                    message += `\n\n${result.errors} error(s) occurred:`;
                                    result.errorMessages.forEach((msg, idx) => {
                                      message += `\n${idx + 1}. ${msg}`;
                                    });
                                  }
                                  alert(message);
                                  await loadSpaces();
                                  window.location.reload();
                                } else {
                                  setError('Import failed. Please check the console for details.');
                                }
                              } catch (err: any) {
                                console.error('Import error:', err);
                                setError(err.message || 'Failed to import spaces. Please ensure the file is a valid LinkNest export.');
                              } finally {
                                setSpacesImporting(false);
                              }
                            }}
                            disabled={spacesImporting || !spacesImportFile}
                            className="mt-2 w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                          >
                            {spacesImporting ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Importing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M9.25 3.75A.75.75 0 0110 3h5.25A2.75 2.75 0 0118 5.75v8.5A2.75 2.75 0 0115.25 17h-10.5A2.75 2.75 0 012 14.25V10a.75.75 0 011.5 0v4.25c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-8.5c0-.69-.56-1.25-1.25-1.25H10a.75.75 0 01-.75-.75z" />
                                  <path d="M6.75 5.75a.75.75 0 011.5 0v4.5h1.5a.75.75 0 010 1.5h-4a.75.75 0 01-.75-.75v-4a.75.75 0 011.5 0v2.19l3.22-3.22a.75.75 0 111.06 1.06L6.75 9.81V5.75z" />
                                </svg>
                                Import JSON
                              </>
                            )}
                          </button>
                        </div>

                        {/* CSV Import */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                            Import from CSV (Bulk Import)
                          </label>
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSpacesBulkImportFile(file);
                                setError('');
                              }
                            }}
                            className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 dark:file:bg-violet-900/30 dark:file:text-violet-300 cursor-pointer"
                          />
                          {spacesBulkImportFile && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                              Selected: {spacesBulkImportFile.name}
                            </p>
                          )}
                          <button
                            onClick={async () => {
                              if (!spacesBulkImportFile) {
                                setError('Please select a CSV file to import');
                                return;
                              }

                              try {
                                setSpacesBulkImporting(true);
                                setError('');
                                const result = await bulkImportTiles(spacesBulkImportFile);
                                
                                if (result.success) {
                                  let message = `Successfully imported ${result.created} tile(s).`;
                                  if (result.errors > 0) {
                                    message += `\n\n${result.errors} error(s) occurred:`;
                                    result.errorMessages.forEach((msg, idx) => {
                                      message += `\n${idx + 1}. ${msg}`;
                                    });
                                  }
                                  alert(message);
                                  setSpacesBulkImportFile(null);
                                  await loadSpaces();
                                  window.location.reload();
                                } else {
                                  setError('Bulk import failed. Please check the console for details.');
                                }
                              } catch (err: any) {
                                setError(err.message || 'Failed to bulk import spaces');
                              } finally {
                                setSpacesBulkImporting(false);
                              }
                            }}
                            disabled={spacesBulkImporting || !spacesBulkImportFile}
                            className="mt-2 w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                          >
                            {spacesBulkImporting ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Importing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.06l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.451 3.45a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd" />
                                </svg>
                                Import CSV
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Import/Export Notes</p>
                      <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li><strong>JSON Import:</strong> Supports single space exports, category exports, or all categories exports</li>
                        <li><strong>JSON Export:</strong> Preserves all space data including categories and arrangements</li>
                        <li><strong>CSV Export:</strong> Creates a spreadsheet-friendly format for bulk editing</li>
                        <li><strong>CSV Import:</strong> Requires specific column format - download template for reference</li>
                        <li>Importing spaces adds them to your existing collection (does not replace existing spaces)</li>
                        <li>Both formats support all link properties (visibility, notes, tooltips)</li>
                        <li>Category imports preserve the category name from the export file</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LDAP Tab */}
          {activeTab === 'ldap' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">LDAP Configuration</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Configure LDAP integration for user authentication.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={settings.ldap_enabled === '1'}
                        onChange={(e) => setSettings({ ...settings, ldap_enabled: e.target.checked ? '1' : '0' })}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                      <span className="ml-3 text-sm font-medium text-slate-900 dark:text-slate-300">Enable LDAP</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Connection Settings */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Connection</h4>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Server Host</label>
                      <input
                        type="text"
                        value={settings.ldap_server || ''}
                        onChange={(e) => setSettings({ ...settings, ldap_server: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        placeholder="ldap.example.com"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Port</label>
                        <input
                          type="number"
                          value={settings.ldap_port || '389'}
                          onChange={(e) => setSettings({ ...settings, ldap_port: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Timeout (sec)</label>
                        <input
                          type="number"
                          value={settings.ldap_timeout || '30'}
                          onChange={(e) => setSettings({ ...settings, ldap_timeout: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Protocol</label>
                        <select
                          value={settings.ldap_protocol || 'ldap'}
                          onChange={(e) => setSettings({ ...settings, ldap_protocol: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="ldap">LDAP</option>
                          <option value="ldaps">LDAPS (SSL)</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.ldap_tls === '1'}
                            onChange={(e) => setSettings({ ...settings, ldap_tls: e.target.checked ? '1' : '0' })}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Use StartTLS</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Authentication Settings */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Service Account (Bind)</h4>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Bind DN</label>
                      <input
                        type="text"
                        value={settings.ldap_bind_dn || ''}
                        onChange={(e) => setSettings({ ...settings, ldap_bind_dn: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        placeholder="cn=admin,dc=example,dc=com"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Leave empty for anonymous bind</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Bind Password</label>
                      <SecurePasswordInput
                        value={settings.ldap_bind_password || ''}
                        onChange={(e) => {
                          const password = e.target.value;
                          ldapBindPasswordRef.current = password; // Store in ref for immediate access
                          setSettings({ ...settings, ldap_bind_password: password });
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {/* User Schema */}
                  <div className="space-y-4 md:col-span-2">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">User Schema</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Base DN</label>
                          <input
                            type="text"
                            value={settings.ldap_user_search_base || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_user_search_base: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                            placeholder="ou=users,dc=example,dc=com"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">User Filter</label>
                          <input
                            type="text"
                            value={settings.ldap_user_filter || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_user_filter: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            placeholder="(sAMAccountName={username})"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Use {`{username}`} as placeholder for login input</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Attributes</label>
                          <input
                            type="text"
                            value={settings.ldap_user_attributes || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_user_attributes: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            placeholder="sAMAccountName,mail,displayName"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Comma separated list of attributes to fetch</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Group Membership */}
                  <div className="space-y-4 md:col-span-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Group Membership</h4>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.ldap_require_group_membership === '1'}
                            onChange={(e) => setSettings({ ...settings, ldap_require_group_membership: e.target.checked ? '1' : '0' })}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Require Group Membership</span>
                        </label>
                        <p className="text-[10px] text-slate-500 ml-6">Only allow users who are members of specific groups</p>
                      </div>

                      {settings.ldap_require_group_membership === '1' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Required Groups (comma-separated)</label>
                          <input
                            type="text"
                            value={settings.ldap_required_groups || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_required_groups: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            placeholder="CN=Admins,CN=Users,DC=example,DC=com"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">User must be a member of at least one of these groups. Enter full DN or partial match.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Advanced Options */}
                  <div className="space-y-4 md:col-span-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Advanced Options</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Search Scope</label>
                          <select
                            value={settings.ldap_search_scope || 'sub'}
                            onChange={(e) => setSettings({ ...settings, ldap_search_scope: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="base">Base (exact match only)</option>
                            <option value="one">One-level (immediate children)</option>
                            <option value="sub">Subtree (recursive, default)</option>
                          </select>
                          <p className="text-[10px] text-slate-500 mt-1">How deep to search in the directory tree</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">User DN Template (Alternative)</label>
                          <input
                            type="text"
                            value={settings.ldap_user_dn_template || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_user_dn_template: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            placeholder="CN={username},CN=Users,DC=example,DC=com"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Direct bind without search. Use {`{username}`} placeholder. Leave empty to use search-based auth.</p>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.ldap_nested_groups === '1'}
                              onChange={(e) => setSettings({ ...settings, ldap_nested_groups: e.target.checked ? '1' : '0' })}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Enable Nested Group Support</span>
                          </label>
                          <p className="text-[10px] text-slate-500 ml-6">Check group membership recursively through nested groups</p>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.ldap_case_sensitive === '1'}
                              onChange={(e) => setSettings({ ...settings, ldap_case_sensitive: e.target.checked ? '1' : '0' })}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Case Sensitive Username Matching</span>
                          </label>
                          <p className="text-[10px] text-slate-500 ml-6">Require exact case match for usernames (default: case-insensitive)</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Connection Retries</label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={settings.ldap_connection_retry || '3'}
                              onChange={(e) => setSettings({ ...settings, ldap_connection_retry: e.target.value })}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Retry Delay (sec)</label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={settings.ldap_retry_delay || '1'}
                              onChange={(e) => setSettings({ ...settings, ldap_retry_delay: e.target.value })}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.ldap_ssl_verify === '1'}
                              onChange={(e) => setSettings({ ...settings, ldap_ssl_verify: e.target.checked ? '1' : '0' })}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Verify SSL Certificates</span>
                          </label>
                          <p className="text-[10px] text-slate-500 ml-6">Validate SSL/TLS certificates (recommended: enabled)</p>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.ldap_referrals === '1'}
                              onChange={(e) => setSettings({ ...settings, ldap_referrals: e.target.checked ? '1' : '0' })}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Follow LDAP Referrals</span>
                          </label>
                          <p className="text-[10px] text-slate-500 ml-6">Follow referrals to other LDAP servers (default: disabled)</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Custom Email Attribute</label>
                          <input
                            type="text"
                            value={settings.ldap_email_attribute || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_email_attribute: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            placeholder="mail"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Override default email attribute (leave empty for auto-detect)</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Custom Display Name Attribute</label>
                          <input
                            type="text"
                            value={settings.ldap_display_name_attribute || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_display_name_attribute: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            placeholder="displayName"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Override default display name attribute (leave empty for auto-detect)</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Login Domain (UI Label)</label>
                          <input
                            type="text"
                            value={settings.ldap_login_domain || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_login_domain: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                            placeholder="oneflorida.org"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            Optional: override the domain shown in the login dropdown (e.g. oneflorida.org). If empty, it is derived from Base DN or server hostname.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Connection */}
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Test Connection</h4>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        setLdapTestLoading(true);
                        setLdapTestResult(null);
                        
                        // Use ref value first (most up-to-date), fallback to state
                        const bindPassword = ldapBindPasswordRef.current || settings.ldap_bind_password || '';
                        
                        // Ensure bind password doesn't contain dots (should never happen, but safety check)
                        if (bindPassword.includes('•')) {
                          setLdapTestResult({ 
                            success: false, 
                            message: 'Password field contains invalid characters. Please re-enter the password.' 
                          });
                          setLdapTestLoading(false);
                          return;
                        }
                        
                        // Create settings object with the real password
                        const testSettings = { ...settings, ldap_bind_password: bindPassword };
                        const result = await settingsService.testLdapConnection(testSettings, ldapTestUser, ldapTestPassword);
                        setLdapTestResult(result);
                      } catch (err: any) {
                        setLdapTestResult({ success: false, message: err.message });
                      } finally {
                        setLdapTestLoading(false);
                      }
                    }}
                    className="flex flex-col md:flex-row gap-4 items-end"
                  >
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Test Username</label>
                      <input
                        type="text"
                        value={ldapTestUser}
                        onChange={(e) => setLdapTestUser(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        placeholder="Optional: Test authentication for user"
                        autoComplete="username"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Test Password</label>
                      <SecurePasswordInput
                        value={ldapTestPassword}
                        onChange={(e) => setLdapTestPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                        placeholder="Optional"
                        autoComplete="current-password"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={ldapTestLoading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                      {ldapTestLoading ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                        </svg>
                      )}
                      Test Connection
                    </button>
                  </form>

                  {ldapTestResult && (
                    <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${ldapTestResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                      }`}>
                      {ldapTestResult.success ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                      )}
                      <div>
                        <p className="font-semibold">{ldapTestResult.success ? 'Connection Successful' : 'Connection Failed'}</p>
                        <p className="mt-1">{ldapTestResult.message}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Export & Import LDAP Settings */}
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Export & Import LDAP Settings</h4>

                  <div className="flex flex-wrap gap-3 items-start">
                    {/* Export Section */}
                    <button
                          onClick={async () => {
                            try {
                              setLdapExporting(true);
                              setError('');
                              
                              // Filter only LDAP-related settings
                              const ldapSettings: Partial<AppSettings> = {};
                              const ldapKeys = [
                                'ldap_enabled', 'ldap_server', 'ldap_port', 'ldap_protocol', 'ldap_base_dn',
                                'ldap_login_domain', 'ldap_bind_dn', 'ldap_bind_password',
                                'ldap_user_search_base', 'ldap_user_filter', 'ldap_user_attributes',
                                'ldap_group_search_base', 'ldap_group_filter', 'ldap_group_attributes',
                                'ldap_auto_create_users', 'ldap_auto_update_users', 'ldap_sync_interval',
                                'ldap_require_group_membership', 'ldap_required_groups', 'ldap_timeout', 'ldap_tls',
                                'ldap_search_scope', 'ldap_user_dn_template', 'ldap_nested_groups', 'ldap_case_sensitive',
                                'ldap_ssl_verify', 'ldap_connection_retry', 'ldap_retry_delay', 'ldap_email_attribute',
                                'ldap_display_name_attribute', 'ldap_referrals'
                              ];
                              
                              ldapKeys.forEach(key => {
                                if (settings[key as keyof AppSettings] !== undefined) {
                                  ldapSettings[key as keyof AppSettings] = settings[key as keyof AppSettings];
                                }
                              });
                              
                              // Encrypt password before exporting
                              if (ldapSettings.ldap_bind_password && ldapSettings.ldap_bind_password.trim() !== '') {
                                try {
                                  ldapSettings.ldap_bind_password = await settingsService.encryptPassword(ldapSettings.ldap_bind_password);
                                } catch (encryptErr: any) {
                                  throw new Error('Failed to encrypt password: ' + (encryptErr.message || 'Unknown error'));
                                }
                              }
                              
                              // Create JSON blob
                              const jsonData = JSON.stringify(ldapSettings, null, 2);
                              const blob = new Blob([jsonData], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              
                              // Create download link
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `ldap-settings-${new Date().toISOString().split('T')[0]}.json`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              
                              alert('LDAP settings exported successfully!');
                            } catch (err: any) {
                              setError(err.message || 'Failed to export LDAP settings');
                            } finally {
                              setLdapExporting(false);
                            }
                          }}
                          disabled={ldapExporting}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        >
                          {ldapExporting ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Exporting...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                              </svg>
                              Export
                            </>
                          )}
                        </button>

                    {/* Import Section */}
                    <div className="flex items-center gap-2">
                      <input
                              type="file"
                              accept=".json,application/json"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setLdapImportFile(file);
                                  setError('');
                                }
                              }}
                        className="text-xs text-slate-600 dark:text-slate-400 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                      />
                      <button
                            onClick={async () => {
                              if (!ldapImportFile) {
                                setError('Please select a JSON file to import');
                                return;
                              }

                              if (!confirm('This will replace all existing LDAP settings. Are you sure you want to continue?')) {
                                return;
                              }

                              try {
                                setLdapImporting(true);
                                setError('');
                                
                                // Read file content
                                const fileContent = await ldapImportFile.text();
                                const importedSettings = JSON.parse(fileContent);
                                
                                // Validate that it's an object
                                if (typeof importedSettings !== 'object' || importedSettings === null) {
                                  throw new Error('Invalid JSON format');
                                }
                                
                                // Filter only valid LDAP keys
                                const validLdapKeys = [
                                  'ldap_enabled', 'ldap_server', 'ldap_port', 'ldap_protocol', 'ldap_base_dn',
                                  'ldap_login_domain', 'ldap_bind_dn', 'ldap_bind_password',
                                  'ldap_user_search_base', 'ldap_user_filter', 'ldap_user_attributes',
                                  'ldap_group_search_base', 'ldap_group_filter', 'ldap_group_attributes',
                                  'ldap_auto_create_users', 'ldap_auto_update_users', 'ldap_sync_interval',
                                  'ldap_require_group_membership', 'ldap_required_groups', 'ldap_timeout', 'ldap_tls',
                                  'ldap_search_scope', 'ldap_user_dn_template', 'ldap_nested_groups', 'ldap_case_sensitive',
                                  'ldap_ssl_verify', 'ldap_connection_retry', 'ldap_retry_delay', 'ldap_email_attribute',
                                  'ldap_display_name_attribute', 'ldap_referrals'
                                ];
                                
                                const filteredSettings: Partial<AppSettings> = {};
                                validLdapKeys.forEach(key => {
                                  if (importedSettings[key] !== undefined) {
                                    filteredSettings[key as keyof AppSettings] = importedSettings[key];
                                  }
                                });
                                
                                // Decrypt password if it's encrypted (handles both encrypted and plain text for backward compatibility)
                                if (filteredSettings.ldap_bind_password && filteredSettings.ldap_bind_password.trim() !== '') {
                                  try {
                                    // Try to decrypt - decryptPassword handles plain text passwords too
                                    filteredSettings.ldap_bind_password = await settingsService.decryptPassword(filteredSettings.ldap_bind_password);
                                  } catch (decryptErr: any) {
                                    // If decryption fails, it might be plain text (old export format)
                                    // Keep it as is - the backend will handle it
                                    console.warn('Password decryption failed, assuming plain text:', decryptErr.message);
                                  }
                                }
                                
                                // Update settings
                                await settingsService.updateSettings(filteredSettings);
                                
                                // Reload settings to reflect changes
                                await loadSettings();
                                await refreshSettings();
                                
                                setLdapImportFile(null);
                                alert('LDAP settings imported successfully!');
                              } catch (err: any) {
                                setError(err.message || 'Failed to import LDAP settings. Please check the file format.');
                              } finally {
                                setLdapImporting(false);
                              }
                            }}
                            disabled={ldapImporting || !ldapImportFile}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                          >
                            {ldapImporting ? (
                              <>
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Importing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03l2.955-3.129V13.25z" />
                                  <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                </svg>
                                Import
                              </>
                            )}
                          </button>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={async () => {
                      try {
                        setSettingsSaving(true);
                        setError('');
                        await settingsService.updateSettings(settings);
                        // Refresh global settings context so AuthModal sees latest LDAP status
                        await refreshSettings();
                        alert('LDAP settings saved successfully!');
                      } catch (err: any) {
                        setError(err.message || 'Failed to save settings');
                      } finally {
                        setSettingsSaving(false);
                      }
                    }}
                    disabled={settingsSaving}
                    className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    {settingsSaving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        Save Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {settingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Application Settings */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Application Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Application Name
                        </label>
                        <input
                          type="text"
                          value={settings.app_name}
                          onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          placeholder="LinkNest"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Page Title
                        </label>
                        <input
                          type="text"
                          value={settings.page_title}
                          onChange={(e) => setSettings({ ...settings, page_title: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          placeholder="LinkNest"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Spaces Page Title
                        </label>
                        <input
                          type="text"
                          value={settings.spaces_title}
                          onChange={(e) => setSettings({ ...settings, spaces_title: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          placeholder="My Spaces"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Logo Type
                        </label>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setSettings({ ...settings, logo_type: 'icon' });
                              setLogoPreview(null);
                            }}
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${settings.logo_type === 'icon'
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                          >
                            Icon/Emoji
                          </button>
                          <button
                            onClick={() => {
                              setSettings({ ...settings, logo_type: 'image' });
                              if (settings.logo_image) {
                                setLogoPreview(settings.logo_image);
                              }
                            }}
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${settings.logo_type === 'image'
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                          >
                            Image
                          </button>
                        </div>
                      </div>

                      {settings.logo_type === 'icon' ? (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Logo Icon/Emoji
                          </label>
                          <input
                            type="text"
                            value={settings.logo_icon}
                            onChange={(e) => setSettings({ ...settings, logo_icon: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-2xl text-center focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            placeholder="🔗"
                            maxLength={2}
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Enter an emoji or icon character</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Logo Image
                            </label>

                            {/* Image Preview */}
                            {(logoPreview || settings.logo_image) && (
                              <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={logoPreview || settings.logo_image}
                                    alt="Logo preview"
                                    className="w-16 h-16 object-contain rounded border border-slate-200 dark:border-slate-700"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="flex-1">
                                    <p className="text-xs text-slate-600 dark:text-slate-400">Current logo preview</p>
                                    {settings.logo_image && (
                                      <button
                                        onClick={() => {
                                          setSettings({ ...settings, logo_image: '' });
                                          setLogoPreview(null);
                                        }}
                                        className="mt-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Remove logo
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* File Upload */}
                            <div className="mb-3">
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                                Upload Logo Image
                              </label>
                              <div className="relative">
                                <input
                                  type="file"
                                  accept="image/jpeg,image/jpg,image/png,image/gif,image/svg+xml,image/webp"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    // Validate file size (2MB)
                                    if (file.size > 2 * 1024 * 1024) {
                                      setError('File size too large. Maximum size: 2MB');
                                      e.target.value = '';
                                      return;
                                    }

                                    // Validate dimensions (skip for SVG)
                                    const isSVG = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
                                    const objectUrl = URL.createObjectURL(file);

                                    if (isSVG) {
                                      // For SVG, just show preview and upload
                                      setLogoPreview(objectUrl);
                                      try {
                                        setLogoUploading(true);
                                        setError('');
                                        const url = await settingsService.uploadLogo(file);
                                        setSettings({ ...settings, logo_image: url });
                                        setLogoPreview(null); // Clear preview after upload
                                        URL.revokeObjectURL(objectUrl);
                                      } catch (err: any) {
                                        setError(err.message || 'Failed to upload logo');
                                        setLogoPreview(null);
                                        URL.revokeObjectURL(objectUrl);
                                      } finally {
                                        setLogoUploading(false);
                                        e.target.value = '';
                                      }
                                    } else {
                                      // For raster images, validate dimensions
                                      const img = new Image();

                                      img.onload = async () => {
                                        const maxWidth = 512;
                                        const maxHeight = 512;
                                        const minWidth = 32;
                                        const minHeight = 32;

                                        if (img.width > maxWidth || img.height > maxHeight) {
                                          setError(`Image dimensions too large. Maximum: ${maxWidth}x${maxHeight}px. Your image: ${img.width}x${img.height}px`);
                                          URL.revokeObjectURL(objectUrl);
                                          e.target.value = '';
                                          return;
                                        }

                                        if (img.width < minWidth || img.height < minHeight) {
                                          setError(`Image dimensions too small. Minimum: ${minWidth}x${minHeight}px. Your image: ${img.width}x${img.height}px`);
                                          URL.revokeObjectURL(objectUrl);
                                          e.target.value = '';
                                          return;
                                        }

                                        // Show preview
                                        setLogoPreview(objectUrl);

                                        // Upload file
                                        try {
                                          setLogoUploading(true);
                                          setError('');
                                          const url = await settingsService.uploadLogo(file);
                                          setSettings({ ...settings, logo_image: url });
                                          setLogoPreview(null); // Clear preview after upload
                                          URL.revokeObjectURL(objectUrl);
                                        } catch (err: any) {
                                          setError(err.message || 'Failed to upload logo');
                                          setLogoPreview(null);
                                          URL.revokeObjectURL(objectUrl);
                                        } finally {
                                          setLogoUploading(false);
                                          e.target.value = '';
                                        }
                                      };

                                      img.onerror = () => {
                                        setError('Invalid image file');
                                        URL.revokeObjectURL(objectUrl);
                                        e.target.value = '';
                                      };

                                      img.src = objectUrl;
                                    }
                                  }}
                                  disabled={logoUploading}
                                  className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                              </div>
                              {logoUploading && (
                                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Uploading...
                                </div>
                              )}
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Allowed: JPEG, PNG, GIF, SVG, WebP | Max size: 2MB | Dimensions: 32x32px to 512x512px
                              </p>
                            </div>

                            {/* URL Input (Alternative) */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                                Or enter Logo Image URL
                              </label>
                              <input
                                type="text"
                                value={settings.logo_image}
                                onChange={(e) => {
                                  setSettings({ ...settings, logo_image: e.target.value });
                                  setLogoPreview(e.target.value || null);
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                placeholder="https://example.com/logo.png"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Favicon Upload Section */}
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Favicon</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                          Upload a favicon (16x16px to 512x512px recommended). This appears in browser tabs and bookmarks.
                        </p>

                        {/* Preview */}
                        {(faviconPreview || settings.favicon) && (
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                              Current Favicon Preview
                            </label>
                            <div className="flex items-center gap-3">
                              <img
                                src={faviconPreview || settings.favicon}
                                alt="Favicon preview"
                                className="w-16 h-16 object-contain border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-2"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <div className="flex-1">
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  {settings.favicon || 'Preview'}
                                </p>
                                {settings.favicon && (
                                  <button
                                    onClick={() => {
                                      setSettings({ ...settings, favicon: '' });
                                      setFaviconPreview(null);
                                    }}
                                    className="mt-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                                  >
                                    Remove favicon
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* File Upload */}
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                            Upload Favicon
                          </label>
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,image/jpeg,image/jpg,image/gif,image/webp,.ico"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                // Validate file size (1MB)
                                if (file.size > 1 * 1024 * 1024) {
                                  setError('File size too large. Maximum size: 1MB');
                                  e.target.value = '';
                                  return;
                                }

                                // Validate dimensions (skip for SVG and ICO)
                                const isSVG = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
                                const isICO = file.name.toLowerCase().endsWith('.ico') || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon';
                                const objectUrl = URL.createObjectURL(file);

                                if (isSVG || isICO) {
                                  // For SVG and ICO, just show preview and upload
                                  setFaviconPreview(objectUrl);
                                  try {
                                    setFaviconUploading(true);
                                    setError('');
                                    const url = await settingsService.uploadFavicon(file);
                                    setSettings({ ...settings, favicon: url });
                                    setFaviconPreview(null); // Clear preview after upload
                                    URL.revokeObjectURL(objectUrl);
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to upload favicon');
                                    setFaviconPreview(null);
                                    URL.revokeObjectURL(objectUrl);
                                  } finally {
                                    setFaviconUploading(false);
                                    e.target.value = '';
                                  }
                                } else {
                                  // For raster images, validate dimensions
                                  const img = new Image();

                                  img.onload = async () => {
                                    const maxWidth = 512;
                                    const maxHeight = 512;
                                    const minWidth = 16;
                                    const minHeight = 16;

                                    if (img.width > maxWidth || img.height > maxHeight) {
                                      setError(`Image dimensions too large. Maximum: ${maxWidth}x${maxHeight}px. Your image: ${img.width}x${img.height}px`);
                                      URL.revokeObjectURL(objectUrl);
                                      e.target.value = '';
                                      return;
                                    }

                                    if (img.width < minWidth || img.height < minHeight) {
                                      setError(`Image dimensions too small. Minimum: ${minWidth}x${minHeight}px. Your image: ${img.width}x${img.height}px`);
                                      URL.revokeObjectURL(objectUrl);
                                      e.target.value = '';
                                      return;
                                    }

                                    // Show preview
                                    setFaviconPreview(objectUrl);

                                    // Upload file
                                    try {
                                      setFaviconUploading(true);
                                      setError('');
                                      const url = await settingsService.uploadFavicon(file);
                                      setSettings({ ...settings, favicon: url });
                                      setFaviconPreview(null); // Clear preview after upload
                                      URL.revokeObjectURL(objectUrl);
                                    } catch (err: any) {
                                      setError(err.message || 'Failed to upload favicon');
                                      setFaviconPreview(null);
                                      URL.revokeObjectURL(objectUrl);
                                    } finally {
                                      setFaviconUploading(false);
                                      e.target.value = '';
                                    }
                                  };

                                  img.onerror = () => {
                                    setError('Invalid image file');
                                    URL.revokeObjectURL(objectUrl);
                                    e.target.value = '';
                                  };

                                  img.src = objectUrl;
                                }
                              }}
                              disabled={faviconUploading}
                              className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                          {faviconUploading && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Uploading...
                            </div>
                          )}
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Allowed: ICO, PNG, SVG, JPEG, GIF, WebP | Max size: 1MB | Dimensions: 16x16px to 512x512px
                          </p>
                        </div>

                        {/* URL Input (Alternative) */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                            Or enter Favicon URL
                          </label>
                          <input
                            type="text"
                            value={settings.favicon}
                            onChange={(e) => {
                              setSettings({ ...settings, favicon: e.target.value });
                              setFaviconPreview(e.target.value || null);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            placeholder="https://example.com/favicon.ico"
                          />
                        </div>
                      </div>

                      {/* Guest Access Toggle */}
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex-1">
                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Enable Guest Access
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              Allow unauthenticated users to view public spaces. When disabled, all users must login to see spaces.
                            </span>
                          </div>
                          <div className="ml-4">
                            <button
                              type="button"
                              onClick={() => {
                                setSettings({ 
                                  ...settings, 
                                  guest_access_enabled: (settings.guest_access_enabled === '1' || settings.guest_access_enabled === undefined) ? '0' : '1' 
                                });
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                (settings.guest_access_enabled === '1' || settings.guest_access_enabled === undefined)
                                  ? 'bg-brand-600' 
                                  : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  (settings.guest_access_enabled === '1' || settings.guest_access_enabled === undefined) ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </label>
                      </div>

                      <button
                        onClick={async () => {
                          try {
                            setSettingsSaving(true);
                            setError('');
                            await settingsService.updateSettings(settings);
                            await loadSettings(); // Reload local settings
                            await refreshSettings(); // Refresh global settings context
                            alert('Settings saved successfully!');
                          } catch (err: any) {
                            setError(err.message || 'Failed to save settings');
                          } finally {
                            setSettingsSaving(false);
                          }
                        }}
                        disabled={settingsSaving}
                        className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                      >
                        {settingsSaving ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </div>

                  {/* Admin Password */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Admin Password</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Change your admin account password
                    </p>
                    <button
                      onClick={() => setAdminPasswordModal(true)}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Change Admin Password
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-sm" onClick={() => {
            setResetPasswordModal({ open: false, userId: null, username: '' });
            setNewPassword('');
            setError('');
          }}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Reset Password</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Reset password for user: <strong>{resetPasswordModal.username}</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  New Password
                </label>
                <SecurePasswordInput
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter new password (min 6 characters)"
                  minLength={6}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setResetPasswordModal({ open: false, userId: null, username: '' });
                    setNewPassword('');
                    setError('');
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={resetPasswordLoading || !newPassword.trim() || newPassword.length < 6}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {resetPasswordLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Change Modal */}
      {adminPasswordModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-sm" onClick={() => {
            setAdminPasswordModal(false);
            setCurrentPassword('');
            setAdminNewPassword('');
            setError('');
          }}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Change Admin Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Current Password
                </label>
                <SecurePasswordInput
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setError('');
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Enter current password"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  New Password
                </label>
                <SecurePasswordInput
                  value={adminNewPassword}
                  onChange={(e) => {
                    setAdminNewPassword(e.target.value);
                    setError('');
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Enter new password (min 6 characters)"
                  minLength={6}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setAdminPasswordModal(false);
                    setCurrentPassword('');
                    setAdminNewPassword('');
                    setError('');
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!currentPassword || !adminNewPassword) {
                      setError('Please fill in all fields');
                      return;
                    }
                    if (adminNewPassword.length < 6) {
                      setError('New password must be at least 6 characters');
                      return;
                    }
                    try {
                      setAdminPasswordLoading(true);
                      setError('');
                      await authService.changeAdminPassword(currentPassword, adminNewPassword);
                      setAdminPasswordModal(false);
                      setCurrentPassword('');
                      setAdminNewPassword('');
                      alert('Admin password changed successfully!');
                    } catch (err: any) {
                      setError(err.message || 'Failed to change password');
                    } finally {
                      setAdminPasswordLoading(false);
                    }
                  }}
                  disabled={adminPasswordLoading || !currentPassword || !adminNewPassword || adminNewPassword.length < 6}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {adminPasswordLoading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
