import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend as RLegend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getPresidentState, getPresidentHistory } from "../api";
import CountyPanel from "./CountyPanel.jsx";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

export default function StateDetail({ cycleYear, code, name, hasCounty }) {
  const [data, setData] = useState(null);
  const [hist, setHist] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setData(null); setErr(null); setHist(null);
    if (!cycleYear || !code) return;
    getPresidentState(cycleYear, code).then(setData).catch((e) => setErr(String(e)));
    getPresidentHistory(code).then(setHist).catch(() => setHist(null));
  }, [cycleYear, code]);

  if (!code) return <div className="detail empty">주를 클릭하면 후보별 득표·역대 추이가 보입니다.</div>;
  if (err) return <p className="hint">상세를 불러오지 못했습니다. ({err})</p>;
  if (!data) return <p className="muted">불러오는 중…</p>;

  const cands = data.candidates || [];

  return (
    <>
      <h2>
        {name} <span className="office-badge">대통령선거 {cycleYear}</span>
        {data.ev != null && <span className="ev-badge">{data.ev} 선거인단</span>}
      </h2>

      <h3 className="sec-title">후보별 득표 <span className="muted">({cands.length})</span></h3>
      <table className="cand-table">
        <thead>
          <tr><th></th><th>후보</th><th>정당</th><th className="num">득표수</th><th className="num">득표율</th></tr>
        </thead>
        <tbody>
          {cands.map((c, i) => (
            <tr key={i} className={c.is_elected ? "elected-row" : ""}>
              <td><span className="dot" style={{ background: c.color_hex || "#bbb" }} /></td>
              <td>{c.name}{c.is_elected ? <span className="win-tag">승</span> : null}</td>
              <td>{c.abbr}</td>
              <td className="num">{fmt(c.votes)}</td>
              <td className="num">{c.vote_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasCounty ? (
        <CountyPanel cycleYear={cycleYear} stateCode={code} stateName={name} />
      ) : (
        <p className="hint county-note">※ 카운티 단위 결과는 2008년 이후 사이클에서 제공됩니다.</p>
      )}

      {hist?.trend?.length > 0 && (
        <>
          <h3 className="sec-title">역대 대선 득표율 추이 (민주 vs 공화)</h3>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={hist.trend} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="cycle_year" fontSize={11} />
              <YAxis fontSize={11} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="DEM" name="민주" stroke="#1565C0" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="REP" name="공화" stroke="#D32F2F" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {hist?.winners?.length > 0 && (
        <>
          <h3 className="sec-title">역대 대선 승자</h3>
          <ul className="winners-list">
            {hist.winners.map((h) => (
              <li key={h.cycle_year}>
                <span className="yr">{h.cycle_year}</span>
                <span className="swatch sm" style={{ background: h.color_hex }} />
                {h.winner_name}
                <span className="party">{h.abbr} {h.winner_rate}% · {h.ev}표</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
