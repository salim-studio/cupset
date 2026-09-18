import { useCallback, useEffect, useState } from 'react';
import Preview from './ui/Preview';
import Timeline from './ui/Timeline';
import { Inspector, MediaBin } from './ui/Panels';
import { useStore } from './store';

export default function App() {
  const name = useStore((s) => s.projectName);
  const [toastMsg, setToastMsg] = useState('');
  const toast = useCallback((m: string) => { setToastMsg(m); }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // autosave (without blob urls) + restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cupset-autosave');
      if (raw) {
        const j = JSON.parse(raw);
        if (j.tracks?.length || j.clips?.length) {
          const clips = (j.clips || []).filter((c: any) => c.type === 'text' || c.type === 'shape');
          if (clips.length) useStore.getState().loadProject(j.tracks, clips, j.name);
        }
      }
    } catch { /* noop */ }
    const iv = setInterval(() => {
      try {
        const st = useStore.getState();
        localStorage.setItem('cupset-autosave', JSON.stringify({
          name: st.projectName, tracks: st.tracks,
          clips: st.clips.map((c) => ({ ...c, url: c.type === 'text' || c.type === 'shape' ? undefined : undefined })),
        }));
      } catch { /* noop */ }
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if (e.code === 'Space') { e.preventDefault(); st.setPlaying(!st.playing); }
      else if (e.key === 's' || e.key === 'S' || e.key === 'س') st.splitAt(st.currentTime);
      else if (e.key === 'Delete' || e.key === 'Backspace') st.deleteSelected();
      else if (e.key === 'ArrowRight') st.setTime(st.currentTime + (e.shiftKey ? 2 : 1 / 30));
      else if (e.key === 'ArrowLeft') st.setTime(Math.max(0, st.currentTime - (e.shiftKey ? 2 : 1 / 30)));
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div style={{ height: '100%' }}>
      <header className="top">
        <div className="logo">C</div>
        <div className="brand">Cup<small>Set</small></div>
        <input type="text" value={name} onChange={(e) => useStore.getState().setName(e.target.value)}
          style={{ maxWidth: 220, background: '#0d1322', border: '1px solid var(--line)', color: 'var(--txt)', borderRadius: 9, padding: '7px 10px', fontSize: 13 }} />
        <span className="time">محرر فيديو داخل المتصفح • سريع • بدون رفع • بدون علامة مائية</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => useStore.getState().undo()}>↩</button>
        <button className="btn sm" onClick={() => useStore.getState().redo()}>↪</button>
        <button className="btn sm danger" onClick={() => { if (confirm('مسح كل المقاطع؟')) useStore.getState().clearAll(); }}>🗑 جديد</button>
        <button className="btn pri" onClick={() => window.dispatchEvent(new Event('cupset-export'))}>📤 تصدير</button>
      </header>

      <div className="layout">
        <div className="col"><MediaBin toast={toast} /></div>
        <div className="col mid">
          <Preview toast={toast} />
          <Timeline />
        </div>
        <div className="col right"><Inspector toast={toast} /></div>
      </div>

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
