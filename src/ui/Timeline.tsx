import { useMemo, useRef, useState } from 'react';
import { useStore, totalDuration } from '../store';
import { STR } from '../i18n';
import { fmt } from '../types';

export default function Timeline() {
  const tracks = useStore((s) => s.tracks);
  const clips = useStore((s) => s.clips);
  const time = useStore((s) => s.currentTime);
  const zoom = useStore((s) => s.zoom);
  const laneH = useStore((s) => s.laneH);
  const lang = useStore((s) => s.lang);
  const t = STR[lang];
  const rtl = lang === 'ar';
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

  // horizontal position of a timeline second (mirrored in RTL)
  const edge = (sec: number) => (rtl ? { right: sec * zoom } : { left: sec * zoom });

  const seek = (e: React.MouseEvent) => {
    const lane = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = rtl
      ? (lane.right - e.clientX) / (lane.width || 1)
      : (e.clientX - lane.left) / (lane.width || 1);
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
    const fwd = rtl ? -dx : dx; // dragging towards the future
    if (drag.mode === 'move') {
      let ns = Math.max(0, drag.origStart + fwd);
      if (Math.abs(ns - st.currentTime) < 0.2) ns = st.currentTime;
      const laneEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-track]') as HTMLElement | null;
      const trackId = laneEl?.dataset.track;
      const moved = st.clips.find((x) => x.id === drag.id);
      let nextTrack = trackId || moved?.trackId || drag.id;
      const tr = useStore.getState().tracks.find((x) => x.id === nextTrack);
      if (moved && tr && ((moved.type === 'audio' && tr.kind !== 'audio') || (moved.type !== 'audio' && tr.kind === 'audio'))) {
        nextTrack = moved.trackId; // incompatible lane → stay
      }
      useStore.setState({ clips: st.clips.map((c) => (c.id === drag.id ? { ...c, start: ns, trackId: nextTrack } : c)) });
    } else if (drag.mode === 'l') {
      // start edge
      const ns = Math.max(0, drag.origStart + fwd);
      const d = drag.origDur - (ns - drag.origStart);
      if (d < 0.2) return;
      useStore.setState({
        clips: st.clips.map((c) => (c.id === drag.id ? { ...c, start: ns, duration: d, offset: Math.max(0, drag.origOff + (ns - drag.origStart)) } : c)),
      });
    } else {
      const d = Math.max(0.2, drag.origDur + fwd);
      useStore.setState({ clips: st.clips.map((c) => (c.id === drag.id ? { ...c, duration: d } : c)) });
    }
  };

  const gridBg = `repeating-linear-gradient(to ${rtl ? 'left' : 'right'}, rgba(148,163,184,.20) 0 1px, transparent 1px ${zoom}px)`;

  return (
    <div className="timeline" ref={wrapRef} onPointerMove={onMove} onPointerUp={() => setDrag(null)}>
      <div className="row tl-tools">
        <button className="btn sm" onClick={() => useStore.getState().setZoom(zoom + 18)}>{t.zoomIn}</button>
        <button className="btn sm" onClick={() => useStore.getState().setZoom(zoom - 18)}>{t.zoomOut}</button>
        <button className="btn sm" onClick={() => useStore.getState().setLaneH(laneH + 16)} title={t.tallerTip}>↕＋</button>
        <button className="btn sm" onClick={() => useStore.getState().setLaneH(laneH - 16)} title={t.shorterTip}>↕−</button>
        <button className="btn sm" onClick={() => useStore.getState().splitAt(time)}>{t.split}</button>
        <button className="btn sm danger" onClick={() => useStore.getState().deleteSelected()}>{t.del}</button>
        <button className="btn sm" onClick={() => useStore.getState().undo()}>{t.undo}</button>
        <button className="btn sm" onClick={() => useStore.getState().redo()}>{t.redo}</button>
        <span className="time" style={{ marginInlineStart: 'auto' }}>⏱ <span dir="ltr">{fmt(time)} / {fmt(dur)}</span></span>
      </div>

      {/* ruler aligned with lanes */}
      <div className="trow ruler-row">
        <div className="r-corner">{t.timeWord}</div>
        <div className="ruler" style={{ width }} onClick={seek}>
          {ticks.map((tk) => (
            <span key={tk} className="tick" style={edge(tk)}>{fmt(tk)}</span>
          ))}
          <div className="playhead" style={edge(time)} />
        </div>
      </div>

      {tracks.map((tr) => {
        const tclips = clips.filter((c) => c.trackId === tr.id);
        return (
          <div className="trow" key={tr.id}>
            <div className="thead" style={{ minHeight: laneH }}>
              <b>{tr.name}</b>
              <span className="time">{tr.kind === 'audio' ? t.kindAudio : tr.kind === 'video' ? t.kindVideo : t.kindOverlay}</span>
              <div className="ops">
                <button className={`chip ${tr.locked ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'locked')} title={t.tipLock}>🔒</button>
                <button className={`chip ${tr.hidden ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'hidden')} title={t.tipEye}>👁</button>
                {tr.kind === 'audio' && <button className={`chip ${tr.muted ? 'on' : ''}`} onClick={() => useStore.getState().toggleTrack(tr.id, 'muted')} title={t.tipMute}>🔇</button>}
              </div>
            </div>
            <div
              className="lane" data-track={tr.id}
              style={{ width, height: laneH, backgroundImage: gridBg, opacity: tr.hidden ? 0.45 : 1 }}
              onClick={seek}
            >
              <div className="playhead" style={edge(time)} />
              {tclips.length === 0 && <span className="lane-empty">{t.emptyTrack}</span>}
              {tclips.map((c) => (
                <div
                  key={c.id}
                  className={`clip ${c.type} ${selectedId === c.id ? 'sel' : ''}`}
                  style={{ ...edge(c.start), width: Math.max(26, c.duration * zoom), top: 8, height: Math.max(40, laneH - 16), fontSize: laneH > 104 ? 13.5 : 12.5 }}
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
      <div className="time tl-hint">{t.hint1}<span className="kbd">S</span>{t.hintSplit}<span className="kbd">Space</span>{t.hintPlay}<span className="kbd">Del</span>{t.hintDel}</div>
    </div>
  );
}
