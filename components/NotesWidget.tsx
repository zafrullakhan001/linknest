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

interface NotesWidgetProps {
  onClose?: () => void;
}

export const NotesWidget: React.FC<NotesWidgetProps> = ({ onClose }) => {
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

  // Escape key handler to close widget
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Don't close if user is editing a note
        if (editingNoteId !== null) {
          return;
        }
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose, editingNoteId]);

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
      
      // Preserve existing tab order and append new tabs that don't exist
      setTabs((currentTabs) => {
        const apiTabs = data.tabs.length > 0 ? data.tabs : ['General'];
        const existingTabs = currentTabs.filter(tab => apiTabs.includes(tab));
        const newTabs = apiTabs.filter(tab => !currentTabs.includes(tab));
        // Return existing tabs in their current order, then append new tabs
        return [...existingTabs, ...newTabs];
      });
      setNotes(data.notes || {});
      
      // Set active tab to first tab if current active tab doesn't exist
      const apiTabs = data.tabs.length > 0 ? data.tabs : ['General'];
      if (!apiTabs.includes(activeTab) && apiTabs.length > 0) {
        setActiveTab(apiTabs[0]);
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

  const exportToCSV = () => {
    try {
      // Prepare CSV data
      const csvRows: string[] = [];
      
      // CSV header
      csvRows.push('Tab,Content,Position,Created At,Updated At');
      
      // Add all notes
      tabs.forEach(tab => {
        const tabNotes = notes[tab] || [];
        tabNotes.forEach(note => {
          // Escape content for CSV (handle commas, quotes, newlines)
          const escapedContent = `"${note.content.replace(/"/g, '""')}"`;
          const createdDate = new Date(note.created_at * 1000).toISOString();
          const updatedDate = new Date(note.updated_at * 1000).toISOString();
          csvRows.push(`${tab},${escapedContent},${note.position},${createdDate},${updatedDate}`);
        });
      });
      
      // Create CSV string
      const csvContent = csvRows.join('\n');
      
      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `linknest-notes-${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      alert('Failed to export notes. Please try again.');
    }
  };

  const importFromCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('CSV file is empty or invalid.');
        return;
      }

      // Skip header row
      const dataLines = lines.slice(1);
      const importedNotes: Array<{ tab: string; content: string; position: number }> = [];

      // Simple CSV parser that handles quoted fields
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              // Escaped quote
              current += '"';
              i++; // Skip next quote
            } else {
              // Toggle quote state
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            // Field separator
            result.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current); // Add last field
        return result;
      };

      for (const line of dataLines) {
        const fields = parseCSVLine(line);
        if (fields.length < 3) continue;

        const [tab, content, positionStr] = fields;
        const position = parseInt(positionStr, 10) || 0;

        if (tab && content) {
          importedNotes.push({
            tab: tab.trim(),
            content: content.trim(),
            position,
          });
        }
      }

      if (importedNotes.length === 0) {
        alert('No valid notes found in CSV file.');
        return;
      }

      if (!confirm(`Import ${importedNotes.length} note(s)? This will add new notes to existing tabs.`)) {
        return;
      }

      // Import notes via API
      const apiBase = resolveApiBase();
      let successCount = 0;
      let errorCount = 0;

      for (const note of importedNotes) {
        try {
          const response = await fetch(`${apiBase}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              content: note.content, 
              tab_name: note.tab,
              position: note.position 
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          errorCount++;
        }
      }

      // Reload notes
      await loadNotes();

      // Show result
      if (errorCount === 0) {
        alert(`Successfully imported ${successCount} note(s).`);
      } else {
        alert(`Imported ${successCount} note(s). ${errorCount} note(s) failed to import.`);
      }

      // Reset file input
      event.target.value = '';
    } catch (error) {
      console.error('Error importing from CSV:', error);
      alert('Failed to import notes. Please check the CSV file format.');
      event.target.value = '';
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
          <div className="flex gap-1 items-center">
            <button
              onClick={exportToCSV}
              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
              title="Export to CSV"
            >
              📥
            </button>
            <label 
              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors cursor-pointer"
              title="Import from CSV"
            >
              <input
                type="file"
                accept=".csv"
                onChange={importFromCSV}
                className="hidden"
              />
              📤
            </label>
            <button
              onClick={() => setShowNewTabInput(!showNewTabInput)}
              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
              title="Add new tab"
            >
            + Tab
          </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                title="Close Notes Widget"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
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
