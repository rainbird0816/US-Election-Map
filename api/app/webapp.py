"""us-election-map 백엔드 (FastAPI).
실행: uvicorn app.webapp:app --reload --port 8000  (api/ 에서)
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


# ── 일반화 엔드포인트 (상원/하원/주지사) ──────────────────────────────
# election_id 공간 분리: 대선=연도, 상원=1M+, 하원=2M+, 주지사=3M+.
OFFICE_BASE = {"president": 0, "senate": 1_000_000, "house": 2_000_000, "governor": 3_000_000}
SENATE_SPECIAL_BASE = 1_500_000   # 같은 사이클 상원 보궐선거(지도 비표시, 주 상세에만 표기)


def _eid(office: str, year: int) -> int:
    if office not in OFFICE_BASE:
        raise HTTPException(400, f"unknown office: {office}")
    return OFFICE_BASE[office] + year


@api.get("/elections")
def elections(office: str):
    """office 별 선거 사이클 목록 (연도 셀렉터용)."""
    return q("SELECT cycle_year, name, election_date FROM elections "
             "WHERE type=? ORDER BY cycle_year", (office,))


@api.get("/map")
def office_map(office: str, cycle_year: int):
    """주 단위 지도 + 요약. 상원/주지사=주 승자색, 하원=주별 다수의석색.
    states[].region_code(FIPS), color_hex, winner_rate, top_parties_json 포함."""
    if office == "president":
        raise HTTPException(400, "president 는 /president/map 사용")
    eid = _eid(office, cycle_year)
    states = q(
        """SELECT s.region_code, rg.name AS region_name, rg.state_po,
                  s.winner_party_id, s.winner_rate, s.top_parties_json,
                  p.name AS party_name, p.abbr, p.color_hex
           FROM region_election_summary s
           JOIN regions rg ON rg.code = s.region_code
           JOIN parties p  ON p.id = s.winner_party_id
           WHERE s.office=? AND s.election_id=?
           ORDER BY rg.name""", (office, eid))
    if not states:
        raise HTTPException(404, f"no data for {office} {cycle_year}")
    for s in states:
        s["top_parties_json"] = json.loads(s["top_parties_json"] or "[]")

    if office == "house":
        # 전국 의석 합계 (당선 cd 결과 집계)
        rows = q(
            """SELECT p.abbr, p.name, p.color_hex, COUNT(*) AS n
               FROM results r JOIN candidates c ON c.id=r.candidate_id
               JOIN parties p ON p.id=c.party_id
               WHERE r.election_id=? AND r.level='cd' AND c.is_elected=1
               GROUP BY p.id ORDER BY n DESC""", (eid,))
        summary = {"type": "seats", "total": sum(r["n"] for r in rows),
                   "by_party": [{"abbr": r["abbr"], "party": r["name"],
                                 "color": r["color_hex"], "count": r["n"]} for r in rows]}
    else:
        # 상원/주지사: 그 사이클에 정당이 이긴 주(seat) 수
        tally = {}
        for s in states:
            k = (s["abbr"], s["party_name"], s["color_hex"])
            tally[k] = tally.get(k, 0) + 1
        by = sorted(tally.items(), key=lambda kv: -kv[1])
        summary = {"type": "races", "total": len(states),
                   "by_party": [{"abbr": a, "party": pn, "color": col, "count": n}
                                for (a, pn, col), n in by]}
    has_county = bool(q("SELECT 1 FROM results WHERE election_id=? AND level='county' LIMIT 1", (eid,)))
    return {"office": office, "cycle_year": cycle_year, "states": states,
            "summary": summary, "has_county": has_county}


@api.get("/state")
def office_state(office: str, cycle_year: int, code: str):
    """상원/주지사: 그 주의 후보별 득표(낙선 포함)."""
    if office not in ("senate", "governor"):
        raise HTTPException(400, "이 엔드포인트는 senate/governor 전용")
    eid = _eid(office, cycle_year)
    state = q("SELECT code, name, state_po FROM regions WHERE code=?", (code,))
    if not state:
        raise HTTPException(404, f"unknown state: {code}")
    cand_sql = (
        """SELECT c.name, p.name AS party, p.abbr, p.color_hex, r.votes, r.vote_rate, c.is_elected
           FROM results r
           JOIN candidates c   ON c.id = r.candidate_id
           LEFT JOIN parties p ON p.id = c.party_id
           WHERE r.election_id=? AND r.level='state' AND r.region_code=?
           ORDER BY c.is_elected DESC, r.vote_rate DESC""")
    cands = q(cand_sql, (eid, code))
    # 같은 사이클에 보궐선거(특별선거)가 있던 주면 별도 레이스로 함께 반환.
    specials = []
    if office == "senate":
        sp = q(cand_sql, (SENATE_SPECIAL_BASE + cycle_year, code))
        if sp:
            specials.append({"label": f"{cycle_year} 보궐선거", "candidates": sp})
    return {"state": state[0], "office": office, "cycle_year": cycle_year,
            "candidates": cands, "specials": specials}


@api.get("/house/districts")
def house_districts(cycle_year: int, state_code: str):
    """하원: 주 클릭 시 그 주의 선거구별 당선자 목록 (XX-01 형태)."""
    eid = _eid("house", cycle_year)
    state = q("SELECT code, name, state_po FROM regions WHERE code=?", (state_code,))
    if not state:
        raise HTTPException(404, f"unknown state: {state_code}")
    rows = q(
        """SELECT r.region_code AS cd, c.name, p.abbr, p.name AS party_name, p.color_hex,
                  r.votes, r.vote_rate, c.is_elected
           FROM results r
           JOIN candidates c   ON c.id = r.candidate_id
           LEFT JOIN parties p ON p.id = c.party_id
           WHERE r.election_id=? AND r.level='cd' AND substr(r.region_code,1,2)=?
           ORDER BY r.region_code, r.vote_rate DESC""", (eid, state_code))
    by_cd = {}
    for r in rows:
        d = by_cd.setdefault(r["cd"], {"cd": r["cd"], "district": int(r["cd"][2:]), "candidates": []})
        d["candidates"].append(r)
    districts = sorted(by_cd.values(), key=lambda d: d["district"])
    for d in districts:
        win = next((c for c in d["candidates"] if c["is_elected"]), d["candidates"][0] if d["candidates"] else None)
        d["winner"] = win
        po = state[0]["state_po"]
        d["label"] = f"{po}-{d['district']:02d}" if d["district"] else f"{po}-AL"  # at-large
    return {"office": "house", "cycle_year": cycle_year,
            "state": state[0], "districts": districts}


@api.get("/counties")
def office_counties(office: str, cycle_year: int, state_code: str):
    """일반화 카운티 결과 (대통령·상원). 그 주의 카운티별 승자색 + 후보별 득표.
    상원 카운티는 2024 만 데이터 보유."""
    eid = _eid(office, cycle_year)
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
           ORDER BY r.votes DESC""", (eid, state_code))
    detail = {}
    for r in q(
        """SELECT r.region_code, c.name, p.abbr, p.color_hex, r.votes, r.vote_rate, c.is_elected
           FROM results r JOIN candidates c ON c.id=r.candidate_id
           JOIN regions rg ON rg.code=r.region_code
           LEFT JOIN parties p ON p.id=c.party_id
           WHERE r.election_id=? AND r.level='county' AND rg.parent_code=?
           ORDER BY r.votes DESC""", (eid, state_code)):
        detail.setdefault(r["region_code"], []).append(r)
    for row in rows:
        row["candidates"] = detail.get(row["code"], [])
    return {"office": office, "cycle_year": cycle_year, "state_code": state_code, "counties": rows}


app.include_router(api, prefix="/api")
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="static")
