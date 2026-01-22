import React, { useState, useEffect, useMemo, useRef } from 'react';
import { authService, PendingUser, AllUser } from '../services/authService';
import { settingsService, AppSettings } from '../services/settingsService';
import { databaseService } from '../services/databaseService';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { getTiles, createTile } from '../services/storageService';
import { bulkImportTiles } from '../services/storageService';
import { exportAllCategoriesToFile, parseSpaceExportObject, normalizeImportedTiles } from '../services/spaceTransferService';
import { Tile } from '../types';
import { getCategoryArrangement } from '../services/storageService';
import { SecurePasswordInput } from './SecurePasswordInput';
import { accessService, TilePermission } from '../services/accessService';
import { APP_TABS, getDisabledTabsFromSettings, setToSortedJsonArray, type AppTabId } from '../services/tabVisibilityService';
import { broadcastService, BroadcastMessage } from '../services/broadcastService';
import { rolesService, Role } from '../services/rolesService';
import SamlConfigModal from './SamlConfigModal';
import { useMobile } from '../hooks/useMobile';
import { getCustomWidgets, createWidget, updateWidget, deleteWidget, CustomWidget, CreateWidgetRequest, UpdateWidgetRequest } from '../services/widgetService';
import { GranularPermissionsModal } from './GranularPermissionsModal';

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

// Resolve base path for docs and other static resources
function resolveDocsBase(): string {
  // Use the same logic as API base but without /api suffix
  const apiBase = resolveApiBase();
  return apiBase.replace('/api', '');
}

interface AdminPanelProps {
  onUserApproved?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onUserApproved }) => {
  const { refreshSettings } = useSettings();
  const isMobile = useMobile();
  // Initialize activeTab from localStorage or default to 'pending'
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'settings' | 'database' | 'spaces' | 'ldap' | 'saml' | 'footer' | 'tabVisibility' | 'access' | 'clone' | 'browser' | 'broadcast' | 'maintenance' | 'widgets'>(() => {
    const savedTab = localStorage.getItem('adminPanelActiveTab');
    const validTabs: Array<'pending' | 'all' | 'settings' | 'database' | 'spaces' | 'ldap' | 'saml' | 'footer' | 'tabVisibility' | 'access' | 'clone' | 'browser' | 'broadcast' | 'maintenance' | 'widgets'> = ['pending', 'all', 'settings', 'database', 'spaces', 'ldap', 'saml', 'footer', 'tabVisibility', 'access', 'clone', 'browser', 'broadcast', 'maintenance', 'widgets'];
    return (savedTab && validTabs.includes(savedTab as any)) ? savedTab as any : 'pending';
  });
  // Initialize tab layout from localStorage or default to 'horizontal'
  const [tabLayout, setTabLayout] = useState<'horizontal' | 'vertical'>(() => {
    const savedLayout = localStorage.getItem('adminPanelTabLayout');
    return (savedLayout === 'vertical') ? 'vertical' : 'horizontal';
  });
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [allUsersSearchTerm, setAllUsersSearchTerm] = useState('');
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [allUsersPerPage, setAllUsersPerPage] = useState(25);
  const [resetPasswordModal, setResetPasswordModal] = useState<{ open: boolean; userId: number | null; username: string }>({ open: false, userId: null, username: '' });
  const [newPassword, setNewPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [editUserModal, setEditUserModal] = useState<{ open: boolean; userId: number | null; username: string; email: string; auth_source: string }>({ open: false, userId: null, username: '', email: '', auth_source: 'local' });
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAuthSource, setEditAuthSource] = useState<'local' | 'ldap' | 'saml'>('local');
  const [editUserLoading, setEditUserLoading] = useState(false);
  const [openDropdownUserId, setOpenDropdownUserId] = useState<number | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Settings state
  const [settings, setSettings] = useState<AppSettings>({
    app_name: 'LinkNest',
    page_title: 'LinkNest',
    spaces_title: 'My Spaces',
    logo_type: 'icon',
    logo_icon: 'ðŸ”—',
    logo_image: '',
    favicon: '',
    footer_text: 'Â© 2025 Adventhealth - Designed and developed by AIT Architecture team',
    show_database_path_in_footer: '1',
    disabled_tabs: '[]',
    maintenance_enabled: '0',
    maintenance_message: ''
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
  const [samlConfigModalOpen, setSamlConfigModalOpen] = useState(false);

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
  const [samlImportFile, setSamlImportFile] = useState<File | null>(null);
  const [samlImporting, setSamlImporting] = useState(false);

  // LDAP Test state
  const [ldapTestLoading, setLdapTestLoading] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ldapTestUser, setLdapTestUser] = useState('');
  const [ldapTestPassword, setLdapTestPassword] = useState('');

  // Ref to store bind password for immediate access (avoids React state timing issues)
  const ldapBindPasswordRef = useRef<string>('');

  // Add User modal state
  const [addUserModal, setAddUserModal] = useState(false);
  const [addUserType, setAddUserType] = useState<'local' | 'ldap' | 'saml'>('local');

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

  // Database Cleanup state
  const [cleanupChecking, setCleanupChecking] = useState(false);
  const [cleanupCleaning, setCleanupCleaning] = useState(false);
  const [cleanupResults, setCleanupResults] = useState<{ 
    orphaned_found?: number; 
    details?: Array<{ type: string; label: string; count: number; description: string }>; 
    total_cleaned?: number;
    cleaned?: Record<string, number>;
    success: boolean; 
    errors?: string[];
  } | null>(null);

  // Duplicate Tiles Cleanup state
  const [dupTilesFinding, setDupTilesFinding] = useState(false);
  const [dupTilesCleaning, setDupTilesCleaning] = useState(false);
  const [dupTilesAggressiveCleaning, setDupTilesAggressiveCleaning] = useState(false);

  // Invisible Tiles Diagnosis state
  const [invisibleTilesDiagnosing, setInvisibleTilesDiagnosing] = useState(false);
  const [invisibleTilesRemoving, setInvisibleTilesRemoving] = useState(false);
  const [invisibleTilesResults, setInvisibleTilesResults] = useState<{
    total_tiles?: number;
    invisible_tiles?: Array<{
      id: string;
      title: string;
      emoji: string;
      group: string;
      user_id: number;
      owner_username: string;
      created_at: string;
      sections_count: number;
      links_count: number;
      permissions_count: number;
      has_arrangement: boolean;
      owner_exists: boolean;
      issues: string[];
    }>;
    issues_found?: string[];
    deleted?: number;
    deleted_tiles?: Array<{
      id: string;
      title: string;
      owner: string;
      links: number;
      reason: string;
    }>;
    success: boolean;
    errors?: string[];
  } | null>(null);
  const [dupTilesResults, setDupTilesResults] = useState<{
    duplicates_found?: number;
    duplicate_groups?: Array<{
      title: string;
      group: string;
      count: number;
      tiles: Array<{
        id: string;
        title: string;
        emoji: string;
        group: string;
        user_id: number;
        owner_username: string;
        section_count: number;
        link_count: number;
        permission_count: number;
        has_content: boolean;
        created_at: string;
      }>;
    }>;
    deleted?: number;
    kept?: number;
    details?: Array<{
      title: string;
      group: string;
      kept_id: string;
      kept_owner: string;
      kept_links: number;
      deleted_ids?: string[];
      deleted_count: number;
      skipped?: Array<{
        id: string;
        links: number;
        owner: string;
      }>;
    }>;
    skipped?: Array<{
      title: string;
      group: string;
      kept_id: string;
      kept_owner: string;
      kept_links: number;
      deleted_count: number;
      skipped: Array<{
        id: string;
        links: number;
        owner: string;
      }>;
    }>;
    success: boolean;
    errors?: string[];
  } | null>(null);

  // Access Manager state
  const [permissions, setPermissions] = useState<TilePermission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [accessSubTab, setAccessSubTab] = useState<'roles' | 'assign' | 'admins'>('roles');

  // Tile Admins state
  const [showTileAdminsModal, setShowTileAdminsModal] = useState(false);
  const [selectedTileIdsForAdmins, setSelectedTileIdsForAdmins] = useState<Set<string>>(new Set());
  const [tileAdminsLoading, setTileAdminsLoading] = useState(false);
  const [tileAdminsMap, setTileAdminsMap] = useState<Record<string, TilePermission[]>>({});
  const [tileAdminTileSearchTerm, setTileAdminTileSearchTerm] = useState('');
  const [tileAdminUserSearchTerm, setTileAdminUserSearchTerm] = useState('');
  const [tileAdminsUsersLoaded, setTileAdminsUsersLoaded] = useState(false);
  const [showGranularPermissionsModal, setShowGranularPermissionsModal] = useState(false);
  const [selectedPermissionForEdit, setSelectedPermissionForEdit] = useState<TilePermission | null>(null);
  const [tileAdminsTabSearchTerm, setTileAdminsTabSearchTerm] = useState('');

  // Roles management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRoleTilesModal, setShowRoleTilesModal] = useState(false);
  const [showRoleTabsModal, setShowRoleTabsModal] = useState(false);
  const [showRoleWidgetsModal, setShowRoleWidgetsModal] = useState(false);
  const [showUserRolesModal, setShowUserRolesModal] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedUserForRoles, setSelectedUserForRoles] = useState<number | null>(null);
  const [userSelectedRoleIds, setUserSelectedRoleIds] = useState<number[]>([]);
  const [bulkSelectedUserIds, setBulkSelectedUserIds] = useState<number[]>([]);
  const [bulkSelectedRoleIds, setBulkSelectedRoleIds] = useState<number[]>([]);
  const [bulkAssignMode, setBulkAssignMode] = useState<'add' | 'replace' | 'remove'>('add');
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [bulkUserSearchTerm, setBulkUserSearchTerm] = useState('');
  const [bulkRoleSearchTerm, setBulkRoleSearchTerm] = useState('');
  const [userRolesMap, setUserRolesMap] = useState<Record<number, Array<{ id: number; name: string; description?: string }>>>({});
  const [loadingUserRoles, setLoadingUserRoles] = useState<Set<number>>(new Set());
  const [userRolesLoading, setUserRolesLoading] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [allTiles, setAllTiles] = useState<Tile[]>([]);
  const [allLinks, setAllLinks] = useState<Array<{ id: string; label: string; url: string; tileId: string; tileTitle: string }>>([]);
  const [roleTilesLoading, setRoleTilesLoading] = useState(false);
  const [roleLinksLoading, setRoleLinksLoading] = useState(false);
  const [roleTabsLoading, setRoleTabsLoading] = useState(false);
  const [selectedTileIds, setSelectedTileIds] = useState<Set<string>>(new Set());
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set());
  const [roleWidgetsLoading, setRoleWidgetsLoading] = useState(false);
  const [availableWidgets, setAvailableWidgets] = useState<Array<{ id: string; label: string; description: string; isCustom?: boolean }>>([]);
  const [widgetsLoading, setWidgetsLoading] = useState(false);
  
  // Custom Widgets Management state
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>([]);
  const [customWidgetsLoading, setCustomWidgetsLoading] = useState(false);
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState<CustomWidget | null>(null);
  const [widgetForm, setWidgetForm] = useState<CreateWidgetRequest>({
    widgetId: '',
    name: '',
    description: '',
    componentPath: '',
    floatingComponentPath: '',
    iconSvg: '',
    requiresAuth: false,
    enabled: true
  });
  const [widgetFormLoading, setWidgetFormLoading] = useState(false);
  const [widgetSuccessMessage, setWidgetSuccessMessage] = useState('');
  const [tileSearchTerm, setTileSearchTerm] = useState('');
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [expandedTiles, setExpandedTiles] = useState<Set<string>>(new Set());
  const [expandedLinks, setExpandedLinks] = useState<Set<string>>(new Set());

  // Clone state
  const [cloneFolderName, setCloneFolderName] = useState('');
  const [cloneSourcePath, setCloneSourcePath] = useState('');
  const [cloneTargetPath, setCloneTargetPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneCopyAssets, setCloneCopyAssets] = useState(false);
  const [cloneCopyDatabase, setCloneCopyDatabase] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneProgress, setCloneProgress] = useState(0);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);
  const [cloneLogs, setCloneLogs] = useState<Array<{ time: string; message: string }>>([]);
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
      url: string;
      copyAssets: boolean;
      copyDatabase: boolean;
    } | null;
  }>({ open: false, clone: null });
  const [editCloneLoading, setEditCloneLoading] = useState(false);
  const [deleteCloneLoading, setDeleteCloneLoading] = useState<number | null>(null);
  const [rerunCloneLoading, setRerunCloneLoading] = useState<number | null>(null);

  // Prechecks state
  const [prechecksLoading, setPrechecksLoading] = useState(false);
  const [prechecksResults, setPrechecksResults] = useState<{
    allGood: boolean;
    checks: Array<{
      category: string;
      items: Array<{
        name: string;
        value: string;
        status: 'pass' | 'fail' | 'info';
        message: string;
        description: string;
      }>;
    }>;
  } | null>(null);
  const [showPrechecks, setShowPrechecks] = useState(false);

  // Snapshots state
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotCreating, setSnapshotCreating] = useState(false);
  const [snapshotRestoring, setSnapshotRestoring] = useState<string | null>(null);

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

  const handleAutoDetectAuthSources = async () => {
    if (!confirm('This will auto-detect authentication sources for all users in the system.\n\nPriority: SAML (if saml_nameid exists) > LDAP (if exists in directory) > Local\n\nContinue?')) {
      return;
    }

    setAutoDetecting(true);
    setError('');
    try {
      const result = await authService.autoDetectAuthSources();
      alert(result.message);
      await loadAllUsers(); // Refresh the user list
    } catch (err: any) {
      setError(err.message || 'Failed to auto-detect auth sources');
    } finally {
      setAutoDetecting(false);
    }
  };

  const loadSettings = async () => {
    try {
      setSettingsLoading(true);
      const loadedSettings = await settingsService.getSettings();
      // Ensure maintenance settings exist with defaults
      const settingsWithDefaults = {
        ...loadedSettings,
        maintenance_enabled: loadedSettings.maintenance_enabled || '0',
        maintenance_message: loadedSettings.maintenance_message || ''
      };
      setSettings(settingsWithDefaults);
      // Update ref with loaded password
      ldapBindPasswordRef.current = loadedSettings.ldap_bind_password || '';
      // Set preview if logo image exists
      if (loadedSettings.logo_image) {
        setLogoPreview(loadedSettings.logo_image);
      }
      // Load maintenance message
      setMaintenanceMessage(loadedSettings.maintenance_message || '');
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
      loadRoles();
      loadAllTilesAndLinks();
      // Only load permissions if we're on the Tile Admins sub-tab
      if (accessSubTab === 'admins') {
        loadPermissions();
      }
    }
    // Load permissions and roles when viewing All Users tab to show badges
    if (activeTab === 'all') {
      loadPermissions();
      loadRoles(); // Ensure roles are loaded before loading user roles
    }
    if (activeTab === 'clone') {
      loadClonesList();
      loadCurrentPath();
    }
    if (activeTab === 'database') {
      loadSnapshots();
    }
    if (activeTab === 'broadcast') {
      const loadBroadcast = async () => {
        try {
          setBroadcastLoading(true);
          const broadcast = await broadcastService.getBroadcast();
          setCurrentBroadcast(broadcast);
          if (broadcast) {
            setBroadcastMessage(broadcast.message);
            setBroadcastFontFamily(broadcast.fontFamily);
            setBroadcastFontSize(broadcast.fontSize);
            setBroadcastColor(broadcast.color);
            setBroadcastScrollSpeed(broadcast.scrollSpeed || 30);
            if (broadcast.expiresAt) {
              const expiresDate = new Date(broadcast.expiresAt * 1000);
              setBroadcastExpiresAt(expiresDate.toISOString().slice(0, 16));
            } else {
              setBroadcastExpiresAt('');
            }
          } else {
            setBroadcastMessage('');
            setBroadcastFontFamily('Arial, sans-serif');
            setBroadcastFontSize('16px');
            setBroadcastColor('#ff0000');
            setBroadcastScrollSpeed(30);
            setBroadcastExpiresAt('');
          }
        } catch (err: any) {
          console.error('Failed to load broadcast:', err);
          setError(err.message || 'Failed to load broadcast message');
        } finally {
          setBroadcastLoading(false);
        }
      };
      loadBroadcast();
    }
    if (activeTab === 'maintenance') {
      loadSettings();
    }
    if (activeTab === 'widgets') {
      loadCustomWidgets();
    }
  }, [activeTab]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (openDropdownUserId !== null && !target.closest('.user-actions-dropdown')) {
        setOpenDropdownUserId(null);
      }
    };

    if (openDropdownUserId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openDropdownUserId]);

  // Load user roles when All Users tab is active and users are loaded
  useEffect(() => {
    const loadUserRolesWhenReady = async () => {
      if (activeTab === 'all' && allUsers.length > 0) {
        // Load user roles after users are loaded
        await loadUserRolesForBulk();
      }
    };
    
    loadUserRolesWhenReady();
  }, [activeTab, allUsers.length]);

  const loadSnapshots = async () => {
    try {
      setSnapshotsLoading(true);
      const data = await databaseService.getSnapshots();
      setSnapshots(data);
    } catch (err: any) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setSnapshotsLoading(false);
    }
  };

  // Persist activeTab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('adminPanelActiveTab', activeTab);
  }, [activeTab]);

  // ESC key handler for Access Manager modals
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        // Close modals in priority order (most specific first)
        if (showTileAdminsModal) {
          setShowTileAdminsModal(false);
          setSelectedTileIdsForAdmins(new Set());
          setTileAdminsMap({});
          setTileAdminTileSearchTerm('');
          setTileAdminUserSearchTerm('');
          setTileAdminsUsersLoaded(false);
        } else if (showRoleTilesModal) {
          setShowRoleTilesModal(false);
          setSelectedRole(null);
          setSelectedTileIds(new Set());
          setSelectedLinkIds(new Set());
          setSelectedTabIds(new Set());
        } else if (showRoleTabsModal) {
          setShowRoleTabsModal(false);
          setSelectedRole(null);
          setSelectedTabIds(new Set());
        } else if (showRoleWidgetsModal) {
          setShowRoleWidgetsModal(false);
          setSelectedRole(null);
          setSelectedWidgetIds(new Set());
        } else if (showBulkAssignModal) {
          setShowBulkAssignModal(false);
          setBulkSelectedUserIds([]);
          setBulkSelectedRoleIds([]);
          setBulkAssignMode('add');
          setBulkUserSearchTerm('');
          setBulkRoleSearchTerm('');
        } else if (showUserRolesModal) {
          setShowUserRolesModal(false);
          setSelectedUserForRoles(null);
          setUserSelectedRoleIds([]);
        } else if (showRoleModal) {
          setShowRoleModal(false);
          setSelectedRole(null);
          setRoleForm({ name: '', description: '' });
        }
      }
    };

    // Only attach listener when in Access Manager tab and a modal is open
    if (activeTab === 'access' && (
      showTileAdminsModal ||
      showRoleModal ||
      showRoleTilesModal ||
      showRoleTabsModal ||
      showRoleWidgetsModal ||
      showUserRolesModal ||
      showBulkAssignModal
    )) {
      window.addEventListener('keydown', handleEscKey);
      return () => {
        window.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [
    activeTab,
    showTileAdminsModal,
    showRoleModal,
    showRoleTilesModal,
    showRoleTabsModal,
    showRoleWidgetsModal,
    showUserRolesModal,
    showBulkAssignModal
  ]);

  // Persist tabLayout to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('adminPanelTabLayout', tabLayout);
  }, [tabLayout]);

  const disabledTabs = useMemo<Set<AppTabId>>(() => getDisabledTabsFromSettings(settings), [settings.disabled_tabs]);

  const setTabDisabled = (tabId: AppTabId, disabled: boolean) => {
    const next = new Set<AppTabId>(disabledTabs as Set<AppTabId>);
    if (disabled) next.add(tabId);
    else next.delete(tabId);
    setSettings(prev => ({ ...prev, disabled_tabs: setToSortedJsonArray(next) }));
  };

  // Browser extension test state
  const [testUrl, setTestUrl] = useState('https://github.com');
  const [testBrowser, setTestBrowser] = useState('chrome-stable');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [detectedBrowsers, setDetectedBrowsers] = useState<string[]>([]);

  // Broadcast message state
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastFontFamily, setBroadcastFontFamily] = useState('Arial, sans-serif');
  const [broadcastFontSize, setBroadcastFontSize] = useState('16px');
  const [broadcastColor, setBroadcastColor] = useState('#ff0000');
  const [broadcastScrollSpeed, setBroadcastScrollSpeed] = useState(30);
  const [broadcastExpiresAt, setBroadcastExpiresAt] = useState<string>('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [currentBroadcast, setCurrentBroadcast] = useState<BroadcastMessage | null>(null);

  // Maintenance mode state
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  // Load saved browsers from database and check extension status when browser tab is active
  useEffect(() => {
    if (activeTab === 'browser') {
      // Load saved browsers from database
      const loadSavedBrowsers = async () => {
        try {
          const apiBase = resolveApiBase();
          const response = await fetch(`${apiBase}/browsers`, {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.browsers && data.browsers.length > 0) {
              const browserIds = data.browsers.map((b: any) => b.browser_id);
              setDetectedBrowsers(browserIds);
              // Auto-select first browser if default is still set
              if (testBrowser === 'chrome-stable' && browserIds.length > 0) {
                setTestBrowser(browserIds[0]);
              }
            }
          }
        } catch (err) {
          console.error('Failed to load saved browsers:', err);
        }
      };

      loadSavedBrowsers();

      // Small delay to ensure script has had time to initialize
      const checkTimeout = setTimeout(() => {
        const statusDiv = document.getElementById('extension-status-browser');
        if (!statusDiv) return;

        const win = window as any;
        if (typeof win.BrowserLauncher === 'undefined') {
          statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
          statusDiv.innerHTML = '<div class="text-sm text-amber-800 dark:text-amber-300"><strong>âš  Error:</strong> Browser Launcher Pro integration script not loaded. Please check the script path in index.html.</div>';
          return;
        }

        statusDiv.className = 'p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700';
        statusDiv.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-sm text-slate-600 dark:text-slate-400">Checking extension availability...</span></div>';

        const BrowserLauncher = win.BrowserLauncher;

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
            statusDiv.innerHTML = `<div class="text-sm text-amber-800 dark:text-amber-300"><strong>âš  Extension Status:</strong> ${message}<br><small><strong>Tips:</strong><br>1. Make sure Browser Launcher Pro extension is installed<br>2. Go to chrome://extensions and reload the extension<br>3. Refresh this page</small></div>`;
          }
        }, 5, 1000);

        // Note: We no longer automatically fetch browsers here
        // Browsers will be loaded from database and only refreshed when admin clicks the button
      }, 500);

      return () => clearTimeout(checkTimeout);
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
      const newSelection = new Set((Array.from(prev) as number[]).filter(id => pendingUserIds.has(id)));
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
      // Also load tiles if not loaded yet
      if (allTiles.length === 0) {
        await loadAllTilesAndLinks();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setPermissionsLoading(false);
    }
  };

  const loadCustomWidgets = async () => {
    try {
      setCustomWidgetsLoading(true);
      setError('');
      const widgets = await getCustomWidgets();
      setCustomWidgets(widgets);
    } catch (err: any) {
      setError(err.message || 'Failed to load custom widgets');
    } finally {
      setCustomWidgetsLoading(false);
    }
  };

  const handleCreateWidget = async () => {
    if (!widgetForm.widgetId || !widgetForm.name || !widgetForm.componentPath) {
      setError('Widget ID, Name, and Component Path are required');
      return;
    }

    try {
      setWidgetFormLoading(true);
      setError('');
      await createWidget(widgetForm);
      setWidgetSuccessMessage(`Widget "${widgetForm.name}" has been successfully created!`);
      setShowAddWidgetModal(false);
      setWidgetForm({
        widgetId: '',
        name: '',
        description: '',
        componentPath: '',
        floatingComponentPath: '',
        iconSvg: '',
        requiresAuth: false,
        enabled: true
      });
      await loadCustomWidgets();
      // Clear success message after 5 seconds
      setTimeout(() => setWidgetSuccessMessage(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to create widget');
    } finally {
      setWidgetFormLoading(false);
    }
  };

  const handleUpdateWidget = async () => {
    if (!editingWidget) return;

    try {
      setWidgetFormLoading(true);
      setError('');
      const updateData: UpdateWidgetRequest = {
        widgetId: editingWidget.widgetId,
        ...widgetForm
      };
      await updateWidget(updateData);
      setWidgetSuccessMessage(`Widget "${widgetForm.name}" has been successfully updated!`);
      setEditingWidget(null);
      setShowAddWidgetModal(false);
      setWidgetForm({
        widgetId: '',
        name: '',
        description: '',
        componentPath: '',
        floatingComponentPath: '',
        iconSvg: '',
        requiresAuth: false,
        enabled: true
      });
      await loadCustomWidgets();
      // Clear success message after 5 seconds
      setTimeout(() => setWidgetSuccessMessage(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to update widget');
    } finally {
      setWidgetFormLoading(false);
    }
  };

  const handleDeleteWidget = async (widgetId: string) => {
    if (!confirm(`Are you sure you want to delete the widget "${widgetId}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError('');
      await deleteWidget({ widgetId });
      setWidgetSuccessMessage(`Widget "${widgetId}" has been successfully deleted!`);
      await loadCustomWidgets();
      // Clear success message after 5 seconds
      setTimeout(() => setWidgetSuccessMessage(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete widget');
    }
  };

  const handleEditWidget = (widget: CustomWidget) => {
    setEditingWidget(widget);
    setWidgetForm({
      widgetId: widget.widgetId,
      name: widget.name,
      description: widget.description || '',
      componentPath: widget.componentPath,
      floatingComponentPath: widget.floatingComponentPath || '',
      iconSvg: widget.iconSvg || '',
      requiresAuth: widget.requiresAuth,
      enabled: widget.enabled
    });
    setShowAddWidgetModal(true);
  };

  const loadRoles = async () => {
    try {
      setRolesLoading(true);
      setError('');
      const rolesList = await rolesService.getAllRoles();
      setRoles(rolesList);
    } catch (err: any) {
      setError(err.message || 'Failed to load roles');
    } finally {
      setRolesLoading(false);
    }
  };

  const loadAllTilesAndLinks = async () => {
    try {
      const tiles = await getTiles();
      setAllTiles(tiles);
      
      // Extract all links from tiles
      const linksList: Array<{ id: string; label: string; url: string; tileId: string; tileTitle: string }> = [];
      tiles.forEach(tile => {
        tile.tabs?.forEach(tab => {
          tab.sections?.forEach(section => {
            section.links?.forEach(link => {
              linksList.push({
                id: link.id,
                label: link.label,
                url: link.url,
                tileId: tile.id,
                tileTitle: tile.title
              });
            });
          });
        });
      });
      setAllLinks(linksList);
    } catch (err: any) {
      setError(err.message || 'Failed to load tiles and links');
    }
  };


  // Tile Admins handlers
  const handleManageTileAdmins = async () => {
    setSelectedTileIdsForAdmins(new Set());
    setTileAdminTileSearchTerm('');
    setTileAdminUserSearchTerm('');
    setTileAdminsMap({});
    setTileAdminsUsersLoaded(false);
    setTileAdminsLoading(true);
    try {
      // Always load users and tiles to ensure fresh data
      await Promise.all([
        loadAllUsers(),
        loadAllTilesAndLinks()
      ]);
      
      // Set flag that users are loaded (state will update)
      setTileAdminsUsersLoaded(true);
      
      // Load all permissions for all tiles in a single batch call (much faster)
      const batchPermissions = await accessService.getBatchPermissions();
      const permissionsMap: Record<string, TilePermission[]> = {};
      
      // Process batch response and filter to only tile admins (canEdit = true)
      for (const tilePerms of batchPermissions) {
        const admins = tilePerms.permissions
          .filter(perm => perm.canEdit)
          .map(perm => ({
            userId: perm.userId,
            tileId: tilePerms.tileId,
            canView: perm.canView,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            createdAt: perm.createdAt,
            updatedAt: perm.updatedAt,
            username: perm.username,
            email: perm.email,
            tileTitle: tilePerms.tileTitle
          }));
        permissionsMap[tilePerms.tileId] = admins;
      }
      
      // Ensure all tiles have an entry (even if empty)
      const currentTiles = await getTiles();
      for (const tile of currentTiles) {
        if (!permissionsMap[tile.id]) {
          permissionsMap[tile.id] = [];
        }
      }
      
      setTileAdminsMap(permissionsMap);
      setShowTileAdminsModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load tile admins');
    } finally {
      setTileAdminsLoading(false);
    }
  };

  const handleAddTileAdmin = async (userId: number, tileId: string, granularPerms?: {
    canAddLinks?: boolean;
    canAddSections?: boolean;
    canAddTabs?: boolean;
    canEditLinks?: boolean;
    canDeleteLinks?: boolean;
    canDeleteSections?: boolean;
    canDeleteTabs?: boolean;
    canChangeVisibility?: boolean;
    canChangeBrowser?: boolean;
    canCloneTile?: boolean;
    canViewTileInfo?: boolean;
    canEditTile?: boolean;
  }) => {
    try {
      setError('');
      // Set user as tile admin with granular permissions
      // Default: allow add/edit, restrict delete, visibility, browser, clone
      await accessService.setPermission({
        userId,
        tileId,
        canView: true,
        canEdit: true,
        canDelete: false, // Tile admins don't get delete by default
        canAddLinks: granularPerms?.canAddLinks ?? true,
        canAddSections: granularPerms?.canAddSections ?? true,
        canAddTabs: granularPerms?.canAddTabs ?? true,
        canEditLinks: granularPerms?.canEditLinks ?? true,
        canDeleteLinks: granularPerms?.canDeleteLinks ?? false,
        canDeleteSections: granularPerms?.canDeleteSections ?? false,
        canDeleteTabs: granularPerms?.canDeleteTabs ?? false,
        canChangeVisibility: granularPerms?.canChangeVisibility ?? false,
        canChangeBrowser: granularPerms?.canChangeBrowser ?? false,
        canCloneTile: granularPerms?.canCloneTile ?? false,
        canViewTileInfo: granularPerms?.canViewTileInfo ?? true,
        canEditTile: granularPerms?.canEditTile ?? true
      });
      
      // Reload admins for this tile
      const tilePerms = await accessService.getTilePermissions(tileId);
      const admins = tilePerms.permissions
        .filter(perm => perm.canEdit)
        .map(perm => ({
          userId: perm.userId,
          tileId: tileId,
          canView: perm.canView,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete,
          createdAt: perm.createdAt,
          updatedAt: perm.updatedAt,
          username: perm.username,
          email: perm.email,
          tileTitle: allTiles.find(t => t.id === tileId)?.title || tileId
        }));
      
      setTileAdminsMap(prev => ({ ...prev, [tileId]: admins }));
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to add tile admin');
    }
  };

  const handleRemoveTileAdmin = async (userId: number, tileId: string) => {
    try {
      setError('');
      await accessService.deletePermission(userId, tileId);
      
      // Reload admins for this tile
      const tilePerms = await accessService.getTilePermissions(tileId);
      const admins = tilePerms.permissions
        .filter(perm => perm.canEdit)
        .map(perm => ({
          userId: perm.userId,
          tileId: tileId,
          canView: perm.canView,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete,
          canAddLinks: perm.canAddLinks,
          canAddSections: perm.canAddSections,
          canAddTabs: perm.canAddTabs,
          canEditLinks: perm.canEditLinks,
          canDeleteLinks: perm.canDeleteLinks,
          canDeleteSections: perm.canDeleteSections,
          canDeleteTabs: perm.canDeleteTabs,
          canChangeVisibility: perm.canChangeVisibility,
          canChangeBrowser: perm.canChangeBrowser,
          canCloneTile: perm.canCloneTile,
          canViewTileInfo: perm.canViewTileInfo,
          canEditTile: perm.canEditTile,
          createdAt: perm.createdAt,
          updatedAt: perm.updatedAt,
          username: perm.username,
          email: perm.email,
          tileTitle: allTiles.find(t => t.id === tileId)?.title || tileId
        }));
      
      setTileAdminsMap(prev => ({ ...prev, [tileId]: admins }));
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to remove tile admin');
    }
  };

  const handleUpdateGranularPermissions = async (permissions: {
    canAddLinks: boolean;
    canAddSections: boolean;
    canAddTabs: boolean;
    canEditLinks: boolean;
    canDeleteLinks: boolean;
    canDeleteSections: boolean;
    canDeleteTabs: boolean;
    canChangeVisibility: boolean;
    canChangeBrowser: boolean;
    canCloneTile: boolean;
    canViewTileInfo: boolean;
    canDelete: boolean;
    canEditTile: boolean;
  }) => {
    if (!selectedPermissionForEdit) return;
    
    try {
      setError('');
      await accessService.updatePermission(
        selectedPermissionForEdit.userId,
        selectedPermissionForEdit.tileId,
        selectedPermissionForEdit.canView,
        selectedPermissionForEdit.canEdit,
        permissions.canDelete,
        {
          canAddLinks: permissions.canAddLinks,
          canAddSections: permissions.canAddSections,
          canAddTabs: permissions.canAddTabs,
          canEditLinks: permissions.canEditLinks,
          canDeleteLinks: permissions.canDeleteLinks,
          canDeleteSections: permissions.canDeleteSections,
          canDeleteTabs: permissions.canDeleteTabs,
          canChangeVisibility: permissions.canChangeVisibility,
          canChangeBrowser: permissions.canChangeBrowser,
          canCloneTile: permissions.canCloneTile,
          canViewTileInfo: permissions.canViewTileInfo,
          canEditTile: permissions.canEditTile
        }
      );
      
      // Reload admins for this tile
      const tilePerms = await accessService.getTilePermissions(selectedPermissionForEdit.tileId);
      const admins = tilePerms.permissions
        .filter(perm => perm.canEdit)
        .map(perm => ({
          userId: perm.userId,
          tileId: selectedPermissionForEdit.tileId,
          canView: perm.canView,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete,
          canAddLinks: perm.canAddLinks,
          canAddSections: perm.canAddSections,
          canAddTabs: perm.canAddTabs,
          canEditLinks: perm.canEditLinks,
          canDeleteLinks: perm.canDeleteLinks,
          canDeleteSections: perm.canDeleteSections,
          canDeleteTabs: perm.canDeleteTabs,
          canChangeVisibility: perm.canChangeVisibility,
          canChangeBrowser: perm.canChangeBrowser,
          canCloneTile: perm.canCloneTile,
          canViewTileInfo: perm.canViewTileInfo,
          createdAt: perm.createdAt,
          updatedAt: perm.updatedAt,
          username: perm.username,
          email: perm.email,
          tileTitle: allTiles.find(t => t.id === selectedPermissionForEdit.tileId)?.title || selectedPermissionForEdit.tileId
        }));
      
      setTileAdminsMap(prev => ({ ...prev, [selectedPermissionForEdit.tileId]: admins }));
      await loadPermissions();
      setShowGranularPermissionsModal(false);
      setSelectedPermissionForEdit(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions');
      throw err;
    }
  };

  const handleBulkAddTileAdmins = async () => {
    if (selectedTileIdsForAdmins.size === 0) {
      setError('Please select at least one tile');
      return;
    }

    const selectedUserIds = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-tile-admin-user]:checked')
    ).map(input => parseInt(input.dataset.tileAdminUser || '0')).filter(id => id > 0);

    if (selectedUserIds.length === 0) {
      setError('Please select at least one user');
      return;
    }

    try {
      setError('');
      setTileAdminsLoading(true);
      
      // Add selected users as admins to all selected tiles
      for (const tileId of selectedTileIdsForAdmins) {
        for (const userId of selectedUserIds) {
          await accessService.setPermission({
            userId,
            tileId,
            canView: true,
            canEdit: true,
            canDelete: true
          });
        }
        
        // Reload admins for this tile
        const tilePerms = await accessService.getTilePermissions(tileId);
        const admins = tilePerms.permissions
          .filter(perm => perm.canEdit)
          .map(perm => ({
            userId: perm.userId,
            tileId: tileId,
            canView: perm.canView,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            createdAt: perm.createdAt,
            updatedAt: perm.updatedAt,
            username: perm.username,
            email: perm.email,
            tileTitle: allTiles.find(t => t.id === tileId)?.title || tileId
          }));
        
        setTileAdminsMap(prev => ({ ...prev, [tileId]: admins }));
      }
      
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to add tile admins');
    } finally {
      setTileAdminsLoading(false);
    }
  };

  // Roles management handlers
  const handleAddRole = () => {
    setRoleForm({ name: '', description: '' });
    setSelectedRole(null);
    setShowRoleModal(true);
  };

  const handleEditRole = (role: Role) => {
    setRoleForm({ name: role.name, description: role.description || '' });
    setSelectedRole(role);
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      setError('Role name is required');
      return;
    }

    try {
      setError('');
      if (selectedRole) {
        await rolesService.updateRole(selectedRole.id, roleForm);
      } else {
        await rolesService.createRole(roleForm);
      }
      setShowRoleModal(false);
      setRoleForm({ name: '', description: '' });
      setSelectedRole(null);
      await loadRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to save role');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('Are you sure you want to delete this role? All permissions and user assignments will be removed.')) {
      return;
    }

    try {
      setError('');
      await rolesService.deleteRole(roleId);
      await loadRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
    }
  };

  const handleManageRoleTiles = async (role: Role) => {
    setSelectedRole(role);
    setRoleTilesLoading(true);
    setTileSearchTerm('');
    setSelectedTileIds(new Set());
    setSelectedLinkIds(new Set());
    try {
      await loadAllTilesAndLinks();
      // Load existing tile and link assignments for this role
      try {
        const [roleTiles, roleLinks] = await Promise.all([
          rolesService.getRoleTiles(role.id),
          rolesService.getRoleLinks(role.id)
        ]);
        const existingTileIds = new Set(roleTiles.map(rt => rt.tileId));
        const existingLinkIds = new Set(roleLinks.map(rl => rl.linkId));
        setSelectedTileIds(existingTileIds);
        setSelectedLinkIds(existingLinkIds);
      } catch (err) {
        // Ignore if no tiles/links assigned yet
      }
      setShowRoleTilesModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load tiles and links');
    } finally {
      setRoleTilesLoading(false);
    }
  };

  // Select/Deselect all tiles handler
  const handleSelectAllTiles = () => {
    const allTileIds = new Set(allTiles.map(tile => tile.id));
    setSelectedTileIds(allTileIds);
    
    // Also select all links from all tiles
    const allLinkIds = new Set<string>();
    allTiles.forEach(tile => {
      tile.tabs?.forEach(tab => {
        tab.sections?.forEach(section => {
          section.links?.forEach(link => {
            allLinkIds.add(link.id);
          });
        });
        tab.links?.forEach(link => {
          allLinkIds.add(link.id);
        });
      });
    });
    setSelectedLinkIds(allLinkIds);
  };

  // Deselect all tiles handler
  const handleDeselectAllTiles = () => {
    setSelectedTileIds(new Set());
    setSelectedLinkIds(new Set());
  };

  // Select/Deselect all links in a section handler
  const handleSelectAllLinksInSection = (tileId: string, sectionId: string, sectionLinks: any[]) => {
    const newLinkSet = new Set(selectedLinkIds);
    const allSelected = sectionLinks.every(link => selectedLinkIds.has(link.id));
    
    if (allSelected) {
      // Deselect all links in this section
      sectionLinks.forEach(link => newLinkSet.delete(link.id));
    } else {
      // Select all links in this section
      sectionLinks.forEach(link => {
        newLinkSet.add(link.id);
      });
      // Automatically select the parent tile
      const newTileSet = new Set(selectedTileIds);
      newTileSet.add(tileId);
      setSelectedTileIds(newTileSet);
    }
    setSelectedLinkIds(newLinkSet);
  };

  // Select/Deselect all links directly in a tab (not from sections)
  const handleSelectAllTabLevelLinks = (tileId: string, tabLinks: any[]) => {
    if (tabLinks.length === 0) return;
    
    const allSelected = tabLinks.every((link: any) => selectedLinkIds.has(link.id));
    const newLinkSet = new Set(selectedLinkIds);
    
    if (allSelected) {
      // Deselect all tab-level links
      tabLinks.forEach((link: any) => newLinkSet.delete(link.id));
    } else {
      // Select all tab-level links
      tabLinks.forEach((link: any) => {
        newLinkSet.add(link.id);
      });
      // Automatically select the parent tile
      const newTileSet = new Set(selectedTileIds);
      newTileSet.add(tileId);
      setSelectedTileIds(newTileSet);
    }
    setSelectedLinkIds(newLinkSet);
  };

  const handleManageUserRoles = async (userId: number) => {
    setSelectedUserForRoles(userId);
    setUserRolesLoading(true);
    try {
      // Load existing roles for this user
      const userRoles = await rolesService.getUserRoles(userId);
      setUserSelectedRoleIds(userRoles.roles.map(r => r.id));
    } catch (err) {
      // User might not have roles yet, that's fine
      setUserSelectedRoleIds([]);
    } finally {
      setUserRolesLoading(false);
    }
    setShowUserRolesModal(true);
  };

  const handleAssignTilesToRole = async () => {
    if (!selectedRole) {
      setError('No role selected');
      return;
    }

    // Validation: If a tile is selected, at least one link from that tile must be selected
    const selectedTilesArray: string[] = Array.from(selectedTileIds);
    const selectedLinksArray: string[] = Array.from(selectedLinkIds);
    
    // Get all links for selected tiles
    const linksInSelectedTiles = new Set<string>();
    allTiles.forEach(tile => {
      if (selectedTilesArray.includes(tile.id)) {
        tile.tabs?.forEach(tab => {
          tab.sections?.forEach(section => {
            section.links?.forEach(link => {
              linksInSelectedTiles.add(link.id);
            });
          });
          tab.links?.forEach(link => {
            linksInSelectedTiles.add(link.id);
          });
        });
      }
    });

    // Check if any selected tile has no selected links
    for (const tileId of selectedTilesArray) {
      const tile = allTiles.find(t => t.id === tileId);
      if (tile) {
        const tileLinks = new Set<string>();
        tile.tabs?.forEach(tab => {
          tab.sections?.forEach(section => {
            section.links?.forEach(link => tileLinks.add(link.id));
          });
          tab.links?.forEach(link => tileLinks.add(link.id));
        });
        
        // Check if at least one link from this tile is selected
        const hasSelectedLink = Array.from(tileLinks).some(linkId => selectedLinksArray.includes(linkId));
        if (!hasSelectedLink && tileLinks.size > 0) {
          setError(`Tile "${tile.title}" is selected but no links from it are selected. Please select at least one link from this tile.`);
          return;
        }
      }
    }

    try {
      setError('');
      // Always call both APIs to ensure unchecked items are removed
      // The backend will replace all assignments with the new selection
      await rolesService.assignTilesToRole(selectedRole.id, { tileIds: selectedTilesArray, canView: true });
      await rolesService.assignLinksToRole(selectedRole.id, { linkIds: selectedLinksArray, canView: true });
      setShowRoleTilesModal(false);
      setSelectedTileIds(new Set());
      setSelectedLinkIds(new Set());
      setTileSearchTerm('');
      setExpandedTiles(new Set());
      setExpandedLinks(new Set());
      await loadRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to assign tiles/links');
    }
  };

  const handleManageRoleTabs = async (role: Role) => {
    setSelectedRole(role);
    setRoleTabsLoading(true);
    setSelectedTabIds(new Set());
    try {
      // Load existing tab assignments for this role
      try {
        const roleTabs = await rolesService.getRoleTabs(role.id);
        const existingTabIds = new Set(roleTabs.map(rt => rt.tabId));
        setSelectedTabIds(existingTabIds);
      } catch (err) {
        // Ignore if no tabs assigned yet
      }
      setShowRoleTabsModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load tabs');
    } finally {
      setRoleTabsLoading(false);
    }
  };

  const handleAssignTabsToRole = async () => {
    if (!selectedRole) {
      setError('No role selected');
      return;
    }

    if (selectedTabIds.size === 0) {
      setError('Please select at least one tab');
      return;
    }

    try {
      setError('');
      await rolesService.assignTabsToRole(selectedRole.id, { tabIds: Array.from(selectedTabIds), canView: true });
      setShowRoleTabsModal(false);
      setSelectedTabIds(new Set());
      await loadRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to assign tabs');
    }
  };

  const handleManageRoleWidgets = async (role: Role) => {
    setSelectedRole(role);
    setRoleWidgetsLoading(true);
    setWidgetsLoading(true);
    setSelectedWidgetIds(new Set());
    try {
      // Load available widgets (built-in + custom)
      try {
        const response = await fetch(`${resolveApiBase()}/widgets.php?action=all`, {
          credentials: 'include'
        });
        if (response.ok) {
          const widgets = await response.json();
          setAvailableWidgets(widgets);
        } else {
          // Fallback to built-in widgets if API fails
          setAvailableWidgets([
            { id: 'clock', label: 'Clock', description: 'Time and timezone display widget' },
            { id: 'weather', label: 'Weather', description: 'Weather information widget' },
            { id: 'calculator', label: 'Calculator', description: 'Calculator widget' },
            { id: 'notes', label: 'Notes', description: 'Personal notes widget (requires authentication)' },
            { id: 'password-generator', label: 'Password Generator', description: 'Generate secure passwords' },
            { id: 'phonetic-alphabet', label: 'Phonetic Alphabet', description: 'Phonetic alphabet reference' },
            { id: 'zoom-control', label: 'Zoom Control', description: 'Page zoom control widget' },
            { id: 'theme', label: 'Theme', description: 'Theme switcher widget' },
            { id: 'fav-organizer', label: 'Favorite Organizer', description: 'Organize favorite links' },
            { id: 'chat', label: 'Chat', description: 'Chat widget (requires authentication)' },
            { id: 'snake-game', label: 'Snake Game', description: 'Snake game widget' }
          ]);
        }
      } catch (err) {
        // Fallback to built-in widgets
        setAvailableWidgets([
          { id: 'clock', label: 'Clock', description: 'Time and timezone display widget' },
          { id: 'weather', label: 'Weather', description: 'Weather information widget' },
          { id: 'calculator', label: 'Calculator', description: 'Calculator widget' },
          { id: 'notes', label: 'Notes', description: 'Personal notes widget (requires authentication)' },
          { id: 'password-generator', label: 'Password Generator', description: 'Generate secure passwords' },
          { id: 'phonetic-alphabet', label: 'Phonetic Alphabet', description: 'Phonetic alphabet reference' },
          { id: 'zoom-control', label: 'Zoom Control', description: 'Page zoom control widget' },
          { id: 'theme', label: 'Theme', description: 'Theme switcher widget' },
          { id: 'fav-organizer', label: 'Favorite Organizer', description: 'Organize favorite links' },
          { id: 'chat', label: 'Chat', description: 'Chat widget (requires authentication)' },
          { id: 'snake-game', label: 'Snake Game', description: 'Snake game widget' }
        ]);
      }
      
      // Load existing widget assignments for this role
      try {
        const roleWidgets = await rolesService.getRoleWidgets(role.id);
        const existingWidgetIds = new Set(roleWidgets.map(rw => rw.widgetId));
        setSelectedWidgetIds(existingWidgetIds);
      } catch (err) {
        // Ignore if no widgets assigned yet
      }
      setShowRoleWidgetsModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load widgets');
    } finally {
      setRoleWidgetsLoading(false);
      setWidgetsLoading(false);
    }
  };

  const handleAssignWidgetsToRole = async () => {
    if (!selectedRole) {
      setError('No role selected');
      return;
    }

    try {
      setError('');
      await rolesService.assignWidgetsToRole(selectedRole.id, { widgetIds: Array.from(selectedWidgetIds), canView: true });
      setShowRoleWidgetsModal(false);
      setSelectedWidgetIds(new Set());
      await loadRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to assign widgets');
    }
  };

  const handleAssignRolesToUser = async () => {
    if (!selectedUserForRoles) return;

    try {
      setError('');
      await rolesService.assignRolesToUser(selectedUserForRoles, { roleIds: userSelectedRoleIds });
      setShowUserRolesModal(false);
      setSelectedUserForRoles(null);
      setUserSelectedRoleIds([]);
      await loadRoles();
      await loadData(); // Refresh user list to show updated role counts
    } catch (err: any) {
      setError(err.message || 'Failed to assign roles to user');
    }
  };

  const loadUserRolesForBulk = async () => {
    if (allUsers.length === 0) return;
    
    try {
      setUserRolesLoading(true);
      // Use batch endpoint for much faster loading
      const batchRoles = await rolesService.getBatchUserRoles();
      
      // Convert batch response to map format
      const rolesMap: Record<number, Array<{ id: number; name: string; description?: string }>> = {};
      for (const item of batchRoles) {
        rolesMap[item.userId] = item.roles.map(r => ({ 
          id: r.id, 
          name: r.name, 
          description: r.description 
        }));
      }
      
      // Ensure all users have an entry (even if empty)
      for (const user of allUsers) {
        if (!rolesMap[user.id]) {
          rolesMap[user.id] = [];
        }
      }
      
      setUserRolesMap(rolesMap);
    } catch (err) {
      // If batch fails, fall back to empty map
      const rolesMap: Record<number, Array<{ id: number; name: string; description?: string }>> = {};
      for (const user of allUsers) {
        rolesMap[user.id] = [];
      }
      setUserRolesMap(rolesMap);
    } finally {
      setUserRolesLoading(false);
    }
  };

  const handleBulkAssignRoles = async () => {
    if (bulkSelectedUserIds.length === 0) {
      setError('Please select at least one user');
      return;
    }

    if (bulkSelectedRoleIds.length === 0) {
      setError('Please select at least one role');
      return;
    }

    try {
      setError('');
      setBulkAssignLoading(true);
      
      let result;
      if (bulkAssignMode === 'remove') {
        // Remove roles from users
        result = await rolesService.bulkRemoveRolesFromUsers({
          userIds: bulkSelectedUserIds,
          roleIds: bulkSelectedRoleIds
        });
      } else {
        // Assign roles to users (add or replace)
        result = await rolesService.bulkAssignRolesToUsers({
          userIds: bulkSelectedUserIds,
          roleIds: bulkSelectedRoleIds,
          mode: bulkAssignMode
        });
      }
      
      setShowBulkAssignModal(false);
      setBulkSelectedUserIds([]);
      setBulkSelectedRoleIds([]);
      setBulkAssignMode('add');
      setBulkUserSearchTerm('');
      setBulkRoleSearchTerm('');
      setUserRolesMap({});
      
      await loadRoles();
      await loadData(); // Refresh user list to show updated role counts
      
      if (bulkAssignMode === 'remove') {
        if (result.failed > 0) {
          alert(`Bulk removal completed with some errors:\n- Successfully removed: ${result.removed} users\n- Failed: ${result.failed} users${result.errors ? '\n\nErrors:\n' + result.errors.join('\n') : ''}`);
        } else {
          alert(`Successfully removed roles from ${result.removed} user${result.removed !== 1 ? 's' : ''}!`);
        }
      } else {
        if (result.failed > 0) {
          alert(`Bulk assignment completed with some errors:\n- Successfully assigned: ${result.assigned} users\n- Failed: ${result.failed} users${result.errors ? '\n\nErrors:\n' + result.errors.join('\n') : ''}`);
        } else {
          alert(`Successfully assigned roles to ${result.assigned} user${result.assigned !== 1 ? 's' : ''}!`);
        }
      }
    } catch (err: any) {
      setError(err.message || `Failed to ${bulkAssignMode === 'remove' ? 'remove' : 'assign'} roles`);
    } finally {
      setBulkAssignLoading(false);
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
      const userIdsArray = Array.from(selectedUserIds) as number[];
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

  const handleBulkDisable = async () => {
    if (selectedUserIds.size === 0) {
      return;
    }

    if (!confirm(`Are you sure you want to disable ${selectedUserIds.size} user(s)? Disabled users will not be able to log in.`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      setError('');
      const userIdsArray = Array.from(selectedUserIds) as number[];
      await authService.bulkDisableUsers(userIdsArray);
      await loadData();
      setSelectedUserIds(new Set()); // Clear selection after disable
    } catch (err: any) {
      setError(err.message || 'Failed to disable users');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkPromote = async () => {
    if (selectedUserIds.size === 0) {
      return;
    }

    if (!confirm(`Are you sure you want to promote ${selectedUserIds.size} user(s) to admin?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      setError('');
      const userIdsArray = Array.from(selectedUserIds) as number[];
      await authService.bulkPromoteUsers(userIdsArray);
      await loadData();
      setSelectedUserIds(new Set()); // Clear selection after promote
    } catch (err: any) {
      setError(err.message || 'Failed to promote users');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkToggleApproval = async () => {
    if (selectedUserIds.size === 0) {
      return;
    }

    if (!confirm(`Are you sure you want to toggle approval status for ${selectedUserIds.size} user(s)?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      setError('');
      const userIdsArray = Array.from(selectedUserIds) as number[];
      await authService.bulkToggleApproval(userIdsArray);
      await loadData();
      setSelectedUserIds(new Set()); // Clear selection after toggle
    } catch (err: any) {
      setError(err.message || 'Failed to toggle approval');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleToggleDisable = async (userId: number) => {
    try {
      setProcessing(userId);
      setError('');
      const result = await authService.toggleDisable(userId);
      // Update the user in the local state
      setAllUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === userId ? { ...u, is_disabled: result.is_disabled } : u
        )
      );
    } catch (err: any) {
      setError(err.message || 'Failed to toggle disabled status');
    } finally {
      setProcessing(null);
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

  const handleEditUser = async () => {
    if (!editUserModal.userId || !editUsername.trim() || !editEmail.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (editUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setEditUserLoading(true);
      setError('');
      const updatedUser = await authService.updateUser(editUserModal.userId, editUsername, editEmail, editAuthSource);
      setAllUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === editUserModal.userId ? { ...u, username: updatedUser.username, email: updatedUser.email, auth_source: updatedUser.auth_source } : u
        )
      );
      setEditUserModal({ open: false, userId: null, username: '', email: '', auth_source: 'local' });
      setEditUsername('');
      setEditEmail('');
      setEditAuthSource('local');
      alert('User updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setEditUserLoading(false);
    }
  };

  const handleChangeAdminPassword = async () => {
    if (!currentPassword.trim() || !adminNewPassword.trim()) {
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
      setError(err.message || 'Failed to change admin password');
    } finally {
      setAdminPasswordLoading(false);
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

  const handleBulkImportSaml = async () => {
    if (!samlImportFile) {
      setError('Please select a CSV file');
      return;
    }

    try {
      setSamlImporting(true);
      setError('');
      const result = await authService.bulkImportSamlUsers(samlImportFile);
      setBulkImportResults(result);
      setSamlImportFile(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to import SAML users');
    } finally {
      setSamlImporting(false);
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
    setSamlImportFile(null);
    setError('');
  };

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (addUserModal) {
          setAddUserModal(false);
          setError('');
        }
        if (adminPasswordModal) {
          setAdminPasswordModal(false);
          setCurrentPassword('');
          setAdminNewPassword('');
          setError('');
        }
      }
    };

    if (addUserModal || adminPasswordModal) {
      window.addEventListener('keydown', handleEscKey);
      return () => {
        window.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [addUserModal, adminPasswordModal]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-4' : ''}`}>
        <div className={`flex ${isMobile ? 'items-center justify-between w-full' : ''}`}>
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-slate-900 dark:text-white`}>Admin Panel</h1>
            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-slate-500 dark:text-slate-400 ${isMobile ? 'mt-0.5' : 'mt-1'}`}>Manage users and approvals</p>
          </div>
          {/* Mobile Hamburger Menu Button */}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors touch-manipulation"
              style={{ minHeight: '44px', minWidth: '44px' }}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )}
        </div>
        <div className={`flex items-center ${isMobile ? 'w-full justify-between' : 'gap-2'}`}>
          {/* Hide horizontal/vertical toggle on mobile */}
          {!isMobile && (
            <button
              onClick={() => setTabLayout(tabLayout === 'horizontal' ? 'vertical' : 'horizontal')}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={`Switch to ${tabLayout === 'horizontal' ? 'vertical' : 'horizontal'} layout`}
            >
              {tabLayout === 'horizontal' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 4.5zM2.75 9.083a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5H2.75zM2.75 12.663a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5H2.75zM2.75 16.25a.75.75 0 000 1.5h14.5a.75.75 0 100-1.5H2.75z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2 4.5A2.5 2.5 0 014.5 2h3A2.5 2.5 0 0110 4.5v11A2.5 2.5 0 017.5 18h-3A2.5 2.5 0 012 15.5v-11zM10.75 2.75a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM10.75 6.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM10.75 9.75a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM10.75 13.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM10.75 16.75a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
                </svg>
              )}
              {tabLayout === 'horizontal' ? 'Vertical' : 'Horizontal'}
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className={`${isMobile ? 'px-3 py-2.5 text-xs' : 'px-4 py-2 text-sm'} bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
            style={isMobile ? { minHeight: '44px' } : {}}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${isMobile ? 'w-4 h-4' : 'w-4 h-4'}`}>
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
            {!isMobile && 'Refresh'}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Tabs and Content Container */}
      <div className={isMobile ? 'space-y-6' : (tabLayout === 'horizontal' ? 'space-y-6' : 'flex gap-6')}>
        {/* Tabs - Mobile Sidebar */}
        {isMobile ? (
          <>
            {/* Mobile Sidebar Menu */}
            <div
              className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
                mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Menu</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg transition-colors touch-manipulation"
                  style={{ minHeight: '44px', minWidth: '44px' }}
                  aria-label="Close menu"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-1 p-2">
                {/* Home Button */}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.location.hash = '#/';
                  }}
                  className="px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent flex items-center gap-2"
                  style={{ minHeight: '44px' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                  </svg>
                  <span>Home</span>
                </button>
                
                <div className="my-2 border-t border-slate-200 dark:border-slate-700"></div>
                
                <button
                  onClick={() => {
                    setActiveTab('pending');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'pending'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <div className="flex items-center justify-between">
                    <span>Pending Users</span>
                    {pendingUsers.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs font-semibold">
                        {pendingUsers.length}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('all');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'all'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  All Users
                </button>
                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'settings'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Settings
                </button>
                <button
                  onClick={() => {
                    setActiveTab('database');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'database'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Database
                </button>
                <button
                  onClick={() => {
                    setActiveTab('spaces');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'spaces'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Spaces
                </button>
                <button
                  onClick={() => {
                    setActiveTab('ldap');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'ldap'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  LDAP
                </button>
                <button
                  onClick={() => {
                    setActiveTab('saml');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'saml'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  SAML
                </button>
                <button
                  onClick={() => {
                    setActiveTab('footer');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'footer'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Footer
                </button>
                <button
                  onClick={() => {
                    setActiveTab('tabVisibility');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'tabVisibility'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Enable/Disable Tabs
                </button>
                <button
                  onClick={() => {
                    setActiveTab('access');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'access'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Access Manager
                </button>
                <button
                  onClick={() => {
                    setActiveTab('clone');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'clone'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Clone
                </button>
                <button
                  onClick={() => {
                    setActiveTab('browser');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'browser'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Browser Extn Integration
                </button>
                <button
                  onClick={() => {
                    setActiveTab('broadcast');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'broadcast'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Broadcast Message
                </button>
                <button
                  onClick={() => {
                    setActiveTab('maintenance');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'maintenance'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Maintenance
                </button>
                <button
                  onClick={() => {
                    setActiveTab('widgets');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-sm font-medium transition-colors rounded-lg text-left touch-manipulation ${activeTab === 'widgets'
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  Custom Widgets
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Desktop Tabs */
          <div className={tabLayout === 'horizontal'
            ? "flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto"
            : "flex flex-col gap-1 w-64 border-r border-slate-200 dark:border-slate-700 pr-4"
          }>
            <button
              onClick={() => setActiveTab('pending')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'pending'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'pending'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
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
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'all'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'all'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              All Users
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'settings'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'settings'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'database'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'database'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Database
            </button>
            <button
              onClick={() => setActiveTab('spaces')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'spaces'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'spaces'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Spaces
            </button>
            <button
              onClick={() => setActiveTab('ldap')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'ldap'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'ldap'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              LDAP
            </button>
            <button
              onClick={() => setActiveTab('saml')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'saml'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'saml'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              SAML
            </button>
            <button
              onClick={() => setActiveTab('footer')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'footer'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'footer'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Footer
            </button>
            <button
              onClick={() => setActiveTab('tabVisibility')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'tabVisibility'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'tabVisibility'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Enable/Disable Tabs
            </button>
            <button
              onClick={() => setActiveTab('access')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'access'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'access'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Access Manager
            </button>
            <button
              onClick={() => setActiveTab('clone')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'clone'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'clone'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Clone
            </button>
            <button
              onClick={() => setActiveTab('browser')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'browser'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'browser'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Browser Extn Integration
            </button>
            <button
              onClick={() => setActiveTab('broadcast')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'broadcast'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'broadcast'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Broadcast Message
            </button>
            <button
              onClick={() => setActiveTab('maintenance')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'maintenance'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'maintenance'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Maintenance
            </button>
            <button
              onClick={() => setActiveTab('widgets')}
              className={tabLayout === 'horizontal'
                ? `px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'widgets'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`
                : `px-4 py-2.5 text-sm font-medium transition-colors rounded-lg text-left ${activeTab === 'widgets'
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              Custom Widgets
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className={isMobile ? 'w-full' : (tabLayout === 'horizontal' ? '' : 'flex-1')}>
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
                  <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} gap-4`}>
                    {/* Search Input */}
                    <div className={`${isMobile ? 'w-full' : 'flex-1 max-w-md'}`}>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search users by name or email..."
                          value={allUsersSearchTerm}
                          onChange={(e) => {
                            setAllUsersSearchTerm(e.target.value);
                            setAllUsersPage(1); // Reset to first page when searching
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        />
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {allUsersSearchTerm && (
                          <button
                            onClick={() => setAllUsersSearchTerm('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 ${isMobile ? 'flex-wrap w-full' : 'flex-wrap'}`}>
                      {selectedUserIds.size > 0 && (
                        <>
                          <button
                            onClick={handleBulkDisable}
                            disabled={bulkProcessing}
                            className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                          >
                            {bulkProcessing ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                </svg>
                                Disable Selected ({selectedUserIds.size})
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleBulkPromote}
                            disabled={bulkProcessing}
                            className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                          >
                            {bulkProcessing ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                </svg>
                                Promote Selected ({selectedUserIds.size})
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleBulkToggleApproval}
                            disabled={bulkProcessing}
                            className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                          >
                            {bulkProcessing ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                                Toggle Approval ({selectedUserIds.size})
                              </>
                            )}
                          </button>
                          <button
                            onClick={async () => {
                              const selectedCount = selectedUserIds.size;
                              const userNames = allUsers
                                .filter(u => selectedUserIds.has(u.id))
                                .map(u => u.username)
                                .join(', ');
                              
                              if (!confirm(`Are you sure you want to delete ${selectedCount} user(s)?\n\nUsers: ${userNames}\n\nThis will permanently delete their accounts and all their data. This action cannot be undone.`)) {
                                return;
                              }

                              try {
                                setBulkProcessing(true);
                                setError('');
                                const userIdsArray: number[] = Array.from(selectedUserIds);
                                
                                // Delete users one by one (since there's no bulk delete endpoint)
                                let successCount = 0;
                                let failCount = 0;
                                for (const userId of userIdsArray) {
                                  try {
                                    await authService.deleteUser(userId);
                                    successCount++;
                                  } catch (err) {
                                    failCount++;
                                    console.error(`Failed to delete user ${userId}:`, err);
                                  }
                                }
                                
                                if (failCount > 0) {
                                  setError(`${successCount} user(s) deleted successfully, but ${failCount} user(s) failed to delete.`);
                                }
                                
                                await loadData();
                                setSelectedUserIds(new Set());
                                if (onUserApproved) {
                                  onUserApproved();
                                }
                              } catch (err: any) {
                                setError(err.message || 'Failed to delete users');
                              } finally {
                                setBulkProcessing(false);
                              }
                            }}
                            disabled={bulkProcessing}
                            className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                          >
                            {bulkProcessing ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Deleting...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                                Delete Selected ({selectedUserIds.size})
                              </>
                            )}
                          </button>
                        </>
                      )}
                      <button
                        onClick={handleAutoDetectAuthSources}
                        disabled={autoDetecting}
                        className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
                        style={isMobile ? { minHeight: '44px' } : {}}
                        title="Auto-detect authentication sources for all users (SAML > LDAP > Local)"
                      >
                        {autoDetecting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Detecting...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                            </svg>
                            Auto-Detect Auth Sources
                          </>
                        )}
                      </button>
                      <button
                        onClick={openAddUserModal}
                        className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 touch-manipulation`}
                        style={isMobile ? { minHeight: '44px' } : {}}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10 5a3 3 0 100 6 3 3 0 000-6zM3.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM15.75 6a3 3 0 11-6 0 3 3 0 016 0zm1.423 11.285a1.224 1.224 0 00-.569-1.175 5.964 5.964 0 00-1.576-.19 5.964 5.964 0 00-2.383.676.224.224 0 00-.12.219c0 .288.09.567.26.804a5.96 5.96 0 013.5 2.377 5.96 5.96 0 003.5-2.377c.17-.237.26-.516.26-.804a.225.225 0 00-.12-.219z" />
                        </svg>
                        Add User
                      </button>
                    </div>
                  </div>
                  
                  {/* Desktop Table View */}
                  {!isMobile && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                              <input
                                type="checkbox"
                                checked={(() => {
                                  const filteredUsers = allUsers.filter(user => {
                                    if (!allUsersSearchTerm) return true;
                                    const search = allUsersSearchTerm.toLowerCase();
                                    return user.username.toLowerCase().includes(search) ||
                                           user.email.toLowerCase().includes(search);
                                  });
                                  const paginatedUsers = filteredUsers.slice(
                                    (allUsersPage - 1) * allUsersPerPage,
                                    allUsersPage * allUsersPerPage
                                  );
                                  return paginatedUsers.length > 0 && paginatedUsers.every(user => selectedUserIds.has(user.id));
                                })()}
                                onChange={() => {
                                  const filteredUsers = allUsers.filter(user => {
                                    if (!allUsersSearchTerm) return true;
                                    const search = allUsersSearchTerm.toLowerCase();
                                    return user.username.toLowerCase().includes(search) ||
                                           user.email.toLowerCase().includes(search);
                                  });
                                  const paginatedUsers = filteredUsers.slice(
                                    (allUsersPage - 1) * allUsersPerPage,
                                    allUsersPage * allUsersPerPage
                                  );
                                  
                                  if (paginatedUsers.every(user => selectedUserIds.has(user.id))) {
                                    // Deselect all paginated users
                                    const newSelection = new Set(selectedUserIds);
                                    paginatedUsers.forEach(user => newSelection.delete(user.id));
                                    setSelectedUserIds(newSelection);
                                  } else {
                                    // Select all paginated users
                                    const newSelection = new Set(selectedUserIds);
                                    paginatedUsers.forEach(user => newSelection.add(user.id));
                                    setSelectedUserIds(newSelection);
                                  }
                                }}
                                className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                              />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">User</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Badges</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Registered</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {allUsers
                            .filter(user => {
                              if (!allUsersSearchTerm) return true;
                              const search = allUsersSearchTerm.toLowerCase();
                              return user.username.toLowerCase().includes(search) ||
                                     user.email.toLowerCase().includes(search);
                            })
                            .map((user) => {
                              // Get user's roles
                              const userRoles = userRolesMap[user.id] || [];
                              // Get user's tile admin count (tiles where they have canEdit=true)
                              const tileAdminCount = permissions.filter(
                                p => p.userId === user.id && p.canEdit
                              ).length;
                              
                              return (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={selectedUserIds.has(user.id)}
                                      onChange={() => {
                                        const newSelection = new Set(selectedUserIds);
                                        if (newSelection.has(user.id)) {
                                          newSelection.delete(user.id);
                                        } else {
                                          newSelection.add(user.id);
                                        }
                                        setSelectedUserIds(newSelection);
                                      }}
                                      className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                                    />
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${user.is_admin
                                        ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                                        : 'bg-gradient-to-br from-brand-500 to-brand-600'
                                        }`}>
                                        {user.username.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <span className="font-medium text-slate-900 dark:text-white block">{user.username}</span>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                          {user.is_admin && (
                                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold whitespace-nowrap">
                                              Admin
                                            </span>
                                          )}
                                          {user.auth_source === 'saml' ? (
                                            <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-semibold whitespace-nowrap">
                                              SAML
                                            </span>
                                          ) : user.auth_source === 'ldap' ? (
                                            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-semibold whitespace-nowrap">
                                              LDAP
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold whitespace-nowrap">
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
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {userRolesLoading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500"></div>
                                  ) : (
                                    <>
                                      {/* Role badges */}
                                      {userRoles.map((role) => (
                                        <span
                                          key={role.id}
                                          className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                          title={role.description || `Role: ${role.name}`}
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                          </svg>
                                          {role.name}
                                        </span>
                                      ))}
                                      {/* Tile Admin badge */}
                                      {tileAdminCount > 0 && (
                                        <span
                                          className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400 text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                          title={`Tile Admin for ${tileAdminCount} tile${tileAdminCount !== 1 ? 's' : ''}`}
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.98 5.98 0 00-4.93 2.26l.896 1.79a1 1 0 101.788.894l-1.062-2.12A5.98 5.98 0 0110 12z" clipRule="evenodd" />
                                          </svg>
                                          Tile Admin ({tileAdminCount})
                                        </span>
                                      )}
                                      {userRoles.length === 0 && tileAdminCount === 0 && (
                                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">No badges</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex flex-col gap-1">
                                  {user.is_disabled ? (
                                    <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-semibold">
                                      Disabled
                                    </span>
                                  ) : user.is_approved ? (
                                    <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                      Approved
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-semibold">
                                      Pending
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-500">
                                {formatDate(user.created_at)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2 user-actions-dropdown relative">
                                  {/* Primary action buttons - always visible */}
                                  {!user.is_admin && (
                                    <button
                                      onClick={() => {
                                        setEditUserModal({ open: true, userId: user.id, username: user.username, email: user.email, auth_source: user.auth_source || 'local' });
                                        setEditUsername(user.username);
                                        setEditEmail(user.email);
                                        setEditAuthSource((user.auth_source || 'local') as 'local' | 'ldap' | 'saml');
                                      }}
                                      disabled={processing === user.id}
                                      className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                                      title="Edit User"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.919 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                      </svg>
                                    </button>
                                  )}
                                  {!user.is_admin && (
                                    <button
                                      onClick={() => handleDeleteUser(user.id, user.username)}
                                      disabled={processing === user.id}
                                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
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
                                    </button>
                                  )}
                                  
                                  {/* Dropdown menu button */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdownUserId(openDropdownUserId === user.id ? null : user.id);
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                                      title="More actions"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                                      </svg>
                                    </button>
                                    
                                    {/* Dropdown menu */}
                                    {openDropdownUserId === user.id && (
                                      <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 py-1">
                                        {/* Promote/Demote */}
                                        <button
                                          onClick={async () => {
                                            setOpenDropdownUserId(null);
                                            try {
                                              setProcessing(user.id);
                                              setError('');
                                              const result = await authService.toggleAdmin(user.id);
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
                                          className={`w-full px-4 py-2 text-left text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 ${user.is_admin
                                            ? 'text-amber-700 dark:text-amber-400'
                                            : 'text-emerald-700 dark:text-emerald-400'
                                            }`}
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
                                          {user.is_admin ? 'Demote from Admin' : 'Promote to Admin'}
                                        </button>
                                        
                                        {!user.is_admin && (
                                          <>
                                            {/* Disable/Enable */}
                                            <button
                                              onClick={() => {
                                                setOpenDropdownUserId(null);
                                                handleToggleDisable(user.id);
                                              }}
                                              disabled={processing === user.id}
                                              className={`w-full px-4 py-2 text-left text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 ${user.is_disabled
                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                : 'text-orange-700 dark:text-orange-400'
                                                }`}
                                            >
                                              {user.is_disabled ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                </svg>
                                              ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                                </svg>
                                              )}
                                              {user.is_disabled ? 'Enable User' : 'Disable User'}
                                            </button>
                                            
                                            {/* Toggle Auth Source */}
                                            <button
                                              onClick={async () => {
                                                setOpenDropdownUserId(null);
                                                try {
                                                  setProcessing(user.id);
                                                  setError('');
                                                  const result = await authService.toggleAuthSource(user.id);
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
                                              className="w-full px-4 py-2 text-left text-xs font-medium text-purple-700 dark:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                              </svg>
                                              Toggle Auth Source
                                            </button>
                                            
                                            {/* Reset Password */}
                                            {user.auth_source !== 'ldap' && user.auth_source !== 'saml' && (
                                              <button
                                                onClick={() => {
                                                  setOpenDropdownUserId(null);
                                                  setResetPasswordModal({ open: true, userId: user.id, username: user.username });
                                                }}
                                                disabled={processing === user.id}
                                                className="w-full px-4 py-2 text-left text-xs font-medium text-blue-700 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                                              >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                                </svg>
                                                Reset Password
                                              </button>
                                            )}
                                            
                                            {/* Impersonate */}
                                            <button
                                              onClick={async () => {
                                                setOpenDropdownUserId(null);
                                                try {
                                                  setProcessing(user.id);
                                                  setError('');
                                                  await authService.startImpersonation(user.id);
                                                  window.location.reload();
                                                } catch (err: any) {
                                                  setError(err.message || 'Failed to start impersonation');
                                                  setProcessing(null);
                                                }
                                              }}
                                              disabled={processing === user.id}
                                              className="w-full px-4 py-2 text-left text-xs font-medium text-indigo-700 dark:text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM16 8a2 2 0 11-4 0 2 2 0 014 0zm-1.615 8.428a1.224 1.224 0 00.569-1.175 5.966 5.966 0 00-2.081-.416 5.967 5.967 0 00-1.788.27A9.953 9.953 0 0013 18a9.953 9.953 0 003.385-.572z" />
                                              </svg>
                                              Impersonate
                                            </button>
                                            
                                            {/* Roles */}
                                            <button
                                              onClick={async () => {
                                                setOpenDropdownUserId(null);
                                                try {
                                                  await handleManageUserRoles(user.id);
                                                } catch (err: any) {
                                                  setError(err.message || 'Failed to load user roles');
                                                }
                                              }}
                                              disabled={processing === user.id}
                                              className="w-full px-4 py-2 text-left text-xs font-medium text-violet-700 dark:text-violet-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                              </svg>
                                              Assign Roles
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                            })
                            .slice((allUsersPage - 1) * allUsersPerPage, allUsersPage * allUsersPerPage)}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  )}
                  
                  {/* Mobile Card View */}
                  {isMobile && (
                    <div className="space-y-3">
                      {allUsers
                        .filter(user => {
                          if (!allUsersSearchTerm) return true;
                          const search = allUsersSearchTerm.toLowerCase();
                          return user.username.toLowerCase().includes(search) ||
                                 user.email.toLowerCase().includes(search);
                        })
                        .map((user) => {
                          // Get user's roles
                          const userRoles = userRolesMap[user.id] || [];
                          // Get user's tile admin count (tiles where they have canEdit=true)
                          const tileAdminCount = permissions.filter(
                            p => p.userId === user.id && p.canEdit
                          ).length;
                          
                          return (
                            <div
                              key={user.id}
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm"
                            >
                              {/* User Header */}
                              <div className="flex items-start gap-3 mb-3">
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.has(user.id)}
                                  onChange={() => {
                                    const newSelection = new Set(selectedUserIds);
                                    if (newSelection.has(user.id)) {
                                      newSelection.delete(user.id);
                                    } else {
                                      newSelection.add(user.id);
                                    }
                                    setSelectedUserIds(newSelection);
                                  }}
                                  className="w-5 h-5 mt-1 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2 flex-shrink-0"
                                />
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${user.is_admin
                                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                                  : 'bg-gradient-to-br from-brand-500 to-brand-600'
                                  }`}>
                                  {user.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <h3 className="font-semibold text-slate-900 dark:text-white text-base truncate">
                                      {user.username}
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap mb-2">
                                    {user.is_admin && (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold whitespace-nowrap">
                                        Admin
                                      </span>
                                    )}
                                    {user.auth_source === 'saml' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-semibold whitespace-nowrap">
                                        SAML
                                      </span>
                                    ) : user.auth_source === 'ldap' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-semibold whitespace-nowrap">
                                        LDAP
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold whitespace-nowrap">
                                        Local
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Email */}
                              <div className="mb-3">
                                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Email</div>
                                <div className="text-sm text-slate-900 dark:text-white break-all">{user.email}</div>
                              </div>
                              
                              {/* Badges */}
                              <div className="mb-3">
                                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Badges</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {userRolesLoading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500"></div>
                                  ) : (
                                    <>
                                      {userRoles.map((role) => (
                                        <span
                                          key={role.id}
                                          className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                          </svg>
                                          {role.name}
                                        </span>
                                      ))}
                                      {tileAdminCount > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400 text-xs font-semibold whitespace-nowrap flex items-center gap-1">
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.98 5.98 0 00-4.93 2.26l.896 1.79a1 1 0 101.788.894l-1.062-2.12A5.98 5.98 0 0110 12z" clipRule="evenodd" />
                                          </svg>
                                          Tile Admin ({tileAdminCount})
                                        </span>
                                      )}
                                      {userRoles.length === 0 && tileAdminCount === 0 && (
                                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">No badges</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              
                              {/* Status and Registered Date */}
                              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                                <div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Status</div>
                                  {user.is_disabled ? (
                                    <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-semibold">
                                      Disabled
                                    </span>
                                  ) : user.is_approved ? (
                                    <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                      Approved
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-semibold">
                                      Pending
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Registered</div>
                                  <div className="text-xs text-slate-600 dark:text-slate-400">{formatDate(user.created_at)}</div>
                                </div>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {!user.is_admin && (
                                  <button
                                    onClick={() => {
                                      setEditUserModal({ open: true, userId: user.id, username: user.username, email: user.email, auth_source: user.auth_source || 'local' });
                                      setEditUsername(user.username);
                                      setEditEmail(user.email);
                                      setEditAuthSource((user.auth_source || 'local') as 'local' | 'ldap' | 'saml');
                                    }}
                                    disabled={processing === user.id}
                                    className="flex-1 min-w-[100px] px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
                                    style={{ minHeight: '44px' }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.919 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                    </svg>
                                    Edit
                                  </button>
                                )}
                                {!user.is_admin && (
                                  <button
                                    onClick={() => handleDeleteUser(user.id, user.username)}
                                    disabled={processing === user.id}
                                    className="flex-1 min-w-[100px] px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
                                    style={{ minHeight: '44px' }}
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
                                    Delete
                                  </button>
                                )}
                                
                                {/* Dropdown menu button */}
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownUserId(openDropdownUserId === user.id ? null : user.id);
                                    }}
                                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
                                    style={{ minHeight: '44px' }}
                                    title="More actions"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                      <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                                    </svg>
                                    More
                                  </button>
                                  
                                  {/* Dropdown menu */}
                                  {openDropdownUserId === user.id && (
                                    <div className="absolute right-0 bottom-full mb-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2">
                                      {/* Promote/Demote */}
                                      <button
                                        onClick={async () => {
                                          setOpenDropdownUserId(null);
                                          try {
                                            setProcessing(user.id);
                                            setError('');
                                            const result = await authService.toggleAdmin(user.id);
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
                                        className={`w-full px-4 py-3 text-left text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 touch-manipulation ${user.is_admin
                                          ? 'text-amber-700 dark:text-amber-400'
                                          : 'text-emerald-700 dark:text-emerald-400'
                                          }`}
                                        style={{ minHeight: '44px' }}
                                      >
                                        {processing === user.id ? (
                                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                          </svg>
                                        ) : user.is_admin ? (
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                          </svg>
                                        ) : (
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                        {user.is_admin ? 'Demote from Admin' : 'Promote to Admin'}
                                      </button>
                                      
                                      {!user.is_admin && (
                                        <>
                                          {/* Disable/Enable */}
                                          <button
                                            onClick={() => {
                                              setOpenDropdownUserId(null);
                                              handleToggleDisable(user.id);
                                            }}
                                            disabled={processing === user.id}
                                            className={`w-full px-4 py-3 text-left text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 touch-manipulation ${user.is_disabled
                                              ? 'text-emerald-700 dark:text-emerald-400'
                                              : 'text-orange-700 dark:text-orange-400'
                                              }`}
                                            style={{ minHeight: '44px' }}
                                          >
                                            {user.is_disabled ? (
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                              </svg>
                                            ) : (
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                              </svg>
                                            )}
                                            {user.is_disabled ? 'Enable User' : 'Disable User'}
                                          </button>
                                          
                                          {/* Toggle Auth Source */}
                                          <button
                                            onClick={async () => {
                                              setOpenDropdownUserId(null);
                                              try {
                                                setProcessing(user.id);
                                                setError('');
                                                const result = await authService.toggleAuthSource(user.id);
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
                                            className="w-full px-4 py-3 text-left text-sm font-medium text-purple-700 dark:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 touch-manipulation"
                                            style={{ minHeight: '44px' }}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                            </svg>
                                            Toggle Auth Source
                                          </button>
                                          
                                          {/* Reset Password */}
                                          {user.auth_source !== 'ldap' && user.auth_source !== 'saml' && (
                                            <button
                                              onClick={() => {
                                                setOpenDropdownUserId(null);
                                                setResetPasswordModal({ open: true, userId: user.id, username: user.username });
                                              }}
                                              disabled={processing === user.id}
                                              className="w-full px-4 py-3 text-left text-sm font-medium text-blue-700 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 touch-manipulation"
                                              style={{ minHeight: '44px' }}
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                              </svg>
                                              Reset Password
                                            </button>
                                          )}
                                          
                                          {/* Impersonate */}
                                          <button
                                            onClick={async () => {
                                              setOpenDropdownUserId(null);
                                              try {
                                                setProcessing(user.id);
                                                setError('');
                                                await authService.startImpersonation(user.id);
                                                window.location.reload();
                                              } catch (err: any) {
                                                setError(err.message || 'Failed to start impersonation');
                                                setProcessing(null);
                                              }
                                            }}
                                            disabled={processing === user.id}
                                            className="w-full px-4 py-3 text-left text-sm font-medium text-indigo-700 dark:text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 touch-manipulation"
                                            style={{ minHeight: '44px' }}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM16 8a2 2 0 11-4 0 2 2 0 014 0zm-1.615 8.428a1.224 1.224 0 00.569-1.175 5.966 5.966 0 00-2.081-.416 5.967 5.967 0 00-1.788.27A9.953 9.953 0 0013 18a9.953 9.953 0 003.385-.572z" />
                                            </svg>
                                            Impersonate
                                          </button>
                                          
                                          {/* Roles */}
                                          <button
                                            onClick={async () => {
                                              setOpenDropdownUserId(null);
                                              try {
                                                await handleManageUserRoles(user.id);
                                              } catch (err: any) {
                                                setError(err.message || 'Failed to load user roles');
                                              }
                                            }}
                                            disabled={processing === user.id}
                                            className="w-full px-4 py-3 text-left text-sm font-medium text-violet-700 dark:text-violet-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 touch-manipulation"
                                            style={{ minHeight: '44px' }}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                              <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                            </svg>
                                            Assign Roles
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                        .slice((allUsersPage - 1) * allUsersPerPage, allUsersPage * allUsersPerPage)}
                    </div>
                  )}
                  
                    {/* Pagination Controls */}
                    {(() => {
                      const filteredUsers = allUsers.filter(user => {
                        if (!allUsersSearchTerm) return true;
                        const search = allUsersSearchTerm.toLowerCase();
                        return user.username.toLowerCase().includes(search) ||
                               user.email.toLowerCase().includes(search);
                      });
                      const totalUsers = filteredUsers.length;
                      const totalPages = Math.ceil(totalUsers / allUsersPerPage);
                      const startUser = totalUsers === 0 ? 0 : (allUsersPage - 1) * allUsersPerPage + 1;
                      const endUser = Math.min(allUsersPage * allUsersPerPage, totalUsers);
                      
                      return (
                        <div className={`${isMobile ? 'px-4' : 'px-6'} py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50`}>
                          <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} gap-4`}>
                            <div className={`flex ${isMobile ? 'flex-col sm:flex-row' : 'items-center'} gap-4`}>
                              <div className="text-sm text-slate-600 dark:text-slate-400">
                                Showing <span className="font-medium text-slate-900 dark:text-white">{startUser}</span> to{' '}
                                <span className="font-medium text-slate-900 dark:text-white">{endUser}</span> of{' '}
                                <span className="font-medium text-slate-900 dark:text-white">{totalUsers}</span> users
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  Show:
                                </label>
                                <select
                                  value={allUsersPerPage}
                                  onChange={(e) => {
                                    setAllUsersPerPage(parseInt(e.target.value));
                                    setAllUsersPage(1); // Reset to first page when changing items per page
                                  }}
                                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 touch-manipulation"
                                  style={{ minHeight: '44px' }}
                                >
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                              </div>
                            </div>
                            
                            {totalPages > 1 && (
                              <div className={`flex items-center ${isMobile ? 'justify-center flex-wrap' : 'gap-2'}`}>
                                <button
                                  onClick={() => setAllUsersPage(prev => Math.max(1, prev - 1))}
                                  disabled={allUsersPage === 1}
                                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                                  style={{ minHeight: '44px' }}
                                >
                                  Previous
                                </button>
                                
                                <div className="flex items-center gap-1 mx-2">
                                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                      pageNum = i + 1;
                                    } else if (allUsersPage <= 3) {
                                      pageNum = i + 1;
                                    } else if (allUsersPage >= totalPages - 2) {
                                      pageNum = totalPages - 4 + i;
                                    } else {
                                      pageNum = allUsersPage - 2 + i;
                                    }
                                    
                                    return (
                                      <button
                                        key={pageNum}
                                        onClick={() => setAllUsersPage(pageNum)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                                          allUsersPage === pageNum
                                            ? 'bg-brand-600 text-white'
                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                        }`}
                                        style={{ minHeight: '44px', minWidth: '44px' }}
                                      >
                                        {pageNum}
                                      </button>
                                    );
                                  })}
                                </div>
                                
                                <button
                                  onClick={() => setAllUsersPage(prev => Math.min(totalPages, prev + 1))}
                                  disabled={allUsersPage === totalPages}
                                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                                  style={{ minHeight: '44px' }}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                </div>
              )}

              {/* Database Tab */}
              {activeTab === 'database' && (
                <div className="space-y-6">
                  <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl ${isMobile ? 'p-4' : 'p-6'}`}>
                    <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-bold text-slate-900 dark:text-white mb-4`}>Database Export & Import</h3>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-400 mb-6`}>
                      Export your database as a JSON file for backup or import it to restore data on a new instance.
                    </p>

                    <div className="grid grid-cols-1 gap-6">
                      {/* Export Section */}
                      <div className="space-y-4">
                        <div>
                          <h4 className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold text-slate-900 dark:text-white mb-2`}>Export Database</h4>
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-400 mb-4`}>
                            Download all database data (users, tiles, tabs, sections, links, settings, arrangements, rich text content, favorites, permissions, style profiles, and user preferences) as a JSON file.
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
                            className={`w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white ${isMobile ? 'px-3 py-3 text-sm' : 'px-4 py-2.5 text-sm'} font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
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
                          <h4 className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold text-slate-900 dark:text-white mb-2`}>Import Database</h4>
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-400 mb-4`}>
                            Import a previously exported JSON file. This will replace all existing data.
                          </p>
                          <div className="space-y-3">
                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-600 dark:text-slate-400 mb-2`}>
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
                                className={`w-full ${isMobile ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-400 file:mr-4 ${isMobile ? 'file:py-3 file:px-3' : 'file:py-2 file:px-4'} file:rounded-lg file:border-0 ${isMobile ? 'file:text-xs' : 'file:text-sm'} file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                              />
                              {importFile && (
                                <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-slate-500 dark:text-slate-400 mt-2 break-all`}>
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
                                  if (result.imported.rich_text_content !== undefined && result.imported.rich_text_content > 0) {
                                    importedDetails.push(`Rich Text Content: ${result.imported.rich_text_content}`);
                                  }
                                  if (result.imported.user_tile_favorites !== undefined && result.imported.user_tile_favorites > 0) {
                                    importedDetails.push(`User Favorites: ${result.imported.user_tile_favorites}`);
                                  }
                                  if (result.imported.user_tile_permissions !== undefined && result.imported.user_tile_permissions > 0) {
                                    importedDetails.push(`User Permissions: ${result.imported.user_tile_permissions}`);
                                  }
                                  if (result.imported.style_profiles !== undefined && result.imported.style_profiles > 0) {
                                    importedDetails.push(`Style Profiles: ${result.imported.style_profiles}`);
                                  }
                                  if (result.imported.user_preferences !== undefined && result.imported.user_preferences > 0) {
                                    importedDetails.push(`User Preferences: ${result.imported.user_preferences}`);
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
                              className={`w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white ${isMobile ? 'px-3 py-3 text-sm' : 'px-4 py-2.5 text-sm'} font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 touch-manipulation`}
                              style={isMobile ? { minHeight: '44px' } : {}}
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

                    <div className={`mt-6 ${isMobile ? 'p-3' : 'p-4'} bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg`}>
                      <div className={`flex ${isMobile ? 'flex-col sm:flex-row' : 'flex-row'} gap-3`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-amber-600 dark:text-amber-400 flex-shrink-0 ${isMobile ? '' : 'mt-0.5'}`}>
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-amber-800 dark:text-amber-300 mb-1`}>Important Notes</p>
                          <ul className={`${isMobile ? 'text-[11px]' : 'text-xs'} text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside`}>
                            <li>Export creates a complete backup of all database tables including: users, tiles, tabs, sections, links, settings, arrangements, rich text content, user favorites, user permissions, style profiles, and user preferences</li>
                            <li>Export includes all data: user authentication sources, link health status, visibility settings, notes, tooltips, rich text formatting, access control permissions, and style configurations</li>
                            <li>Import will replace ALL existing data - use with caution</li>
                            <li>Always export before importing to avoid data loss</li>
                            <li>The exported file contains sensitive information (passwords, permissions, etc.) - keep it secure</li>
                            <li>Database indexes are automatically recreated after import for optimal performance</li>
                            <li>Note: The clones table is excluded from export/import as it contains operational/temporary data</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Snapshots Management Section */}
                    <div className={`${isMobile ? 'mt-6' : 'mt-8'} ${isMobile ? 'pt-6' : 'pt-8'} border-t border-slate-200 dark:border-slate-700`}>
                      <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-3' : ''} mb-4`}>
                        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-bold text-slate-900 dark:text-white`}>Database Snapshots (Backups)</h3>
                        <div className={`flex items-center ${isMobile ? 'w-full justify-between' : 'gap-2'}`}>
                          <button
                            onClick={loadSnapshots}
                            className={`${isMobile ? 'p-2.5' : 'p-2'} text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors touch-manipulation`}
                            style={isMobile ? { minHeight: '44px', minWidth: '44px' } : {}}
                            title="Refresh list"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${isMobile ? 'w-5 h-5' : 'w-5 h-5'} ${snapshotsLoading ? 'animate-spin' : ''}`}>
                              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                setSnapshotCreating(true);
                                await databaseService.createSnapshot();
                                await loadSnapshots();
                                alert('Database snapshot created successfully!');
                              } catch (err: any) {
                                setError(err.message || 'Failed to create snapshot');
                              } finally {
                                setSnapshotCreating(false);
                              }
                            }}
                            disabled={snapshotCreating}
                            className={`bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white ${isMobile ? 'px-3 py-2.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg font-semibold transition-colors flex items-center gap-2 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                          >
                            {snapshotCreating ? 'Creating...' : '+ Create Snapshot'}
                          </button>
                        </div>
                      </div>
                      <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-400 mb-6`}>
                        Manage full database snapshots stored on the server. Snapshots can be used to quickly restore the entire application state.
                        A nightly snapshot is automatically taken and kept for 30 days.
                      </p>

                      {/* Desktop Table View */}
                      {!isMobile && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                          <thead>
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date & Time</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Filename</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {snapshotsLoading && snapshots.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">Loading snapshots...</td>
                              </tr>
                            ) : snapshots.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No snapshots found.</td>
                              </tr>
                            ) : (
                              snapshots.map((snap) => (
                                <tr key={snap.filename} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900 dark:text-white">
                                    {snap.created_at_formatted}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                                    {snap.filename}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-mono">
                                    {snap.size_formatted}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Are you sure you want to RESTORE the database from ${snap.filename}? This will OVERWRITE all current data!`)) return;
                                          try {
                                            setSnapshotRestoring(snap.filename);
                                            await databaseService.restoreSnapshot(snap.filename);
                                            alert('Database restored successfully! The page will now reload.');
                                            window.location.reload();
                                          } catch (err: any) {
                                            setError(err.message || 'Failed to restore snapshot');
                                          } finally {
                                            setSnapshotRestoring(null);
                                          }
                                        }}
                                        disabled={snapshotRestoring !== null}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                                      >
                                        {snapshotRestoring === snap.filename ? 'Restoring...' : 'Restore'}
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Are you sure you want to DELETE snapshot ${snap.filename}?`)) return;
                                          try {
                                            await databaseService.deleteSnapshot(snap.filename);
                                            await loadSnapshots();
                                          } catch (err: any) {
                                            setError(err.message || 'Failed to delete snapshot');
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-slate-200 hover:bg-red-100 dark:bg-slate-700 dark:hover:bg-red-900/30 text-slate-700 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 rounded-lg text-xs font-medium transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                        </div>
                      )}

                      {/* Mobile Card View */}
                      {isMobile && (
                        <div className="space-y-3">
                          {snapshotsLoading && snapshots.length === 0 ? (
                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
                              <p className="text-sm text-slate-500">Loading snapshots...</p>
                            </div>
                          ) : snapshots.length === 0 ? (
                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
                              <p className="text-sm text-slate-500">No snapshots found.</p>
                            </div>
                          ) : (
                            snapshots.map((snap) => (
                              <div
                                key={snap.filename}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm"
                              >
                                <div className="space-y-3">
                                  <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Date & Time</div>
                                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                                      {snap.created_at_formatted}
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Filename</div>
                                    <div className="text-sm text-slate-600 dark:text-slate-400 break-all">
                                      {snap.filename}
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Size</div>
                                    <div className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                                      {snap.size_formatted}
                                    </div>
                                  </div>
                                  
                                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex flex-col gap-2">
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Are you sure you want to RESTORE the database from ${snap.filename}? This will OVERWRITE all current data!`)) return;
                                          try {
                                            setSnapshotRestoring(snap.filename);
                                            await databaseService.restoreSnapshot(snap.filename);
                                            alert('Database restored successfully! The page will now reload.');
                                            window.location.reload();
                                          } catch (err: any) {
                                            setError(err.message || 'Failed to restore snapshot');
                                          } finally {
                                            setSnapshotRestoring(null);
                                          }
                                        }}
                                        disabled={snapshotRestoring !== null}
                                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors touch-manipulation"
                                        style={{ minHeight: '44px' }}
                                      >
                                        {snapshotRestoring === snap.filename ? 'Restoring...' : 'Restore'}
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Are you sure you want to DELETE snapshot ${snap.filename}?`)) return;
                                          try {
                                            await databaseService.deleteSnapshot(snap.filename);
                                            await loadSnapshots();
                                          } catch (err: any) {
                                            setError(err.message || 'Failed to delete snapshot');
                                          }
                                        }}
                                        className="w-full px-4 py-2.5 bg-slate-200 hover:bg-red-100 dark:bg-slate-700 dark:hover:bg-red-900/30 text-slate-700 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 rounded-lg text-sm font-medium transition-colors touch-manipulation"
                                        style={{ minHeight: '44px' }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      <div className={`${isMobile ? 'mt-6' : 'mt-8'} ${isMobile ? 'p-3' : 'p-4'} bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg`}>
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2`}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-brand-500`}>
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                          </svg>
                          Automated Snapshots (Cron / Task Scheduler)
                        </h4>
                        <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-2'} gap-6`}>
                          <div>
                            <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase`}>Windows (XAMPP)</p>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-[11px]'} text-slate-600 dark:text-slate-400 space-y-2`}>
                              <p>To schedule a daily backup at 3:00 AM:</p>
                              <ol className="list-decimal list-inside space-y-1">
                                <li>Open <strong>Task Scheduler</strong></li>
                                <li>Click <strong>Create Basic Task...</strong></li>
                                <li>Name: <code>LinkNest Snapshot</code></li>
                                <li>Trigger: <strong>Daily</strong> (3:00 AM)</li>
                                <li>Action: <strong>Start a program</strong></li>
                                <li>Program: <code>C:\xampp\php\php.exe</code></li>
                                <li>Arguments: <code>"{window.location.protocol === 'http:' ? 'C:\\xampp\\htdocs\\linknest\\api\\snapshot.php' : '/path/to/api/snapshot.php'}"</code></li>
                              </ol>
                            </div>
                          </div>
                          <div>
                            <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase`}>Linux (Cron)</p>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-[11px]'} text-slate-600 dark:text-slate-400 space-y-2`}>
                              <p>Add this to your crontab (<code>crontab -e</code>):</p>
                              <code className={`block ${isMobile ? 'p-1.5 text-[9px]' : 'p-2'} bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-brand-600 dark:text-brand-400 select-all break-all`}>
                                0 3 * * * /usr/bin/php {window.location.protocol === 'http:' ? 'C:\\xampp\\htdocs\\linknest\\api\\snapshot.php' : '/var/www/html/api/snapshot.php'} &gt; /dev/null 2&gt;&amp;1
                              </code>
                              <p className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} mt-2 italic`}>Note: Ensure the user running the task has write permissions to the <code>data/backups</code> directory.</p>
                            </div>
                          </div>
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
                      JSON format includes all features: rich text content, tabs, scheduling, visibility settings, browser preferences, icons, and more.
                      CSV format is simplified and includes only basic link information.
                    </p>

                    <div className="grid grid-cols-1 gap-6">
                      {/* Export Section */}
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Export Spaces</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Export all spaces to JSON or CSV format for backup or sharing.
                            JSON format preserves all data including rich text content, tabs, scheduling, visibility, browser settings, and more.
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
                                  // Note: CSV format is simplified and does not include rich text content, tabs structure, scheduling, browser settings, icons, or other advanced features
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
                                                  `"${(tile.emoji || 'ðŸ“').replace(/"/g, '""')}"`,
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
                                              `"${(tile.emoji || 'ðŸ“').replace(/"/g, '""')}"`,
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
                            <li><strong>JSON Export:</strong> Preserves all space data including categories, arrangements, tabs, rich text content, scheduling, visibility settings, browser preferences, icons, and more</li>
                            <li><strong>CSV Export:</strong> Creates a simplified spreadsheet-friendly format for bulk editing. <strong>Note:</strong> CSV format does not include rich text content, tabs, scheduling, or advanced features - use JSON for complete data preservation</li>
                            <li><strong>CSV Import:</strong> Requires specific column format - download template for reference. Only basic link information is imported</li>
                            <li>Importing spaces adds them to your existing collection (does not replace existing spaces)</li>
                            <li><strong>JSON format supports:</strong> All link properties (visibility, notes, tooltips, icons, text colors, browser settings), rich text content with formatting, tabs with scheduling, section and tab text colors, tile-level browser preferences, and visibility controls</li>
                            <li>Category imports preserve the category name from the export file</li>
                            <li>Rich text content, tabs, and all advanced features are preserved in JSON exports and can be imported back</li>
                            <li>Export version 1.1 includes all new features - older 1.0 exports are still supported for backward compatibility</li>
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
                  <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl ${isMobile ? 'p-4' : 'p-6'}`}>
                    <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-4' : ''} mb-6`}>
                      <div className={isMobile ? 'w-full' : ''}>
                        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-bold text-slate-900 dark:text-white`}>LDAP Configuration</h3>
                        <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-400`}>
                          Configure LDAP integration for user authentication.
                        </p>
                      </div>
                      <div className={`flex items-center ${isMobile ? 'w-full justify-between' : 'gap-3'}`}>
                        <label className={`relative inline-flex items-center cursor-pointer touch-manipulation ${isMobile ? 'flex-1' : ''}`}>
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.ldap_enabled === '1'}
                            onChange={(e) => setSettings({ ...settings, ldap_enabled: e.target.checked ? '1' : '0' })}
                          />
                          {isMobile ? (
                            // Mobile: Larger toggle with better touch target
                            <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                          ) : (
                            // Desktop: Original size
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                          )}
                          <span className={`${isMobile ? 'ml-3 text-sm' : 'ml-3 text-sm'} font-medium text-slate-900 dark:text-slate-300`}>Enable LDAP</span>
                        </label>
                      </div>
                    </div>

                    <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-2'} gap-6`}>
                      {/* Connection Settings */}
                      <div className="space-y-4">
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2`}>Connection</h4>

                        <div>
                          <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Server Host</label>
                          <input
                            type="text"
                            value={settings.ldap_server || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_server: e.target.value })}
                            className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                            placeholder="ldap.example.com"
                          />
                        </div>

                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                          <div>
                            <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Port</label>
                            <input
                              type="number"
                              value={settings.ldap_port || '389'}
                              onChange={(e) => setSettings({ ...settings, ldap_port: e.target.value })}
                              className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                              style={isMobile ? { minHeight: '44px' } : {}}
                            />
                          </div>
                          <div>
                            <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Timeout (sec)</label>
                            <input
                              type="number"
                              value={settings.ldap_timeout || '30'}
                              onChange={(e) => setSettings({ ...settings, ldap_timeout: e.target.value })}
                              className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                              style={isMobile ? { minHeight: '44px' } : {}}
                            />
                          </div>
                        </div>

                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                          <div>
                            <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Protocol</label>
                            <select
                              value={settings.ldap_protocol || 'ldap'}
                              onChange={(e) => setSettings({ ...settings, ldap_protocol: e.target.value })}
                              className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                              style={isMobile ? { minHeight: '44px' } : {}}
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
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2`}>Service Account (Bind)</h4>

                        <div>
                          <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Bind DN</label>
                          <input
                            type="text"
                            value={settings.ldap_bind_dn || ''}
                            onChange={(e) => setSettings({ ...settings, ldap_bind_dn: e.target.value })}
                            className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                            placeholder="cn=admin,dc=example,dc=com"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Leave empty for anonymous bind</p>
                        </div>

                        <div>
                          <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Bind Password</label>
                          <SecurePasswordInput
                            value={settings.ldap_bind_password || ''}
                            onChange={(e) => {
                              const password = e.target.value;
                              ldapBindPasswordRef.current = password; // Store in ref for immediate access
                              setSettings({ ...settings, ldap_bind_password: password });
                            }}
                            className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                            placeholder="********"
                            autoComplete="current-password"
                          />
                        </div>
                      </div>

                      {/* User Schema */}
                      <div className="space-y-4 md:col-span-2">
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2`}>User Schema</h4>

                        <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-2'} gap-6`}>
                          <div className="space-y-4">
                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Base DN</label>
                              <input
                                type="text"
                                value={settings.ldap_user_search_base || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_user_search_base: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                                placeholder="ou=users,dc=example,dc=com"
                              />
                            </div>

                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>User Filter</label>
                              <input
                                type="text"
                                value={settings.ldap_user_filter || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_user_filter: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} font-mono touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                                placeholder="(sAMAccountName={username})"
                              />
                              <p className="text-[10px] text-slate-500 mt-1">Use {`{username}`} as placeholder for login input</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Attributes</label>
                              <input
                                type="text"
                                value={settings.ldap_user_attributes || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_user_attributes: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} font-mono touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                                placeholder="sAMAccountName,mail,displayName"
                              />
                              <p className="text-[10px] text-slate-500 mt-1">Comma separated list of attributes to fetch</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Group Membership */}
                      <div className="space-y-4 md:col-span-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2`}>Group Membership</h4>

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
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Required Groups (comma-separated)</label>
                              <input
                                type="text"
                                value={settings.ldap_required_groups || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_required_groups: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} font-mono touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                                placeholder="CN=Admins,CN=Users,DC=example,DC=com"
                              />
                              <p className="text-[10px] text-slate-500 mt-1">User must be a member of at least one of these groups. Enter full DN or partial match.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Advanced Options */}
                      <div className="space-y-4 md:col-span-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2`}>Advanced Options</h4>

                        <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-2'} gap-6`}>
                          <div className="space-y-4">
                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Search Scope</label>
                              <select
                                value={settings.ldap_search_scope || 'sub'}
                                onChange={(e) => setSettings({ ...settings, ldap_search_scope: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                              >
                                <option value="base">Base (exact match only)</option>
                                <option value="one">One-level (immediate children)</option>
                                <option value="sub">Subtree (recursive, default)</option>
                              </select>
                              <p className="text-[10px] text-slate-500 mt-1">How deep to search in the directory tree</p>
                            </div>

                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>User DN Template (Alternative)</label>
                              <input
                                type="text"
                                value={settings.ldap_user_dn_template || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_user_dn_template: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} font-mono touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
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
                            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                              <div>
                                <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Connection Retries</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={settings.ldap_connection_retry || '3'}
                                  onChange={(e) => setSettings({ ...settings, ldap_connection_retry: e.target.value })}
                                  className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                                  style={isMobile ? { minHeight: '44px' } : {}}
                                />
                              </div>
                              <div>
                                <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Retry Delay (sec)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={settings.ldap_retry_delay || '1'}
                                  onChange={(e) => setSettings({ ...settings, ldap_retry_delay: e.target.value })}
                                  className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                                  style={isMobile ? { minHeight: '44px' } : {}}
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
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Custom Email Attribute</label>
                              <input
                                type="text"
                                value={settings.ldap_email_attribute || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_email_attribute: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} font-mono touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                                placeholder="mail"
                              />
                              <p className="text-[10px] text-slate-500 mt-1">Override default email attribute (leave empty for auto-detect)</p>
                            </div>

                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Custom Display Name Attribute</label>
                              <input
                                type="text"
                                value={settings.ldap_display_name_attribute || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_display_name_attribute: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} font-mono touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
                                placeholder="displayName"
                              />
                              <p className="text-[10px] text-slate-500 mt-1">Override default display name attribute (leave empty for auto-detect)</p>
                            </div>

                            <div>
                              <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Login Domain (UI Label)</label>
                              <input
                                type="text"
                                value={settings.ldap_login_domain || ''}
                                onChange={(e) => setSettings({ ...settings, ldap_login_domain: e.target.value })}
                                className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                                style={isMobile ? { minHeight: '44px' } : {}}
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
                    <div className={`${isMobile ? 'mt-6' : 'mt-8'} ${isMobile ? 'pt-6' : 'pt-6'} border-t border-slate-200 dark:border-slate-700`}>
                      <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white mb-4`}>Test Connection</h4>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            setLdapTestLoading(true);
                            setLdapTestResult(null);

                            // Use ref value first (most up-to-date), fallback to state
                            const bindPassword = ldapBindPasswordRef.current || settings.ldap_bind_password || '';

                            // Ensure bind password doesn't contain dots (should never happen, but safety check)
                            if (bindPassword.includes('â€¢')) {
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
                        className={`flex ${isMobile ? 'flex-col' : 'flex-col md:flex-row'} gap-4 ${isMobile ? 'items-stretch' : 'items-end'}`}
                      >
                        <div className="flex-1 w-full">
                          <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Test Username</label>
                          <input
                            type="text"
                            value={ldapTestUser}
                            onChange={(e) => setLdapTestUser(e.target.value)}
                            className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                            placeholder="Optional: Test authentication for user"
                            autoComplete="username"
                          />
                        </div>
                        <div className="flex-1 w-full">
                          <label className={`block ${isMobile ? 'text-xs' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300 mb-1`}>Test Password</label>
                          <SecurePasswordInput
                            value={ldapTestPassword}
                            onChange={(e) => setLdapTestPassword(e.target.value)}
                            className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm'} touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
                            placeholder="Optional"
                            autoComplete="current-password"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={ldapTestLoading}
                          className={`${isMobile ? 'w-full px-4 py-3 text-sm' : 'px-4 py-2 text-sm'} bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap touch-manipulation`}
                          style={isMobile ? { minHeight: '44px' } : {}}
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
                    <div className={`${isMobile ? 'mt-6' : 'mt-8'} ${isMobile ? 'pt-6' : 'pt-6'} border-t border-slate-200 dark:border-slate-700`}>
                      <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-white mb-4`}>Export & Import LDAP Settings</h4>

                      <div className={`flex ${isMobile ? 'flex-col' : 'flex-wrap'} gap-3 items-start`}>
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
                          className={`bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white ${isMobile ? 'w-full px-4 py-3 text-sm' : 'px-3 py-1.5 text-xs'} rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 touch-manipulation`}
                          style={isMobile ? { minHeight: '44px' } : {}}
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
                        <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2 ${isMobile ? 'w-full' : ''}`}>
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
                            className={`${isMobile ? 'w-full text-sm' : 'text-xs'} text-slate-600 dark:text-slate-400 file:mr-2 ${isMobile ? 'file:py-2.5 file:px-3 file:text-sm' : 'file:py-1.5 file:px-2.5 file:text-xs'} file:rounded-lg file:border-0 file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
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
                            className={`bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white ${isMobile ? 'w-full px-4 py-3 text-sm' : 'px-3 py-1.5 text-xs'} rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 touch-manipulation`}
                            style={isMobile ? { minHeight: '44px' } : {}}
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
                    <div className={`mt-6 flex ${isMobile ? 'justify-stretch' : 'justify-end'}`}>
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
                        className={`${isMobile ? 'w-full px-4 py-3 text-sm' : 'px-6 py-2.5 text-sm'} bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 touch-manipulation`}
                        style={isMobile ? { minHeight: '44px' } : {}}
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

              {/* SAML Tab */}
              {activeTab === 'saml' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">SAML 2.0 Configuration</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Configure SAML 2.0 single sign-on for enterprise authentication.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.saml_enabled === '1'}
                            onChange={async (e) => {
                              const newValue = e.target.checked ? '1' : '0';
                              setSettings({ ...settings, saml_enabled: newValue });
                              
                              // Auto-save the setting
                              try {
                                setSettingsSaving(true);
                                await settingsService.updateSettings({ saml_enabled: newValue });
                                await loadSettings();
                                await refreshSettings();
                              } catch (err: any) {
                                setError(err.message || 'Failed to save SAML setting');
                                // Revert on error
                                setSettings({ ...settings, saml_enabled: settings.saml_enabled });
                              } finally {
                                setSettingsSaving(false);
                              }
                            }}
                            disabled={settingsSaving}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600 peer-disabled:opacity-50"></div>
                          <span className="ml-3 text-sm font-medium text-slate-900 dark:text-slate-300">Enable SAML</span>
                        </label>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                      <div className="flex items-start space-x-3">
                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">SAML 2.0 Single Sign-On</h4>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                            Configure enterprise SAML 2.0 authentication to allow users to sign in using their organization's identity provider (IdP). 
                            Supports Azure AD, Okta, Auth0, and other SAML 2.0 compliant providers.
                          </p>
                          <button
                            onClick={() => setSamlConfigModalOpen(true)}
                            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Open SAML Configuration</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Status Indicators</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-600 dark:text-slate-400">SAML Enabled</span>
                            <span className={`text-xs px-2 py-1 rounded ${settings.saml_enabled === '1' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                              {settings.saml_enabled === '1' ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-600 dark:text-slate-400">Local Auth</span>
                            <span className={`text-xs px-2 py-1 rounded ${settings.local_auth_enabled === '1' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                              {settings.local_auth_enabled === '1' ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-600 dark:text-slate-400">LDAP</span>
                            <span className={`text-xs px-2 py-1 rounded ${settings.ldap_enabled === '1' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                              {settings.ldap_enabled === '1' ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <a
                            href={`${resolveApiBase().replace('/api', '')}/api/saml?action=metadata`}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-full text-left px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                          >
                            <div className="flex items-center space-x-2">
                              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>View SP Metadata XML</span>
                            </div>
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* SAML Bulk Import Section */}
                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-md font-semibold text-slate-900 dark:text-white mb-4">Bulk Import SAML Users</h4>
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                          <strong>Bulk Import SAML Users</strong>
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                          Upload a CSV file with columns: username, email, saml_nameid, displayName. The header row is optional and will be automatically skipped.
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Upload CSV File
                          </label>
                          <button
                            onClick={() => {
                              // Download CSV template
                              const csvContent = 'username,email,saml_nameid,displayName\njohn.doe,john.doe@example.com,john.doe@idp.example.com,John Doe\njane.smith,jane.smith@example.com,jane.smith@idp.example.com,Jane Smith\nadmin.user,admin.user@example.com,admin.user@idp.example.com,Admin User';
                              const blob = new Blob([csvContent], { type: 'text/csv' });
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'bulk-import-saml-users-template.csv';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              window.URL.revokeObjectURL(url);
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                            </svg>
                            Download Template
                          </button>
                        </div>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSamlImportFile(file);
                              setError('');
                            }
                          }}
                          className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                        />
                        {samlImportFile && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            Selected: {samlImportFile.name}
                          </p>
                        )}
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={handleBulkImportSaml}
                          disabled={samlImporting || !samlImportFile}
                          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {samlImporting ? 'Importing...' : 'Import SAML Users'}
                        </button>
                      </div>
                      {bulkImportResults && (
                        <div className={`mt-4 p-4 rounded-lg ${
                          bulkImportResults.summary?.errors > 0
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                            : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        }`}>
                          <p className="text-sm font-medium mb-2">
                            {bulkImportResults.message}
                          </p>
                          {bulkImportResults.summary && (
                            <div className="text-xs space-y-1">
                              <p>Created: {bulkImportResults.summary.created}</p>
                              {bulkImportResults.summary.skipped > 0 && (
                                <p>Skipped: {bulkImportResults.summary.skipped}</p>
                              )}
                              {bulkImportResults.summary.errors > 0 && (
                                <p className="text-red-600 dark:text-red-400">Errors: {bulkImportResults.summary.errors}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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
                            value={settings.footer_text || 'Â© 2025 Adventhealth - Designed and developed by AIT Architecture team'}
                            onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            placeholder="Â© 2025 Adventhealth - Designed and developed by AIT Architecture team"
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
                              <p dangerouslySetInnerHTML={{ __html: settings.footer_text || 'Â© 2025 Adventhealth - Designed and developed by AIT Architecture team' }}></p>
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

              {/* Enable/Disable Tabs Tab */}
              {activeTab === 'tabVisibility' && (
                <div className="space-y-6">
                  {settingsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Enable/Disable Tabs</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Control which app tabs are visible to users (including admins). Disabled tabs will be hidden and blocked from switching.
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                            Tip: If you disable all tabs for a user type (e.g., guests), theyâ€™ll see a friendly â€œfeature disabledâ€ message.
                          </p>
                        </div>
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, disabled_tabs: '[]' }))}
                          className="px-3 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
                          title="Enable all tabs"
                          type="button"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="mt-6 space-y-3">
                        {APP_TABS.map(tab => {
                          const isDisabled = disabledTabs.has(tab.id);
                          return (
                            <label
                              key={tab.id}
                              className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 accent-brand-600"
                                checked={!isDisabled}
                                onChange={(e) => setTabDisabled(tab.id, !e.target.checked)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {tab.label}
                                  </div>
                                  {tab.requiresAdmin && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                                      Admin
                                    </span>
                                  )}
                                  {tab.requiresAuth && !tab.requiresAdmin && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                      Login
                                    </span>
                                  )}
                                  <span className="text-[11px] text-slate-500 dark:text-slate-500 font-mono">
                                    {tab.id}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                  {tab.description}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={async () => {
                            try {
                              setSettingsSaving(true);
                              setError('');
                              await settingsService.updateSettings({ disabled_tabs: settings.disabled_tabs });
                              await loadSettings();
                              await refreshSettings();
                              alert('Tab visibility updated successfully!');
                            } catch (err: any) {
                              setError(err.message || 'Failed to update tab visibility');
                            } finally {
                              setSettingsSaving(false);
                            }
                          }}
                          disabled={settingsSaving}
                          className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                          type="button"
                        >
                          {settingsSaving ? 'Saving...' : 'Save'}
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

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Instance URL <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="url"
                          value={cloneUrl}
                          onChange={(e) => setCloneUrl(e.target.value)}
                          placeholder="e.g., https://myspaces.example.com or http://localhost/myspaces"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Full URL where the cloned instance will be accessible (include protocol and path, e.g., https://myspaces.example.com or http://localhost/myspaces)
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
                          <div className={`p-3 rounded-lg ${cloneStatus === 'complete'
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
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              try {
                                setPrechecksLoading(true);
                                setError('');
                                const apiBase = resolveApiBase();
                                const response = await fetch(`${apiBase}/clone/prechecks`, {
                                  method: 'GET',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  credentials: 'include',
                                });

                                const data = await response.json();

                                if (!response.ok) {
                                  throw new Error(data.error || 'Failed to run prechecks');
                                }

                                setPrechecksResults(data);
                                setShowPrechecks(true);
                              } catch (err: any) {
                                setError(err.message || 'Failed to run prechecks');
                              } finally {
                                setPrechecksLoading(false);
                              }
                            }}
                            disabled={prechecksLoading}
                            className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            {prechecksLoading ? 'Running Prechecks...' : 'Run Prechecks'}
                          </button>
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
                                    url: cloneUrl.trim() || undefined,
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
                                setCloneUrl('');
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
                            disabled={cloneLoading || !cloneFolderName.trim() || !cloneUrl.trim() || (currentCloneId !== null)}
                            className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            {cloneLoading ? 'Starting Clone Process...' : (currentCloneId ? 'Clone in Progress...' : 'Start Clone')}
                          </button>
                        </div>
                      </div>

                      {/* Prechecks Results */}
                      {showPrechecks && prechecksResults && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Prechecks Results</h4>
                            <button
                              onClick={() => setShowPrechecks(false)}
                              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                              </svg>
                            </button>
                          </div>

                          <div className={`p-4 rounded-lg mb-4 ${prechecksResults.allGood
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                            }`}>
                            <div className="flex items-center gap-2">
                              {prechecksResults.allGood ? (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 dark:text-green-400">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-sm font-medium text-green-700 dark:text-green-400">All checks passed! Your system is ready for clone operations.</span>
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-yellow-600 dark:text-yellow-400">
                                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Some checks failed. Please fix the issues below before running clone operations.</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="space-y-4 max-h-96 overflow-y-auto">
                            {prechecksResults.checks.map((checkCategory, categoryIdx) => (
                              <div key={categoryIdx} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{checkCategory.category}</h5>
                                <div className="space-y-2">
                                  {checkCategory.items.map((item, itemIdx) => (
                                    <div key={itemIdx} className="flex items-start gap-3 text-sm">
                                      <div className="mt-0.5">
                                        {item.status === 'pass' && (
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600 dark:text-green-400">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                        {item.status === 'fail' && (
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-600 dark:text-red-400">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                        {item.status === 'info' && (
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-600 dark:text-blue-400">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-slate-900 dark:text-white">{item.name}</span>
                                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.status === 'pass' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                            item.status === 'fail' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                              'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                            }`}>
                                            {item.message}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
                                        {item.value && item.value !== 'none' && item.value !== 'ok' && item.value !== 'yes' && item.value !== 'info' && (
                                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-mono">Value: {item.value}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${clone.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
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
                                        className={`h-2 rounded-full transition-all ${clone.status === 'completed' ? 'bg-green-600' :
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
                                            url: clone.url || '',
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

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Instance URL
                        </label>
                        <input
                          type="url"
                          value={editCloneModal.clone.url}
                          onChange={(e) => setEditCloneModal({
                            ...editCloneModal,
                            clone: { ...editCloneModal.clone!, url: e.target.value }
                          })}
                          placeholder="e.g., https://myspaces.example.com or http://localhost/myspaces"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Full URL where the cloned instance will be accessible
                        </p>
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
                                  url: editCloneModal.clone.url.trim() || undefined,
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
                  {/* Access Manager Sub-Tabs */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setAccessSubTab('roles');
                        }}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                          accessSubTab === 'roles'
                            ? 'bg-brand-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        Role-Based Access Control
                      </button>
                      <button
                        onClick={() => {
                          setAccessSubTab('assign');
                        }}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                          accessSubTab === 'assign'
                            ? 'bg-brand-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        Assign Roles to Users
                      </button>
                      <button
                        onClick={() => {
                          setAccessSubTab('admins');
                          // Load permissions when switching to Tile Admins tab
                          if (permissions.length === 0 && !permissionsLoading) {
                            loadPermissions();
                          }
                        }}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                          accessSubTab === 'admins'
                            ? 'bg-brand-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        Tile Admins
                      </button>
                    </div>
                  </div>

                  {/* Role-Based Access Control Tab */}
                  {accessSubTab === 'roles' && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Role-Based Access Control</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Create roles and assign tiles/links to roles. Users with roles will see only the content assigned to their roles.
                          </p>
                        </div>
                        <button
                          onClick={handleAddRole}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                          </svg>
                          Create Role
                        </button>
                      </div>

                      {rolesLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                        </div>
                      ) : roles.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-400">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                            </svg>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 font-medium">No roles configured</p>
                          <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">Create roles to manage access to tiles and links</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Role Name</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Users</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Tiles</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Links</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Widgets</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                              {roles.map((role) => (
                                <tr key={role.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-slate-900 dark:text-white">{role.name}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">{role.description || '-'}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300">
                                      {role.userCount || 0}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300">
                                      {role.tileCount || 0}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300">
                                      {role.linkCount || 0}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300">
                                      {role.widgetCount || 0}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end gap-2 flex-wrap">
                                      <button
                                        onClick={() => handleEditRole(role)}
                                        className="text-brand-600 dark:text-brand-400 hover:text-brand-900 dark:hover:text-brand-300 transition-colors"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleManageRoleTiles(role)}
                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors"
                                      >
                                        Tiles & Links
                                      </button>
                                      <button
                                        onClick={() => handleManageRoleTabs(role)}
                                        className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 transition-colors"
                                      >
                                        Tabs
                                      </button>
                                      <button
                                        onClick={() => handleManageRoleWidgets(role)}
                                        className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 transition-colors"
                                      >
                                        Widgets
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRole(role.id)}
                                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 transition-colors"
                                      >
                                        Delete
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
                  )}

                  {/* Assign Roles to Users Tab */}
                  {accessSubTab === 'assign' && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Assign Roles to Users</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Assign multiple roles to users. Users will see tiles and links from all their assigned roles.
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            setShowBulkAssignModal(true);
                            setBulkSelectedUserIds([]);
                            setBulkSelectedRoleIds([]);
                            setBulkAssignMode('add');
                            setBulkUserSearchTerm('');
                            setBulkRoleSearchTerm('');
                            setError('');
                            // Load user roles when modal opens
                            await loadUserRolesForBulk();
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                          </svg>
                          Bulk Assign Roles
                        </button>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        Go to the "All Users" tab to assign roles to specific users, or use "Bulk Assign Roles" to assign roles to multiple users at once. Users can have multiple roles assigned.
                      </div>
                    </div>
                  )}

                  {/* Tile Admins Tab */}
                  {accessSubTab === 'admins' && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tile Admins</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Assign users as tile administrators. Tile admins can add, edit, and delete links for their assigned tiles.
                          </p>
                        </div>
                        <button
                          onClick={handleManageTileAdmins}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                          </svg>
                          Manage Tile Admins
                        </button>
                      </div>

                      {/* Search Input */}
                      <div className="mb-4">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search tiles by name or description..."
                            value={tileAdminsTabSearchTerm}
                            onChange={(e) => setTileAdminsTabSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          />
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {tileAdminsTabSearchTerm && (
                            <button
                              onClick={() => setTileAdminsTabSearchTerm('')}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                              title="Clear search"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mb-4">
                        {permissionsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {allTiles.length === 0 ? (
                              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                                No tiles available. Create tiles first.
                              </div>
                            ) : (
                              (() => {
                                const filteredTiles = allTiles.filter(tile => {
                                  if (!tileAdminsTabSearchTerm) return true;
                                  const searchLower = tileAdminsTabSearchTerm.toLowerCase();
                                  return (
                                    (tile.title || '').toLowerCase().includes(searchLower) ||
                                    (tile.description || '').toLowerCase().includes(searchLower) ||
                                    tile.id.toLowerCase().includes(searchLower)
                                  );
                                });
                                
                                return filteredTiles.length === 0 ? (
                                  <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                                    No tiles found matching "{tileAdminsTabSearchTerm}"
                                  </div>
                                ) : (
                                  filteredTiles.map((tile) => {
                                // Get tile admins for this tile (users with canEdit=true)
                                const tileAdminPerms = permissions.filter(
                                  p => p.tileId === tile.id && p.canEdit
                                );
                                
                                return (
                                  <div
                                    key={tile.id}
                                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-2 mb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-base">{tile.emoji || '📄'}</span>
                                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                                              {tile.title || tile.id}
                                            </h4>
                                          </div>
                                          {/* Owner and Category inline with title */}
                                          {tile.userId && (() => {
                                            const owner = allUsers.find(u => u.id === tile.userId);
                                            return owner ? (
                                              <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                                                (Owner: <span className="font-medium text-slate-700 dark:text-slate-300">{owner.username}</span>)
                                              </span>
                                            ) : null;
                                          })()}
                                          {tile.group && (
                                            <span className="text-xs text-blue-600 dark:text-blue-400 font-normal">
                                              [Tab: <span className="font-medium">{tile.group}</span>]
                                            </span>
                                          )}
                                        </div>
                                        {tile.description && (
                                          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2 line-clamp-1">
                                            {tile.description}
                                          </p>
                                        )}
                                        
                                        {/* Tile Admins List */}
                                        {tileAdminPerms.length > 0 ? (
                                          <div className="mt-2 space-y-1">
                                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                              Tile Admins ({tileAdminPerms.length}):
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              {tileAdminPerms.map((perm) => {
                                                const fullPerm = permissions.find(p => p.userId === perm.userId && p.tileId === perm.tileId);
                                                return (
                                                  <div
                                                    key={`${perm.userId}_${perm.tileId}`}
                                                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-brand-50 dark:bg-brand-500/20 border border-brand-200 dark:border-brand-500/30 rounded text-xs text-brand-700 dark:text-brand-300 group"
                                                  >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                                    </svg>
                                                    <span>{perm.username || perm.email}</span>
                                                    <button
                                                      onClick={() => {
                                                        setSelectedPermissionForEdit(fullPerm || perm);
                                                        setShowGranularPermissionsModal(true);
                                                      }}
                                                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                                                      title="Configure permissions"
                                                    >
                                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                                      </svg>
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                            No tile admins assigned
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                                );
                              })()
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                              placeholder={settings.app_name || "LinkNest"}
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
                              placeholder={settings.page_title || settings.app_name || "LinkNest"}
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
                                placeholder="ðŸ”—"
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
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(settings.guest_access_enabled === '1' || settings.guest_access_enabled === undefined)
                                    ? 'bg-brand-600'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(settings.guest_access_enabled === '1' || settings.guest_access_enabled === undefined) ? 'translate-x-6' : 'translate-x-1'
                                      }`}
                                  />
                                </button>
                              </div>
                            </label>
                          </div>

                          {/* Footer Settings */}
                          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <label className="flex items-center justify-between cursor-pointer">
                              <div className="flex-1">
                                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  Show Database Path in Footer
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                  Display the database file path in the footer for verification
                                </span>
                              </div>
                              <div className="ml-4">
                                <button
                                  type="button"
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
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.show_database_path_in_footer === '1'
                                    ? 'bg-brand-600'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.show_database_path_in_footer === '1'
                                      ? 'translate-x-6'
                                      : 'translate-x-1'
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

              {/* Browser Extension Integration Tab */}
              {activeTab === 'browser' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <div className="mb-6">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">🚀 Browser Extension Integration</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Configure and test browser-specific link opening using Browser Launcher Pro extension.
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              setSettingsSaving(true);
                              setError('');
                              await settingsService.updateSettings(settings);
                              await loadSettings();
                              await refreshSettings();
                              alert('Browser extension settings saved successfully!');
                            } catch (err: any) {
                              setError(err.message || 'Failed to save browser extension settings');
                              alert(err.message || 'Failed to save browser extension settings');
                            } finally {
                              setSettingsSaving(false);
                            }
                          }}
                          disabled={settingsSaving}
                          className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
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
                              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Save Settings
                            </>
                          )}
                        </button>
                      </div>
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

                            const win = window as any;
                            if (typeof win.BrowserLauncher === 'undefined') {
                              statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
                              statusDiv.innerHTML = '<div class="text-sm text-amber-800 dark:text-amber-300"><strong>âš  Error:</strong> Browser Launcher Pro integration script not loaded. Please check the script path in index.html.</div>';
                              return;
                            }

                            statusDiv.className = 'p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700';
                            statusDiv.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-sm text-slate-600 dark:text-slate-400">Checking...</span></div>';

                            const BrowserLauncher = win.BrowserLauncher;
                            if (settings.browser_extension_id) {
                              BrowserLauncher.setExtensionId(settings.browser_extension_id);
                            }

                            BrowserLauncher.checkAvailability((available: boolean, message: string) => {
                              if (available) {
                                statusDiv.className = 'p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800';
                                statusDiv.innerHTML = `<div class="text-sm text-emerald-800 dark:text-emerald-300"><strong>✓ Extension Available:</strong> Browser Launcher Pro is ready!<br><small>Extension ID: ${BrowserLauncher.extensionId || 'Auto-detected'} | ${message}</small></div>`;
                              } else {
                                statusDiv.className = 'p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
                                statusDiv.innerHTML = `<div class="text-sm text-amber-800 dark:text-amber-300"><strong>âš  Extension Status:</strong> ${message}<br><small><strong>Tips:</strong><br>1. Make sure Browser Launcher Pro extension is installed<br>2. Go to chrome://extensions and reload the extension<br>3. Refresh this page</small></div>`;
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
                              statusDiv.innerHTML = '<div class="text-sm text-amber-800 dark:text-amber-300"><strong>âš  Error:</strong> BrowserLauncher object not found.</div>';
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
                                statusDiv.innerHTML = `<div class="text-sm text-amber-800 dark:text-amber-300"><strong>âš  Test Result:</strong> ${response ? response.error : 'No response from extension. Check console for details.'}</div>`;
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
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🔗 Quick Test Links</h4>
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
                                dangerouslySetInnerHTML={{ __html: link.label || '' }}
                              />
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
                                  alert('âœ— Error: ' + (response?.error || 'Unknown error'));
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
                                  alert('âœ— Error: ' + (response?.error || 'Unknown error'));
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
                                  alert('âœ— Error: ' + (response?.error || 'Unknown error'));
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
                          onClick={(e) => {
                            const win = window as any;
                            if (typeof win.BrowserLauncher !== 'undefined') {
                              const BrowserLauncher = win.BrowserLauncher;
                              if (settings.browser_extension_id) {
                                BrowserLauncher.setExtensionId(settings.browser_extension_id);
                              }

                              // Try to fetch dynamic browser list first
                              if (BrowserLauncher.fetchBrowsers) {
                                const btn = e.currentTarget;
                                const originalText = btn.innerText;
                                btn.innerText = 'Fetching...';
                                btn.disabled = true;

                                // Flag to track if we've already processed a response
                                let responseProcessed = false;

                                BrowserLauncher.fetchBrowsers(async (response: any) => {
                                  // Ignore subsequent responses (e.g., timeout errors)
                                  if (responseProcessed) {
                                    console.log('Ignoring duplicate/timeout response from extension:', response);
                                    return;
                                  }

                                  // Mark as processed immediately
                                  responseProcessed = true;
                                  btn.innerText = originalText;
                                  btn.disabled = false;

                                  if (response && response.success && response.browsers && response.browsers.length > 0) {
                                    setDetectedBrowsers(response.browsers);

                                    // Save browser list to database
                                    try {
                                      const apiBase = resolveApiBase();
                                      const saveResponse = await fetch(`${apiBase}/browsers`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        credentials: 'include',
                                        body: JSON.stringify({ browsers: response.browsers })
                                      });

                                      if (saveResponse.ok) {
                                        const saveData = await saveResponse.json();
                                        alert(`Browsers discovered and saved to database:\n\n${response.browsers.join('\n')}\n\nTotal: ${saveData.count} browsers saved`);
                                      } else {
                                        alert('Browsers discovered by extension:\n\n' + response.browsers.join('\n') + '\n\nNote: Failed to save to database');
                                      }
                                    } catch (err) {
                                      console.error('Failed to save browsers to database:', err);
                                      alert('Browsers discovered by extension:\n\n' + response.browsers.join('\n') + '\n\nNote: Failed to save to database');
                                    }
                                  } else {
                                    const error = response ? response.error : 'No response';
                                    alert(`No browsers detected.\n\nError: ${error}\n\nIMPORTANT: Please ensure the extension is installed and its background scripts are running. If detection fails, try re-checking extension status.`);
                                  }
                                });
                              } else {
                                const browsers = BrowserLauncher.getBrowsers();
                                setDetectedBrowsers(browsers);
                                alert('Extension loaded but fetchBrowsers API not found.\nStatic list: ' + browsers.join(', '));
                              }
                            }
                          }}
                          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Show Available Browsers
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const apiBase = resolveApiBase();
                              const response = await fetch(`${apiBase}/browsers`, {
                                credentials: 'include',
                              });
                              if (response.ok) {
                                const data = await response.json();
                                if (data.success && data.browsers && data.browsers.length > 0) {
                                  const browserList = data.browsers.map((b: any) => `â€¢ ${b.browser_name} (${b.browser_id})`).join('\n');
                                  const lastUpdated = data.metadata?.last_updated
                                    ? new Date(data.metadata.last_updated * 1000).toLocaleString()
                                    : 'Unknown';
                                  alert(`Saved Browsers in Database:\n\n${browserList}\n\nTotal: ${data.browsers.length} browsers\nLast Updated: ${lastUpdated}`);
                                } else {
                                  alert('No browsers found in database.\n\nClick "Show Available Browsers" to fetch and save the browser list.');
                                }
                              } else {
                                alert('Failed to load saved browsers from database.');
                              }
                            } catch (err) {
                              console.error('Failed to load saved browsers:', err);
                              alert('Error loading saved browsers from database.');
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          View Saved Browsers
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Are you sure you want to clear the browser cache?\n\nThis will delete all saved browsers from the database. You will need to click "Show Available Browsers" again to refresh the list.')) {
                              return;
                            }
                            try {
                              const apiBase = resolveApiBase();
                              const response = await fetch(`${apiBase}/browsers`, {
                                method: 'DELETE',
                                credentials: 'include',
                              });
                              if (response.ok) {
                                const data = await response.json();
                                setDetectedBrowsers([]);
                                alert('✓ Browser cache cleared successfully!\n\nClick "Show Available Browsers" to refresh the list.');
                              } else {
                                alert('Failed to clear browser cache.');
                              }
                            } catch (err) {
                              console.error('Failed to clear browser cache:', err);
                              alert('Error clearing browser cache.');
                            }
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Clear Browser Cache
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
                              {detectedBrowsers.length > 0 ? (
                                <>
                                  {detectedBrowsers.map(id => (
                                    <option key={id} value={id}>
                                      {id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                    </option>
                                  ))}
                                </>
                              ) : (
                                <option value="">ðŸ” Detecting browsers...</option>
                              )}
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
                                  setTestResult({ success: false, message: `âœ— Error: ${response ? response.error : 'No response from extension'}` });
                                }
                              });
                            }}
                            className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            Open Link in Browser
                          </button>
                          {testResult && (
                            <div className={`mt-3 p-3 rounded-lg text-xs font-medium ${testResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'}`}>
                              {testResult.message}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Browser IDs Reference */}
                    <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white">🔍 Discovered Browser IDs</h4>
                        {detectedBrowsers.length > 0 && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                            {detectedBrowsers.length} active
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Use these discovered browser IDs in your <code className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">data-browser</code> attributes:
                      </p>

                      {detectedBrowsers.length > 0 ? (
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 border-l-4 border-emerald-500 p-4 rounded">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {detectedBrowsers.map((id) => (
                              <div key={id} className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {id}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-900/20 border-l-4 border-slate-400 p-4 rounded text-sm text-slate-600 dark:text-slate-400 italic">
                          ðŸ” Scanning system for installed browsers...
                        </div>
                      )}
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

              {/* Broadcast Message Tab */}
              {activeTab === 'broadcast' && (
                <div className="space-y-6">
                  {broadcastLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Broadcast Message Settings</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                        Create and manage site-wide broadcast messages that appear at the top of all pages. Messages scroll from right to left with customizable speed. Users can hover to pause the message or click to read the full content in a popup.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Message Text
                          </label>
                          <textarea
                            value={broadcastMessage}
                            onChange={(e) => setBroadcastMessage(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            placeholder="Enter your broadcast message here..."
                            rows={3}
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            This message will be displayed in a scrolling banner at the top of all pages.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Font Family
                            </label>
                            <select
                              value={broadcastFontFamily}
                              onChange={(e) => setBroadcastFontFamily(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            >
                              <option value="Arial, sans-serif">Arial</option>
                              <option value="'Times New Roman', serif">Times New Roman</option>
                              <option value="'Courier New', monospace">Courier New</option>
                              <option value="Georgia, serif">Georgia</option>
                              <option value="Verdana, sans-serif">Verdana</option>
                              <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Font Size
                            </label>
                            <select
                              value={broadcastFontSize}
                              onChange={(e) => setBroadcastFontSize(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            >
                              <option value="12px">12px</option>
                              <option value="14px">14px</option>
                              <option value="16px">16px</option>
                              <option value="18px">18px</option>
                              <option value="20px">20px</option>
                              <option value="24px">24px</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Color
                          </label>
                          <div className="flex gap-4 items-center">
                            <input
                              type="color"
                              value={broadcastColor}
                              onChange={(e) => setBroadcastColor(e.target.value)}
                              className="w-16 h-10 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                            />
                            <input
                              type="text"
                              value={broadcastColor}
                              onChange={(e) => setBroadcastColor(e.target.value)}
                              className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 font-mono"
                              placeholder="#ff0000"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Scroll Speed (seconds)
                          </label>
                          <input
                            type="number"
                            min="5"
                            max="120"
                            step="1"
                            value={broadcastScrollSpeed}
                            onChange={(e) => setBroadcastScrollSpeed(Number(e.target.value))}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            placeholder="30"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Time in seconds for the message to scroll across the screen. Lower = faster, higher = slower. Recommended: 20-40 seconds.
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Expiration Date/Time (Optional)
                          </label>
                          <input
                            type="datetime-local"
                            value={broadcastExpiresAt}
                            onChange={(e) => setBroadcastExpiresAt(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Leave empty for no expiration. The message will automatically stop displaying after this date/time.
                          </p>
                        </div>

                        {currentBroadcast && (
                          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Current Active Message</h4>
                              <button
                                onClick={async () => {
                                  if (!confirm('Are you sure you want to delete the current broadcast message?')) {
                                    return;
                                  }
                                  try {
                                    setBroadcastLoading(true);
                                    setError('');
                                    await broadcastService.deleteBroadcast(currentBroadcast.id);
                                    setCurrentBroadcast(null);
                                    setBroadcastMessage('');
                                    setBroadcastFontFamily('Arial, sans-serif');
                                    setBroadcastFontSize('16px');
                                    setBroadcastColor('#ff0000');
                                    setBroadcastExpiresAt('');
                                    alert('Broadcast message deleted successfully!');
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to delete broadcast message');
                                  } finally {
                                    setBroadcastLoading(false);
                                  }
                                }}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                Delete Current Message
                              </button>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                              <p className="text-sm text-slate-700 dark:text-slate-300 mb-2" style={{ fontFamily: currentBroadcast.fontFamily, fontSize: currentBroadcast.fontSize, color: currentBroadcast.color }}>
                                {currentBroadcast.message}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Created: {new Date(currentBroadcast.createdAt * 1000).toLocaleString()}
                                {currentBroadcast.expiresAt && (
                                  <> | Expires: {new Date(currentBroadcast.expiresAt * 1000).toLocaleString()}</>
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <button
                            onClick={async () => {
                              if (!broadcastMessage.trim()) {
                                alert('Please enter a message');
                                return;
                              }
                              try {
                                setBroadcastLoading(true);
                                setError('');
                                const expiresAt = broadcastExpiresAt ? Math.floor(new Date(broadcastExpiresAt).getTime() / 1000) : null;
                                if (currentBroadcast) {
                                  await broadcastService.updateBroadcast({
                                    id: currentBroadcast.id,
                                    message: broadcastMessage,
                                    fontFamily: broadcastFontFamily,
                                    fontSize: broadcastFontSize,
                                    color: broadcastColor,
                                    scrollSpeed: broadcastScrollSpeed,
                                    expiresAt: expiresAt,
                                  });
                                  alert('Broadcast message updated successfully!');
                                } else {
                                  await broadcastService.createBroadcast({
                                    message: broadcastMessage,
                                    fontFamily: broadcastFontFamily,
                                    fontSize: broadcastFontSize,
                                    color: broadcastColor,
                                    scrollSpeed: broadcastScrollSpeed,
                                    expiresAt: expiresAt,
                                  });
                                  alert('Broadcast message created successfully!');
                                }
                                // Reload current broadcast
                                const updated = await broadcastService.getBroadcast();
                                setCurrentBroadcast(updated);
                              } catch (err: any) {
                                setError(err.message || 'Failed to save broadcast message');
                              } finally {
                                setBroadcastLoading(false);
                              }
                            }}
                            disabled={broadcastLoading || !broadcastMessage.trim()}
                            className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            {broadcastLoading ? 'Saving...' : currentBroadcast ? 'Update Message' : 'Create Message'}
                          </button>
                          {currentBroadcast && (
                            <button
                              onClick={async () => {
                                if (!confirm('Are you sure you want to delete the current broadcast message?')) {
                                  return;
                                }
                                try {
                                  setBroadcastLoading(true);
                                  setError('');
                                  await broadcastService.deleteBroadcast(currentBroadcast.id);
                                  setCurrentBroadcast(null);
                                  setBroadcastMessage('');
                                  setBroadcastFontFamily('Arial, sans-serif');
                                  setBroadcastFontSize('16px');
                                  setBroadcastColor('#ff0000');
                                  setBroadcastExpiresAt('');
                                  alert('Broadcast message deleted successfully!');
                                } catch (err: any) {
                                  setError(err.message || 'Failed to delete broadcast message');
                                } finally {
                                  setBroadcastLoading(false);
                                }
                              }}
                              disabled={broadcastLoading}
                              className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Maintenance Tab */}
              {activeTab === 'maintenance' && (
                <div className="space-y-6 mt-6">
                  {/* Database Cleanup Section */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Database Cleanup</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Check for and remove orphaned records from the database. Orphaned records occur when tiles are deleted but related data (permissions, links, sections, tabs) remain.
                        </p>
                      </div>
                    </div>

                    {cleanupResults && (
                      <div className={`mb-6 p-4 rounded-lg border ${
                        cleanupResults.success
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}>
                        {cleanupResults.success ? (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 dark:text-green-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                              </svg>
                              <h4 className="font-semibold text-green-900 dark:text-green-100">
                                {cleanupResults.total_cleaned !== undefined 
                                  ? `Cleanup Complete - ${cleanupResults.total_cleaned} record(s) removed`
                                  : cleanupResults.orphaned_found !== undefined
                                  ? cleanupResults.orphaned_found === 0
                                    ? 'Database is Clean!'
                                    : `Found ${cleanupResults.orphaned_found} orphaned record(s)`
                                  : 'Check Complete'}
                              </h4>
                            </div>
                            {cleanupResults.details && cleanupResults.details.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm text-green-800 dark:text-green-200 mb-2">Orphaned records found:</p>
                                {cleanupResults.details.map((detail, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-slate-800 rounded p-2 border border-green-200 dark:border-green-800">
                                    <div className="flex-1">
                                      <span className="font-medium text-slate-900 dark:text-white">{detail.label}</span>
                                      <span className="text-slate-600 dark:text-slate-400 ml-2 text-xs">— {detail.description}</span>
                                    </div>
                                    <span className="font-bold text-orange-600 dark:text-orange-400">{detail.count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {cleanupResults.cleaned && Object.keys(cleanupResults.cleaned).length > 0 && (
                              <div className="space-y-2 mt-3">
                                <p className="text-sm text-green-800 dark:text-green-200 mb-2">Records cleaned:</p>
                                {Object.entries(cleanupResults.cleaned).map(([type, count], idx) => (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-slate-800 rounded p-2 border border-green-200 dark:border-green-800">
                                    <span className="font-medium text-slate-900 dark:text-white capitalize">{type.replace(/_/g, ' ')}</span>
                                    <span className="font-bold text-green-600 dark:text-green-400">{count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-600 dark:text-red-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                              </svg>
                              <h4 className="font-semibold text-red-900 dark:text-red-100">Error</h4>
                            </div>
                            {cleanupResults.errors && cleanupResults.errors.length > 0 && (
                              <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-200 space-y-1">
                                {cleanupResults.errors.map((err, idx) => (
                                  <li key={idx}>{err}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={async () => {
                          try {
                            setCleanupChecking(true);
                            setError('');
                            setCleanupResults(null);
                            const response = await fetch(`${resolveApiBase()}/cleanup.php?action=check`, {
                              credentials: 'include'
                            });
                            if (!response.ok) {
                              throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            const data = await response.json();
                            setCleanupResults(data);
                          } catch (err: any) {
                            setError(err.message || 'Failed to check for orphaned records');
                            setCleanupResults({ success: false, errors: [err.message || 'Failed to check for orphaned records'] });
                          } finally {
                            setCleanupChecking(false);
                          }
                        }}
                        disabled={cleanupChecking || cleanupCleaning}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        {cleanupChecking ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Checking...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M8 7a5 5 0 113.61 4.804l-1.903 1.903A1 1 0 019 14H8v1a1 1 0 01-1 1H6v1a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a1 1 0 01.293-.707l5.964-5.964A5 5 0 018 7zm5-3a.75.75 0 000 1.5A1.5 1.5 0 0114.5 7 .75.75 0 0016 7a3 3 0 00-3-3z" clipRule="evenodd" />
                            </svg>
                            Check for Orphans
                          </>
                        )}
                      </button>

                      <button
                        onClick={async () => {
                          if (!confirm('Are you sure you want to clean up orphaned records? This action cannot be undone.')) {
                            return;
                          }
                          try {
                            setCleanupCleaning(true);
                            setError('');
                            setCleanupResults(null);
                            const response = await fetch(`${resolveApiBase()}/cleanup.php?action=cleanup`, {
                              credentials: 'include'
                            });
                            if (!response.ok) {
                              throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            const data = await response.json();
                            setCleanupResults(data);
                            if (data.success && data.total_cleaned > 0) {
                              alert(`Successfully cleaned ${data.total_cleaned} orphaned record(s)!`);
                            } else if (data.success && data.total_cleaned === 0) {
                              alert('No orphaned records found. Database is clean!');
                            }
                          } catch (err: any) {
                            setError(err.message || 'Failed to cleanup orphaned records');
                            setCleanupResults({ success: false, errors: [err.message || 'Failed to cleanup orphaned records'] });
                          } finally {
                            setCleanupCleaning(false);
                          }
                        }}
                        disabled={cleanupChecking || cleanupCleaning || (cleanupResults?.orphaned_found === 0)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        {cleanupCleaning ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Cleaning...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                            Clean Up Orphans
                          </>
                        )}
                      </button>
                      
                      {cleanupResults && (
                        <button
                          onClick={() => setCleanupResults(null)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                          Clear Results
                        </button>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">What are orphaned records?</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                        When tiles are deleted, sometimes related data can remain in the database: permissions for deleted tiles, sections and links that reference missing tiles, or duplicate permission entries. These "orphaned" records can cause display issues (like duplicate tiles in admin panels) and waste database space.
                      </p>
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-white">💡 Best Practice:</span> Run the check periodically, especially after bulk tile deletions or data imports. Cleanup operations use transactions, so if any error occurs, no changes will be made to your database.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Tiles Cleanup Section */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
                          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Duplicate Tiles Cleanup</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Find and remove duplicate tiles with the same name and category. This tool will automatically keep the tile with content and remove empty duplicates.
                        </p>
                      </div>
                    </div>

                    {dupTilesResults && (
                      <div className={`mb-6 p-4 rounded-lg border ${
                        dupTilesResults.success
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}>
                        {dupTilesResults.success ? (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 dark:text-green-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                              </svg>
                              <h4 className="font-semibold text-green-900 dark:text-green-100">
                                {dupTilesResults.deleted !== undefined 
                                  ? dupTilesResults.deleted === 0
                                    ? 'No duplicate tiles found - All tiles are unique!'
                                    : `Cleanup Complete - ${dupTilesResults.deleted} duplicate tile(s) removed`
                                  : dupTilesResults.duplicates_found !== undefined
                                  ? dupTilesResults.duplicates_found === 0
                                    ? 'No duplicate tiles found!'
                                    : `Found ${dupTilesResults.duplicates_found} duplicate tile(s)`
                                  : 'Check Complete'}
                              </h4>
                            </div>
                            
                            {dupTilesResults.duplicate_groups && dupTilesResults.duplicate_groups.length > 0 && (
                              <div className="space-y-3">
                                <p className="text-sm text-green-800 dark:text-green-200 mb-2">Duplicate tiles found:</p>
                                {dupTilesResults.duplicate_groups.map((group, idx) => (
                                  <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-base">{group.tiles[0]?.emoji || '📄'}</span>
                                        <span className="font-semibold text-slate-900 dark:text-white">{group.title}</span>
                                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                          Tab: {group.group || 'No category'}
                                        </span>
                                      </div>
                                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{group.count} copies</span>
                                    </div>
                                    <div className="space-y-1 ml-8">
                                      {group.tiles.map((tile, tidx) => (
                                        <div key={tidx} className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between py-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{tile.id.substring(0, 8)}</span>
                                            <span>Owner: <span className="font-medium text-slate-700 dark:text-slate-300">{tile.owner_username}</span></span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className={tile.link_count > 0 ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                                              {tile.link_count} link{tile.link_count !== 1 ? 's' : ''}
                                            </span>
                                            <span className={tile.link_count === 0 ? 'text-orange-600 dark:text-orange-400' : ''}>
                                              {tile.link_count === 0 ? '(empty - will be removed)' : '(will be kept)'}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {dupTilesResults.details && dupTilesResults.details.length > 0 && (
                              <div className="space-y-2 mt-3">
                                <p className="text-sm text-green-800 dark:text-green-200 mb-2">Tiles cleaned:</p>
                                {dupTilesResults.details.map((detail, idx) => (
                                  <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-semibold text-slate-900 dark:text-white">{detail.title}</span>
                                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                        Tab: {detail.group || 'No category'}
                                      </span>
                                    </div>
                                    <div className="text-xs space-y-1">
                                      <div className="text-green-700 dark:text-green-300">
                                        ✓ Kept: {detail.kept_owner}'s copy ({detail.kept_links} link{detail.kept_links !== 1 ? 's' : ''})
                                      </div>
                                      <div className="text-orange-700 dark:text-orange-300">
                                        ✗ Removed: {detail.deleted_count} empty duplicate{detail.deleted_count !== 1 ? 's' : ''}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-600 dark:text-red-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                              </svg>
                              <h4 className="font-semibold text-red-900 dark:text-red-100">Error</h4>
                            </div>
                            {dupTilesResults.errors && dupTilesResults.errors.length > 0 && (
                              <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-200 space-y-1">
                                {dupTilesResults.errors.map((err, idx) => (
                                  <li key={idx}>{err}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={async () => {
                          try {
                            setDupTilesFinding(true);
                            setError('');
                            setDupTilesResults(null);
                            const response = await fetch(`${resolveApiBase()}/cleanup_duplicate_tiles.php?action=find`, {
                              credentials: 'include'
                            });
                            if (!response.ok) {
                              throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            const data = await response.json();
                            setDupTilesResults(data);
                          } catch (err: any) {
                            setError(err.message || 'Failed to find duplicate tiles');
                            setDupTilesResults({ success: false, errors: [err.message || 'Failed to find duplicate tiles'] });
                          } finally {
                            setDupTilesFinding(false);
                          }
                        }}
                        disabled={dupTilesFinding || dupTilesCleaning || dupTilesAggressiveCleaning}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        {dupTilesFinding ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Finding...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.184-.551a1 1 0 01.632-.633l.551-.183a1 1 0 000-1.898l-.551-.184a1 1 0 01-.633-.632l-.183-.551z" />
                            </svg>
                            Find Duplicate Tiles
                          </>
                        )}
                      </button>

                      <button
                        onClick={async () => {
                          if (!confirm('This will automatically remove empty duplicate tiles and keep the ones with content. Continue?')) {
                            return;
                          }
                          try {
                            setDupTilesCleaning(true);
                            setError('');
                            setDupTilesResults(null);
                            const response = await fetch(`${resolveApiBase()}/cleanup_duplicate_tiles.php?action=smart_cleanup`, {
                              credentials: 'include'
                            });
                            if (!response.ok) {
                              throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            const data = await response.json();
                            setDupTilesResults(data);
                            if (data.success && data.deleted > 0) {
                              alert(`Successfully removed ${data.deleted} duplicate tile(s)! Kept ${data.kept} unique tile(s).`);
                              // Refresh tiles if we're on the tile admins tab
                              if (activeTab === 'access' && accessSubTab === 'admins') {
                                loadAllTilesAndLinks();
                              }
                            } else if (data.success && data.deleted === 0) {
                              alert('No duplicate tiles found. All tiles are unique!');
                            }
                          } catch (err: any) {
                            setError(err.message || 'Failed to cleanup duplicate tiles');
                            setDupTilesResults({ success: false, errors: [err.message || 'Failed to cleanup duplicate tiles'] });
                          } finally {
                            setDupTilesCleaning(false);
                          }
                        }}
                        disabled={dupTilesFinding || dupTilesCleaning || dupTilesAggressiveCleaning || (dupTilesResults?.duplicates_found === 0)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        {dupTilesCleaning ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Cleaning...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                              <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                            </svg>
                            Smart Cleanup Duplicates
                          </>
                        )}
                      </button>

                      {/* Aggressive Cleanup Button - Only show if there are skipped tiles */}
                      {dupTilesResults && (dupTilesResults.skipped && dupTilesResults.skipped.length > 0) && (
                        <button
                          onClick={async () => {
                            if (!confirm('⚠️ WARNING: This will remove ALL duplicate tiles, even if they have content!\n\nThe tile with the most links will be kept, all others will be PERMANENTLY DELETED.\n\nThis action cannot be undone. Are you absolutely sure?')) {
                              return;
                            }
                            try {
                              setDupTilesAggressiveCleaning(true);
                              setError('');
                              setDupTilesResults(null);
                              const response = await fetch(`${resolveApiBase()}/cleanup_duplicate_tiles.php?action=aggressive_cleanup`, {
                                credentials: 'include'
                              });
                              if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                              }
                              const data = await response.json();
                              setDupTilesResults(data);
                              if (data.success && data.deleted > 0) {
                                alert(`Successfully removed ${data.deleted} duplicate tile(s)! Kept ${data.kept} unique tile(s).`);
                                // Refresh tiles if we're on the tile admins tab
                                if (activeTab === 'access' && accessSubTab === 'admins') {
                                  loadAllTilesAndLinks();
                                }
                              } else if (data.success && data.deleted === 0) {
                                alert('No duplicate tiles found.');
                              }
                            } catch (err: any) {
                              setError(err.message || 'Failed to cleanup duplicate tiles');
                              setDupTilesResults({ success: false, errors: [err.message || 'Failed to cleanup duplicate tiles'] });
                            } finally {
                              setDupTilesAggressiveCleaning(false);
                            }
                          }}
                          disabled={dupTilesFinding || dupTilesCleaning || dupTilesAggressiveCleaning}
                          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          {dupTilesAggressiveCleaning ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Cleaning...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                              </svg>
                              Force Remove All Duplicates
                            </>
                          )}
                        </button>
                      )}
                      
                      {dupTilesResults && (
                        <button
                          onClick={() => setDupTilesResults(null)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                          Clear Results
                        </button>
                      )}
                    </div>

                    {/* Warning about skipped tiles */}
                    {dupTilesResults && dupTilesResults.skipped && dupTilesResults.skipped.length > 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1">
                            <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 text-sm mb-2">
                              Some duplicates were NOT removed
                            </h4>
                            <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-3">
                              Smart Cleanup only removes <strong>empty</strong> tiles. The following duplicate tiles have content and were kept to preserve your data:
                            </p>
                            <div className="space-y-2">
                              {dupTilesResults.skipped.map((group, idx) => (
                                <div key={idx} className="bg-white dark:bg-slate-800 rounded p-2 border border-yellow-200 dark:border-yellow-800">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                                    {group.title} [{group.group || 'No category'}]
                                  </div>
                                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                                    <div className="text-green-700 dark:text-green-300">
                                      ✓ Kept: {group.kept_owner}'s copy ({group.kept_links} links)
                                    </div>
                                    {group.skipped.map((skip, sidx) => (
                                      <div key={sidx} className="text-yellow-700 dark:text-yellow-300">
                                        ⚠ Skipped: {skip.owner}'s copy ({skip.links} links) - has content, not removed
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-900 dark:text-yellow-200">
                              <strong>Need to remove these?</strong> Click the <strong className="text-red-600 dark:text-red-400">"Force Remove All Duplicates"</strong> button above (warning: this will permanently delete the duplicate tiles and their content).
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">How does Smart Cleanup work?</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                        The smart cleanup automatically identifies tiles with identical names and categories. It keeps the tile with content (links) and removes empty duplicates. If multiple tiles have content, it keeps the one with the most links.
                      </p>
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-white">⚡ Safe & Smart:</span> Always check first to preview what will be removed. The cleanup only deletes empty tiles and uses transactions for safety. If you see tiles with the same name but different content, they will all be kept.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Invisible Tiles Diagnosis Section */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
                          <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                          <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Invisible Tiles Diagnosis</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Find tiles that exist in the database but are invisible to users. These "ghost" tiles show up in admin panels but don't appear in user dashboards.
                        </p>
                      </div>
                    </div>

                    {invisibleTilesResults && (
                      <div className={`mb-6 p-4 rounded-lg border ${
                        invisibleTilesResults.success
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}>
                        {invisibleTilesResults.success ? (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 dark:text-green-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                              </svg>
                              <h4 className="font-semibold text-green-900 dark:text-green-100">
                                {invisibleTilesResults.deleted !== undefined
                                  ? `Cleanup Complete - ${invisibleTilesResults.deleted} invisible tile(s) removed`
                                  : invisibleTilesResults.invisible_tiles && invisibleTilesResults.invisible_tiles.length > 0
                                  ? `Found ${invisibleTilesResults.invisible_tiles.length} invisible tile(s)`
                                  : 'No invisible tiles found - All tiles are properly configured!'}
                              </h4>
                            </div>

                            {invisibleTilesResults.total_tiles !== undefined && (
                              <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                                Scanned {invisibleTilesResults.total_tiles} total tile(s) in database.
                              </p>
                            )}

                            {invisibleTilesResults.invisible_tiles && invisibleTilesResults.invisible_tiles.length > 0 && (
                              <div className="space-y-3">
                                <p className="text-sm text-green-800 dark:text-green-200 font-semibold mb-2">Invisible tiles detected:</p>
                                {invisibleTilesResults.invisible_tiles.map((tile, idx) => (
                                  <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-base">{tile.emoji || '📄'}</span>
                                        <span className="font-semibold text-slate-900 dark:text-white">{tile.title}</span>
                                        {tile.group && (
                                          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                            {tile.group}
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{tile.id.substring(0, 8)}</span>
                                    </div>
                                    <div className="text-xs space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-600 dark:text-slate-400">Owner:</span>
                                        <span className="font-medium text-slate-900 dark:text-white">{tile.owner_username || 'Unknown'}</span>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-slate-600 dark:text-slate-400">{tile.links_count} link(s)</span>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-slate-600 dark:text-slate-400">{tile.sections_count} section(s)</span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {tile.issues.map((issue, iidx) => (
                                          <span key={iidx} className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs">
                                            ⚠ {issue}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {invisibleTilesResults.deleted_tiles && invisibleTilesResults.deleted_tiles.length > 0 && (
                              <div className="space-y-2 mt-3">
                                <p className="text-sm text-green-800 dark:text-green-200 mb-2">Tiles removed:</p>
                                {invisibleTilesResults.deleted_tiles.map((tile, idx) => (
                                  <div key={idx} className="bg-white dark:bg-slate-800 rounded p-2 border border-green-200 dark:border-green-800">
                                    <div className="text-xs">
                                      <div className="font-semibold text-slate-900 dark:text-white">{tile.title}</div>
                                      <div className="text-slate-600 dark:text-slate-400 mt-1">
                                        Owner: {tile.owner} • {tile.links} links • Reason: {tile.reason}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-600 dark:text-red-400">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                              </svg>
                              <h4 className="font-semibold text-red-900 dark:text-red-100">Error</h4>
                            </div>
                            {invisibleTilesResults.errors && invisibleTilesResults.errors.length > 0 && (
                              <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-200 space-y-1">
                                {invisibleTilesResults.errors.map((err, idx) => (
                                  <li key={idx}>{err}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={async () => {
                          try {
                            setInvisibleTilesDiagnosing(true);
                            setError('');
                            setInvisibleTilesResults(null);
                            const response = await fetch(`${resolveApiBase()}/diagnose_invisible_tiles.php?action=diagnose`, {
                              credentials: 'include'
                            });
                            if (!response.ok) {
                              throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            const data = await response.json();
                            setInvisibleTilesResults(data);
                          } catch (err: any) {
                            setError(err.message || 'Failed to diagnose invisible tiles');
                            setInvisibleTilesResults({ success: false, errors: [err.message || 'Failed to diagnose invisible tiles'] });
                          } finally {
                            setInvisibleTilesDiagnosing(false);
                          }
                        }}
                        disabled={invisibleTilesDiagnosing || invisibleTilesRemoving}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        {invisibleTilesDiagnosing ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Scanning...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M8 7a5 5 0 113.61 4.804l-1.903 1.903A1 1 0 019 14H8v1a1 1 0 01-1 1H6v1a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a1 1 0 01.293-.707l5.964-5.964A5 5 0 018 7zm5-3a.75.75 0 000 1.5A1.5 1.5 0 0114.5 7 .75.75 0 0016 7a3 3 0 00-3-3z" clipRule="evenodd" />
                            </svg>
                            Diagnose Invisible Tiles
                          </>
                        )}
                      </button>

                      {invisibleTilesResults && invisibleTilesResults.invisible_tiles && invisibleTilesResults.invisible_tiles.length > 0 && (
                        <button
                          onClick={async () => {
                            if (!confirm('⚠️ IMPORTANT: This will remove tiles that are not visible in users\' dashboards.\n\n✓ Public tiles (user_id = 0) are PROTECTED and will NOT be deleted\n✓ Tiles in public/shared categories are PROTECTED\n✓ Only user-owned tiles without arrangement will be removed\n\nContinue?')) {
                              return;
                            }
                            try {
                              setInvisibleTilesRemoving(true);
                              setError('');
                              setInvisibleTilesResults(null);
                              const response = await fetch(`${resolveApiBase()}/diagnose_invisible_tiles.php?action=remove_no_arrangement`, {
                                credentials: 'include'
                              });
                              if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                              }
                              const data = await response.json();
                              setInvisibleTilesResults(data);
                              if (data.success && data.deleted > 0) {
                                alert(`Successfully removed ${data.deleted} invisible tile(s)!`);
                                // Refresh tiles if we're on the tile admins tab
                                if (activeTab === 'access' && accessSubTab === 'admins') {
                                  loadAllTilesAndLinks();
                                }
                              } else if (data.success && data.deleted === 0) {
                                alert('No invisible tiles found to remove.');
                              }
                            } catch (err: any) {
                              setError(err.message || 'Failed to remove invisible tiles');
                              setInvisibleTilesResults({ success: false, errors: [err.message || 'Failed to remove invisible tiles'] });
                            } finally {
                              setInvisibleTilesRemoving(false);
                            }
                          }}
                          disabled={invisibleTilesDiagnosing || invisibleTilesRemoving}
                          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          {invisibleTilesRemoving ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Removing...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                              </svg>
                              Remove Invisible Tiles
                            </>
                          )}
                        </button>
                      )}

                      {invisibleTilesResults && (
                        <button
                          onClick={() => setInvisibleTilesResults(null)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                          Clear Results
                        </button>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">What are invisible tiles?</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                        Invisible tiles exist in the database but don't appear in any user's dashboard. Common issues: not in user's arrangement (UI layout), missing owner, or other configuration problems. These tiles often appear only in admin panels but cannot be accessed by regular users.
                      </p>
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-white">🔍 Perfect for:</span> Finding tiles that appear in "Tile Admins" page but can't be seen by the owner when they log in. This explains why zafar2 can't see their 6 "Company Dashboard" tiles!
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Maintenance Mode</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                      Enable maintenance mode to restrict access to the application. Only administrators will be able to log in during maintenance mode.
                    </p>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Maintenance Mode</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {(settings?.maintenance_enabled === '1' || settings?.maintenance_enabled === 'true')
                              ? 'Currently enabled - Only administrators can access the application'
                              : 'Currently disabled - All users can access the application'}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              setSettingsSaving(true);
                              setError('');
                              const currentValue = settings?.maintenance_enabled || '0';
                              const newValue = (currentValue === '1' || currentValue === 'true') ? '0' : '1';
                              const updatedSettings = { ...settings, maintenance_enabled: newValue };
                              setSettings(updatedSettings);
                              await settingsService.updateSettings({
                                maintenance_enabled: newValue,
                                maintenance_message: settings?.maintenance_message || maintenanceMessage || ''
                              });
                              await loadSettings();
                              await refreshSettings();
                              alert(`Maintenance mode ${newValue === '1' ? 'enabled' : 'disabled'} successfully!`);
                            } catch (err: any) {
                              setError(err.message || 'Failed to update maintenance mode');
                            } finally {
                              setSettingsSaving(false);
                            }
                          }}
                          disabled={settingsSaving}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(settings?.maintenance_enabled === '1' || settings?.maintenance_enabled === 'true')
                            ? 'bg-brand-600'
                            : 'bg-slate-300 dark:bg-slate-600'
                            } ${settingsSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          type="button"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(settings.maintenance_enabled === '1' || settings.maintenance_enabled === 'true') ? 'translate-x-6' : 'translate-x-1'
                              }`}
                          />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Maintenance Message
                        </label>
                        <textarea
                          value={maintenanceMessage}
                          onChange={(e) => setMaintenanceMessage(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          placeholder="Enter a message to display to users during maintenance mode..."
                          rows={6}
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          This message will be displayed on the maintenance page for non-admin users.
                        </p>
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <button
                          onClick={async () => {
                            try {
                              setSettingsSaving(true);
                              setError('');
                              const updatedSettings = { ...settings, maintenance_message: maintenanceMessage };
                              setSettings(updatedSettings);
                              await settingsService.updateSettings({
                                maintenance_enabled: settings?.maintenance_enabled || '0',
                                maintenance_message: maintenanceMessage || ''
                              });
                              await loadSettings();
                              await refreshSettings();
                              alert('Maintenance settings saved successfully!');
                            } catch (err: any) {
                              setError(err.message || 'Failed to save maintenance settings');
                            } finally {
                              setSettingsSaving(false);
                            }
                          }}
                          disabled={settingsSaving}
                          className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                        >
                          {settingsSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Widgets Tab */}
              {activeTab === 'widgets' && (
                <div className="space-y-6 mt-6">
                  {widgetSuccessMessage && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
                      {widgetSuccessMessage}
                    </div>
                  )}

                  {/* Documentation Section */}
                  <div className="bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-brand-500 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-white">
                          <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Widget Development Guide</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                          Learn how to create and integrate custom widgets into LinkNest. Follow the step-by-step guide to build your own widgets.
                        </p>
                        <div className="space-y-3">
                          <div className="bg-white dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Quick Start</h4>
                            <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                              <li>Create your widget component in <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">components/YourWidget.tsx</code></li>
                              <li>Create a floating wrapper (optional) in <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">components/FloatingYourWidget.tsx</code></li>
                              <li>Register the widget using the form below</li>
                              <li>Integrate it into <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">App.tsx</code> (see full documentation)</li>
                              <li>Assign the widget to roles via Access Manager</li>
                            </ol>
                          </div>
                          <div className="bg-white dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Widget Requirements</h4>
                            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                              <li>Accept <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">onClose</code> prop for closing</li>
                              <li>Handle Escape key to close (unless user is typing)</li>
                              <li>Support dark mode with Tailwind classes</li>
                              <li>Follow the application's design system</li>
                              <li>Be responsive for different screen sizes</li>
                            </ul>
                          </div>
                          <div className="bg-white dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Example Widget Structure</h4>
                            <pre className="text-xs bg-slate-900 dark:bg-slate-950 text-slate-100 p-3 rounded overflow-x-auto">
{`interface YourWidgetProps {
  onClose?: () => void;
}

export const YourWidget: React.FC<YourWidgetProps> = ({ onClose }) => {
  return (
    <div className="bg-white dark:bg-slate-800 
                    rounded-lg shadow-lg border 
                    border-slate-200 dark:border-slate-700 p-4">
      {/* Your widget content */}
    </div>
  );
};`}
                            </pre>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <a
                              href={`${resolveDocsBase()}/docs/CUSTOM_WIDGETS_DEVELOPMENT.md`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.5h-8.5a.75.75 0 000 1.5h8.5v8.5a.75.75 0 001.5 0v-8.5h8.5a.75.75 0 000-1.5h-8.5v-8.5z" />
                              </svg>
                              View Full Documentation
                            </a>
                            <button
                              onClick={() => {
                                // Copy documentation path to clipboard
                                navigator.clipboard.writeText('docs/CUSTOM_WIDGETS_DEVELOPMENT.md');
                                setWidgetSuccessMessage('Documentation path copied to clipboard!');
                                setTimeout(() => setWidgetSuccessMessage(''), 3000);
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M13.887 3.182c.396.037.79.08 1.183.128C16.907 3.372 18 4.513 18 5.818v8.364c0 1.305-1.093 2.446-2.93 2.508a39.979 39.979 0 01-1.183-.128c-1.936-.18-3.387-1.295-3.387-2.68V5.818c0-1.385 1.451-2.5 3.387-2.68zM9.5 4.18c-1.936.18-3.387 1.295-3.387 2.68v8.364c0 1.385 1.451 2.5 3.387 2.68.396.037.79.08 1.183.128C4.093 18.628 3 17.487 3 16.182V7.818c0-1.305 1.093-2.446 2.93-2.508a39.979 39.979 0 011.183.128z" clipRule="evenodd" />
                              </svg>
                              Copy Doc Path
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Custom Widgets</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Manage custom widgets that can be assigned to roles. After creating a widget here, integrate it into App.tsx following the documentation above.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingWidget(null);
                          setWidgetForm({
                            widgetId: '',
                            name: '',
                            description: '',
                            componentPath: '',
                            floatingComponentPath: '',
                            iconSvg: '',
                            requiresAuth: false,
                            enabled: true
                          });
                          setShowAddWidgetModal(true);
                          setError('');
                          setWidgetSuccessMessage('');
                        }}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        Add Widget
                      </button>
                    </div>

                    {customWidgetsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                      </div>
                    ) : customWidgets.length === 0 ? (
                      <div className="text-center py-12">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <p className="text-slate-500 dark:text-slate-400 mb-4">No custom widgets yet</p>
                        <button
                          onClick={() => {
                            setEditingWidget(null);
                            setWidgetForm({
                              widgetId: '',
                              name: '',
                              description: '',
                              componentPath: '',
                              floatingComponentPath: '',
                              iconSvg: '',
                              requiresAuth: false,
                              enabled: true
                            });
                            setShowAddWidgetModal(true);
                          }}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Create Your First Widget
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customWidgets.map((widget) => (
                          <div
                            key={widget.id}
                            className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {widget.name}
                                </h4>
                                <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                  Custom
                                </span>
                                {widget.enabled ? (
                                  <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                    Enabled
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                                    Disabled
                                  </span>
                                )}
                              </div>
                              {widget.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                  {widget.description}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                                <span><strong>ID:</strong> {widget.widgetId}</span>
                                <span><strong>Component:</strong> {widget.componentPath}</span>
                                {widget.floatingComponentPath && (
                                  <span><strong>Floating:</strong> {widget.floatingComponentPath}</span>
                                )}
                                {widget.requiresAuth && (
                                  <span className="text-orange-600 dark:text-orange-400">Requires Auth</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => handleEditWidget(widget)}
                                className="p-2 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                title="Edit widget"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteWidget(widget.widgetId)}
                                className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                title="Delete widget"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {/* End Content Area */}
      </div>
      {/* End Tabs and Content Container */}

      {/* Add User Modal */}
      {addUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add User</h2>
                <button
                  onClick={() => {
                    setAddUserModal(false);
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-4">
                <button
                  onClick={() => {
                    setAddUserType('local');
                    setBulkImportMode(false);
                    setError('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    addUserType === 'local'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Local User
                </button>
                <button
                  onClick={() => {
                    setAddUserType('ldap');
                    setBulkImportMode(false);
                    setError('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    addUserType === 'ldap'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  LDAP User
                </button>
                <button
                  onClick={() => {
                    setAddUserType('saml');
                    setBulkImportMode(false);
                    setError('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    addUserType === 'saml'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  SAML User
                </button>
                <button
                  onClick={() => {
                    setBulkImportMode(!bulkImportMode);
                    setError('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    bulkImportMode
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Bulk Import
                </button>
              </div>

              {bulkImportMode ? (
                addUserType === 'local' ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <strong>Bulk Import Local Users</strong>
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                        Upload a CSV file with columns: username, email, password. The header row is optional and will be automatically skipped.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Upload CSV File
                        </label>
                        <button
                          onClick={() => {
                            // Download CSV template
                            const csvContent = 'username,email,password\njohn.doe,john.doe@localhost,SecurePassword123\njane.smith,jane.smith@localhost,SecurePassword456\nadmin.user,admin.user@localhost,SecurePassword789';
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'bulk-import-local-users-template.csv';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                          </svg>
                          Download Template
                        </button>
                      </div>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setCsvFile(file);
                            setError('');
                          }
                        }}
                        className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                      />
                      {csvFile && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          Selected: {csvFile.name}
                        </p>
                      )}
                    </div>
                    {bulkImportResults && (
                      <div className={`p-4 rounded-lg ${
                        bulkImportResults.summary?.errors > 0
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                          : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      }`}>
                        <p className="text-sm font-medium mb-2">
                          {bulkImportResults.message}
                        </p>
                        {bulkImportResults.summary && (
                          <div className="text-xs space-y-1">
                            <p>Created: {bulkImportResults.summary.created}</p>
                            {bulkImportResults.summary.skipped > 0 && (
                              <p>Skipped: {bulkImportResults.summary.skipped}</p>
                            )}
                            {bulkImportResults.summary.errors > 0 && (
                              <p className="text-red-600 dark:text-red-400">Errors: {bulkImportResults.summary.errors}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : addUserType === 'ldap' ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <strong>Bulk Import LDAP Users</strong>
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                        Enter users in CSV format (one per line): username,email,dn,displayName. Or upload a CSV file.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Upload CSV File (or paste below)
                        </label>
                        <button
                          onClick={() => {
                            // Download CSV template
                            const csvContent = 'username,email,dn,displayName\njohn.doe,john.doe@example.com,"CN=John Doe,OU=Users,DC=example,DC=com",John Doe\njane.smith,jane.smith@example.com,"CN=Jane Smith,OU=Users,DC=example,DC=com",Jane Smith\nadmin.user,admin.user@example.com,"CN=Admin User,OU=Users,DC=example,DC=com",Admin User';
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'bulk-import-ldap-users-template.csv';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                          </svg>
                          Download Template
                        </button>
                      </div>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const text = await file.text();
                              setLdapUsersText(text);
                              setError('');
                            } catch (err: any) {
                              setError('Failed to read CSV file');
                            }
                          }
                        }}
                        className="w-full mb-3 text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                      />
                      <textarea
                        value={ldapUsersText}
                        onChange={(e) => setLdapUsersText(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        placeholder="username,email,dn,displayName&#10;Or paste CSV content here..."
                        rows={6}
                      />
                    </div>
                    {bulkImportResults && (
                      <div className={`p-4 rounded-lg ${
                        bulkImportResults.summary?.errors > 0
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                          : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      }`}>
                        <p className="text-sm font-medium mb-2">
                          {bulkImportResults.message}
                        </p>
                        {bulkImportResults.summary && (
                          <div className="text-xs space-y-1">
                            <p>Created: {bulkImportResults.summary.created}</p>
                            {bulkImportResults.summary.skipped > 0 && (
                              <p>Skipped: {bulkImportResults.summary.skipped}</p>
                            )}
                            {bulkImportResults.summary.errors > 0 && (
                              <p className="text-red-600 dark:text-red-400">Errors: {bulkImportResults.summary.errors}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : addUserType === 'saml' ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <strong>Bulk Import SAML Users</strong>
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                        Upload a CSV file with columns: username, email, saml_nameid, displayName. The header row is optional and will be automatically skipped.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Upload CSV File
                        </label>
                        <button
                          onClick={() => {
                            // Download CSV template
                            const csvContent = 'username,email,saml_nameid,displayName\njohn.doe,john.doe@example.com,john.doe@idp.example.com,John Doe\njane.smith,jane.smith@example.com,jane.smith@idp.example.com,Jane Smith\nadmin.user,admin.user@example.com,admin.user@idp.example.com,Admin User';
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'bulk-import-saml-users-template.csv';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                          </svg>
                          Download Template
                        </button>
                      </div>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSamlImportFile(file);
                            setError('');
                          }
                        }}
                        className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 cursor-pointer"
                      />
                      {samlImportFile && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          Selected: {samlImportFile.name}
                        </p>
                      )}
                    </div>
                    {bulkImportResults && (
                      <div className={`p-4 rounded-lg ${
                        bulkImportResults.summary?.errors > 0
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                          : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      }`}>
                        <p className="text-sm font-medium mb-2">
                          {bulkImportResults.message}
                        </p>
                        {bulkImportResults.summary && (
                          <div className="text-xs space-y-1">
                            <p>Created: {bulkImportResults.summary.created}</p>
                            {bulkImportResults.summary.skipped > 0 && (
                              <p>Skipped: {bulkImportResults.summary.skipped}</p>
                            )}
                            {bulkImportResults.summary.errors > 0 && (
                              <p className="text-red-600 dark:text-red-400">Errors: {bulkImportResults.summary.errors}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null
              ) : addUserType === 'local' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={localUsername}
                      onChange={(e) => setLocalUsername(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      placeholder="Enter username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={localEmail}
                      onChange={(e) => setLocalEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      placeholder="Enter email"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Password
                    </label>
                    <SecurePasswordInput
                      value={localPassword}
                      onChange={(e) => setLocalPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      placeholder="Enter password (min 6 characters)"
                    />
                  </div>
                </div>
              ) : addUserType === 'saml' ? (
                <div className="space-y-4">
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                    <p className="text-sm text-purple-800 dark:text-purple-300">
                      <strong>SAML User Management</strong>
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">
                      SAML users are typically created automatically when they sign in via SSO. Use the "Bulk Import" option above to manually import SAML users from a CSV file.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Search LDAP Users
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ldapSearchTerm}
                        onChange={(e) => setLdapSearchTerm(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleSearchLdapUsers();
                          }
                        }}
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        placeholder="Enter search term (min 2 characters)"
                      />
                      <button
                        onClick={handleSearchLdapUsers}
                        disabled={ldapSearchLoading || !ldapSearchTerm.trim() || ldapSearchTerm.length < 2}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {ldapSearchLoading ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                  </div>

                  {ldapSearchResults.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Select User
                      </label>
                      <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                        {ldapSearchResults.map((user, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setSelectedLdapUser(user);
                              setError('');
                            }}
                            className={`w-full text-left px-4 py-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                              selectedLdapUser?.dn === user.dn ? 'bg-brand-50 dark:bg-brand-900/20' : ''
                            }`}
                          >
                            <div className="font-medium text-slate-900 dark:text-white">{user.displayName || user.username}</div>
                            <div className="text-sm text-slate-600 dark:text-slate-400">{user.email}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">{user.username}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedLdapUser && (
                    <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
                      <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Selected User:</div>
                      <div className="text-sm text-slate-700 dark:text-slate-300">{selectedLdapUser.displayName || selectedLdapUser.username}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">{selectedLdapUser.email}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setAddUserModal(false);
                    setBulkImportMode(false);
                    setCsvFile(null);
                    setLdapUsersText('');
                    setSamlImportFile(null);
                    setBulkImportResults(null);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                {bulkImportMode ? (
                  <button
                    onClick={addUserType === 'local' ? handleBulkImportLocal : addUserType === 'ldap' ? handleBulkImportLdap : handleBulkImportSaml}
                    disabled={bulkImportLoading || samlImporting || (addUserType === 'local' ? !csvFile : addUserType === 'ldap' ? !ldapUsersText.trim() : !samlImportFile)}
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {(bulkImportLoading || samlImporting) ? 'Importing...' : 'Import Users'}
                  </button>
                ) : (
                  <button
                    onClick={addUserType === 'local' ? handleAddLocalUser : handleAddLdapUser}
                    disabled={addUserLoading || addUserType === 'saml' || (addUserType === 'local' ? (!localUsername.trim() || !localEmail.trim() || !localPassword.trim()) : !selectedLdapUser)}
                    className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {addUserLoading ? 'Adding...' : 'Add User'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Admin Password Modal */}
      {adminPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Change Admin Password</h2>
                <button
                  onClick={() => {
                    setAdminPasswordModal(false);
                    setCurrentPassword('');
                    setAdminNewPassword('');
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Current Password
                </label>
                <SecurePasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  New Password
                </label>
                <SecurePasswordInput
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter new password (min 6 characters)"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setAdminPasswordModal(false);
                    setCurrentPassword('');
                    setAdminNewPassword('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangeAdminPassword}
                  disabled={adminPasswordLoading || !currentPassword.trim() || !adminNewPassword.trim() || adminNewPassword.length < 6}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {adminPasswordLoading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit User</h2>
                <button
                  onClick={() => {
                    setEditUserModal({ open: false, userId: null, username: '', email: '', auth_source: 'local' });
                    setEditUsername('');
                    setEditEmail('');
                    setEditAuthSource('local');
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Authentication Source
                </label>
                <select
                  value={editAuthSource}
                  onChange={(e) => setEditAuthSource(e.target.value as 'local' | 'ldap' | 'saml')}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                >
                  <option value="local">Local</option>
                  <option value="ldap">LDAP</option>
                  <option value="saml">SAML</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Select the authentication method for this user
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setEditUserModal({ open: false, userId: null, username: '', email: '', auth_source: 'local' });
                    setEditUsername('');
                    setEditEmail('');
                    setEditAuthSource('local');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditUser}
                  disabled={editUserLoading || !editUsername.trim() || !editEmail.trim() || editUsername.length < 3}
                  className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {editUserLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Reset Password</h2>
                <button
                  onClick={() => {
                    setResetPasswordModal({ open: false, userId: null, username: '' });
                    setNewPassword('');
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  New Password for {resetPasswordModal.username}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter new password (min 6 characters)"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setResetPasswordModal({ open: false, userId: null, username: '' });
                    setNewPassword('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={resetPasswordLoading || !newPassword.trim() || newPassword.length < 6}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {resetPasswordLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tile Admins Modal */}
      {showTileAdminsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Manage Tile Admins
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Select tiles on the left and users on the right to assign tile admin privileges. Tile admins can add and edit links, sections, and tabs by default. Delete, visibility, browser, and clone actions are restricted.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowTileAdminsModal(false);
                    setSelectedTileIdsForAdmins(new Set());
                    setTileAdminsMap({});
                    setTileAdminTileSearchTerm('');
                    setTileAdminUserSearchTerm('');
                    setTileAdminsUsersLoaded(false);
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tiles Selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select Tiles
                    </label>
                    <button
                      onClick={() => {
                        const filteredTiles = allTiles.filter(tile => 
                          (tile.title || '').toLowerCase().includes(tileAdminTileSearchTerm.toLowerCase()) ||
                          (tile.description || '').toLowerCase().includes(tileAdminTileSearchTerm.toLowerCase())
                        );
                        const filteredTileIds = filteredTiles.map(t => t.id);
                        const allFilteredSelected = filteredTileIds.every(id => selectedTileIdsForAdmins.has(id));
                        
                        if (allFilteredSelected) {
                          const newSet = new Set(selectedTileIdsForAdmins);
                          filteredTileIds.forEach(id => newSet.delete(id));
                          setSelectedTileIdsForAdmins(newSet);
                        } else {
                          const newSet = new Set(selectedTileIdsForAdmins);
                          filteredTileIds.forEach(id => newSet.add(id));
                          setSelectedTileIdsForAdmins(newSet);
                        }
                      }}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {(() => {
                        const filteredTiles = allTiles.filter(tile => 
                          (tile.title || '').toLowerCase().includes(tileAdminTileSearchTerm.toLowerCase()) ||
                          (tile.description || '').toLowerCase().includes(tileAdminTileSearchTerm.toLowerCase())
                        );
                        const filteredTileIds = filteredTiles.map(t => t.id);
                        const allFilteredSelected = filteredTileIds.length > 0 && filteredTileIds.every(id => selectedTileIdsForAdmins.has(id));
                        return allFilteredSelected ? 'Deselect All' : 'Select All';
                      })()}
                    </button>
                  </div>
                  
                  {/* Search Input */}
                  <div className="mb-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search tiles..."
                        value={tileAdminTileSearchTerm}
                        onChange={(e) => setTileAdminTileSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      />
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {tileAdminTileSearchTerm && (
                        <button
                          onClick={() => setTileAdminTileSearchTerm('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {tileAdminsLoading ? (
                    <div className="flex items-center justify-center py-12 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                    </div>
                  ) : allTiles.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                      No tiles available
                    </div>
                  ) : (
                    <>
                      <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                          {allTiles
                            .filter(tile => {
                              if (!tileAdminTileSearchTerm) return true;
                              const search = tileAdminTileSearchTerm.toLowerCase();
                              return (tile.title || '').toLowerCase().includes(search) ||
                                     (tile.description || '').toLowerCase().includes(search);
                            })
                            .map((tile) => {
                              const admins = tileAdminsMap[tile.id] || [];
                              return (
                                <label
                                  key={tile.id}
                                  className="flex items-start gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTileIdsForAdmins.has(tile.id)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedTileIdsForAdmins);
                                      if (e.target.checked) {
                                        newSet.add(tile.id);
                                      } else {
                                        newSet.delete(tile.id);
                                      }
                                      setSelectedTileIdsForAdmins(newSet);
                                    }}
                                    className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2 mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="text-base">{tile.emoji || '📄'}</span>
                                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                                        {tile.title || tile.id}
                                      </div>
                                      {/* Owner and Tab inline with title */}
                                      {tile.userId && (() => {
                                        const owner = allUsers.find(u => u.id === tile.userId);
                                        return owner ? (
                                          <span className="text-xs text-slate-500 dark:text-slate-400">
                                            (Owner: <span className="font-medium text-slate-600 dark:text-slate-300">{owner.username}</span>)
                                          </span>
                                        ) : null;
                                      })()}
                                      {tile.group && (
                                        <span className="text-xs text-blue-600 dark:text-blue-400">
                                          [Tab: <span className="font-medium">{tile.group}</span>]
                                        </span>
                                      )}
                                    </div>
                                    {tile.description && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-1">
                                        {tile.description}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300">
                                        {admins.length} admin{admins.length !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {selectedTileIdsForAdmins.size} tile{selectedTileIdsForAdmins.size !== 1 ? 's' : ''} selected
                      </div>
                    </>
                  )}
                </div>

                {/* Users Selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select Users
                    </label>
                    <button
                      onClick={() => {
                        const filteredUsers = allUsers.filter(user => 
                          user.is_approved &&
                          (user.username.toLowerCase().includes(tileAdminUserSearchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(tileAdminUserSearchTerm.toLowerCase()))
                        );
                        const filteredUserIds: number[] = filteredUsers.map(u => u.id);
                        const selectedTileIds: string[] = Array.from(selectedTileIdsForAdmins);
                        
                        if (selectedTileIds.length === 0) return;
                        
                        // Check if all filtered users are already admins for all selected tiles
                        const allFilteredSelected = filteredUserIds.every(userId => {
                          return selectedTileIds.every(tileId => {
                            const admins = tileAdminsMap[tileId] || [];
                            return admins.some(admin => admin.userId === userId);
                          });
                        });
                        
                        // Toggle all filtered users for all selected tiles
                        filteredUserIds.forEach(async userId => {
                          for (const tileId of selectedTileIds) {
                            const admins = tileAdminsMap[tileId] || [];
                            const isAdmin = admins.some(admin => admin.userId === userId);
                            
                            if (!allFilteredSelected && !isAdmin) {
                              // Add admin
                              await handleAddTileAdmin(userId, tileId);
                            } else if (allFilteredSelected && isAdmin) {
                              // Remove admin
                              await handleRemoveTileAdmin(userId, tileId);
                            }
                          }
                        });
                      }}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {(() => {
                        const filteredUsers = allUsers.filter(user => 
                          user.is_approved &&
                          (user.username.toLowerCase().includes(tileAdminUserSearchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(tileAdminUserSearchTerm.toLowerCase()))
                        );
                        return filteredUsers.length > 0 ? 'Select All' : '';
                      })()}
                    </button>
                  </div>
                  
                  {/* Search Input */}
                  <div className="mb-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={tileAdminUserSearchTerm}
                        onChange={(e) => setTileAdminUserSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      />
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {tileAdminUserSearchTerm && (
                        <button
                          onClick={() => setTileAdminUserSearchTerm('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {selectedTileIdsForAdmins.size === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                      Select tiles on the left to manage their admins
                    </div>
                  ) : !tileAdminsUsersLoaded || allUsers.length === 0 ? (
                    <div className="flex items-center justify-center py-12 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                    </div>
                  ) : (() => {
                    const approvedUsers = allUsers.filter(user => user.is_approved);
                    const filteredUsers = approvedUsers.filter(user => {
                      if (!tileAdminUserSearchTerm) return true;
                      const search = tileAdminUserSearchTerm.toLowerCase();
                      return user.username.toLowerCase().includes(search) ||
                             user.email.toLowerCase().includes(search);
                    });
                    
                    if (approvedUsers.length === 0) {
                      return (
                        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                          No approved users available
                        </div>
                      );
                    }
                    
                    if (filteredUsers.length === 0) {
                      return (
                        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                          No users match your search
                        </div>
                      );
                    }
                    
                    return (
                      <>
                        <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                          <div className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredUsers.map((user) => {
                              const selectedTileIds: string[] = Array.from(selectedTileIdsForAdmins);
                              
                              return (
                                <div
                                  key={user.id}
                                  className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                  <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-600 dark:text-slate-400">
                                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                        {user.username}
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {user.email}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Checkboxes for each selected tile */}
                                  {selectedTileIds.length > 0 && (
                                    <div className="ml-11 space-y-1">
                                      {selectedTileIds.map((tileId: string) => {
                                        const tile = allTiles.find(t => t.id === tileId);
                                        const isAdmin = tileAdminsMap[tileId]?.some(admin => admin.userId === user.id) || false;
                                        
                                        return (
                                          <label
                                            key={tileId}
                                            className="flex items-center gap-2 cursor-pointer py-0.5"
                                          >
                                            <input
                                              type="checkbox"
                                              data-tile-admin-user={user.id}
                                              data-tile-admin-tile={tileId}
                                              checked={isAdmin}
                                              onChange={async (e) => {
                                                if (e.target.checked) {
                                                  await handleAddTileAdmin(user.id, tileId);
                                                } else {
                                                  await handleRemoveTileAdmin(user.id, tileId);
                                                }
                                              }}
                                              className="w-3.5 h-3.5 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-1"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-xs text-slate-700 dark:text-slate-300">
                                                  {tile?.emoji || '📄'} {tile?.title || tileId}
                                                </span>
                                              </div>
                                              <div className="flex flex-wrap gap-1 mt-0.5">
                                                {tile?.userId && (() => {
                                                  const owner = allUsers.find(u => u.id === tile.userId);
                                                  return owner ? (
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                                      Owner: <span className="font-medium text-slate-600 dark:text-slate-300">{owner.username}</span>
                                                    </span>
                                                  ) : null;
                                                })()}
                                                {tile?.userId && tile?.group && (
                                                  <span className="text-[10px] text-slate-400">•</span>
                                                )}
                                                {tile?.group && (
                                                  <span className="text-[10px] text-blue-600 dark:text-blue-400">
                                                    Tab: <span className="font-medium">{tile.group}</span>
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          {approvedUsers.length} approved user{approvedUsers.length !== 1 ? 's' : ''} available
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setShowTileAdminsModal(false);
                    setSelectedTileIdsForAdmins(new Set());
                    setTileAdminsMap({});
                    setTileAdminTileSearchTerm('');
                    setTileAdminUserSearchTerm('');
                    setTileAdminsUsersLoaded(false);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {selectedRole ? 'Edit Role' : 'Create Role'}
                </h2>
                <button
                  onClick={() => {
                    setShowRoleModal(false);
                    setRoleForm({ name: '', description: '' });
                    setSelectedRole(null);
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter role name (e.g., Managers, Developers)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  placeholder="Enter role description (optional)"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setShowRoleModal(false);
                    setRoleForm({ name: '', description: '' });
                    setSelectedRole(null);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRole}
                  disabled={!roleForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {selectedRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Tiles Modal */}
      {showRoleTilesModal && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Assign Tiles & Links to Role: {selectedRole.name}
                </h2>
                <button
                  onClick={() => {
                    setShowRoleTilesModal(false);
                    setSelectedTileIds(new Set());
                    setSelectedLinkIds(new Set());
                    setTileSearchTerm('');
                    setExpandedTiles(new Set());
                    setExpandedLinks(new Set());
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {roleTilesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : allTiles.length === 0 ? (
                <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                  No tiles available
                </div>
              ) : (
                <>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select tiles and links that users with this role can access. If you select a tile, you must select at least one link from that tile. When you select a link, its parent tile is automatically selected. Users will see only the specific links assigned to their roles.
              </p>
                  
                  {/* Search Input */}
                  <div className="relative">
                    <input
                      type="text"
                      value={tileSearchTerm}
                      onChange={(e) => setTileSearchTerm(e.target.value)}
                      placeholder="Search tiles, tabs, sections, or links..."
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {tileSearchTerm && (
                      <button
                        onClick={() => setTileSearchTerm('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  {/* Tree Structure */}
                  <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                    {allTiles
                      .filter(tile => {
                        if (!tileSearchTerm) return true;
                        const searchLower = tileSearchTerm.toLowerCase();
                        const matchesTile = (tile.title || '').toLowerCase().includes(searchLower) ||
                                          (tile.description || '').toLowerCase().includes(searchLower);
                        const matchesTab = tile.tabs?.some(tab => 
                          (tab.title || '').toLowerCase().includes(searchLower)
                        );
                        const matchesSection = tile.tabs?.some(tab =>
                          tab.sections?.some(section =>
                            (section.title || '').toLowerCase().includes(searchLower) ||
                            section.links?.some(link =>
                              (link.label || '').toLowerCase().includes(searchLower) ||
                              (link.url || '').toLowerCase().includes(searchLower)
                            )
                          )
                        );
                        return matchesTile || matchesTab || matchesSection;
                      })
                      .map((tile) => {
                        const isExpanded = expandedTiles.has(tile.id);
                        const isSelected = selectedTileIds.has(tile.id);
                        const hasChildren = tile.tabs && tile.tabs.length > 0;
                        
                        return (
                          <div key={tile.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                            {/* Tile Level */}
                            <div className="flex items-center gap-2 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50">
                              {hasChildren && (
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedTiles);
                                    if (isExpanded) {
                                      newExpanded.delete(tile.id);
                                    } else {
                                      newExpanded.add(tile.id);
                                    }
                                    setExpandedTiles(newExpanded);
                                  }}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              )}
                              {!hasChildren && <div className="w-5" />}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSet = new Set(selectedTileIds);
                                  if (e.target.checked) {
                                    newSet.add(tile.id);
                                  } else {
                                    newSet.delete(tile.id);
                                  }
                                  setSelectedTileIds(newSet);
                                }}
                                className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {tile.title || tile.id}
                                </div>
                                {tile.description && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                    {tile.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Tabs Level */}
                            {isExpanded && tile.tabs && tile.tabs.map((tab) => {
                              const tabKey = `${tile.id}_${tab.id}`;
                              const isTabExpanded = expandedLinks.has(tabKey);
                              const hasSections = tab.sections && tab.sections.length > 0;
                              
                              return (
                                <div key={tab.id} className="bg-slate-100 dark:bg-slate-800/30 border-l-2 border-slate-300 dark:border-slate-600 ml-5">
                                  <div className="flex items-center gap-2 p-2 pl-3 hover:bg-slate-200 dark:hover:bg-slate-700/50">
                                    {hasSections && (
                                      <button
                                        onClick={() => {
                                          const newExpanded = new Set(expandedLinks);
                                          if (isTabExpanded) {
                                            newExpanded.delete(tabKey);
                                          } else {
                                            newExpanded.add(tabKey);
                                          }
                                          setExpandedLinks(newExpanded);
                                        }}
                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isTabExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    )}
                                    {!hasSections && <div className="w-5" />}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                        📑 {tab.title || 'Untitled Tab'}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Tab-level links (if any) */}
                                  {isTabExpanded && tab.links && tab.links.length > 0 && (() => {
                                    const filteredTabLinks = tab.links.filter((link: any) => {
                                      if (!tileSearchTerm) return true;
                                      const searchLower = tileSearchTerm.toLowerCase();
                                      return (link.label || '').toLowerCase().includes(searchLower) ||
                                             (link.url || '').toLowerCase().includes(searchLower);
                                    });
                                    const allTabLinksSelected = filteredTabLinks.length > 0 && filteredTabLinks.every((link: any) => selectedLinkIds.has(link.id));
                                    
                                    return (
                                    <div className="bg-slate-200 dark:bg-slate-700/30 border-l-2 border-slate-400 dark:border-slate-500 ml-5">
                                      <div className="p-2 pl-3">
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                            📋 Tab Links
                                          </div>
                                          {filteredTabLinks.length > 0 && (
                                            <button
                                              onClick={() => handleSelectAllTabLevelLinks(tile.id, filteredTabLinks)}
                                              className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                            >
                                              {allTabLinksSelected ? 'Deselect All' : 'Select All'}
                                            </button>
                                          )}
                                        </div>
                                        <div className="ml-4 space-y-1">
                                          {filteredTabLinks.map((link: any) => (
                                              <label
                                                key={link.id}
                                                className="flex items-center gap-2 p-1.5 hover:bg-slate-300 dark:hover:bg-slate-600/50 rounded cursor-pointer"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={selectedLinkIds.has(link.id)}
                                                  onChange={(e) => {
                                                    const newLinkSet = new Set(selectedLinkIds);
                                                    if (e.target.checked) {
                                                      newLinkSet.add(link.id);
                                                      const newTileSet = new Set(selectedTileIds);
                                                      newTileSet.add(tile.id);
                                                      setSelectedTileIds(newTileSet);
                                                    } else {
                                                      newLinkSet.delete(link.id);
                                                    }
                                                    setSelectedLinkIds(newLinkSet);
                                                  }}
                                                  className="w-3.5 h-3.5 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-1"
                                                />
                                                <div className="flex-1 min-w-0">
                                                  <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                                                    🔗 {link.label || 'Unnamed Link'}
                                                  </div>
                                                  <div className="text-xs text-slate-500 dark:text-slate-500 truncate">
                                                    {link.url}
                                                  </div>
                                                </div>
                                              </label>
                                            ))}
                                        </div>
                                      </div>
                                    </div>
                                    );
                                  })()}

                                  {/* Sections Level */}
                                  {isTabExpanded && tab.sections && tab.sections.map((section) => {
                                    const filteredLinks = section.links?.filter(link => {
                                      if (!tileSearchTerm) return true;
                                      const searchLower = tileSearchTerm.toLowerCase();
                                      return (link.label || '').toLowerCase().includes(searchLower) ||
                                             (link.url || '').toLowerCase().includes(searchLower);
                                    }) || [];
                                    const allSectionLinksSelected = filteredLinks.length > 0 && filteredLinks.every(link => selectedLinkIds.has(link.id));
                                    
                                    return (
                                      <div key={section.id} className="bg-slate-200 dark:bg-slate-700/30 border-l-2 border-slate-400 dark:border-slate-500 ml-5">
                                        <div className="p-2 pl-3">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                              📋 {section.title || 'Untitled Section'}
                                            </div>
                                            {filteredLinks.length > 0 && (
                                              <button
                                                onClick={() => handleSelectAllLinksInSection(tile.id, section.id, filteredLinks)}
                                                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                              >
                                                {allSectionLinksSelected ? 'Deselect All' : 'Select All'}
                                              </button>
                                            )}
                                          </div>
                                          
                                          {/* Links Level */}
                                          {section.links && section.links.length > 0 && (
                                            <div className="ml-4 space-y-1">
                                              {filteredLinks.map((link) => (
                                                <label
                                                  key={link.id}
                                                  className="flex items-center gap-2 p-1.5 hover:bg-slate-300 dark:hover:bg-slate-600/50 rounded cursor-pointer"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={selectedLinkIds.has(link.id)}
                                                    onChange={(e) => {
                                                      const newLinkSet = new Set(selectedLinkIds);
                                                      if (e.target.checked) {
                                                        newLinkSet.add(link.id);
                                                        // Automatically select the parent tile when a link is selected
                                                        const newTileSet = new Set(selectedTileIds);
                                                        newTileSet.add(tile.id);
                                                        setSelectedTileIds(newTileSet);
                                                      } else {
                                                        newLinkSet.delete(link.id);
                                                      }
                                                      setSelectedLinkIds(newLinkSet);
                                                    }}
                                                    className="w-3.5 h-3.5 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-1"
                                                  />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                                                      🔗 {link.label || 'Unnamed Link'}
                                                    </div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-500 truncate">
                                                      {link.url}
                                                    </div>
                                                  </div>
                                                </label>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                  </div>

                  <div className="text-sm text-slate-600 dark:text-slate-400 flex justify-between items-center gap-4">
                    <span>
                      {selectedTileIds.size} tile{selectedTileIds.size !== 1 ? 's' : ''} selected
                      {selectedLinkIds.size > 0 && `, ${selectedLinkIds.size} link${selectedLinkIds.size !== 1 ? 's' : ''} selected`}
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedTileIds.size === allTiles.length && allTiles.length > 0 ? (
                        <button
                          onClick={handleDeselectAllTiles}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
                        >
                          Deselect All Tiles
                        </button>
                      ) : (
                        <button
                          onClick={handleSelectAllTiles}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                        >
                          Select All Tiles
                        </button>
                      )}
                      <span className="text-slate-400">|</span>
                      <button
                        onClick={() => {
                          const allExpanded = new Set<string>();
                          allTiles.forEach(tile => {
                            allExpanded.add(tile.id);
                            tile.tabs?.forEach(tab => {
                              allExpanded.add(`${tile.id}_${tab.id}`);
                            });
                          });
                          setExpandedTiles(allExpanded);
                          setExpandedLinks(allExpanded);
                        }}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Expand All
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setShowRoleTilesModal(false);
                    setSelectedTileIds(new Set());
                    setSelectedLinkIds(new Set());
                    setTileSearchTerm('');
                    setExpandedTiles(new Set());
                    setExpandedLinks(new Set());
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignTilesToRole}
                  disabled={(selectedTileIds.size === 0 && selectedLinkIds.size === 0) || roleTilesLoading}
                  className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Assign {selectedTileIds.size > 0 ? `${selectedTileIds.size} Tile${selectedTileIds.size !== 1 ? 's' : ''}` : ''}
                  {selectedTileIds.size > 0 && selectedLinkIds.size > 0 ? ' & ' : ''}
                  {selectedLinkIds.size > 0 ? `${selectedLinkIds.size} Link${selectedLinkIds.size !== 1 ? 's' : ''}` : ''}
                  {selectedTileIds.size === 0 && selectedLinkIds.size === 0 ? 'Assign' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Links Modal - REMOVED - Now combined with Tiles Modal */}

      {/* Role Widgets Modal */}
      {showRoleWidgetsModal && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Assign Widgets to Role: {selectedRole.name}
                </h2>
                <button
                  onClick={() => {
                    setShowRoleWidgetsModal(false);
                    setSelectedWidgetIds(new Set());
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {roleWidgetsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Select widgets that users with this role can access. Users will only see widgets that are assigned to their roles.
                  </p>
                  
                  <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30 p-4">
                    {widgetsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
                      </div>
                    ) : availableWidgets.length === 0 ? (
                      <div className="text-center text-slate-500 dark:text-slate-400 py-4 text-sm">
                        No widgets available
                      </div>
                    ) : (
                      availableWidgets.map((widget) => (
                      <label
                        key={widget.id}
                        className="flex items-start gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedWidgetIds.has(widget.id)}
                          onChange={(e) => {
                            const newWidgetSet = new Set(selectedWidgetIds);
                            if (e.target.checked) {
                              newWidgetSet.add(widget.id);
                            } else {
                              newWidgetSet.delete(widget.id);
                            }
                            setSelectedWidgetIds(newWidgetSet);
                          }}
                          className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-slate-300 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">
                              {widget.label}
                            </div>
                            {widget.isCustom && (
                              <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                Custom
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {widget.description}
                          </div>
                        </div>
                      </label>
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {selectedWidgetIds.size} widget{selectedWidgetIds.size !== 1 ? 's' : ''} selected
                    </div>
                    <button
                      onClick={() => {
                        const allWidgetIds = availableWidgets.map(w => w.id);
                        if (selectedWidgetIds.size === allWidgetIds.length) {
                          setSelectedWidgetIds(new Set());
                        } else {
                          setSelectedWidgetIds(new Set(allWidgetIds));
                        }
                      }}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {selectedWidgetIds.size === availableWidgets.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowRoleWidgetsModal(false);
                  setSelectedWidgetIds(new Set());
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignWidgetsToRole}
                disabled={roleWidgetsLoading}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Assign {selectedWidgetIds.size > 0 ? `${selectedWidgetIds.size} ` : ''}Widget{selectedWidgetIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Tabs Modal */}
      {showRoleTabsModal && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Assign Tabs to Role: {selectedRole.name}
                </h2>
                <button
                  onClick={() => {
                    setShowRoleTabsModal(false);
                    setSelectedTabIds(new Set());
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {roleTabsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Select tabs that users with this role can access. Users will only see tabs that are both globally enabled and allowed by their roles.
                  </p>
                  
                  <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30 p-4">
                    {[
                      { id: 'public', label: 'Public', description: 'Public spaces visible to everyone' },
                      { id: 'your-apps', label: 'Your Apps', description: 'Tiles and links assigned via roles' },
                      { id: 'favorites', label: 'Favorites', description: 'User favorite spaces and links' },
                      { id: 'private', label: 'Private', description: 'Private spaces (requires login)' },
                      { id: 'scheduled', label: 'Scheduled', description: 'Spaces scheduled for future' },
                      { id: 'expired', label: 'Expired', description: 'Expired spaces' },
                      { id: 'archive', label: 'Archive', description: 'Archived spaces' },
                      { id: 'recycle-bin', label: 'Recycle Bin', description: 'Deleted spaces' },
                      { id: 'monitoring', label: 'Monitoring', description: 'Monitoring dashboard (admin only)' }
                    ].map((tab) => (
                      <label
                        key={tab.id}
                        className="flex items-start gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTabIds.has(tab.id)}
                          onChange={(e) => {
                            const newTabSet = new Set(selectedTabIds);
                            if (e.target.checked) {
                              newTabSet.add(tab.id);
                            } else {
                              newTabSet.delete(tab.id);
                            }
                            setSelectedTabIds(newTabSet);
                          }}
                          className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {tab.label}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {tab.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedTabIds.size} tab{selectedTabIds.size !== 1 ? 's' : ''} selected
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setShowRoleTabsModal(false);
                    setSelectedTabIds(new Set());
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignTabsToRole}
                  disabled={selectedTabIds.size === 0 || roleTabsLoading}
                  className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Assign {selectedTabIds.size > 0 ? `${selectedTabIds.size} ` : ''}Tab{selectedTabIds.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Roles Modal */}
      {showUserRolesModal && selectedUserForRoles && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Assign Roles to User
                </h2>
                <button
                  onClick={() => {
                    setShowUserRolesModal(false);
                    setSelectedUserForRoles(null);
                    setUserSelectedRoleIds([]);
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {(() => {
                const user = allUsers.find(u => u.id === selectedUserForRoles);
                return user ? (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">User:</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-white">{user.username}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{user.email}</div>
                  </div>
                ) : null;
              })()}

              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select roles to assign to this user. Users can have multiple roles and will see content from all assigned roles.
              </p>

              {userRolesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : rolesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : roles.length === 0 ? (
                <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                  No roles available. Create roles first in the Access Manager tab.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-3 p-4 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={userSelectedRoleIds.includes(role.id)}
                          onChange={(e) => {
                            const newRoles = [...userSelectedRoleIds];
                            if (e.target.checked) {
                              newRoles.push(role.id);
                            } else {
                              const index = newRoles.indexOf(role.id);
                              if (index > -1) {
                                newRoles.splice(index, 1);
                              }
                            }
                            setUserSelectedRoleIds(newRoles);
                          }}
                          className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {role.name}
                          </div>
                          {role.description && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {role.description}
                            </div>
                          )}
                          <div className="flex gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>{role.userCount || 0} users</span>
                            <span>•</span>
                            <span>{role.tileCount || 0} tiles</span>
                            <span>•</span>
                            <span>{role.linkCount || 0} links</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-sm text-slate-600 dark:text-slate-400">
                {userSelectedRoleIds.length} role{userSelectedRoleIds.length !== 1 ? 's' : ''} selected
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setShowUserRolesModal(false);
                    setSelectedUserForRoles(null);
                    setUserSelectedRoleIds([]);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignRolesToUser}
                  disabled={userRolesLoading || rolesLoading}
                  className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Assign {userSelectedRoleIds.length > 0 ? `${userSelectedRoleIds.length} ` : ''}Roles
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Roles Modal */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Bulk Manage User Roles
                </h2>
                <button
                  onClick={() => {
                    setShowBulkAssignModal(false);
                    setBulkSelectedUserIds([]);
                    setBulkSelectedRoleIds([]);
                    setBulkAssignMode('add');
                    setBulkUserSearchTerm('');
                    setBulkRoleSearchTerm('');
                    setUserRolesMap({});
                    setError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Assignment Mode */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Operation Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBulkAssignMode('add')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      bulkAssignMode === 'add'
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Add Roles
                  </button>
                  <button
                    onClick={() => setBulkAssignMode('replace')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      bulkAssignMode === 'replace'
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Replace All
                  </button>
                  <button
                    onClick={() => setBulkAssignMode('remove')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      bulkAssignMode === 'remove'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Remove Roles
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {bulkAssignMode === 'add' 
                    ? 'Selected roles will be added to existing user roles'
                    : bulkAssignMode === 'replace'
                    ? 'Selected roles will replace all existing user roles'
                    : 'Selected roles will be removed from the selected users'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Users Selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select Users
                    </label>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={loadUserRolesForBulk}
                        className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        title="Refresh user roles"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          const filteredUsers = allUsers.filter(user => 
                            user.username.toLowerCase().includes(bulkUserSearchTerm.toLowerCase()) ||
                            user.email.toLowerCase().includes(bulkUserSearchTerm.toLowerCase())
                          );
                          const filteredUserIds = filteredUsers.map(u => u.id);
                          const allFilteredSelected = filteredUserIds.every(id => bulkSelectedUserIds.includes(id));
                          
                          if (allFilteredSelected) {
                            // Deselect all filtered users
                            setBulkSelectedUserIds(bulkSelectedUserIds.filter(id => !filteredUserIds.includes(id)));
                          } else {
                            // Select all filtered users
                            const newSelected = [...bulkSelectedUserIds];
                            filteredUserIds.forEach(id => {
                              if (!newSelected.includes(id)) {
                                newSelected.push(id);
                              }
                            });
                            setBulkSelectedUserIds(newSelected);
                          }
                        }}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {(() => {
                          const filteredUsers = allUsers.filter(user => 
                            user.username.toLowerCase().includes(bulkUserSearchTerm.toLowerCase()) ||
                            user.email.toLowerCase().includes(bulkUserSearchTerm.toLowerCase())
                          );
                          const filteredUserIds = filteredUsers.map(u => u.id);
                          const allFilteredSelected = filteredUserIds.length > 0 && filteredUserIds.every(id => bulkSelectedUserIds.includes(id));
                          return allFilteredSelected ? 'Deselect All' : 'Select All';
                        })()}
                      </button>
                    </div>
                  </div>
                  {/* Search Input */}
                  <div className="mb-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={bulkUserSearchTerm}
                        onChange={(e) => setBulkUserSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      />
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {bulkUserSearchTerm && (
                        <button
                          onClick={() => setBulkUserSearchTerm('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(() => {
                        const filteredUsers = allUsers.filter(user => 
                          user.username.toLowerCase().includes(bulkUserSearchTerm.toLowerCase()) ||
                          user.email.toLowerCase().includes(bulkUserSearchTerm.toLowerCase())
                        );
                        
                        if (filteredUsers.length === 0) {
                          return (
                            <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                              {allUsers.length === 0 ? 'No users available' : 'No users match your search'}
                            </div>
                          );
                        }
                        
                        return filteredUsers.map((user) => {
                          const userRoles = userRolesMap[user.id] || [];
                          const isLoading = loadingUserRoles.has(user.id);
                          
                          return (
                            <label
                              key={user.id}
                              className="flex items-start gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={bulkSelectedUserIds.includes(user.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBulkSelectedUserIds([...bulkSelectedUserIds, user.id]);
                                  } else {
                                    setBulkSelectedUserIds(bulkSelectedUserIds.filter(id => id !== user.id));
                                  }
                                }}
                                className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2 mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {user.username}
                                  </div>
                                  {isLoading && (
                                    <svg className="animate-spin h-3 w-3 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1">
                                  {user.email}
                                </div>
                                {userRoles.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {userRoles.map((role) => (
                                      <span
                                        key={role.id}
                                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                        title={role.description || role.name}
                                      >
                                        {role.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {!isLoading && userRoles.length === 0 && (
                                  <div className="text-xs text-slate-400 dark:text-slate-500 italic mt-1">
                                    No roles assigned
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {bulkSelectedUserIds.length} user{bulkSelectedUserIds.length !== 1 ? 's' : ''} selected
                  </div>
                </div>

                {/* Roles Selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select Roles
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const filteredRoles = roles.filter(role => 
                            role.name.toLowerCase().includes(bulkRoleSearchTerm.toLowerCase()) ||
                            (role.description && role.description.toLowerCase().includes(bulkRoleSearchTerm.toLowerCase()))
                          );
                          const filteredRoleIds = filteredRoles.map(r => r.id);
                          const allFilteredSelected = filteredRoleIds.every(id => bulkSelectedRoleIds.includes(id));
                          
                          if (allFilteredSelected) {
                            // Deselect all filtered roles
                            setBulkSelectedRoleIds(bulkSelectedRoleIds.filter(id => !filteredRoleIds.includes(id)));
                          } else {
                            // Select all filtered roles
                            const newSelected = [...bulkSelectedRoleIds];
                            filteredRoleIds.forEach(id => {
                              if (!newSelected.includes(id)) {
                                newSelected.push(id);
                              }
                            });
                            setBulkSelectedRoleIds(newSelected);
                          }
                        }}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {(() => {
                          const filteredRoles = roles.filter(role => 
                            role.name.toLowerCase().includes(bulkRoleSearchTerm.toLowerCase()) ||
                            (role.description && role.description.toLowerCase().includes(bulkRoleSearchTerm.toLowerCase()))
                          );
                          const filteredRoleIds = filteredRoles.map(r => r.id);
                          const allFilteredSelected = filteredRoleIds.length > 0 && filteredRoleIds.every(id => bulkSelectedRoleIds.includes(id));
                          return allFilteredSelected ? 'Deselect All' : 'Select All';
                        })()}
                      </button>
                    </div>
                  </div>
                  {/* Search Input */}
                  <div className="mb-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search roles..."
                        value={bulkRoleSearchTerm}
                        onChange={(e) => setBulkRoleSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                      />
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {bulkRoleSearchTerm && (
                        <button
                          onClick={() => setBulkRoleSearchTerm('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {rolesLoading ? (
                    <div className="flex items-center justify-center py-12 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                    </div>
                  ) : roles.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                      No roles available. Create roles first.
                    </div>
                  ) : (
                    <>
                      <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                          {(() => {
                            let filteredRoles = roles.filter(role => 
                              role.name.toLowerCase().includes(bulkRoleSearchTerm.toLowerCase()) ||
                              (role.description && role.description.toLowerCase().includes(bulkRoleSearchTerm.toLowerCase()))
                            );
                            
                            // In remove mode, only show roles that at least one selected user has
                            if (bulkAssignMode === 'remove' && bulkSelectedUserIds.length > 0) {
                              const userRoleIds = new Set<number>();
                              bulkSelectedUserIds.forEach(userId => {
                                const userRoles = userRolesMap[userId] || [];
                                userRoles.forEach(role => userRoleIds.add(role.id));
                              });
                              
                              filteredRoles = filteredRoles.filter(role => userRoleIds.has(role.id));
                            }
                            
                            if (filteredRoles.length === 0) {
                              return (
                                <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                                  {roles.length === 0 
                                    ? 'No roles available. Create roles first.' 
                                    : bulkAssignMode === 'remove' && bulkSelectedUserIds.length > 0
                                    ? 'No roles found for selected users'
                                    : 'No roles match your search'}
                                </div>
                              );
                            }
                            
                            return filteredRoles.map((role) => {
                              // Check if all selected users have this role (for remove mode)
                              const allUsersHaveRole = bulkAssignMode === 'remove' && bulkSelectedUserIds.length > 0
                                ? bulkSelectedUserIds.every(userId => {
                                    const userRoles = userRolesMap[userId] || [];
                                    return userRoles.some(r => r.id === role.id);
                                  })
                                : true;
                              
                              return (
                            <label
                              key={role.id}
                              className={`flex items-center gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                                !allUsersHaveRole && bulkAssignMode === 'remove' ? 'opacity-50' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={bulkSelectedRoleIds.includes(role.id)}
                                disabled={!allUsersHaveRole && bulkAssignMode === 'remove'}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBulkSelectedRoleIds([...bulkSelectedRoleIds, role.id]);
                                  } else {
                                    setBulkSelectedRoleIds(bulkSelectedRoleIds.filter(id => id !== role.id));
                                  }
                                }}
                                className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {role.name}
                                  </div>
                                  {bulkAssignMode === 'remove' && !allUsersHaveRole && (
                                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                                      (not all users have this role)
                                    </span>
                                  )}
                                </div>
                                {role.description && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    {role.description}
                                  </div>
                                )}
                                <div className="flex gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  <span>{role.userCount || 0} users</span>
                                  <span>•</span>
                                  <span>{role.tileCount || 0} tiles</span>
                                  <span>•</span>
                                  <span>{role.linkCount || 0} links</span>
                                </div>
                              </div>
                            </label>
                          );
                          });
                          })()}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {bulkSelectedRoleIds.length} role{bulkSelectedRoleIds.length !== 1 ? 's' : ''} selected
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setShowBulkAssignModal(false);
                    setBulkSelectedUserIds([]);
                    setBulkSelectedRoleIds([]);
                    setBulkAssignMode('add');
                    setBulkUserSearchTerm('');
                    setBulkRoleSearchTerm('');
                    setUserRolesMap({});
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkAssignRoles}
                  disabled={bulkAssignLoading || bulkSelectedUserIds.length === 0 || bulkSelectedRoleIds.length === 0}
                  className={`flex-1 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors ${
                    bulkAssignMode === 'remove'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-brand-600 hover:bg-brand-500'
                  }`}
                >
                  {bulkAssignLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {bulkAssignMode === 'remove' ? 'Removing...' : 'Assigning...'}
                    </>
                  ) : (
                    bulkAssignMode === 'remove'
                      ? `Remove ${bulkSelectedRoleIds.length} Role${bulkSelectedRoleIds.length !== 1 ? 's' : ''} from ${bulkSelectedUserIds.length} User${bulkSelectedUserIds.length !== 1 ? 's' : ''}`
                      : `Assign ${bulkSelectedRoleIds.length} Role${bulkSelectedRoleIds.length !== 1 ? 's' : ''} to ${bulkSelectedUserIds.length} User${bulkSelectedUserIds.length !== 1 ? 's' : ''}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAML Configuration Modal */}
      <SamlConfigModal
        isOpen={samlConfigModalOpen}
        onClose={() => {
          setSamlConfigModalOpen(false);
          refreshSettings();
        }}
      />

      {/* Add/Edit Widget Modal */}
      {showAddWidgetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {editingWidget ? 'Edit Widget' : 'Add Custom Widget'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddWidgetModal(false);
                    setEditingWidget(null);
                    setWidgetForm({
                      widgetId: '',
                      name: '',
                      description: '',
                      componentPath: '',
                      floatingComponentPath: '',
                      iconSvg: '',
                      requiresAuth: false,
                      enabled: true
                    });
                    setError('');
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Widget ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={widgetForm.widgetId}
                  onChange={(e) => setWidgetForm({ ...widgetForm, widgetId: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                  placeholder="my-custom-widget"
                  disabled={!!editingWidget}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Unique identifier (lowercase letters, numbers, hyphens, underscores only). Cannot be changed after creation.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={widgetForm.name}
                  onChange={(e) => setWidgetForm({ ...widgetForm, name: e.target.value })}
                  placeholder="My Custom Widget"
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={widgetForm.description}
                  onChange={(e) => setWidgetForm({ ...widgetForm, description: e.target.value })}
                  placeholder="A brief description of what this widget does"
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Component Path <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={widgetForm.componentPath}
                  onChange={(e) => setWidgetForm({ ...widgetForm, componentPath: e.target.value })}
                  placeholder="components/MyWidget"
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Path to your widget component file (relative to components directory, without .tsx extension)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Floating Component Path (Optional)
                </label>
                <input
                  type="text"
                  value={widgetForm.floatingComponentPath}
                  onChange={(e) => setWidgetForm({ ...widgetForm, floatingComponentPath: e.target.value })}
                  placeholder="components/FloatingMyWidget"
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Path to floating wrapper component (if your widget should appear as a floating overlay)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Icon SVG (Optional)
                </label>
                <textarea
                  value={widgetForm.iconSvg}
                  onChange={(e) => setWidgetForm({ ...widgetForm, iconSvg: e.target.value })}
                  placeholder="<svg>...</svg>"
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  SVG code for the widget icon (will be used in widget quick access menu)
                </p>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={widgetForm.requiresAuth}
                    onChange={(e) => setWidgetForm({ ...widgetForm, requiresAuth: e.target.checked })}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500 border-slate-300 rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Requires Authentication</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={widgetForm.enabled}
                    onChange={(e) => setWidgetForm({ ...widgetForm, enabled: e.target.checked })}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500 border-slate-300 rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Enabled</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowAddWidgetModal(false);
                  setEditingWidget(null);
                  setWidgetForm({
                    widgetId: '',
                    name: '',
                    description: '',
                    componentPath: '',
                    floatingComponentPath: '',
                    iconSvg: '',
                    requiresAuth: false,
                    enabled: true
                  });
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingWidget ? handleUpdateWidget : handleCreateWidget}
                disabled={widgetFormLoading || !widgetForm.widgetId || !widgetForm.name || !widgetForm.componentPath}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {widgetFormLoading ? 'Saving...' : editingWidget ? 'Update Widget' : 'Create Widget'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Granular Permissions Modal */}
      <GranularPermissionsModal
        isOpen={showGranularPermissionsModal}
        onClose={() => {
          setShowGranularPermissionsModal(false);
          setSelectedPermissionForEdit(null);
        }}
        permission={selectedPermissionForEdit}
        onSave={handleUpdateGranularPermissions}
        userName={selectedPermissionForEdit?.username || selectedPermissionForEdit?.email}
        tileTitle={selectedPermissionForEdit?.tileTitle || allTiles.find(t => t.id === selectedPermissionForEdit?.tileId)?.title}
      />
    </div>
  );
};
