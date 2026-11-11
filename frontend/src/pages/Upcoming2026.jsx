import { useEffect, useMemo, useState } from "react";
import MapUS from "../maps/MapUS.jsx";
import SmallStates from "../components/SmallStates.jsx";
import { Photo, pLabel, prevText } from "./CongressRoster.jsx";
import { buildStates, GovPhoto, GOV_UP_2026, side, SPLIT, REF_MAX } from "./PoliticsPage.jsx";
import { getCongressRoster, getStateOverview } from "../api";
import { partyKo, partyColor } from "../content/parties";
import { GOV_TERM } from "../content/governor_terms";

// 상원·주지사 선거 탭의 '2026 (예정)': 선거 대상 주만 현직 정당색, 선거 없는 주는 회색(지도 기본값),
// 임명직 의석의 보궐선거는 사선. 결과가 DB에 들어오면 App 이 실제 2026 사이클을 쓰므로 이 화면은 빠진다.
const YEAR = 2026;
const ELECTION_DAY = "2026-11-03";
const senUp = (m) => m.sched_end.startsWith("2027") || m.how === "appointment";
// Class별 현 임기 만료 연도 — 임명직이라도 Class 2(2027 만료)면 2026년은 정규 선거, 그 외 Class 는 보궐
const CLASS_END = { 1: 2031, 2: 2027, 3: 2029 };
const isSpecial = (m) => m.how === "appointment" && CLASS_END[m.sen_class] !== YEAR + 1;
// 그 의석의 직전 정규 선거 연도(Class 1 = 2024, 2 = 2020, 3 = 2022)
const CLASS_LAST = { 1: 2024, 2: 2020, 3: 2022 };
const ymd = (d) => d.slice(0, 10).replace(/-/g, ".");

// 보궐 표시용 사선: 정당색 바탕 + 흰 줄
const hatchId = (key) => `hatch-${key}`;
const hatchCss = (c) => `repeating-linear-gradient(45deg, ${c} 0 4px, #fff 4px 6px)`;
const HATCH_KEYS = { REP: partyColor("REP"), DEM: partyColor("DEM"), IND: partyColor("IND"), SPLIT };
const HatchDefs = Object.entries(HATCH_KEYS).map(([k, c]) => (
  <pattern key={k} id={hatchId(k)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="6" height="6" fill={c} />
    <rect width="2" height="6" fill="#fff" />
  </pattern>
));

// 주별 2026 레이스: [{kind, party(진영), special, m|gov}]
function racesOf(isSen, s) {
  if (isSen) return s.sens.filter(senUp).map((m) => ({ kind: "sen", m, party: side(m.party, m.caucus), special: isSpecial(m) }));
  if (s.gov && GOV_UP_2026.has(s.po)) return [{ kind: "gov", gov: s.gov, party: s.gov.party, special: false }];
  return [];
}
function styleOf(races) {
  if (!races.length) return null;
  const ps = new Set(races.map((r) => r.party));
  const key = ps.size > 1 ? "SPLIT" : [...ps][0];
  const color = key === "SPLIT" ? SPLIT : partyColor(key);
  const special = races.some((r) => r.special);
  return { key, color, special };
}

function tipOf(isSen, s, races) {
  if (!s) return null;
  const title = `${s.ko} ${s.en}`;
  if (s.po === "DC") return { title, lines: [{ text: isSen ? "상원 의석 없음" : "주지사 대신 시장(Mayor)" }] };
  if (!races.length) {
    let next = null;
    if (isSen) next = Math.min(...s.sens.map((m) => Number(m.sched_end.slice(0, 4)) - 1));
    else next = GOV_TERM[s.po]?.[0];
    return { title, lines: [{ text: `2026년 ${isSen ? "상원" : "주지사"} 선거 없음`, sub: Number.isFinite(next) ? `· 다음 선거 ${next}년` : "" }] };
  }
  return {
    title,
    lines: races.map((r) => r.kind === "sen"
      ? { color: partyColor(r.m.party), text: `${r.m.name} (${pLabel(r.m)}${r.m.caucus && r.m.caucus !== r.m.party ? `·${partyKo(r.m.caucus)} 교섭` : ""})`,
          sub: `· Class ${r.m.sen_class}${r.special ? ` 보궐 · 남은 임기 ~${CLASS_END[r.m.sen_class]}.01` : ` 정규${r.m.how === "appointment" ? "(현직 임명)" : ""} · 임기 만료 ${YEAR + 1}.01.03`}` }
      : { color: partyColor(r.gov.party), text: `주지사 ${r.gov.name} (${partyKo(r.gov.party)})`,
          sub: `· 임기 만료 ${GOV_TERM[s.po][3] ? "약 " : ""}${ymd(GOV_TERM[s.po][1])} · ${GOV_TERM[s.po][2]}년 임기` }),
  };
}

function Summary({ isSen, sen, states, raceMap }) {
  const all = Object.values(raceMap).flat();
  const n = (p) => all.filter((r) => r.party === p).length;
  const nSpecial = all.filter((r) => r.special).length;
  if (!isSen) {
    const total = Object.values(states).filter((s) => s.gov).length;
    return (
      <section className="ov-section pl-cards up-cards">
        <div className="pl-card">
          <div className="pl-card-title">2026 주지사 선거 <span className="muted">· {ELECTION_DAY}</span></div>
          <div className="pl-bar">
            <div style={{ flex: n("REP"), background: partyColor("REP") }} />
            <div style={{ flex: n("DEM"), background: partyColor("DEM") }} />
          </div>
          <div className="pl-parts">
            <span><i style={{ background: partyColor("REP") }} />현직 공화 <b>{n("REP")}</b></span>
            <span><i style={{ background: partyColor("DEM") }} />현직 민주 <b>{n("DEM")}</b></span>
          </div>
          <div className="muted pl-small">대상 {all.length}개 주 · 선거 없음 {total - all.length}개 주</div>
        </div>
      </section>
    );
  }
  // 상원: 선거 없는 의석은 그대로 → 과반(51)까지 각 진영이 이번에 몇 석 필요한가
  const keep = (sen?.members || []).filter((m) => !senUp(m));
  const k = (p) => keep.filter((m) => side(m.party, m.caucus) === p).length;
  return (
    <section className="ov-section pl-cards up-cards">
      <div className="pl-card">
        <div className="pl-card-title">2026 상원 선거 <span className="muted">· {ELECTION_DAY}</span></div>
        <div className="pl-bar">
          <div style={{ flex: n("REP"), background: partyColor("REP") }} />
          <div style={{ flex: n("DEM"), background: partyColor("DEM") }} />
        </div>
        <div className="pl-parts">
          <span><i style={{ background: partyColor("REP") }} />현직 공화 <b>{n("REP")}</b></span>
          <span><i style={{ background: partyColor("DEM") }} />현직 민주 <b>{n("DEM")}</b></span>
        </div>
        <div className="muted pl-small">대상 {all.length}석 = 정규(Class 2) {all.length - nSpecial} + 보궐 {nSpecial}</div>
      </div>
      <div className="pl-card">
        <div className="pl-card-title">선거 없는 의석 <span className="muted">· {keep.length}석</span></div>
        <div className="pl-parts">
          <span><i style={{ background: partyColor("REP") }} />공화 <b>{k("REP")}</b></span>
          <span><i style={{ background: partyColor("DEM") }} />민주(교섭 포함) <b>{k("DEM")}</b></span>
        </div>
        <div className="muted pl-small">과반 51석까지 공화 {Math.max(0, 51 - k("REP"))}석 · 민주 {Math.max(0, 51 - k("DEM"))}석 필요
          <br />(50:50이면 부통령이 캐스팅보트)</div>
      </div>
    </section>
  );
}

function UpList({ isSen, states, raceMap, onSelect }) {
  const rows = Object.entries(raceMap).flatMap(([f, rs]) => rs.map((r) => ({ f, r, s: states[f] })))
    .sort((a, b) => a.s.ko.localeCompare(b.s.ko, "ko"));
  return (
    <div>
      <h2 className="ov-h2">2026년 {isSen ? "상원" : "주지사"} 선거 대상 <span>· {rows.length}{isSen ? "석" : "곳"}</span></h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {isSen ? "Class 2 정규 의석 + 임명직 의석의 보궐선거(사선)." : "2022년에 뽑힌 34개 주(4년 임기) + 뉴햄프셔·버몬트(2년 임기)."}
        {" "}이름은 현직입니다. 11월 결과는 아직 반영 전입니다.
      </p>
      <ul className="pl-up-list">
        {rows.map(({ f, r, s }) => (
          <li key={`${f}${r.m?.bioguide || ""}`} onClick={() => onSelect(f)}>
            <span className="pl-dot" style={{ background: partyColor(r.kind === "sen" ? r.m.party : r.gov.party) }} />
            <b>{s.ko}</b>
            <span>{r.kind === "sen" ? r.m.name : r.gov.name}</span>
            {r.special ? <span className="cr-badge appt">보궐</span> : r.kind === "sen" && r.m.how === "appointment" && <span className="cr-badge appt">임명</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RacePanel({ isSen, s, races, cycles, onOpenYear }) {
  const has = (y) => cycles.some((c) => c.cycle_year === y && !c.upcoming);
  const LastBtn = ({ year }) => has(year)
    ? <button className="pl-cty" onClick={() => onOpenYear(year, s.fips)}>직전 {year}년 선거 결과 보기 →</button>
    : <span className="pl-cty none">직전 {year}년 선거 자료 없음</span>;
  return (
    <div className="pl-state">
      <div className="pl-state-head"><h2>{s.ko} <span className="pl-en">{s.en}</span></h2></div>
      <h3 className="sec-title">2026년 {isSen ? "상원" : "주지사"} 선거 · {ELECTION_DAY}</h3>
      {races.map((r) => r.kind === "sen" ? (
        <div key={r.m.bioguide} className="pl-sen">
          <Photo m={r.m} />
          <div className="pl-sen-meta">
            <div className="pl-sen-name">{r.m.name} <span className="muted">(현직)</span>
              {r.special ? <span className="cr-badge appt">보궐</span> : r.m.how === "appointment" && <span className="cr-badge appt">임명</span>}</div>
            <div className="pl-sen-sub">
              <span className="cr-party sm" style={{ background: partyColor(r.m.party) }}>{pLabel(r.m)}</span>
              {r.m.caucus && r.m.caucus !== r.m.party && <span className="muted">{partyKo(r.m.caucus)} 교섭</span>}
              <span className="muted">Class {r.m.sen_class}</span>
            </div>
            {r.m.prev && <div className="pl-sen-sub pl-prev">{prevText(r.m.prev)}{r.m.how === "appointment" ? " → 주지사 임명" : ""}</div>}
            <div className="pl-sen-sub muted">
              {r.special ? `임명직 — 남은 임기(~${CLASS_END[r.m.sen_class]}.01)를 채울 의원을 뽑는 보궐선거`
                : `${r.m.how === "appointment" ? "임명직 · " : ""}임기 만료 ${YEAR + 1}.01.03 · 새 임기 ${YEAR + 1}–${YEAR + 7}`}
            </div>
            <div className="pl-sen-sub"><LastBtn year={CLASS_LAST[r.m.sen_class]} /></div>
          </div>
        </div>
      ) : (
        <div key="gov" className="pl-gov">
          <GovPhoto po={s.po} gov={r.gov} />
          <div>
            <b>{r.gov.name}</b> <span className="muted">(현직)</span>
            <div className="pl-sen-sub"><span className="cr-party sm" style={{ background: partyColor(r.gov.party) }}>{partyKo(r.gov.party)}</span></div>
            <div className="pl-sen-sub muted">임기 만료 {GOV_TERM[s.po][3] ? "약 " : ""}{ymd(GOV_TERM[s.po][1])} · {GOV_TERM[s.po][2]}년 임기</div>
            <div className="pl-sen-sub"><LastBtn year={YEAR - GOV_TERM[s.po][2]} /></div>
          </div>
        </div>
      ))}
      <p className="hint">출마·불출마 여부와 후보는 반영하지 않았습니다. 이름은 기준일 {REF_MAX} 현직입니다.</p>
    </div>
  );
}

export default function Upcoming2026({ office, cycles, onOpenYear }) {
  const isSen = office === "senate";
  const [sen, setSen] = useState(null);
  const [gov, setGov] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([getCongressRoster("sen", REF_MAX), getStateOverview(Number(REF_MAX.slice(0, 4)))])
      .then(([a, c]) => { setSen(a); setGov(c); })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => setSelected(null), [office]);

  const states = useMemo(() => buildStates(sen, null, gov), [sen, gov]);
  const raceMap = useMemo(() => {
    const m = {};
    for (const s of Object.values(states)) { const r = racesOf(isSen, s); if (r.length) m[s.fips] = r; }
    return m;
  }, [states, isSen]);
  const styles = useMemo(() => Object.fromEntries(Object.entries(raceMap).map(([f, r]) => [f, styleOf(r)])), [raceMap]);
  const mapFill = useMemo(() => Object.fromEntries(Object.entries(styles).map(([f, x]) => [f, x.special ? `url(#${hatchId(x.key)})` : x.color])), [styles]);
  const chipFill = useMemo(() => Object.fromEntries(Object.entries(styles).map(([f, x]) => [f, x.special ? hatchCss(x.color) : x.color])), [styles]);
  const mapStates = useMemo(() => Object.values(states).map((s) => ({ region_code: s.fips, region_name: s.ko })), [states]);
  const tip = (c) => tipOf(isSen, states[c], raceMap[c] || []);
  const pick = (c) => raceMap[c] && setSelected(c);

  // 범례: 진영 × 정규/보궐 + 선거 없음
  const legend = useMemo(() => {
    const t = {};
    for (const x of Object.values(styles)) { const k = `${x.key}|${x.special ? 1 : 0}`; t[k] = (t[k] || 0) + 1; }
    const name = { REP: "공화", DEM: isSen ? "민주(교섭 포함)" : "민주", IND: "무소속", SPLIT: "양당" };
    const items = Object.entries(t).sort().map(([k, n]) => {
      const [p, sp] = k.split("|");
      const c = p === "SPLIT" ? SPLIT : partyColor(p);
      return { bg: sp === "1" ? hatchCss(c) : c, label: `${name[p] || partyKo(p)} 현직${sp === "1" ? " · 보궐" : ""}`, n };
    });
    const none = Object.values(states).filter((s) => s.po !== "DC" && !raceMap[s.fips]).length;
    items.push({ bg: "#E5E5E5", label: "선거 없음", n: none });
    return items;
  }, [styles, states, raceMap, isSen]);

  if (error) return <div className="error">불러오기 오류: {error}</div>;
  const sel = selected ? states[selected] : null;
  return (
    <>
      <Summary isSen={isSen} sen={sen} states={states} raceMap={raceMap} />
      <main className="layout">
        <section className="map-pane">
          <MapUS colorByCode={mapFill} selectedCode={selected} onSelect={pick} tipOf={tip} defs={HatchDefs} />
          <SmallStates states={mapStates} colorByCode={chipFill} selectedCode={selected} onSelect={pick} tipOf={tip} />
          <div className="gov-legend">
            {legend.map((i) => (
              <span key={i.label} className="gl-item"><span className="gl-sw" style={{ background: i.bg }} />{i.label} <b>{i.n}</b></span>
            ))}
          </div>
          <p className="hint">2026년 11월에 {isSen ? "상원" : "주지사"} 선거가 있는 주만 현직 정당색으로 칠했습니다(회색 = 선거 없음{isSen ? ", 사선 = 임명직 의석의 보궐선거" : ""}). 주를 클릭하면 대상자와 직전 선거 결과로 가는 링크가 보입니다.</p>
        </section>
        <aside className="detail">
          {sel && <button className="back-link" onClick={() => setSelected(null)}>← 목록</button>}
          {sel ? <RacePanel isSen={isSen} s={sel} races={raceMap[sel.fips]} cycles={cycles} onOpenYear={onOpenYear} />
            : <UpList isSen={isSen} states={states} raceMap={raceMap} onSelect={pick} />}
        </aside>
      </main>
      <p className="hint cr-source">출처: 의원 unitedstates/congress-legislators · 주지사 임기는 각 주 헌법 규정. 2026년 11월 선거 결과는 미반영.</p>
    </>
  );
}
