import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { geoMercator, geoAlbers } from "d3-geo";
import { feature } from "topojson-client";

// 단일 주 지도 — us-states-10m TopoJSON 에서 해당 주만 추출해 투영을 그 주에 맞춤(fitExtent).
// 랜드마크(분류별 색 핀, 호버 라벨) + 주요 도시(회색 점·라벨) 표시.
const GEO_URL = "/geo/us-states-10m.json";
const W = 560, H = 460, PAD = 30;

// 랜드마크 분류 → 색/라벨. StateFactPanel 범례와 공유.
export const LANDMARK_CATS = {
  "자연":     { color: "#2E9E5B", label: "자연·공원" },
  "역사문화": { color: "#C9803A", label: "역사·문화" },
  "건축도시": { color: "#3B7DD8", label: "건축·도시" },
  "관광체험": { color: "#B5539C", label: "관광·체험" },
};
const catColor = (c) => LANDMARK_CATS[c]?.color || "#D64545";

// 알래스카·하와이는 경도 폭이 커서 메르카토르가 과하게 늘어남 → 알베르스.
const projFor = (code) => (code === "02" || code === "15" ? geoAlbers() : geoMercator());

// 화면 좌표(px,py)에 따라 라벨이 SVG 밖으로 잘리지 않도록 정렬·오프셋 결정.
function labelPlacement(px, py) {
  const anchor = px < 84 ? "start" : px > W - 84 ? "end" : "middle";
  const dx = anchor === "start" ? 7 : anchor === "end" ? -7 : 0;
  const below = py < 30;          // 위쪽 가장자리면 라벨을 점 아래로
  return { anchor, dx, dy: below ? 16 : -11 };
}

export default function StateMap({ code, landmarks = [], cities = [], active, onPick }) {
  const [topo, setTopo] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(GEO_URL).then((r) => r.json())
      .then((t) => live && setTopo(t)).catch(() => live && setErr(true));
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
  const project = fitted.proj;

  return (
    <div className="sm-map">
      <ComposableMap projection={project} width={W} height={H}
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

        {/* 주요 도시: 회색 점 + 항상 보이는 작은 라벨(가장자리 정렬 보정) */}
        {cities.map((c, i) => {
          const [px, py] = project([c.lng, c.lat]) || [0, 0];
          const anchor = px < 70 ? "start" : px > W - 70 ? "end" : "middle";
          const dx = anchor === "start" ? 6 : anchor === "end" ? -6 : 0;
          return (
            <Marker key={`city-${i}`} coordinates={[c.lng, c.lat]}>
              <rect x={-2.6} y={-2.6} width={5.2} height={5.2} transform="rotate(45)"
                fill="#fff" stroke="#6B7785" strokeWidth={1.3} />
              <text className="sm-city-label" textAnchor={anchor} dx={dx} dy={12}>{c.name}</text>
            </Marker>
          );
        })}

        {/* 랜드마크: 분류색 핀, 호버 시 라벨(잘림 방지 배치) */}
        {landmarks.map((m, i) => {
          const on = active === i;
          const col = catColor(m.cat);
          const [px, py] = project([m.lng, m.lat]) || [0, 0];
          const pl = labelPlacement(px, py);
          return (
            <Marker key={`${m.name}-${i}`} coordinates={[m.lng, m.lat]}
              onMouseEnter={() => onPick?.(i)} onMouseLeave={() => onPick?.(null)}
              style={{ default: { cursor: "pointer" } }}>
              <circle r={on ? 7 : 5} fill={col} stroke="#fff" strokeWidth={1.6}
                opacity={active == null || on ? 1 : 0.65} />
              {on && (
                <text className="sm-pin-label" textAnchor={pl.anchor} dx={pl.dx} dy={pl.dy}>
                  {m.name}
                </text>
              )}
            </Marker>
          );
        })}
      </ComposableMap>
    </div>
  );
}
