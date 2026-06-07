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

// 일반화 (상원/하원/주지사)
export const getElections = (office) => get("/elections", { office });
export const getOfficeMap = (office, cycleYear) =>
  get("/map", { office, cycle_year: cycleYear });
export const getOfficeState = (office, cycleYear, code) =>
  get("/state", { office, cycle_year: cycleYear, code });
export const getHouseDistricts = (cycleYear, stateCode) =>
  get("/house/districts", { cycle_year: cycleYear, state_code: stateCode });
export const getCounties = (office, cycleYear, stateCode) =>
  get("/counties", { office, cycle_year: cycleYear, state_code: stateCode });
