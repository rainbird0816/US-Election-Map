// 지도 범례 — 정당별 1개 + 주 수.
export default function Legend({ states }) {
  const seen = new Map();
  for (const s of states || []) {
    const key = s.party_name;
    if (!seen.has(key)) seen.set(key, { party: key, color: s.color_hex, n: 0 });
    seen.get(key).n += 1;
  }
  const items = [...seen.values()].sort((a, b) => b.n - a.n);
  if (!items.length) return null;
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="legend-item" key={it.party}>
          <span className="swatch" style={{ background: it.color }} />
          {it.party} <span className="muted">({it.n})</span>
        </span>
      ))}
    </div>
  );
}
