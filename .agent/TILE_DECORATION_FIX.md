# Tile Decoration Style Fix

## Problem
Tiles with no local tile decorations were losing the global style manager settings when the visibility settings were changed. The text color would change to black and the blue gradient style from the style manager would disappear.

## Root Cause
The issue was in the logic that determines when a tile has "local decorations" in `components/TileGrid.tsx` (around line 1019-1025).

The original code was checking:
```typescript
const hasLocalDecoration = !!(
  tile.tileBackgroundColor ||
  (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) ||
  (tile.tileBorderRadius !== undefined && tile.tileBorderRadius >= 0) // ❌ This was the problem!
);
```

When a tile had `tileBorderRadius` set (even if it had no custom background or text color), it would be marked as having "local decorations". This triggered CSS rules like:

```css
.linknest-tile.has-local-decoration {
  color: var(--tile-local-text-color, initial) !important;
}
```

Since `--tile-local-text-color` wasn't set (because there was no local text color), it would fall back to `initial`, which is black. This would override the global style manager's gradient text colors.

## Solution
The fix involved three changes:

### 1. **Update hasLocalDecoration Logic**
Changed the logic to only consider a tile as having local decorations when it has actual visual customizations (background color or gradient):

```typescript
const hasLocalDecoration = !!(
  tile.tileBackgroundColor ||
  (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0)
  // ✅ Removed tileBorderRadius check
);
```

### 2. **Separate Border Radius Application**
Moved border radius application outside the `hasLocalDecoration` check so it can be applied independently:

```typescript
// Border radius - apply independently of local decoration
// This allows border radius customization without triggering the local decoration CSS overrides
if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius !== null) {
  decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
}
```

### 3. **Update className Logic**
Updated the className to check `tileBorderRadius` directly instead of relying on `hasLocalDecoration`:

```typescript
className={`
  linknest-tile ${hasLocalDecoration ? 'has-local-decoration' : ''} ... ${tile.tileBorderRadius === undefined ? 'rounded-xl' : ''} ...
`}
```

## Result
Now tiles without meaningful local decorations (background color, gradient, or text color) will properly inherit the global style manager settings. Border radius can still be customized independently without interfering with the global styles.

## Follow-up Fix: Preserving Global Border Radius

### Problem
After the initial fix, tiles with local decorations (like custom background colors or gradients) but no explicit local border radius were losing their rounded corners and appearing with sharp edges.

### Root Cause
The CSS fallback for `border-radius` was using `initial` (which is 0):

```css
border-radius: var(--tile-local-border-radius, initial) !important;
```

When a tile had local decorations but no local border radius, it would fall back to `initial`, overriding the global `rounded-xl` (0.75rem) style.

### Solution
Updated the CSS fallback to use `0.75rem` (Tailwind's `rounded-xl` value) instead of `initial` in three places:

1. **Base local decoration styles** (line 66)
2. **Dark mode local decoration styles** (line 115)
3. **Theme-specific local decoration styles** (line 145)

```css
border-radius: var(--tile-local-border-radius, 0.75rem) !important;
```

Now when a tile has local decorations but no explicit border radius, it will preserve the global rounded corners.

## Follow-up Fix #2: Local Border Radius Not Being Respected

### Problem
After the previous fixes, local border radius settings were being ignored - all tiles were using the global `0.75rem` border radius regardless of custom settings.

### Root Cause
When I moved the border radius application outside of the `hasLocalDecoration` block, I removed the CSS custom property assignment:

```typescript
// Only set inline style, not the CSS custom property
decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
```

However, the CSS uses `!important` rules with the custom property:
```css
border-radius: var(--tile-local-border-radius, 0.75rem) !important;
```

Since the custom property wasn't being set, the CSS always fell back to `0.75rem`, ignoring the inline style.

### Solution
Added the CSS custom property back when a local border radius is defined:

```typescript
if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius !== null) {
  // Set CSS custom property so !important rules in CSS can use it
  decorationStyles['--tile-local-border-radius' as any] = `${tile.tileBorderRadius}px`;
  decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
}
```

Now the CSS custom property is properly set, allowing the `!important` rules in the CSS to apply the custom border radius.

### Result
✅ Local border radius settings are now properly respected  
✅ Global border radius (`0.75rem`) is used when no local radius is set  
✅ CSS `!important` rules work correctly with both local and global values  

---

**Files Modified:**
- `components/TileGrid.tsx` (lines 1019-1132)
- `index.css` (lines 66, 115, 145)

**Date:** January 27, 2026
