import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { geoMercator, geoAlbers } from "d3-geo";
import { feature } from "topojson-client";

// 단일 주 지도 — us-states-10m TopoJSON 에서 해당 주만 추출해 투영을 그 주에 맞춤(fitExtent).
// 랜드마크는 [lng,lat] 핀으로 표시. 핀 클릭/호버 시 라벨 강조.
const GEO_URL = "/geo/us-states-10m.json";
const W = 560, H = 460, PAD = 26;

// 알래스카·하와이는 경도 폭이 커서 메르카토르가 과하게 늘어남 → 알베르스가 자연스럽다.
const projFor = (code) => (code === "02" || code === "15" ? geoAlbers() : geoMercator());

export default function StateMap({ code, landmarks = [], active, onPick }) {
  const [topo, setTopo] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((t) => live && setTopo(t))
      .catch(() => live && setErr(true));
    return () => { live = false; };
  }, []);

  const fitted = useMemo(() => {
    if (!topo) return null;
    const fc = feature(topo, topo.objects.states);
    const g = fc.features.find((f) => String(f.id) === String(code));
    if (!g) return null;
    const proj = projFor(code).fitExtent([[PAD, PAD], [W - PAD, H - PAD]], g);
    return { proj, geo: g };
  }, [topo, code]);

  if (err) return <div className="sm-map sm-msg">지도를 불러오지 못했습니다.</div>;
  if (!fitted) return <div className="sm-map sm-msg">지도 불러오는 중…</div>;

  return (
    <div className="sm-map">
      <ComposableMap projection={fitted.proj} width={W} height={H}
        style={{ width: "100%", height: "auto" }}>
        <Geographies geography={{ type: "FeatureCollection", features: [fitted.geo] }}>
          {({ geographies }) =>
            geographies.map((gg) => (
              <Geography key={gg.rsmKey} geography={gg}
                fill="#EAF1F8" stroke="#9DB4CC" strokeWidth={0.8}
                style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
            ))
          }
        </Geographies>
        {landmarks.map((m, i) => {
          const on = active === i;
          return (
            <Marker key={`${m.name}-${i}`} coordinates={[m.lng, m.lat]}
              onMouseEnter={() => onPick?.(i)} onMouseLeave={() => onPick?.(null)}
              style={{ default: { cursor: "pointer" } }}>
              <circle r={on ? 7 : 5} fill={on ? "#B3261E" : "#D64545"}
                stroke="#fff" strokeWidth={1.6} />
              {on && (
                <text textAnchor="middle" y={-11} className="sm-pin-label">{m.name}</text>
              )}
            </Marker>
          );
        })}
      </ComposableMap>
    </div>
  );
}
