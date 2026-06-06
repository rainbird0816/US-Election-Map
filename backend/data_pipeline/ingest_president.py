"""대선(대통령선거) 주 단위 개표결과 -> SQLite.

1976~2020: MIT Election Lab state president CSV (data/raw/1976-2020-president.csv).
2024:      tonmcg 카운티 결과를 주 단위로 집계 (data/raw/2024_county.csv).

주별로 DEM / REP / Other 3 버킷 집계(군소·리버태리언·무소속은 Other).
elections.id = cycle_year, candidates.region_code = state FIPS(2자리),
results.level='state'. 승자(득표 최다)는 is_elected=1.
실행: python backend/data_pipeline/ingest_president.py
"""
import csv
import sqlite3
import pathlib
import datetime
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "backend" / "db" / "election.sqlite"
RAW = ROOT / "data" / "raw"
STATE_CSV = RAW / "1976-2020-president.csv"
COUNTY_2024 = RAW / "2024_county.csv"

PARTY = {"DEMOCRAT": 1, "REPUBLICAN": 2}  # 그 외 -> 4(Other)
OTHER = 4


def election_day(year):
    """11월 첫 월요일 다음 화요일."""
    d = datetime.date(year, 11, 1)
    while d.weekday() != 0:  # 첫 월요일
        d += datetime.timedelta(days=1)
    return (d + datetime.timedelta(days=1)).isoformat()


def party_id(simplified):
    return PARTY.get((simplified or "").upper().strip(), OTHER)


def fips2(v):
    return str(int(v)).zfill(2)


def load_state_file():
    """{year: {state_fips: {pid: {'votes':int,'name':str}}}}, total per state.

    퓨전 투표(뉴욕·코네티컷 등 한 후보가 여러 정당 라인) 대응:
    먼저 후보별로 모든 라인을 합산한 뒤 DEM/REP/Other 버킷에 배정한다.
    (예: 1980 NY Reagan = REPUBLICAN + CONSERVATIVE 합산해야 승자.)
    """
    # cand[(year,st)][candidate] = {'votes':int, 'lines':set(simplified)}
    cand = defaultdict(lambda: defaultdict(lambda: {"votes": 0, "lines": set()}))
    totals = defaultdict(lambda: defaultdict(int))
    with open(STATE_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            year = int(r["year"])
            st = fips2(r["state_fips"])
            v = int(r["candidatevotes"] or 0)
            c = cand[(year, st)][r["candidate"]]
            c["votes"] += v
            c["lines"].add((r["party_simplified"] or "").upper().strip())
            totals[year][st] += v

    def cand_bucket(lines):
        if "DEMOCRAT" in lines:
            return 1
        if "REPUBLICAN" in lines:
            return 2
        return OTHER

    data = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: {"votes": 0, "name": ""})))
    for (year, st), cands in cand.items():
        for name, c in cands.items():
            pid = cand_bucket(c["lines"])
            b = data[year][st][pid]
            b["votes"] += c["votes"]
            if c["votes"] >= b.get("_max", -1):   # 버킷 대표 = 최다 득표 후보
                b["name"] = name
                b["_max"] = c["votes"]
    return data, totals


def load_2024():
    """tonmcg 카운티 -> 주 집계. {state_fips: {pid:{votes,name}}}, totals."""
    buckets = defaultdict(lambda: defaultdict(lambda: {"votes": 0, "name": ""}))
    totals = defaultdict(int)
    names = {1: "Kamala Harris", 2: "Donald Trump", OTHER: "Other"}
    with open(COUNTY_2024, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            st = str(r["county_fips"]).zfill(5)[:2]
            gop = int(float(r["votes_gop"] or 0))
            dem = int(float(r["votes_dem"] or 0))
            tot = int(float(r["total_votes"] or 0))
            oth = max(tot - gop - dem, 0)
            buckets[st][1]["votes"] += dem
            buckets[st][2]["votes"] += gop
            buckets[st][OTHER]["votes"] += oth
            totals[st] += tot
    for st in buckets:
        for pid, nm in names.items():
            if pid in buckets[st]:
                buckets[st][pid]["name"] = nm
    return {2024: buckets}, {2024: totals}


def ins_year(cur, year, by_state, totals):
    cur.execute("DELETE FROM results WHERE election_id=?", (year,))
    cur.execute("DELETE FROM candidates WHERE election_id=?", (year,))
    cur.execute("DELETE FROM elected_seats WHERE election_id=?", (year,))
    cur.execute("DELETE FROM elections WHERE id=?", (year,))
    cur.execute(
        "INSERT INTO elections(id, type, name, cycle_year, election_date) VALUES (?,?,?,?,?)",
        (year, "president", f"{year} Presidential Election", year, election_day(year)),
    )
    n_states = 0
    for st, buckets in by_state.items():
        total = totals[st] or 1
        # 승자 = 득표 최다 버킷
        win_pid = max(buckets, key=lambda p: buckets[p]["votes"])
        for pid, b in buckets.items():
            if b["votes"] == 0 and pid == OTHER:
                continue
            elected = 1 if pid == win_pid else 0
            cur.execute(
                "INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                "VALUES (?,?,?,?,?,?)",
                (year, "president", st, b["name"] or "Other", pid, elected),
            )
            cid = cur.lastrowid
            cur.execute(
                "INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                "VALUES (?,?,?,?,?,?)",
                (year, "state", st, cid, b["votes"], round(b["votes"] / total * 100, 2)),
            )
            if elected:
                cur.execute(
                    "INSERT INTO elected_seats(region_code, election_id, office, candidate_id) "
                    "VALUES (?,?,?,?)",
                    (st, year, "president", cid),
                )
        n_states += 1
    return n_states


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    sdata, stot = load_state_file()
    cdata, ctot = load_2024()
    sdata.update(cdata)
    stot.update(ctot)

    for year in sorted(sdata):
        n = ins_year(cur, year, sdata[year], stot[year])
        win = cur.execute(
            "SELECT p.abbr, COUNT(*) FROM candidates c JOIN parties p ON p.id=c.party_id "
            "WHERE c.election_id=? AND c.is_elected=1 GROUP BY p.abbr", (year,)).fetchall()
        wins = ", ".join(f"{a}:{n}" for a, n in win)
        print(f"{year}: states={n}  state-wins[{wins}]")
    con.commit()
    total_rows = cur.execute("SELECT COUNT(*) FROM results WHERE level='state'").fetchone()[0]
    print(f"results(state) rows: {total_rows}")
    con.close()


if __name__ == "__main__":
    main()
