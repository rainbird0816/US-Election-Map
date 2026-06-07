"""주별 승자 -> 선거인단(EC) 합산.

P1: 주 승자독식. ME/NE 의 선거구 분할 배분은 P2 (TODO). 따라서 합계는
'순수 winner-take-all' 값이며, 실제 ME/NE 분할이 있던 해(2008 NE-02 등)와는
표기상 차이가 있을 수 있다(브리프 §1 P1 단순화).

electoral_votes(state=주약칭) 와 region_election_summary(region_code=FIPS) 를
regions 로 조인해 주약칭 기준으로 합산.
"""
import sqlite3
import pathlib

DB = pathlib.Path(__file__).resolve().parent.parent / "db" / "election.sqlite"
SPLITTERS = {"ME", "NE"}   # 선거구 분할 주 (P1 미적용)


def electoral_total(state_winners: dict, ev_by_state: dict) -> dict:
    """state_winners: {state_po: party}, ev_by_state: {state_po: ev}.
    반환: {party: ev합계}. ME/NE 도 P1 은 주 승자독식."""
    totals = {}
    for state, party in state_winners.items():
        if state in SPLITTERS:
            pass  # TODO(P2): at-large 2 + CD별 1 분할 배분
        ev = ev_by_state.get(state, 0)
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
    totals = electoral_total(winners, ev)
    leader = max(totals, key=totals.get) if totals else None
    return {
        "cycle_year": cycle_year,
        "totals": totals,                 # {party: ev}
        "majority": 270,
        "total_ev": sum(ev.values()),
        "leader": leader,
        "leader_won": leader is not None and totals.get(leader, 0) >= 270,
        "ev_by_state": ev,                # {state_po: ev}
        "splitters_note": "ME/NE 주 승자독식 표기(P1) — 선거구 분할은 P2",
    }


# ── 검증: 1976~2024 EC 합계가 실제 winner-take-all 결과와 일치하는지 ──
EXPECTED_WTA = {  # (DEM, REP) — 순수 winner-take-all (ME/NE 분할 미적용)
    1976: (297, 241), 1980: (49, 489), 1984: (13, 525), 1988: (112, 426),
    1992: (370, 168), 1996: (379, 159), 2000: (267, 271), 2004: (252, 286),
    2008: (364, 174), 2012: (332, 206), 2016: (233, 305), 2020: (306, 232),
    2024: (226, 312),
}


def verify():
    con = sqlite3.connect(DB)
    ok = True
    for year in sorted(EXPECTED_WTA):
        ec = ec_for_cycle(con, year)
        d = ec["totals"].get("Democratic", 0)
        r = ec["totals"].get("Republican", 0)
        o = ec["totals"].get("Other", 0)
        exp_d, exp_r = EXPECTED_WTA[year]
        good = (d == exp_d and r == exp_r and o == 0)
        ok = ok and good
        print(f"  {year}: D={d} R={r}" + (f" OTH={o}" if o else "")
              + f"  (expect D={exp_d} R={exp_r}) {'OK' if good else 'FAIL'}")
    con.close()
    return ok


if __name__ == "__main__":
    print("EC 합계 검증 (순수 winner-take-all):")
    import sys
    sys.exit(0 if verify() else 1)
