"""2024 상원 카운티 단위 결과 -> SQLite (level='county', election_id=1_000_000+2024).

소스: MEDSL 2024-senate-county.csv. 상원 카운티 데이터는 2024 만 깔끔히 확보 가능
(역대 상원 카운티는 공개 포맷 부재) → 프론트는 2024 만 카운티 지도, 나머지는 안내.
실행: python backend/data_pipeline/ingest_senate_county.py
"""
import csv
import sqlite3
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
SRC = ROOT / "data" / "raw" / "2024-senate-county.csv"
YEAR = 2024
EID = 1_000_000 + YEAR


def bucket(lines):
    has_dem = any("democrat" in l for l in lines)
    has_rep = any("republican" in l for l in lines)
    if has_dem and not has_rep:
        return 1
    if has_rep:
        return 2
    if any(l.startswith("independent") for l in lines):
        return 3
    return 4


def fips5(v):
    return str(v).strip().zfill(5)


def load():
    """county[fips] = {name, parent, buckets{pid:{votes,name}}, total}."""
    county = {}
    cand = defaultdict(lambda: defaultdict(lambda: {"votes": 0, "lines": set()}))
    meta = {}
    with open(SRC, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if (r.get("stage") or "").strip().lower() != "gen":
                continue
            fips = fips5(r["county_fips"])
            if len(fips) != 5 or fips[:2] == "00":
                continue
            c = cand[fips][r.get("candidate") or "NA"]
            c["votes"] += int(float(r["votes"])) if (r["votes"] or "").strip() else 0
            party = (r.get("party_detailed") or r.get("party_simplified") or "").lower().strip()
            c["lines"].add(party)
            meta[fips] = (r.get("county_name", "").strip().title(), r["state_fips"].zfill(2),
                          int(float(r["totalvotes"])) if (r["totalvotes"] or "").strip() else 0)
    for fips, cands in cand.items():
        buckets = defaultdict(lambda: {"votes": 0, "name": "", "_max": -1})
        for name, c in cands.items():
            pid = bucket(c["lines"])
            b = buckets[pid]
            b["votes"] += c["votes"]
            if c["votes"] > b["_max"]:
                b["name"] = name; b["_max"] = c["votes"]
        nm, parent, total = meta[fips]
        county[fips] = {"name": nm, "parent": parent, "buckets": buckets,
                        "total": total or sum(b["votes"] for b in buckets.values()) or 1}
    return county


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("DELETE FROM results WHERE election_id=? AND level='county'", (EID,))
    cur.execute("DELETE FROM candidates WHERE election_id=? AND LENGTH(region_code)=5", (EID,))
    cur.execute("DELETE FROM elected_seats WHERE election_id=? AND LENGTH(region_code)=5", (EID,))
    county = load()
    n = 0
    for fips, c in county.items():
        cur.execute(
            "INSERT OR IGNORE INTO regions(code, name, level, parent_code, fips, state_po, census_vintage) "
            "VALUES (?,?,?,?,?,?,?)", (fips, c["name"], "county", c["parent"], fips, None, None))
        win = max(c["buckets"], key=lambda p: c["buckets"][p]["votes"])
        for pid, b in c["buckets"].items():
            if b["votes"] == 0 and pid == 4:
                continue
            elected = 1 if pid == win else 0
            cur.execute(
                "INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                "VALUES (?,?,?,?,?,?)", (EID, "senate", fips, b["name"] or "Other", pid, elected))
            cid = cur.lastrowid
            cur.execute(
                "INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                "VALUES (?,?,?,?,?,?)", (EID, "county", fips, cid, b["votes"],
                                        round(b["votes"] / c["total"] * 100, 2)))
            if elected:
                cur.execute("INSERT INTO elected_seats(region_code, election_id, office, candidate_id) "
                            "VALUES (?,?,?,?)", (fips, EID, "senate", cid))
        n += 1
    con.commit()
    print(f"2024 senate county rows: counties={n}")
    con.close()


if __name__ == "__main__":
    main()
