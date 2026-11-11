import { useEffect, useMemo, useRef, useState } from "react";
import MapUS from "./maps/MapUS.jsx";
import ECBar from "./components/ECBar.jsx";
import ElectionNotes from "./components/ElectionNotes.jsx";
import OfficeSummary from "./components/OfficeSummary.jsx";
import Legend from "./components/Legend.jsx";
import SmallStates from "./components/SmallStates.jsx";
import StateDetail from "./pages/StateDetail.jsx";
import StateSummaryTable from "./pages/StateSummaryTable.jsx";
import RaceDetail from "./pages/RaceDetail.jsx";
import HouseDetail from "./pages/HouseDetail.jsx";
import PotusHistory from "./pages/PotusHistory.jsx";
import StateOverview from "./pages/StateOverview.jsx";
import CongressRoster from "./pages/CongressRoster.jsx";
import PoliticsPage from "./pages/PoliticsPage.jsx";
import Upcoming2026 from "./pages/Upcoming2026.jsx";
import {
  getPresidentElections, getPresidentMap, getElections, getOfficeMap,
} from "./api";
import { shadeByMargin, marginFromTop } from "./util/shade";

const OFFICES = [
  { key: "president", label: "대통령" },
  { key: "senate", label: "상원" },
  { key: "house", label: "하원" },
  { key: "governor", label: "주지사" },
  { key: "history", label: "역대 대선" },
  { key: "overview", label: "주 개관" },
  { key: "politics", label: "정치" },
  { key: "congress", label: "의회 명단" },
];
const TITLE = {
  president: "미국 대통령선거 지도", senate: "미국 상원선거 지도",
  house: "미국 하원선거 지도", governor: "미국 주지사선거 지도",
  history: "역대 미국 대통령선거", overview: "미국 주(州) 개관",
  congress: "미국 연방의회 명단", politics: "미국 정치 지형",
};
// 결과가 아직 없는 다음 선거: 상원·주지사 탭 연도 목록 끝에 '(예정)'으로 붙인다(DB에 결과가 들어오면 자동으로 빠짐)
const UPCOMING = { senate: 2026, governor: 2026 };
const SELF_PAGES = new Set(["history", "overview", "congress", "politics"]);  // 자체 데이터를 관리하는 탭

export default function App() {
  const [office, setOffice] = useState("president");
  const [cycles, setCycles] = useState([]);
  const [cycleYear, setCycleYear] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [selected, setSelected] = useState(null); // {code, name}
  const [error, setError] = useState(null);
  const [overviewCode, setOverviewCode] = useState(null); // 정치 → 주 개관 이동 시 열어둘 주
  const pendingYear = useRef(null);   // 다른 탭에서 넘어올 때 열 연도
  const pendingCode = useRef(null);   // 지도 로드 후 선택할 주(2026 예정 → 직전 선거 결과)

  // office 변경 → 사이클 목록 로드 (연도는 일단 null 로 리셋해 지도 effect 오발사 방지)
  useEffect(() => {
    setSelected(null); setMapData(null); setCycleYear(null); setError(null);
    if (SELF_PAGES.has(office)) return;   // 역대 대선·주 개관 탭은 자체 페이지가 데이터를 관리
    const loader = office === "president" ? getPresidentElections() : getElections(office);
    loader
      .then((cs) => {
        const up = UPCOMING[office];
        const real = cs;
        if (up && !cs.some((c) => c.cycle_year === up)) cs = [...cs, { cycle_year: up, upcoming: true }];
        setCycles(cs);
        const want = pendingYear.current; pendingYear.current = null;
        if (want && cs.some((c) => c.cycle_year === want)) setCycleYear(want);
        else if (real.length) setCycleYear(real[real.length - 1].cycle_year);
      })
      .catch((e) => setError(String(e)));
  }, [office]);

  // office + 연도 확정 → 지도 로드. (연도가 현재 office 의 사이클에 있을 때만 — 전환 직후 stale 연도 방지)
  useEffect(() => {
    if (!cycleYear) return;
    if (cycles.length && !cycles.some((c) => c.cycle_year === cycleYear)) return;
    setSelected(null);
    if (cycles.find((c) => c.cycle_year === cycleYear)?.upcoming) { setMapData(null); return; }
    const loader = office === "president" ? getPresidentMap(cycleYear) : getOfficeMap(office, cycleYear);
    loader.then((d) => {
      setMapData(d); setError(null);
      const code = pendingCode.current; pendingCode.current = null;
      const st = code && d.states?.find((s) => s.region_code === code);
      if (st) setSelected({ code, name: st.region_name });
    }).catch((e) => setError(String(e)));
  }, [office, cycleYear, cycles]);

  // 채색: 승자 정당색을 '후보간 격차'로 농도 보정(접전=옅게, 안정=진하게).
  const colorByCode = useMemo(() => {
    const m = {};
    for (const s of mapData?.states || [])
      m[s.region_code] = shadeByMargin(s.color_hex, marginFromTop(s.top_parties_json));
    return m;
  }, [mapData]);

  const nameOf = (code) =>
    mapData?.states.find((s) => s.region_code === code)?.region_name || code;

  function onStateClick(code) {
    if (!colorByCode[code]) return; // 데이터 없는 영역(그 사이클에 선거 없는 주 포함) 무시
    setSelected({ code, name: nameOf(code) });
  }

  function switchOffice(key) {
    if (key === office) return;
    setCycleYear(null);   // 이전 office 의 연도가 새 office 지도 요청에 섞이지 않도록 즉시 리셋(배치)
    setMapData(null);
    setSelected(null);
    setError(null);
    if (key !== "overview") setOverviewCode(null);
    setOffice(key);
  }

  const isPres = office === "president";
  const upcoming = !!cycles.find((c) => c.cycle_year === cycleYear)?.upcoming && !SELF_PAGES.has(office);
  const hint =
    isPres ? "주를 클릭하면 후보별 득표·카운티·역대 추이가 표시됩니다."
      : office === "house" ? "색은 그 주에서 더 많은 의석을 가져간 정당. 클릭하면 선거구별 당선자가 보입니다."
        : "그 사이클에 선거가 있던 주만 색칠됩니다. 클릭하면 후보별 득표가 보입니다.";

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TITLE[office]} <span className="sub">{office === "congress" || office === "politics" ? "2024년 선거 · 제119대 (시범)" : upcoming ? `${cycleYear}년 선거 예정 · 대상 주` : "1976–2024"}</span></h1>
        <div className="selector">
          <div className="office-tabs">
            {OFFICES.map((o) => (
              <button
                key={o.key}
                className={`office-tab${o.key === office ? " active" : ""}`}
                onClick={() => switchOffice(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {!SELF_PAGES.has(office) && (
            <>
              <label>연도&nbsp;</label>
              <select value={cycleYear ?? ""} onChange={(e) => setCycleYear(Number(e.target.value))}>
                {cycles.map((c) => (
                  <option key={c.cycle_year} value={c.cycle_year}>{c.cycle_year}{c.upcoming ? " (예정)" : ""}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>

      {error && <div className="error">백엔드 연결 오류: {error}</div>}

      {office === "history" ? (
        <PotusHistory />
      ) : office === "overview" ? (
        <StateOverview initialCode={overviewCode} />
      ) : office === "politics" ? (
        <PoliticsPage onOverview={(code) => { setOverviewCode(code); switchOffice("overview"); }}
          onElection={(key) => { pendingYear.current = UPCOMING[key]; switchOffice(key); }} />
      ) : office === "congress" ? (
        <CongressRoster />
      ) : upcoming ? (
        <Upcoming2026 office={office} cycles={cycles}
          onOpenYear={(y, code) => { pendingCode.current = code; setCycleYear(y); }} />
      ) : (
        <>

      {isPres && mapData?.ec && <ECBar ec={mapData.ec} />}
      {!isPres && mapData?.summary && (
        <OfficeSummary office={office} summary={mapData.summary} cycleYear={cycleYear} />
      )}

      <ElectionNotes office={office} cycleYear={cycleYear} />

      <main className="layout">
        <section className="map-pane">
          <MapUS colorByCode={colorByCode} selectedCode={selected?.code} onSelect={onStateClick} />
          <SmallStates states={mapData?.states} colorByCode={colorByCode}
            selectedCode={selected?.code} onSelect={onStateClick} />
          <Legend states={mapData?.states} />
          <p className="hint">{hint}</p>
        </section>

        <aside className="detail">
          {selected && (
            <button className="back-link" onClick={() => setSelected(null)}>← 목록</button>
          )}
          {!selected ? (
            isPres ? (
              <StateSummaryTable states={mapData?.states} cycleYear={cycleYear} onSelect={onStateClick} />
            ) : (
              <div className="detail empty">주를 클릭하세요.</div>
            )
          ) : isPres ? (
            <StateDetail cycleYear={cycleYear} code={selected.code} name={selected.name}
              hasCounty={mapData?.has_county} />
          ) : office === "house" ? (
            <HouseDetail cycleYear={cycleYear} code={selected.code} name={selected.name} />
          ) : (
            <RaceDetail office={office} cycleYear={cycleYear} code={selected.code}
              name={selected.name} hasCounty={mapData?.has_county} />
          )}
        </aside>
      </main>
        </>
      )}
    </div>
  );
}
