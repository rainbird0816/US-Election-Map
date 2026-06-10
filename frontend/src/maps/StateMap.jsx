import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { geoMercator, geoAlbers } from "d3-geo";
import { feature } from "topojson-client";

// 단일 주 지도 — us-states-10m TopoJSON 에서 해당 주만 추출해 투영을 그 주에 맞춤(fitExtent).
// 랜드마크(분류색 핀, 호버 라벨) + 주요 도시(회색 점·라벨). 라벨은 겹침 방지 배치.
const GEO_URL = "/geo/us-states-10m.json";
const W = 580, H = 480, PAD = 30;

export const LANDMARK_CATS = {
  "자연":     { color: "#2E9E5B", label: "자연·공원" },
  "역사문화": { color: "#C9803A", label: "역사·문화" },
  "건축도시": { color: "#3B7DD8", label: "건축·도시" },
  "관광체험": { color: "#B5539C", label: "관광·체험" },
};
const catColor = (c) => LANDMARK_CATS[c]?.color || "#D64545";
const projFor = (code) => (code === "02" || code === "15" ? geoAlbers() : geoMercator());

// 두 사각형이 겹치는가(여백 포함).
const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// 라벨 후보 위치(점 기준 상/하/좌/우)에서 박스를 만들고, 기존 박스와 안 겹치고
// 화면 안에 들어가는 첫 후보 선택. 없으면 null(라벨 숨김, 점만).
function placeLabel(px, py, text, fontPx, placed) {
  const w = text.length * fontPx * 0.62 + 4; // 대략적 폭(한글 폭 보정)
  const h = fontPx + 4;
  const cands = [
    { anchor: "middle", dx: 0,  bx: px - w / 2,     by: py + 7 },        // 아래
    { anchor: "middle", dx: 0,  bx: px - w / 2,     by: py - 7 - h },    // 위
    { anchor: "start",  dx: 7,  bx: px + 7,         by: py - h / 2 },    // 우
    { anchor: "end",    dx: -7, bx: px - 7 - w,     by: py - h / 2 },    // 좌
  ];
  for (const c of cands) {
    const box = { x: c.bx, y: c.by, w, h };
    if (box.x < 2 || box.x + box.w > W - 2 || box.y < 4 || box.y + box.h > H - 2) continue;
    if (placed.some((p) => overlaps(box, p))) continue;
    placed.push(box);
    const dy = c.anchor === "middle" ? (c.by < py ? -2 : h - 1) : 4;
    return { anchor: c.anchor, dx: c.dx, dy };
  }
  return null;
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

  // 라벨 배치(투영 확정 후 한 번 계산). 랜드마크 핀이 차지하는 자리를 먼저 점유 →
  // 도시 라벨이 핀/서로와 겹치지 않게.
  const placements = useMemo(() => {
    if (!fitted) return { cities: [], landmark: {} };
    const project = fitted.proj;
    const placed = [];
    // 핀 위치를 작은 박스로 먼저 점유
    for (const m of landmarks) {
      const [px, py] = project([m.lng, m.lat]) || [0, 0];
      placed.push({ x: px - 6, y: py - 6, w: 12, h: 12 });
    }
    const cityPl = cities.map((c) => {
      const [px, py] = project([c.lng, c.lat]) || [0, 0];
      const pl = placeLabel(px, py, c.name, 10, placed);
      return { px, py, pl };
    });
    return { cities: cityPl };
  }, [fitted, landmarks, cities]);

  if (err) return <div className="sm-map sm-msg">지도를 불러오지 못했습니다.</div>;
  if (!fitted) return <div className="sm-map sm-msg">지도 불러오는 중…</div>;
  const project = fitted.proj;
  const hovering = active != null;

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

        {/* 주요 도시: 회색 다이아몬드 + 라벨(겹침 방지). 랜드마크 호버 중엔 라벨 숨겨 가독성 확보 */}
        {cities.map((c, i) => {
          const pl = placements.cities[i]?.pl;
          return (
            <Marker key={`city-${i}`} coordinates={[c.lng, c.lat]} style={{ default: { pointerEvents: "none" } }}>
              <rect x={-2.6} y={-2.6} width={5.2} height={5.2} transform="rotate(45)"
                fill="#fff" stroke="#6B7785" strokeWidth={1.3} opacity={hovering ? 0.4 : 1} />
              {pl && !hovering && (
                <text className="sm-city-label" textAnchor={pl.anchor} dx={pl.dx} dy={pl.dy}>{c.name}</text>
              )}
            </Marker>
          );
        })}

        {/* 랜드마크: 분류색 핀, 호버 시 라벨(가장자리 보정) */}
        {landmarks.map((m, i) => {
          const on = active === i;
          const col = catColor(m.cat);
          const [px, py] = project([m.lng, m.lat]) || [0, 0];
          const anchor = px < 90 ? "start" : px > W - 90 ? "end" : "middle";
          const dx = anchor === "start" ? 8 : anchor === "end" ? -8 : 0;
          const below = py < 32;
          return (
            <Marker key={`${m.name}-${i}`} coordinates={[m.lng, m.lat]}
              onMouseEnter={() => onPick?.(i)} onMouseLeave={() => onPick?.(null)}
              style={{ default: { cursor: "pointer" } }}>
              <circle r={on ? 7 : 5} fill={col} stroke="#fff" strokeWidth={1.6}
                opacity={!hovering || on ? 1 : 0.55} />
              {on && (
                <text className="sm-pin-label" textAnchor={anchor} dx={dx} dy={below ? 17 : -11}>
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
