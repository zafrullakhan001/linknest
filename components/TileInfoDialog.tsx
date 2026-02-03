import React, { useState, useEffect } from 'react';
import { Tile } from '../types';
import { FaTimes } from 'react-icons/fa';

interface TileAdmin {
  userId: number;
  username: string;
  email: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
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
  };
}

interface TileInfo {
  tileId: string;
  title: string;
  owner: {
    userId: number | null;
    username: string | null;
    email: string | null;
  };
  createdAt: number;
  lastModified: number;
  archivedAt: number | null;
  deletedAt: number | null;
  visibility: string;
  /** Which tab this tile comes from: "Public tab", "Staging tab", or "Private tab" */
  sourceTab?: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  tileAdmins?: TileAdmin[];
  granularPermissions?: {
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
    canEditTile: boolean;
  };
}

interface CategoryInfo {
  categoryName: string;
  tileCount: number;
  tiles: Array<{
    id: string;
    title: string;
    userId: number | null | undefined;
    createdAt: number;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
  owner?: {
    userId: number | null;
    username: string | null;
    email: string | null;
    isAdmin: boolean;
  };
}

interface TileInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tile?: Tile;
  categoryInfo?: CategoryInfo;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const TileInfoDialog: React.FC<TileInfoDialogProps> = ({
  isOpen,
  onClose,
  tile,
  categoryInfo
}) => {
  const [tileInfo, setTileInfo] = useState<TileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && tile && !categoryInfo) {
      fetchTileInfo();
    } else if (isOpen && categoryInfo) {
      setTileInfo(null);
      setError(null);
    }
  }, [isOpen, tile?.id, categoryInfo]);

  // Handle ESC key to close dialog
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  const fetchTileInfo = async () => {
    if (!tile) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tiles/${tile.id}/info`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch tile information');
      }
      
      const data = await response.json();
      setTileInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tile information');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-70" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {categoryInfo ? `Category: ${categoryInfo.categoryName}` : 'Tile Information'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <FaTimes className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-6">
          {categoryInfo ? (
            <CategoryInfoView categoryInfo={categoryInfo} formatDate={formatDate} formatRelativeTime={formatRelativeTime} />
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : tileInfo ? (
            <TileInfoView tileInfo={tileInfo} formatDate={formatDate} formatRelativeTime={formatRelativeTime} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const TileInfoView: React.FC<{
  tileInfo: TileInfo;
  formatDate: (ts: number) => string;
  formatRelativeTime: (ts: number) => string;
}> = ({ tileInfo, formatDate, formatRelativeTime }) => {
  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-brand-600 rounded"></span>
          Basic Information
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Title:</span>
            <span className="text-slate-900 dark:text-white">{tileInfo.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">ID:</span>
            <span className="text-slate-900 dark:text-white font-mono text-sm">{tileInfo.tileId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Visibility:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              tileInfo.visibility === 'public' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
              tileInfo.visibility === 'authenticated' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
              'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
            }`}>
              {tileInfo.visibility.charAt(0).toUpperCase() + tileInfo.visibility.slice(1)}
            </span>
          </div>
          {tileInfo.sourceTab && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Source tab:</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                tileInfo.sourceTab === 'Staging tab' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                tileInfo.sourceTab === 'Private tab' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                {tileInfo.sourceTab}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Ownership */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-brand-600 rounded"></span>
          Ownership
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
          {tileInfo.owner.userId ? (
            <>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Owner:</span>
                <span className="text-slate-900 dark:text-white">{tileInfo.owner.username || 'Unknown'}</span>
              </div>
              {tileInfo.owner.email && (
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Email:</span>
                  <span className="text-slate-900 dark:text-white">{tileInfo.owner.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">User ID:</span>
                <span className="text-slate-900 dark:text-white font-mono text-sm">{tileInfo.owner.userId}</span>
              </div>
            </>
          ) : (
            <div className="text-slate-600 dark:text-slate-400">No owner assigned</div>
          )}
        </div>
      </section>

      {/* Timestamps */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-brand-600 rounded"></span>
          Timestamps
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Created:</span>
            <div className="text-right">
              <div className="text-slate-900 dark:text-white">{formatDate(tileInfo.createdAt)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(tileInfo.createdAt)}</div>
            </div>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Last Modified:</span>
            <div className="text-right">
              <div className="text-slate-900 dark:text-white">{formatDate(tileInfo.lastModified)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(tileInfo.lastModified)}</div>
            </div>
          </div>
          {tileInfo.archivedAt && (
            <div className="flex justify-between items-start">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Archived:</span>
              <div className="text-right">
                <div className="text-slate-900 dark:text-white">{formatDate(tileInfo.archivedAt)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(tileInfo.archivedAt)}</div>
              </div>
            </div>
          )}
          {tileInfo.deletedAt && (
            <div className="flex justify-between items-start">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Deleted:</span>
              <div className="text-right">
                <div className="text-slate-900 dark:text-white">{formatDate(tileInfo.deletedAt)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(tileInfo.deletedAt)}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Permissions */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-brand-600 rounded"></span>
          Your Permissions
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">View:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              tileInfo.permissions.canView 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {tileInfo.permissions.canView ? 'Allowed' : 'Denied'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Edit:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              tileInfo.permissions.canEdit 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {tileInfo.permissions.canEdit ? 'Allowed' : 'Denied'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Delete:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              tileInfo.permissions.canDelete 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {tileInfo.permissions.canDelete ? 'Allowed' : 'Denied'}
            </span>
          </div>
          
          {/* Show granular permissions if user is a tile admin */}
          {tileInfo.granularPermissions && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                Your Granular Permissions
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Add Links:</span>
                  <span className={tileInfo.granularPermissions.canAddLinks ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canAddLinks ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Add Sections:</span>
                  <span className={tileInfo.granularPermissions.canAddSections ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canAddSections ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Add Tabs:</span>
                  <span className={tileInfo.granularPermissions.canAddTabs ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canAddTabs ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Edit Links:</span>
                  <span className={tileInfo.granularPermissions.canEditLinks ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canEditLinks ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Delete Links:</span>
                  <span className={tileInfo.granularPermissions.canDeleteLinks ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canDeleteLinks ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Delete Sections:</span>
                  <span className={tileInfo.granularPermissions.canDeleteSections ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canDeleteSections ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Delete Tabs:</span>
                  <span className={tileInfo.granularPermissions.canDeleteTabs ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canDeleteTabs ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Change Visibility:</span>
                  <span className={tileInfo.granularPermissions.canChangeVisibility ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canChangeVisibility ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Change Browser:</span>
                  <span className={tileInfo.granularPermissions.canChangeBrowser ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canChangeBrowser ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Clone Tile:</span>
                  <span className={tileInfo.granularPermissions.canCloneTile ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canCloneTile ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Tile Card Info:</span>
                  <span className={tileInfo.granularPermissions.canViewTileInfo ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canViewTileInfo ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Edit Tile Settings:</span>
                  <span className={tileInfo.granularPermissions.canEditTile ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {tileInfo.granularPermissions.canEditTile ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tile Admins */}
      {tileInfo.tileAdmins && tileInfo.tileAdmins.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand-600 rounded"></span>
            Tile Administrators ({tileInfo.tileAdmins.length})
          </h3>
          <div className="space-y-3">
            {tileInfo.tileAdmins.map((admin) => (
              <div key={admin.userId} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {admin.username}
                    </div>
                    {admin.email && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {admin.email}
                      </div>
                    )}
                  </div>
                  <div className="text-xs px-2 py-1 bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 rounded">
                    Tile Admin
                  </div>
                </div>
                
                {/* Basic Permissions */}
                <div className="mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Basic Permissions</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">View:</span>
                      <span className={admin.permissions.canView ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {admin.permissions.canView ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Edit:</span>
                      <span className={admin.permissions.canEdit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {admin.permissions.canEdit ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Delete:</span>
                      <span className={admin.permissions.canDelete ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {admin.permissions.canDelete ? '✓' : '✗'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Granular Permissions */}
                {admin.permissions.canAddLinks !== undefined && (
                  <div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Granular Permissions</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Add Links:</span>
                        <span className={admin.permissions.canAddLinks ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canAddLinks ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Add Sections:</span>
                        <span className={admin.permissions.canAddSections ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canAddSections ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Add Tabs:</span>
                        <span className={admin.permissions.canAddTabs ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canAddTabs ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Edit Links:</span>
                        <span className={admin.permissions.canEditLinks ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canEditLinks ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Delete Links:</span>
                        <span className={admin.permissions.canDeleteLinks ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canDeleteLinks ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Delete Sections:</span>
                        <span className={admin.permissions.canDeleteSections ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canDeleteSections ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Delete Tabs:</span>
                        <span className={admin.permissions.canDeleteTabs ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canDeleteTabs ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Change Visibility:</span>
                        <span className={admin.permissions.canChangeVisibility ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canChangeVisibility ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Change Browser:</span>
                        <span className={admin.permissions.canChangeBrowser ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canChangeBrowser ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Clone Tile:</span>
                        <span className={admin.permissions.canCloneTile ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canCloneTile ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Tile Card Info:</span>
                        <span className={admin.permissions.canViewTileInfo ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canViewTileInfo ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Edit Tile Settings:</span>
                        <span className={admin.permissions.canEditTile ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {admin.permissions.canEditTile ? '✓' : '✗'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const CategoryInfoView: React.FC<{
  categoryInfo: CategoryInfo;
  formatDate: (ts: number) => string;
  formatRelativeTime: (ts: number) => string;
}> = ({ categoryInfo, formatDate, formatRelativeTime }) => {
  const ownerCounts: Record<number, { username: string; count: number }> = {};
  let oldestTile: typeof categoryInfo.tiles[0] | null = null;
  let newestTile: typeof categoryInfo.tiles[0] | null = null;
  let totalCanView = 0;
  let totalCanEdit = 0;
  let totalCanDelete = 0;

  categoryInfo.tiles.forEach(tile => {
    if (tile.userId) {
      if (!ownerCounts[tile.userId]) {
        ownerCounts[tile.userId] = { username: `User ${tile.userId}`, count: 0 };
      }
      ownerCounts[tile.userId].count++;
    }
    
    if (!oldestTile || tile.createdAt < oldestTile.createdAt) {
      oldestTile = tile;
    }
    if (!newestTile || tile.createdAt > newestTile.createdAt) {
      newestTile = tile;
    }
    
    if (tile.canView) totalCanView++;
    if (tile.canEdit) totalCanEdit++;
    if (tile.canDelete) totalCanDelete++;
  });

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-brand-600 rounded"></span>
          Category Information
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Category Name:</span>
            <span className="text-slate-900 dark:text-white">{categoryInfo.categoryName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Total Tiles:</span>
            <span className="text-slate-900 dark:text-white">{categoryInfo.tileCount}</span>
          </div>
        </div>
      </section>

      {/* Category Ownership */}
      {categoryInfo.owner && (
        <section>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand-600 rounded"></span>
            Category Ownership
          </h3>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
            {categoryInfo.owner.userId ? (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Owner:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 dark:text-white">{categoryInfo.owner.username || `User ${categoryInfo.owner.userId}`}</span>
                    {categoryInfo.owner.isAdmin && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
                {categoryInfo.owner.email && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Email:</span>
                    <span className="text-slate-900 dark:text-white">{categoryInfo.owner.email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">User ID:</span>
                  <span className="text-slate-900 dark:text-white font-mono text-sm">{categoryInfo.owner.userId}</span>
                </div>
                {categoryInfo.owner.isAdmin && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-start gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        This category was created by an administrator.
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-slate-600 dark:text-slate-400">No owner assigned</div>
            )}
          </div>
        </section>
      )}

      {/* Ownership Summary */}
      {Object.keys(ownerCounts).length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand-600 rounded"></span>
            Ownership Summary
          </h3>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
            {Object.entries(ownerCounts).map(([userId, info]) => (
              <div key={userId} className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">User {userId}:</span>
                <span className="text-slate-900 dark:text-white">{info.count} tile{info.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Timestamps */}
      {oldestTile && newestTile && (
        <section>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand-600 rounded"></span>
            Timestamps
          </h3>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Oldest Tile:</span>
              <div className="text-right">
                <div className="text-slate-900 dark:text-white">{formatDate(oldestTile.createdAt)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(oldestTile.createdAt)}</div>
              </div>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Newest Tile:</span>
              <div className="text-right">
                <div className="text-slate-900 dark:text-white">{formatDate(newestTile.createdAt)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(newestTile.createdAt)}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Permissions Summary */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-brand-600 rounded"></span>
          Your Permissions Summary
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Can View:</span>
            <span className="text-slate-900 dark:text-white">{totalCanView} / {categoryInfo.tileCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Can Edit:</span>
            <span className="text-slate-900 dark:text-white">{totalCanEdit} / {categoryInfo.tileCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Can Delete:</span>
            <span className="text-slate-900 dark:text-white">{totalCanDelete} / {categoryInfo.tileCount}</span>
          </div>
        </div>
      </section>
    </div>
  );
};
