const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

// 대선 주별 요약 표(우측 기본 화면): 주 - 후보 - 정당 - 득표수 - 득표율(그 사이클 승자 기준).
// 행 클릭 시 해당 주 상세로. 정렬: 주 이름 가나다/ABC순.
export default function StateSummaryTable({ states, cycleYear, onSelect }) {
  const rows = [...(states || [])].sort((a, b) =>
    (a.region_name || "").localeCompare(b.region_name || ""));
  if (!rows.length) return <div className="detail empty">불러오는 중…</div>;
  return (
    <>
      <h2>주별 선거 요약 <span className="office-badge">대통령선거 {cycleYear}</span>
        <span className="ev-badge">{rows.length}개 주</span>
      </h2>
      <p className="hint">행을 클릭하면 해당 주 상세(후보·카운티·추이)가 표시됩니다.</p>
      <div className="county-wrap full">
        <table className="cand-table county-table summary-table">
          <thead>
            <tr><th>주</th><th>후보</th><th>정당</th><th className="num">득표수</th><th className="num">득표율</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const top = (s.top_parties_json || [])[0] || {};
              return (
                <tr key={s.region_code} style={{ cursor: "pointer" }}
                  onClick={() => onSelect(s.region_code)}>
                  <td>{s.region_name}</td>
                  <td>{s.winner_name || top.name || "—"}</td>
                  <td><span className="dot" style={{ background: s.color_hex || "#bbb" }} /> {s.abbr}</td>
                  <td className="num">{fmt(top.votes)}</td>
                  <td className="num">{s.winner_rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
