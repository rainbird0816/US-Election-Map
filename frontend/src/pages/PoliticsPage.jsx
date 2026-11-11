import { useEffect, useMemo, useState } from "react";
import MapUS from "../maps/MapUS.jsx";
import SmallStates from "../components/SmallStates.jsx";
import MapCD from "../maps/MapCD.jsx";
import { SeatDonut } from "./HouseDetail.jsx";
import { Photo, remainText, pLabel, prevText } from "./CongressRoster.jsx";
import { getCongressRoster, getStateOverview, getPresidentHistory, getHouseDistrictMap, getPoliticsRaces, getCounties } from "../api";
import MapCounty from "../maps/MapCounty.jsx";
import { partyKo, partyColor } from "../content/parties";
import { STATE_INFO } from "../content/states_info";
import { presidentAt } from "../content/presidents_admin.js";
import { evAt } from "../content/census";
import { GOV_PHOTO } from "../content/governor_photos";
import { GOV_TERM } from "../content/governor_terms";
import { portraitUrl } from "../content/presidents";
import { shadeByMargin } from "../util/shade";

// 시범 범위: 2024년 선거로 구성된 현재 정치 지형(제119대 의회 회기 안의 기준일).
const TODAY = new Date().toISOString().slice(0, 10);
const START = "2025-01-03", END = "2027-01-02";
export const REF_MAX = TODAY < END ? TODAY : END;
export const SPLIT = "#8E24AA";        // 상원 2석 분할·하원 동수
export const FIPS_BY_PO = Object.fromEntries(Object.entries(STATE_INFO).map(([f, s]) => [s.po, f]));

// 교섭단체 기준 진영(무소속은 caucus 로 귀속)
export const side = (p, caucus) => (p === "DEM" || p === "REP" ? p : caucus === "DEM" || caucus === "REP" ? caucus : "IND");

const MODES = [
  { key: "all", label: "종합" },
  { key: "gov", label: "주지사" },
  { key: "sen", label: "상원" },
  { key: "rep", label: "하원 대표단" },
  { key: "cd", label: "하원 선거구" },
];
const PO_BY_FIPS = Object.fromEntries(Object.entries(STATE_INFO).map(([f, s]) => [f, s.po]));
const cdLabel = (cd) => `${PO_BY_FIPS[cd.slice(0, 2)] || cd.slice(0, 2)}-${cd.slice(2) === "00" ? "AL" : cd.slice(2)}`;
const cdKey = (m) => `${FIPS_BY_PO[m.state]}${String(m.district).padStart(2, "0")}`;

// 선거구 지도 공통 데이터: 현직(기준일) + 2024 결과 + 2022→2024 정당 교체 + 회기 중 당적 변경·공석
function buildCd(dmap, rep) {
  if (!dmap) return null;
  const holder = {};
  for (const m of rep?.members || []) if (!m.delegate) holder[cdKey(m)] = m;
  const out = {};
  for (const d of dmap.districts) {
    const h = holder[d.cd];
    const now = h ? (h.party === "DEM" || h.party === "REP" ? h.party : "IND") : null;
    const midterm = !h ? "vacant" : now !== d.party ? "party" : null;
    out[d.cd] = { ...d, holder: h, now, midterm };
  }
  return out;
}
const cdFill = (x) => !x ? "#eee" : !x.holder ? "#d6d6d6"
  : x.now === x.party ? shadeByMargin(partyColor(x.now), x.margin) : partyColor(x.now);
const cdInfo = (x) => !x ? {} : {
  flipped: x.flipped, midterm: !!x.midterm,
  fromColor: x.flipped ? partyColor(x.prev_party) : null, toColor: x.flipped ? partyColor(x.party) : null,
  title: `${cdLabel(x.cd)} · ${x.holder ? `${x.holder.name} (${pLabel(x.holder)})` : "공석"}`
    + ` · 2024 ${partyKo(x.party)} +${x.margin}%p`
    + (x.flipped ? ` · ★ 2022 ${partyKo(x.prev_party)} → 2024 ${partyKo(x.party)}` : "")
    + (x.midterm === "party" ? " · 회기 중 당적 변경" : x.midterm === "vacant" ? " · 회기 중 공석" : ""),
};

// 주지사 사진(Wikipedia 대표 이미지, 실패 시 이니셜)
// 2026년 11월 주지사 선거 대상 36개 주 = 2022년에 뽑힌 34개 주(4년 임기) + NH·VT(2년 임기, 짝수해마다)
export const GOV_UP_2026 = new Set(Object.keys(GOV_TERM).filter((po) => GOV_TERM[po][0] === 2026));
const DAY = 86400000;
function GovTerm({ po, party, refDate }) {
  const t = GOV_TERM[po];
  if (!t) return null;
  const [, end, yrs, approx] = t;
  const days = Math.round((Date.parse(end) - Date.parse(refDate)) / DAY);
  const pct = Math.max(0, Math.min(100, 100 - (days / (yrs * 365.25)) * 100));
  return (
    <div className="pl-sen-sub pl-gov-term">
      <div className="cr-bar"><div style={{ width: `${pct}%`, background: partyColor(party) }} /></div>
      <span className="muted">임기 만료 {approx ? "약 " : ""}{end.replace(/-/g, ".")} · 잔여 {remainText(days)} · {yrs}년 임기</span>
    </div>
  );
}

export function GovPhoto({ po, gov }) {
  const [err, setErr] = useState(false);
  const file = GOV_PHOTO[`${po}|${gov.name}`];
  const st = { borderColor: partyColor(gov.party) };
  if (file && !err) return <img className="cr-photo pl-gov-photo" src={portraitUrl(file)} alt="" loading="lazy" style={st} onError={() => setErr(true)} />;
  const ini = gov.name.split(" ").filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
  return <div className="cr-photo cr-photo-fb pl-gov-photo" style={st}>{ini}</div>;
}

function CdLegend({ cd, focus, setFocus }) {
  const vals = Object.values(cd || {});
  const flips = vals.filter((x) => x.flipped);
  const r = flips.filter((x) => x.party === "REP").length;
  const n = (p) => vals.filter((x) => x.now === p).length;
  return (
    <div className="cd-legend">
      <span className="gl-item"><span className="gl-sw" style={{ background: partyColor("REP") }} />공화 {n("REP")}</span>
      <span className="gl-item"><span className="gl-sw" style={{ background: partyColor("DEM") }} />민주 {n("DEM")}</span>
      {n("IND") > 0 && <span className="gl-item"><span className="gl-sw" style={{ background: partyColor("IND") }} />무소속 {n("IND")}</span>}
      <span className="gl-item"><span className="gl-sw cd-flip-sw" style={{ background: partyColor("DEM"), boxShadow: `inset 0 0 0 2.5px ${partyColor("REP")}` }} />
        2022→2024 정당 교체 <b>{flips.length}</b> <span className="muted">(채움 = 현재 정당, 테두리 = 이전 정당 · →공화 {r} · →민주 {flips.length - r})</span></span>
      <span className="gl-item"><span className="gl-sw cd-mid-sw" />회기 중 당적 변경·공석 <b>{vals.filter((x) => x.midterm).length}</b></span>
      <label className="cr-check cd-focus"><input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />변화한 선거구만 강조</label>
    </div>
  );
}

function FlipList({ cd, onPick }) {
  const vals = Object.values(cd || {});
  const flips = vals.filter((x) => x.flipped).sort((a, b) => cdLabel(a.cd).localeCompare(cdLabel(b.cd)));
  const mids = vals.filter((x) => x.midterm);
  if (!cd) return <p className="muted">불러오는 중…</p>;
  return (
    <div>
      <h2 className="ov-h2">정당이 바뀐 선거구 <span>· 2022 → 2024 선거, {flips.length}곳</span></h2>
      <ul className="pl-up-list cd-flips">
        {flips.map((x) => (
          <li key={x.cd} onClick={() => onPick(x.cd)}>
            <b>{cdLabel(x.cd)}</b>
            <span className="cd-arrow">
              <span className="cr-party sm" style={{ background: partyColor(x.prev_party) }}>{partyKo(x.prev_party)}</span>
              →
              <span className="cr-party sm" style={{ background: partyColor(x.party) }}>{partyKo(x.party)}</span>
            </span>
            <span>{x.holder?.name || x.winner}</span>
            {x.redrawn && <span className="cd-redrawn" title="2024년 선거 전에 선거구 경계를 다시 그린 주 — 같은 번호라도 지역이 다름">경계 재조정</span>}
            <span className="muted pl-rp">+{x.margin}%p</span>
          </li>
        ))}
      </ul>
      {mids.length > 0 && (
        <>
          <h2 className="ov-h2" style={{ marginTop: 16 }}>회기 중 변화 <span>· 기준일 현재</span></h2>
          <ul className="pl-up-list">
            {mids.map((x) => (
              <li key={x.cd} onClick={() => onPick(x.cd)}>
                <b>{cdLabel(x.cd)}</b>
                <span>{x.midterm === "vacant" ? `공석 (2024 당선 ${x.winner})` : `${x.holder.name} — ${partyKo(x.party)} → ${pLabel(x.holder)}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">'경계 재조정' 표시가 있는 선거구는 2024년 선거 전에 지도를 다시 그린 주라서, 같은 번호라도 지역이 달라 직접 비교하기 어렵습니다.</p>
    </div>
  );
}
// 종합: 주지사·상원 2석·하원 다수(4개 축) 중 몇 개를 한 정당이 쥐고 있나
const ALL_SCALE = [
  { k: "R4", label: "공화 4/4", color: "#B71C1C" },
  { k: "R3", label: "공화 3/4", color: "#E57373" },
  { k: "MIX", label: "양분 2:2 등", color: "#B39DDB" },
  { k: "D3", label: "민주 3/4", color: "#64B5F6" },
  { k: "D4", label: "민주 4/4", color: "#0D47A1" },
];

export function buildStates(sen, rep, gov) {
  const out = {};
  for (const [fips, info] of Object.entries(STATE_INFO)) {
    out[fips] = { fips, po: info.po, ko: info.ko, en: info.en, sens: [], reps: [], vac: [], gov: null };
  }
  for (const m of sen?.members || []) { const f = FIPS_BY_PO[m.state]; if (f) out[f].sens.push(m); }
  for (const m of rep?.members || []) { const f = FIPS_BY_PO[m.state]; if (f) out[f].reps.push(m); }
  for (const v of rep?.vacancies || []) { const f = FIPS_BY_PO[v.state]; if (f) out[f].vac.push(v); }
  for (const g of gov?.states || []) if (out[g.region_code] && g.governor) out[g.region_code].gov = { name: g.governor, party: g.party };
  for (const s of Object.values(out)) {
    s.sens.sort((a, b) => a.sen_class - b.sen_class);
    s.reps.sort((a, b) => a.district - b.district);
    const t = {};
    for (const m of s.reps) if (!m.delegate) { const k = side(m.party, m.caucus); t[k] = (t[k] || 0) + 1; }
    s.repTally = Object.entries(t).map(([p, n]) => ({ p, n })).sort((a, b) => b.n - a.n);
    const seats = s.reps.filter((m) => !m.delegate).length + s.vac.length;
    const [a, b] = s.repTally;
    s.repMaj = !a ? null : b && b.n === a.n ? "TIE" : a.p;
    s.repMargin = a && seats ? ((a.n - (b?.n || 0)) / seats) * 100 : 0;
    // 종합 점수
    const axes = [s.gov && side(s.gov.party), ...s.sens.map((m) => side(m.party, m.caucus)), s.repMaj];
    const r = axes.filter((x) => x === "REP").length, d = axes.filter((x) => x === "DEM").length;
    s.allKey = s.sens.length === 0 ? null : r === 4 ? "R4" : d === 4 ? "D4" : r === 3 ? "R3" : d === 3 ? "D3" : "MIX";
    s.allRD = [r, d];
  }
  return out;
}

// 상원 임명직이 보궐선거로 뽑히는가(sched_end = 보궐선거일). 임명직이라도 정규 임기 만료(1월 3일)가 먼저면 정규 선거.
const senSpecial = (m) => m.how === "appointment" && !m.sched_end.endsWith("-01-03");
// 다음 선거 연도: 보궐이면 보궐선거일 연도, 아니면 임기 만료 전해 11월
const senNext = (m) => senSpecial(m) ? Number(m.sched_end.slice(0, 4)) : Number(m.sched_end.slice(0, 4)) - 1;

// 지도 마우스 오버 정보: 보기(mode)별 주지사·상원·하원 대표단 요약
function tipFor(mode, s) {
  if (!s) return null;
  const title = `${s.ko} ${s.en}`;
  const gov = () => {
    if (!s.gov) return [{ text: "주지사 정보 없음" }];
    const t = GOV_TERM[s.po];
    return [{ color: partyColor(s.gov.party), text: `주지사 ${s.gov.name} (${partyKo(s.gov.party)})`,
      sub: t ? `· 다음 선거 ${t[0]}년` : "" }];
  };
  const sens = () => s.sens.map((m) => ({ color: partyColor(m.party),
    text: `상원 ${m.name} (${pLabel(m)}${m.caucus && m.caucus !== m.party ? `·${partyKo(m.caucus)} 교섭` : ""})`,
    sub: `· Class ${m.sen_class}${m.how === "appointment" ? " 임명" : ""} · 다음 선거 ${senNext(m)}년${senSpecial(m) ? "(보궐)" : ""}` }));
  const reps = () => {
    const n = s.reps.filter((m) => !m.delegate).length + s.vac.length;
    if (!n) return [];
    const parts = s.repTally.map((x) => `${partyKo(x.p)} ${x.n}`);
    if (s.vac.length) parts.push(`공석 ${s.vac.length}`);
    return [{ color: s.repMaj && s.repMaj !== "TIE" ? partyColor(s.repMaj) : SPLIT, text: `하원 대표단 ${n}석`, sub: `· ${parts.join(" · ")}` }];
  };
  if (s.po === "DC") return { title, lines: [{ text: "주지사·상원 없음 · 하원 대표(투표권 없음) 1명" }] };
  const lines = mode === "gov" ? gov() : mode === "sen" ? sens() : mode === "rep" || mode === "cd" ? reps() : [...gov(), ...sens(), ...reps()];
  return { title, lines };
}

function colorFor(mode, s) {
  if (!s) return null;
  if (mode === "gov") return s.gov ? partyColor(s.gov.party) : null;
  if (mode === "sen") {
    if (!s.sens.length) return null;
    const [a, b] = s.sens.map((m) => side(m.party, m.caucus));
    return a === b ? partyColor(a) : SPLIT;
  }
  if (mode === "rep") {
    if (!s.repMaj) return null;
    if (s.repMaj === "TIE") return SPLIT;
    return shadeByMargin(partyColor(s.repMaj), s.repMargin);
  }
  return ALL_SCALE.find((x) => x.k === s.allKey)?.color || null;
}

function Legend({ mode, states }) {
  const vals = Object.values(states);
  let items;
  if (mode === "all") {
    items = ALL_SCALE.map((x) => ({ color: x.color, label: x.label, n: vals.filter((s) => s.allKey === x.k).length }));
  } else if (mode === "gov") {
    const t = {};
    for (const s of vals) if (s.gov) t[s.gov.party] = (t[s.gov.party] || 0) + 1;
    items = Object.entries(t).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ color: partyColor(p), label: partyKo(p), n }));
  } else if (mode === "sen") {
    const t = {};
    for (const s of vals) {
      if (!s.sens.length) continue;
      const [a, b] = s.sens.map((m) => side(m.party, m.caucus));
      const k = a === b ? a : "SPLIT";
      t[k] = (t[k] || 0) + 1;
    }
    items = [["REP", partyColor("REP"), "공화 2석"], ["DEM", partyColor("DEM"), "민주(교섭 포함) 2석"], ["SPLIT", SPLIT, "양당 1석씩"]]
      .map(([k, c, l]) => ({ color: c, label: l, n: t[k] || 0 }));
  } else {
    const t = { REP: 0, DEM: 0, TIE: 0 };
    for (const s of vals) if (s.repMaj) t[s.repMaj] = (t[s.repMaj] || 0) + 1;
    items = [
      { color: partyColor("REP"), label: "공화 다수", n: t.REP },
      { color: partyColor("DEM"), label: "민주 다수", n: t.DEM },
      { color: SPLIT, label: "동수", n: t.TIE },
    ];
  }
  return (
    <div className="gov-legend">
      {items.filter((i) => i.n).map((i) => (
        <span key={i.label} className="gl-item"><span className="gl-sw" style={{ background: i.color }} />{i.label} <b>{i.n}</b></span>
      ))}
    </div>
  );
}

function ChamberCard({ title, data, majority }) {
  if (!data) return <div className="pl-card"><div className="pl-card-title">{title}</div><div className="muted">불러오는 중…</div></div>;
  const voting = data.members.filter((m) => !m.delegate);
  const t = {};
  for (const m of voting) { const k = m.party || "OTH"; t[k] = (t[k] || 0) + 1; }
  const order = ["DEM", "IND", "OTH", "REP"];
  const parts = Object.entries(t).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const vac = data.vacancies.filter((v) => FIPS_BY_PO[v.state] && v.state !== "DC").length;
  const total = voting.length + vac;
  return (
    <div className="pl-card">
      <div className="pl-card-title">{title} <span className="muted">· 과반 {majority}</span></div>
      <div className="pl-bar">
        {parts.map(([p, n]) => <div key={p} style={{ flex: n, background: partyColor(p) }} title={`${partyKo(p)} ${n}`} />)}
        {vac > 0 && <div style={{ flex: vac, background: "#e0e0e0" }} title={`공석 ${vac}`} />}
        <span className="pl-maj" style={{ left: `${(majority / total) * 100}%` }} />
      </div>
      <div className="pl-parts">
        {parts.map(([p, n]) => <span key={p}><i style={{ background: partyColor(p) }} />{partyKo(p)} <b>{n}</b></span>)}
        {vac > 0 && <span><i style={{ background: "#e0e0e0" }} />공석 <b>{vac}</b></span>}
      </div>
    </div>
  );
}

// 성(姓)으로 당선 선거 찾기: 'Pete Ricketts' ↔ 'Ricketts', 'ADAM B. SCHIFF'
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv"]);
const surname = (n) => n.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter((w) => !SUFFIX.has(w)).pop() || "";
function raceOf(races, office, name) {
  const sn = surname(name);
  return (races || []).find((r) => r.office === office && r.winner.toLowerCase().includes(sn)) || null;
}

function RaceBtn({ race, onCounty, who, office, fips }) {
  if (!race) return <span className="pl-cty none">당선 선거 기록 없음(임명·승계)</span>;
  if (!race.has_county) return <span className="pl-cty none">{race.year}년 선거 · 카운티 자료 없음</span>;
  return (
    <button className="pl-cty" onClick={() => onCounty({ office, year: race.year, special: race.special, who, fips })}>
      {race.year}년{race.special ? " 보궐" : ""} 선거 카운티 지도 →
    </button>
  );
}

// 지도 영역: 한 레이스의 카운티별 결과(확대 가능) + 클릭한 카운티 상세
function CountyView({ view, stateName, onBack }) {
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    setData(null); setPicked(null);
    getCounties(view.office, view.year, view.fips, view.special).then(setData).catch(() => setData({ counties: [] }));
  }, [view]);
  const counties = data?.counties || [];
  const byCode = useMemo(() => Object.fromEntries(counties.map((c) => [c.code, c])), [counties]);
  const colorByCode = useMemo(() => {
    const m = {};
    for (const c of counties) {
      const cs = c.candidates || [];
      m[c.code] = shadeByMargin(c.color_hex, cs.length > 1 ? cs[0].vote_rate - cs[1].vote_rate : null);
    }
    return m;
  }, [counties]);
  // 정당별 승리 카운티 수
  const wins = useMemo(() => {
    const t = {};
    for (const c of counties) { const k = c.abbr; t[k] = t[k] || { abbr: k, color: c.color_hex, n: 0, name: c.winner_name }; t[k].n++; }
    return Object.values(t).sort((a, b) => b.n - a.n);
  }, [counties]);
  const sel = picked ? byCode[picked] : null;
  const officeKo = view.office === "senate" ? (view.special ? "상원 보궐" : "상원") : "주지사";
  return (
    <div>
      <div className="cd-drill-head">
        <button className="pl-link cd-back" onClick={onBack}>← 주 지도로</button>
        <b>{stateName}</b><span className="muted">{view.year}년 {officeKo} 선거 · {view.who} 당선</span>
      </div>
      {!data ? <div className="cd-loading muted">카운티 결과 불러오는 중…</div> : !counties.length ? (
        <div className="cd-loading muted">이 선거의 카운티 자료가 없습니다.</div>
      ) : (
        <>
          <MapCounty stateCode={view.fips} colorByCode={colorByCode} selectedCode={picked} zoom
            width={900} height={600} onSelect={(k) => setPicked((p) => (p === k ? null : k))}
            titleOf={(k, n) => { const c = byCode[k]; return c ? `${c.region_name} · ${c.winner_name} ${c.vote_rate}%` : n; }} />
          <div className="cd-legend">
            {wins.map((w) => <span key={w.abbr} className="gl-item"><span className="gl-sw" style={{ background: w.color }} />{partyKo(w.abbr)} 우세 카운티 <b>{w.n}</b></span>)}
            <span className="muted">· 농도 = 1·2위 격차 · + / − 버튼, Ctrl+스크롤로 확대 · 드래그로 이동</span>
          </div>
          {(data.coverage != null && data.coverage < 97) && (
            <p className="cr-stale">원본(MEDSL)에 일부 카운티가 빠져 있어 주 전체 표의 약 {data.coverage}%만 지도에 반영됐습니다. 회색 카운티는 자료 없음입니다.</p>
          )}
          {view.office === "senate" && view.year === 2022 && view.fips === "13" && (
            <p className="cr-stale">조지아는 11월 본선에서 과반 득표자가 없어 12월 결선을 치렀습니다. 지도는 11월 본선 기준입니다.</p>
          )}
          {sel && (
            <div className="county-detail">
              <div className="county-detail-head"><strong>{sel.region_name}</strong><span className="muted"> · 1위 {sel.winner_name} {sel.vote_rate}%</span></div>
              <table className="cand-table"><tbody>
                {(sel.candidates || []).map((c, i) => (
                  <tr key={i}><td><span className="dot" style={{ background: c.color_hex || "#bbb" }} /></td>
                    <td>{c.name}</td><td>{c.abbr}</td><td className="num">{Number(c.votes).toLocaleString()}</td><td className="num">{c.vote_rate}%</td></tr>
                ))}
              </tbody></table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatePanel({ s, refDate, onOverview, cd, selectedCd, onPickCd, showCdMap = true, onCounty }) {
  const [races, setRaces] = useState(null);
  useEffect(() => { setRaces(null); getPoliticsRaces(s.fips).then(setRaces).catch(() => setRaces([])); }, [s.fips]);
  const [hist, setHist] = useState(null);
  useEffect(() => {
    setHist(null);
    getPresidentHistory(s.fips).then(setHist).catch(() => setHist({ winners: [] }));
  }, [s.fips]);
  const pols = STATE_INFO[s.fips]?.people?.["정치"] || [];
  const ev = evAt(s.fips, 2024)?.value;
  const voting = s.reps.filter((m) => !m.delegate);
  const segs = s.repTally.map((t) => ({ abbr: partyKo(t.p), n: t.n, color: partyColor(t.p) }));
  if (s.vac.length) segs.push({ abbr: "공석", n: s.vac.length, color: "#e0e0e0" });
  const isDC = s.po === "DC";

  return (
    <div className="pl-state">
      <div className="pl-state-head">
        <h2>{s.ko} <span className="pl-en">{s.en}</span></h2>
        {ev != null && <span className="ev-badge">선거인단 {ev}</span>}
        <button className="pl-link" onClick={() => onOverview(s.fips)}>주 개관 보기 →</button>
      </div>

      <h3 className="sec-title">주지사</h3>
      {s.gov ? (
        <div className="pl-gov">
          <GovPhoto po={s.po} gov={s.gov} />
          <div>
            <b>{s.gov.name}</b>
            <div className="pl-sen-sub"><span className="cr-party sm" style={{ background: partyColor(s.gov.party) }}>{partyKo(s.gov.party)}</span>
              {GOV_UP_2026.has(s.po) && <span className="pl-up">2026 선거 대상</span>}</div>
            <GovTerm po={s.po} party={s.gov.party} refDate={refDate} />
            {races && <div className="pl-sen-sub"><RaceBtn race={raceOf(races, "governor", s.gov.name)} onCounty={onCounty} who={s.gov.name} office="governor" fips={s.fips} /></div>}
          </div>
        </div>
      ) : <p className="muted">{isDC ? "워싱턴 D.C.는 주지사 대신 시장(Mayor)이 있습니다." : "정보 없음"}</p>}

      <h3 className="sec-title">연방 상원의원</h3>
      {isDC ? <p className="muted">D.C.는 상원 의석이 없습니다.</p> : (
        <div className="pl-sens">
          {s.sens.map((m) => (
            <div key={m.bioguide} className="pl-sen">
              <Photo m={m} />
              <div className="pl-sen-meta">
                <div className="pl-sen-name">{m.name}
                  {m.how === "appointment" && <span className="cr-badge appt">임명</span>}
                </div>
                <div className="pl-sen-sub">
                  <span className="cr-party sm" style={{ background: partyColor(m.party) }}>{pLabel(m)}</span>
                  {m.caucus && m.caucus !== m.party && <span className="muted">{partyKo(m.caucus)} 교섭</span>}
                  <span className="muted">Class {m.sen_class}</span>
                </div>
                {m.prev && <div className="pl-sen-sub pl-prev">{prevText(m.prev)}{m.how === "appointment" ? " → 주지사 임명" : ""}</div>}
                <div className="pl-sen-sub muted">
                  {m.status === "pending" ? `${m.sched_end} 보궐선거 · 결과 반영 대기`
                    : `임기 만료 ${m.sched_end.slice(0, 4)}.01 · 잔여 ${remainText(m.remaining_days)}`}
                  {m.sched_end.startsWith("2027") || m.how === "appointment" ? <span className="pl-up">2026 선거 대상</span> : null}
                </div>
                {races && m.how !== "appointment" && (
                  <div className="pl-sen-sub"><RaceBtn race={raceOf(races, "senate", m.name)} onCounty={onCounty} who={m.name} office="senate" fips={s.fips} /></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="sec-title">연방 하원 대표단 <span className="muted">· {voting.length + s.vac.length}석{isDC ? "(투표권 없는 대표)" : ""}</span></h3>
      {!isDC && segs.length > 0 && (
        <div className="seat-donut-wrap">
          <SeatDonut segs={segs} total={voting.length + s.vac.length} />
          <ul className="seat-legend">
            {segs.map((t) => (
              <li key={t.abbr}><span className="swatch" style={{ background: t.color }} /><b>{t.abbr}</b><span className="seat-legend-pct">{t.n}석</span></li>
            ))}
          </ul>
        </div>
      )}
      {!isDC && cd && showCdMap && (
        <div className="cd-state-map">
          <MapCD stateFips={s.fips} fillOf={(k) => cdFill(cd[k])} infoOf={(k) => cdInfo(cd[k])}
            selectedCd={selectedCd} onSelect={onPickCd} width={520} height={360} />
        </div>
      )}
      <ul className="pl-reps">
        {s.reps.map((m) => {
          const x = cd?.[cdKey(m)];
          return (
            <li key={m.bioguide} className={selectedCd && selectedCd === cdKey(m) ? "row-active" : ""}
              onClick={() => !m.delegate && onPickCd(cdKey(m))}>
              <span className="pl-cd">{m.district === 0 ? (m.delegate ? "대표" : "AL") : `${m.district}구`}</span>
              <span className="pl-dot" style={{ background: partyColor(m.party) }} />
              <span>{m.name}{m.prev && <span className="muted pl-prev"> ({prevText(m.prev)})</span>}</span>
              {x?.flipped && <span className="cd-flip-badge">★ {partyKo(x.prev_party)}→{partyKo(x.party)}</span>}
              {x?.midterm === "party" && <span className="cd-mid-badge">당적 변경</span>}
              <span className="muted pl-rp">{pLabel(m)}{x ? ` · +${x.margin}%p` : ""}</span>
            </li>
          );
        })}
        {s.vac.map((v) => (
          <li key={`v${v.seat}`} className="muted">
            <span className="pl-cd">{v.seat}구</span><span className="pl-dot" style={{ background: "#e0e0e0" }} />
            <span>공석{v.prev ? ` (전임 ${v.prev} · ${v.since.replace(/-/g, ".")} ${v.prev_reason || "이임"})` : ""}</span>
          </li>
        ))}
      </ul>

      <h3 className="sec-title">역대 대선 승리 정당 <span className="muted">· 1976–2024</span></h3>
      <div className="pl-pres">
        {(hist?.winners || []).map((w) => (
          <span key={w.cycle_year} className="pl-pres-chip" style={{ background: w.color_hex }} title={`${w.cycle_year} ${w.winner_name || ""} ${w.winner_rate ?? ""}%`}>
            {String(w.cycle_year).slice(2)}
          </span>
        ))}
        {!hist && <span className="muted">불러오는 중…</span>}
      </div>

      {pols.length > 0 && (
        <>
          <h3 className="sec-title">이 주의 주요 정치인</h3>
          <ul className="pl-people">
            {pols.map((p) => (
              <li key={p.en || p.ko}><b>{p.ko}</b> <span className="muted">{p.en}</span>{p.note && <div className="cr-sub">{p.note}</div>}</li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">기준일 {refDate} · 의원 정보는 의회 명단과 같은 데이터입니다.</p>
    </div>
  );
}

// 기본 우측 패널: 다음 선거는 상원·주지사 선거 탭의 '2026 (예정)'에서 따로 보여 준다
function NextElections({ sen, onElection }) {
  const nSen = (sen?.members || []).filter((m) => m.sched_end.startsWith("2027") || m.how === "appointment").length;
  return (
    <div>
      <h2 className="ov-h2">다음 선거 <span>· 2026년 11월 3일</span></h2>
      <p className="hint" style={{ marginTop: 0 }}>이 페이지는 기준일 현재 누가 자리를 쥐고 있는지만 보여 줍니다. 2026년 선거 대상(선거 없는 주는 회색)은 선거 지도에서 따로 볼 수 있습니다.</p>
      <div className="pl-next">
        <button className="pl-next-btn" onClick={() => onElection("senate")}><b>상원 선거 지도</b><span>대상 {nSen || "…"}석 · 정규 + 보궐</span></button>
        <button className="pl-next-btn" onClick={() => onElection("governor")}><b>주지사 선거 지도</b><span>대상 {GOV_UP_2026.size}개 주</span></button>
      </div>
      <p className="hint">하원은 435석 전부가 2년마다 선거라 '하원 선거구' 보기에서 현직과 2024년 결과를 확인하면 됩니다. 주를 클릭하면 상세가 보입니다.</p>
    </div>
  );
}

export default function PoliticsPage({ onOverview, onElection }) {
  const [ref, setRef] = useState(REF_MAX);
  const [sen, setSen] = useState(null);
  const [rep, setRep] = useState(null);
  const [gov, setGov] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("all");
  const [selected, setSelected] = useState(null);
  const [selectedCd, setSelectedCd] = useState(null);
  const [dmap, setDmap] = useState(null);
  const [focus, setFocus] = useState(false);
  const [countyView, setCountyView] = useState(null);   // {office, year, special, who, fips}

  // 선거구 데이터는 '하원 선거구' 보기나 주 상세를 처음 열 때 한 번만 로드
  useEffect(() => {
    if (!dmap && (mode === "cd" || selected)) getHouseDistrictMap().then(setDmap).catch((e) => setError(String(e)));
  }, [mode, selected, dmap]);

  useEffect(() => {
    setError(null);
    Promise.all([getCongressRoster("sen", ref), getCongressRoster("rep", ref), getStateOverview(Number(ref.slice(0, 4)))])
      .then(([a, b, c]) => { setSen(a); setRep(b); setGov(c); })
      .catch((e) => setError(String(e)));
  }, [ref]);

  const states = useMemo(() => buildStates(sen, rep, gov), [sen, rep, gov]);
  const colorByCode = useMemo(() => {
    const m = {};
    for (const s of Object.values(states)) { const c = colorFor(mode === "cd" ? "rep" : mode, s); if (c) m[s.fips] = c; }
    return m;
  }, [states, mode]);
  const mapStates = useMemo(() => Object.values(states).map((s) => ({ region_code: s.fips, region_name: s.ko })), [states]);

  const year = Number(ref.slice(0, 4));
  const pres = presidentAt(year);
  const govCount = useMemo(() => {
    const t = {};
    for (const s of Object.values(states)) if (s.gov) t[s.gov.party] = (t[s.gov.party] || 0) + 1;
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }, [states]);
  const sel = selected ? states[selected] : null;
  const cd = useMemo(() => buildCd(dmap, rep), [dmap, rep]);
  const pickCd = (k) => { setSelectedCd(k); setSelected(k.slice(0, 2)); setCountyView(null); };
  const pickState = (c) => { if (states[c]) { setSelected(c); setSelectedCd(null); setCountyView(null); } };

  return (
    <div className="politics-page">
      <div className="ov-control">
        <div className="cr-cong cr-pilot"><b>2024년 선거</b><span>로 구성된 현재 정치 지형</span></div>
        <label className="cr-ref">기준일
          <input type="date" value={ref} min={START} max={REF_MAX} onChange={(e) => e.target.value >= START && e.target.value <= REF_MAX && setRef(e.target.value)} />
        </label>
        {sen && <div className="cr-cong"><b>제{sen.congress}대 의회</b><span>{sen.congress_start} ~ {sen.congress_end}</span></div>}
      </div>
      {error && <div className="error">불러오기 오류: {error}</div>}

      <section className="ov-section pl-cards">
        <div className="pl-card">
          <div className="pl-card-title">대통령</div>
          {pres && (
            <div className="pl-pres-name">{pres.ko}
              <span className="cr-party" style={{ background: partyColor(pres.party) }}>{partyKo(pres.party)}</span>
              <div className="muted pl-small">제{pres.n}대 · {pres.start}–{pres.end ?? "현재"}</div>
            </div>
          )}
        </div>
        <ChamberCard title="연방 상원" data={sen} majority={51} />
        <ChamberCard title="연방 하원" data={rep} majority={218} />
        <div className="pl-card">
          <div className="pl-card-title">주지사 <span className="muted">· 50개 주</span></div>
          <div className="pl-bar">
            {govCount.map(([p, n]) => <div key={p} style={{ flex: n, background: partyColor(p) }} />)}
          </div>
          <div className="pl-parts">
            {govCount.map(([p, n]) => <span key={p}><i style={{ background: partyColor(p) }} />{partyKo(p)} <b>{n}</b></span>)}
          </div>
          <div className="muted pl-small">2026년 선거 대상 {GOV_UP_2026.size}곳</div>
        </div>
      </section>

      <main className="layout">
        <section className="map-pane">
          <div className="office-tabs pl-modes">
            {MODES.map((m) => (
              <button key={m.key} className={`office-tab${mode === m.key ? " active" : ""}`} onClick={() => { setMode(m.key); setCountyView(null); }}>{m.label}</button>
            ))}
          </div>
          {countyView && sel ? (
            <CountyView view={countyView} stateName={sel.ko} onBack={() => setCountyView(null)} />
          ) : mode === "cd" && sel && sel.po !== "DC" ? (
            cd ? (
              <>
                <div className="cd-drill-head">
                  <button className="pl-link cd-back" onClick={() => { setSelected(null); setSelectedCd(null); }}>← 전국 지도</button>
                  <b>{sel.ko}</b><span className="muted">{sel.en} · 하원 {sel.reps.filter((m) => !m.delegate).length + sel.vac.length}석</span>
                </div>
                <MapCD stateFips={sel.fips} fillOf={(k) => cdFill(cd[k])} infoOf={(k) => cdInfo(cd[k])}
                  selectedCd={selectedCd} onSelect={pickCd} focus={focus} width={900} height={600} />
                <CdLegend cd={Object.fromEntries(Object.entries(cd).filter(([k]) => k.startsWith(sel.fips)))} focus={focus} setFocus={setFocus} />
              </>
            ) : <div className="cd-loading muted">선거구 데이터 불러오는 중…</div>
          ) : mode === "cd" ? (
            <>
              <MapUS colorByCode={colorByCode} selectedCode={selected} onSelect={pickState} tipOf={(c) => tipFor(mode, states[c])} />
              <SmallStates states={mapStates} colorByCode={colorByCode} selectedCode={selected} onSelect={pickState} tipOf={(c) => tipFor(mode, states[c])} />
              <Legend mode="rep" states={states} />
            </>
          ) : (
            <>
              <MapUS colorByCode={colorByCode} selectedCode={selected} onSelect={pickState} tipOf={(c) => tipFor(mode, states[c])} />
              <SmallStates states={mapStates} colorByCode={colorByCode} selectedCode={selected} onSelect={pickState} tipOf={(c) => tipFor(mode, states[c])} />
              <Legend mode={mode} states={states} />
            </>
          )}
          {!countyView && <p className="hint">
            {mode === "all" && "종합 = 주지사·상원 2석·하원 대표단 다수 등 4개 축 중 한 정당이 몇 개를 쥐고 있는지(무소속은 교섭단체 기준)."}
            {mode === "gov" && "현직 주지사의 정당. 2026년 선거 대상은 주지사 탭의 '2026 (예정)'에서 볼 수 있습니다."}
            {mode === "sen" && "그 주 상원의원 2명의 정당(무소속은 교섭단체 기준). 보라색은 양당이 1석씩. 2026년 선거 대상은 상원 탭의 '2026 (예정)'에서 볼 수 있습니다."}
            {mode === "rep" && "그 주 하원 대표단의 다수당. 격차가 작을수록 옅게, 동수는 보라색."}
            {mode === "cd" && !sel && "주 색 = 하원 대표단 다수당. 주를 클릭하면 그 주의 선거구 지도(제119대, Census CD119)가 열립니다. 오른쪽 목록에서 정당이 바뀐 선거구로 바로 갈 수도 있습니다."}
            {mode === "cd" && sel && "색 = 현직 의원 정당, 농도 = 2024년 득표 격차. 정당 교체 선거구는 채움 = 현재 정당, 안쪽 테두리 = 2022년 정당, 점선 테두리 = 회기 중 당적 변경·공석. 선거구를 누르면 오른쪽 목록에서 강조됩니다."}
            {" "}주를 클릭하면 상세가 보입니다.
          </p>}
        </section>
        <aside className="detail">
          {sel && <button className="back-link" onClick={() => { setSelected(null); setSelectedCd(null); }}>← {mode === "cd" ? "정당이 바뀐 선거구" : "다음 선거"}</button>}
          {sel ? <StatePanel s={sel} refDate={ref} onOverview={onOverview} cd={cd} selectedCd={selectedCd} onPickCd={pickCd} showCdMap={mode !== "cd"} onCounty={setCountyView} />
            : mode === "cd" ? <FlipList cd={cd} onPick={pickCd} />
            : <NextElections sen={sen} onElection={onElection} />}
        </aside>
      </main>
      <p className="hint cr-source">출처: 의원 unitedstates/congress-legislators · 주지사·대선 결과는 이 사이트 DB. 2026년 11월 선거 결과는 미반영.</p>
    </div>
  );
}
