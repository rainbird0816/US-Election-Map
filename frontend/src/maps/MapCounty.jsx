import { useEffect, useMemo, useState } from "react";
import { geoAlbers, geoPath } from "d3-geo";
import { feature } from "topojson-client";

// 카운티 TopoJSON (us-atlas, geometry id = 5자리 FIPS = regions.code).
const GEO_URL = "/geo/us-counties-10m.json";
const NO_DATA = "#ECECEC";

// 카운티 지오메트리는 한 번만 받아서 모듈 캐시에 보관(주를 바꿔도 재요청 없음).
let _cache = null;
function loadCounties() {
  if (!_cache) {
    _cache = fetch(GEO_URL)
      .then((r) => r.json())
      .then((topo) => feature(topo, topo.objects.counties).features);
  }
  return _cache;
}

// 선택한 주의 카운티만 잘라, 그 주에 맞춰 투영을 fit 한 분할 지도.
// colorByCode: {FIPS5: color}, onSelect(code) 로 카운티 클릭 전달.
export default function MapCounty({
  stateCode, colorByCode = {}, selectedCode, onSelect, width = 460, height = 320,
}) {
  const [allFeatures, setAllFeatures] = useState(null);

  useEffect(() => {
    let alive = true;
    loadCounties().then((f) => alive && setAllFeatures(f)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const paths = useMemo(() => {
    if (!allFeatures || !stateCode) return [];
    const feats = allFeatures.filter((f) => String(f.id).slice(0, 2) === stateCode);
    if (!feats.length) return [];
    const proj = geoAlbers().fitSize([width, height], { type: "FeatureCollection", features: feats });
    const path = geoPath(proj);
    return feats.map((f) => ({ id: String(f.id), d: path(f), name: f.properties?.name }));
  }, [allFeatures, stateCode, width, height]);

  if (!allFeatures) return <p className="muted">카운티 지도 불러오는 중…</p>;
  if (!paths.length) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="county-map"
      role="img"
      aria-label="카운티별 결과 지도"
    >
      {paths.map((p) => {
        const isSel = p.id === selectedCode;
        return (
          <path
            key={p.id}
            d={p.d}
            fill={colorByCode[p.id] || NO_DATA}
            stroke={isSel ? "#111" : "#fff"}
            strokeWidth={isSel ? 1.6 : 0.35}
            onClick={() => onSelect && onSelect(p.id)}
            style={{ cursor: onSelect ? "pointer" : "default", outline: "none" }}
          >
            <title>{p.name}</title>
          </path>
        );
      })}
    </svg>
  );
}
