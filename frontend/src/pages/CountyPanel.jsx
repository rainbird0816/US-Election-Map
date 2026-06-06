import { useEffect, useState } from "react";
import { getPresidentCounties } from "../api";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

// 주 클릭 시 그 주의 카운티별(또는 town/CD) 결과 표. S8.
export default function CountyPanel({ cycleYear, stateCode, stateName }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    if (!cycleYear || !stateCode) return;
    getPresidentCounties(cycleYear, stateCode).then(setData).catch((e) => setErr(String(e)));
  }, [cycleYear, stateCode]);

  if (err) return null;
  if (!data) return <p className="muted">카운티 불러오는 중…</p>;
  const counties = data.counties || [];
  if (!counties.length) return null;

  // 단위 라벨: 대부분 county, 알래스카=하원선거구, 일부 뉴잉글랜드=town
  const level = counties[0].level;
  const unitLabel = level === "cd" ? "선거구" : "카운티/지역";

  return (
    <>
      <h3 className="sec-title">
        {stateName} {unitLabel}별 결과
        <span className="muted"> ({counties.length})</span>
      </h3>
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
                <tr key={c.code}>
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
