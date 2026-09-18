import { create } from 'zustand';
import { Clip, Track, defaultFilter, defaultText, defaultTransform, uid } from './types';

interface Snapshot { tracks: Track[]; clips: Clip[]; }

interface State {
  projectName: string;
  tracks: Track[];
  clips: Clip[];
  currentTime: number;
  playing: boolean;
  zoom: number;
  laneH: number;
  selectedId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (z: number) => void;
  setLaneH: (h: number) => void;
  setName: (n: string) => void;
  select: (id: string | null) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  addText: () => void;
  addShape: (shape: 'rect' | 'circle' | 'bar') => void;
  addSubtitle: (content: string, start: number, duration: number) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  updateClipDeep: (id: string, fn: (c: Clip) => Clip) => void;
  moveClip: (id: string, start: number, trackId?: string) => void;
  trimClip: (id: string, edge: 'left' | 'right', delta: number) => void;
  splitAt: (t: number) => void;
  deleteClip: (id: string) => void;
  deleteSelected: () => void;
  toggleTrack: (id: string, key: 'locked' | 'hidden' | 'muted') => void;
  clearAll: () => void;
  loadProject: (tracks: Track[], clips: Clip[], name?: string) => void;
}

const baseTracks = (): Track[] => [
  { id: 'v1', kind: 'video', name: 'Video 1', locked: false, hidden: false, muted: false },
  { id: 'v2', kind: 'overlay', name: 'Overlay / Text', locked: false, hidden: false, muted: false },
  { id: 'a1', kind: 'audio', name: 'Audio 1', locked: false, hidden: false, muted: false },
];

function probeDuration(file: File, type: string): Promise<number> {
  return new Promise((resolve) => {
    if (type === 'image') return resolve(5);
    const url = URL.createObjectURL(file);
    const el = type === 'audio' ? new Audio() : document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { const d = el.duration || 5; URL.revokeObjectURL(url); resolve(isFinite(d) ? d : 5); };
    el.onerror = () => resolve(5);
    el.src = url;
    setTimeout(() => resolve(5), 6000);
  });
}

const num = (v: unknown, fb: number) => (Number.isFinite(+ (v as number)) ? +(v as number) : fb);

export function sanitize(c: Clip): Clip {
  c.start = Math.max(0, num(c.start, 0));
  c.duration = Math.max(0.2, num(c.duration, 2));
  c.offset = Math.max(0, num(c.offset, 0));
  c.rate = Math.min(4, Math.max(0.25, num(c.rate, 1)));
  c.volume = Math.min(100, Math.max(0, num(c.volume, 90)));
  c.fadeIn = Math.max(0, num(c.fadeIn, 0));
  c.fadeOut = Math.max(0, num(c.fadeOut, 0));
  const t = c.transform;
  t.x = num(t.x, 0); t.y = num(t.y, 0);
  t.scale = Math.min(300, Math.max(10, num(t.scale, 100)));
  t.rotation = num(t.rotation, 0);
  t.opacity = Math.min(100, Math.max(0, num(t.opacity, 100)));
  return c;
}

export const totalDuration = (clips: Clip[]) =>
  clips.reduce((m, c) => {
    const e = num(c.start, 0) + num(c.duration, 0);
    return Number.isFinite(e) ? Math.max(m, e) : m;
  }, 8);

export const useStore = create<State>((set, get) => ({
  projectName: 'CupSet Project',
  tracks: baseTracks(),
  clips: [],
  currentTime: 0,
  playing: false,
  zoom: 62,
  laneH: 96,
  selectedId: null,
  past: [],
  future: [],

  setTime: (t) => {
    const dur = totalDuration(get().clips);
    set({ currentTime: Math.max(0, Math.min(Number.isFinite(t) ? t : 0, dur + 0.001)) });
  },
  setPlaying: (playing) => set({ playing }),
  setZoom: (zoom) => set({ zoom: Math.min(320, Math.max(14, zoom)) }),
  setLaneH: (h) => set({ laneH: Math.min(160, Math.max(56, Number.isFinite(h) ? h : 96)) }),
  setName: (projectName) => set({ projectName }),
  select: (selectedId) => set({ selectedId }),

  pushHistory: () => {
    const { tracks, clips, past } = get();
    const snap = { tracks: JSON.parse(JSON.stringify(tracks)), clips: JSON.parse(JSON.stringify(clips)) };
    set({ past: [...past.slice(-59), snap], future: [] });
  },
  undo: () => {
    const { past, future, tracks, clips } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      tracks: prev.tracks, clips: prev.clips.map((c) => sanitize({ ...c })),
      past: past.slice(0, -1),
      future: [{ tracks, clips }, ...future].slice(0, 60),
      selectedId: null,
    });
  },
  redo: () => {
    const { future, past, tracks, clips } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    set({ tracks: next.tracks, clips: next.clips.map((c) => sanitize({ ...c })), past: [...past, { tracks, clips }], future: rest, selectedId: null });
  },

  addFiles: async (files) => {
    get().pushHistory();
    const arr = Array.from(files);
    let endCursor: Record<string, number> = {};
    for (const c of get().clips) endCursor[c.trackId] = Math.max(endCursor[c.trackId] || 0, c.start + c.duration);
    const next: Clip[] = [];
    for (const f of arr) {
      const isV = f.type.startsWith('video');
      const isA = f.type.startsWith('audio');
      const isI = f.type.startsWith('image');
      if (!isV && !isA && !isI) continue;
      const type = isV ? 'video' : isA ? 'audio' : 'image';
      const mediaDuration = await probeDuration(f, type);
      const url = URL.createObjectURL(f);
      const dur = type === 'image' ? 5 : Math.min(mediaDuration, 120);
      const trackId = type === 'audio' ? 'a1' : isV ? 'v1' : 'v2';
      const start = endCursor[trackId] || 0;
      endCursor[trackId] = start + dur + 0.15;
      next.push({
        id: uid(), trackId, type, name: f.name, url, mediaDuration,
        start, duration: dur, offset: 0, volume: 90, rate: 1,
        transform: defaultTransform(), filter: defaultFilter(), text: defaultText(),
        fadeIn: 0, fadeOut: 0,
      });
    }
    if (next.length) set({ clips: [...get().clips, ...next], selectedId: next[0].id });
  },

  addText: () => {
    get().pushHistory();
    const t = get().currentTime;
    const id = uid();
    set({
      clips: [...get().clips, {
        id, trackId: 'v2', type: 'text', name: 'Text', mediaDuration: 4,
        start: t, duration: 4, offset: 0, volume: 100, rate: 1,
        transform: defaultTransform(), filter: defaultFilter(), text: defaultText(),
        fadeIn: 0.25, fadeOut: 0.25,
      }],
      selectedId: id,
    });
  },

  addShape: (shape) => {
    get().pushHistory();
    const id = uid();
    set({
      clips: [...get().clips, {
        id, trackId: 'v2', type: 'shape', name: 'Shape', mediaDuration: 4, shape,
        color: shape === 'bar' ? '#22d3ee' : '#f43f5e',
        start: get().currentTime, duration: 4, offset: 0, volume: 100, rate: 1,
        transform: { ...defaultTransform(), scale: shape === 'bar' ? 60 : 40 },
        filter: defaultFilter(), text: defaultText(), fadeIn: 0, fadeOut: 0,
      }],
      selectedId: id,
    });
  },

  addSubtitle: (content, start, duration) => {
    get().pushHistory();
    const id = uid();
    set({
      clips: [...get().clips, {
        id, trackId: 'v2', type: 'text', name: 'Subtitle', mediaDuration: duration,
        start, duration, offset: 0, volume: 100, rate: 1,
        transform: { ...defaultTransform(), y: 32 },
        filter: defaultFilter(),
        text: { ...defaultText(), content, fontSize: 44 },
        fadeIn: 0.15, fadeOut: 0.15,
      }],
      selectedId: id,
    });
  },

  updateClip: (id, patch) => set({ clips: get().clips.map((c) => (c.id === id ? sanitize({ ...c, ...patch }) : c)) }),
  updateClipDeep: (id, fn) => set({ clips: get().clips.map((c) => (c.id === id ? sanitize(fn({ ...c })) : c)) }),

  moveClip: (id, start, trackId) => {
    const c = get().clips.find((x) => x.id === id);
    if (!c) return;
    const tr = get().tracks.find((t) => t.id === (trackId || c.trackId));
    if (!tr || tr.locked) return;
    // keep type/track compatibility
    if (c.type === 'audio' && tr.kind !== 'audio') return;
    if (c.type !== 'audio' && tr.kind === 'audio') return;
    set({ clips: get().clips.map((x) => (x.id === id ? { ...x, start: Math.max(0, start), trackId: trackId || x.trackId } : x)) });
  },

  trimClip: (id, edge, delta) => {
    set({
      clips: get().clips.map((c) => {
        if (c.id !== id) return c;
        if (edge === 'left') {
          const ns = Math.max(0, c.start + delta);
          const d = c.duration - (ns - c.start);
          if (d < 0.2) return c;
          return { ...c, start: ns, duration: d, offset: Math.max(0, c.offset + (ns - c.start)) };
        }
        const d = Math.max(0.2, c.duration + delta);
        return { ...c, duration: Math.min(d, c.mediaDuration - c.offset || d) };
      }),
    });
  },

  splitAt: (t) => {
    const hit = get().clips.find((c) => t > c.start + 0.1 && t < c.start + c.duration - 0.1);
    if (!hit) return;
    get().pushHistory();
    const left: Clip = sanitize({ ...hit, duration: t - hit.start });
    const right: Clip = sanitize({ ...hit, id: uid(), start: t, duration: hit.start + hit.duration - t, offset: hit.offset + (t - hit.start) });
    set({ clips: [...get().clips.filter((c) => c.id !== hit.id), left, right], selectedId: right.id });
  },

  deleteClip: (id) => { get().pushHistory(); set({ clips: get().clips.filter((c) => c.id !== id), selectedId: null }); },
  deleteSelected: () => {
    const { selectedId } = get();
    if (selectedId) get().deleteClip(selectedId);
  },

  toggleTrack: (id, key) => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, [key]: !t[key] } : t)) }),
  clearAll: () => { get().pushHistory(); set({ clips: [], selectedId: null, currentTime: 0, playing: false }); },
  loadProject: (tracks, clips, name) => {
    const clean = (Array.isArray(clips) ? clips : []).filter((c) => c && typeof c === 'object').map((c) => sanitize({ ...(c as Clip) }));
    set({ tracks: tracks.length ? tracks : baseTracks(), clips: clean, projectName: name || 'CupSet Project', selectedId: null, currentTime: 0 });
  },
}));
