import { getMapColor, type ColorBlindnessMode } from './accessibility';

export type RGBColor = [number, number, number];
export type RGBAColor = [number, number, number, number];

// Tactical ATC Train Symbology Palette (High-contrast operational specification)
export const TACTICAL_TRAIN_COLORS = {
  PREMIUM: [167, 243, 208] as RGBColor, // Mint: Vande Bharat / Rajdhani (#A7F3D0)
  EXPRESS: [148, 163, 184] as RGBColor, // Slate: Standard Express (#94A3B8)
  FREIGHT: [245, 158, 11] as RGBColor,  // Amber: Freight (#F59E0B)
  CONFLICT: [239, 68, 68] as RGBColor,  // Red: Delayed / Conflict (#EF4444)
} as const;

// Directional Tactical Chevron SVG (North-facing vector with white fill for alpha-mask tinting)
export const TACTICAL_CHEVRON_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 4L42 40L24 30L6 40Z" fill="#FFFFFF"/>
</svg>
`.trim())}`;

// Tactical IconLayer Mapping Definition
export const TACTICAL_ICON_MAPPING = {
  chevron: {
    x: 0,
    y: 0,
    width: 48,
    height: 48,
    anchorX: 24,
    anchorY: 24,
    mask: true,
  },
};

/**
 * Calculates RGB color array based on train category, status, and network directives.
 * Priority: Delayed / Conflict > Premium (Vande Bharat/Rajdhani) > Freight > Standard Express
 */
export function getTacticalTrainColor(
  train: {
    category?: string;
    train_name?: string;
    status?: string;
    delay_minutes?: number;
  },
  action?: string,
  isDelayedOrHeld?: boolean,
  colorMode: ColorBlindnessMode = 'standard'
): RGBColor {
  const isConflict =
    isDelayedOrHeld ||
    train.status === 'HELD' ||
    train.status === 'LOOPED' ||
    train.status === 'DIVERTED' ||
    (action && action !== 'NONE') ||
    (typeof train.delay_minutes === 'number' && train.delay_minutes > 0);

  if (colorMode !== 'standard') {
    if (isConflict) return getMapColor('critical', colorMode);
    if (train.category === 'EXPRESS') return getMapColor('nominal', colorMode);
  }

  // 1. Delayed / Conflict condition takes top tactical priority
  if (isConflict) {
    return TACTICAL_TRAIN_COLORS.CONFLICT; // [239, 68, 68] Red
  }

  // 2. Vande Bharat / Rajdhani (Premium / Modern High-Speed)
  const category = (train.category || '').toUpperCase();
  const name = (train.train_name || '').toLowerCase();
  const isPremium =
    category === 'PREMIUM' ||
    category === 'SUPERFAST' ||
    name.includes('vande bharat') ||
    name.includes('rajdhani') ||
    name.includes('shatabdi') ||
    name.includes('tejas');

  if (isPremium) {
    return TACTICAL_TRAIN_COLORS.PREMIUM; // [167, 243, 208] Mint
  }

  // 3. Freight / Heavy Haul
  if (category === 'FREIGHT' || name.includes('freight') || name.includes('goods')) {
    return TACTICAL_TRAIN_COLORS.FREIGHT; // [245, 158, 11] Amber
  }

  // 4. Standard Express & Default
  return TACTICAL_TRAIN_COLORS.EXPRESS; // [148, 163, 184] Slate
}
