import { useEffect, useMemo, useState } from "react";
import { getCounties } from "../api";
import MapCounty from "../maps/MapCounty.jsx";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

// 주 클릭 시 그 주의 카운티별 결과: 분할 지도(승자 색) + 표 + 카운티 클릭 상세.
// office: 'president' | 'senate' (카운티 데이터 보유 office).
export default function CountyPanel({ office = "president", cycleYear, stateCode, stateName }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null); // 선택 카운티 code

  useEffect(() => {
    setData(null);
    setErr(null);
    setPicked(null);
    if (!cycleYear || !stateCode) return;
    getCounties(office, cycleYear, stateCode).then(setData).catch((e) => setErr(String(e)));
  }, [office, cycleYear, stateCode]);

  const counties = data?.counties || [];

  const { colorByCode, byCode } = useMemo(() => {
    const colorByCode = {};
    const byCode = {};
    for (const c of counties) {
      colorByCode[c.code] = c.color_hex;
      byCode[c.code] = c;
    }
    return { colorByCode, byCode };
  }, [counties]);

  if (err) return null;
  if (!data) return <p className="muted">카운티 불러오는 중…</p>;
  if (!counties.length) return null;

  // 단위 라벨: 대부분 county, 알래스카=하원선거구, 일부 뉴잉글랜드=town
  const level = counties[0].level;
  const unitLabel = level === "cd" ? "선거구" : "카운티/지역";
  const sel = picked ? byCode[picked] : null;

  return (
    <>
      <h3 className="sec-title">
        {stateName} {unitLabel}별 지도
        <span className="muted"> ({counties.length})</span>
      </h3>

      <MapCounty
        stateCode={stateCode}
        colorByCode={colorByCode}
        selectedCode={picked}
        onSelect={(code) => setPicked((p) => (p === code ? null : code))}
      />

      {sel ? (
        <div className="county-detail">
          <div className="county-detail-head">
            <strong>{sel.region_name}</strong>
            <span className="muted"> · 총 {fmt(sel.votes)}표 · 1위 {sel.abbr} {sel.vote_rate}%</span>
          </div>
          <table className="cand-table">
            <tbody>
              {(sel.candidates || []).map((c, i) => (
                <tr key={i} className={c.is_elected ? "elected-row" : ""}>
                  <td><span className="dot" style={{ background: c.color_hex || "#bbb" }} /></td>
                  <td>{c.name}</td>
                  <td>{c.abbr}</td>
                  <td className="num">{fmt(c.votes)}</td>
                  <td className="num">{c.vote_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">지도에서 {unitLabel}를 클릭하면 후보별 득표가 표시됩니다.</p>
      )}

      <div className="county-wrap">
        <table className="cand-table county-table">
          <thead>
            <tr>
              <th>{unitLabel}</th>
              <th>승자</th>
              <th className="num">득표율</th>
              <th className="num">득표차</th>
            </tr>
          </thead>
          <tbody>
            {counties.map((c) => {
              const cs = c.candidates || [];
              const margin = cs.length > 1 ? (cs[0].vote_rate - cs[1].vote_rate).toFixed(1) : null;
              return (
                <tr
                  key={c.code}
                  className={c.code === picked ? "row-active" : ""}
                  onClick={() => setPicked((p) => (p === c.code ? null : c.code))}
                  style={{ cursor: "pointer" }}
                >
                  <td>{c.region_name}</td>
                  <td>
                    <span className="dot" style={{ background: c.color_hex }} /> {c.abbr}
                  </td>
                  <td className="num">{c.vote_rate}%</td>
                  <td className="num">{margin != null ? `+${margin}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
