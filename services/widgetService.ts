// Widget service for managing custom widgets
import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export interface Widget {
  id: string;
  label: string;
  description: string;
  isCustom?: boolean;
}

export interface CustomWidget {
  id: number;
  widgetId: string;
  name: string;
  description: string;
  componentPath: string;
  floatingComponentPath: string | null;
  iconSvg: string | null;
  requiresAuth: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

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

export async function getCustomWidgets(): Promise<CustomWidget[]> {
  const response = await fetch(`${API_BASE}/widgets`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch widgets');
  }

  return response.json();
}

// Alias for backward compatibility
export const getAllWidgets = getCustomWidgets;

export async function getAllAvailableWidgets(): Promise<Widget[]> {
  const response = await fetch(`${API_BASE}/widgets?action=all`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch available widgets');
  }

  return response.json();
}

export async function getAllowedWidgets(): Promise<Widget[]> {
  const response = await fetch(`${API_BASE}/widgets?action=allowed`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch allowed widgets');
  }

  return response.json();
}

export async function getWidget(widgetId: string): Promise<CustomWidget> {
  const response = await fetch(`${API_BASE}/widgets?action=get&widgetId=${encodeURIComponent(widgetId)}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch widget');
  }

  return response.json();
}

export async function createWidget(data: CreateWidgetRequest): Promise<{ success: boolean; id: number; widgetId: string }> {
  const response = await fetch(`${API_BASE}/widgets?action=create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create widget');
  }

  return response.json();
}

export async function updateWidget(data: UpdateWidgetRequest): Promise<{ success: boolean; widgetId: string }> {
  const response = await fetch(`${API_BASE}/widgets?action=update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update widget');
  }

  return response.json();
}

export async function deleteWidget(widgetId: string): Promise<{ success: boolean; widgetId: string }> {
  const response = await fetch(`${API_BASE}/widgets?action=delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ widgetId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete widget');
  }

  return response.json();
}
