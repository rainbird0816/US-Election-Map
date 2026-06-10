import { useEffect, useMemo, useState } from "react";
import MapUS from "../maps/MapUS.jsx";
import SmallStates from "../components/SmallStates.jsx";
import StateFactPanel from "./StateFactPanel.jsx";
import { getStateOverview } from "../api";
import { portraitUrl } from "../content/presidents";
import { POTUS_ADMIN, presidentAt } from "../content/presidents_admin.js";
import { partyKo, partyColor } from "../content/parties";
import { STATE_INFO } from "../content/states_info";

const NOW = 2026;            // 기본 연도(현재). span.max 와 일치.
const noop = () => {};

// 대통령 초상화(실패 시 이니셜).
function PresImg({ p, size }) {
  const [err, setErr] = useState(false);
  const url = p?.img && !err ? portraitUrl(p.img) : null;
  const st = { width: size, height: size, borderColor: partyColor(p?.party) };
  if (url) return <img className="po-img" src={url} alt={p.en} loading="lazy" style={st} onError={() => setErr(true)} />;
  const ini = (p?.en || "?").split(" ").map((w) => w[0]).slice(0, 2).join("");
  return <div className="po-img po-fallback" style={st}>{ini}</div>;
}

// 지도에서 그해 등장한 정당만 범례로.
function GovLegend({ states }) {
  const tally = {};
  for (const s of states || []) if (s.party) tally[s.party] = (tally[s.party] || 0) + 1;
  const items = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!items.length) return null;
  return (
    <div className="gov-legend">
      {items.map(([code, n]) => (
        <span key={code} className="gl-item">
          <span className="gl-sw" style={{ background: partyColor(code) }} />
          {partyKo(code)} <b>{n}</b>
        </span>
      ))}
    </div>
  );
}

export default function StateOverview() {
  const [year, setYear] = useState(NOW);
  const [yearText, setYearText] = useState(String(NOW)); // 상단 연도 직접 입력용(미확정 텍스트)
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // {code, name}

  useEffect(() => {
    setError(null);
    getStateOverview(year).then(setData).catch((e) => setError(String(e)));
  }, [year]);

  // 슬라이더·대통령칩 등으로 year 가 바뀌면 입력칸도 동기화.
  useEffect(() => { setYearText(String(year)); }, [year]);

  const span = data?.span || { min: 1769, max: NOW };

  // 입력 확정(엔터/블러): 범위로 보정해 그 연도로 이동. 빈/이상값은 현재 연도로 되돌림.
  const commitYear = () => {
    const v = parseInt(yearText, 10);
    if (Number.isNaN(v)) { setYearText(String(year)); return; }
    const clamped = Math.max(span.min, Math.min(span.max, v));
    setYear(clamped);
    setYearText(String(clamped));
  };
  const states = data?.states || [];
  const pres = presidentAt(year);

  const colorByCode = useMemo(() => {
    const m = {};
    for (const s of states) if (s.party) m[s.region_code] = partyColor(s.party);
    return m;
  }, [states]);

  const mapStates = useMemo(
    () => states.map((s) => ({ ...s, region_name: s.name })), [states]);

  const nameOf = (code) =>
    STATE_INFO[code]?.ko || states.find((s) => s.region_code === code)?.name || code;
  const onState = (code) => setSelected({ code, name: nameOf(code) });

  // 주 목록: 이름순, 그해 주가 아니면(주지사 없음) 흐리게 표시.
  const listed = useMemo(
    () => states.slice().sort((a, b) => a.name.localeCompare(b.name)), [states]);

  return (
    <div className="overview-page">
      {/* ── 연도 선택 + 현역 대통령 ── */}
      <div className="ov-control">
        <div className="ov-pres">
          {pres ? (
            <>
              <PresImg p={pres} size={64} />
              <div className="ov-pres-meta">
                <div className="ov-pres-label">{year}년 현역 대통령 · 제{pres.n}대</div>
                <div className="ov-pres-name">{pres.ko}
                  <span className="ov-pres-party" style={{ background: partyColor(pres.party) }}>{partyKo(pres.party)}</span>
                </div>
                <div className="ov-pres-en">{pres.en} · {pres.start}–{pres.end ?? "현재"}</div>
              </div>
            </>
          ) : <div className="ov-pres-meta"><div className="ov-pres-name">{year}년</div>
            <div className="ov-pres-en muted">해당 연도 대통령 정보 없음</div></div>}
        </div>
        <div className="ov-slider">
          <div className="ov-year">
            <input className="ov-year-input" type="number" inputMode="numeric"
              min={span.min} max={span.max} value={yearText}
              onChange={(e) => setYearText(e.target.value)}
              onBlur={commitYear}
              onKeyDown={(e) => { if (e.key === "Enter") { commitYear(); e.currentTarget.blur(); } }}
              aria-label="연도 직접 입력" />
            <span>년</span>
          </div>
          <input type="range" min={span.min} max={span.max} value={year}
            onChange={(e) => setYear(Number(e.target.value))} />
          <div className="ov-range"><span>{span.min}</span><span>{span.max}</span></div>
        </div>
      </div>

      {error && <div className="error">불러오기 오류: {error}</div>}

      {/* ── 1. 전체 지도(주지사 정당색) ── */}
      <section className="ov-section">
        <h2 className="ov-h2">전체 지도 <span>· {year}년 주지사 정당</span></h2>
        <div className="ov-map">
          <MapUS colorByCode={colorByCode} selectedCode={selected?.code} onSelect={onState} />
          <SmallStates states={mapStates} colorByCode={colorByCode}
            selectedCode={selected?.code} onSelect={onState} />
          <GovLegend states={states} />
          <p className="hint">주 색 = 그해 현역 주지사의 정당. 회색은 아직 주(州)가 아니었거나 주지사 없음(워싱턴 D.C.). 주를 클릭하면 개관·역대 주지사가 보입니다.</p>
        </div>
      </section>

      {/* ── 2. 역대 대통령 ── */}
      <section className="ov-section">
        <h2 className="ov-h2">역대 대통령 <span>· 클릭하면 그 시기로 이동</span></h2>
        <div className="po-strip">
          {POTUS_ADMIN.map((p) => {
            const on = pres && p.n === pres.n;
            return (
              <button key={`${p.n}-${p.start}`} className={`po-chip${on ? " on" : ""}`}
                title={`${p.ko} (${p.start}–${p.end ?? "현재"})`}
                onClick={() => setYear(p.end == null ? span.max : p.start)}>
                <PresImg p={p} size={40} />
                <span className="po-n">{p.n}</span>
                <span className="po-name">{p.ko}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 3. 주 목록 / 주 상세 ── */}
      <section className="ov-section">
        {selected ? (
          <StateFactPanel code={selected.code} name={selected.name} year={year}
            onBack={() => setSelected(null)} />
        ) : (
          <>
            <h2 className="ov-h2">주 목록 <span>· {year}년 · {states.filter((s) => s.governor).length}개 주 현역</span></h2>
            <div className="ov-list-wrap">
              <table className="ov-list">
                <thead><tr><th>주</th><th className="num">선거인단</th><th className="num">인구(2020)</th><th>주지사</th><th>정당</th></tr></thead>
                <tbody>
                  {listed.map((s) => {
                    const info = STATE_INFO[s.region_code];
                    return (
                    <tr key={s.region_code} className={s.governor ? "" : "off"}
                      onClick={() => onState(s.region_code)}>
                      <td className="ovl-state">{info?.ko || s.name}</td>
                      <td className="num">{info?.ev ?? "—"}</td>
                      <td className="num">{info?.pop ? info.pop.toLocaleString() : "—"}</td>
                      <td>{s.governor || <span className="muted">—</span>}</td>
                      <td>
                        {s.party
                          ? <span className="ovl-party"><span className="gl-dot" style={{ background: partyColor(s.party) }} />{partyKo(s.party)}</span>
                          : <span className="muted">{s.admitted_year && s.admitted_year > year ? "성립 전" : "—"}</span>}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
