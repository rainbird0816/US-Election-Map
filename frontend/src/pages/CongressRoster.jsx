import { useEffect, useMemo, useState } from "react";
import { getCongressRoster } from "../api";
import { partyKo, partyColor } from "../content/parties";
import { STATE_INFO } from "../content/states_info";

// 우편약어 → 한글 주명. 준주·옛 준주는 별도.
const PO_KO = Object.fromEntries(Object.values(STATE_INFO).map((s) => [s.po, s.ko]));
Object.assign(PO_KO, {
  PR: "푸에르토리코", GU: "괌", VI: "미국령 버진아일랜드", AS: "아메리칸사모아",
  MP: "북마리아나 제도", DK: "다코타 준주", OL: "올리언스 준주", PI: "필리핀",
});
export const stKo = (po) => PO_KO[po] || po;

const TODAY = new Date().toISOString().slice(0, 10);
// 시범 범위: 2024년 선거로 구성된 제119대 의회(2025-01-03 ~ 2027-01-03)만. 기준일은 이 회기 안에서만 선택.
const PILOT = { election: 2024, congress: 119, start: "2025-01-03", end: "2027-01-02" };
const REF_MAX = TODAY < PILOT.end ? TODAY : PILOT.end;

const photoUrl = (bio) => `https://unitedstates.github.io/images/congress/225x275/${bio}.jpg`;

// 진영 배치 순서: 민주 → 민주 교섭 무소속 → 기타 → 공화 교섭 무소속 → 공화 (반원도 좌→우)
function sideRank(m) {
  if (m.party === "DEM") return 0;
  if (m.caucus === "DEM") return 1;
  if (m.party === "REP") return 4;
  if (m.caucus === "REP") return 3;
  return 2;
}
export const pLabel = (m) => (!m.party || m.party === "OTH" ? m.party_raw || "정당 미상" : partyKo(m.party));

export function remainText(days) {
  if (days <= 0) return "만료";
  const y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30.4);
  if (y === 0 && mo === 0) return `${days}일`;
  return [y ? `${y}년` : "", mo ? `${mo}개월` : ""].filter(Boolean).join(" ");
}
const seatLabel = (m, chamber) =>
  chamber === "sen" ? `Class ${m.sen_class}` : m.district === 0 ? (m.delegate ? "대표" : "전체(AL)") : m.district === -1 ? "일반명부" : `${m.district}구`;

export function Photo({ m }) {
  const [err, setErr] = useState(false);
  const st = { borderColor: partyColor(m.party) };
  if (!err) return <img className="cr-photo" src={photoUrl(m.bioguide)} alt="" loading="lazy" style={st} onError={() => setErr(true)} />;
  const ini = m.name.split(" ").filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
  return <div className="cr-photo cr-photo-fb" style={st}>{ini}</div>;
}

// 의석 반원도: 행별 반지름에 비례해 좌석 배분 → 각도순(좌→우)으로 진영 순서대로 채색.
function Hemicycle({ seats, highlight, onPick }) {
  const n = seats.length;
  const rows = n > 300 ? 12 : n > 150 ? 8 : n > 60 ? 5 : 3;
  const R = 200, r0 = R * 0.38;
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((R - r0) * i) / (rows - 1 || 1));
  const tot = radii.reduce((a, b) => a + b, 0);
  let counts = radii.map((r) => Math.floor((n * r) / tot));
  let rest = n - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; rest > 0; i = (i - 1 + rows) % rows, rest--) counts[i]++;
  const pts = [];
  radii.forEach((r, i) => {
    const k = counts[i];
    for (let j = 0; j < k; j++) {
      const a = Math.PI - (Math.PI * (k === 1 ? 0.5 : j / (k - 1)));
      pts.push({ x: R + r * Math.cos(a), y: R - r * Math.sin(a), a });
    }
  });
  pts.sort((p, q) => q.a - p.a);   // 왼쪽(π)부터
  const dot = Math.max(2.2, Math.min(9, ((R - r0) / rows) * 0.42));
  return (
    <svg className="cr-hemi" viewBox={`-10 -10 ${2 * R + 20} ${R + 20}`} role="img" aria-label="의석 배치도">
      {pts.map((p, i) => {
        const s = seats[i];
        const on = highlight && s.key === highlight;
        return (
          <circle key={i} cx={p.x} cy={p.y} r={on ? dot * 1.6 : dot}
            fill={s.vacant ? "#fff" : s.color} stroke={s.vacant ? "#9e9e9e" : on ? "#111" : "none"}
            strokeWidth={s.vacant ? 1 : 1.5} strokeDasharray={s.vacant ? "2 1.5" : undefined}
            opacity={s.pending ? 0.5 : 1} style={{ cursor: s.key ? "pointer" : "default" }}
            onClick={() => s.key && onPick(s.key)}>
            <title>{s.title}</title>
          </circle>
        );
      })}
    </svg>
  );
}

const SORTS = {
  state: (a, b) => stKo(a.state).localeCompare(stKo(b.state), "ko") || (a.district ?? a.sen_class) - (b.district ?? b.sen_class),
  name: (a, b) => a.name.localeCompare(b.name),
  party: (a, b) => sideRank(a) - sideRank(b) || SORTS.state(a, b),
  remain: (a, b) => a.remaining_days - b.remaining_days || SORTS.state(a, b),
  senior: (a, b) => a.first_start.localeCompare(b.first_start) || SORTS.state(a, b),
};

export default function CongressRoster() {
  const [chamber, setChamber] = useState("sen");
  const [ref, setRef] = useState(REF_MAX);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [party, setParty] = useState("");
  const [state, setState] = useState("");
  const [query, setQuery] = useState("");
  const [nextOnly, setNextOnly] = useState(false);
  const [cls, setCls] = useState(0);   // 상원 Class 필터(0=전체)
  const [showDelegates, setShowDelegates] = useState(false);
  const [sort, setSort] = useState("state");
  const [pick, setPick] = useState(null);

  useEffect(() => {
    setError(null);
    getCongressRoster(chamber, ref).then(setData).catch((e) => setError(String(e)));
  }, [chamber, ref]);
  useEffect(() => { setPick(null); }, [chamber, ref]);
  useEffect(() => { setCls(0); }, [chamber]);

  const onRef = (v) => { if (v && v >= PILOT.start && v <= REF_MAX) setRef(v); };

  const all = data?.members || [];
  const voting = useMemo(() => all.filter((m) => !m.delegate), [all]);
  const nextEnd = useMemo(() =>
    voting.filter((m) => m.how !== "appointment").reduce((min, m) => (!min || m.sched_end < min ? m.sched_end : min), null),
  [voting]);

  // 정당 집계(투표권 의원 기준) — 진영 순서대로
  const tally = useMemo(() => {
    const t = {};
    for (const m of voting) {
      const k = m.party === "OTH" ? `OTH:${m.party_raw}` : m.party || "OTH";
      t[k] = t[k] || { code: m.party, label: pLabel(m), n: 0, rank: sideRank(m), caucus: m.caucus };
      t[k].n++;
    }
    return Object.values(t).sort((a, b) => a.rank - b.rank || b.n - a.n);
  }, [voting]);
  const nSeats = voting.length + (data?.vacancies?.filter((v) => !PO_KO_TERR.has(v.state)).length || 0);
  const majority = Math.floor(nSeats / 2) + 1;

  const seats = useMemo(() => {
    const s = voting.slice().sort((a, b) => sideRank(a) - sideRank(b) || SORTS.state(a, b)).map((m) => ({
      key: m.bioguide, rank: sideRank(m), color: partyColor(m.party), pending: m.status === "pending",
      title: `${m.name} (${pLabel(m)}, ${stKo(m.state)} ${seatLabel(m, chamber)})`,
    }));
    const vac = (data?.vacancies || []).filter((v) => !PO_KO_TERR.has(v.state)).map((v) => ({
      vacant: true, title: `공석: ${stKo(v.state)} ${chamber === "sen" ? `Class ${v.seat}` : `${v.seat}구`}`,
    }));
    // 공석은 가운데(기타 진영 자리)에 끼워 넣는다
    const mid = s.findIndex((x) => x.rank >= 3);
    const at = mid < 0 ? s.length : mid;
    return [...s.slice(0, at), ...vac, ...s.slice(at)];
  }, [voting, data, chamber]);

  const states = useMemo(() => [...new Set(all.map((m) => m.state))].sort((a, b) => stKo(a).localeCompare(stKo(b), "ko")), [all]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((m) => showDelegates || !m.delegate)
      .filter((m) => !party || (party === "OTH" ? !["DEM", "REP"].includes(m.party) : m.party === party))
      .filter((m) => !state || m.state === state)
      .filter((m) => !cls || m.sen_class === cls)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || stKo(m.state).includes(q))
      .filter((m) => !nextOnly || m.sched_end === nextEnd || m.how === "appointment")
      .sort(SORTS[sort]);
  }, [all, query, party, state, cls, nextOnly, nextEnd, sort, showDelegates]);

  // 상원 Class별 요약: 정규 임기 만료 연도(-1 = 선거 연도)와 정당 구성
  const classes = useMemo(() => [1, 2, 3].map((c) => {
    const ms = voting.filter((m) => m.sen_class === c);
    const reg = ms.find((m) => m.how !== "appointment");
    const by = {};
    for (const m of ms) by[m.party] = (by[m.party] || 0) + 1;
    return { c, n: ms.length, election: reg ? Number(reg.sched_end.slice(0, 4)) - 1 : null,
      parts: Object.entries(by).sort((a, b) => sideRank({ party: a[0] }) - sideRank({ party: b[0] })) };
  }), [voting]);

  const isSen = chamber === "sen";
  const stale = data && ref > data.last_change;
  const th = (key, label) => (
    <th className={`cr-sortable${sort === key ? " on" : ""}`} onClick={() => setSort(key)}>{label}{sort === key ? " ▾" : ""}</th>
  );

  return (
    <div className="roster-page">
      <div className="ov-control cr-control">
        <div className="cr-chamber office-tabs">
          {[["sen", "상원"], ["rep", "하원"]].map(([k, l]) => (
            <button key={k} className={`office-tab${chamber === k ? " active" : ""}`} onClick={() => setChamber(k)}>{l}</button>
          ))}
        </div>
        <div className="cr-cong cr-pilot">
          <b>{PILOT.election}년 선거</b>
          <span>로 구성된 의회</span>
        </div>
        <label className="cr-ref">기준일
          <input type="date" value={ref} min={PILOT.start} max={REF_MAX} onChange={(e) => onRef(e.target.value)} />
        </label>
        {data && (
          <div className="cr-cong">
            <b>제{data.congress}대 의회</b>
            <span>{data.congress_start} ~ {data.congress_end}</span>
          </div>
        )}
      </div>

      {error && <div className="error">불러오기 오류: {error}</div>}
      {stale && (
        <p className="cr-stale">
          데이터에 반영된 마지막 의원 변동은 <b>{data.last_change}</b>입니다(원본 수집 {data.fetched}). 그 이후 사퇴·보궐·2026년 11월 선거 결과는 아직 반영되지 않았을 수 있습니다.
        </p>
      )}

      {data && (
        <section className="ov-section cr-summary">
          <div className="cr-hemi-wrap">
            <Hemicycle seats={seats} highlight={pick} onPick={(k) => { setPick(k); setState(""); setParty(""); setQuery(""); setNextOnly(false); setCls(0); setTimeout(() => document.getElementById(`cr-${k}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0); }} />
            <div className="cr-hemi-total"><b>{nSeats}</b>석 · 과반 {majority}</div>
          </div>
          <ul className="seat-legend cr-legend">
            {tally.map((t) => (
              <li key={t.label}>
                <span className="gl-sw" style={{ background: partyColor(t.code) }} />
                {t.label}{t.caucus && t.code === "IND" ? <span className="muted"> ({partyKo(t.caucus)} 교섭)</span> : null}
                <b className="cr-n">{t.n}</b>
              </li>
            ))}
            {data.vacancies.filter((v) => !PO_KO_TERR.has(v.state)).length > 0 && (
              <li><span className="gl-sw cr-vac-sw" />공석<b className="cr-n">{data.vacancies.filter((v) => !PO_KO_TERR.has(v.state)).length}</b></li>
            )}
            {!isSen && all.some((m) => m.delegate) && (
              <li className="muted cr-deleg-note">+ 투표권 없는 대표 {all.filter((m) => m.delegate).length}명(DC·준주)</li>
            )}
          </ul>
        </section>
      )}

      {data && (
        <section className="ov-section">
          {isSen && (
            <div className="cr-classes" role="group" aria-label="Class별 보기">
              {classes.map((k) => (
                <button key={k.c} className={`cr-class${cls === k.c ? " on" : ""}`}
                  onClick={() => setCls(cls === k.c ? 0 : k.c)} aria-pressed={cls === k.c}>
                  <div className="cr-class-head"><b>Class {k.c}</b><span>{k.election}년 선거 · {k.n}석</span></div>
                  <div className="cr-class-bar">
                    {k.parts.map(([p, n]) => <div key={p} style={{ flex: n, background: partyColor(p) }} title={`${partyKo(p)} ${n}`} />)}
                  </div>
                  <div className="cr-class-parts">
                    {k.parts.map(([p, n]) => <span key={p}><i style={{ background: partyColor(p) }} />{partyKo(p)} {n}</span>)}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="cr-filters">
            <select value={party} onChange={(e) => setParty(e.target.value)} aria-label="정당">
              <option value="">전체 정당</option>
              <option value="DEM">민주당</option>
              <option value="REP">공화당</option>
              <option value="OTH">무소속·기타</option>
            </select>
            <select value={state} onChange={(e) => setState(e.target.value)} aria-label="주">
              <option value="">전체 주</option>
              {states.map((s) => <option key={s} value={s}>{stKo(s)}</option>)}
            </select>
            <input className="cr-search" type="search" placeholder="이름·주 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            {nextEnd && (
              <label className="cr-check"><input type="checkbox" checked={nextOnly} onChange={(e) => setNextOnly(e.target.checked)} />
                다음 선거 대상만<span className="muted"> ({nextEnd.slice(0, 4) - 1}년 선거)</span></label>
            )}
            {!isSen && (
              <label className="cr-check"><input type="checkbox" checked={showDelegates} onChange={(e) => setShowDelegates(e.target.checked)} />
                DC·준주 대표 포함</label>
            )}
            <span className="muted cr-count">{rows.length}명</span>
          </div>

          <div className="cr-table-wrap">
            <table className="cr-table">
              <thead>
                <tr>
                  <th></th>
                  {th("name", "이름")}
                  {th("state", "주")}
                  <th>{isSen ? "Class" : "선거구"}</th>
                  {th("party", "정당")}
                  <th>현 임기</th>
                  {th("remain", "잔여 임기")}
                  {th("senior", "연임")}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const total = Math.max(1, (new Date(m.sched_end) - new Date(m.start)) / 864e5);
                  const pct = Math.min(100, (m.remaining_days / total) * 100);
                  return (
                    <tr key={m.bioguide + m.start} id={`cr-${m.bioguide}`} className={pick === m.bioguide ? "row-active" : ""}>
                      <td><Photo m={m} /></td>
                      <td className="cr-name">
                        {m.wikipedia
                          ? <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(m.wikipedia.replace(/ /g, "_"))}`} target="_blank" rel="noreferrer">{m.name}</a>
                          : m.name}
                        {m.how === "appointment" && <span className="cr-badge appt">임명</span>}
                        {m.how === "special-election" && <span className="cr-badge spec">보궐</span>}
                        {m.delegate && <span className="cr-badge deleg">대표</span>}
                      </td>
                      <td>{stKo(m.state)}</td>
                      <td className="muted">{seatLabel(m, chamber)}</td>
                      <td>
                        <span className="cr-party" style={{ background: partyColor(m.party) }}>{pLabel(m)}</span>
                        {m.caucus && m.caucus !== m.party && <div className="cr-sub">{partyKo(m.caucus)} 교섭</div>}
                      </td>
                      <td className="cr-term">{m.start.slice(0, 7).replace("-", ".")} ~ {m.sched_end.slice(0, 7).replace("-", ".")}</td>
                      <td className="cr-remain">
                        {m.status === "pending" ? (
                          <span className="cr-pending">{m.sched_end} 보궐선거 · 결과 반영 대기</span>
                        ) : (
                          <>
                            <div className="cr-bar"><div style={{ width: `${pct}%`, background: partyColor(m.party) }} /></div>
                            <span>{remainText(m.remaining_days)}</span>
                            {m.how === "appointment" && <div className="cr-sub">{m.sched_end} 보궐선거까지</div>}
                            {m.left_early && <div className="cr-sub warn">{m.actual_end} 이임(임기 중)</div>}
                          </>
                        )}
                      </td>
                      <td className="cr-senior">
                        {m.n_terms === 1 ? "초선" : m.n_terms === 2 ? "재선" : `${m.n_terms}선`}
                        <div className="cr-sub">{m.first_start.slice(0, 4)}~</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            잔여 임기 = 기준일부터 정규 임기 만료일까지. 상원은 Class별 6년 임기(Class 1·2·3이 2년씩 엇갈려 개선), 하원은 2년.
            임명직 상원의원은 보궐선거일까지 재직합니다. 연임 = 이 원(院)에서 지낸 임기 수(초선·재선·3선…)와 첫 취임 연도. 상원은 6년, 하원은 2년 임기 기준이며 중간 공백이 있어도 합산합니다.
          </p>
        </section>
      )}

      {data && (data.vacancies.length > 0 || data.changes.length > 0) && (
        <section className="ov-section cr-side">
          {data.vacancies.length > 0 && (
            <div>
              <h2 className="ov-h2">공석 <span>· 기준일 {data.ref}</span></h2>
              <ul className="cr-list">
                {data.vacancies.map((v, i) => (
                  <li key={i}>
                    <b>{stKo(v.state)} {isSen ? `Class ${v.seat}` : v.seat === 0 ? "전체(AL)" : `${v.seat}구`}</b>
                    {v.prev
                      ? <> — {v.prev}<span className="muted"> ({partyKo(v.prev_party)})</span> {v.since} 이임 이후</>
                      : <> — 회기 개원부터 공석, {v.next_start} {v.next} 취임 예정</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.changes.length > 0 && (
            <div>
              <h2 className="ov-h2">제{data.congress}대 회기 중 변동 <span>· {data.changes.length}건</span></h2>
              <ul className="cr-list cr-changes">
                {data.changes.map((c, i) => (
                  <li key={i} className={c.date > data.ref ? "future" : ""}>
                    <span className="cr-date">{c.date}</span>
                    <span className={`cr-kind ${c.kind}`}>
                      {c.kind === "in" ? (c.how === "appointment" ? "임명" : c.how === "special-election" ? "보궐 당선" : "취임")
                        : c.kind === "out" ? "이임" : c.kind === "special" ? "보궐선거" : "당적 변경"}
                    </span>
                    <span>{c.name} <span className="muted">· {stKo(c.state)} {isSen ? `Class ${c.sen_class}` : c.district === 0 ? "AL" : `${c.district}구`}</span></span>
                    <span className="cr-party sm" style={{ background: partyColor(c.party) }}>{partyKo(c.party)}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">흐리게 표시된 항목은 기준일 이후의 변동입니다. 이임 사유(사퇴·사망·입각 등)는 원본 데이터에 없어 표기하지 않습니다.</p>
            </div>
          )}
        </section>
      )}
      <p className="hint cr-source">출처: unitedstates/congress-legislators(퍼블릭 도메인) · 사진: unitedstates/images</p>
    </div>
  );
}

const PO_KO_TERR = new Set(["DC", "PR", "GU", "VI", "AS", "MP", "DK", "OL", "PI"]);
