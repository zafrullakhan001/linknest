const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface CustomWidget {
  id: number;
  widgetId: string;
  name: string;
  description?: string;
  componentPath: string;
  floatingComponentPath?: string;
  iconSvg?: string;
  requiresAuth: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BuiltInWidget {
  id: string;
  name: string;
  description: string;
  requiresAuth?: boolean;
}

// Built-in widgets metadata
export const BUILT_IN_WIDGETS: BuiltInWidget[] = [
  { id: 'clock', name: 'Clock', description: 'Time and timezone display widget' },
  { id: 'weather', name: 'Weather', description: 'Weather information widget' },
  { id: 'calculator', name: 'Calculator', description: 'Calculator widget' },
  { id: 'notes', name: 'Notes', description: 'Personal notes widget (requires authentication)', requiresAuth: true },
  { id: 'password-generator', name: 'Password Generator', description: 'Generate secure passwords' },
  { id: 'phonetic-alphabet', name: 'Phonetic Alphabet', description: 'Phonetic alphabet reference' },
  { id: 'zoom-control', name: 'Zoom Control', description: 'Page zoom control widget' },
  { id: 'theme', name: 'Theme', description: 'Theme switcher widget' },
  { id: 'fav-organizer', name: 'Favorite Organizer', description: 'Organize favorite links' },
  { id: 'chat', name: 'Chat', description: 'Chat widget (requires authentication)', requiresAuth: true },
  { id: 'snake-game', name: 'Snake Game', description: 'Snake game widget' }
];

export interface CreateWidgetRequest {
  widgetId: string;
  name: string;
  description?: string;
  componentPath: string;
  floatingComponentPath?: string;
  iconSvg?: string;
  requiresAuth?: boolean;
  enabled?: boolean;
}

export interface UpdateWidgetRequest {
  widgetId: string;
  name?: string;
  description?: string;
  componentPath?: string;
  floatingComponentPath?: string;
  iconSvg?: string;
  requiresAuth?: boolean;
  enabled?: boolean;
}

export interface DeleteWidgetRequest {
  widgetId: string;
}

/**
 * Get all custom widgets
 */
export async function getCustomWidgets(): Promise<CustomWidget[]> {
  const response = await fetch(`${API_BASE}/widgets.php`, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch custom widgets');
  }

  return response.json();
}

/**
 * Get a specific custom widget by ID
 */
export async function getCustomWidget(widgetId: string): Promise<CustomWidget> {
  const response = await fetch(`${API_BASE}/widgets.php?action=get&widgetId=${encodeURIComponent(widgetId)}`, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch custom widget');
  }

  return response.json();
}

/**
 * Get all available widgets (built-in + custom)
 */
export async function getAllWidgets(): Promise<Array<BuiltInWidget | CustomWidget>> {
  try {
    const customWidgets = await getCustomWidgets();
    const enabledCustomWidgets = customWidgets.filter(w => w.enabled);
    
    // Convert custom widgets to a format compatible with built-in widgets
    const customWidgetsFormatted = enabledCustomWidgets.map(w => ({
      id: w.widgetId,
      name: w.name,
      description: w.description || '',
      requiresAuth: w.requiresAuth
    }));
    
    return [...BUILT_IN_WIDGETS, ...customWidgetsFormatted];
  } catch (error) {
    console.error('Failed to load custom widgets, using built-in only:', error);
    return BUILT_IN_WIDGETS;
  }
}

/**
 * Create a new custom widget
 */
export async function createWidget(data: CreateWidgetRequest): Promise<{ success: boolean; id: number; widgetId: string }> {
  const response = await fetch(`${API_BASE}/widgets.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'create',
      ...data
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create widget');
  }

  return response.json();
}

/**
 * Update an existing custom widget
 */
export async function updateWidget(data: UpdateWidgetRequest): Promise<{ success: boolean; widgetId: string }> {
  const response = await fetch(`${API_BASE}/widgets.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'update',
      ...data
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update widget');
  }

  return response.json();
}

/**
 * Delete a custom widget
 */
export async function deleteWidget(data: DeleteWidgetRequest): Promise<{ success: boolean; widgetId: string }> {
  const response = await fetch(`${API_BASE}/widgets.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'delete',
      ...data
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete widget');
  }

  return response.json();
}

/**
 * Dynamically load a widget component
 */
export async function loadWidgetComponent(componentPath: string): Promise<any> {
  try {
    // Remove leading './' or '/' if present
    const cleanPath = componentPath.replace(/^\.?\//, '');
    
    // Try to dynamically import the component
    const module = await import(`./${cleanPath}`);
    return module;
  } catch (error) {
    console.error(`Failed to load widget component from ${componentPath}:`, error);
    throw error;
  }
}
