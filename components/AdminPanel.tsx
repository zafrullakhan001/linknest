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
import { accessService, TilePermission } from '../services/accessService';

// Resolve API base dynamically based on current location
// This ensures API calls work in both dev mode and runtime mode with any base path
function resolveApiBase(): string {
  // Prefer Vite-injected env when available
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  // Fallback: dynamically detect base path from current location
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    
    // Extract base path (everything before the last segment or root)
    // Examples:
    // /linknest/ -> /linknest/api
    // /linknest/index.html -> /linknest/api
    // / -> /api
    if (path !== '/' && path.length > 1) {
      // Remove trailing slash and any filename
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }

  // Default fallback (root deployment)
  return '/api';
}

interface AdminPanelProps {
  onUserApproved?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onUserApproved }) => {
  const { refreshSettings } = useSettings();
  // Initialize activeTab from localStorage or default to 'pending'
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'settings' | 'database' | 'spaces' | 'ldap' | 'footer' | 'access' | 'clone' | 'browser'>(() => {
    const savedTab = localStorage.getItem('adminPanelActiveTab');
    const validTabs: Array<'pending' | 'all' | 'settings' | 'database' | 'spaces' | 'ldap' | 'footer' | 'access' | 'clone' | 'browser'> = ['pending', 'all', 'settings', 'database', 'spaces', 'ldap', 'footer', 'access', 'clone', 'browser'];
    return (savedTab && validTabs.includes(savedTab as any)) ? savedTab as any : 'pending';
  });
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
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
    favicon: '',
    footer_text: '© 2025 Adventhealth - Designed and developed by AIT Architecture team',
    show_database_path_in_footer: '1'
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

  // Add User modal state
  const [addUserModal, setAddUserModal] = useState(false);
  const [addUserType, setAddUserType] = useState<'local' | 'ldap'>('local');
  
  // Local user form state
  const [localUsername, setLocalUsername] = useState('');
  const [localEmail, setLocalEmail] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  
  // LDAP user search state
  const [ldapSearchTerm, setLdapSearchTerm] = useState('');
  const [ldapSearchResults, setLdapSearchResults] = useState<Array<{ username: string; email: string; displayName: string; dn: string }>>([]);
  const [ldapSearchLoading, setLdapSearchLoading] = useState(false);
  const [selectedLdapUser, setSelectedLdapUser] = useState<{ username: string; email: string; displayName: string; dn: string } | null>(null);
  const [addUserLoading, setAddUserLoading] = useState(false);
  
  // Bulk import state
  const [bulkImportMode, setBulkImportMode] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [ldapUsersText, setLdapUsersText] = useState('');
  const [bulkImportLoading, setBulkImportLoading] = useState(false);
  const [bulkImportResults, setBulkImportResults] = useState<{ results: any; summary: any; message: string } | null>(null);

  // Access Manager state
  const [permissions, setPermissions] = useState<TilePermission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionForm, setPermissionForm] = useState({
    userId: 0,
    tileId: '',
    canView: true,
    canEdit: false,
    canDelete: false
  });

  // Clone state
  const [cloneFolderName, setCloneFolderName] = useState('');
  const [cloneSourcePath, setCloneSourcePath] = useState('');
  const [cloneTargetPath, setCloneTargetPath] = useState('');
  const [cloneCopyAssets, setCloneCopyAssets] = useState(false);
  const [cloneCopyDatabase, setCloneCopyDatabase] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneProgress, setCloneProgress] = useState(0);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);
  const [cloneLogs, setCloneLogs] = useState<Array<{time: string; message: string}>>([]);
  const [currentCloneId, setCurrentCloneId] = useState<number | null>(null);
  const [clonesList, setClonesList] = useState<Array<{
    id: number;
    folderName: string;
    url: string;
    status: string;
    progress: number;
    createdAt: number;
    completedAt: number | null;
    errorMessage: string | null;
    sourcePath: string;
    targetPath: string;
    copyAssets: boolean;
    copyDatabase: boolean;
  }>>([]);
  const [clonesLoading, setClonesLoading] = useState(false);
  
  // Clone edit modal state
  const [editCloneModal, setEditCloneModal] = useState<{
    open: boolean;
    clone: {
      id: number;
      folderName: string;
      sourcePath: string;
      targetPath: string;
      copyAssets: boolean;
      copyDatabase: boolean;
    } | null;
  }>({ open: false, clone: null });
  const [editCloneLoading, setEditCloneLoading] = useState(false);
  const [deleteCloneLoading, setDeleteCloneLoading] = useState<number | null>(null);
  const [rerunCloneLoading, setRerunCloneLoading] = useState<number | null>(null);

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
    if (activeTab === 'spaces' || activeTab === 'access') {
      loadSpaces();
    }
    if (activeTab === 'access') {
      loadPermissions();
    }
    if (activeTab === 'clone') {
      loadClonesList();
      loadCurrentPath();
    }
  }, [activeTab]);

  // Persist activeTab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('adminPanelActiveTab', activeTab);
  }, [activeTab]);

  // Browser extension test state
  const [testUrl, setTestUrl] = useState('https://github.com');
  const [testBrowser, setTestBrowser] = useState('chrome-stable');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Check extension status when browser tab is active
  useEffect(() => {
    if (activeTab === 'browser') {
      // Wait a bit for the DOM to be ready
      setTimeout(() => {
        const statusDiv = document.getElementById('extension-status-browser');
        if (!statusDiv) return;

        if (typeof (window as any).BrowserLauncher === 'undefined') {
          statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
          statusDiv.innerHTML = '<div class="text-sm text-amber-800 dark:text-amber-300"><strong>⚠ Error:</strong> Browser Launcher Pro integration script not loaded. Please check the script path.</div>';
          return;
        }

        statusDiv.className = 'p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700';
        statusDiv.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-sm text-slate-600 dark:text-slate-400">Checking extension availability...</span></div>';

        const BrowserLauncher = (window as any).BrowserLauncher;
        
        // Configure extension ID if provided
        if (settings.browser_extension_id) {
          BrowserLauncher.setExtensionId(settings.browser_extension_id);
        }

        BrowserLauncher.checkAvailability((available: boolean, message: string) => {
          if (available) {
            statusDiv.className = 'p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800';
            statusDiv.innerHTML = `<div class="text-sm text-emerald-800 dark:text-emerald-300"><strong>✓ Extension Available:</strong> Browser Launcher Pro is ready!<br><small>Extension ID: ${BrowserLauncher.extensionId || 'Auto-detected'} | ${message}</small></div>`;
          } else {
            statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
            statusDiv.innerHTML = `<div class="text-sm text-amber-800 dark:text-amber-300"><strong>⚠ Extension Status:</strong> ${message}<br><small><strong>Tips:</strong><br>1. Make sure Browser Launcher Pro extension is installed<br>2. Go to chrome://extensions and reload the extension<br>3. Refresh this page</small></div>`;
          }
        }, 5, 1000);
      }, 500);
    }
  }, [activeTab, settings.browser_extension_id]);

  const loadCurrentPath = async () => {
    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/clone/current-path`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        if (!cloneSourcePath) {
          setCloneSourcePath(data.sourcePath || '');
        }
        if (!cloneTargetPath) {
          setCloneTargetPath(data.targetPath || '');
        }
      } else {
        // If API fails, set default paths based on common XAMPP structure
        if (!cloneSourcePath) {
          // Default to current app directory (typically C:\xampp\htdocs\linknest)
          setCloneSourcePath('C:\\xampp\\htdocs\\linknest');
        }
        if (!cloneTargetPath) {
          // Default to parent of source (typically C:\xampp\htdocs)
          setCloneTargetPath('C:\\xampp\\htdocs');
        }
      }
    } catch (err) {
      console.error('Failed to load current path:', err);
      // Set default paths on error
      if (!cloneSourcePath) {
        setCloneSourcePath('C:\\xampp\\htdocs\\linknest');
      }
      if (!cloneTargetPath) {
        setCloneTargetPath('C:\\xampp\\htdocs');
      }
    }
  };

  // Poll for clone progress when a clone is running
  useEffect(() => {
    if (currentCloneId) {
      const interval = setInterval(async () => {
        try {
          const apiBase = resolveApiBase();
          const response = await fetch(`${apiBase}/clone/status/${currentCloneId}`, {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            const step = data.step || 'running';
            const progress = data.progress || 0;
            
            setCloneProgress(progress);
            setCloneStatus(step);
            if (data.logs && Array.isArray(data.logs)) {
              setCloneLogs(data.logs);
            }
            
            // Check if clone is complete or failed
            if (step === 'complete' || step === 'error') {
              // Clear the current clone tracking
              setCurrentCloneId(null);
              setCloneStatus(null);
              setCloneProgress(0);
              // Keep logs for a moment to show completion
              setTimeout(() => {
                setCloneLogs([]);
              }, 3000);
              // Reload list to get updated status
              loadClonesList();
            }
          }
        } catch (err) {
          console.error('Failed to fetch clone status:', err);
        }
      }, 1000); // Poll every second

      return () => clearInterval(interval);
    } else {
      // If no current clone, clear progress state
      if (cloneStatus && cloneStatus !== null) {
        setCloneStatus(null);
        setCloneProgress(0);
        setCloneLogs([]);
      }
    }
  }, [currentCloneId]);
  
  // Also check clones list to see if current clone is completed
  useEffect(() => {
    if (currentCloneId && clonesList.length > 0) {
      const currentClone = clonesList.find(c => c.id === currentCloneId);
      if (currentClone && (currentClone.status === 'completed' || currentClone.status === 'failed')) {
        // Clone is completed, clear tracking
        setCurrentCloneId(null);
        setCloneStatus(null);
        setCloneProgress(0);
        setCloneLogs([]);
      }
    }
  }, [clonesList, currentCloneId]);

  const loadClonesList = async () => {
    try {
      setClonesLoading(true);
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/clone/list`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setClonesList(data.clones || []);
      }
    } catch (err: any) {
      console.error('Failed to load clones list:', err);
    } finally {
      setClonesLoading(false);
    }
  };

  // Clean up selection when pending users change (e.g., after approval/rejection)
  useEffect(() => {
    const pendingUserIds = new Set(pendingUsers.map(user => user.id));
    setSelectedUserIds(prev => {
      const newSelection = new Set(Array.from(prev).filter(id => pendingUserIds.has(id)));
      return newSelection.size !== prev.size ? newSelection : prev;
    });
  }, [pendingUsers]);

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

  const loadPermissions = async () => {
    try {
      setPermissionsLoading(true);
      setError('');
      const perms = await accessService.getAllPermissions();
      setPermissions(perms);
    } catch (err: any) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleAddPermission = () => {
    setPermissionForm({
      userId: 0,
      tileId: '',
      canView: true,
      canEdit: false,
      canDelete: false
    });
    setShowPermissionModal(true);
  };

  const handleEditPermission = (perm: TilePermission) => {
    setPermissionForm({
      userId: perm.userId,
      tileId: perm.tileId,
      canView: perm.canView,
      canEdit: perm.canEdit,
      canDelete: perm.canDelete
    });
    setShowPermissionModal(true);
  };

  const handleSavePermission = async () => {
    if (!permissionForm.userId || !permissionForm.tileId) {
      setError('Please select both user and tile');
      return;
    }

    try {
      setError('');
      // Check if this is an update (permission already exists)
      const existingPerm = permissions.find(
        p => p.userId === permissionForm.userId && p.tileId === permissionForm.tileId
      );
      
      if (existingPerm) {
        // Update existing permission
        await accessService.updatePermission(
          permissionForm.userId,
          permissionForm.tileId,
          permissionForm.canView,
          permissionForm.canEdit,
          permissionForm.canDelete
        );
      } else {
        // Create new permission
        await accessService.setPermission(permissionForm);
      }
      setShowPermissionModal(false);
      setPermissionForm({
        userId: 0,
        tileId: '',
        canView: true,
        canEdit: false,
        canDelete: false
      });
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to save permission');
    }
  };

  const handleDeletePermission = async (userId: number, tileId: string) => {
    if (!confirm('Are you sure you want to remove this permission?')) {
      return;
    }

    try {
      setError('');
      await accessService.deletePermission(userId, tileId);
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to delete permission');
    }
  };

  const handleApprove = async (userId: number) => {
    try {
      setProcessing(userId);
      await authService.approveUser(userId);
      await loadData();
      setSelectedUserIds(new Set()); // Clear selection after approval
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
      setSelectedUserIds(new Set()); // Clear selection after rejection
    } catch (err: any) {
      setError(err.message || 'Failed to reject user');
    } finally {
      setProcessing(null);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedUserIds.size === 0) {
      return;
    }

    if (!confirm(`Are you sure you want to approve ${selectedUserIds.size} user(s)?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      const userIdsArray = Array.from(selectedUserIds);
      const result = await authService.bulkApproveUsers(userIdsArray);
      await loadData();
      setSelectedUserIds(new Set()); // Clear selection after approval
      if (onUserApproved) {
        onUserApproved();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve users');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleToggleUserSelection = (userId: number) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedUserIds.size === pendingUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(pendingUsers.map(user => user.id)));
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

  const handleSearchLdapUsers = async () => {
    if (!ldapSearchTerm.trim() || ldapSearchTerm.length < 2) {
      setError('Please enter at least 2 characters to search');
      return;
    }

    try {
      setLdapSearchLoading(true);
      setError('');
      const results = await authService.searchLdapUsers(ldapSearchTerm);
      setLdapSearchResults(results);
      setSelectedLdapUser(null);
    } catch (err: any) {
      setError(err.message || 'Failed to search LDAP users');
      setLdapSearchResults([]);
    } finally {
      setLdapSearchLoading(false);
    }
  };

  const handleAddLocalUser = async () => {
    if (!localUsername.trim() || !localEmail.trim() || !localPassword.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (localPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setAddUserLoading(true);
      setError('');
      await authService.addLocalUser(localUsername.trim(), localEmail.trim(), localPassword);
      setAddUserModal(false);
      setLocalUsername('');
      setLocalEmail('');
      setLocalPassword('');
      await loadData();
      alert('Local user created successfully. User is pending admin approval.');
    } catch (err: any) {
      setError(err.message || 'Failed to add local user');
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleAddLdapUser = async () => {
    if (!selectedLdapUser) {
      setError('Please select an LDAP user');
      return;
    }

    try {
      setAddUserLoading(true);
      setError('');
      await authService.addLdapUser(
        selectedLdapUser.username,
        selectedLdapUser.email,
        selectedLdapUser.dn,
        selectedLdapUser.displayName
      );
      setAddUserModal(false);
      setBulkImportMode(false);
      setLdapSearchTerm('');
      setLdapSearchResults([]);
      setSelectedLdapUser(null);
      setCsvFile(null);
      setLdapUsersText('');
      setBulkImportResults(null);
      await loadData();
      alert('LDAP user added successfully. User is pending admin approval.');
    } catch (err: any) {
      setError(err.message || 'Failed to add LDAP user');
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleBulkImportLocal = async () => {
    if (!csvFile) {
      setError('Please select a CSV file');
      return;
    }

    try {
      setBulkImportLoading(true);
      setError('');
      const result = await authService.bulkImportLocalUsers(csvFile);
      setBulkImportResults(result);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to import users');
    } finally {
      setBulkImportLoading(false);
    }
  };

  const handleBulkImportLdap = async () => {
    if (!ldapUsersText.trim()) {
      setError('Please enter LDAP user data');
      return;
    }

    // Parse comma-separated values
    // Format: username,email,dn,displayName (one per line)
    const lines = ldapUsersText.trim().split('\n').filter(line => line.trim());
    const users: Array<{ username: string; email: string; dn: string; displayName?: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 3) {
        setError(`Line ${i + 1}: Invalid format. Expected: username,email,dn[,displayName]`);
        return;
      }

      users.push({
        username: parts[0],
        email: parts[1],
        dn: parts[2],
        displayName: parts[3] || undefined
      });
    }

    if (users.length === 0) {
      setError('No valid users found');
      return;
    }

    try {
      setBulkImportLoading(true);
      setError('');
      const result = await authService.bulkImportLdapUsers(users);
      setBulkImportResults(result);
      setLdapUsersText('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to import LDAP users');
    } finally {
      setBulkImportLoading(false);
    }
  };

  const openAddUserModal = () => {
    setAddUserModal(true);
    setAddUserType('local');
    setLocalUsername('');
    setLocalEmail('');
    setLocalPassword('');
    setLdapSearchTerm('');
    setLdapSearchResults([]);
    setSelectedLdapUser(null);
    setError('');
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
        <button
          onClick={() => setActiveTab('footer')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'footer'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Footer
        </button>
        <button
          onClick={() => setActiveTab('access')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'access'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Access Manager
        </button>
        <button
          onClick={() => setActiveTab('clone')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'clone'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Clone
        </button>
        <button
          onClick={() => setActiveTab('browser')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'browser'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          Browser Extn Integration
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
              <div className="space-y-4">
                {selectedUserIds.size > 0 && (
                  <div className="flex items-center justify-between bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg px-4 py-3">
                    <span className="text-sm font-medium text-brand-900 dark:text-brand-100">
                      {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={handleBulkApprove}
                      disabled={bulkProcessing}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {bulkProcessing ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Approving...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                          Approve Selected
                        </>
                      )}
                    </button>
                  </div>
                )}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-6 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={pendingUsers.length > 0 && selectedUserIds.size === pendingUsers.length}
                              onChange={handleSelectAll}
                              className="w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500 focus:ring-2"
                            />
                          </th>
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
                              <input
                                type="checkbox"
                                checked={selectedUserIds.has(user.id)}
                                onChange={() => handleToggleUserSelection(user.id)}
                                disabled={bulkProcessing || processing === user.id}
                                className="w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </td>
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
                                  disabled={processing === user.id || bulkProcessing}
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
                                  disabled={processing === user.id || bulkProcessing}
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
              </div>
            )
          )}

          {/* All Users Tab */}
          {activeTab === 'all' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={openAddUserModal}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 5a3 3 0 100 6 3 3 0 000-6zM3.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM15.75 6a3 3 0 11-6 0 3 3 0 016 0zm1.423 11.285a1.224 1.224 0 00-.569-1.175 5.964 5.964 0 00-1.576-.19 5.964 5.964 0 00-2.383.676.224.224 0 00-.12.219c0 .288.09.567.26.804a5.96 5.96 0 013.5 2.377 5.96 5.96 0 003.5-2.377c.17-.237.26-.516.26-.804a.225.225 0 00-.12-.219z" />
                  </svg>
                  Add User
                </button>
              </div>
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  setProcessing(user.id);
                                  setError('');
                                  const result = await authService.toggleAdmin(user.id);
                                  // Update the user in the local state
                                  setAllUsers(prevUsers => 
                                    prevUsers.map(u => 
                                      u.id === user.id ? { ...u, is_admin: result.is_admin } : u
                                    )
                                  );
                                } catch (err: any) {
                                  setError(err.message || 'Failed to toggle admin status');
                                } finally {
                                  setProcessing(null);
                                }
                              }}
                              disabled={processing === user.id}
                              className={`px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                user.is_admin 
                                  ? 'bg-amber-600 hover:bg-amber-500' 
                                  : 'bg-emerald-600 hover:bg-emerald-500'
                              }`}
                              title={user.is_admin ? 'Demote from Admin' : 'Promote to Admin'}
                            >
                              {processing === user.id ? (
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : user.is_admin ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                </svg>
                              )}
                              {user.is_admin ? 'Demote' : 'Promote'}
                            </button>
                            {!user.is_admin && (
                              <>
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
                                {user.auth_source !== 'ldap' && (
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
                                )}
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
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                        autoComplete="current-password"
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

          {/* Footer Tab */}
          {activeTab === 'footer' && (
            <div className="space-y-6">
              {settingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Footer Text Settings</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Customize the footer text that appears at the bottom of every page.
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Footer Text
                      </label>
                      <textarea
                        value={settings.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team'}
                        onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        placeholder="© 2025 Adventhealth - Designed and developed by AIT Architecture team"
                        rows={3}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        This text will be displayed in the footer of all pages. You can use HTML tags for formatting.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Preview</h4>
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        <footer className="py-6 text-center text-slate-400 dark:text-slate-500 text-sm">
                          <p dangerouslySetInnerHTML={{ __html: settings.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team' }}></p>
                        </footer>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          setSettingsSaving(true);
                          setError('');
                          await settingsService.updateSettings(settings);
                          await loadSettings(); // Reload local settings
                          await refreshSettings(); // Refresh global settings context
                          alert('Footer text saved successfully!');
                        } catch (err: any) {
                          setError(err.message || 'Failed to save footer text');
                        } finally {
                          setSettingsSaving(false);
                        }
                      }}
                      disabled={settingsSaving}
                      className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {settingsSaving ? 'Saving...' : 'Save Footer Text'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Clone Tab */}
          {activeTab === 'clone' && (
            <div className="space-y-6">
              {/* Clone Form */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Clone Instance</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  Clone the current LinkNest setup to a new folder. This will create a complete copy of the application with all necessary files.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      New Folder Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={cloneFolderName}
                      onChange={(e) => setCloneFolderName(e.target.value)}
                      placeholder="e.g., myspaces"
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Name of the new folder to create (no path separators or special characters)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Source Folder
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cloneSourcePath}
                        onChange={(e) => setCloneSourcePath(e.target.value)}
                        placeholder="e.g., C:\xampp\htdocs\linknest"
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      />
                      <input
                        type="file"
                        id="sourceFolderPicker"
                        webkitdirectory=""
                        directory=""
                        multiple={false}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            // Browsers don't provide full file paths for security reasons
                            // We can only get the folder name, not the full path
                            // So we'll show a helpful message and let user confirm
                            const firstFile = files[0] as any;
                            const relativePath = firstFile.webkitRelativePath || firstFile.name;
                            const folderName = relativePath.split('/')[0] || relativePath.split('\\')[0];
                            
                            alert(`Browser security prevents accessing the full file path.\n\nSelected folder name: ${folderName}\n\nPlease manually enter or verify the full path in the input field above.`);
                          }
                          // Reset input
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          // Try to use folder picker (works in Chrome/Edge)
                          const picker = document.getElementById('sourceFolderPicker') as HTMLInputElement;
                          if (picker) {
                            picker.click();
                          }
                        }}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        title="Browse for source folder (Chrome/Edge - limited by browser security)"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Source directory to clone from (defaults to current app directory)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Target Folder
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cloneTargetPath}
                        onChange={(e) => setCloneTargetPath(e.target.value)}
                        placeholder="e.g., C:\projects"
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      />
                      <input
                        type="file"
                        id="targetFolderPicker"
                        webkitdirectory=""
                        directory=""
                        multiple={false}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            // Browsers don't provide full file paths for security reasons
                            const firstFile = files[0] as any;
                            const relativePath = firstFile.webkitRelativePath || firstFile.name;
                            const folderName = relativePath.split('/')[0] || relativePath.split('\\')[0];
                            
                            alert(`Browser security prevents accessing the full file path.\n\nSelected folder name: ${folderName}\n\nPlease manually enter or verify the full path in the input field above.`);
                          }
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const picker = document.getElementById('targetFolderPicker') as HTMLInputElement;
                          if (picker) {
                            picker.click();
                          }
                        }}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        title="Browse for target folder (Chrome/Edge - limited by browser security)"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Target directory where the new folder will be created (defaults to parent of source)
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cloneCopyAssets}
                        onChange={(e) => setCloneCopyAssets(e.target.checked)}
                        className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Copy Assets</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Copy logos and favicon from uploads folder
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cloneCopyDatabase}
                        onChange={(e) => setCloneCopyDatabase(e.target.checked)}
                        className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Copy Database</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Copy database file from data folder (LDAP passwords will be encrypted automatically)
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Progress Bar */}
                  {currentCloneId && cloneStatus && cloneStatus !== 'complete' && cloneStatus !== 'error' && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div className="mb-2 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {cloneStatus === 'validating' ? 'Validating...' :
                           cloneStatus === 'creating' ? 'Creating directory...' :
                           cloneStatus === 'copying' ? 'Copying files...' :
                           cloneStatus === 'configuring' ? 'Configuring...' :
                           cloneStatus === 'installing' ? 'Installing dependencies...' :
                           cloneStatus === 'building' ? 'Building application...' :
                           cloneStatus === 'finalizing' ? 'Finalizing...' :
                           cloneStatus === 'running' ? 'Running...' :
                           cloneStatus === 'pending' ? 'Starting...' :
                           cloneStatus || 'Processing...'}
                        </span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">{cloneProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                        <div
                          className="bg-brand-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${cloneProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Completion Message */}
                  {currentCloneId && (cloneStatus === 'complete' || cloneStatus === 'error') && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div className={`p-3 rounded-lg ${
                        cloneStatus === 'complete' 
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}>
                        <div className="flex items-center gap-2">
                          {cloneStatus === 'complete' ? (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 dark:text-green-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm font-medium text-green-700 dark:text-green-400">Clone completed successfully!</span>
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-600 dark:text-red-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm font-medium text-red-700 dark:text-red-400">Clone failed</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Logs Display */}
                  {cloneLogs.length > 0 && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Logs</h4>
                      <div className="bg-slate-900 text-green-400 font-mono text-xs p-3 rounded-lg max-h-60 overflow-y-auto">
                        {cloneLogs.map((log, idx) => (
                          <div key={idx} className="mb-1">
                            <span className="text-slate-500">[{log.time}]</span> {log.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={async () => {
                        if (!cloneFolderName.trim()) {
                          setError('Folder name is required');
                          return;
                        }

                        try {
                          setCloneLoading(true);
                          setError('');
                          setCloneProgress(0);
                          setCloneStatus('pending');
                          setCloneLogs([]);

                          const apiBase = resolveApiBase();
                          const response = await fetch(`${apiBase}/clone`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            credentials: 'include',
                            body: JSON.stringify({
                              folderName: cloneFolderName.trim(),
                              sourcePath: cloneSourcePath.trim() || undefined,
                              targetPath: cloneTargetPath.trim() || undefined,
                              copyAssets: cloneCopyAssets,
                              copyDatabase: cloneCopyDatabase,
                            }),
                          });

                          const data = await response.json();

                          if (!response.ok) {
                            throw new Error(data.error || 'Failed to start clone process');
                          }

                          // Set current clone ID and start polling
                          setCurrentCloneId(data.cloneId);
                          setCloneStatus('running');
                          
                          // Reset form
                          setCloneFolderName('');
                          setCloneSourcePath('');
                          setCloneTargetPath('');
                          setCloneCopyAssets(false);
                          setCloneCopyDatabase(false);
                          
                          // Reload clones list
                          loadClonesList();
                        } catch (err: any) {
                          setError(err.message || 'Failed to start clone process');
                          setCloneStatus('error');
                        } finally {
                          setCloneLoading(false);
                        }
                      }}
                      disabled={cloneLoading || !cloneFolderName.trim() || (currentCloneId !== null)}
                      className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {cloneLoading ? 'Starting Clone Process...' : (currentCloneId ? 'Clone in Progress...' : 'Start Clone')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Clones List */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cloned Instances</h3>
                  <button
                    onClick={loadClonesList}
                    disabled={clonesLoading}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {clonesLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {clonesList.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p>No clones created yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Folder Name</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Source Folder</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Target Folder</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Progress</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">URL</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Created</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clonesList.map((clone) => (
                          <tr key={clone.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="py-3 px-4 text-sm text-slate-900 dark:text-white font-medium">{clone.folderName}</td>
                            <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400 font-mono text-xs">
                              {clone.sourcePath || '-'}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400 font-mono text-xs">
                              {clone.targetPath || '-'}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                clone.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                clone.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              }`}>
                                {clone.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all ${
                                      clone.status === 'completed' ? 'bg-green-600' :
                                      clone.status === 'failed' ? 'bg-red-600' :
                                      'bg-brand-600'
                                    }`}
                                    style={{ width: `${clone.progress}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-slate-600 dark:text-slate-400">{clone.progress}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {clone.status === 'completed' && clone.url ? (
                                <a
                                  href={clone.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                                >
                                  {clone.url}
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                                    <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                              {new Date(clone.createdAt * 1000).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditCloneModal({
                                      open: true,
                                      clone: {
                                        id: clone.id,
                                        folderName: clone.folderName,
                                        sourcePath: clone.sourcePath,
                                        targetPath: clone.targetPath,
                                        copyAssets: clone.copyAssets,
                                        copyDatabase: clone.copyDatabase
                                      }
                                    });
                                  }}
                                  className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                  title="Edit clone"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Are you sure you want to rerun the clone for "${clone.folderName}"? This will restart the clone process.`)) {
                                      return;
                                    }
                                    
                                    try {
                                      setRerunCloneLoading(clone.id);
                                      const apiBase = resolveApiBase();
                                      const response = await fetch(`${apiBase}/clone/rerun/${clone.id}`, {
                                        method: 'POST',
                                        credentials: 'include',
                                      });
                                      
                                      const data = await response.json();
                                      
                                      if (!response.ok) {
                                        throw new Error(data.error || 'Failed to rerun clone');
                                      }
                                      
                                      // Set as current clone to track progress
                                      setCurrentCloneId(clone.id);
                                      setCloneStatus('running');
                                      setCloneProgress(0);
                                      setCloneLogs([]);
                                      
                                      // Reload list
                                      loadClonesList();
                                    } catch (err: any) {
                                      setError(err.message || 'Failed to rerun clone');
                                    } finally {
                                      setRerunCloneLoading(null);
                                    }
                                  }}
                                  disabled={rerunCloneLoading === clone.id || clone.status === 'running' || clone.status === 'pending'}
                                  className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Rerun clone"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Are you sure you want to delete clone "${clone.folderName}"?`)) {
                                      return;
                                    }
                                    
                                    const deleteFolder = confirm(`Do you also want to delete the folder?\n\nClick OK to delete both the record and the folder.\nClick Cancel to only remove the record from the database.`);
                                    
                                    try {
                                      setDeleteCloneLoading(clone.id);
                                      setError('');
                                      
                                      const apiBase = resolveApiBase();
                                      const url = `${apiBase}/clone/${clone.id}?deleteFolder=${deleteFolder ? '1' : '0'}`;
                                      console.log('Delete request URL:', url);
                                      console.log('Delete folder option:', deleteFolder);
                                      
                                      const response = await fetch(url, {
                                        method: 'DELETE',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        credentials: 'include',
                                      });
                                      
                                      const data = await response.json();
                                      console.log('Delete response:', data);
                                      
                                      if (!response.ok) {
                                        throw new Error(data.error || `Failed to delete clone (${response.status})`);
                                      }
                                      
                                      // Show success message with folder deletion status
                                      if (deleteFolder) {
                                        if (data.folderDeleted) {
                                          alert(`Clone "${clone.folderName}" and its folder have been deleted successfully.`);
                                        } else {
                                          alert(`Clone "${clone.folderName}" record has been deleted, but the folder could not be removed.\n\nPath: ${data.folderPath || 'Unknown'}\n\nPlease check PHP error logs for details.`);
                                        }
                                      } else {
                                        alert(`Clone "${clone.folderName}" record has been deleted. The folder remains on disk.`);
                                      }
                                      
                                      // If this was the current clone being tracked, clear it
                                      if (currentCloneId === clone.id) {
                                        setCurrentCloneId(null);
                                        setCloneStatus(null);
                                        setCloneProgress(0);
                                        setCloneLogs([]);
                                      }
                                      
                                      // Reload list
                                      await loadClonesList();
                                    } catch (err: any) {
                                      console.error('Delete clone error:', err);
                                      setError(err.message || 'Failed to delete clone. Please check the console for details.');
                                    } finally {
                                      setDeleteCloneLoading(null);
                                    }
                                  }}
                                  disabled={deleteCloneLoading === clone.id}
                                  className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Delete clone"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

      {/* Edit Clone Modal */}
      {editCloneModal.open && editCloneModal.clone && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-900/40" onClick={() => setEditCloneModal({ open: false, clone: null })}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Edit Clone</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Folder Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editCloneModal.clone.folderName}
                  onChange={(e) => setEditCloneModal({
                    ...editCloneModal,
                    clone: { ...editCloneModal.clone!, folderName: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Source Path
                </label>
                <input
                  type="text"
                  value={editCloneModal.clone.sourcePath}
                  onChange={(e) => setEditCloneModal({
                    ...editCloneModal,
                    clone: { ...editCloneModal.clone!, sourcePath: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Target Path
                </label>
                <input
                  type="text"
                  value={editCloneModal.clone.targetPath}
                  onChange={(e) => setEditCloneModal({
                    ...editCloneModal,
                    clone: { ...editCloneModal.clone!, targetPath: e.target.value }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCloneModal.clone.copyAssets}
                    onChange={(e) => setEditCloneModal({
                      ...editCloneModal,
                      clone: { ...editCloneModal.clone!, copyAssets: e.target.checked }
                    })}
                    className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Copy Assets</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCloneModal.clone.copyDatabase}
                    onChange={(e) => setEditCloneModal({
                      ...editCloneModal,
                      clone: { ...editCloneModal.clone!, copyDatabase: e.target.checked }
                    })}
                    className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Copy Database</span>
                </label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setEditCloneModal({ open: false, clone: null })}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!editCloneModal.clone) return;
                    
                    try {
                      setEditCloneLoading(true);
                      setError('');
                      
                      const apiBase = resolveApiBase();
                      const response = await fetch(`${apiBase}/clone/${editCloneModal.clone.id}`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                          folderName: editCloneModal.clone.folderName,
                          sourcePath: editCloneModal.clone.sourcePath,
                          targetPath: editCloneModal.clone.targetPath,
                          copyAssets: editCloneModal.clone.copyAssets,
                          copyDatabase: editCloneModal.clone.copyDatabase,
                        }),
                      });
                      
                      const data = await response.json();
                      
                      if (!response.ok) {
                        throw new Error(data.error || 'Failed to update clone');
                      }
                      
                      setEditCloneModal({ open: false, clone: null });
                      loadClonesList();
                    } catch (err: any) {
                      setError(err.message || 'Failed to update clone');
                    } finally {
                      setEditCloneLoading(false);
                    }
                  }}
                  disabled={editCloneLoading || !editCloneModal.clone.folderName.trim()}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {editCloneLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

          {/* Access Manager Tab */}
          {activeTab === 'access' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tile Access Permissions</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Manage which users can view, edit, or delete specific tiles
                    </p>
                  </div>
                  <button
                    onClick={handleAddPermission}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    Add Permission
                  </button>
                </div>

                {permissionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                  </div>
                ) : permissions.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 font-medium">No permissions configured</p>
                    <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">Add permissions to restrict tile access</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Tile</th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">View</th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Edit</th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Delete</th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {permissions.map((perm) => (
                          <tr key={`${perm.userId}_${perm.tileId}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-slate-900 dark:text-white">{perm.username}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{perm.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-slate-900 dark:text-white">{perm.tileTitle || perm.tileId}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {perm.canView ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-400">
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-400">
                                  ✗
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {perm.canEdit ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-400">
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-400">
                                  ✗
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {perm.canDelete ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-400">
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-400">
                                  ✗
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex justify-end gap-3">
                                <button
                                  onClick={() => handleEditPermission(perm)}
                                  className="text-brand-600 dark:text-brand-400 hover:text-brand-900 dark:hover:text-brand-300 transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeletePermission(perm.userId, perm.tileId)}
                                  className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

                      {/* Footer Settings */}
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Show Database Path in Footer
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Display the database file path in the footer for verification
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              const newValue = settings.show_database_path_in_footer === '1' ? '0' : '1';
                              try {
                                setSettingsSaving(true);
                                setError('');
                                await settingsService.updateSettings({
                                  ...settings,
                                  show_database_path_in_footer: newValue
                                });
                                setSettings({ ...settings, show_database_path_in_footer: newValue });
                                await refreshSettings();
                              } catch (err: any) {
                                setError(err.message || 'Failed to update setting');
                              } finally {
                                setSettingsSaving(false);
                              }
                            }}
                            disabled={settingsSaving}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                              settings.show_database_path_in_footer === '1' 
                                ? 'bg-brand-600' 
                                : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                            role="switch"
                            aria-checked={settings.show_database_path_in_footer === '1'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                settings.show_database_path_in_footer === '1' 
                                  ? 'translate-x-5' 
                                  : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
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

      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 border border-slate-200 dark:border-slate-700">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                {permissionForm.userId && permissionForm.tileId && permissions.find(
                  p => p.userId === permissionForm.userId && p.tileId === permissionForm.tileId
                ) ? 'Edit Tile Permission' : 'Add Tile Permission'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    User *
                  </label>
                  <select
                    value={permissionForm.userId}
                    onChange={(e) => setPermissionForm({ ...permissionForm, userId: parseInt(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                    disabled={permissionForm.userId > 0 && permissionForm.tileId !== '' && permissions.find(
                      p => p.userId === permissionForm.userId && p.tileId === permissionForm.tileId
                    ) !== undefined}
                  >
                    <option value={0}>Select a user</option>
                    {allUsers.filter(u => !u.is_admin).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Tile *
                  </label>
                  <select
                    value={permissionForm.tileId}
                    onChange={(e) => setPermissionForm({ ...permissionForm, tileId: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                    disabled={permissionForm.userId > 0 && permissionForm.tileId !== '' && permissions.find(
                      p => p.userId === permissionForm.userId && p.tileId === permissionForm.tileId
                    ) !== undefined}
                  >
                    <option value="">Select a tile</option>
                    {spacesTiles.map((tile) => (
                      <option key={tile.id} value={tile.id}>
                        {tile.emoji} {tile.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Permissions
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={permissionForm.canView}
                        onChange={(e) => setPermissionForm({ ...permissionForm, canView: e.target.checked })}
                        className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                      />
                      <span className="ml-2 text-sm text-slate-700 dark:text-slate-300">Can View</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={permissionForm.canEdit}
                        onChange={(e) => setPermissionForm({ ...permissionForm, canEdit: e.target.checked })}
                        className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                      />
                      <span className="ml-2 text-sm text-slate-700 dark:text-slate-300">Can Edit</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={permissionForm.canDelete}
                        onChange={(e) => setPermissionForm({ ...permissionForm, canDelete: e.target.checked })}
                        className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                      />
                      <span className="ml-2 text-sm text-slate-700 dark:text-slate-300">Can Delete</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowPermissionModal(false);
                      setPermissionForm({
                        userId: 0,
                        tileId: '',
                        canView: true,
                        canEdit: false,
                        canDelete: false
                      });
                      setError('');
                    }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePermission}
                    disabled={!permissionForm.userId || !permissionForm.tileId}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    Save Permission
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                  autoComplete="new-password"
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
                  autoComplete="current-password"
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
                  autoComplete="new-password"
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

      {/* Add User Modal */}
      {addUserModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Keep a light, non-blurred overlay so background (including error bar) stays readable */}
          <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-900/40" onClick={() => {
            setAddUserModal(false);
            setAddUserType('local');
            setBulkImportMode(false);
            setLocalUsername('');
            setLocalEmail('');
            setLocalPassword('');
            setLdapSearchTerm('');
            setLdapSearchResults([]);
            setSelectedLdapUser(null);
            setCsvFile(null);
            setLdapUsersText('');
            setBulkImportResults(null);
            setError('');
          }}></div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Add User</h3>
            
            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-4">
              <button
                onClick={() => {
                  setAddUserType('local');
                  setBulkImportMode(false);
                  setError('');
                  setBulkImportResults(null);
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  addUserType === 'local' && !bulkImportMode
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Local User
              </button>
              <button
                onClick={() => {
                  setAddUserType('ldap');
                  setBulkImportMode(false);
                  setError('');
                  setBulkImportResults(null);
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  addUserType === 'ldap' && !bulkImportMode
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                LDAP User
              </button>
              <button
                onClick={() => {
                  setBulkImportMode(true);
                  setError('');
                  setBulkImportResults(null);
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  bulkImportMode
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Bulk Import
              </button>
            </div>

            {/* Local User Form */}
            {addUserType === 'local' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddLocalUser();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={localUsername}
                    onChange={(e) => {
                      setLocalUsername(e.target.value);
                      setError('');
                    }}
                    placeholder="Enter username (min 3 characters)"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoFocus
                    required
                    minLength={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={localEmail}
                    onChange={(e) => {
                      setLocalEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="Enter email address"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Password *
                  </label>
                  <SecurePasswordInput
                    value={localPassword}
                    onChange={(e) => {
                      setLocalPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="Enter password (min 6 characters)"
                    minLength={6}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  * User will be created and will require admin approval before they can log in.
                </p>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
      setAddUserModal(false);
      setBulkImportMode(false);
      setLocalUsername('');
      setLocalEmail('');
      setLocalPassword('');
      setCsvFile(null);
      setLdapUsersText('');
      setBulkImportResults(null);
      setError('');
                    }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addUserLoading || !localUsername.trim() || !localEmail.trim() || !localPassword.trim() || localPassword.length < 6}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    {addUserLoading ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </form>
            )}

            {/* LDAP User Form */}
            {addUserType === 'ldap' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Search LDAP Users *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ldapSearchTerm}
                      onChange={(e) => {
                        setLdapSearchTerm(e.target.value);
                        setError('');
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSearchLdapUsers();
                        }
                      }}
                      placeholder="Search by username, email, or display name (min 2 characters)"
                      className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSearchLdapUsers}
                      disabled={ldapSearchLoading || !ldapSearchTerm.trim() || ldapSearchTerm.length < 2}
                      className="px-4 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      {ldapSearchLoading ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                </div>

                {ldapSearchResults.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Select User ({ldapSearchResults.length} found)
                    </label>
                    <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                      {ldapSearchResults.map((user, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            setSelectedLdapUser(user);
                            setError('');
                          }}
                          className={`p-3 cursor-pointer border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors ${
                            selectedLdapUser?.dn === user.dn ? 'bg-brand-50 dark:bg-brand-500/10 border-brand-500' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white">
                                {user.displayName || user.username}
                              </div>
                              <div className="text-sm text-slate-600 dark:text-slate-400">
                                {user.email || 'No email'}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                                Username: {user.username}
                              </div>
                            </div>
                            {selectedLdapUser?.dn === user.dn && (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedLdapUser && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Selected User:</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      <div><strong>Username:</strong> {selectedLdapUser.username}</div>
                      <div><strong>Email:</strong> {selectedLdapUser.email || 'N/A'}</div>
                      {selectedLdapUser.displayName && (
                        <div><strong>Display Name:</strong> {selectedLdapUser.displayName}</div>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  * Search for users in LDAP directory. Selected user will be added and will require admin approval before they can log in.
                </p>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setAddUserModal(false);
                      setBulkImportMode(false);
                      setLdapSearchTerm('');
                      setLdapSearchResults([]);
                      setSelectedLdapUser(null);
                      setCsvFile(null);
                      setLdapUsersText('');
                      setBulkImportResults(null);
                      setError('');
                    }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddLdapUser}
                    disabled={addUserLoading || !selectedLdapUser}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    {addUserLoading ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </div>
            )}

            {/* Bulk Import Section */}
            {bulkImportMode && (
              <div className="space-y-4">
                <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-4">
                  <button
                    onClick={() => {
                      setAddUserType('local');
                      setCsvFile(null);
                      setBulkImportResults(null);
                      setError('');
                    }}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                      addUserType === 'local'
                        ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Import Local Users (CSV)
                  </button>
                  <button
                    onClick={() => {
                      setAddUserType('ldap');
                      setLdapUsersText('');
                      setBulkImportResults(null);
                      setError('');
                    }}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                      addUserType === 'ldap'
                        ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Import LDAP Users (Text)
                  </button>
                </div>

                {/* Local Users CSV Import */}
                {addUserType === 'local' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Upload CSV File *
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        CSV format: username,email,password (one per line, header row optional)
                      </p>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setCsvFile(file || null);
                          setBulkImportResults(null);
                          setError('');
                        }}
                        className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                      />
                      {csvFile && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                          Selected: {csvFile.name}
                        </p>
                      )}
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">CSV Format Example:</p>
                      <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap">username,email,password
john.doe,john@example.com,SecurePass123
jane.smith,jane@example.com,AnotherPass456</pre>
                    </div>
                    {bulkImportResults && (
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                          {bulkImportResults.message}
                        </p>
                        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                          <p>✓ Created: {bulkImportResults.summary.created}</p>
                          <p>⊘ Skipped: {bulkImportResults.summary.skipped}</p>
                          <p>✗ Errors: {bulkImportResults.summary.errors}</p>
                        </div>
                        {bulkImportResults.results.errors.length > 0 && (
                          <div className="mt-3 max-h-40 overflow-y-auto">
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Errors:</p>
                            {bulkImportResults.results.errors.map((err: any, idx: number) => (
                              <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                                Line {err.line || err.index}: {err.username} - {err.reason}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => {
                          setAddUserModal(false);
                          setBulkImportMode(false);
                          setCsvFile(null);
                          setBulkImportResults(null);
                          setError('');
                        }}
                        className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleBulkImportLocal}
                        disabled={bulkImportLoading || !csvFile}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                      >
                        {bulkImportLoading ? 'Importing...' : 'Import Users'}
                      </button>
                    </div>
                  </div>
                )}

                {/* LDAP Users Text Import */}
                {addUserType === 'ldap' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Enter LDAP Users (Comma-separated) *
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        Format: username,email,dn,displayName (one per line, displayName is optional)
                      </p>
                      <textarea
                        value={ldapUsersText}
                        onChange={(e) => {
                          setLdapUsersText(e.target.value);
                          setBulkImportResults(null);
                          setError('');
                        }}
                        placeholder="username1,email1@example.com,CN=User1,OU=Users,DC=example,DC=com,Display Name 1&#10;username2,email2@example.com,CN=User2,OU=Users,DC=example,DC=com,Display Name 2"
                        rows={8}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                      />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Format Example:</p>
                      <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap">john.doe,john@example.com,CN=John Doe,OU=Users,DC=company,DC=com,John Doe
jane.smith,jane@example.com,CN=Jane Smith,OU=Users,DC=company,DC=com,Jane Smith</pre>
                    </div>
                    {bulkImportResults && (
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                          {bulkImportResults.message}
                        </p>
                        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                          <p>✓ Created: {bulkImportResults.summary.created}</p>
                          <p>⊘ Skipped: {bulkImportResults.summary.skipped}</p>
                          <p>✗ Errors: {bulkImportResults.summary.errors}</p>
                        </div>
                        {bulkImportResults.results.errors.length > 0 && (
                          <div className="mt-3 max-h-40 overflow-y-auto">
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Errors:</p>
                            {bulkImportResults.results.errors.map((err: any, idx: number) => (
                              <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                                Line {err.index}: {err.username} - {err.reason}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => {
                          setAddUserModal(false);
                          setBulkImportMode(false);
                          setLdapUsersText('');
                          setBulkImportResults(null);
                          setError('');
                        }}
                        className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleBulkImportLdap}
                        disabled={bulkImportLoading || !ldapUsersText.trim()}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                      >
                        {bulkImportLoading ? 'Importing...' : 'Import Users'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Browser Extension Integration Tab */}
      {activeTab === 'browser' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">🚀 Browser Extension Integration</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure and test browser-specific link opening using Browser Launcher Pro extension.
              </p>
            </div>

            {/* Configuration Section */}
            <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Configuration</h4>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.browser_specific_links_enabled === '1'}
                      onChange={(e) => setSettings({ ...settings, browser_specific_links_enabled: e.target.checked ? '1' : '0' })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Browser-Specific Link Opening</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 ml-6">Allow administrators to configure which browser opens specific links using a browser extension</p>
                </div>

                {settings.browser_specific_links_enabled === '1' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Browser Extension ID</label>
                    <input
                      type="text"
                      value={settings.browser_extension_id || ''}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        if (value === '' || /^[a-z0-9]{32}$/i.test(value)) {
                          setSettings({ ...settings, browser_extension_id: value });
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      placeholder="ifllnbjkoabnnbcodbocddplnhmbobim"
                      maxLength={32}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Enter the browser extension ID (32 alphanumeric characters). You can find this in chrome://extensions (Developer mode enabled).
                    </p>
                    {settings.browser_extension_id && settings.browser_extension_id.length !== 32 && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1">Extension ID must be exactly 32 characters</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Extension Status */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Extension Status</h4>
              <div id="extension-status-browser" className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Checking extension availability...</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const statusDiv = document.getElementById('extension-status-browser');
                    if (!statusDiv) return;

                    if (typeof (window as any).BrowserLauncher === 'undefined') {
                      statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
                      statusDiv.innerHTML = '<div class="text-sm text-amber-800 dark:text-amber-300"><strong>⚠ Error:</strong> Browser Launcher Pro integration script not loaded. Please check the script path.</div>';
                      return;
                    }

                    statusDiv.className = 'p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700';
                    statusDiv.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-sm text-slate-600 dark:text-slate-400">Checking...</span></div>';

                    const BrowserLauncher = (window as any).BrowserLauncher;
                    if (settings.browser_extension_id) {
                      BrowserLauncher.setExtensionId(settings.browser_extension_id);
                    }

                    BrowserLauncher.checkAvailability((available: boolean, message: string) => {
                      if (available) {
                        statusDiv.className = 'p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800';
                        statusDiv.innerHTML = `<div class="text-sm text-emerald-800 dark:text-emerald-300"><strong>✓ Extension Available:</strong> Browser Launcher Pro is ready!<br><small>Extension ID: ${BrowserLauncher.extensionId || 'Auto-detected'} | ${message}</small></div>`;
                      } else {
                        statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
                        statusDiv.innerHTML = `<div class="text-sm text-amber-800 dark:text-amber-300"><strong>⚠ Extension Status:</strong> ${message}<br><small><strong>Tips:</strong><br>1. Make sure Browser Launcher Pro extension is installed<br>2. Go to chrome://extensions and reload the extension<br>3. Refresh this page</small></div>`;
                      }
                    }, 5, 1000);
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  🔄 Re-check Extension Status
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const statusDiv = document.getElementById('extension-status-browser');
                    if (!statusDiv) return;

                    if (typeof (window as any).BrowserLauncher === 'undefined') {
                      statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
                      statusDiv.innerHTML = '<div class="text-sm text-amber-800 dark:text-amber-300"><strong>⚠ Error:</strong> BrowserLauncher object not found.</div>';
                      return;
                    }

                    statusDiv.className = 'p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700';
                    statusDiv.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-sm text-slate-600 dark:text-slate-400">Testing...</span></div>';

                    const BrowserLauncher = (window as any).BrowserLauncher;
                    if (settings.browser_extension_id) {
                      BrowserLauncher.setExtensionId(settings.browser_extension_id);
                    }

                    BrowserLauncher.open('https://www.google.com', 'chrome-stable', {}, (response: any) => {
                      if (response && response.success !== false) {
                        statusDiv.className = 'p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800';
                        statusDiv.innerHTML = '<div class="text-sm text-emerald-800 dark:text-emerald-300"><strong>✓ Test Successful!</strong> Extension is working! The link should have opened in Chrome.</div>';
                      } else {
                        statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
                        statusDiv.innerHTML = `<div class="text-sm text-amber-800 dark:text-amber-300"><strong>⚠ Test Result:</strong> ${response ? response.error : 'No response from extension. Check console for details.'}</div>`;
                      }
                    });
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  🧪 Test Extension Directly
                </button>
              </div>
            </div>

            {/* Quick Test Links */}
            {settings.browser_specific_links_enabled === '1' && (
              <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📋 Quick Test Links</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Click any link below to test opening in the specified browser:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { url: 'https://github.com', browser: 'chrome-stable', label: 'GitHub', badge: 'Chrome Stable' },
                    { url: 'https://microsoft.com', browser: 'edge-stable', label: 'Microsoft', badge: 'Edge Stable' },
                    { url: 'https://google.com', browser: 'chrome-beta', label: 'Google', badge: 'Chrome Beta' },
                    { url: 'https://stackoverflow.com', browser: 'edge-beta', label: 'Stack Overflow', badge: 'Edge Beta' },
                    { url: 'https://youtube.com', browser: 'chrome-stable', label: 'YouTube', badge: 'Chrome Stable' },
                    { url: 'https://reddit.com', browser: 'edge-stable', label: 'Reddit', badge: 'Edge Stable' },
                  ].map((link, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-500 dark:hover:border-brand-400 transition-colors">
                      <a
                        href={link.url}
                        data-browser={link.browser}
                        onClick={(e) => {
                          if (typeof (window as any).BrowserLauncher !== 'undefined') {
                            e.preventDefault();
                            const BrowserLauncher = (window as any).BrowserLauncher;
                            if (settings.browser_extension_id) {
                              BrowserLauncher.setExtensionId(settings.browser_extension_id);
                            }
                            BrowserLauncher.open(link.url, link.browser, { fallback: true });
                          }
                        }}
                        className="block text-brand-600 dark:text-brand-400 font-semibold mb-2 hover:underline"
                      >
                        {link.label}
                      </a>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">Open in {link.badge}</p>
                      <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">
                        {link.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* JavaScript API Examples */}
            <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">💻 JavaScript API Examples</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Use the JavaScript API for programmatic control. Try the examples below:
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof (window as any).BrowserLauncher !== 'undefined') {
                      const BrowserLauncher = (window as any).BrowserLauncher;
                      if (settings.browser_extension_id) {
                        BrowserLauncher.setExtensionId(settings.browser_extension_id);
                      }
                      BrowserLauncher.open('https://github.com', 'chrome-stable', {}, (response: any) => {
                        if (response && response.success !== false) {
                          alert('✓ Opening GitHub in Chrome Stable!');
                        } else {
                          alert('✗ Error: ' + (response?.error || 'Unknown error'));
                        }
                      });
                    }
                  }}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Open GitHub in Chrome
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof (window as any).BrowserLauncher !== 'undefined') {
                      const BrowserLauncher = (window as any).BrowserLauncher;
                      if (settings.browser_extension_id) {
                        BrowserLauncher.setExtensionId(settings.browser_extension_id);
                      }
                      BrowserLauncher.open('https://microsoft.com', 'edge-stable', {}, (response: any) => {
                        if (response && response.success !== false) {
                          alert('✓ Opening Microsoft in Edge Stable!');
                        } else {
                          alert('✗ Error: ' + (response?.error || 'Unknown error'));
                        }
                      });
                    }
                  }}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Open Microsoft in Edge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof (window as any).BrowserLauncher !== 'undefined') {
                      const BrowserLauncher = (window as any).BrowserLauncher;
                      if (settings.browser_extension_id) {
                        BrowserLauncher.setExtensionId(settings.browser_extension_id);
                      }
                      BrowserLauncher.open('https://google.com', 'chrome-beta', {}, (response: any) => {
                        if (response && response.success !== false) {
                          alert('✓ Opening Google in Chrome Beta!');
                        } else {
                          alert('✗ Error: ' + (response?.error || 'Unknown error'));
                        }
                      });
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Open Google in Chrome Beta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof (window as any).BrowserLauncher !== 'undefined') {
                      const BrowserLauncher = (window as any).BrowserLauncher;
                      const browsers = BrowserLauncher.getBrowsers();
                      alert('Available Browser IDs:\n\n' + browsers.join('\n'));
                    }
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Show Available Browsers
                </button>
              </div>

              {/* Code Examples */}
              <div className="mt-6 space-y-4">
                <div>
                  <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Example 1: Simple usage with callback</h5>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`BrowserLauncher.open('https://github.com', 'chrome-stable', {}, function(response) {
  if (response.success) {
    console.log('Opened successfully!');
  } else {
    console.error('Error:', response.error);
  }
});`}
                  </pre>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Example 2: Using Promises</h5>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`BrowserLauncher.open('https://example.com', 'edge-stable')
  .then(response => console.log('Success:', response))
  .catch(error => console.error('Error:', error));`}
                  </pre>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Example 3: Using async/await</h5>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`async function openLink() {
  try {
    const response = await BrowserLauncher.open('https://example.com', 'chrome-stable');
    console.log('Success:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Interactive Test Area */}
            <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🧪 Interactive Test Area</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Test the integration with your own URLs and browser selections:
              </p>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">URL to Open</label>
                    <input
                      type="url"
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Browser</label>
                    <select
                      value={testBrowser}
                      onChange={(e) => setTestBrowser(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                    >
                      <option value="chrome-stable">Chrome Stable</option>
                      <option value="chrome-beta">Chrome Beta</option>
                      <option value="chrome-dev">Chrome Dev</option>
                      <option value="edge-stable">Edge Stable</option>
                      <option value="edge-beta">Edge Beta</option>
                      <option value="edge-dev">Edge Dev</option>
                      <option value="chrome-stable-wsl">Chrome Stable (WSL)</option>
                      <option value="edge-stable-wsl">Edge Stable (WSL)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!testUrl.trim()) {
                        setTestResult({ success: false, message: 'Please enter a URL' });
                        return;
                      }

                      if (typeof (window as any).BrowserLauncher === 'undefined') {
                        setTestResult({ success: false, message: 'BrowserLauncher object not found' });
                        return;
                      }

                      setTestResult(null);
                      const BrowserLauncher = (window as any).BrowserLauncher;
                      if (settings.browser_extension_id) {
                        BrowserLauncher.setExtensionId(settings.browser_extension_id);
                      }

                      BrowserLauncher.open(testUrl, testBrowser, { fallback: false }, (response: any) => {
                        if (response && response.success !== false) {
                          const message = response.message || 'Browser launch initiated';
                          setTestResult({ success: true, message: `✓ Success! ${message}` });
                        } else {
                          setTestResult({ success: false, message: `✗ Error: ${response ? response.error : 'No response from extension'}` });
                        }
                      });
                    }}
                    className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Open Link in Browser
                  </button>
                  {testResult && (
                    <div className={`p-3 rounded-lg border ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    }`}>
                      <p className="text-sm">{testResult.message}</p>
                      {testResult.success && (
                        <p className="text-xs mt-1 opacity-75">Opening {testUrl} in {testBrowser}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Browser IDs Reference */}
            <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🔍 Available Browser IDs</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Use these browser IDs in your <code className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">data-browser</code> attributes or JavaScript API calls:
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
                  <div>
                    <strong>Windows Local:</strong><br />
                    chrome-stable, chrome-beta, chrome-dev<br />
                    edge-stable, edge-beta, edge-dev<br />
                    chrome (alias), edge (alias)
                  </div>
                  <div>
                    <strong>WSL:</strong><br />
                    chrome-stable-wsl, chrome-beta-wsl, chrome-dev-wsl<br />
                    edge-stable-wsl, edge-beta-wsl, edge-dev-wsl<br />
                    firefox-wsl, opera-wsl, brave-wsl
                  </div>
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🔧 Troubleshooting</h4>
              <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded">
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>If extension is not detected:</strong>
                  <ol className="list-decimal list-inside mt-2 space-y-1 ml-4">
                    <li><strong>Reload the extension:</strong> Go to <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded">chrome://extensions</code> or <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded">edge://extensions</code>, find "Browser Launcher Pro", and click the reload button</li>
                    <li><strong>Refresh this page:</strong> Press F5 or Ctrl+R to reload</li>
                    <li><strong>Check browser console:</strong> Press F12 and look for errors</li>
                    <li><strong>Verify extension is enabled:</strong> Make sure the extension toggle is ON in extensions page</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={async () => {
                  try {
                    setSettingsSaving(true);
                    setError('');
                    await settingsService.updateSettings(settings);
                    await loadSettings();
                    await refreshSettings();
                    alert('Settings saved successfully!');
                  } catch (err: any) {
                    setError(err.message || 'Failed to save settings');
                  } finally {
                    setSettingsSaving(false);
                  }
                }}
                disabled={settingsSaving}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
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
    </div>
  );
};
