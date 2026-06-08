// 정당 코드 → {ko 표기, color}. 주지사 임기·대통령·지도 범례가 공유.
// 코드는 fetch_governors.py PARTY_MAP 및 presidents_admin.js 와 일치시킬 것.
export const PARTY = {
  DEM:  { ko: "민주당",       color: "#1565C0" },
  REP:  { ko: "공화당",       color: "#D32F2F" },
  WHG:  { ko: "휘그당",       color: "#E08A3C" },
  FED:  { ko: "연방당",       color: "#C9A227" },
  DR:   { ko: "민주공화당",   color: "#3C9D6E" },
  NR:   { ko: "국민공화당",   color: "#8E6FB5" },
  NP:   { ko: "무정파",       color: "#9E9E9E" },
  IND:  { ko: "무소속",       color: "#8D6E63" },
  UNI:  { ko: "연합당",       color: "#5C6BC0" },
  KN:   { ko: "아메리칸당",   color: "#7E57C2" },
  POP:  { ko: "인민당",       color: "#00897B" },
  JAC:  { ko: "잭슨파",       color: "#1E88E5" },
  FL:   { ko: "농민노동당",   color: "#43A047" },
  SLV:  { ko: "은화당",       color: "#90A4AE" },
  AM:   { ko: "반메이슨당",   color: "#6D4C41" },
  PROH: { ko: "금주당",       color: "#455A64" },
  READ: { ko: "재조정당",     color: "#A1887F" },
  PROG: { ko: "혁신당",       color: "#FB8C00" },
  CU:   { ko: "입헌연합당",   color: "#795548" },
  GB:   { ko: "그린백당",     color: "#2E7D32" },
  LIB:  { ko: "자유당",       color: "#26A69A" },
  AA:   { ko: "반행정파",     color: "#90A4AE" },
  PA:   { ko: "친행정파",     color: "#607D8B" },
  ADM:  { ko: "애덤스파",     color: "#9575CD" },
  OTH:  { ko: "기타·무정당",  color: "#BDBDBD" },
};

export const partyKo = (code) => PARTY[code]?.ko || code || "—";
export const partyColor = (code) => PARTY[code]?.color || "#BDBDBD";
