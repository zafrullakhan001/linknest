import React, { useState, useEffect, useCallback } from 'react';
import {
  getPendingInvitations,
  acceptInvitation,
  rejectInvitation,
  type TileShareInvitation,
  type TilePreview
} from '../services/tileShareService';

interface SharedTileNotificationsProps {
  onAccept?: () => void; // Called after accepting to refresh tiles
  onReject?: () => void; // Called after rejecting
}

const renderTilePreviewCard = (tile: TilePreview) => {
  const decorationStyles: React.CSSProperties = {};
  if (tile.tileGradientEnabled && tile.tileGradientColors?.length) {
    const gradientColors = tile.tileGradientColors;
    const stops = gradientColors.map((c, i) => {
      const pct = gradientColors.length > 1 ? (i * 100) / (gradientColors.length - 1) : 0;
      return `${c} ${pct}%`;
    }).join(', ');
    decorationStyles.background = `linear-gradient(${tile.tileGradientDirection || '90deg'}, ${stops})`;
  } else if (tile.tileBackgroundColor) {
    decorationStyles.backgroundColor = tile.tileBackgroundColor;
  }
  if (tile.tileBorderRadius != null) {
    decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
  }
  if (tile.tileTextColor && (tile.tileBackgroundColor || tile.tileGradientEnabled)) {
    decorationStyles.color = tile.tileTextColor;
  }

  const linkCount = tile.tabs?.reduce((acc, tab) => 
    acc + (tab.sections?.reduce((sacc, sec) => sacc + (sec.links?.length || 0), 0) || 0), 0) ?? 0;

  return (
    <div
      className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm"
      style={Object.keys(decorationStyles).length ? decorationStyles : undefined}
    >
      <div className={`p-3 ${Object.keys(decorationStyles).length ? '' : 'bg-white dark:bg-slate-800'}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl" title={tile.emoji}>{tile.emoji || '📄'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{tile.title}</div>
            {tile.description && (
              <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{tile.description}</div>
            )}
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {tile.tabs?.length || 0} tab(s) · {linkCount} link(s)
            </div>
          </div>
        </div>
        {tile.tabs && tile.tabs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600/50">
            <div className="flex flex-wrap gap-1">
              {tile.tabs.slice(0, 3).map(tab => (
                <span key={tab.id} className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 rounded">
                  {tab.title}
                </span>
              ))}
              {tile.tabs.length > 3 && (
                <span className="text-xs text-slate-400">+{tile.tabs.length - 3} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const SharedTileNotifications: React.FC<SharedTileNotificationsProps> = ({ onAccept, onReject }) => {
  const [invitations, setInvitations] = useState<TileShareInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadInvitations = useCallback(async () => {
    try {
      setError(null);
      const list = await getPendingInvitations();
      setInvitations(list);
    } catch (err) {
      console.error('Failed to load shared tile invitations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invitations');
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  // Poll for new invitations every 10 seconds when on Private tab
  useEffect(() => {
    const interval = setInterval(loadInvitations, 10000);
    return () => clearInterval(interval);
  }, [loadInvitations]);

  const handleAccept = async (inv: TileShareInvitation) => {
    setProcessingId(inv.id);
    try {
      await acceptInvitation(inv.id);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      onAccept?.();
      setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to accept');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (inv: TileShareInvitation) => {
    setProcessingId(inv.id);
    try {
      await rejectInvitation(inv.id);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      onReject?.();
      setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading && invitations.length === 0) {
    return (
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 py-4 px-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Loading shared tile notifications...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-b border-slate-200 dark:border-slate-700 bg-red-50/50 dark:bg-red-900/10 py-3 px-4">
        <div className="text-sm text-red-600 dark:text-red-400">
          Could not load invitations: {error}
        </div>
        <button
          onClick={() => { setLoading(true); loadInvitations(); }}
          className="mt-2 text-xs font-medium text-red-700 dark:text-red-300 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 bg-amber-50/50 dark:bg-amber-900/10">
      <div className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Shared with you ({invitations.length})
          </span>
          <button
            onClick={() => { setLoading(true); loadInvitations(); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
        {invitations.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No pending invitations. When another user shares a tile with you, it will appear here.
          </p>
        ) : (
          <>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Another user has shared tiles with you. Preview and accept to add them to your Private tab.
        </p>
        <div className="space-y-3">
          {invitations.map(inv => (
            <div
              key={inv.id}
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
            >
              <div
                className="p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{inv.tile?.emoji || '📄'}</span>
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {inv.sharerUsername}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400"> shared </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {inv.tile?.title || 'a tile'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400"> with you</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {expandedId === inv.id ? '▼' : '▶'} Preview
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAccept(inv); }}
                      disabled={processingId !== null}
                      className="px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg"
                    >
                      {processingId === inv.id ? '...' : 'Accept'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReject(inv); }}
                      disabled={processingId !== null}
                      className="px-3 py-1.5 text-sm font-medium bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50 text-slate-800 dark:text-slate-200 rounded-lg"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === inv.id && inv.tile && (
                <div className="px-3 pb-3 pt-0 border-t border-slate-100 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Preview</div>
                  {renderTilePreviewCard(inv.tile)}
                </div>
              )}
            </div>
          ))}
        </div>
          </>
        )}
      </div>
    </div>
  );
};
