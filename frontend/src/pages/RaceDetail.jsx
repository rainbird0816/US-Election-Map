import { useEffect, useState } from "react";
import { getOfficeState } from "../api";
import CountyPanel from "./CountyPanel.jsx";

const fmt = (n) => (!n ? "—" : Number(n).toLocaleString());
const LABEL = { senate: "상원", governor: "주지사" };

// 상원/주지사 주 상세: 후보별 득표(낙선 포함) + (상원·카운티 보유 시) 카운티 채색 지도.
export default function RaceDetail({ office, cycleYear, code, name, hasCounty }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setData(null); setErr(null);
    if (!code) return;
    getOfficeState(office, cycleYear, code).then(setData).catch((e) => setErr(String(e)));
  }, [office, cycleYear, code]);

  if (!code) return <div className="detail empty">주를 클릭하면 후보별 득표가 보입니다.</div>;
  if (err) return <p className="hint">상세를 불러오지 못했습니다. ({err})</p>;
  if (!data) return <p className="muted">불러오는 중…</p>;

  const cands = data.candidates || [];
  const specials = data.specials || [];

  const candTable = (rows) => (
    <table className="cand-table">
      <thead>
        <tr><th></th><th>후보</th><th>정당</th><th className="num">득표수</th><th className="num">득표율</th></tr>
      </thead>
      <tbody>
        {rows.map((c, i) => (
          <tr key={i} className={c.is_elected ? "elected-row" : ""}>
            <td><span className="dot" style={{ background: c.color_hex || "#bbb" }} /></td>
            <td>{c.name}{c.is_elected ? <span className="win-tag">당선</span> : null}</td>
            <td>{c.abbr}</td>
            <td className="num">{fmt(c.votes)}</td>
            <td className="num">{c.vote_rate}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <h2>{name} <span className="office-badge">{LABEL[office]} {cycleYear}</span></h2>
      {cands.length === 0 ? (
        <p className="hint">이 사이클에 {name}에서 해당 선거가 없었습니다.</p>
      ) : candTable(cands)}

      {/* 같은 사이클 보궐선거(예: 2022 OK, 2024 NE) — 별도 레이스로 표기 */}
      {specials.map((s, i) => (
        <div key={i} className="special-race">
          <h3 className="sec-title">{s.label} <span className="office-badge">보궐</span></h3>
          {candTable(s.candidates)}
        </div>
      ))}

      {office === "senate" && cands.length > 0 && hasCounty && (
        <CountyPanel office="senate" cycleYear={cycleYear} stateCode={code} stateName={name} />
      )}
      {office === "governor" && (
        <p className="hint">※ 주지사 데이터는 득표율(voteshare) 기반이라 일부 사이클은 득표수가 비어 있습니다.</p>
      )}
    </>
  );
}
