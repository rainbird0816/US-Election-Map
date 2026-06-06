"""us-election-map 백엔드 (FastAPI).
실행: uvicorn app.main:app --reload --port 8000  (backend/ 에서)
P1 범위: 대통령선거 × 주(state) 단위 EC 지도.
"""
import json
import sqlite3
import pathlib
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import electoral

DB = pathlib.Path(__file__).resolve().parent.parent / "db" / "election.sqlite"
DIST = pathlib.Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

app = FastAPI(title="us-election-map")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter()


def q(sql, args=()):
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    try:
        rows = [dict(r) for r in con.execute(sql, args)]
    finally:
        con.close()
    return rows


def _con():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


@api.get("/health")
def health():
    return {"ok": True}


@api.get("/president/elections")
def president_elections():
    """대선 사이클 목록 (연도 셀렉터용)."""
    return q("SELECT cycle_year, name, election_date FROM elections "
             "WHERE type='president' ORDER BY cycle_year")


@api.get("/president/map")
def president_map(cycle_year: int):
    """주별 승자 정당색 + EC 합계 바. {ec, states:[...]}.
    카운티 데이터 보유 여부(has_county)도 주별로 표시."""
    rows = q(
        """SELECT s.region_code, rg.name AS region_name, rg.state_po,
                  s.winner_party_id, s.winner_rate, s.top_parties_json,
                  c.name AS winner_name, p.name AS party_name, p.abbr, p.color_hex,
                  ev.ev
           FROM region_election_summary s
           JOIN regions rg     ON rg.code = s.region_code
           JOIN parties p      ON p.id = s.winner_party_id
           LEFT JOIN candidates c ON c.id = s.winner_candidate_id
           LEFT JOIN electoral_votes ev ON ev.state = rg.state_po AND ev.cycle_year = s.election_id
           WHERE s.office='president' AND s.election_id=?
           ORDER BY rg.name""",
        (cycle_year,),
    )
    if not rows:
        raise HTTPException(404, f"no data for cycle {cycle_year}")
    for r in rows:
        r["top_parties_json"] = json.loads(r["top_parties_json"] or "[]")

    # 카운티 보유 연도 표시 (S8)
    county_years = {r["cycle_year"] for r in q(
        "SELECT DISTINCT election_id AS cycle_year FROM results WHERE level='county'")}

    con = _con()
    ec = electoral.ec_for_cycle(con, cycle_year)
    con.close()
    return {"ec": ec, "states": rows, "has_county": cycle_year in county_years}


@api.get("/president/state")
def president_state(cycle_year: int, code: str):
    """주 상세: 그 사이클 후보별 득표(낙선 포함)."""
    state = q("SELECT code, name, state_po FROM regions WHERE code=?", (code,))
    if not state:
        raise HTTPException(404, f"unknown state: {code}")
    cands = q(
        """SELECT c.name, p.name AS party, p.abbr, p.color_hex,
                  r.votes, r.vote_rate, c.is_elected
           FROM results r
           JOIN candidates c   ON c.id = r.candidate_id
           LEFT JOIN parties p ON p.id = c.party_id
           WHERE r.election_id=? AND r.level='state' AND r.region_code=?
           ORDER BY c.is_elected DESC, r.votes DESC""",
        (cycle_year, code),
    )
    ev = q("SELECT ev FROM electoral_votes WHERE state=? AND cycle_year=?",
           (state[0]["state_po"], cycle_year))
    return {"state": state[0], "cycle_year": cycle_year,
            "ev": ev[0]["ev"] if ev else None, "candidates": cands}


@api.get("/president/history")
def president_history(code: str):
    """주 역대 대선: 사이클별 승자 + 정당 추이(민주/공화 득표율)."""
    state = q("SELECT code, name, state_po FROM regions WHERE code=?", (code,))
    if not state:
        raise HTTPException(404, f"unknown state: {code}")
    rows = q(
        """SELECT s.election_id AS cycle_year, p.name AS party, p.abbr, p.color_hex,
                  c.name AS winner_name, s.winner_rate, ev.ev
           FROM region_election_summary s
           JOIN parties p ON p.id = s.winner_party_id
           LEFT JOIN candidates c ON c.id = s.winner_candidate_id
           LEFT JOIN electoral_votes ev ON ev.state=? AND ev.cycle_year=s.election_id
           WHERE s.office='president' AND s.region_code=?
           ORDER BY s.election_id""",
        (state[0]["state_po"], code),
    )
    # 정당 추이: 사이클별 DEM/REP 득표율 (top_parties_json 에서)
    trend = []
    for r in q("""SELECT election_id AS cycle_year, top_parties_json
                  FROM region_election_summary
                  WHERE office='president' AND region_code=? ORDER BY election_id""", (code,)):
        tp = json.loads(r["top_parties_json"] or "[]")
        rates = {"cycle_year": r["cycle_year"], "DEM": 0, "REP": 0}
        for p in tp:
            if p["party"] == "Democratic":
                rates["DEM"] = p["rate"]
            elif p["party"] == "Republican":
                rates["REP"] = p["rate"]
        trend.append(rates)
    return {"state": state[0], "winners": rows, "trend": trend}


@api.get("/president/counties")
def president_counties(cycle_year: int, state_code: str):
    """주 클릭 시 그 주의 카운티별 결과(표/리스트). S8.
    알래스카(하원선거구)·뉴잉글랜드(town) 단위 차이는 unit 라벨로 흡수."""
    rows = q(
        """SELECT rg.code, rg.name AS region_name, rg.level,
                  c.name AS winner_name, p.name AS party, p.abbr, p.color_hex,
                  r.votes, r.vote_rate
           FROM results r
           JOIN candidates c   ON c.id = r.candidate_id
           JOIN regions rg     ON rg.code = r.region_code
           LEFT JOIN parties p ON p.id = c.party_id
           WHERE r.election_id=? AND r.level='county'
             AND rg.parent_code=? AND c.is_elected=1
           ORDER BY r.votes DESC""",
        (cycle_year, state_code),
    )
    # 각 카운티의 후보별 득표(상세)도 묶어서 반환
    detail = {}
    for r in q(
        """SELECT r.region_code, c.name, p.abbr, p.color_hex, r.votes, r.vote_rate, c.is_elected
           FROM results r JOIN candidates c ON c.id=r.candidate_id
           JOIN regions rg ON rg.code=r.region_code
           LEFT JOIN parties p ON p.id=c.party_id
           WHERE r.election_id=? AND r.level='county' AND rg.parent_code=?
           ORDER BY r.votes DESC""", (cycle_year, state_code)):
        detail.setdefault(r["region_code"], []).append(r)
    for row in rows:
        row["candidates"] = detail.get(row["code"], [])
    return {"cycle_year": cycle_year, "state_code": state_code, "counties": rows}


app.include_router(api, prefix="/api")
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="static")
