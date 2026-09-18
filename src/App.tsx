import { useCallback, useEffect, useState } from 'react';
import Preview from './ui/Preview';
import Timeline from './ui/Timeline';
import { Inspector, MediaBin } from './ui/Panels';
import { useStore, sanitize } from './store';
import { LANGS, STR } from './i18n';

function Logo() {
  return (
    <span className="logo" aria-hidden>
      <svg viewBox="0 0 64 64" width="26" height="26">
        <rect x="4" y="14" width="56" height="42" rx="10" fill="#fff" opacity="0.95" />
        <rect x="4" y="14" width="56" height="12" rx="6" fill="#0b0e14" />
        <path d="M12 14l6 12M24 14l6 12M36 14l6 12M48 14l6 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <path d="M27 33l14 8-14 8z" fill="#0b0e14" />
      </svg>
    </span>
  );
}

export default function App() {
  const name = useStore((s) => s.projectName);
  const lang = useStore((s) => s.lang);
  const t = STR[lang];
  const [toastMsg, setToastMsg] = useState('');
  const toast = useCallback((m: string) => { setToastMsg(m); }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // apply language + text direction to the document
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // self-heal once: sanitize any legacy bad values (NaN/null) then clamp time
  useEffect(() => {
    useStore.setState((s) => ({ clips: s.clips.map((c) => sanitize({ ...c })) }));
    const st = useStore.getState();
    st.setTime(st.currentTime);
  }, []);

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
          clips: st.clips.map((c) => ({ ...c, url: undefined })),
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
        <Logo />
        <div className="brand">Cup<small>Set</small></div>
        <input type="text" value={name} onChange={(e) => useStore.getState().setName(e.target.value)}
          style={{ maxWidth: 220, background: '#0d1322', border: '1px solid var(--line)', color: 'var(--txt)', borderRadius: 9, padding: '7px 10px', fontSize: 13 }} />
        <span className="time tagline">{t.tagline}</span>
        <span style={{ flex: 1 }} />
        <div className="langsw" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => useStore.getState().setLang(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={() => useStore.getState().undo()}>↩</button>
        <button className="btn sm" onClick={() => useStore.getState().redo()}>↪</button>
        <button className="btn sm danger" onClick={() => { if (confirm(t.confirmClear)) useStore.getState().clearAll(); }}>{t.newBtn}</button>
        <button className="btn pri" onClick={() => window.dispatchEvent(new Event('cupset-export'))}>{t.exportBtn}</button>
      </header>

      <div className="layout">
        <div className="col"><MediaBin toast={toast} /></div>
        <div className="col mid">
          <Preview toast={toast} />
          <Timeline />
        </div>
        <div className="col right"><Inspector toast={toast} /></div>
      </div>

      <footer className="foot">
        <span>{t.footer}</span><span className="ver">v2.0</span>
      </footer>

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
