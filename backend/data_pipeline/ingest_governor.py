"""주지사(Governor) 주 단위 결과 -> SQLite (level='state'). best-effort.

소스: jacksonjude/USA-Election-Map past-governor.csv (주별, voteshare 기반; 1980~2024).
대부분 candidatevotes 가 비어 있어 voteshare(0~1)로 승자·득표율 산출(votes 는 가능 시만).
election_id = 3_000_000 + year. 주지사 선거는 짝/홀수 해 혼재(주마다 다름).
실행: python backend/data_pipeline/ingest_governor.py
"""
import csv
import sqlite3
import pathlib
import datetime
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
SRC = ROOT / "data" / "raw" / "past-governor.csv"
OFFICE = "governor"
BASE = 3_000_000


def election_day(year):
    d = datetime.date(year, 11, 1)
    while d.weekday() != 0:
        d += datetime.timedelta(days=1)
    return (d + datetime.timedelta(days=1)).isoformat()


def bucket(lines):
    has_dem = any("democrat" in l for l in lines)   # 'democratic' 포함
    has_rep = any("republican" in l for l in lines)
    if has_dem and not has_rep:
        return 1
    if has_rep:
        return 2
    if any(l.startswith("independent") for l in lines):
        return 3
    return 4


def po_to_fips(cur):
    return {po: code for code, po in cur.execute(
        "SELECT code, state_po FROM regions WHERE level='state' AND state_po IS NOT NULL")}


def load(po2fips):
    """data[year][fips][pid]={share,votes,name}, present flags."""
    races = defaultdict(lambda: defaultdict(lambda: {"share": 0.0, "votes": 0, "lines": set()}))
    present = defaultdict(set)
    with open(SRC, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            po = (r["state_po"] or "").strip()
            if po not in po2fips:
                continue
            try:
                year = int(r["date"].split("/")[-1])
            except (ValueError, IndexError):
                continue
            sp = (r["special"] or "").strip().upper() == "TRUE"
            st = po2fips[po]
            cand = r["candidate"] or "NA"
            key = (year, st, sp)
            c = races[key][cand]
            try:
                c["share"] += float(r["voteshare"] or 0)
            except ValueError:
                pass
            c["votes"] += int(float(r["candidatevotes"])) if (r["candidatevotes"] or "").strip() else 0
            c["lines"].add((r["party"] or "").lower().strip())
            present[(year, st)].add(sp)

    data = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: {"share": 0.0, "votes": 0, "name": "", "_max": -1.0})))
    for (year, st), flags in present.items():
        sp = False if False in flags else True
        for name, c in races[(year, st, sp)].items():
            pid = bucket(c["lines"])
            b = data[year][st][pid]
            b["share"] += c["share"]
            b["votes"] += c["votes"]
            if c["share"] > b["_max"]:
                b["name"] = name
                b["_max"] = c["share"]
    return data


def ins_year(cur, year, by_state):
    eid = BASE + year
    for tbl in ("results", "candidates", "elected_seats"):
        cur.execute(f"DELETE FROM {tbl} WHERE election_id=?", (eid,))
    cur.execute("DELETE FROM elections WHERE id=?", (eid,))
    cur.execute(
        "INSERT INTO elections(id, type, name, cycle_year, election_date) VALUES (?,?,?,?,?)",
        (eid, OFFICE, f"{year} Gubernatorial Elections", year, election_day(year)))
    n = 0
    for st, buckets in by_state.items():
        win_pid = max(buckets, key=lambda p: buckets[p]["share"])
        for pid, b in buckets.items():
            if b["share"] == 0 and pid == 4:
                continue
            elected = 1 if pid == win_pid else 0
            rate = round(b["share"] * 100, 1)
            cur.execute(
                "INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                "VALUES (?,?,?,?,?,?)", (eid, OFFICE, st, b["name"] or "Other", pid, elected))
            cid = cur.lastrowid
            cur.execute(
                "INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                "VALUES (?,?,?,?,?,?)", (eid, "state", st, cid, b["votes"], rate))
            if elected:
                cur.execute(
                    "INSERT INTO elected_seats(region_code, election_id, office, candidate_id) "
                    "VALUES (?,?,?,?)", (st, eid, OFFICE, cid))
        n += 1
    return n


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    data = load(po_to_fips(cur))
    yrs = 0
    for year in sorted(data):
        ins_year(cur, year, data[year])
        yrs += 1
    con.commit()
    tot = cur.execute("SELECT COUNT(*) FROM candidates WHERE office='governor' AND is_elected=1").fetchone()[0]
    print(f"governor: cycles={yrs}, elected(state-years)={tot}")
    con.close()


if __name__ == "__main__":
    main()
