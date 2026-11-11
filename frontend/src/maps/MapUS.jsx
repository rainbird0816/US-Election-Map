import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// 미국 주 TopoJSON (us-atlas, geometry id = 2자리 FIPS). 런타임 로드.
const GEO_URL = "/geo/us-states-10m.json";
const NO_DATA = "#E5E5E5";

// tipOf(code) → {title, lines:[{color, text, sub}]} 를 주면 마우스 오버 시 정보 상자 표시(선택).
export function MapTip({ tip, pos }) {
  if (!tip || !pos) return null;
  return (
    <div className={`map-tip${pos.left ? " left" : ""}${pos.up ? " up" : ""}`} style={{ left: pos.x, top: pos.y }}>
      <b>{tip.title}</b>
      {tip.lines.map((l, i) => (
        <div key={i} className="map-tip-line">
          {l.color && <i style={{ background: l.color }} />}
          <span>{l.text}{l.sub && <span className="map-tip-sub"> {l.sub}</span>}</span>
        </div>
      ))}
    </div>
  );
}

// defs: 채우기에 url(#id) 패턴을 쓰고 싶을 때 <pattern> 등을 넘긴다(선택).
export default function MapUS({ colorByCode, selectedCode, onSelect, tipOf, defs }) {
  const [hover, setHover] = useState(null);   // {code, x, y} — 지도 래퍼 기준 좌표
  const move = (code, e) => {
    if (!tipOf) return;
    const r = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // 오른쪽 절반이면 커서 왼쪽에, 아래쪽이면 커서 위에 띄워 지도 밖으로 밀려나지 않게
    setHover({ code, x, y, left: x > r.width / 2, up: y > r.height * 0.6 });
  };
  const map = (
    <ComposableMap
      projection="geoAlbersUsa"
      width={900}
      height={520}
      style={{ width: "100%", height: "auto" }}
    >
      {defs && <defs>{defs}</defs>}
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const code = geo.id; // FIPS
            const fill = colorByCode[code] || NO_DATA;
            const isSel = code === selectedCode;
            return (
              <Geography
                key={code}
                geography={geo}
                fill={fill}
                stroke={isSel ? "#111" : "#fff"}
                strokeWidth={isSel ? 1.8 : 0.6}
                onClick={() => onSelect(code)}
                onMouseMove={(e) => move(code, e)}
                onMouseLeave={() => setHover(null)}
                style={{
                  default: { outline: "none" },
                  hover: { opacity: 0.8, cursor: "pointer", outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
  if (!tipOf) return map;
  return (
    <div className="map-tip-wrap">
      {map}
      <MapTip tip={hover && tipOf(hover.code)} pos={hover} />
    </div>
  );
}
