import { useEffect, useMemo, useState } from "react";
import MapUS from "./maps/MapUS.jsx";
import ECBar from "./components/ECBar.jsx";
import ElectionNotes from "./components/ElectionNotes.jsx";
import OfficeSummary from "./components/OfficeSummary.jsx";
import Legend from "./components/Legend.jsx";
import StateDetail from "./pages/StateDetail.jsx";
import RaceDetail from "./pages/RaceDetail.jsx";
import HouseDetail from "./pages/HouseDetail.jsx";
import {
  getPresidentElections, getPresidentMap, getElections, getOfficeMap,
} from "./api";
import { shadeByMargin, marginFromTop } from "./util/shade";

const OFFICES = [
  { key: "president", label: "대통령" },
  { key: "senate", label: "상원" },
  { key: "house", label: "하원" },
  { key: "governor", label: "주지사" },
];
const TITLE = {
  president: "미국 대통령선거 지도", senate: "미국 상원선거 지도",
  house: "미국 하원선거 지도", governor: "미국 주지사선거 지도",
};

export default function App() {
  const [office, setOffice] = useState("president");
  const [cycles, setCycles] = useState([]);
  const [cycleYear, setCycleYear] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [selected, setSelected] = useState(null); // {code, name}
  const [error, setError] = useState(null);

  // office 변경 → 사이클 목록 로드 (연도는 일단 null 로 리셋해 지도 effect 오발사 방지)
  useEffect(() => {
    setSelected(null); setMapData(null); setCycleYear(null); setError(null);
    const loader = office === "president" ? getPresidentElections() : getElections(office);
    loader
      .then((cs) => {
        setCycles(cs);
        if (cs.length) setCycleYear(cs[cs.length - 1].cycle_year);
      })
      .catch((e) => setError(String(e)));
  }, [office]);

  // office + 연도 확정 → 지도 로드. (연도가 현재 office 의 사이클에 있을 때만 — 전환 직후 stale 연도 방지)
  useEffect(() => {
    if (!cycleYear) return;
    if (cycles.length && !cycles.some((c) => c.cycle_year === cycleYear)) return;
    setSelected(null);
    const loader = office === "president" ? getPresidentMap(cycleYear) : getOfficeMap(office, cycleYear);
    loader.then((d) => { setMapData(d); setError(null); }).catch((e) => setError(String(e)));
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
    setOffice(key);
  }

  const isPres = office === "president";
  const hint =
    isPres ? "주를 클릭하면 후보별 득표·카운티·역대 추이가 표시됩니다."
      : office === "house" ? "색은 그 주에서 더 많은 의석을 가져간 정당. 클릭하면 선거구별 당선자가 보입니다."
        : "그 사이클에 선거가 있던 주만 색칠됩니다. 클릭하면 후보별 득표가 보입니다.";

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TITLE[office]} <span className="sub">1976–2024</span></h1>
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
          <label>연도&nbsp;</label>
          <select value={cycleYear ?? ""} onChange={(e) => setCycleYear(Number(e.target.value))}>
            {cycles.map((c) => (
              <option key={c.cycle_year} value={c.cycle_year}>{c.cycle_year}</option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error">백엔드 연결 오류: {error}</div>}

      {isPres && mapData?.ec && <ECBar ec={mapData.ec} />}
      {!isPres && mapData?.summary && (
        <OfficeSummary office={office} summary={mapData.summary} cycleYear={cycleYear} />
      )}

      <ElectionNotes office={office} cycleYear={cycleYear} />

      <main className="layout">
        <section className="map-pane">
          <MapUS colorByCode={colorByCode} selectedCode={selected?.code} onSelect={onStateClick} />
          <Legend states={mapData?.states} />
          <p className="hint">{hint}</p>
        </section>

        <aside className="detail">
          {!selected ? (
            <div className="detail empty">주를 클릭하세요.</div>
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
    </div>
  );
}
