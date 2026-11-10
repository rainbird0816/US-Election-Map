import { useEffect, useMemo, useState } from "react";
import { geoAlbersUsa, geoAlbers, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import ZoomPane from "./ZoomPane.jsx";

// 하원 선거구(제119대, Census CD119) — 전국 또는 한 주 확대.
// GEOID = 주FIPS(2)+선거구(2), 전체선거구 '00', DC 대표 '98'.
const GEO_URL = "/geo/us-cd119.json";
let cache = null;
export function loadDistricts() {
  if (!cache) cache = fetch(GEO_URL).then((r) => r.json()).then((t) => feature(t, t.objects.districts).features);
  return cache;
}

const projFor = (fips) => (fips === "02" || fips === "15" ? geoAlbers() : geoMercator());

/**
 * fillOf(cd) → 채움색, infoOf(cd) → {flipped, from, to, midterm, title}
 * focus=true 면 변화 없는 선거구를 흐리게.
 */
export default function MapCD({ stateFips = null, fillOf, infoOf, selectedCd, onSelect, focus = false, width = 900, height = 540 }) {
  const [feats, setFeats] = useState(null);
  useEffect(() => { loadDistricts().then(setFeats); }, []);

  const view = useMemo(() => {
    if (!feats) return null;
    const fs = stateFips ? feats.filter((f) => f.properties.STATEFP === stateFips) : feats.filter((f) => f.properties.GEOID !== "1198");
    const fc = { type: "FeatureCollection", features: fs };
    const pad = stateFips ? 10 : 4;
    const proj = (stateFips ? projFor(stateFips) : geoAlbersUsa()).fitExtent([[pad, pad], [width - pad, height - pad]], fc);
    const path = geoPath(proj);
    return fs.map((f) => ({ cd: f.properties.GEOID, d: path(f) })).filter((x) => x.d);
  }, [feats, stateFips, width, height]);

  if (!view) return <div className="cd-loading muted">선거구 지도 불러오는 중…</div>;

  const infos = Object.fromEntries(view.map((v) => [v.cd, infoOf(v.cd) || {}]));
  // 정당 교체(B안): 채움 = 현재 정당색, 테두리 = 이전 정당색. 테두리는 선거구 '안쪽'에만(clipPath) 그려
  // 같은 색 이웃 선거구에 묻히지 않게 하고, 바깥에 흰 선을 한 줄 둔다.
  const sw = stateFips ? 1 : 0.35;
  const inner = stateFips ? 9 : 3;          // clip 으로 절반만 보이므로 실제 두께는 절반
  const clipId = (cd) => `cdc-${cd}`;
  const plain = view.filter((v) => !infos[v.cd].flipped && !infos[v.cd].midterm);
  const marked = view.filter((v) => infos[v.cd].flipped || infos[v.cd].midterm);

  return (
    <ZoomPane width={width} height={height} className="cd-map" resetKey={stateFips} label="하원 선거구 지도">
      <defs>
        {marked.filter((v) => infos[v.cd].flipped).map((v) => (
          <clipPath key={v.cd} id={clipId(v.cd)}><path d={v.d} /></clipPath>
        ))}
      </defs>
      {plain.map((v) => (
        <path key={v.cd} d={v.d} fill={fillOf(v.cd)} stroke="#fff" strokeWidth={sw}
          opacity={focus ? 0.22 : 1} onClick={() => onSelect?.(v.cd)}>
          <title>{infos[v.cd].title}</title>
        </path>
      ))}
      {marked.map((v) => {
        const i = infos[v.cd];
        return (
          <g key={v.cd} onClick={() => onSelect?.(v.cd)} className="cd-mark">
            {i.flipped ? (
              <>
                <path d={v.d} fill={fillOf(v.cd)} stroke="#fff" strokeWidth={stateFips ? 2 : 0.8} />
                <path d={v.d} fill="none" stroke={i.fromColor} strokeWidth={inner}
                  strokeLinejoin="round" clipPath={`url(#${clipId(v.cd)})`} />
              </>
            ) : (
              <path d={v.d} fill={fillOf(v.cd)} stroke="#111" strokeWidth={stateFips ? 2.5 : 1.4}
                strokeDasharray={stateFips ? "6 3" : "3 2"} strokeLinejoin="round" />
            )}
            <title>{i.title}</title>
          </g>
        );
      })}
      {selectedCd && view.find((v) => v.cd === selectedCd) && (
        <path d={view.find((v) => v.cd === selectedCd).d} fill="none" stroke="#111" strokeWidth={stateFips ? 3 : 1.6} pointerEvents="none" />
      )}
    </ZoomPane>
  );
}
