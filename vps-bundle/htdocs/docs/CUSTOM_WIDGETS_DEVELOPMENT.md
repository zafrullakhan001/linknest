# Custom Widgets Development Guide

This guide explains how to develop and integrate custom widgets into the LinkNest application.

## Table of Contents

1. [Overview](#overview)
2. [Widget Architecture](#widget-architecture)
3. [Creating a Custom Widget](#creating-a-custom-widget)
4. [Widget Registration](#widget-registration)
5. [Widget Integration](#widget-integration)
6. [Role-Based Access Control](#role-based-access-control)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

## Overview

LinkNest supports custom widgets that can be developed and integrated into the application. Custom widgets are React components that can be displayed as floating widgets or embedded in the application interface. They integrate with the role-based access control system, allowing administrators to control which roles can access specific widgets.

## Widget Architecture

### Widget Types

1. **Floating Widgets**: Widgets that appear as floating overlays (e.g., Calculator, Weather)
2. **Embedded Widgets**: Widgets that are part of the main interface

### Widget Structure

A custom widget consists of:
- **Widget Component**: The main React component (`YourWidget.tsx`)
- **Floating Wrapper**: Optional floating container component (`FloatingYourWidget.tsx`)
- **Widget Metadata**: Information about the widget (name, description, icon, etc.)

## Creating a Custom Widget

### Step 1: Create the Widget Component

Create a new file in the `components/` directory: `YourWidget.tsx`

```typescript
import React, { useState, useEffect } from 'react';

interface YourWidgetProps {
  onClose?: () => void;
  // Add any other props your widget needs
}

export const YourWidget: React.FC<YourWidgetProps> = ({ onClose }) => {
  const [state, setState] = useState<string>('');

  // Escape key handler to close widget
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
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
  }, [onClose]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[280px] max-w-[320px]">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Your Widget Name
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
              title="Close Widget"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
        
        {/* Your widget content here */}
        <div>
          {/* Widget implementation */}
        </div>
      </div>
    </div>
  );
};
```

### Step 2: Create the Floating Wrapper (Optional)

If your widget should appear as a floating overlay, create `FloatingYourWidget.tsx`:

```typescript
import React from 'react';
import { YourWidget } from './YourWidget';

interface FloatingYourWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  // Add any other props
}

export const FloatingYourWidget: React.FC<FloatingYourWidgetProps> = ({ 
  isOpen, 
  onClose,
  // ... other props
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div 
        className="fixed inset-0 bg-black/30 pointer-events-auto"
        onClick={onClose}
      />
      <div 
        className="relative pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <YourWidget 
          onClose={onClose}
          // ... pass other props
        />
      </div>
    </div>
  );
};
```

### Step 3: Widget Requirements

Your widget component should:

1. **Accept `onClose` prop**: For closing the widget
2. **Handle Escape key**: Close widget when Escape is pressed (unless user is typing)
3. **Support Dark Mode**: Use Tailwind dark mode classes (`dark:bg-slate-800`, etc.)
4. **Be Responsive**: Work well on different screen sizes
5. **Follow Design System**: Use the application's color scheme and styling patterns

## Widget Registration

### Method 1: Register via Admin Panel (Recommended)

1. Log in as an administrator
2. Navigate to Admin Panel → Custom Widgets
3. Click "Add Custom Widget"
4. Fill in the widget information:
   - **Widget ID**: Unique identifier (e.g., `my-custom-widget`)
   - **Name**: Display name (e.g., "My Custom Widget")
   - **Description**: Brief description
   - **Component Path**: Path to your widget component (e.g., `components/YourWidget`)
   - **Floating Component Path**: Path to floating wrapper (e.g., `components/FloatingYourWidget`)
   - **Icon SVG**: SVG code for the widget icon
   - **Requires Authentication**: Whether the widget requires user login
   - **Enabled**: Whether the widget is active

5. Click "Save"

### Method 2: Register via API

You can register widgets programmatically using the API:

```typescript
// POST /api/widgets.php
{
  "action": "create",
  "widgetId": "my-custom-widget",
  "name": "My Custom Widget",
  "description": "A custom widget example",
  "componentPath": "components/YourWidget",
  "floatingComponentPath": "components/FloatingYourWidget",
  "iconSvg": "<svg>...</svg>",
  "requiresAuth": false,
  "enabled": true
}
```

## Widget Integration

### Integration Process

Custom widgets registered via the Admin Panel are automatically:
- Available in the role-based access control system
- Listed in the Admin Panel for role assignment

However, to make custom widgets fully functional in the application, you need to:

1. **Create the widget components** (as described in "Creating a Custom Widget" section)
2. **Register the widget in App.tsx** (see below)
3. **Register the widget via Admin Panel** (for role management)

### Manual Integration in App.tsx

To make your custom widget available in the Widget Quick Access menu and render it in the application, you need to integrate it into `App.tsx`:

If you want to add a widget directly to the codebase (not via admin panel):

1. Create your widget components in `components/`
2. Import them in `App.tsx`:
```typescript
import { YourWidget } from './components/YourWidget';
import { FloatingYourWidget } from './components/FloatingYourWidget';
```

3. Add state management in `App.tsx`:
```typescript
const [showYourWidget, setShowYourWidget] = useState(false);
const toggleYourWidget = () => setShowYourWidget(!showYourWidget);
```

4. Add to Widget Quick Access:
```typescript
widgets={[
  // ... existing widgets
  {
    id: 'your-widget-id',
    name: 'Your Widget',
    icon: <YourIconSVG />,
    isVisible: showYourWidget,
    onToggle: toggleYourWidget,
    requiresAuth: false,
  },
]}
```

5. Render the floating widget:
```typescript
{showYourWidget && (
  <FloatingYourWidget
    isOpen={showYourWidget}
    onClose={() => setShowYourWidget(false)}
  />
)}
```

### Integration Checklist

After creating your widget components:

- [ ] Widget component created (`YourWidget.tsx`)
- [ ] Floating wrapper created (`FloatingYourWidget.tsx`) - if needed
- [ ] Components imported in `App.tsx`
- [ ] State management added in `App.tsx`
- [ ] Widget added to Widget Quick Access array
- [ ] Floating widget rendered in `App.tsx`
- [ ] Widget registered via Admin Panel (for role management)
- [ ] Widget assigned to roles via Admin Panel

**Note**: The widget must be registered in the Admin Panel even if manually integrated in `App.tsx`. This ensures the widget appears in role management and can be assigned to specific roles.

## Role-Based Access Control

### Assigning Widgets to Roles

1. Navigate to Admin Panel → Roles
2. Select a role or create a new one
3. Go to the "Widgets" tab
4. Check/uncheck widgets to grant/revoke access
5. Custom widgets will appear in the list alongside built-in widgets

### Checking Widget Access in Code

```typescript
import { useAuth } from './contexts/AuthContext';
import { rolesService } from './services/rolesService';

const { user } = useAuth();

// Check if user has access to a widget
const checkWidgetAccess = async (widgetId: string) => {
  if (!user) return false;
  
  // Admins have access to all widgets
  if (user.is_admin) return true;
  
  // Check user's roles for widget access
  const userRoles = await rolesService.getUserRoles(user.id);
  // Implementation depends on your access checking logic
  return hasWidgetAccess(userRoles, widgetId);
};
```

## Best Practices

### 1. Widget Naming

- Use kebab-case for widget IDs: `my-custom-widget`
- Use descriptive, user-friendly names
- Keep widget IDs unique

### 2. Component Structure

- Keep widgets focused on a single purpose
- Make widgets reusable and configurable via props
- Handle errors gracefully

### 3. Performance

- Use React.memo for expensive widgets
- Lazy load heavy widgets
- Optimize re-renders

### 4. Accessibility

- Include proper ARIA labels
- Support keyboard navigation
- Ensure sufficient color contrast

### 5. Security

- Sanitize user inputs
- Validate data before processing
- Don't expose sensitive information

### 6. Styling

- Use Tailwind CSS classes
- Support dark mode
- Follow the application's design system
- Make widgets responsive

## Examples

### Example 1: Simple Counter Widget

```typescript
import React, { useState } from 'react';

interface CounterWidgetProps {
  onClose?: () => void;
}

export const CounterWidget: React.FC<CounterWidgetProps> = ({ onClose }) => {
  const [count, setCount] = useState(0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Counter
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        )}
      </div>
      <div className="text-center">
        <div className="text-4xl font-bold text-brand-500 mb-4">{count}</div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setCount(count - 1)}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            -
          </button>
          <button
            onClick={() => setCount(0)}
            className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600"
          >
            Reset
          </button>
          <button
            onClick={() => setCount(count + 1)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
```

### Example 2: API-Fetching Widget

```typescript
import React, { useState, useEffect } from 'react';

interface DataWidgetProps {
  onClose?: () => void;
}

export const DataWidget: React.FC<DataWidgetProps> = ({ onClose }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/your-endpoint.php');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4">
      {/* Widget content */}
    </div>
  );
};
```

## API Reference

### Widget Management Endpoints

#### Get All Widgets
```
GET /api/widgets.php
```

#### Get Widget by ID
```
GET /api/widgets.php?action=get&widgetId=my-widget
```

#### Create Widget
```
POST /api/widgets.php
{
  "action": "create",
  "widgetId": "my-widget",
  "name": "My Widget",
  "description": "Widget description",
  "componentPath": "components/MyWidget",
  "floatingComponentPath": "components/FloatingMyWidget",
  "iconSvg": "<svg>...</svg>",
  "requiresAuth": false,
  "enabled": true
}
```

#### Update Widget
```
POST /api/widgets.php
{
  "action": "update",
  "widgetId": "my-widget",
  "name": "Updated Name",
  // ... other fields
}
```

#### Delete Widget
```
POST /api/widgets.php
{
  "action": "delete",
  "widgetId": "my-widget"
}
```

## Troubleshooting

### Widget Not Appearing

1. Check that the widget is enabled in the admin panel
2. Verify the component paths are correct
3. Check browser console for errors
4. Ensure the widget is assigned to the user's role

### Widget Not Loading

1. Verify the component file exists at the specified path
2. Check that the component is exported correctly
3. Review browser console for import errors
4. Ensure all dependencies are installed

### Role Access Issues

1. Verify the widget is assigned to the user's role
2. Check that the user has the correct role assigned
3. Review role permissions in the admin panel

## Support

For questions or issues with custom widget development:
- Review existing widget implementations in `components/`
- Check the API documentation
- Review the role-based access control documentation
