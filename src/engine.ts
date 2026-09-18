import { Clip, FilterState } from './types';

export const W = 1280; export const H = 720;

const vidCache = new Map<string, HTMLVideoElement>();
const imgCache = new Map<string, HTMLImageElement>();
const audCache = new Map<string, HTMLAudioElement>();

export function mediaEl(clip: Clip): HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null {
  if (!clip.url) return null;
  if (clip.type === 'video') {
    let v = vidCache.get(clip.id);
    if (!v) { v = document.createElement('video'); v.src = clip.url; v.preload = 'auto'; v.crossOrigin = 'anonymous'; (v as any).playsInline = true; vidCache.set(clip.id, v); }
    return v;
  }
  if (clip.type === 'image') {
    let im = imgCache.get(clip.id);
    if (!im) { im = new Image(); im.src = clip.url; imgCache.set(clip.id, im); }
    return im;
  }
  if (clip.type === 'audio') {
    let a = audCache.get(clip.id);
    if (!a) { a = new Audio(); a.src = clip.url; a.preload = 'auto'; audCache.set(clip.id, a); }
    return a;
  }
  return null;
}

export function filterStr(f: FilterState): string {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  return parts.join(' ') || 'none';
}

/** Sync <video>/<audio> elements to timeline time (called each frame + on seek/play state). */
export function syncMedia(clips: Clip[], time: number, playing: boolean, mutedMap: Record<string, boolean>) {
  for (const c of clips) {
    const el = mediaEl(c);
    if (!el || c.type === 'image' || c.type === 'text' || c.type === 'shape') continue;
    const active = time >= c.start && time < c.start + c.duration;
    if (c.type === 'video' || c.type === 'audio') {
      const m = el as HTMLVideoElement;
      const want = c.offset + (time - c.start) * c.rate;
      if (!active) { if (!m.paused) m.pause(); continue; }
      if (Math.abs((m.currentTime || 0) - want) > 0.35) { try { m.currentTime = Math.max(0, want); } catch { /* noop */ } }
      m.playbackRate = c.rate;
      m.volume = mutedMap[c.trackId] ? 0 : (c.volume / 100) * (c.type === 'audio' ? 1 : 0.9);
      m.muted = !!mutedMap[c.trackId];
      if (playing && m.paused) m.play().catch(() => {});
      if (!playing && !m.paused) m.pause();
    }
  }
}

function textAnimAlpha(clip: Clip, local: number): { a: number; dy: number; scale: number } {
  const anim = clip.text.anim;
  const d = clip.duration;
  const fadeIn = Math.min(0.6, clip.fadeIn || 0.4);
  const fadeOut = Math.min(0.6, clip.fadeOut || 0.4);
  let a = 1, dy = 0, scale = 1;
  if (local < fadeIn) a = local / fadeIn;
  if (local > d - fadeOut) a = Math.min(a, (d - local) / fadeOut);
  if (anim === 'typewriter') { /* handled by char count */ }
  else if (anim === 'slide') dy = (1 - Math.min(1, local / 0.5)) * 60;
  else if (anim === 'pop') scale = local < 0.35 ? 0.6 + (local / 0.35) * 0.4 : 1;
  return { a: Math.max(0, Math.min(1, a)), dy, scale };
}

export function renderFrame(ctx: CanvasRenderingContext2D, clips: Clip[], hidden: Record<string, boolean>, time: number) {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // draw order: video/img bottom, then shape/text top
  const order = (c: Clip) => (c.type === 'video' || c.type === 'image' ? 0 : c.type === 'shape' ? 1 : 2);
  const vis = clips
    .filter((c) => !hidden[c.trackId] && time >= c.start && time < c.start + c.duration)
    .sort((a, b) => order(a) - order(b) || a.start - b.start);

  if (vis.length === 0) {
    // empty-state hint so the preview never looks "broken"
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#2b3a5e'; ctx.lineWidth = 3; ctx.setLineDash([18, 12]);
    ctx.strokeRect(90, 90, W - 180, H - 180);
    ctx.setLineDash([]);
    ctx.fillStyle = '#8fa0c2';
    ctx.font = '800 44px Cairo, Tajawal, Arial, sans-serif';
    ctx.fillText('🎬 استورد وسائط من اللوحة الجانبية للبدء', W / 2, H / 2 - 22);
    ctx.fillStyle = '#5b6a8c';
    ctx.font = '500 26px Cairo, Tajawal, Arial, sans-serif';
    ctx.fillText('فيديو • صور • صوت • نصوص — كل شيء يعمل محلياً بدون رفع', W / 2, H / 2 + 34);
    ctx.restore();
    return;
  }
  ctx.save();

  for (const c of vis) {
    const local = time - c.start;
    let alpha = (c.transform.opacity / 100);
    if (local < c.fadeIn) alpha *= c.fadeIn <= 0 ? 1 : local / c.fadeIn;
    const remain = c.duration - local;
    if (remain < c.fadeOut) alpha *= c.fadeOut <= 0 ? 1 : remain / c.fadeOut;
    if (alpha <= 0.01) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    try { (ctx as any).filter = filterStr(c.filter); } catch { /* noop */ }

    const cx = W / 2 + (c.transform.x / 100) * (W / 2);
    const cy = H / 2 + (c.transform.y / 100) * (H / 2);
    ctx.translate(cx, cy);
    if (c.transform.rotation) ctx.rotate((c.transform.rotation * Math.PI) / 180);

    if (c.type === 'video' || c.type === 'image') {
      const el = mediaEl(c) as HTMLVideoElement | HTMLImageElement;
      const vw = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || W;
      const vh = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || H;
      if (vw && vh) {
        const s = (c.transform.scale / 100);
        const base = Math.max(W / vw, H / vh); // cover
        const dw = vw * base * s, dh = vh * base * s;
        // cover-crop center
        ctx.drawImage(el as any, -dw / 2, -dh / 2, dw, dh);
      }
    } else if (c.type === 'shape') {
      const s = (c.transform.scale / 100) * 320;
      ctx.fillStyle = c.color || '#f43f5e';
      if (c.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (c.shape === 'bar') {
        const w = s * 2.2, h = Math.max(18, s * 0.28);
        ctx.fillRect(-w / 2, -h / 2, w, h);
      } else ctx.fillRect(-s / 2, -s / 2, s, s);
    } else if (c.type === 'text') {
      const { a, dy, scale } = textAnimAlpha(c, local);
      ctx.globalAlpha *= a;
      const fs = c.text.fontSize * (c.transform.scale / 100) * scale;
      ctx.font = `${c.text.bold ? '800' : '500'} ${fs}px Cairo, Tajawal, Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let content = c.text.content;
      if (c.text.anim === 'typewriter') {
        const n = Math.floor((local / Math.max(0.4, c.duration * 0.6)) * content.length);
        content = content.slice(0, Math.max(1, Math.min(content.length, n)));
      }
      const y = dy;
      if (c.text.bg && c.text.bg !== 'transparent') {
        const wpx = ctx.measureText(content).width + 48;
        ctx.fillStyle = c.text.bg;
        ctx.fillRect(-wpx / 2, y - fs * 0.75, wpx, fs * 1.5);
      }
      if (c.text.stroke) { ctx.lineWidth = Math.max(2, fs / 14); ctx.strokeStyle = c.text.stroke; ctx.strokeText(content, 0, y); }
      ctx.fillStyle = c.text.color;
      ctx.fillText(content, 0, y);
    }
    ctx.restore();
  }
  try { (ctx as any).filter = 'none'; } catch { /* noop */ }
  ctx.restore();
}

// ---------- Export (fast MediaRecorder path) ----------
export async function pickMime(): Promise<string> {
  const cands = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of cands) { try { if ((window as any).MediaRecorder?.isTypeSupported(m)) return m; } catch { /* noop */ } }
  return '';
}

export function startRecorder(canvas: HTMLCanvasElement, clips: Clip[], muted: Record<string, boolean>, bitrate = 10_000_000) {
  const mime = (() => {
    const cands = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of cands) { try { if ((window as any).MediaRecorder?.isTypeSupported(m)) return m; } catch { /* noop */ } }
    return '';
  })();
  const stream = (canvas as HTMLCanvasElement).captureStream(60) as MediaStream;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const actx: AudioContext = new AC();
    (startRecorder as any)._ctx = actx;
    const dest = actx.createMediaStreamDestination();
    for (const c of clips) {
      if (c.type !== 'audio' && c.type !== 'video') continue;
      if (muted[c.trackId]) continue;
      const el = mediaEl(c) as HTMLMediaElement | null;
      if (!el) continue;
      try {
        const src = actx.createMediaElementSource(el);
        const g = actx.createGain(); g.gain.value = Math.max(0, c.volume / 100);
        src.connect(g); g.connect(dest);
        (startRecorder as any)._nodes = ((startRecorder as any)._nodes || []);
        (startRecorder as any)._nodes.push(src);
      } catch { /* already connected once */ }
    }
    if (dest.stream.getAudioTracks().length) for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    actx.resume().catch(() => {});
  } catch { /* video-only */ }
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => {
    rec.onstop = () => {
      try { ((startRecorder as any)._ctx as AudioContext)?.close(); } catch { /* noop */ }
      res(new Blob(chunks, { type: (mime.split(';')[0] || 'video/webm') }));
    };
  });
  rec.start(250);
  return { rec, done, mime };
}
