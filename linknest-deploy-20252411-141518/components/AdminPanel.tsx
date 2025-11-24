import React, { useState, useEffect } from 'react';
import { authService, PendingUser, AllUser } from '../services/authService';
import { settingsService, AppSettings } from '../services/settingsService';
import { useSettings } from '../contexts/SettingsContext';

interface AdminPanelProps {
  onUserApproved?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onUserApproved }) => {
  const { refreshSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'settings'>('pending');
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
    logo_image: ''
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [adminPasswordModal, setAdminPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

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
  }, []);

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
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'pending'
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
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'all'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          All Users
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'settings'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Settings
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
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                              user.is_admin 
                                ? 'bg-gradient-to-br from-amber-500 to-orange-600' 
                                : 'bg-gradient-to-br from-brand-500 to-brand-600'
                            }`}>
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900 dark:text-white">{user.username}</span>
                              {user.is_admin && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                                  Admin
                                </span>
                              )}
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
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              settings.logo_type === 'icon'
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
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              settings.logo_type === 'image'
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
                <input
                  type="password"
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
                <input
                  type="password"
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
                <input
                  type="password"
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
