// API_BASE uses relative URLs (starting with /) which are protocol-agnostic
// This ensures the app works with both HTTP and HTTPS automatically
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const databaseService = {
  async exportDatabase(): Promise<void> {
    const response = await fetch(`${API_BASE}/database/export`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to export database');
    }

    // Get the filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'linknest-database-export.json';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Get the blob data
    const blob = await response.blob();

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  async importDatabase(file: File): Promise<{
    success: boolean;
    message: string;
    imported: Record<string, number>;
  }> {
    // Read file as text
    const fileText = await file.text();

    // Parse JSON
    let data;
    try {
      data = JSON.parse(fileText);
    } catch (e) {
      throw new Error('Invalid JSON file. Please ensure the file is a valid database export.');
    }

    // Validate structure
    if (!data.tables || typeof data.tables !== 'object') {
      throw new Error('Invalid database export format. Missing "tables" object.');
    }

    // Send to API
    const response = await fetch(`${API_BASE}/database/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to import database');
    }

    return result;
  },

  async getSnapshots(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/database/snapshots`, {
      credentials: 'include'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to fetch snapshots');
    return result.snapshots;
  },

  async createSnapshot(): Promise<any> {
    const response = await fetch(`${API_BASE}/database/snapshot`, {
      method: 'POST',
      credentials: 'include'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create snapshot');
    return result;
  },

  async deleteSnapshot(filename: string): Promise<any> {
    const response = await fetch(`${API_BASE}/database/snapshots/${filename}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to delete snapshot');
    return result;
  },

  async restoreSnapshot(filename: string): Promise<any> {
    const response = await fetch(`${API_BASE}/database/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ filename })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to restore snapshot');
    return result;
  }
};










