import { userPreferencesService } from './userPreferencesService';

export const preferenceService = {
    async getPreferences(): Promise<Record<string, string>> {
        const prefs = await userPreferencesService.getPreferences();
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(prefs)) {
            if (value == null) continue;
            out[key] = String(value);
        }
        return out;
    },

    async updatePreferences(preferences: Record<string, any>): Promise<void> {
        await userPreferencesService.updatePreferences(preferences);
    }
};
