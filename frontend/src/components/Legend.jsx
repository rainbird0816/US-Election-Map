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
  // 색 농도 그라데이션 안내(접전=옅음 → 안정=진함). 1·2위 색을 샘플로 사용.
  const sample = items[0]?.color || "#888";
  return (
    <div className="legend-wrap">
      <div className="legend">
        {items.map((it) => (
          <span className="legend-item" key={it.party}>
            <span className="swatch" style={{ background: it.color }} />
            {it.party} <span className="muted">({it.n})</span>
          </span>
        ))}
      </div>
      <div className="legend-grad" title="색이 진할수록 큰 격차(안정), 옅을수록 접전">
        <span className="muted">접전</span>
        <span className="grad-bar" style={{
          background: `linear-gradient(90deg, ${sample}33, ${sample})`,
        }} />
        <span className="muted">안정</span>
        <span className="muted grad-note">(격차 클수록 진하게)</span>
      </div>
    </div>
  );
}
