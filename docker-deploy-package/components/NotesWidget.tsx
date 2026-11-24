import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

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

interface Note {
  id: number;
  content: string;
  position: number;
  created_at: number;
  updated_at: number;
}

interface NotesData {
  tabs: string[];
  notes: Record<string, Note[]>;
}

export const NotesWidget: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [tabs, setTabs] = useState<string[]>(['General']);
  const [activeTab, setActiveTab] = useState<string>('General');
  const [notes, setNotes] = useState<Record<string, Note[]>>({});
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [newTabName, setNewTabName] = useState('');
  const [showNewTabInput, setShowNewTabInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotes();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (editingNoteId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [editingNoteId]);

  const loadNotes = async () => {
    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/notes`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load notes');
      const data: NotesData = await response.json();
      
      setTabs(data.tabs.length > 0 ? data.tabs : ['General']);
      setNotes(data.notes || {});
      
      // Set active tab to first tab if current active tab doesn't exist
      if (!data.tabs.includes(activeTab) && data.tabs.length > 0) {
        setActiveTab(data.tabs[0]);
      }
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async (content: string, tabName: string = activeTab) => {
    if (!content.trim()) return;

    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: content.trim(), tab_name: tabName }),
      });

      if (!response.ok) throw new Error('Failed to save note');
      
      await loadNotes();
      setNewNoteContent('');
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note. Please try again.');
    }
  };

  const updateNote = async (noteId: number, content: string) => {
    if (!content.trim()) {
      deleteNote(noteId);
      return;
    }

    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!response.ok) throw new Error('Failed to update note');
      
      setEditingNoteId(null);
      await loadNotes();
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Failed to update note. Please try again.');
    }
  };

  const deleteNote = async (noteId: number) => {
    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete note');
      
      await loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      alert('Failed to delete note. Please try again.');
    }
  };

  const createTab = async (tabName: string) => {
    if (!tabName.trim()) return;

    const trimmedName = tabName.trim();
    if (tabs.includes(trimmedName)) {
      setActiveTab(trimmedName);
      setNewTabName('');
      setShowNewTabInput(false);
      return;
    }

    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/notes/tabs/${encodeURIComponent(trimmedName)}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to create tab');
      
      setTabs([...tabs, trimmedName]);
      setActiveTab(trimmedName);
      setNewTabName('');
      setShowNewTabInput(false);
    } catch (error) {
      console.error('Error creating tab:', error);
      alert('Failed to create tab. Please try again.');
    }
  };

  const deleteTab = async (tabName: string) => {
    if (tabs.length === 1) {
      alert('Cannot delete the last tab. At least one tab is required.');
      return;
    }

    if (!confirm(`Delete tab "${tabName}" and all its notes?`)) return;

    try {
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/notes/tabs/${encodeURIComponent(tabName)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete tab');
      
      const newTabs = tabs.filter(t => t !== tabName);
      setTabs(newTabs);
      setActiveTab(newTabs[0]);
      await loadNotes();
    } catch (error) {
      console.error('Error deleting tab:', error);
      alert('Failed to delete tab. Please try again.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, noteId: number | null, content: string) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (noteId) {
        updateNote(noteId, content);
      } else {
        saveNote(content);
      }
    } else if (e.key === 'Escape') {
      if (noteId) {
        setEditingNoteId(null);
        setEditingContent('');
      }
    }
  };

  const currentNotes = notes[activeTab] || [];

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[320px] max-w-[450px]">
        <div className="animate-pulse text-center text-slate-500 dark:text-slate-400">Loading notes...</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[320px] max-w-[450px]">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Quick Notes
          </h3>
          <button
            onClick={() => setShowNewTabInput(!showNewTabInput)}
            className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
            title="Add new tab"
          >
            + Tab
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-3 max-h-24 overflow-y-auto">
          {tabs.map((tab) => (
            <div key={tab} className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === tab
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {tab}
              </button>
              {tabs.length > 1 && (
                <button
                  onClick={() => deleteTab(tab)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 p-0.5"
                  title={`Delete tab "${tab}"`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* New Tab Input */}
        {showNewTabInput && (
          <div className="mb-2 flex gap-1">
            <input
              type="text"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createTab(newTabName);
                } else if (e.key === 'Escape') {
                  setShowNewTabInput(false);
                  setNewTabName('');
                }
              }}
              placeholder="Tab name..."
              className="flex-1 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              autoFocus
            />
            <button
              onClick={() => createTab(newTabName)}
              className="px-2 py-1 text-xs bg-brand-500 text-white rounded hover:bg-brand-600"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Notes List */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {currentNotes.map((note) => (
          <div
            key={note.id}
            className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {editingNoteId === note.id ? (
              <textarea
                ref={textareaRef}
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, note.id, editingContent)}
                onBlur={() => {
                  if (editingContent.trim() !== note.content) {
                    updateNote(note.id, editingContent);
                  } else {
                    setEditingNoteId(null);
                    setEditingContent('');
                  }
                }}
                className="w-full text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                rows={3}
              />
            ) : (
              <div className="flex items-start gap-2">
                <div
                  className="flex-1 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap cursor-text"
                  onClick={() => {
                    setEditingNoteId(note.id);
                    setEditingContent(note.content);
                  }}
                >
                  {note.content}
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1"
                  title="Delete note"
                >
                  ×
                </button>
              </div>
            )}
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              {new Date(note.updated_at * 1000).toLocaleString()}
            </div>
          </div>
        ))}

        {/* New Note Input */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 border border-slate-200 dark:border-slate-600">
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, null, newNoteContent)}
            placeholder="Add a new note... (Ctrl+Enter to save)"
            className="w-full text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            rows={3}
          />
          <div className="flex justify-end mt-1">
            <button
              onClick={() => saveNote(newNoteContent)}
              disabled={!newNoteContent.trim()}
              className="text-xs px-3 py-1 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
