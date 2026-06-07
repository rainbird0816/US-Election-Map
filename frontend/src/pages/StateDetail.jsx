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

  // 선택 연도까지만 표시(미래 결과 제외).
  const winnersUpTo = (hist?.winners || []).filter((w) => w.cycle_year <= cycleYear);

  // 득표 추이: 민주·공화 고정 순서가 아니라 '선택 연도에서 득표율 높은 정당'이 위로.
  const trend = (hist?.trend || []).filter((t) => t.cycle_year <= cycleYear);
  const last = trend[trend.length - 1] || {};
  const SERIES = {
    DEM: { key: "DEM", name: "민주", stroke: "#1565C0" },
    REP: { key: "REP", name: "공화", stroke: "#D32F2F" },
  };
  const orderedSeries = [SERIES.DEM, SERIES.REP].sort(
    (a, b) => (last[b.key] || 0) - (last[a.key] || 0)
  );

  // 주별 결과 분석 — DB 산출 데이터로만 구성(사실 기반, 추정 서술 없음).
  const stateAnalysis = (() => {
    const winners = winnersUpTo;
    const top2 = [...cands].sort((a, b) => (b.vote_rate || 0) - (a.vote_rate || 0)).slice(0, 2);
    const win = top2[0];
    if (!win) return null;
    const margin = top2[1] ? (win.vote_rate - top2[1].vote_rate).toFixed(1) : null;
    const idx = winners.findIndex((w) => w.cycle_year === cycleYear);
    const cur = idx >= 0 ? winners[idx] : null;
    const prev = idx > 0 ? winners[idx - 1] : null;
    const flipped = prev && cur && prev.abbr !== cur.abbr;
    const demW = winners.filter((w) => w.abbr === "DEM").length;
    const repW = winners.filter((w) => w.abbr === "REP").length;
    return { win, margin, cur, prev, flipped, demW, repW, n: winners.length };
  })();

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

      {data.ev_split && (
        <div className="ev-split">
          <h3 className="sec-title">선거인단 분할 배분
            {data.ev_split.is_split && <span className="win-tag">분할</span>}
          </h3>
          <p className="muted">
            {name}는 선거구 분할 방식 — 주 전체 승자가 <b>2표</b>(상원 몫)를, 각 하원 선거구 승자가 <b>1표</b>씩 가져갑니다.
          </p>
          <ul className="ev-split-list">
            {data.ev_split.items.map((it, i) => (
              <li key={i}>
                <span className="swatch sm" style={{ background: it.color_hex }} />
                <b>{it.label}</b>
                <span className="party">{it.abbr} · {it.n}표</span>
              </li>
            ))}
          </ul>
          <p className="ev-split-sum">
            합계: {data.ev_split.by_party.map((b) => `${b.abbr} ${b.ev}표`).join(" · ")}
          </p>
        </div>
      )}

      {stateAnalysis && (
        <div className="state-analysis">
          <h3 className="sec-title">이 주 결과 분석</h3>
          <p>
            <b>{name}</b>는 {cycleYear} 대선에서{" "}
            <span style={{ color: stateAnalysis.win.color_hex, fontWeight: 700 }}>
              {stateAnalysis.win.name}({stateAnalysis.win.abbr})
            </span>
            가 {stateAnalysis.win.vote_rate}%로 승리
            {stateAnalysis.margin != null ? <>, 2위와 <b>{stateAnalysis.margin}%p</b> 차였습니다.</> : "했습니다."}
            {stateAnalysis.cur?.ev != null && <> (선거인단 {stateAnalysis.cur.ev}표)</>}
          </p>
          <p className="muted">
            {stateAnalysis.flipped ? (
              <>직전 {stateAnalysis.prev.cycle_year}년 <b>{stateAnalysis.prev.abbr}</b> 우세에서 <b>{stateAnalysis.win.abbr}</b>로 뒤집혔습니다. </>
            ) : stateAnalysis.prev ? (
              <>직전 사이클에 이어 <b>{stateAnalysis.win.abbr}</b> 우세를 유지했습니다. </>
            ) : null}
            1976년 이후 이 주 대선 승자: 민주 {stateAnalysis.demW}회 · 공화 {stateAnalysis.repW}회
            {stateAnalysis.n ? ` (총 ${stateAnalysis.n}회)` : ""}.
          </p>
        </div>
      )}

      {hasCounty ? (
        <CountyPanel cycleYear={cycleYear} stateCode={code} stateName={name} />
      ) : (
        <p className="hint county-note">※ 카운티 단위 결과는 2008년 이후 사이클에서 제공됩니다.</p>
      )}

      {trend.length > 0 && (
        <>
          <h3 className="sec-title">역대 대선 득표율 추이 <span className="muted">(최근 우세 정당 순)</span></h3>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={trend} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="cycle_year" fontSize={11} />
              <YAxis fontSize={11} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} itemSorter={(item) => -item.value} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              {orderedSeries.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={s.stroke} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {winnersUpTo.length > 0 && (
        <>
          <h3 className="sec-title">역대 대선 승자 <span className="muted">(~{cycleYear})</span></h3>
          <ul className="winners-list">
            {winnersUpTo.map((h) => (
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
