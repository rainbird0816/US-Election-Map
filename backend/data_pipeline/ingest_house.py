"""하원(House) 선거구 단위 개표결과 -> SQLite (level='cd').

소스(둘 다 실제 득표 포함):
  - jacksonjude 1976-2022-house.csv (MIT 포맷: state_fips, district, stage, special)
  - jacksonjude past-house.csv      (state_po·district만; year==2024 일반선거 보강)
→ 1976~2024.
선거구(CD)별 DEM/REP/IND/Other 버킷 → 승자 1명. region_code = 주FIPS(2) + 선거구번호(2),
예: TX-01 = '4801', 단일선거구(at-large) = '__00'. 지도는 주별 다수의석 집계(precompute).
election_id = 2_000_000 + year. 정규 일반선거(stage='gen', 보궐 제외) 기준.
실행: python backend/data_pipeline/ingest_house.py
"""
import csv
import sqlite3
import pathlib
import datetime
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
RAW = ROOT / "data" / "raw"
SRC = RAW / "1976-2022-house.csv"
SRC_2024 = RAW / "past-house.csv"
OFFICE = "house"
BASE = 2_000_000

# 실제 후보가 아닌 집계 행 — 'Other' 오염 방지용 제외.
NONCAND = {"WRITE-IN", "WRITEIN", "WRITE-INS", "UNDERVOTES", "OVERVOTES",
           "SPOILED", "BLANK", "BLANK VOTES", "EXHAUSTED", "SCATTERING", "NA"}


def election_day(year):
    d = datetime.date(year, 11, 1)
    while d.weekday() != 0:
        d += datetime.timedelta(days=1)
    return (d + datetime.timedelta(days=1)).isoformat()


def fips2(v):
    return str(int(v)).zfill(2)


def bucket(lines):
    # 부분일치: 'democratic-farmer-labor'(MN DFL), 'democratic-npl'(ND), 'independent-republican'(MN IR=GOP) 등 흡수.
    has_dem = any("democrat" in l for l in lines)
    has_rep = any("republican" in l for l in lines)
    if has_dem and not has_rep:
        return 1
    if has_rep:
        return 2
    if any(l.startswith("independent") for l in lines):
        return 3
    return 4


def _to_int(v):
    return int(float(v)) if (v not in (None, "") and str(v).strip() != "") else 0


def _rows_mit(path):
    """1976-2022-house.csv: state_fips·district(정수)·stage·special·candidatevotes."""
    with open(path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if (r["stage"] or "").strip().lower() != "gen":
                continue
            try:
                year = int(r["year"]); st = fips2(r["state_fips"]); dist = int(r["district"])
            except (ValueError, TypeError):
                continue
            cand = (r["candidate"] or "NA").strip()
            if cand.upper() in NONCAND:
                continue
            yield {"year": year, "cd": f"{st}{dist:02d}",
                   "special": (r["special"] or "").strip().upper() == "TRUE",
                   "cand": cand, "party": (r["party"] or "").lower().strip(),
                   "votes": _to_int(r.get("candidatevotes")), "total": _to_int(r.get("totalvotes"))}


def _rows_past_2024(path, po2fips):
    """past-house.csv year==2024(일반선거). region=주약칭, district=정수/0(at-large).
    'PV'(주 popular-vote)·'NPV' 가짜 행은 정수 변환 실패로 자동 제외."""
    with open(path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if int(r["date"].split("/")[-1]) != 2024:
                continue
            po = (r.get("region") or "").strip().upper()
            if po not in po2fips:
                continue
            try:
                dist = int(r["district"])      # 'PV' 등은 여기서 걸러짐
            except (ValueError, TypeError):
                continue
            cand = (r.get("candidate") or "NA").strip()
            if cand.upper() in NONCAND:
                continue
            yield {"year": 2024, "cd": f"{po2fips[po]}{dist:02d}", "special": False,
                   "cand": cand, "party": (r.get("party") or "").lower().strip(),
                   "votes": _to_int(r.get("candidatevotes")), "total": _to_int(r.get("totalvotes"))}


def load(po2fips):
    """반환: data[year][cd_code]={pid:{votes,name}}, totals[year][cd_code]=int, cd_code=주FIPS+선거구2."""
    races = defaultdict(lambda: defaultdict(lambda: {"votes": 0, "lines": set()}))
    totals = defaultdict(int)
    present = defaultdict(set)
    for stream in (_rows_mit(SRC), _rows_past_2024(SRC_2024, po2fips)):
        for r in stream:
            key = (r["year"], r["cd"], r["special"])
            races[key][r["cand"]]["votes"] += r["votes"]
            races[key][r["cand"]]["lines"].add(r["party"])
            if r["total"] > totals[key]:
                totals[key] = r["total"]
            present[(r["year"], r["cd"])].add(r["special"])

    data = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: {"votes": 0, "name": "", "_max": -1})))
    tot = defaultdict(dict)
    for (year, cd), flags in present.items():
        sp = False if False in flags else True
        key = (year, cd, sp)
        for name, c in races[key].items():
            pid = bucket(c["lines"])
            b = data[year][cd][pid]
            b["votes"] += c["votes"]
            if c["votes"] > b["_max"]:
                b["name"] = name
                b["_max"] = c["votes"]
        tot[year][cd] = totals[key]
    return data, tot


def ins_year(cur, year, by_cd, totals):
    eid = BASE + year
    for tbl in ("results", "candidates", "elected_seats"):
        cur.execute(f"DELETE FROM {tbl} WHERE election_id=?", (eid,))
    cur.execute("DELETE FROM elections WHERE id=?", (eid,))
    cur.execute(
        "INSERT INTO elections(id, type, name, cycle_year, election_date) VALUES (?,?,?,?,?)",
        (eid, OFFICE, f"{year} House Elections", year, election_day(year)),
    )
    n_cd = 0
    for cd, buckets in by_cd.items():
        st = cd[:2]
        total = totals.get(cd) or sum(b["votes"] for b in buckets.values()) or 1
        win_pid = max(buckets, key=lambda p: buckets[p]["votes"])
        for pid, b in buckets.items():
            if b["votes"] == 0 and pid == 4:
                continue
            elected = 1 if pid == win_pid else 0
            # candidates.region_code = 주FIPS(주별 조인용), 선거구 식별은 results.region_code(cd)
            cur.execute(
                "INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                "VALUES (?,?,?,?,?,?)", (eid, OFFICE, st, b["name"] or "Other", pid, elected))
            cid = cur.lastrowid
            cur.execute(
                "INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                "VALUES (?,?,?,?,?,?)", (eid, "cd", cd, cid, b["votes"], round(b["votes"] / total * 100, 2)))
            if elected:
                cur.execute(
                    "INSERT INTO elected_seats(region_code, election_id, office, candidate_id) "
                    "VALUES (?,?,?,?)", (cd, eid, OFFICE, cid))
        n_cd += 1
    return n_cd


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    po2fips = {po: code for po, code in
               cur.execute("SELECT state_po, code FROM regions WHERE level='state'")}
    data, totals = load(po2fips)
    for year in sorted(data):
        n = ins_year(cur, year, data[year], totals[year])
        print(f"{year}: house districts={n}")
    con.commit()
    tot = cur.execute("SELECT COUNT(*) FROM results WHERE level='cd'").fetchone()[0]
    print(f"house result rows (cd): {tot}")
    con.close()


if __name__ == "__main__":
    main()
