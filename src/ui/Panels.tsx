import { useRef, useState } from 'react';
import { useStore } from '../store';

function parseSRT(s: string): { start: number; end: number; text: string }[] {
  const ts = (t: string) => {
    const m = t.replace(',', ':').split(':').map(Number);
    return m[0] * 3600 + m[1] * 60 + m[2] + (m[3] || 0) / 1000;
  };
  return s.split(/\n\s*\n/).map((b) => {
    const l = b.trim().split('\n');
    if (l.length < 2) return null;
    const mt = l[1].match(/(.+)-->(.+)/);
    if (!mt) return null;
    return { start: ts(mt[1].trim()), end: ts(mt[2].trim()), text: l.slice(2).join(' ').trim() };
  }).filter(Boolean) as any[];
}

export function MediaBin({ toast }: { toast: (m: string) => void }) {
  const clips = useStore((s) => s.clips);
  const fileRef = useRef<HTMLInputElement>(null);
  const srtRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<MediaRecorder | null>(null);

  const saveProject = () => {
    const st = useStore.getState();
    const data = JSON.stringify({ name: st.projectName, tracks: st.tracks, clips: st.clips.map((c) => ({ ...c, url: undefined })) }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'cupset-project.json'; a.click();
    localStorage.setItem('cupset-autosave', data);
    toast('Project saved ✅');
  };

  const loadFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j.tracks && j.clips) { useStore.getState().loadProject(j.tracks, j.clips, j.name); toast('Project opened ✅ (re-import video files)'); }
    } catch { toast('Invalid project file'); }
  };

  const recordScreen = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      const mr = new MediaRecorder(stream);
      const ch: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && ch.push(e.data);
      mr.onstop = () => {
        const file = new File(ch, `screen-${Date.now()}.webm`, { type: 'video/webm' });
        useStore.getState().addFiles([file]);
        stream.getTracks().forEach((t: any) => t.stop());
        setRec(null); toast('Screen recording added to timeline ✅');
      };
      mr.start(); setRec(mr); toast('Recording screen… press stop when done');
    } catch { toast('Could not start screen recording'); }
  };

  return (
    <div className="side">
      <div className="card">
        <h3>📁 Media</h3>
        <input ref={fileRef} type="file" hidden multiple accept="video/*,image/*,audio/*"
          onChange={(e) => { if (e.target.files?.length) useStore.getState().addFiles(e.target.files); e.target.value = ''; }} />
        <div className="grid2">
          <button className="btn pri sm" onClick={() => fileRef.current?.click()}>＋ Import</button>
          <button className="btn sm" onClick={() => useStore.getState().addText()}>🔤 Text</button>
          <button className="btn sm" onClick={() => useStore.getState().addShape('rect')}>⬛ Square</button>
          <button className="btn sm" onClick={() => useStore.getState().addShape('circle')}>⚪ Circle</button>
          <button className="btn sm" onClick={() => useStore.getState().addShape('bar')}>▬ Lower third</button>
          <button className="btn sm" onClick={rec ? () => rec.stop() : recordScreen}>{rec ? '⏹ Stop recording' : '🖥 Record screen'}</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => srtRef.current?.click()}>📝 SRT captions</button>
          <button className="btn sm" onClick={saveProject}>💾 Save</button>
          <button className="btn sm" onClick={() => projRef.current?.click()}>📂 Open</button>
        </div>
        <input ref={srtRef} type="file" hidden accept=".srt" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const items = parseSRT(await f.text());
          items.forEach((s) => useStore.getState().addSubtitle(s.text, s.start, Math.max(0.6, s.end - s.start)));
          toast(`Added ${items.length} captions ✅`); e.target.value = '';
        }} />
        <input ref={projRef} type="file" hidden accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
      </div>

      <div className="card">
        <h3>🎞 Timeline clips ({clips.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflow: 'auto' }}>
          {clips.length === 0 && <span className="time">Import video / images / audio to start editing — everything runs locally, nothing is uploaded.</span>}
          {clips.map((c) => (
            <div key={c.id} className="media-item" onClick={() => { useStore.getState().select(c.id); useStore.getState().setTime(c.start + 0.01); }} style={{ cursor: 'pointer' }}>
              {c.url && (c.type === 'image' || c.type === 'video') ? <img className="thumb" src={c.type === 'image' ? c.url : undefined} /> : <span style={{ fontSize: 20 }}>{c.type === 'audio' ? '🔊' : c.type === 'text' ? '🔤' : '⬛'}</span>}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
              <button className="chip" onClick={(e) => { e.stopPropagation(); useStore.getState().deleteClip(c.id); }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <details className="card">
        <summary>⌨ Shortcuts</summary>
        <div className="time" style={{ lineHeight: 2, marginTop: 8 }}>
          <span className="kbd">Space</span> play / pause<br />
          <span className="kbd">S</span> split • <span className="kbd">Del</span> delete<br />
          <span className="kbd">→</span><span className="kbd">←</span> step • <span className="kbd">Ctrl+Z</span> undo
        </div>
      </details>
    </div>
  );
}

export function Inspector({ toast }: { toast: (m: string) => void }) {
  const selectedId = useStore((s) => s.selectedId);
  const clip = useStore((s) => s.clips.find((c) => c.id === s.selectedId));
  if (!clip) return <div className="side"><div className="card"><h3>🎛 Properties</h3><span className="time">Select a clip on the timeline to adjust size, position, filters, speed, audio, text and fades.</span></div></div>;
  const up = (p: Partial<typeof clip>) => useStore.getState().updateClip(clip.id, p);
  void toast;
  const Sl = ({ l, v, min, max, step = 1, set }: any) => (
    <label className="f">{l}: {v}<input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(parseFloat(e.target.value))} /></label>
  );
  return (
    <div className="side">
      <div className="card">
        <h3>🎛 {clip.name}</h3>
        <label className="f">Name<input type="text" value={clip.name} onChange={(e) => up({ name: e.target.value })} /></label>
        <div className="grid2" style={{ marginTop: 8 }}>
          <label className="f">Start (s)<input type="number" step={0.1} value={+clip.start.toFixed(2)} onChange={(e) => up({ start: Math.max(0, +e.target.value) })} /></label>
          <label className="f">Duration (s)<input type="number" step={0.1} value={+clip.duration.toFixed(2)} onChange={(e) => up({ duration: Math.max(0.2, +e.target.value) })} /></label>
        </div>
        {(clip.type === 'video' || clip.type === 'audio') && (
          <div className="grid2" style={{ marginTop: 8 }}>
            <label className="f">Speed<input type="number" step={0.25} min={0.25} max={4} value={clip.rate} onChange={(e) => up({ rate: Math.min(4, Math.max(0.25, +e.target.value || 1)) })} /></label>
            <label className="f">Volume<input type="number" min={0} max={100} value={clip.volume} onChange={(e) => up({ volume: +e.target.value })} /></label>
          </div>
        )}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Sl l="Position X" v={clip.transform.x} min={-100} max={100} set={(v: number) => up({ transform: { ...clip.transform, x: v } })} />
          <Sl l="Position Y" v={clip.transform.y} min={-100} max={100} set={(v: number) => up({ transform: { ...clip.transform, y: v } })} />
          <Sl l="Scale %" v={clip.transform.scale} min={10} max={300} set={(v: number) => up({ transform: { ...clip.transform, scale: v } })} />
          <Sl l="Rotation" v={clip.transform.rotation} min={-180} max={180} set={(v: number) => up({ transform: { ...clip.transform, rotation: v } })} />
          <Sl l="Opacity" v={clip.transform.opacity} min={0} max={100} set={(v: number) => up({ transform: { ...clip.transform, opacity: v } })} />
        </div>
      </div>

      {(clip.type === 'video' || clip.type === 'image') && (
        <div className="card">
          <h3>🎨 Color & filters</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Sl l="Brightness" v={clip.filter.brightness} min={0} max={200} set={(v: number) => up({ filter: { ...clip.filter, brightness: v } })} />
            <Sl l="Contrast" v={clip.filter.contrast} min={0} max={200} set={(v: number) => up({ filter: { ...clip.filter, contrast: v } })} />
            <Sl l="Saturation" v={clip.filter.saturate} min={0} max={200} set={(v: number) => up({ filter: { ...clip.filter, saturate: v } })} />
            <Sl l="Blur" v={clip.filter.blur} min={0} max={12} step={0.5} set={(v: number) => up({ filter: { ...clip.filter, blur: v } })} />
            <Sl l="Grayscale" v={clip.filter.grayscale} min={0} max={100} set={(v: number) => up({ filter: { ...clip.filter, grayscale: v } })} />
            <Sl l="Hue rotate" v={clip.filter.hue} min={-180} max={180} set={(v: number) => up({ filter: { ...clip.filter, hue: v } })} />
          </div>
        </div>
      )}

      {clip.type === 'text' && (
        <div className="card">
          <h3>🔤 Text & animation</h3>
          <label className="f">Text<textarea value={clip.text.content} onChange={(e) => up({ text: { ...clip.text, content: e.target.value } })} /></label>
          <div className="grid2" style={{ marginTop: 8 }}>
            <label className="f">Size<input type="number" value={clip.text.fontSize} onChange={(e) => up({ text: { ...clip.text, fontSize: +e.target.value || 40 } })} /></label>
            <label className="f">Animation<select value={clip.text.anim} onChange={(e) => up({ text: { ...clip.text, anim: e.target.value as any } })}>
              <option value="none">None</option><option value="fade">Fade</option><option value="typewriter">Typewriter</option>
              <option value="slide">Slide</option><option value="pop">Pop</option>
            </select></label>
            <label className="f">Color<input type="color" value={clip.text.color} onChange={(e) => up({ text: { ...clip.text, color: e.target.value } })} /></label>
            <label className="f">Outline<input type="color" value={clip.text.stroke.startsWith('#') ? clip.text.stroke : '#000000'} onChange={(e) => up({ text: { ...clip.text, stroke: e.target.value } })} /></label>
          </div>
        </div>
      )}

      {clip.type === 'shape' && (
        <div className="card">
          <h3>⬛ Shape</h3>
          <label className="f">Color<input type="color" value={clip.color || '#f43f5e'} onChange={(e) => up({ color: e.target.value })} /></label>
        </div>
      )}

      <div className="card">
        <h3>🌅 Fade (transitions)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Sl l="Fade in (s)" v={clip.fadeIn} min={0} max={2} step={0.05} set={(v: number) => up({ fadeIn: v })} />
          <Sl l="Fade out (s)" v={clip.fadeOut} min={0} max={2} step={0.05} set={(v: number) => up({ fadeOut: v })} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => useStore.getState().splitAt(clip.start + clip.duration / 2)}>✂ Split in half</button>
          <button className="btn sm danger" onClick={() => useStore.getState().deleteClip(clip.id)}>🗑 Delete</button>
        </div>
      </div>
    </div>
  );
}
