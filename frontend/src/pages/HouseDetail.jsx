import { useEffect, useMemo, useState } from "react";
import { getHouseDistricts } from "../api";

const fmt = (n) => (!n ? "—" : Number(n).toLocaleString());

// 의석 점유 도넛: segs=[{abbr,n,color}] (내림차순 전제), total=총 의석.
function SeatDonut({ segs, total }) {
  const size = 168, stroke = 30, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="seat-donut">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segs.map((s) => {
          const frac = s.n / total;
          const seg = (
            <circle key={s.abbr} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C}>
              <title>{`${s.abbr} ${s.n} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          acc += frac;
          return seg;
        })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" className="donut-num">{total}</text>
      <text x="50%" y="60%" textAnchor="middle" className="donut-label">의석</text>
    </svg>
  );
}

// 하원 주 상세: (상단) 주 의석 점유 다이어그램 + (목록) 선거구별 당선자 + 클릭 시 선거구 득표 결과.
export default function HouseDetail({ cycleYear, code, name }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null); // 선택 선거구 cd

  useEffect(() => {
    setData(null); setErr(null); setPicked(null);
    if (!code) return;
    getHouseDistricts(cycleYear, code).then(setData).catch((e) => setErr(String(e)));
  }, [cycleYear, code]);

  const districts = data?.districts || [];

  // 주 의석 점유(정당별 의석수) — 당선자 기준
  const tally = useMemo(() => {
    const m = {};
    for (const d of districts) {
      const w = d.winner;
      if (!w) continue;
      if (!m[w.abbr]) m[w.abbr] = { abbr: w.abbr, color: w.color_hex, n: 0 };
      m[w.abbr].n += 1;
    }
    return Object.values(m).sort((a, b) => b.n - a.n);
  }, [districts]);

  const total = districts.length || 1;

  if (!code) return <div className="detail empty">주를 클릭하면 선거구별 당선자가 보입니다.</div>;
  if (err) return <p className="hint">상세를 불러오지 못했습니다. ({err})</p>;
  if (!data) return <p className="muted">불러오는 중…</p>;

  const sel = picked ? districts.find((d) => d.cd === picked) : null;

  return (
    <>
      <h2>{name} <span className="office-badge">하원 {cycleYear}</span>
        <span className="ev-badge">{districts.length}개 선거구</span>
      </h2>

      {/* #4 주별 하원 의석 점유 — 도넛 + 당별 의석수(내림차순) */}
      <h3 className="sec-title">의석 점유</h3>
      <div className="seat-donut-wrap">
        <SeatDonut segs={tally} total={total} />
        <ul className="seat-legend">
          {tally.map((t) => (
            <li key={t.abbr}>
              <span className="swatch" style={{ background: t.color }} />
              <b>{t.abbr}</b>
              <span className="seat-legend-n">{t.n}석</span>
              <span className="seat-legend-pct">{Math.round((t.n / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="seat-dots">
        {districts.map((d) => (
          <span key={d.cd} className="seat-dot" title={d.label}
            style={{ background: d.winner?.color_hex || "#ddd" }} />
        ))}
      </div>

      {/* #2/#7 선거구 클릭 → 득표 결과 */}
      {sel ? (
        <div className="county-detail">
          <div className="county-detail-head">
            <strong>{sel.label}</strong>
            <span className="muted"> · 당선 {sel.winner?.name} ({sel.winner?.abbr})</span>
          </div>
          <table className="cand-table">
            <tbody>
              {(sel.candidates || []).map((c, i) => (
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
        </div>
      ) : (
        <p className="hint">아래 목록에서 선거구를 클릭하면 후보별 득표가 표시됩니다.</p>
      )}

      <h3 className="sec-title">선거구별 당선자</h3>
      <div className="county-wrap">
        <table className="cand-table county-table">
          <thead>
            <tr><th>선거구</th><th>당선자</th><th>정당</th><th className="num">득표율</th></tr>
          </thead>
          <tbody>
            {districts.map((d) => (
              <tr key={d.cd}
                className={d.cd === picked ? "row-active" : ""}
                onClick={() => setPicked((p) => (p === d.cd ? null : d.cd))}
                style={{ cursor: "pointer" }}>
                <td>{d.label}</td>
                <td>{d.winner?.name || "—"}</td>
                <td><span className="dot" style={{ background: d.winner?.color_hex || "#bbb" }} /> {d.winner?.abbr}</td>
                <td className="num">{d.winner?.vote_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
