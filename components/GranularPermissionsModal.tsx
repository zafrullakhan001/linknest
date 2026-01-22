import React, { useState, useEffect } from 'react';
import { TilePermission } from '../services/accessService';

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
  }) => Promise<void>;
  userName?: string;
  tileTitle?: string;
}

export const GranularPermissionsModal: React.FC<GranularPermissionsModalProps> = ({
  isOpen,
  onClose,
  permission,
  onSave,
  userName,
  tileTitle
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
    canCloneTile: false
  });
  const [isSaving, setIsSaving] = useState(false);

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
        canCloneTile: permission.canCloneTile ?? false
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
  }> = ({ label, description, checked, onChange, category }) => {
    const categoryColors = {
      add: 'text-green-600 dark:text-green-400',
      edit: 'text-blue-600 dark:text-blue-400',
      delete: 'text-red-600 dark:text-red-400',
      restricted: 'text-amber-600 dark:text-amber-400'
    };

    return (
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center h-5 mt-0.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-2"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium text-slate-900 dark:text-white cursor-pointer">
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
                Configure Tile Admin Permissions
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
              />
              <PermissionToggle
                label="Add Sections"
                description="Create new sections in tabs"
                checked={permissions.canAddSections}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canAddSections: checked }))}
                category="add"
              />
              <PermissionToggle
                label="Add Tabs"
                description="Create new tabs in tiles"
                checked={permissions.canAddTabs}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canAddTabs: checked }))}
                category="add"
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
              />
              <PermissionToggle
                label="Delete Sections"
                description="Remove sections from tabs"
                checked={permissions.canDeleteSections}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canDeleteSections: checked }))}
                category="delete"
              />
              <PermissionToggle
                label="Delete Tabs"
                description="Remove tabs from tiles"
                checked={permissions.canDeleteTabs}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canDeleteTabs: checked }))}
                category="delete"
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
              />
              <PermissionToggle
                label="Change Browser"
                description="Modify browser settings for links"
                checked={permissions.canChangeBrowser}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canChangeBrowser: checked }))}
                category="restricted"
              />
              <PermissionToggle
                label="Clone Tile"
                description="Create a copy of the tile"
                checked={permissions.canCloneTile}
                onChange={(checked) => setPermissions(prev => ({ ...prev, canCloneTile: checked }))}
                category="restricted"
              />
            </div>
          </div>

          {/* Quick Presets */}
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
                  canCloneTile: false
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
                  canCloneTile: false
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
                  canCloneTile: false
                })}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                Links Only (No Structure)
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
};
