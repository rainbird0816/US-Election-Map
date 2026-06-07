// 승자 격차(margin, %p)에 따라 정당색 농도 조절 — 접전일수록 흰색에 가깝게(옅게),
// 격차가 클수록 원색(진하게). 연속 그라데이션.
//   margin 0   → 가장 옅음(흰색에 MAX_LIGHTEN 만큼 섞임)
//   margin ≥ FULL(20%p) → 원색 그대로

const FULL = 20;          // 이 이상 격차면 원색
const MAX_LIGHTEN = 0.74; // margin 0 일 때 흰색 쪽으로 섞는 최대 비율

function mixWhite(hex, amt) {
  const c = String(hex).replace("#", "");
  const n = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  if (n.length !== 6) return hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const mix = (v) => Math.round(v + (255 - v) * amt);
  return "#" + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// 격차(%p)로 옅게/진하게 보정한 색 반환. margin 이 null 이면 원색.
export function shadeByMargin(hex, margin) {
  if (!hex || margin == null) return hex;
  const m = Math.max(0, Math.min(FULL, margin));
  const t = m / FULL;                  // 0(접전) ~ 1(안정)
  return mixWhite(hex, (1 - t) * MAX_LIGHTEN);
}

// top_parties_json([{abbr,rate,...}] 내림차순) 에서 1위-2위 격차(%p).
// house 는 rate=의석%, 그 외는 rate=득표율 → 어느 쪽이든 경쟁도 지표로 사용.
export function marginFromTop(top) {
  if (!top || !top.length) return null;
  return (top[0]?.rate ?? 0) - (top[1]?.rate ?? 0);
}
