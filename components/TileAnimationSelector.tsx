import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { preferenceService } from '../services/preferenceService';
import { useAuth } from '../contexts/AuthContext';

export type TileAnimation =
    | 'inherit'
    | 'none'
    | 'fade-in'
    | 'slide-up'
    | 'slide-down'
    | 'slide-left'
    | 'slide-right'
    | 'zoom-in'
    | 'zoom-out'
    | 'flip-x'
    | 'flip-y'
    | 'bounce'
    | 'rotate-in'
    | 'swing'
    | 'pulse'
    | 'shake'
    | 'blur-in'
    | 'roll-in'
    | 'jack-in-the-box'
    | 'back-in-down'
    | 'back-in-up'
    | 'reveal'
    | 'jello'
    | 'rubber-band'
    | 'tada'
    | 'flash'
    | 'zoom-in-up'
    | 'zoom-in-down'
    | 'wave'
    | 'glitch'
    | 'twirl'
    | 'skid'
    | 'spiral'
    | 'bounce-in-right'
    | 'bounce-in-left'
    | 'flip-3d'
    | 'wobble'
    | 'heartbeat'
    | 'puff-in'
    | 'drop'
    | 'swing-in'
    | 'blur-slide-left'
    | 'blur-slide-right'
    | 'neon-flicker'
    | 'focus-reveal'
    | 'perspective-in'
    | 'blink'
    | 'elastic'
    | 'zoom-in-left'
    | 'zoom-in-right'
    | 'slide-in-down-left'
    | 'slide-in-down-right'
    | 'slide-in-up-left'
    | 'slide-in-up-right'
    | 'rotate-in-down-left'
    | 'rotate-in-down-right'
    | 'rotate-in-up-left'
    | 'rotate-in-up-right'
    | 'light-speed-in-right'
    | 'light-speed-in-left'
    | 'swing-in-left'
    | 'swing-in-right'
    | 'roll-in-bottom'
    | 'roll-in-top'
    | 'back-in-left'
    | 'back-in-right'
    | 'stretch-in-hor'
    | 'stretch-in-ver'
    | 'bounce-in-up'
    | 'bounce-in-down'
    | 'jelly'
    | 'star-in'
    | 'flare-in'
    | 'beam-in'
    | 'teleport'
    | 'shimmer-in'
    | 'tilt-in'
    | 'magnify'
    | 'blur-in-up'
    | 'blur-in-down'
    | 'pop-in'
    | 'unfold-in'
    | 'fold-in'
    | 'slot-in'
    | 'newspaper'
    | 'carousel-in'
    | 'cube-in'
    | 'stack-in'
    | 'door-in'
    | 'ghost-in'
    | 'glitch-2'
    | 'neon-pulse'
    | 'vibrate'
    | 'bounce-top'
    | 'bounce-bottom'
    | 'bounce-left'
    | 'bounce-right'
    | 'squish'
    | 'slide-tilt'
    | 'swirl-in'
    | 'blur-perspective'
    | 'liquid-in' | 'smoke-in' | 'fire-in' | 'pixel-in' | 'mosaic-in' | 'shatter-in' | 'crack-in' | 'dissolve-in' | 'evaporate-in' | 'crystallize-in'
    | 'gravity-in' | 'magnet-in' | 'vortex-in' | 'black-hole-in' | 'warp-in' | 'hyper-jump-in' | 'time-warp-in' | 'dimension-shift-in' | 'phase-in' | 'ghost-fade-in'
    | 'neon-flicker-3' | 'cyber-scan-in' | 'code-reveal-in' | 'binary-in' | 'matrix-in' | 'data-stream-in' | 'circuit-in' | 'pulse-glow-in' | 'hologram-in' | 'static-in'
    | 'bounce-elastic-up' | 'bounce-elastic-down' | 'bounce-elastic-left' | 'bounce-elastic-right' | 'spring-in-up' | 'spring-in-down' | 'spring-in-left' | 'spring-in-right' | 'rubber-band-2' | 'bungee-in'
    | 'slide-rotate-in-tl' | 'slide-rotate-in-tr' | 'slide-rotate-in-bl' | 'slide-rotate-in-br' | 'zoom-rotate-in' | 'flip-rotate-in' | 'swing-rotate-in' | 'bounce-rotate-in' | 'roll-rotate-in' | 'twirl-rotate-in'
    | 'split-v-in' | 'split-h-in' | 'blind-v-in' | 'blind-h-in' | 'checker-in' | 'diagonal-in' | 'diamond-in' | 'circle-in' | 'square-in' | 'star-reveal-in'
    | 'pop-out-in-2' | 'expand-in' | 'contract-reveal-in' | 'bounce-scale-in' | 'elastic-scale-in' | 'swing-scale-in' | 'roll-scale-in' | 'twirl-scale-in' | 'spiral-scale-in' | 'wave-scale-in'
    | 'blur-swipe-up' | 'blur-swipe-down' | 'blur-swipe-left' | 'blur-swipe-right' | 'focus-swipe-in' | 'glow-swipe-in' | 'color-swipe-in' | 'mask-swipe-in' | 'gradient-swipe-in' | 'texture-swipe-in'
    | 'skid-up' | 'skid-down' | 'skid-left' | 'skid-right' | 'drift-in' | 'brake-in' | 'accelerate-in' | 'cruise-in' | 'jump-in' | 'dive-in'
    | 'heartbeat-2' | 'breathing-in' | 'flutter-in' | 'vibrate-fast' | 'jiggle-in' | 'wiggle-in' | 'tremble-in' | 'throb-in' | 'pulse-burst-in' | 'finale-mega-in'
    | 'leaf-drop' | 'feather-float' | 'snow-settle' | 'petal-fall' | 'dust-settle' | 'silk-drape' | 'velvet-slide' | 'cotton-drift' | 'mist-descend' | 'dew-form'
    | 'water-ripple' | 'pond-ripple' | 'lake-calm' | 'ocean-swell' | 'tide-in' | 'wave-gentle' | 'stream-flow' | 'rain-drop' | 'drizzle-in' | 'puddle-form'
    | 'cloud-drift' | 'fog-roll' | 'haze-settle' | 'vapor-rise' | 'smoke-curl' | 'steam-wisp' | 'breeze-sway' | 'wind-gentle' | 'air-float' | 'bubble-rise'
    | 'honey-drip' | 'syrup-pour' | 'oil-spread' | 'ink-diffuse' | 'paint-blend' | 'watercolor-bleed' | 'gradient-wash' | 'color-fade' | 'tint-spread' | 'shade-deepen'
    | 'sand-pour' | 'grain-settle' | 'powder-dust' | 'ash-fall' | 'ember-fade' | 'glow-dim' | 'light-soften' | 'shadow-lengthen' | 'dusk-settle' | 'dawn-break'
    | 'silk-unfurl' | 'ribbon-wave' | 'fabric-billow' | 'curtain-sway' | 'banner-flutter' | 'flag-ripple' | 'cloth-settle' | 'veil-lift' | 'scarf-drift' | 'sheet-float'
    | 'paper-glide' | 'page-turn' | 'book-open' | 'scroll-unfurl' | 'origami-fold' | 'card-flip-slow' | 'letter-settle' | 'note-drift' | 'document-slide' | 'parchment-roll'
    | 'ice-melt' | 'frost-form' | 'crystal-grow' | 'snowflake-settle' | 'icicle-drip' | 'glacier-shift' | 'frozen-thaw' | 'chill-spread' | 'winter-breath' | 'arctic-drift'
    | 'zen-settle' | 'meditation-calm' | 'peaceful-rest' | 'tranquil-ease' | 'serene-float' | 'harmony-balance' | 'gentle-rest' | 'soft-landing' | 'calm-descent' | 'quiet-settle';

export type TileDecoration =
    | 'none'
    | 'christmas'
    | 'thanksgiving'
    | 'veterans'
    | 'halloween'
    | 'new-year'
    | 'valentine'
    | 'st-patrick'
    | 'easter'
    | 'birthday'
    | 'party'
    | 'snow'
    | 'autumn'
    | 'spring'
    | 'summer';

interface AnimationOption {
    id: TileAnimation;
    name: string;
    description: string;
    icon: string;
}

interface DecorationOption {
    id: TileDecoration;
    name: string;
    description: string;
    icon: string;
}

const INHERIT_OPTION: AnimationOption = {
    id: 'inherit',
    name: 'Inherit',
    description: 'Use space default for all links',
    icon: '↩️',
};

const ANIMATION_OPTIONS: AnimationOption[] = [
    { id: 'none', name: 'None', description: 'No animation', icon: '⭕' },
    { id: 'fade-in', name: 'Fade In', description: 'Gentle fade in effect', icon: '✨' },
    { id: 'slide-up', name: 'Slide Up', description: 'Slide from bottom', icon: '⬆️' },
    { id: 'slide-down', name: 'Slide Down', description: 'Slide from top', icon: '⬇️' },
    { id: 'slide-left', name: 'Slide Left', description: 'Slide from right', icon: '⬅️' },
    { id: 'slide-right', name: 'Slide Right', description: 'Slide from left', icon: '➡️' },
    { id: 'zoom-in', name: 'Zoom In', description: 'Scale up effect', icon: '🔍' },
    { id: 'zoom-out', name: 'Zoom Out', description: 'Scale down effect', icon: '🔎' },
    { id: 'flip-x', name: 'Flip Horizontal', description: 'Flip on X axis', icon: '🔄' },
    { id: 'flip-y', name: 'Flip Vertical', description: 'Flip on Y axis', icon: '🔃' },
    { id: 'bounce', name: 'Bounce', description: 'Bouncy entrance', icon: '🎾' },
    { id: 'rotate-in', name: 'Rotate In', description: 'Rotate while entering', icon: '🌀' },
    { id: 'swing', name: 'Swing', description: 'Swing from top', icon: '🎪' },
    { id: 'pulse', name: 'Pulse', description: 'Pulsing effect', icon: '💓' },
    { id: 'shake', name: 'Shake', description: 'Shake effect', icon: '📳' },
    { id: 'blur-in', name: 'Blur In', description: 'Fade with blur', icon: '🌫️' },
    { id: 'roll-in', name: 'Roll In', description: 'Roll from left', icon: '🗞️' },
    { id: 'jack-in-the-box', name: 'Jack Box', description: 'Pop out effect', icon: '🎁' },
    { id: 'back-in-down', name: 'Back In Down', description: 'Slide down with back', icon: '⏬' },
    { id: 'back-in-up', name: 'Back In Up', description: 'Slide up with back', icon: '⏫' },
    { id: 'reveal', name: 'Reveal', description: 'Wipe uncover', icon: '🎭' },
    { id: 'jello', name: 'Jello', description: 'Wobbly entrance', icon: '🍮' },
    { id: 'rubber-band', name: 'Rubber Band', description: 'Stretch & squeeze', icon: '🪁' },
    { id: 'tada', name: 'Tada', description: 'Celebration shake', icon: '🎉' },
    { id: 'flash', name: 'Flash', description: 'Flashing entrance', icon: '📸' },
    { id: 'zoom-in-up', name: 'Zoom In Up', description: 'Zoom from bottom', icon: '↗️' },
    { id: 'zoom-in-down', name: 'Zoom In Down', description: 'Zoom from top', icon: '↘️' },
    { id: 'wave', name: 'Wave', description: 'Wave entrance', icon: '🌊' },
    { id: 'glitch', name: 'Glitch', description: 'Digital breakdown', icon: '👾' },
    { id: 'twirl', name: 'Twirl', description: 'Spinning entrance', icon: '🌪️' },
    { id: 'skid', name: 'Skid', description: 'Brake to stop', icon: '🏎️' },
    { id: 'spiral', name: 'Spiral', description: 'Vortex entrance', icon: '🌀' },
    { id: 'bounce-in-right', name: 'Bounce Right', description: 'Bounce from right', icon: '🏀' },
    { id: 'bounce-in-left', name: 'Bounce Left', description: 'Bounce from left', icon: '🏀' },
    { id: 'flip-3d', name: 'Flip 3D', description: '3D perspective flip', icon: '🧊' },
    { id: 'wobble', name: 'Wobble', description: 'Wobbling entrance', icon: '🍮' },
    { id: 'heartbeat', name: 'Heartbeat', description: 'Rhythmic pulse', icon: '💓' },
    { id: 'puff-in', name: 'Puff In', description: 'Smoke puff effect', icon: '💨' },
    { id: 'drop', name: 'Drop', description: 'Fall and stop', icon: '💧' },
    { id: 'swing-in', name: 'Swing In', description: 'Swing from top', icon: '🎢' },
    { id: 'blur-slide-left', name: 'Blur Left', description: 'Blurred slide left', icon: '🌫️' },
    { id: 'blur-slide-right', name: 'Blur Right', description: 'Blurred slide right', icon: '🌫️' },
    { id: 'neon-flicker', name: 'Neon', description: 'Flickering light', icon: '💡' },
    { id: 'focus-reveal', name: 'Focus', description: 'Blur focus reveal', icon: '👁️' },
    { id: 'perspective-in', name: 'Perspective', description: '3D Tilt entrance', icon: '🖼️' },
    { id: 'blink', name: 'Blink', description: 'Fast flash', icon: '✨' },
    { id: 'elastic', name: 'Elastic', description: 'Sling-shot effect', icon: '🏹' },
    { id: 'zoom-in-left', name: 'Zoom In Left', description: 'Zoom from right', icon: '🔍' },
    { id: 'zoom-in-right', name: 'Zoom In Right', description: 'Zoom from left', icon: '🔎' },
    { id: 'slide-in-down-left', name: 'Slide Down Left', description: 'Slide from top-right', icon: '↙️' },
    { id: 'slide-in-down-right', name: 'Slide Down Right', description: 'Slide from top-left', icon: '↘️' },
    { id: 'slide-in-up-left', name: 'Slide Up Left', description: 'Slide from bottom-right', icon: '↖️' },
    { id: 'slide-in-up-right', name: 'Slide Up Right', description: 'Slide from bottom-left', icon: '↗️' },
    { id: 'rotate-in-down-left', name: 'Rotate Down Left', description: 'Rotate from top-left', icon: '↩️' },
    { id: 'rotate-in-down-right', name: 'Rotate Down Right', description: 'Rotate from top-right', icon: '↪️' },
    { id: 'rotate-in-up-left', name: 'Rotate Up Left', description: 'Rotate from bottom-left', icon: '⤴️' },
    { id: 'rotate-in-up-right', name: 'Rotate Up Right', description: 'Rotate from bottom-right', icon: '⤵️' },
    { id: 'light-speed-in-right', name: 'Light Speed R', description: 'Enter from right fast', icon: '🚄' },
    { id: 'light-speed-in-left', name: 'Light Speed L', description: 'Enter from left fast', icon: '🚄' },
    { id: 'swing-in-left', name: 'Swing In Left', description: 'Swing from left side', icon: '🚪' },
    { id: 'swing-in-right', name: 'Swing In Right', description: 'Swing from right side', icon: '🚪' },
    { id: 'roll-in-bottom', name: 'Roll In Bottom', description: 'Roll in from bottom', icon: '🦵' },
    { id: 'roll-in-top', name: 'Roll In Top', description: 'Roll in from top', icon: '🧢' },
    { id: 'back-in-left', name: 'Back In Left', description: 'Slide back from left', icon: '⏮️' },
    { id: 'back-in-right', name: 'Back In Right', description: 'Slide back from right', icon: '⏭️' },
    { id: 'stretch-in-hor', name: 'Stretch Hor', description: 'Stretch horizontally', icon: '↔️' },
    { id: 'stretch-in-ver', name: 'Stretch Ver', description: 'Stretch vertically', icon: '↕️' },
    { id: 'bounce-in-up', name: 'Bounce In Up', description: 'Bounce from bottom', icon: '🔝' },
    { id: 'bounce-in-down', name: 'Bounce In Down', description: 'Bounce from top', icon: '🔚' },
    { id: 'jelly', name: 'Jelly', description: 'Jelly wobble', icon: '🍮' },
    { id: 'star-in', name: 'Star In', description: 'Spin in like star', icon: '⭐' },
    { id: 'flare-in', name: 'Flare In', description: 'Bright flare entrance', icon: '🕯️' },
    { id: 'beam-in', name: 'Beam In', description: 'Beam of light reveal', icon: '🔦' },
    { id: 'teleport', name: 'Teleport', description: 'Instant appearance', icon: '⚛️' },
    { id: 'shimmer-in', name: 'Shimmer In', description: 'Sparkle entrance', icon: '💎' },
    { id: 'tilt-in', name: 'Tilt In', description: 'Tilt reveal', icon: '📐' },
    { id: 'magnify', name: 'Magnify', description: 'Grow from center', icon: '🔎' },
    { id: 'blur-in-up', name: 'Blur In Up', description: 'Blur from bottom', icon: '🌫️' },
    { id: 'blur-in-down', name: 'Blur In Down', description: 'Blur from top', icon: '🌫️' },
    { id: 'pop-in', name: 'Pop In', description: 'Sudden expansion', icon: '💥' },
    { id: 'unfold-in', name: 'Unfold In', description: 'Unfold like paper', icon: '📖' },
    { id: 'fold-in', name: 'Fold In', description: 'Fold into place', icon: '📁' },
    { id: 'slot-in', name: 'Slot In', description: 'Slot machine reveal', icon: '🎰' },
    { id: 'newspaper', name: 'Newspaper', description: 'Spin and grow', icon: '📰' },
    { id: 'carousel-in', name: 'Carousel In', description: 'Rotate in circle', icon: '🎡' },
    { id: 'cube-in', name: 'Cube In', description: 'Rotate like cube', icon: '🧊' },
    { id: 'stack-in', name: 'Stack In', description: 'Stack from back', icon: '📚' },
    { id: 'door-in', name: 'Door In', description: 'Open like door', icon: '🚪' },
    { id: 'ghost-in', name: 'Ghost In', description: 'Fade from transparent', icon: '👻' },
    { id: 'glitch-2', name: 'Glitch 2', description: 'Static glitch', icon: '💻' },
    { id: 'neon-pulse', name: 'Neon Pulse', description: 'Glowing pulse', icon: '🌈' },
    { id: 'vibrate', name: 'Vibrate', description: 'High speed shake', icon: '📳' },
    { id: 'bounce-top', name: 'Bounce Top', description: 'Bounce at top', icon: '⏫' },
    { id: 'bounce-bottom', name: 'Bounce Bottom', description: 'Bounce at bottom', icon: '⏬' },
    { id: 'bounce-left', name: 'Bounce Left', description: 'Bounce at left', icon: '⏪' },
    { id: 'bounce-right', name: 'Bounce Right', description: 'Bounce at right', icon: '⏩' },
    { id: 'squish', name: 'Squish', description: 'Squish and pop', icon: '🎈' },
    { id: 'slide-tilt', name: 'Slide Tilt', description: 'Tilt while sliding', icon: '📐' },
    { id: 'swirl-in', name: 'Swirl In', description: 'Swirling reveal', icon: '🍭' },
    { id: 'blur-perspective', name: 'Blur Perspective', description: '3D blur reveal', icon: '🔭' },
    { id: 'liquid-in', name: 'Liquid In', description: 'Fluent entrance', icon: '💧' },
    { id: 'smoke-in', name: 'Smoke In', description: 'Misty appearance', icon: '🌫️' },
    { id: 'fire-in', name: 'Fire In', description: 'Burn in effect', icon: '🔥' },
    { id: 'pixel-in', name: 'Pixel In', description: 'Digital pixelation', icon: '👾' },
    { id: 'mosaic-in', name: 'Mosaic In', description: 'Tiles assembly', icon: '🧱' },
    { id: 'shatter-in', name: 'Shatter In', description: 'Fragment assembly', icon: '💎' },
    { id: 'crack-in', name: 'Crack In', description: 'Break into place', icon: '🔨' },
    { id: 'dissolve-in', name: 'Dissolve In', description: 'Particle transition', icon: '🌫️' },
    { id: 'evaporate-in', name: 'Evaporate In', description: 'Steam reveal', icon: '♨️' },
    { id: 'crystallize-in', name: 'Crystallize', description: 'Crystal growth', icon: '❄️' },
    { id: 'gravity-in', name: 'Gravity In', description: 'Heavy drop', icon: '🌌' },
    { id: 'magnet-in', name: 'Magnet In', description: 'Magnetic pull', icon: '🧲' },
    { id: 'vortex-in', name: 'Vortex In', description: 'Whirlpool effect', icon: '🌀' },
    { id: 'black-hole-in', name: 'Black Hole', description: 'Spacial distortion', icon: '⚫' },
    { id: 'warp-in', name: 'Warp In', description: 'Space warp', icon: '🚀' },
    { id: 'hyper-jump-in', name: 'Hyper Jump', description: 'Light speed jump', icon: '🌌' },
    { id: 'time-warp-in', name: 'Time Warp', description: 'Chrono distortion', icon: '⏳' },
    { id: 'dimension-shift-in', name: 'Dimensions', description: 'Phase shift', icon: '🌌' },
    { id: 'phase-in', name: 'Phase In', description: 'Quantum phase', icon: '🔬' },
    { id: 'ghost-fade-in', name: 'Ghost Fade', description: 'Spectral reveal', icon: '👻' },
    { id: 'neon-flicker-3', name: 'Neon Fast', description: 'Cyber flicker', icon: '💡' },
    { id: 'cyber-scan-in', name: 'Cyber Scan', description: 'Laser scanning', icon: '📡' },
    { id: 'code-reveal-in', name: 'Code Reveal', description: 'Terminal style', icon: '💻' },
    { id: 'binary-in', name: 'Binary In', description: 'Bitstream reveal', icon: '🔢' },
    { id: 'matrix-in', name: 'Matrix In', description: 'Digital rain', icon: '🟢' },
    { id: 'data-stream-in', name: 'Data Stream', description: 'Packet assembly', icon: '📦' },
    { id: 'circuit-in', name: 'Circuit In', description: 'PCB path reveal', icon: '🔌' },
    { id: 'pulse-glow-in', name: 'Pulse Glow', description: 'Radiant pulse', icon: '🌟' },
    { id: 'hologram-in', name: 'Hologram', description: 'Projected reveal', icon: '📡' },
    { id: 'static-in', name: 'Static In', description: 'TV static effect', icon: '📺' },
    { id: 'bounce-elastic-up', name: 'Bounce El. U', description: 'Elastic bounce up', icon: '⬆️' },
    { id: 'bounce-elastic-down', name: 'Bounce El. D', description: 'Elastic bounce down', icon: '⬇️' },
    { id: 'bounce-elastic-left', name: 'Bounce El. L', description: 'Elastic bounce left', icon: '⬅️' },
    { id: 'bounce-elastic-right', name: 'Bounce El. R', description: 'Elastic bounce right', icon: '➡️' },
    { id: 'spring-in-up', name: 'Spring Up', description: 'Spring from bottom', icon: '🌱' },
    { id: 'spring-in-down', name: 'Spring Down', description: 'Spring from top', icon: '🌱' },
    { id: 'spring-in-left', name: 'Spring Left', description: 'Spring from right', icon: '🌱' },
    { id: 'spring-in-right', name: 'Spring Right', description: 'Spring from left', icon: '🌱' },
    { id: 'rubber-band-2', name: 'Rubber 2', description: 'Vibrant stretch', icon: '🪁' },
    { id: 'bungee-in', name: 'Bungee In', description: 'Bungee jump reveal', icon: '🪂' },
    { id: 'slide-rotate-in-tl', name: 'Slide Rot TL', description: 'Corner rotate in', icon: '↖️' },
    { id: 'slide-rotate-in-tr', name: 'Slide Rot TR', description: 'Corner rotate in', icon: '↗️' },
    { id: 'slide-rotate-in-bl', name: 'Slide Rot BL', description: 'Corner rotate in', icon: '↙️' },
    { id: 'slide-rotate-in-br', name: 'Slide Rot BR', description: 'Corner rotate in', icon: '↘️' },
    { id: 'zoom-rotate-in', name: 'Zoom Rotate', description: 'Scale & spin', icon: '🌀' },
    { id: 'flip-rotate-in', name: 'Flip Rotate', description: '3D spin reveal', icon: '🔄' },
    { id: 'swing-rotate-in', name: 'Swing Rotate', description: 'Pendulum spin', icon: '🎠' },
    { id: 'bounce-rotate-in', name: 'Bounce Rot', description: 'Bouncy spin', icon: '🏀' },
    { id: 'roll-rotate-in', name: 'Roll Rotate', description: 'Rolling spin', icon: '🗞️' },
    { id: 'twirl-rotate-in', name: 'Twirl Rot', description: 'Vortex spin', icon: '🌪️' },
    { id: 'split-v-in', name: 'Split V', description: 'Vertical split', icon: '↕️' },
    { id: 'split-h-in', name: 'Split H', description: 'Horizontal split', icon: '↔️' },
    { id: 'blind-v-in', name: 'Blind V', description: 'Vertical blinds', icon: '🚪' },
    { id: 'blind-h-in', name: 'Blind H', description: 'Horizontal blinds', icon: '🚪' },
    { id: 'checker-in', name: 'Checker In', description: 'Pattern assembly', icon: '🏁' },
    { id: 'diagonal-in', name: 'Diagonal In', description: 'Corner sweep', icon: '📐' },
    { id: 'diamond-in', name: 'Diamond In', description: 'Diamond shape', icon: '💎' },
    { id: 'circle-in', name: 'Circle In', description: 'Radial reveal', icon: '⭕' },
    { id: 'square-in', name: 'Square In', description: 'Box reveal', icon: '⬜' },
    { id: 'star-reveal-in', name: 'Star Reveal', description: 'Star shape', icon: '⭐' },
    { id: 'pop-out-in-2', name: 'Pop 2', description: 'Explosive pop', icon: '💥' },
    { id: 'expand-in', name: 'Expand In', description: 'Sudden growth', icon: '📈' },
    { id: 'contract-reveal-in', name: 'Contract In', description: 'Focus scale', icon: '📉' },
    { id: 'bounce-scale-in', name: 'Bounce Scale', description: 'Bouncy growth', icon: '🔝' },
    { id: 'elastic-scale-in', name: 'Elastic Scale', description: 'Spring growth', icon: '🏹' },
    { id: 'swing-scale-in', name: 'Swing Scale', description: 'Pendulum growth', icon: '🎠' },
    { id: 'roll-scale-in', name: 'Roll Scale', description: 'Rolling growth', icon: '🗞️' },
    { id: 'twirl-scale-in', name: 'Twirl Scale', description: 'Spinning growth', icon: '🌪️' },
    { id: 'spiral-scale-in', name: 'Spiral Scale', description: 'Vortex growth', icon: '🌀' },
    { id: 'wave-scale-in', name: 'Wave Scale', description: 'Fluctuating growth', icon: '🌊' },
    { id: 'blur-swipe-up', name: 'Blur Swi U', description: 'Blurred sweep up', icon: '⬆️' },
    { id: 'blur-swipe-down', name: 'Blur Swi D', description: 'Blurred sweep down', icon: '⬇️' },
    { id: 'blur-swipe-left', name: 'Blur Swi L', description: 'Blurred sweep left', icon: '⬅️' },
    { id: 'blur-swipe-right', name: 'Blur Swi R', description: 'Blurred sweep right', icon: '➡️' },
    { id: 'focus-swipe-in', name: 'Focus Swipe', description: 'Sharp sweep', icon: '👁️' },
    { id: 'glow-swipe-in', name: 'Glow Swipe', description: 'Radiant sweep', icon: '🌟' },
    { id: 'color-swipe-in', name: 'Color Swipe', description: 'Vivid sweep', icon: '🌈' },
    { id: 'mask-swipe-in', name: 'Mask Swipe', description: 'Shape sweep', icon: '🎭' },
    { id: 'gradient-swipe-in', name: 'Grad. Swipe', description: 'Smooth sweep', icon: '🎨' },
    { id: 'texture-swipe-in', name: 'Text. Swipe', description: 'Detailed sweep', icon: '🧱' },
    { id: 'skid-up', name: 'Skid Up', description: 'Brake from bottom', icon: '🚀' },
    { id: 'skid-down', name: 'Skid Down', description: 'Brake from top', icon: '🚀' },
    { id: 'skid-left', name: 'Skid Left', description: 'Brake from right', icon: '🚀' },
    { id: 'skid-right', name: 'Skid Right', description: 'Brake from left', icon: '🚀' },
    { id: 'drift-in', name: 'Drift In', description: 'Smooth slide', icon: '🏎️' },
    { id: 'brake-in', name: 'Brake In', description: 'Hard stop', icon: '🛑' },
    { id: 'accelerate-in', name: 'Accelerate', description: 'Fast start', icon: '💨' },
    { id: 'cruise-in', name: 'Cruise In', description: 'Steady entry', icon: '🚢' },
    { id: 'jump-in', name: 'Jump In', description: 'Sudden leap', icon: '🦘' },
    { id: 'dive-in', name: 'Dive In', description: 'Deep entry', icon: '🤿' },
    { id: 'heartbeat-2', name: 'Heart 2', description: 'Fast beat', icon: '💓' },
    { id: 'breathing-in', name: 'Breathing', description: 'Natural pulse', icon: '🫁' },
    { id: 'flutter-in', name: 'Flutter In', description: 'Quick vibration', icon: '🦋' },
    { id: 'vibrate-fast', name: 'Vib. Fast', description: 'Hyper shake', icon: '📳' },
    { id: 'jiggle-in', name: 'Jiggle In', description: 'Soft wobble', icon: '🍮' },
    { id: 'wiggle-in', name: 'Wiggle In', description: 'Happy entry', icon: '🐕' },
    { id: 'tremble-in', name: 'Tremble In', description: 'Fine shake', icon: '🥶' },
    { id: 'throb-in', name: 'Throb In', description: 'Strong pulse', icon: '💓' },
    { id: 'pulse-burst-in', name: 'Pulse Burst', description: 'Explosive pulse', icon: '💥' },
    { id: 'finale-mega-in', name: 'Grand Finale', description: 'Ultimate reveal', icon: '🏆' },
    { id: 'leaf-drop', name: 'Leaf Drop', description: 'Gentle leaf falling', icon: '🍂' },
    { id: 'feather-float', name: 'Feather Float', description: 'Light as a feather', icon: '🪶' },
    { id: 'snow-settle', name: 'Snow Settle', description: 'Soft snow landing', icon: '❄️' },
    { id: 'petal-fall', name: 'Petal Fall', description: 'Flower petal drift', icon: '🌸' },
    { id: 'dust-settle', name: 'Dust Settle', description: 'Particles settling', icon: '✨' },
    { id: 'silk-drape', name: 'Silk Drape', description: 'Smooth silk flow', icon: '🎀' },
    { id: 'velvet-slide', name: 'Velvet Slide', description: 'Luxurious glide', icon: '🎭' },
    { id: 'cotton-drift', name: 'Cotton Drift', description: 'Soft cotton float', icon: '☁️' },
    { id: 'mist-descend', name: 'Mist Descend', description: 'Gentle mist fall', icon: '🌫️' },
    { id: 'dew-form', name: 'Dew Form', description: 'Morning dew appear', icon: '💧' },
    { id: 'water-ripple', name: 'Water Ripple', description: 'Rippling water', icon: '🌊' },
    { id: 'pond-ripple', name: 'Pond Ripple', description: 'Calm pond waves', icon: '💧' },
    { id: 'lake-calm', name: 'Lake Calm', description: 'Peaceful lake', icon: '🏞️' },
    { id: 'ocean-swell', name: 'Ocean Swell', description: 'Ocean wave rise', icon: '🌊' },
    { id: 'tide-in', name: 'Tide In', description: 'Tide coming in', icon: '🌊' },
    { id: 'wave-gentle', name: 'Wave Gentle', description: 'Soft wave motion', icon: '〰️' },
    { id: 'stream-flow', name: 'Stream Flow', description: 'Flowing stream', icon: '💧' },
    { id: 'rain-drop', name: 'Rain Drop', description: 'Single raindrop', icon: '💧' },
    { id: 'drizzle-in', name: 'Drizzle In', description: 'Light rain', icon: '🌧️' },
    { id: 'puddle-form', name: 'Puddle Form', description: 'Puddle forming', icon: '💧' },
    { id: 'cloud-drift', name: 'Cloud Drift', description: 'Cloud floating by', icon: '☁️' },
    { id: 'fog-roll', name: 'Fog Roll', description: 'Rolling fog', icon: '🌫️' },
    { id: 'haze-settle', name: 'Haze Settle', description: 'Hazy atmosphere', icon: '🌫️' },
    { id: 'vapor-rise', name: 'Vapor Rise', description: 'Steam rising', icon: '♨️' },
    { id: 'smoke-curl', name: 'Smoke Curl', description: 'Curling smoke', icon: '💨' },
    { id: 'steam-wisp', name: 'Steam Wisp', description: 'Wispy steam', icon: '♨️' },
    { id: 'breeze-sway', name: 'Breeze Sway', description: 'Gentle breeze', icon: '🍃' },
    { id: 'wind-gentle', name: 'Wind Gentle', description: 'Soft wind', icon: '💨' },
    { id: 'air-float', name: 'Air Float', description: 'Floating on air', icon: '💨' },
    { id: 'bubble-rise', name: 'Bubble Rise', description: 'Bubble floating up', icon: '🫧' },
    { id: 'honey-drip', name: 'Honey Drip', description: 'Thick honey flow', icon: '🍯' },
    { id: 'syrup-pour', name: 'Syrup Pour', description: 'Syrup pouring', icon: '🥞' },
    { id: 'oil-spread', name: 'Oil Spread', description: 'Oil spreading', icon: '💧' },
    { id: 'ink-diffuse', name: 'Ink Diffuse', description: 'Ink in water', icon: '🖋️' },
    { id: 'paint-blend', name: 'Paint Blend', description: 'Paint mixing', icon: '🎨' },
    { id: 'watercolor-bleed', name: 'Watercolor', description: 'Watercolor bleed', icon: '🎨' },
    { id: 'gradient-wash', name: 'Gradient Wash', description: 'Color gradient', icon: '🌈' },
    { id: 'color-fade', name: 'Color Fade', description: 'Fading colors', icon: '🎨' },
    { id: 'tint-spread', name: 'Tint Spread', description: 'Tint spreading', icon: '🎨' },
    { id: 'shade-deepen', name: 'Shade Deepen', description: 'Deepening shade', icon: '🌑' },
    { id: 'sand-pour', name: 'Sand Pour', description: 'Sand pouring', icon: '⏳' },
    { id: 'grain-settle', name: 'Grain Settle', description: 'Grains settling', icon: '🌾' },
    { id: 'powder-dust', name: 'Powder Dust', description: 'Powder dusting', icon: '✨' },
    { id: 'ash-fall', name: 'Ash Fall', description: 'Ash falling', icon: '🌋' },
    { id: 'ember-fade', name: 'Ember Fade', description: 'Fading ember', icon: '🔥' },
    { id: 'glow-dim', name: 'Glow Dim', description: 'Dimming glow', icon: '💡' },
    { id: 'light-soften', name: 'Light Soften', description: 'Softening light', icon: '🕯️' },
    { id: 'shadow-lengthen', name: 'Shadow Grow', description: 'Shadow lengthens', icon: '🌒' },
    { id: 'dusk-settle', name: 'Dusk Settle', description: 'Evening falling', icon: '🌆' },
    { id: 'dawn-break', name: 'Dawn Break', description: 'Morning arrives', icon: '🌅' },
    { id: 'silk-unfurl', name: 'Silk Unfurl', description: 'Silk unfolding', icon: '🎀' },
    { id: 'ribbon-wave', name: 'Ribbon Wave', description: 'Ribbon waving', icon: '🎀' },
    { id: 'fabric-billow', name: 'Fabric Billow', description: 'Fabric billowing', icon: '👗' },
    { id: 'curtain-sway', name: 'Curtain Sway', description: 'Curtain swaying', icon: '🪟' },
    { id: 'banner-flutter', name: 'Banner Flutter', description: 'Banner fluttering', icon: '🚩' },
    { id: 'flag-ripple', name: 'Flag Ripple', description: 'Flag rippling', icon: '🏴' },
    { id: 'cloth-settle', name: 'Cloth Settle', description: 'Cloth settling', icon: '🧺' },
    { id: 'veil-lift', name: 'Veil Lift', description: 'Veil lifting', icon: '👰' },
    { id: 'scarf-drift', name: 'Scarf Drift', description: 'Scarf drifting', icon: '🧣' },
    { id: 'sheet-float', name: 'Sheet Float', description: 'Sheet floating', icon: '🛏️' },
    { id: 'paper-glide', name: 'Paper Glide', description: 'Paper gliding', icon: '📄' },
    { id: 'page-turn', name: 'Page Turn', description: 'Page turning', icon: '📖' },
    { id: 'book-open', name: 'Book Open', description: 'Book opening', icon: '📚' },
    { id: 'scroll-unfurl', name: 'Scroll Unfurl', description: 'Scroll unrolling', icon: '📜' },
    { id: 'origami-fold', name: 'Origami Fold', description: 'Origami folding', icon: '🦢' },
    { id: 'card-flip-slow', name: 'Card Flip', description: 'Slow card flip', icon: '🃏' },
    { id: 'letter-settle', name: 'Letter Settle', description: 'Letter landing', icon: '✉️' },
    { id: 'note-drift', name: 'Note Drift', description: 'Note drifting', icon: '📝' },
    { id: 'document-slide', name: 'Document Slide', description: 'Document sliding', icon: '📄' },
    { id: 'parchment-roll', name: 'Parchment Roll', description: 'Parchment rolling', icon: '📜' },
    { id: 'ice-melt', name: 'Ice Melt', description: 'Ice melting', icon: '🧊' },
    { id: 'frost-form', name: 'Frost Form', description: 'Frost forming', icon: '❄️' },
    { id: 'crystal-grow', name: 'Crystal Grow', description: 'Crystal growing', icon: '💎' },
    { id: 'snowflake-settle', name: 'Snowflake', description: 'Snowflake landing', icon: '❄️' },
    { id: 'icicle-drip', name: 'Icicle Drip', description: 'Icicle dripping', icon: '🧊' },
    { id: 'glacier-shift', name: 'Glacier Shift', description: 'Glacier moving', icon: '🏔️' },
    { id: 'frozen-thaw', name: 'Frozen Thaw', description: 'Ice thawing', icon: '🧊' },
    { id: 'chill-spread', name: 'Chill Spread', description: 'Cold spreading', icon: '❄️' },
    { id: 'winter-breath', name: 'Winter Breath', description: 'Frosty breath', icon: '🌬️' },
    { id: 'arctic-drift', name: 'Arctic Drift', description: 'Arctic wind', icon: '🧊' },
    { id: 'zen-settle', name: 'Zen Settle', description: 'Zen calmness', icon: '🧘' },
    { id: 'meditation-calm', name: 'Meditation', description: 'Meditative calm', icon: '🕉️' },
    { id: 'peaceful-rest', name: 'Peaceful Rest', description: 'Peaceful resting', icon: '☮️' },
    { id: 'tranquil-ease', name: 'Tranquil Ease', description: 'Tranquil motion', icon: '🌊' },
    { id: 'serene-float', name: 'Serene Float', description: 'Serene floating', icon: '🕊️' },
    { id: 'harmony-balance', name: 'Harmony', description: 'Balanced harmony', icon: '☯️' },
    { id: 'gentle-rest', name: 'Gentle Rest', description: 'Gentle resting', icon: '🌙' },
    { id: 'soft-landing', name: 'Soft Landing', description: 'Soft touchdown', icon: '🪂' },
    { id: 'calm-descent', name: 'Calm Descent', description: 'Calm descending', icon: '🍃' },
    { id: 'quiet-settle', name: 'Quiet Settle', description: 'Quiet settling', icon: '🤫' },
];

const DECORATION_OPTIONS: DecorationOption[] = [
    { id: 'none', name: 'None', description: 'No decoration', icon: '⭕' },
    { id: 'christmas', name: 'Christmas', description: 'Santa hat decoration', icon: '🎅' },
    { id: 'thanksgiving', name: 'Thanksgiving', description: 'Turkey decoration', icon: '🦃' },
    { id: 'veterans', name: 'Veterans Day', description: 'Badge decoration', icon: '🎖️' },
    { id: 'halloween', name: 'Halloween', description: 'Pumpkin decoration', icon: '🎃' },
    { id: 'new-year', name: 'New Year', description: 'Fireworks decoration', icon: '🎆' },
    { id: 'valentine', name: 'Valentine', description: 'Heart decoration', icon: '💖' },
    { id: 'st-patrick', name: 'St. Patrick', description: 'Clover decoration', icon: '🍀' },
    { id: 'easter', name: 'Easter', description: 'Easter egg decoration', icon: '🥚' },
    { id: 'birthday', name: 'Birthday', description: 'Cake decoration', icon: '🎂' },
    { id: 'party', name: 'Party', description: 'Confetti decoration', icon: '🎉' },
    { id: 'snow', name: 'Winter', description: 'Snowflake decoration', icon: '❄️' },
    { id: 'autumn', name: 'Autumn', description: 'Maple leaf decoration', icon: '🍁' },
    { id: 'spring', name: 'Spring', description: 'Flower decoration', icon: '🌸' },
    { id: 'summer', name: 'Summer', description: 'Sun decoration', icon: '☀️' },
];

const ANIMATION_STORAGE_KEY = 'linknest_tile_animation';
const DECORATION_STORAGE_KEY = 'linknest_tile_decoration';

interface TileAnimationSelectorProps {
    onAnimationChange?: (animation: TileAnimation) => void;
    onDecorationChange?: (decoration: TileDecoration) => void;
    compact?: boolean;
    /** Controlled animation value (e.g. per-link selection). */
    value?: TileAnimation;
    /** When false, selection is local only and does not update global tile preferences. Default true. */
    persistGlobal?: boolean;
    /** Hide festive decorations tab (useful for per-link animation picker). */
    animationsOnly?: boolean;
    /** Show Inherit (space default) as the first choice — for per-link selectors. */
    includeInherit?: boolean;
    scopeLabel?: string;
    scopeHint?: string;
    buttonTitle?: string;
}

export const TileAnimationSelector: React.FC<TileAnimationSelectorProps> = ({
    onAnimationChange,
    onDecorationChange,
    compact = false,
    value,
    persistGlobal = true,
    animationsOnly = false,
    includeInherit = false,
    scopeLabel,
    scopeHint,
    buttonTitle,
}) => {
    const [selectedAnimation, setSelectedAnimation] = useState<TileAnimation>(
        value || (includeInherit ? 'inherit' : 'fade-in')
    );
    const [selectedDecoration, setSelectedDecoration] = useState<TileDecoration>('none');
    const [activeTab, setActiveTab] = useState<'animations' | 'decorations'>('animations');
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const { user } = useAuth();

    // Sync controlled value for local / per-item mode
    useEffect(() => {
        if (persistGlobal) return;
        if (includeInherit && (value === 'inherit' || !value)) {
            setSelectedAnimation('inherit');
        } else if (value && ANIMATION_OPTIONS.find(opt => opt.id === value)) {
            setSelectedAnimation(value);
        } else if (value === 'none' || !value) {
            setSelectedAnimation('none');
        }
    }, [persistGlobal, value, includeInherit]);

    // Load preferences from database or localStorage on mount (global mode only)
    useEffect(() => {
        if (!persistGlobal) {
            if (includeInherit && (value === 'inherit' || !value)) {
                setSelectedAnimation('inherit');
                return;
            }
            if (value && ANIMATION_OPTIONS.find(opt => opt.id === value)) {
                setSelectedAnimation(value);
                return;
            }
            setSelectedAnimation(includeInherit ? 'inherit' : 'none');
            return;
        }

        const loadPreferences = async () => {
            let anim: TileAnimation | null = null;
            let decor: TileDecoration | null = null;

            if (user) {
                // Try to load from database first
                try {
                    const prefs = await preferenceService.getPreferences();
                    if (prefs[ANIMATION_STORAGE_KEY]) {
                        anim = prefs[ANIMATION_STORAGE_KEY] as TileAnimation;
                    }
                    if (prefs[DECORATION_STORAGE_KEY]) {
                        decor = prefs[DECORATION_STORAGE_KEY] as TileDecoration;
                    }
                } catch (error) {
                    console.error('Failed to load preferences from database:', error);
                }
            }

            // Fallback to localStorage if not in database or guest
            if (!anim) {
                anim = localStorage.getItem(ANIMATION_STORAGE_KEY) as TileAnimation | null;
            }
            if (!decor) {
                decor = localStorage.getItem(DECORATION_STORAGE_KEY) as TileDecoration | null;
            }

            // Apply loaded values
            if (anim && ANIMATION_OPTIONS.find(opt => opt.id === anim)) {
                setSelectedAnimation(anim);
                onAnimationChange?.(anim);
            }

            if (decor && DECORATION_OPTIONS.find(opt => opt.id === decor)) {
                setSelectedDecoration(decor);
                onDecorationChange?.(decor);
            }
        };

        loadPreferences();

        // Listen for updates from other components or tabs
        const handleStorageChange = () => loadPreferences();

        const handleCustomAnimChange = (e: any) => {
            if (e.detail?.animation) setSelectedAnimation(e.detail.animation);
        };

        const handleCustomDecorChange = (e: any) => {
            if (e.detail?.decoration) setSelectedDecoration(e.detail.decoration);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('linknest-tile-animation-change', handleCustomAnimChange);
        window.addEventListener('linknest-tile-decoration-change', handleCustomDecorChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('linknest-tile-animation-change', handleCustomAnimChange);
            window.removeEventListener('linknest-tile-decoration-change', handleCustomDecorChange);
        };
    }, [user, onAnimationChange, onDecorationChange, persistGlobal, value]);

    // Update dropdown position when opened
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const dropdownWidth = 360;
            const viewportWidth = window.innerWidth;

            // Center the dropdown on mobile, or align to button on desktop
            let leftPosition;
            if (viewportWidth < 640) {
                // Mobile: center the dropdown
                leftPosition = (viewportWidth - dropdownWidth) / 2;
            } else {
                // Desktop: align to right edge of button, but ensure it doesn't go off-screen
                leftPosition = Math.min(
                    rect.right + window.scrollX - dropdownWidth,
                    viewportWidth - dropdownWidth - 16 // 16px margin from edge
                );
                leftPosition = Math.max(16, leftPosition); // Ensure 16px margin from left edge
            }

            setDropdownPosition({
                top: rect.bottom + window.scrollY + 8,
                left: leftPosition,
            });
        }
    }, [isOpen]);

    // Esc closes the animation/decoration picker on all screen sizes
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [isOpen]);

    const handleAnimationSelect = async (animation: TileAnimation) => {
        setSelectedAnimation(animation);
        if (persistGlobal) {
            localStorage.setItem(ANIMATION_STORAGE_KEY, animation);
            if (user) {
                try {
                    await preferenceService.updatePreferences({ [ANIMATION_STORAGE_KEY]: animation });
                } catch (error) {
                    console.error('Failed to save animation to database:', error);
                }
            }
            // Notify other components in the same window
            window.dispatchEvent(new CustomEvent('linknest-tile-animation-change', { detail: { animation } }));
        }
        onAnimationChange?.(animation);
    };

    const handleDecorationSelect = async (decoration: TileDecoration) => {
        setSelectedDecoration(decoration);
        if (persistGlobal) {
            localStorage.setItem(DECORATION_STORAGE_KEY, decoration);
            if (user) {
                try {
                    await preferenceService.updatePreferences({ [DECORATION_STORAGE_KEY]: decoration });
                } catch (error) {
                    console.error('Failed to save decoration to database:', error);
                }
            }
            // Notify other components in the same window
            window.dispatchEvent(new CustomEvent('linknest-tile-decoration-change', { detail: { decoration } }));
        }
        onDecorationChange?.(decoration);
    };

    const filteredAnimations = useMemo(() => {
        const query = searchQuery.toLowerCase();
        const options = includeInherit ? [INHERIT_OPTION, ...ANIMATION_OPTIONS] : ANIMATION_OPTIONS;
        return options.map((opt, index) => ({ ...opt, index: index + 1 })).filter(opt =>
            opt.name.toLowerCase().includes(query) ||
            opt.description.toLowerCase().includes(query) ||
            opt.index.toString() === query
        );
    }, [searchQuery, includeInherit]);

    const filteredDecorations = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return DECORATION_OPTIONS.map((opt, index) => ({ ...opt, index: index + 1 })).filter(opt =>
            opt.name.toLowerCase().includes(query) ||
            opt.description.toLowerCase().includes(query) ||
            opt.index.toString() === query
        );
    }, [searchQuery]);

    const allAnimationOptions = includeInherit ? [INHERIT_OPTION, ...ANIMATION_OPTIONS] : ANIMATION_OPTIONS;
    const selectedAnimationOption = allAnimationOptions.find(opt => opt.id === selectedAnimation) || allAnimationOptions[0];
    const selectedDecorationOption = DECORATION_OPTIONS.find(opt => opt.id === selectedDecoration) || DECORATION_OPTIONS[0];

    return (
        <>
            {/* Trigger Button */}
            <div className="flex items-center">
                <button
                    ref={buttonRef}
                    onClick={() => setIsOpen(!isOpen)}
                    className={compact
                        ? "p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all flex items-center justify-center"
                        : "flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all shadow-sm hover:shadow-md"
                    }
                    title={buttonTitle || (persistGlobal ? 'Select tile animation and decoration' : 'Select link animation')}
                >
                    {!compact && (
                        <>
                            <span className="text-lg">{selectedAnimationOption.icon}</span>
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    {persistGlobal ? 'Style' : 'Animation'}
                                </span>
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {selectedAnimationOption.name} {persistGlobal && selectedDecoration !== 'none' && `+ ${selectedDecorationOption.icon}`}
                                </span>
                            </div>
                        </>
                    )}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`${compact ? 'w-5 h-5' : 'w-4 h-4'} text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            {/* Dropdown Menu - Rendered via Portal */}
            {isOpen && createPortal(
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[9999]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Options Panel */}
                    <div
                        className="fixed w-[360px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[10000] overflow-hidden"
                        style={{
                            top: `${dropdownPosition.top}px`,
                            left: `${dropdownPosition.left}px`,
                        }}
                    >
                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setActiveTab('animations')}
                                className={`${animationsOnly ? 'w-full' : 'flex-1'} py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'animations'
                                    ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50 dark:bg-brand-500/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900'
                                    }`}
                            >
                                ✨ Animations ({ANIMATION_OPTIONS.length})
                            </button>
                            {!animationsOnly && (
                                <button
                                    onClick={() => setActiveTab('decorations')}
                                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'decorations'
                                        ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50 dark:bg-brand-500/5'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900'
                                        }`}
                                >
                                    🎄 Festive ({DECORATION_OPTIONS.length})
                                </button>
                            )}
                        </div>

                        {/* Search & Header */}
                        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-tighter text-brand-600 dark:text-brand-400">
                                    {scopeLabel || (persistGlobal ? 'Global Visual Engine' : 'Link Animation')}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                                    {scopeHint || (persistGlobal ? 'Affects Tiles & Monitoring' : 'This link only')}
                                </span>
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={`Search ${activeTab === 'animations' ? 'animations' : 'decorations'}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full px-3 py-1.5 pl-8 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    autoFocus
                                />
                                <svg
                                    className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {/* Options Grid */}
                        <div className="max-h-96 overflow-y-auto p-2">
                            {(animationsOnly || activeTab === 'animations') ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {filteredAnimations.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => handleAnimationSelect(option.id)}
                                            className={`
                        p-3 rounded-lg text-left transition-all relative
                        ${selectedAnimation === option.id
                                                    ? 'bg-brand-50 dark:bg-brand-500/10 border-2 border-brand-500 shadow-sm'
                                                    : 'bg-slate-50 dark:bg-slate-900 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                                                }
                      `}
                                        >
                                            <span className="absolute top-1 right-1 text-[9px] font-bold text-slate-400">#{option.index}</span>
                                            <div className="flex items-start gap-2">
                                                <span className="text-2xl">{option.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">
                                                        {option.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                        {option.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {filteredDecorations.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => handleDecorationSelect(option.id)}
                                            className={`
                        p-3 rounded-lg text-left transition-all relative
                        ${selectedDecoration === option.id
                                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-2 border-indigo-500 shadow-sm'
                                                    : 'bg-slate-50 dark:bg-slate-900 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                                                }
                      `}
                                        >
                                            <span className="absolute top-1 right-1 text-[9px] font-bold text-slate-400">#{option.index}</span>
                                            <div className="flex items-start gap-2">
                                                <span className="text-2xl">{option.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">
                                                        {option.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                        {option.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview Active</span>
                                    <span className="text-[10px] text-slate-500">
                                        #{selectedAnimationOption.name}{persistGlobal && !animationsOnly ? ` + ${selectedDecorationOption.name}` : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const selector = persistGlobal ? '.linknest-tile-animated' : '.linknest-content-link';
                                            const tiles = document.querySelectorAll(selector);
                                            tiles.forEach((tile) => {
                                                const element = tile as HTMLElement;
                                                element.style.animation = 'none';
                                                setTimeout(() => { element.style.animation = ''; }, 10);
                                            });
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded-md transition-colors"
                                    >
                                        Replay
                                    </button>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="px-4 py-1.5 text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 rounded-md transition-colors shadow-sm"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
};

// Hook to get the current animation and decoration
export const useTileAnimation = () => {
    const [animation, setAnimation] = useState<TileAnimation>('fade-in');
    const [decoration, setDecoration] = useState<TileDecoration>('none');

    const { user } = useAuth();

    useEffect(() => {
        const loadPreferences = async () => {
            let anim: TileAnimation | null = null;
            let decor: TileDecoration | null = null;

            if (user) {
                try {
                    const prefs = await preferenceService.getPreferences();
                    if (prefs[ANIMATION_STORAGE_KEY]) anim = prefs[ANIMATION_STORAGE_KEY] as TileAnimation;
                    if (prefs[DECORATION_STORAGE_KEY]) decor = prefs[DECORATION_STORAGE_KEY] as TileDecoration;
                } catch (error) {
                    console.error('Failed to load preferences from database:', error);
                }
            }

            if (!anim) anim = localStorage.getItem(ANIMATION_STORAGE_KEY) as TileAnimation | null;
            if (!decor) decor = localStorage.getItem(DECORATION_STORAGE_KEY) as TileDecoration | null;

            if (anim) setAnimation(anim);
            if (decor) setDecoration(decor);
        };

        loadPreferences();

        // Listen for storage changes (other tabs)
        const handleStorageChange = () => {
            loadPreferences();
        };

        // Listen for custom events (same tab)
        const handleCustomAnimChange = (e: any) => {
            if (e.detail?.animation) setAnimation(e.detail.animation);
        };
        const handleCustomDecorChange = (e: any) => {
            if (e.detail?.decoration) setDecoration(e.detail.decoration);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('linknest-tile-animation-change' as any, handleCustomAnimChange);
        window.addEventListener('linknest-tile-decoration-change' as any, handleCustomDecorChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('linknest-tile-animation-change' as any, handleCustomAnimChange);
            window.removeEventListener('linknest-tile-decoration-change' as any, handleCustomDecorChange);
        };
    }, [user]);

    return { animation, decoration };
};

// Helper functions for class names
export const getTileAnimationClass = (animation: TileAnimation): string => {
    if (animation === 'none' || animation === 'inherit') return '';
    return `tile-anim-${animation}`;
};

export const getTileDecorationClass = (decoration: TileDecoration): string => {
    if (decoration === 'none') return '';
    return `tile-decor-${decoration}`;
};

export const getAnimationOption = (animation?: string | null) => {
    if (animation === 'inherit') return INHERIT_OPTION;
    if (!animation) return ANIMATION_OPTIONS[0];
    return ANIMATION_OPTIONS.find(opt => opt.id === animation) || ANIMATION_OPTIONS[0];
};

/** Resolve effective link entrance animation (inherit → space default). */
export const resolveLinkAnimation = (
    linkAnimation?: string | null,
    spaceLinksAnimation?: string | null
): TileAnimation => {
    if (linkAnimation && linkAnimation !== 'inherit') {
        return linkAnimation as TileAnimation;
    }
    if (spaceLinksAnimation && spaceLinksAnimation !== 'none' && spaceLinksAnimation !== 'inherit') {
        return spaceLinksAnimation as TileAnimation;
    }
    return 'none';
};

export { ANIMATION_OPTIONS, INHERIT_OPTION };
