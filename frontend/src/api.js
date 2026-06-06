const BASE = "/api";

async function get(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const getPresidentElections = () => get("/president/elections");
export const getPresidentMap = (cycleYear) => get("/president/map", { cycle_year: cycleYear });
export const getPresidentState = (cycleYear, code) =>
  get("/president/state", { cycle_year: cycleYear, code });
export const getPresidentHistory = (code) => get("/president/history", { code });
export const getPresidentCounties = (cycleYear, stateCode) =>
  get("/president/counties", { cycle_year: cycleYear, state_code: stateCode });
