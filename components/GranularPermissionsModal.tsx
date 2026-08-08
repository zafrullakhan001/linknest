import React, { useState, useEffect } from 'react';
import { TilePermission } from '../services/accessService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface GranularPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: TilePermission | null;
  onSave: (permissions: {
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
  }) => Promise<void>;
  onRemove?: () => Promise<void>;
  userName?: string;
  tileTitle?: string;
  isOwner?: boolean;
  tileOwnerId?: number | null;
}

export const GranularPermissionsModal: React.FC<GranularPermissionsModalProps> = ({
  isOpen,
  onClose,
  permission,
  onSave,
  onRemove,
  userName,
  tileTitle,
  isOwner = false,
  tileOwnerId
}) => {
  const [permissions, setPermissions] = useState({
    canAddLinks: true,
    canAddSections: true,
    canAddTabs: true,
    canEditLinks: true,
    canDeleteLinks: false,
    canDeleteSections: false,
    canDeleteTabs: false,
    canChangeVisibility: false,
    canChangeBrowser: false,
    canCloneTile: false,
    canViewTileInfo: true,
    canDelete: false,
    canEditTile: true
  });
  const [isSaving, setIsSaving] = useState(false);

  useEscapeToClose(isOpen, onClose);

  useEffect(() => {
    if (permission) {
      setPermissions({
        canAddLinks: permission.canAddLinks ?? true,
        canAddSections: permission.canAddSections ?? true,
        canAddTabs: permission.canAddTabs ?? true,
        canEditLinks: permission.canEditLinks ?? true,
        canDeleteLinks: permission.canDeleteLinks ?? false,
        canDeleteSections: permission.canDeleteSections ?? false,
        canDeleteTabs: permission.canDeleteTabs ?? false,
        canChangeVisibility: permission.canChangeVisibility ?? false,
        canChangeBrowser: permission.canChangeBrowser ?? false,
        canCloneTile: permission.canCloneTile ?? false,
        canViewTileInfo: permission.canViewTileInfo ?? true,
        canDelete: permission.canDelete ?? false,
        canEditTile: permission.canEditTile ?? true
      });
    }
  }, [permission]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(permissions);
      onClose();
    } catch (error) {
      console.error('Failed to save permissions:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const PermissionToggle: React.FC<{
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    category: 'add' | 'edit' | 'delete' | 'restricted';
    disabled?: boolean;
  }> = ({ label, description, checked, onChange, category, disabled = false }) => {
    const categoryColors = {
      add: 'text-green-600 dark:text-green-400',
      edit: 'text-blue-600 dark:text-blue-400',
      delete: 'text-red-600 dark:text-red-400',
      restricted: 'text-amber-600 dark:text-amber-400'
    };

    return (
      <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
        <div className="flex items-center h-5 mt-0.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => !disabled && onChange(e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className={`text-sm font-medium text-slate-900 dark:text-white ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            {label}
          </label>
          <p className={`text-xs mt-0.5 ${categoryColors[category]}`}>
            {description}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Fine-tune space editor permissions
              </h2>
              {userName && tileTitle && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {userName} • {tileTitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Owner Protection Message */}
          {isOwner && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Tile Owner - Protected Permissions
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    This user is the owner of the tile. Owner permissions cannot be modified or removed by tile administrators for security reasons. Only the owner or system administrators can manage ownership.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Add Permissions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
              Add Permissions
            </h3>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2">
              <PermissionToggle
                label="Add Links"
                description="Create new links in sections"
                checked={permissions.canAddLinks}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canAddLinks: checked }))}
                category="add"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Add Sections"
                description="Create new sections in tabs"
                checked={permissions.canAddSections}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canAddSections: checked }))}
                category="add"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Add Tabs"
                description="Create new tabs in tiles"
                checked={permissions.canAddTabs}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canAddTabs: checked }))}
                category="add"
                disabled={isOwner}
              />
            </div>
          </div>

          {/* Edit Permissions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
              Edit Permissions
            </h3>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2">
              <PermissionToggle
                label="Edit Links"
                description="Modify existing links"
                checked={permissions.canEditLinks}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canEditLinks: checked }))}
                category="edit"
                disabled={isOwner}
              />
            </div>
          </div>

          {/* Delete Permissions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
              Delete Permissions
            </h3>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2">
              <PermissionToggle
                label="Delete Links"
                description="Remove links from sections"
                checked={permissions.canDeleteLinks}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canDeleteLinks: checked }))}
                category="delete"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Delete Sections"
                description="Remove sections from tabs"
                checked={permissions.canDeleteSections}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canDeleteSections: checked }))}
                category="delete"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Delete Tabs"
                description="Remove tabs from tiles"
                checked={permissions.canDeleteTabs}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canDeleteTabs: checked }))}
                category="delete"
                disabled={isOwner}
              />
            </div>
          </div>

          {/* Restricted Actions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
              Restricted Actions
            </h3>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2">
              <PermissionToggle
                label="Change Visibility"
                description="Modify tile and link visibility settings"
                checked={permissions.canChangeVisibility}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canChangeVisibility: checked }))}
                category="restricted"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Change Browser"
                description="Modify browser settings for links"
                checked={permissions.canChangeBrowser}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canChangeBrowser: checked }))}
                category="restricted"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Clone Tile"
                description="Create a copy of the tile"
                checked={permissions.canCloneTile}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canCloneTile: checked }))}
                category="restricted"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Tile Card Info"
                description="Show the info button on tile cards"
                checked={permissions.canViewTileInfo}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canViewTileInfo: checked }))}
                category="restricted"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Edit Tile Settings"
                description="Edit tile properties (title, emoji, theme, decoration)"
                checked={permissions.canEditTile}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canEditTile: checked }))}
                category="restricted"
                disabled={isOwner}
              />
              <PermissionToggle
                label="Delete/Archive Tile"
                description="Delete or archive the entire tile (not just content)"
                checked={permissions.canDelete}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canDelete: checked }))}
                category="restricted"
                disabled={isOwner}
              />
            </div>
          </div>

          {/* Quick Presets */}
          {!isOwner && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
                Quick Presets
              </h3>
              <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPermissions({
                  canAddLinks: true,
                  canAddSections: true,
                  canAddTabs: true,
                  canEditLinks: true,
                  canDeleteLinks: false,
                  canDeleteSections: false,
                  canDeleteTabs: false,
                  canChangeVisibility: false,
                  canChangeBrowser: false,
                  canCloneTile: false,
                  canViewTileInfo: true,
                  canDelete: false,
                  canEditTile: true
                })}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                Default (Add/Edit Only)
              </button>
              <button
                onClick={() => setPermissions({
                  canAddLinks: true,
                  canAddSections: true,
                  canAddTabs: true,
                  canEditLinks: true,
                  canDeleteLinks: true,
                  canDeleteSections: true,
                  canDeleteTabs: true,
                  canChangeVisibility: false,
                  canChangeBrowser: false,
                  canCloneTile: false,
                  canViewTileInfo: true,
                  canDelete: false,
                  canEditTile: true
                })}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                Full Content Control
              </button>
              <button
                onClick={() => setPermissions({
                  canAddLinks: true,
                  canAddSections: true,
                  canAddTabs: true,
                  canEditLinks: true,
                  canDeleteLinks: true,
                  canDeleteSections: false,
                  canDeleteTabs: false,
                  canChangeVisibility: false,
                  canChangeBrowser: false,
                  canCloneTile: false,
                  canViewTileInfo: true,
                  canDelete: false,
                  canEditTile: true
                })}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                Links Only (No Structure)
              </button>
            </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          {isOwner ? (
            // Owner view - Close button only
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          ) : (
            // Non-owner view - Cancel, Remove, Save buttons
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              {onRemove && (
                <button
                  onClick={async () => {
                    if (confirm(`Remove ${userName || 'this user'} as a tile admin?`)) {
                      setIsSaving(true);
                      try {
                        await onRemove();
                        onClose();
                      } catch (error) {
                        console.error('Failed to remove tile admin:', error);
                      } finally {
                        setIsSaving(false);
                      }
                    }
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Removing...' : 'Remove Admin'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Permissions'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
