export type WallpaperType = 'svg' | 'symbol' | 'aurora' | 'shader' | 'image';

export interface Wallpaper {
  id: string;
  name: string;
  type: WallpaperType;
  /** For 'svg' wallpapers — path to the SVG file */
  svgUrl?: string;
  /** For 'symbol' wallpapers — path to the symbol SVG shown centered at low opacity */
  symbolUrl?: string;
  /** For 'image' wallpapers — path to the light-mode image */
  lightUrl?: string;
  /** For 'image' wallpapers — path to the dark-mode image */
  darkUrl?: string;
  /** Small thumbnail for the picker */
  thumbnailUrl: string;
}

export const DEFAULT_WALLPAPER_ID = 'brandmark';

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'brandmark',
    name: 'Brandmark',
    type: 'svg',
    svgUrl: '/epsilon-brandmark-bg.svg',
    thumbnailUrl: '/epsilon-brandmark-bg.svg',
  },
  {
    id: 'symbol',
    name: 'Symbol',
    type: 'symbol',
    symbolUrl: '/epsilon-symbol.svg',
    thumbnailUrl: '/epsilon-symbol.svg',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    type: 'aurora',
    svgUrl: '/epsilon-logomark-white.svg',
    thumbnailUrl: '/epsilon-logomark-white.svg',
  },
  {
    id: 'nebula',
    name: 'Pixel Beams',
    type: 'shader',
    svgUrl: '/epsilon-logomark-white.svg',
    thumbnailUrl: '/epsilon-logomark-white.svg',
  },
  {
    id: 'ascii-tunnel',
    name: 'ASCII Tunnel',
    type: 'shader',
    svgUrl: '/epsilon-logomark-white.svg',
    thumbnailUrl: '/epsilon-logomark-white.svg',
  },
  {
    id: 'matrix',
    name: 'Enter the Matrix',
    type: 'shader',
    svgUrl: '/epsilon-logomark-white.svg',
    thumbnailUrl: '/epsilon-logomark-white.svg',
  },
];

export function getWallpaperById(id: string): Wallpaper {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}
