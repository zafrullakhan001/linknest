const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const preferenceService = {
    async getPreferences(): Promise<Record<string, string>> {
        try {
            const response = await fetch(`${API_BASE}/settings/user-preferences`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                return {};
            }

            const data = await response.json();
            return data.preferences || {};
        } catch {
            return {};
        }
    },

    async updatePreferences(preferences: Record<string, any>): Promise<void> {
        const response = await fetch(`${API_BASE}/settings/user-preferences`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ preferences })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update user preferences');
        }
    }
};
