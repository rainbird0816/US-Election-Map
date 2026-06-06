import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// 미국 주 TopoJSON (us-atlas, geometry id = 2자리 FIPS). 런타임 로드.
const GEO_URL = "/geo/us-states-10m.json";
const NO_DATA = "#E5E5E5";

export default function MapUS({ colorByCode, selectedCode, onSelect }) {
  return (
    <ComposableMap
      projection="geoAlbersUsa"
      width={900}
      height={520}
      style={{ width: "100%", height: "auto" }}
    >
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
}
