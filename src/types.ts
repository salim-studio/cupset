export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'shape';

export interface Transform {
  x: number; // -100..100 (% of canvas)
  y: number;
  scale: number; // 10..300 %
  rotation: number; // deg
  opacity: number; // 0..100
}

export interface FilterState {
  brightness: number; // 0..200 default 100
  contrast: number;
  saturate: number;
  blur: number; // px
  grayscale: number; // 0..100
  hue: number; // deg
}

export interface TextState {
  content: string;
  fontSize: number;
  color: string;
  bg: string;
  bold: boolean;
  stroke: string;
  align: 'center' | 'start';
  anim: 'none' | 'typewriter' | 'fade' | 'slide' | 'pop';
}

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  /** blob url for video/image/audio */
  url?: string;
  /** intrinsic duration (media length) */
  mediaDuration: number;
  start: number;
  duration: number;
  offset: number; // trim start inside media
  volume: number; // 0..100
  rate: number; // 0.25..4
  transform: Transform;
  filter: FilterState;
  text: TextState;
  color?: string; // for shape
  shape?: 'rect' | 'circle' | 'bar';
  fadeIn: number;
  fadeOut: number;
}

export interface Track {
  id: string;
  kind: 'video' | 'audio' | 'overlay';
  name: string;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
}

export const defaultTransform = (): Transform => ({ x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 });
export const defaultFilter = (): FilterState => ({ brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, hue: 0 });
export const defaultText = (): TextState => ({
  content: 'نص جديد', fontSize: 64, color: '#ffffff', bg: 'transparent',
  bold: true, stroke: 'rgba(0,0,0,0.85)', align: 'center', anim: 'fade'
});

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
export const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60); const f = Math.floor((s % 1) * 30);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
};
