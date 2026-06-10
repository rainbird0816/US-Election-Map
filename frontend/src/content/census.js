// 역대 인구조사 조회·순위 헬퍼. states_info.js(AUTO-GEN)의 census/CENSUS_YEARS 사용.
// 규칙: 선택 연도에는 "그 이하의 가장 최근 인구조사" 결과를 적용(예: 2010~2019 → 2010년 조사).
import { CENSUS_YEARS, EV_YEARS, STATE_INFO } from "./states_info";

// 공통: 정렬된 연도배열에서 선택 연도 이하 가장 최근 항목.
function latestLE(years, year) {
  let pick = null;
  for (const y of years) { if (y <= year) pick = y; else break; }
  return pick;
}

// 선거인단(EV) 연동: 선택 연도 이하 '가장 최근 대선'의 그 주 EV + 그 대선연도.
export function evAt(code, year) {
  const evYear = latestLE(EV_YEARS, year);
  const value = evYear != null ? (STATE_INFO[code]?.evByYear?.[evYear] ?? null) : null;
  return { value, evYear };
}

// 선택 연도에 적용되는 인구조사 연도. 첫 조사(보통 1790) 이전이면 null.
export function applicableCensus(year) {
  let pick = null;
  for (const y of CENSUS_YEARS) {
    if (y <= year) pick = y; else break;
  }
  return pick;
}

// 그 주의 선택 연도 적용 인구 + 적용된 조사연도. 데이터 없으면 value=null.
export function popAt(code, year) {
  const censusYear = applicableCensus(year);
  const value = censusYear != null ? (STATE_INFO[code]?.census?.[censusYear] ?? null) : null;
  return { value, censusYear };
}

// 적용 조사연도 기준 인구 순위(50개 주만, DC 제외) + 그해 집계된 주 수.
// 데이터 없거나 DC면 rank=null.
export function popRankAt(code, year) {
  const censusYear = applicableCensus(year);
  const info = STATE_INFO[code];
  if (censusYear == null || !info || info.order == null) return { rank: null, of: 0, censusYear };
  const self = info.census?.[censusYear];
  const vals = [];
  for (const s of Object.values(STATE_INFO)) {
    if (s.order == null) continue;                 // DC 제외
    const v = s.census?.[censusYear];
    if (v != null) vals.push(v);
  }
  vals.sort((a, b) => b - a);
  const rank = self != null ? vals.indexOf(self) + 1 : null;
  return { rank, of: vals.length, censusYear };
}
