# Tile Animations Feature

## Overview
The Tile Animations feature allows users (both authenticated and public) to customize how tiles appear on the page with smooth, professional animations. The selected animation preference is stored in the browser's localStorage for persistence across sessions.

## Features

### 15 Animation Options
Users can choose from 15 different animation styles:

1. **None** - No animation
2. **Fade In** - Gentle fade in effect
3. **Slide Up** - Slide from bottom
4. **Slide Down** - Slide from top
5. **Slide Left** - Slide from right
6. **Slide Right** - Slide from left
7. **Zoom In** - Scale up effect
8. **Zoom Out** - Scale down effect
9. **Flip Horizontal** - Flip on X axis
10. **Flip Vertical** - Flip on Y axis
11. **Bounce** - Bouncy entrance
12. **Rotate In** - Rotate while entering
13. **Swing** - Swing from top
14. **Pulse** - Pulsing effect
15. **Shake** - Shake effect

### User Interface
- **Animation Selector Button**: Located next to the search bar, accessible to all users
- **Visual Preview**: Each animation option shows an icon and description
- **Instant Replay**: Users can replay animations to preview their selection
- **Persistent Selection**: Chosen animation is saved to localStorage

### Technical Implementation

#### Components
- **TileAnimationSelector.tsx**: Main selector component with dropdown UI
- **useTileAnimation Hook**: Custom hook to retrieve the current animation preference
- **getTileAnimationClass Function**: Helper to convert animation type to CSS class

#### CSS Animations
All animations are defined in `index.css` with:
- Smooth, professional easing curves
- Staggered delays based on tile position
- Optimized performance with GPU-accelerated transforms

#### Storage
- **Key**: `linknest_tile_animation`
- **Location**: Browser localStorage
- **Default**: `fade-in`

## Usage

### For Users
1. Click the Animation button (with emoji icon) in the top toolbar
2. Browse through the available animation options
3. Click on your preferred animation
4. The selection is automatically saved and applied to all tiles
5. Use the "Replay" button to preview the animation again

### For Developers

#### Importing the Components
```typescript
import { TileAnimationSelector, useTileAnimation, getTileAnimationClass } from './components/TileAnimationSelector';
```

#### Using the Hook
```typescript
const currentAnimation = useTileAnimation();
const animationClass = getTileAnimationClass(currentAnimation);
```

#### Applying to Elements
```typescript
<div className={`tile ${animationClass}`}>
  {/* Tile content */}
</div>
```

## Browser Compatibility
- All modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful degradation for browsers without animation support
- No JavaScript required for animations (CSS-only)

## Performance
- Animations use CSS transforms and opacity for GPU acceleration
- No layout thrashing or reflows
- Minimal impact on page load time
- Animations complete within 0.5-0.8 seconds

## Accessibility
- Animations respect user's motion preferences
- Keyboard accessible selector
- Clear visual feedback for selection
- No essential information conveyed through animation alone
