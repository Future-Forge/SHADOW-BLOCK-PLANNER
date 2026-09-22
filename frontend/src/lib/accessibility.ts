export const ColorBlindnessMode = {
  STANDARD: 'standard',
  PROTANOPIA: 'protanopia',
  DEUTERANOPIA: 'deuteranopia',
  TRITANOPIA: 'tritanopia',
} as const;

export type ColorBlindnessMode = 'standard' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface ColorModeOption {
  id: ColorBlindnessMode;
  label: string;
  sublabel: string;
  colors: {
    critical: string;
    caution: string;
    nominal: string;
  };
}

export const COLOR_MODE_OPTIONS: ColorModeOption[] = [
  {
    id: 'standard',
    label: '[ STANDARD VISION ]',
    sublabel: 'Default Trichromat',
    colors: {
      critical: '#EF4444',
      caution: '#F97316',
      nominal: '#34D399',
    },
  },
  {
    id: 'protanopia',
    label: '[ PROTANOPIA ]',
    sublabel: 'Red-Blind (Blue/Yellow Shift)',
    colors: {
      critical: '#005AB5',
      caution: '#DC3220',
      nominal: '#FFC20A',
    },
  },
  {
    id: 'deuteranopia',
    label: '[ DEUTERANOPIA ]',
    sublabel: 'Green-Blind (Blue/Yellow Shift)',
    colors: {
      critical: '#005AB5',
      caution: '#DC3220',
      nominal: '#FFC20A',
    },
  },
  {
    id: 'tritanopia',
    label: '[ TRITANOPIA ]',
    sublabel: 'Blue-Yellow Blind (Red/Cyan Shift)',
    colors: {
      critical: '#E42536',
      caution: '#F18D9E',
      nominal: '#00949E',
    },
  },
];

export const COLOR_PALETTES: Record<
  ColorBlindnessMode,
  {
    critical: [number, number, number];
    caution: [number, number, number];
    nominal: [number, number, number];
  }
> = {
  standard: {
    critical: [239, 68, 68],   // #EF4444 Red
    caution: [249, 115, 22],   // #F97316 Orange
    nominal: [52, 211, 153],   // #34D399 Green
  },
  protanopia: {
    critical: [0, 90, 181],    // #005AB5 Strong Blue
    caution: [220, 50, 32],    // #DC3220 High contrast Red/Orange
    nominal: [255, 194, 10],   // #FFC20A High visibility Yellow
  },
  deuteranopia: {
    critical: [0, 90, 181],    // #005AB5 Strong Blue
    caution: [220, 50, 32],    // #DC3220 High contrast Red/Orange
    nominal: [255, 194, 10],   // #FFC20A High visibility Yellow
  },
  tritanopia: {
    critical: [228, 37, 54],   // #E42536 Crimson
    caution: [241, 141, 158],  // #F18D9E Pink
    nominal: [0, 148, 158],    // #00949E Cyan
  },
};

/**
 * Returns the exact [R, G, B] array for WebGL / Deck.gl map layers
 * based on the active color vision deficiency profile.
 */
export function getMapColor(
  status: 'critical' | 'caution' | 'nominal' | 'EMERGENCY' | 'MAJOR' | 'NORMAL' | string,
  colorMode: ColorBlindnessMode = 'standard'
): [number, number, number] {
  const palette = COLOR_PALETTES[colorMode] || COLOR_PALETTES.standard;
  const s = status.toLowerCase();

  if (s === 'critical' || s === 'emergency' || s === 'hold' || s === 'held') {
    return palette.critical;
  }
  if (s === 'caution' || s === 'major' || s === 'divert' || s === 'loop') {
    return palette.caution;
  }
  return palette.nominal;
}
