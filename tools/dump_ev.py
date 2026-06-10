"""DB → tools/ev_by_year.json: 주(FIPS)별 대선 연도별 선거인단(EV) 타임라인.
출처: hist_pres_state(1789-1972, region_code·ev) + electoral_votes(1976-2024, state_po·ev).
프런트는 선택 연도 이하의 '가장 최근 대선' EV 를 적용. 실행: python tools/dump_ev.py"""
import sqlite3, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
OUT = ROOT / "tools" / "ev_by_year.json"

con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
po2fips = {r["state_po"]: r["region_code"] for r in con.execute(
    "SELECT region_code, state_po FROM state_facts")}

ev = {}   # {fips: {year: ev}}
# 역대(1789-1972): region_code 직접
for r in con.execute("SELECT cycle_year, region_code, ev FROM hist_pres_state WHERE ev IS NOT NULL"):
    ev.setdefault(r["region_code"], {})[r["cycle_year"]] = r["ev"]
# 현대(1976-2024): state_po → fips
for r in con.execute("SELECT cycle_year, state, ev FROM electoral_votes"):
    f = po2fips.get(r["state"])
    if f:
        ev.setdefault(f, {})[r["cycle_year"]] = r["ev"]
con.close()

out = {f: {str(y): ev[f][y] for y in sorted(ev[f])} for f in ev}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
years = sorted({y for m in ev.values() for y in m})
print(f"EV: {len(out)}개 주 · 연도 {years[0]}~{years[-1]} ({len(years)}개 대선)")
print("샘플 CA(06):", out.get("06"))
