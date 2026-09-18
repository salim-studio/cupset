import { useMemo, useRef, useState } from 'react';
import { useStore, totalDuration } from '../store';
import { fmt } from '../types';

export default function Timeline() {
  const tracks = useStore((s) => s.tracks);
  const clips = useStore((s) => s.clips);
  const time = useStore((s) => s.currentTime);
  const zoom = useStore((s) => s.zoom);
  const selectedId = useStore((s) => s.selectedId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<null | { id: string; mode: 'move' | 'l' | 'r'; x0: number; origStart: number; origDur: number; origOff: number }>(null);

  const dur = Math.max(10, totalDuration(clips) + 4);
  const width = Math.max(600, Math.round(dur * zoom));
  const ticks = useMemo(() => {
    const step = zoom > 140 ? 1 : zoom > 60 ? 2 : 5;
    const out: number[] = [];
    for (let t = 0; t <= dur; t += step) out.push(t);
    return out;
  }, [dur, zoom]);

  const seek = (e: React.MouseEvent) => {
    const lane = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // RTL: t=0 at the right edge
    const ratio = (lane.right - e.clientX) / (lane.width || 1);
    const v = ratio * dur;
    if (Number.isFinite(v)) useStore.getState().setTime(Math.max(0, v));
  };

  const onClipDown = (e: React.PointerEvent, id: string, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    const st = useStore.getState();
    const c = st.clips.find((x) => x.id === id); if (!c) return;
    st.select(id); st.pushHistory();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id, mode, x0: e.clientX, origStart: c.start, origDur: c.duration, origOff: c.offset });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const st = useStore.getState();
    const dx = (e.clientX - drag.x0) / st.zoom;
    if (!Number.isFinite(dx)) return;
    if (drag.mode === 'move') {
      // RTL: dragging leftwards increases time (mirror of LTR)
      let ns = Math.max(0, drag.origStart - dx);
      const t = st.currentTime;
      if (Math.abs(ns - t) < 0.2) ns = t;
      const laneEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-track]') as HTMLElement | null;
      const trackId = laneEl?.dataset.track;
      const cur = st.clips.find((x) => x.id === drag.id);
      let nextTrack = trackId || cur?.trackId || drag.id;
      const moved = st.clips.find((x) => x.id === drag.id);
      const tr = useStore.getState().tracks.find((x) => x.id === nextTrack);
      if (moved && tr && ((moved.type === 'audio' && tr.kind !== 'audio') || (moved.type !== 'audio' && tr.kind === 'audio'))) {
        nextTrack = moved.trackId; // incompatible lane → stay
      }
      useStore.setState({ clips: st.clips.map((c) => (c.id === drag.id ? { ...c, start: ns, trackId: nextTrack } : c)) });
    } else if (drag.mode === 'l') {
      // right handle (start edge in RTL)
      const ns = Math.max(0, drag.origStart - dx);
      const d = drag.origDur - (ns - drag.origStart);
      if (d < 0.2) return;
      useStore.setState({
        clips: st.clips.map((c) => (c.id === drag.id ? { ...c, start: ns, duration: d, offset: Math.max(0, drag.origOff + (ns - drag.origStart)) } : c)),
      });
    } else {
      const d = Math.max(0.2, drag.origDur - dx);
      useStore.setState({ clips: st.clips.map((c) => (c.id === drag.id ? { ...c, duration: d } : c)) });
    }
  };

  const gridBg = `repeating-linear-gradient(to left, rgba(148,163,184,.20) 0 1px, transparent 1px ${zoom}px)`;

  return (
    <div className="timeline" ref={wrapRef} onPointerMove={onMove} onPointerUp={() => setDrag(null)}>
      <div className="row tl-tools">
        <button className="btn sm" onClick={() => useStore.getState().setZoom(zoom + 18)}>＋ تقريب</button>
        <button className="btn sm" onClick={() => useStore.getState().setZoom(zoom - 18)}>− إبعاد</button>
        <button className="btn sm" onClick={() => useStore.getState().splitAt(time)}>✂ قص (S)</button>
        <button className="btn sm danger" onClick={() => useStore.getState().deleteSelected()}>🗑 حذف (Del)</button>
        <button className="btn sm" onClick={() => useStore.getState().undo()}>↩ تراجع</button>
        <button className="btn sm" onClick={() => useStore.getState().redo()}>↪ إعادة</button>
        <span className="time" style={{ marginInlineStart: 'auto' }}>⏱ {fmt(time)} / {fmt(dur)}</span>
      </div>

      {/* ruler aligned with lanes */}
      <div className="trow ruler-row">
        <div className="r-corner">الوقت</div>
        <div className="ruler" style={{ width }} onClick={seek}>
          {ticks.map((t) => (
            <span key={t} className="tick" style={{ right: t * zoom }}>{fmt(t)}</span>
          ))}
          <div className="playhead" style={{ right: time * zoom }} />
        </div>
      </div>

      {tracks.map((tr) => {
        const tclips = clips.filter((c) => c.trackId === tr.id);
        return (
          <div className="trow" key={tr.id}>
            <div className="thead">
              <b>{tr.name}</b>
              <span className="time">{tr.kind === 'audio' ? '🔊 صوت' : tr.kind === 'video' ? '🎬 فيديو' : '✨ تراكب'}</span>
              <div className="ops">
                <button className={`chip ${tr.locked ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'locked')} title="قفل">🔒</button>
                <button className={`chip ${tr.hidden ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'hidden')} title="إظهار/إخفاء">👁</button>
                {tr.kind === 'audio' && <button className={`chip ${tr.muted ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'muted')} title="كتم">🔇</button>}
              </div>
            </div>
            <div
              className="lane" data-track={tr.id}
              style={{ width, backgroundImage: gridBg, opacity: tr.hidden ? 0.45 : 1 }}
              onClick={seek}
            >
              <div className="playhead" style={{ right: time * zoom }} />
              {tclips.length === 0 && <span className="lane-empty">مسار فارغ — استورد وسائط من اللوحة الجانبية</span>}
              {tclips.map((c) => (
                <div
                  key={c.id}
                  className={`clip ${c.type} ${selectedId === c.id ? 'sel' : ''}`}
                  style={{ right: c.start * zoom, width: Math.max(26, c.duration * zoom) }}
                  onPointerDown={(e) => onClipDown(e, c.id, 'move')}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={() => useStore.getState().select(c.id)}
                  title={`${c.name} — ${fmt(c.start)} → ${fmt(c.start + c.duration)}`}
                >
                  <span className="handle l" onPointerDown={(e) => onClipDown(e, c.id, 'l')} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.type === 'video' ? '🎬' : c.type === 'image' ? '🖼' : c.type === 'audio' ? '🔊' : c.type === 'text' ? '🔤' : '⬛'} {c.name}
                  </span>
                  <span className="handle r" onPointerDown={(e) => onClipDown(e, c.id, 'r')} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="time tl-hint">💡 اسحب المقاطع للتحريك • اسحب الأطراف للتقليم • انقر على المسار للتنقل • <span className="kbd">S</span> قص • <span className="kbd">مسافة</span> تشغيل • <span className="kbd">Del</span> حذف</div>
    </div>
  );
}
