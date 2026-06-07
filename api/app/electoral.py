"""주별 승자 -> 선거인단(EC) 합산.

ME/NE 선거구 분할(Congressional District method) 반영:
- 주 전체 승자가 '상원 몫' 2표를 가져가고(독식), 나머지는 선거구별 승자가 1표씩.
- ME(4표=2+선거구2), NE(5표=2+선거구3). ME는 1972년, NE는 1992년 도입.
- 선거구 승자가 주 전체 승자와 달랐던 사례는 검증된 역대 기록(SPLIT_EXCEPTIONS)으로 인코딩.
  그 외 모든 선거구는 주 전체 승자가 가져감.

electoral_votes(state=주약칭) 와 region_election_summary(region_code=FIPS) 를
regions 로 조인해 주약칭 기준으로 합산. 다른 주는 전부 승자독식.
"""
import sqlite3
import pathlib

DB = pathlib.Path(__file__).resolve().parent.parent / "db" / "election.sqlite"
SPLITTERS = {"ME", "NE"}   # 선거구 분할 주

# 선거구 수(상원 몫 2 제외). ME=2, NE=3.
N_CD = {"ME": 2, "NE": 3}

# 선거구 분할 방식(CD method) 도입 연도. 그 전엔 승자독식이었으므로 분할 표기를 하지 않는다.
# ME 1972년, NE 1992년 도입. (실제로 선거구가 갈린 첫 사례는 2008년 NE-02.)
ADOPTED = {"ME": 1972, "NE": 1992}

# 선거구별 대선 승자가 '주 전체 승자'와 달랐던 사례(검증된 역대 기록).
# {(state_po, cycle_year): {cd번호: 정당명}}. 여기 없는 선거구는 주 전체 승자가 가져감.
#   NE-02: 2008 Obama, 2020 Biden, 2024 Harris (주 전체는 매번 공화)
#   ME-02: 2016·2020·2024 Trump (주 전체는 1992년 이후 매번 민주)
SPLIT_EXCEPTIONS = {
    ("NE", 2008): {2: "Democratic"},
    ("NE", 2020): {2: "Democratic"},
    ("NE", 2024): {2: "Democratic"},
    ("ME", 2016): {2: "Republican"},
    ("ME", 2020): {2: "Republican"},
    ("ME", 2024): {2: "Republican"},
}


def split_items(state_po: str, statewide_party: str, ev: int, cycle_year: int):
    """ME/NE 선거구별 EV 배분 내역. [{label, party, n}] (상원몫 2 + 선거구 1씩)."""
    ncd = N_CD.get(state_po, max(0, ev - 2))
    exc = SPLIT_EXCEPTIONS.get((state_po, cycle_year), {})
    items = [{"label": "주 전체 (상원 몫)", "party": statewide_party, "n": 2}]
    for cd in range(1, ncd + 1):
        items.append({"label": f"{state_po}-{cd:02d}", "party": exc.get(cd, statewide_party), "n": 1})
    return items


def electoral_total(state_winners: dict, ev_by_state: dict, cycle_year: int) -> dict:
    """state_winners: {state_po: party}, ev_by_state: {state_po: ev}.
    반환: {party: ev합계}. ME/NE 만 선거구 분할, 나머지는 승자독식."""
    totals = {}
    for state, party in state_winners.items():
        ev = ev_by_state.get(state, 0)
        if state in SPLITTERS and ev:
            for it in split_items(state, party, ev, cycle_year):
                totals[it["party"]] = totals.get(it["party"], 0) + it["n"]
        else:
            totals[party] = totals.get(party, 0) + ev
    return totals


def get_ev(con, cycle_year) -> dict:
    return {r[0]: r[1] for r in con.execute(
        "SELECT state, ev FROM electoral_votes WHERE cycle_year=?", (cycle_year,))}


def get_state_winners(con, cycle_year) -> dict:
    """{state_po: party_name} — region_election_summary 의 주 승자."""
    rows = con.execute(
        """SELECT rg.state_po, p.name
           FROM region_election_summary s
           JOIN regions rg ON rg.code = s.region_code
           JOIN parties p  ON p.id = s.winner_party_id
           WHERE s.office='president' AND s.election_id=?""", (cycle_year,))
    return {po: party for po, party in rows}


def ec_for_cycle(con, cycle_year) -> dict:
    """프론트 EC 바 + 지도용 집계. {totals, majority, leader, ev_by_state}."""
    winners = get_state_winners(con, cycle_year)
    ev = get_ev(con, cycle_year)
    totals = electoral_total(winners, ev, cycle_year)
    leader = max(totals, key=totals.get) if totals else None
    return {
        "cycle_year": cycle_year,
        "totals": totals,                 # {party: ev}
        "majority": 270,
        "total_ev": sum(ev.values()),
        "leader": leader,
        "leader_won": leader is not None and totals.get(leader, 0) >= 270,
        "ev_by_state": ev,                # {state_po: ev}
        "splitters_note": "ME/NE 선거구 분할 반영(상원몫 2 + 선거구 1씩)",
    }


def split_for_state(con, cycle_year: int, state_po: str):
    """ME/NE 주 상세용: 선거구별 EV 배분 내역(정당색·약칭 포함). 그 외 주는 None."""
    if state_po not in SPLITTERS or cycle_year < ADOPTED.get(state_po, 0):
        return None   # 도입 전(NE<1992)은 승자독식 — 분할 내역 표기 안 함
    party = get_state_winners(con, cycle_year).get(state_po)
    ev = get_ev(con, cycle_year).get(state_po, 0)
    if not party or not ev:
        return None
    meta = {r[0]: (r[1], r[2]) for r in con.execute("SELECT name, abbr, color_hex FROM parties")}
    items = split_items(state_po, party, ev, cycle_year)
    for it in items:
        ab, col = meta.get(it["party"], ("?", "#bbb"))
        it["abbr"], it["color_hex"] = ab, col
    by_party = {}
    for it in items:
        by_party[it["abbr"]] = by_party.get(it["abbr"], 0) + it["n"]
    return {"ev": ev, "items": items,
            "by_party": [{"abbr": a, "ev": n} for a, n in
                         sorted(by_party.items(), key=lambda kv: -kv[1])],
            "is_split": len({it["party"] for it in items}) > 1}


# ── 검증: 1976~2024 EC 합계가 '실제(ME/NE 분할 반영) 결과'와 일치하는지 ──
EXPECTED_REAL = {  # (DEM, REP) — 실제 선거인단 배분(ME/NE 분할 반영, 신의없는 선거인 제외)
    1976: (297, 241), 1980: (49, 489), 1984: (13, 525), 1988: (112, 426),
    1992: (370, 168), 1996: (379, 159), 2000: (267, 271), 2004: (252, 286),
    2008: (365, 173), 2012: (332, 206), 2016: (232, 306), 2020: (306, 232),
    2024: (226, 312),
}


def verify():
    con = sqlite3.connect(DB)
    ok = True
    for year in sorted(EXPECTED_REAL):
        ec = ec_for_cycle(con, year)
        d = ec["totals"].get("Democratic", 0)
        r = ec["totals"].get("Republican", 0)
        o = ec["totals"].get("Other", 0)
        exp_d, exp_r = EXPECTED_REAL[year]
        good = (d == exp_d and r == exp_r and o == 0)
        ok = ok and good
        print(f"  {year}: D={d} R={r}" + (f" OTH={o}" if o else "")
              + f"  (expect D={exp_d} R={exp_r}) {'OK' if good else 'FAIL'}")
    con.close()
    return ok


if __name__ == "__main__":
    print("EC 합계 검증 (ME/NE 선거구 분할 반영):")
    import sys
    sys.exit(0 if verify() else 1)
