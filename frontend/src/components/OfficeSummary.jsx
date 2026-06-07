// 상원/하원/주지사 요약 바 — 정당별 의석(또는 승리 주) 수 누적 막대 + 범례.
export default function OfficeSummary({ office, summary, cycleYear }) {
  if (!summary) return null;
  const total = summary.total || 1;
  const title =
    office === "house" ? `${cycleYear} 하원 — 전국 ${summary.total}석`
      : office === "senate" ? `${cycleYear} 상원 — 이번 사이클 ${summary.total}석 선출`
        : `${cycleYear} 주지사 — ${summary.total}개 주 선거`;

  return (
    <div className="ec-bar-wrap">
      <div className="ec-head">
        <span className="office-summary-title">{title}</span>
      </div>
      <div className="ec-bar">
        {summary.by_party.map((p) => (
          <div key={p.abbr} className="seg" title={`${p.party} ${p.count}`}
            style={{ width: `${(p.count / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {summary.by_party.map((p) => (
          <span key={p.abbr} className="legend-item">
            <span className="swatch" style={{ background: p.color }} />
            {p.party} <b>{p.count}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
