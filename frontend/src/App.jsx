import { useEffect, useMemo, useState } from "react";
import MapUS from "./maps/MapUS.jsx";
import ECBar from "./components/ECBar.jsx";
import Legend from "./components/Legend.jsx";
import StateDetail from "./pages/StateDetail.jsx";
import { getPresidentElections, getPresidentMap } from "./api";

export default function App() {
  const [cycles, setCycles] = useState([]);
  const [cycleYear, setCycleYear] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [selected, setSelected] = useState(null); // {code, name}
  const [error, setError] = useState(null);

  useEffect(() => {
    getPresidentElections()
      .then((cs) => {
        setCycles(cs);
        if (cs.length) setCycleYear(cs[cs.length - 1].cycle_year);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!cycleYear) return;
    setSelected(null);
    getPresidentMap(cycleYear).then(setMapData).catch((e) => setError(String(e)));
  }, [cycleYear]);

  const colorByCode = useMemo(() => {
    const m = {};
    for (const s of mapData?.states || []) m[s.region_code] = s.color_hex;
    return m;
  }, [mapData]);

  const nameOf = (code) => mapData?.states.find((s) => s.region_code === code)?.region_name || code;

  function onStateClick(code) {
    if (!colorByCode[code]) return; // 데이터 없는 영역(준주 등) 무시
    setSelected({ code, name: nameOf(code) });
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>미국 대통령선거 지도 <span className="sub">선거인단 1976–2024</span></h1>
        <div className="selector">
          <label>연도&nbsp;</label>
          <select value={cycleYear ?? ""} onChange={(e) => setCycleYear(Number(e.target.value))}>
            {cycles.map((c) => (
              <option key={c.cycle_year} value={c.cycle_year}>{c.cycle_year}</option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error">백엔드 연결 오류: {error}</div>}

      {mapData?.ec && <ECBar ec={mapData.ec} />}

      <main className="layout">
        <section className="map-pane">
          <MapUS
            colorByCode={colorByCode}
            selectedCode={selected?.code}
            onSelect={onStateClick}
          />
          <Legend states={mapData?.states} />
          <p className="hint">주를 클릭하면 오른쪽에 후보별 득표·카운티·역대 추이가 표시됩니다.</p>
        </section>

        <aside className="detail">
          {selected ? (
            <StateDetail
              cycleYear={cycleYear}
              code={selected.code}
              name={selected.name}
              hasCounty={mapData?.has_county}
            />
          ) : (
            <div className="detail empty">주를 클릭하세요.</div>
          )}
        </aside>
      </main>
    </div>
  );
}
