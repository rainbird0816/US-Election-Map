import { useEffect, useMemo, useState } from "react";
import MapUS from "../maps/MapUS.jsx";
import SmallStates from "../components/SmallStates.jsx";
import Legend from "../components/Legend.jsx";
import ECBar from "../components/ECBar.jsx";
import ElectionNotes from "../components/ElectionNotes.jsx";
import { getPresidentElections, getPresidentNational, getPresidentMap } from "../api";
import { shadeByMargin, marginFromTop } from "../util/shade";
import { POTUS, POTUS_HIST, HIST_PEOPLE, PARTY_HIST, portraitUrl } from "../content/presidents";

const noop = () => {};
const PARTY_KO = { DEM: "민주", REP: "공화" };
const HIST_FROM = 1976;   // 이 미만은 역대(큐레이션) 경로

// 초상화 — 로드 실패 시 이니셜 원형으로 대체.
function Portrait({ card }) {
  const [err, setErr] = useState(false);
  const url = card.img && !err ? portraitUrl(card.img) : null;
  if (url)
    return (
      <img className="pc-photo" src={url} alt={card.en || card.ko} loading="lazy"
        style={{ borderColor: card.color }} onError={() => setErr(true)} />
    );
  const initials = (card.en || card.ko || "?").split(" ").map((w) => w[0]).slice(0, 2).join("");
  return <div className="pc-photo pc-fallback" style={{ borderColor: card.color }}>{initials}</div>;
}

function CandidateCard({ card }) {
  return (
    <div className={`potus-card${card.winner ? " is-winner" : ""}`}>
      <Portrait card={card} />
      <div className="pc-meta">
        <div className="pc-toprow">
          <span className="pc-party" style={{ background: card.color }}>{card.partyKo}</span>
          <span className={`pc-flag${card.winner ? " win" : ""}`}>{card.winner ? "당선" : "차점"}</span>
        </div>
        <div className="pc-name">{card.ko}</div>
        {card.en && <div className="pc-en">{card.en}</div>}
        <div className="pc-ev"><b style={{ color: card.color }}>{card.ev}</b> 선거인단</div>
        {card.pv != null && <div className="pc-pv">전국 득표 {card.pv}%</div>}
      </div>
    </div>
  );
}

// 역대(시대별 정당이 다양) 전용 EC 바 — 당선·차점·기타를 정당색으로, 과반선 표시.
function HistECBar({ cards, total, note }) {
  if (!cards.length || !total) return null;
  const win = cards[0], run = cards[1] || {};
  const others = Math.max(0, total - (win.ev || 0) - (run.ev || 0));
  const denom = (win.ev || 0) + (run.ev || 0) + others || total;
  const maj = Math.floor(total / 2) + 1;
  const pct = (v) => `${(100 * v) / denom}%`;
  return (
    <div className="ec-bar-wrap">
      <div className="ec-head">
        <span className="ec-side" style={{ color: win.color }}><b>{win.ev}</b> {win.partyKo}</span>
        <span className="ec-mid"><span className="ec-winner">과반 {maj}석</span></span>
        <span className="ec-side" style={{ color: run.color }}>{run.partyKo} <b>{run.ev}</b></span>
      </div>
      <div className="ec-bar">
        <div className="seg" style={{ width: pct(win.ev || 0), background: win.color }} />
        {run.ev > 0 && <div className="seg" style={{ width: pct(run.ev), background: run.color }} />}
        {others > 0 && <div className="seg" style={{ width: pct(others), background: "#cfcfcf" }} />}
        <div className="ec-majority no-label" style={{ left: pct(maj) }} title={`과반 ${maj}석`} />
      </div>
      <div className="ec-foot">
        <span>총 {total} 선거인단</span>
        {others > 0 && <span className="muted"> · 기타 {others}</span>}
        {note && <span className="muted"> · {note}</span>}
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

  const isHist = year != null && year < HIST_FROM;

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
    if (year < HIST_FROM) {
      getPresidentMap(year).then(setMap).catch((e) => setError(String(e)));
    } else {
      Promise.all([getPresidentNational(year), getPresidentMap(year)])
        .then(([n, m]) => { setNat(n); setMap(m); })
        .catch((e) => setError(String(e)));
    }
  }, [year]);

  const colorByCode = useMemo(() => {
    const m = {};
    for (const s of map?.states || [])
      m[s.region_code] = shadeByMargin(s.color_hex, marginFromTop(s.top_parties_json));
    return m;
  }, [map]);

  // 양 시대를 공통 카드 형태로 정규화: {ko,en,img,partyKo,color,ev,pv,winner}
  const cards = useMemo(() => {
    if (year == null) return [];
    if (year < HIST_FROM) {
      const e = POTUS_HIST[year];
      if (!e) return [];
      return e.c.map(([key, party, ev], i) => {
        const p = HIST_PEOPLE[key] || {};
        const pm = PARTY_HIST[party] || {};
        return { ko: p.ko, en: p.en, img: p.img, partyKo: pm.ko, color: pm.color, ev, pv: null, winner: i === 0 };
      });
    }
    if (!nat) return [];
    const meta = POTUS[year] || {};
    return nat.candidates.map((c, i) => {
      const p = meta[c.abbr] || {};
      return { ko: p.ko || c.cand_name, en: p.en, img: p.img,
        partyKo: PARTY_KO[c.abbr] || c.party_name, color: c.color_hex,
        ev: c.ev, pv: c.pv_pct, winner: i === 0 };
    });
  }, [nat, year]);

  const idx = years.indexOf(year);
  const go = (d) => { const j = idx + d; if (j >= 0 && j < years.length) setYear(years[j]); };
  const histMeta = isHist ? POTUS_HIST[year] : null;
  const modernThird = !isHist && nat?.third && POTUS[year]?.third;

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
          {cards[0] && <CandidateCard card={cards[0]} />}
          <div className="potus-vs">VS</div>
          {cards[1] && <CandidateCard card={cards[1]} />}
        </div>
      )}

      {modernThird && (
        <p className="potus-third">
          그 외 주요 후보 · <b>{POTUS[year].third.ko}</b>
          <span className="muted"> ({POTUS[year].third.party}) · 전국 득표 {nat.third.pv_pct}%</span>
        </p>
      )}

      {isHist
        ? <HistECBar cards={cards} total={histMeta?.ev} note={histMeta?.note} />
        : (nat?.ec && <ECBar ec={nat.ec} />)}

      <ElectionNotes office="president" cycleYear={year} />

      <div className="potus-map">
        <MapUS colorByCode={colorByCode} selectedCode={null} onSelect={noop} />
        <SmallStates states={map?.states} colorByCode={colorByCode} selectedCode={null} onSelect={noop} />
        <Legend states={map?.states} />
        <p className="hint">
          주별 승자 정당색(격차가 클수록 진하게).
          {isHist
            ? " 당시 주(州)가 아니던 지역은 비워둡니다. 선거인단·득표는 큐레이션 사료 기준."
            : " 선거인단·전국 득표는 ME/NE 선거구 분할을 반영합니다."}
        </p>
      </div>
    </div>
  );
}
