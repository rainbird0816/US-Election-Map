import { useEffect, useMemo, useState } from "react";
import MapUS from "../maps/MapUS.jsx";
import SmallStates from "../components/SmallStates.jsx";
import Legend from "../components/Legend.jsx";
import ECBar from "../components/ECBar.jsx";
import ElectionNotes from "../components/ElectionNotes.jsx";
import { getPresidentElections, getPresidentNational, getPresidentMap } from "../api";
import { shadeByMargin, marginFromTop } from "../util/shade";
import { POTUS, portraitUrl } from "../content/presidents";

const noop = () => {};
const PARTY_KO = { DEM: "민주", REP: "공화" };

// 초상화 — 로드 실패 시 이니셜 원형으로 우아하게 대체.
function Portrait({ person, color }) {
  const [err, setErr] = useState(false);
  const url = person?.img && !err ? portraitUrl(person.img) : null;
  if (url)
    return (
      <img className="pc-photo" src={url} alt={person.en} loading="lazy"
        style={{ borderColor: color }} onError={() => setErr(true)} />
    );
  const initials = (person?.en || "?").split(" ").map((w) => w[0]).slice(0, 2).join("");
  return <div className="pc-photo pc-fallback" style={{ borderColor: color }}>{initials}</div>;
}

function CandidateCard({ c, person, winner }) {
  const ko = person?.ko || c.cand_name;
  const partyKo = PARTY_KO[c.abbr] || c.party_name;
  return (
    <div className={`potus-card${winner ? " is-winner" : ""}`}>
      <Portrait person={person} color={c.color_hex} />
      <div className="pc-meta">
        <div className="pc-toprow">
          <span className="pc-party" style={{ background: c.color_hex }}>{partyKo}</span>
          <span className={`pc-flag${winner ? " win" : ""}`}>{winner ? "당선" : "낙선"}</span>
        </div>
        <div className="pc-name">{ko}</div>
        {person?.en && <div className="pc-en">{person.en}</div>}
        <div className="pc-ev"><b style={{ color: c.color_hex }}>{c.ev}</b> 선거인단</div>
        <div className="pc-pv">전국 득표 {c.pv_pct}%</div>
      </div>
    </div>
  );
}

export default function PotusHistory() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null);
  const [nat, setNat] = useState(null);
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPresidentElections()
      .then((cs) => {
        const ys = cs.map((c) => c.cycle_year);
        setYears(ys);
        if (ys.length) setYear(ys[ys.length - 1]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!year) return;
    setNat(null); setMap(null); setError(null);
    Promise.all([getPresidentNational(year), getPresidentMap(year)])
      .then(([n, m]) => { setNat(n); setMap(m); })
      .catch((e) => setError(String(e)));
  }, [year]);

  const colorByCode = useMemo(() => {
    const m = {};
    for (const s of map?.states || [])
      m[s.region_code] = shadeByMargin(s.color_hex, marginFromTop(s.top_parties_json));
    return m;
  }, [map]);

  const cards = useMemo(() => {
    if (!nat) return [];
    const meta = POTUS[year] || {};
    return nat.candidates.map((c, i) => ({ c, person: meta[c.abbr], winner: i === 0 }));
  }, [nat, year]);

  const idx = years.indexOf(year);
  const go = (d) => { const j = idx + d; if (j >= 0 && j < years.length) setYear(years[j]); };
  const third = nat?.third && POTUS[year]?.third;

  return (
    <div className="potus-page">
      <div className="potus-nav">
        <button className="pn-arrow" disabled={idx <= 0} onClick={() => go(-1)}>← 이전</button>
        <div className="pn-year">{year || "—"}<span> 대통령선거</span></div>
        <button className="pn-arrow" disabled={idx < 0 || idx >= years.length - 1} onClick={() => go(1)}>다음 →</button>
      </div>

      <div className="potus-timeline">
        {years.map((y) => (
          <button key={y} className={`pt-chip${y === year ? " on" : ""}`} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>

      {error && <div className="error">불러오기 오류: {error}</div>}

      {cards.length > 0 && (
        <div className="potus-cards">
          {cards[0] && <CandidateCard {...cards[0]} />}
          <div className="potus-vs">VS</div>
          {cards[1] && <CandidateCard {...cards[1]} />}
        </div>
      )}

      {third && (
        <p className="potus-third">
          그 외 주요 후보 · <b>{third.ko}</b>
          <span className="muted"> ({third.party}) · 전국 득표 {nat.third.pv_pct}%</span>
        </p>
      )}

      {nat?.ec && <ECBar ec={nat.ec} />}

      <ElectionNotes office="president" cycleYear={year} />

      <div className="potus-map">
        <MapUS colorByCode={colorByCode} selectedCode={null} onSelect={noop} />
        <SmallStates states={map?.states} colorByCode={colorByCode} selectedCode={null} onSelect={noop} />
        <Legend states={map?.states} />
        <p className="hint">주별 승자 정당색(격차가 클수록 진하게). 선거인단·전국 득표는 ME/NE 선거구 분할을 반영합니다.</p>
      </div>
    </div>
  );
}
