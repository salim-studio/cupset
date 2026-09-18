import { useEffect, useRef, useState } from 'react';
import { H, W, renderFrame, startRecorder, syncMedia } from '../engine';
import { useStore, totalDuration } from '../store';
import { fmt } from '../types';

export default function Preview({ toast }: { toast: (m: string) => void }) {
  const clips = useStore((s) => s.clips);
  const tracks = useStore((s) => s.tracks);
  const time = useStore((s) => s.currentTime);
  const playing = useStore((s) => s.playing);
  const setTime = useStore((s) => s.setTime);
  const setPlaying = useStore((s) => s.setPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(time); timeRef.current = time;
  const playRef = useRef(playing); playRef.current = playing;
  const clipsRef = useRef(clips); clipsRef.current = clips;
  const tracksRef = useRef(tracks); tracksRef.current = tracks;
  const [exp, setExp] = useState<{ open: boolean; busy: boolean; p: number; url: string; ext: string }>({ open: false, busy: false, p: 0, url: '', ext: 'webm' });

  useEffect(() => {
    const h = () => setExp((e) => ({ ...e, open: true }));
    window.addEventListener('cupset-export', h);
    return () => window.removeEventListener('cupset-export', h);
  }, []);

  // render loop (fast: single rAF, Canvas2D, no re-render)
  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const dur = totalDuration(clipsRef.current);
      if (playRef.current) {
        const nt = timeRef.current + dt;
        if (nt >= dur) { useStore.getState().setTime(0); }
        else useStore.getState().setTime(nt);
      }
      const muted: Record<string, boolean> = {};
      const hidden: Record<string, boolean> = {};
      for (const t of tracksRef.current) { muted[t.id] = t.muted; hidden[t.id] = t.hidden; }
      syncMedia(clipsRef.current, timeRef.current, playRef.current, muted);
      const cv = canvasRef.current;
      if (cv) {
        const ctx = cv.getContext('2d')!;
        renderFrame(ctx, clipsRef.current, hidden, timeRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dur = totalDuration(clips);
  const shown = Math.min(Math.max(0, Number.isFinite(time) ? time : 0), dur);

  const doExport = async (quality: 'hd' | 'fhd' | '4k') => {
    const cv = canvasRef.current; if (!cv) return;
    try {
      setExp((e) => ({ ...e, busy: true, p: 0 }));
      const st = useStore.getState();
      st.setTime(0); st.setPlaying(false);
      await new Promise((r) => setTimeout(r, 350));
      const muted: Record<string, boolean> = {};
      for (const t of st.tracks) muted[t.id] = t.muted;
      const { rec, done, mime } = startRecorder(cv, st.clips, muted, quality === '4k' ? 20_000_000 : quality === 'fhd' ? 12_000_000 : 6_000_000);
      const target = totalDuration(st.clips);
      st.setPlaying(true);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const iv = setInterval(() => {
          const el = (performance.now() - t0) / 1000 / Math.max(1, target);
          setExp((e) => ({ ...e, p: Math.min(0.99, el) }));
          if (useStore.getState().currentTime >= target - 0.08) { clearInterval(iv); resolve(); }
          if ((performance.now() - t0) / 1000 > target + 8) { clearInterval(iv); resolve(); }
        }, 120);
      });
      st.setPlaying(false);
      await new Promise((r) => setTimeout(r, 400));
      try { rec.stop(); } catch { /* noop */ }
      const blob = await done;
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      setExp((e) => ({ ...e, busy: false, p: 1, url, ext }));
      toast(`Export complete (${ext.toUpperCase()}) — ready to download`);
    } catch (e: any) {
      setExp((x) => ({ ...x, busy: false }));
      toast('Export failed: ' + (e?.message || e));
    }
  };

  return (
    <div className="preview-wrap">
      <canvas ref={canvasRef} id="cupset-stage" className="stage" width={W} height={H} />
      <div className="transport">
        <button className="tbtn" onClick={() => setTime(0)} title="Go to start">⏮</button>
        <button className="tbtn" onClick={() => setTime(Math.max(0, time - 2))} title="Back 2s">↺</button>
        <button className="tbtn play" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
          {playing ? '⏸' : '▶'}
        </button>
        <button className="tbtn" onClick={() => setTime(time + 2)} title="Forward 2s">↻</button>
        <button className="tbtn" onClick={() => useStore.getState().splitAt(time)} title="Split at playhead (S)">✂</button>
        <input className="scrub" type="range" min={0} max={Math.max(1, dur)} step={0.033} value={shown}
          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setTime(v); }} />
        <span className="time"><span dir="ltr">{fmt(shown)} / {fmt(dur)}</span></span>
        <button className="btn pri sm" onClick={() => setExp((e) => ({ ...e, open: true }))}>📤 Export</button>
      </div>

      {exp.open && (
        <div className="card">
          <h3>📤 Export video — fast, 100% local</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn sm" disabled={exp.busy} onClick={() => doExport('hd')}>720p fast</button>
            <button className="btn sm" disabled={exp.busy} onClick={() => doExport('fhd')}>1080p balanced</button>
            <button className="btn sm" disabled={exp.busy} onClick={() => doExport('4k')}>Max quality</button>
            <button className="btn sm" onClick={() => setExp((e) => ({ ...e, open: false }))}>Close</button>
          </div>
          {(exp.busy || exp.p > 0) && (
            <div style={{ marginTop: 10 }}>
              <div className="exp-bar"><i style={{ width: `${Math.round(exp.p * 100)}%` }} /></div>
              <div className="time" style={{ marginTop: 4 }}>{exp.busy ? `Exporting… ${Math.round(exp.p * 100)}%` : 'Done ✅'}</div>
            </div>
          )}
          {exp.url && (
            <div className="row" style={{ marginTop: 10 }}>
              <a className="btn pri sm" href={exp.url} download={`cupset.${exp.ext}`}>⬇ Download cupset.{exp.ext}</a>
              <span className="time">Works everywhere, no watermark</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
