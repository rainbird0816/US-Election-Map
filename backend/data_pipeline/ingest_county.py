"""카운티 단위 대선 결과 -> SQLite (level='county'). S8.

소스: tonmcg US County Level Presidential Results.
  2008, 2012: data/raw/county_08-16.csv (결합 wide 포맷)
  2016, 2020, 2024: data/raw/{year}_county.csv (단독 포맷)

DEM / REP / Other 3 버킷. county regions(5자리 FIPS) 등록, 승자 is_elected=1.
알래스카는 하원선거구(District N) 단위로 보고됨 — level='county'로 흡수(라벨만 일반화).
MIT guestbook 제약으로 2000·2004 카운티는 미수록(주 단위만 제공).
실행: python backend/data_pipeline/ingest_county.py
"""
import csv
import sqlite3
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "backend" / "db" / "election.sqlite"
RAW = ROOT / "data" / "raw"

COMBINED = RAW / "county_08-16.csv"            # 2008, 2012 (and 2016, 미사용)
STANDALONE = {2016: "2016_county.csv", 2020: "2020_county.csv", 2024: "2024_county.csv"}

CAND = {  # {year: {1:DEM name, 2:REP name}}
    2008: {1: "Barack Obama", 2: "John McCain"},
    2012: {1: "Barack Obama", 2: "Mitt Romney"},
    2016: {1: "Hillary Clinton", 2: "Donald Trump"},
    2020: {1: "Joe Biden", 2: "Donald Trump"},
    2024: {1: "Kamala Harris", 2: "Donald Trump"},
}
OTHER = 4


def fips5(v):
    return str(v).strip().zfill(5)


def load_combined(year):
    """county_08-16.csv -> {fips:{'name','dem','gop','oth','total'}}."""
    out = {}
    with open(COMBINED, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            fips = fips5(r["fips_code"])
            out[fips] = {
                "name": r["county"].strip(),
                "dem": int(float(r[f"dem_{year}"] or 0)),
                "gop": int(float(r[f"gop_{year}"] or 0)),
                "oth": int(float(r[f"oth_{year}"] or 0)),
                "total": int(float(r[f"total_{year}"] or 0)),
            }
    return out


def load_standalone(fname):
    """단독 파일. 2020/2024 는 county_fips, 2016 은 combined_fips 컬럼."""
    out = {}
    with open(RAW / fname, encoding="utf-8") as f:
        rd = csv.DictReader(f)
        fcol = "county_fips" if "county_fips" in rd.fieldnames else "combined_fips"
        for r in rd:
            fips = fips5(r[fcol])
            dem = int(float(r["votes_dem"] or 0))
            gop = int(float(r["votes_gop"] or 0))
            tot = int(float(r["total_votes"] or 0))
            out[fips] = {
                "name": r["county_name"].strip(),
                "dem": dem, "gop": gop, "oth": max(tot - dem - gop, 0), "total": tot,
            }
    return out


def ins_year(cur, year, counties):
    cur.execute("DELETE FROM results WHERE election_id=? AND level='county'", (year,))
    cur.execute("DELETE FROM candidates WHERE election_id=? AND LENGTH(region_code)=5", (year,))
    cur.execute("DELETE FROM elected_seats WHERE election_id=? AND LENGTH(region_code)=5", (year,))
    names = CAND[year]
    n = 0
    for fips, c in counties.items():
        if not fips or len(fips) != 5 or fips[:2] == "00":
            continue
        # county region 등록
        cur.execute(
            "INSERT OR REPLACE INTO regions(code, name, level, parent_code, fips, state_po, census_vintage) "
            "VALUES (?,?,?,?,?,?,?)",
            (fips, c["name"], "county", fips[:2], fips, None, None),
        )
        buckets = {1: c["dem"], 2: c["gop"], OTHER: c["oth"]}
        total = c["total"] or sum(buckets.values()) or 1
        win = max(buckets, key=buckets.get)
        for pid, votes in buckets.items():
            if votes == 0 and pid == OTHER:
                continue
            elected = 1 if pid == win else 0
            nm = names.get(pid, "Other")
            cur.execute(
                "INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                "VALUES (?,?,?,?,?,?)",
                (year, "president", fips, nm, pid, elected),
            )
            cid = cur.lastrowid
            cur.execute(
                "INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                "VALUES (?,?,?,?,?,?)",
                (year, "county", fips, cid, votes, round(votes / total * 100, 2)),
            )
            if elected:
                cur.execute(
                    "INSERT INTO elected_seats(region_code, election_id, office, candidate_id) "
                    "VALUES (?,?,?,?)", (fips, year, "president", cid))
        n += 1
    return n


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    for year in (2008, 2012):
        n = ins_year(cur, year, load_combined(year))
        print(f"{year}: counties={n}")
    for year, fname in STANDALONE.items():
        n = ins_year(cur, year, load_standalone(fname))
        print(f"{year}: counties={n}")
    con.commit()
    total = cur.execute("SELECT COUNT(*) FROM results WHERE level='county'").fetchone()[0]
    nreg = cur.execute("SELECT COUNT(*) FROM regions WHERE level='county'").fetchone()[0]
    print(f"results(county) rows: {total}  county regions: {nreg}")
    con.close()


if __name__ == "__main__":
    main()
