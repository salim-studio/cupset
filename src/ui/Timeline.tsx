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
  const width = dur * zoom;
  const ticks = useMemo(() => {
    const step = zoom > 140 ? 1 : zoom > 60 ? 2 : 5;
    const out: number[] = [];
    for (let t = 0; t <= dur; t += step) out.push(t);
    return out;
  }, [dur, zoom]);

  const seek = (e: React.MouseEvent) => {
    const lane = (e.currentTarget as HTMLElement).getBoundingClientRect();
    useStore.getState().setTime(Math.max(0, ((e.clientX - lane.left) / (lane.width || 1)) * dur));
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
    // snap to playhead / neighbors
    if (drag.mode === 'move') {
      let ns = Math.max(0, drag.origStart + dx);
      const t = st.currentTime;
      if (Math.abs(ns - t) < 0.2) ns = t;
      // lane change by vertical movement
      const laneEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-track]') as HTMLElement | null;
      const trackId = laneEl?.dataset.track;
      // direct set without history spam
      useStore.setState({ clips: st.clips.map((c) => (c.id === drag.id ? { ...c, start: ns, trackId: trackId || c.trackId } : c)) });
      // validate track compat
      const c = useStore.getState().clips.find((x) => x.id === drag.id)!;
      const tr = useStore.getState().tracks.find((x) => x.id === c.trackId);
      if (tr && ((c.type === 'audio' && tr.kind !== 'audio') || (c.type !== 'audio' && tr.kind === 'audio'))) {
        useStore.setState({ clips: st.clips.map((x) => (x.id === drag.id ? { ...x, trackId: st.clips.find((y) => y.id === drag.id)!.trackId } : x)) });
      }
    } else if (drag.mode === 'l') {
      const ns = Math.max(0, drag.origStart + dx);
      const d = drag.origDur - (ns - drag.origStart);
      if (d < 0.2) return;
      useStore.setState({
        clips: st.clips.map((c) => (c.id === drag.id ? { ...c, start: ns, duration: d, offset: Math.max(0, drag.origOff + (ns - drag.origStart)) } : c)),
      });
    } else {
      const d = Math.max(0.2, drag.origDur + dx);
      useStore.setState({ clips: st.clips.map((c) => (c.id === drag.id ? { ...c, duration: d } : c)) });
    }
  };

  return (
    <div className="timeline" ref={wrapRef} onPointerMove={onMove} onPointerUp={() => setDrag(null)}>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn sm" onClick={() => useStore.getState().setZoom(zoom + 18)}>＋ تقريب</button>
        <button className="btn sm" onClick={() => useStore.getState().setZoom(zoom - 18)}>− إبعاد</button>
        <button className="btn sm" onClick={() => useStore.getState().splitAt(time)}>✂ قص (S)</button>
        <button className="btn sm danger" onClick={() => useStore.getState().deleteSelected()}>🗑 حذف (Del)</button>
        <button className="btn sm" onClick={() => useStore.getState().undo()}>↩ تراجع</button>
        <button className="btn sm" onClick={() => useStore.getState().redo()}>↪ إعادة</button>
        <span className="time" style={{ marginInlineStart: 'auto' }}>{fmt(time)}</span>
      </div>

      <div className="ruler" style={{ width }} onClick={seek}>
        {ticks.map((t) => (
          <span key={t} className="tick" style={{ right: t * zoom }}>{fmt(t)}</span>
        ))}
        <div className="playhead" style={{ right: time * zoom }} />
      </div>

      {tracks.map((tr) => (
        <div className="trow" key={tr.id}>
          <div className="thead">
            <b>{tr.name}</b>
            <span className="time">{tr.kind === 'audio' ? '🔊 صوت' : tr.kind === 'video' ? '🎬 فيديو' : '✨ تراكب'}</span>
            <div className="ops">
              <button className={`chip ${tr.locked ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'locked')}>🔒</button>
              <button className={`chip ${tr.hidden ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'hidden')}>👁</button>
              {tr.kind === 'audio' && <button className={`chip ${tr.muted ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'muted')}>🔇</button>}
            </div>
          </div>
          <div className="lane" data-track={tr.id} style={{ width, opacity: tr.hidden ? 0.45 : 1 }} onClick={seek}>
            <div className="playhead" style={{ right: time * zoom }} />
            {clips.filter((c) => c.trackId === tr.id).map((c) => (
              <div
                key={c.id}
                className={`clip ${c.type} ${selectedId === c.id ? 'sel' : ''}`}
                style={{ right: c.start * zoom, width: Math.max(26, c.duration * zoom) }}
                onPointerDown={(e) => onClipDown(e, c.id, 'move')}
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
      ))}
      <div className="time">💡 اسحب المقاطع للتحريك • اسحب الأطراف للتقليم • انقر على المسطرة للتنقل • <span className="kbd">S</span> قص • <span className="kbd">مسافة</span> تشغيل • <span className="kbd">Del</span> حذف</div>
    </div>
  );
}
