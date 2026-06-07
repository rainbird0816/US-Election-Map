// 면적이 작아 지도에서 식별·클릭이 어려운 주(+워싱턴 DC)를 사각형+약칭으로 별도 표시.
// 색은 본 지도와 동일(격차 농도 반영). 그 사이클에 데이터가 있는 주만 노출.
const SMALL = [
  ["11", "DC"], ["09", "CT"], ["10", "DE"], ["24", "MD"], ["25", "MA"],
  ["33", "NH"], ["34", "NJ"], ["44", "RI"], ["50", "VT"], ["15", "HI"],
];

export default function SmallStates({ states, colorByCode, selectedCode, onSelect }) {
  const byCode = {};
  for (const s of states || []) byCode[s.region_code] = s;
  const items = SMALL.filter(([fips]) => byCode[fips]);
  if (!items.length) return null;
  return (
    <div className="small-states">
      <span className="small-states-label">작은 주·DC</span>
      {items.map(([fips, po]) => {
        const s = byCode[fips];
        const sel = fips === selectedCode;
        return (
          <button
            key={fips}
            className={`small-state${sel ? " sel" : ""}`}
            title={`${s.region_name}${s.winner_rate != null ? ` · ${s.abbr} ${s.winner_rate}%` : ""}`}
            onClick={() => onSelect(fips)}
          >
            <span className="ss-swatch" style={{ background: colorByCode[fips] || "#ddd" }} />
            {po}
          </button>
        );
      })}
    </div>
  );
}
