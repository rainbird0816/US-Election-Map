import { useEffect, useRef, useState } from "react";

// 지도 확대·이동 래퍼(SVG). +/− 버튼, 드래그 이동, Ctrl(⌘)+휠 확대, 더블클릭 확대.
// 일반 휠은 페이지 스크롤에 양보한다. 경계선은 CSS vector-effect 로 확대해도 두께 유지(.zoom-pane path).
// 드래그 후 놓을 때 발생하는 클릭은 무시(지역 선택 오작동 방지).
const MAX = 12;

export default function ZoomPane({ width, height, className = "", resetKey, children, label }) {
  const svgRef = useRef(null);
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  const moved = useRef(false);
  const [hint, setHint] = useState(false);

  useEffect(() => { setT({ k: 1, x: 0, y: 0 }); }, [resetKey]);

  // 화면 좌표 → viewBox 좌표
  const toLocal = (cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((cx - r.left) / r.width) * width, ((cy - r.top) / r.height) * height];
  };
  const clamp = (n) => {
    const k = Math.max(1, Math.min(MAX, n.k));
    // 지도가 화면 밖으로 완전히 빠지지 않게 이동 범위 제한
    const x = Math.min(0, Math.max(width - width * k, n.x));
    const y = Math.min(0, Math.max(height - height * k, n.y));
    return { k, x, y };
  };
  const zoomAt = (px, py, factor) =>
    setT((p) => {
      const k = Math.max(1, Math.min(MAX, p.k * factor));
      const f = k / p.k;
      return clamp({ k, x: px - (px - p.x) * f, y: py - (py - p.y) * f });
    });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) { setHint(true); clearTimeout(onWheel.tm); onWheel.tm = setTimeout(() => setHint(false), 1200); return; }
      e.preventDefault();
      const [px, py] = toLocal(e.clientX, e.clientY);
      zoomAt(px, py, e.deltaY < 0 ? 1.25 : 0.8);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, x: t.x, y: t.y };
    moved.current = false;
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const r = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - d.sx) / r.width) * width, dy = ((e.clientY - d.sy) / r.height) * height;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    if (moved.current && t.k > 1) setT(clamp({ k: t.k, x: d.x + dx, y: d.y + dy }));
  };
  const onUp = () => { drag.current = null; };
  const onClickCapture = (e) => { if (moved.current) { e.stopPropagation(); moved.current = false; } };
  const onDbl = (e) => { const [px, py] = toLocal(e.clientX, e.clientY); zoomAt(px, py, 2); };
  const btn = (f) => zoomAt(width / 2, height / 2, f);

  return (
    <div className={`zoom-wrap ${className}`}>
      <svg ref={svgRef} className={`zoom-pane${t.k > 1 ? " zoomed" : ""}`} viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label={label}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        onClickCapture={onClickCapture} onDoubleClick={onDbl}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>{children}</g>
      </svg>
      <div className="zoom-ctl">
        <button onClick={() => btn(1.6)} aria-label="확대">+</button>
        <button onClick={() => btn(1 / 1.6)} aria-label="축소" disabled={t.k <= 1}>−</button>
        <button onClick={() => setT({ k: 1, x: 0, y: 0 })} aria-label="원래 크기" disabled={t.k <= 1} className="zoom-reset">⟲</button>
      </div>
      {hint && <div className="zoom-hint">Ctrl + 스크롤로 확대 · 드래그로 이동</div>}
    </div>
  );
}
