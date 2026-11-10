"""상원·주지사 카운티 결과 -> SQLite (level='county'). MEDSL 주별 투표소(precinct) 파일을 카운티로 합산.

소스(무인증, GitHub): MEDSL 2022-elections-official / 2024-elections-official 의 individual_states/*.zip
  → data/raw/medsl/{year}/ (fetch 는 --fetch). 컬럼: office·mode·votes·county_fips·candidate·party_detailed·special·stage.
적재 대상(election_id 규칙은 기존과 동일: 정규 상원 1M+연도, 보궐 상원 1.5M+연도, 주지사 3M+연도):
  - 2022 상원 정규·보궐(OK), 2022 주지사, 2024 주지사, 2024 상원 보궐(NE·CA partial)
  - 2024 상원 정규는 기존 ingest_senate_county.py(2024-senate-county.csv)가 담당 → 여기선 건드리지 않음.
공백: 2022 CA·TN 파일은 지방선거만 수록 → 2022 CA 상원·TN 주지사 카운티 없음.

집계 규칙:
  - mode: 카운티에 'TOTAL' 행이 있으면 TOTAL 만, 없으면 모든 mode 합산(이중 집계 방지).
  - 후보 → 정당 버킷(민주1/공화2/무소속3/기타4)은 기존 ingest_senate_county 와 같은 방식(퓨전은 후보명 기준 합산).
  - 득표율 분모 = 카운티 유효 후보표 합(언더/오버보트 등 비후보 행 제외).
실행: python backend/data_pipeline/ingest_county_medsl.py [--fetch]
  ※ ingest_governor.py·ingest_senate.py 뒤에 실행(주 단위 보정 STATE_REBUILD 를 덮어쓰지 않도록), 그다음 precompute.py.
"""
import csv
import io
import json
import sqlite3
import sys
import pathlib
import urllib.request
import zipfile
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
RAW = ROOT / "data" / "raw" / "medsl"
csv.field_size_limit(10 ** 9)

GOV = {"GOVERNOR", "GOVERNOR AND LIEUTENANT GOVERNOR", "GOVERNOR & LIEUTENANT GOVERNOR"}
SEN_REG = {"US SENATE"}
SEN_SPECIAL_LABEL = {"US SENATE PARTIAL", "US SENATE - 2 YEAR TERM"}   # 2024 CA 잔여임기·NE 보궐
# 후보가 아닌 집계 행(주마다 표기 제각각: 'PUBLIC COUNTER', 'BALLOTS CAST', 'TOTAL VOTES CAST', 'BLANKS' …)
NONCAND_TOKENS = ("UNDER", "OVER VOTE", "OVERVOTE", "BLANK", "SPOILED", "SCATTER", "COUNTER", "CAST",
                  "TOTAL VOTES", "BALLOTS", "REGISTERED", "VOID", "REJECTED", "EXHAUSTED", "NONE OF THE ABOVE",
                  "NOT QUALIFIED", "ABSENTEE", "MILITARY", "PROVISIONAL", "AFFIDAVIT", "NO VOTE")


def noncand(name):
    u = name.upper()
    return any(t in u for t in NONCAND_TOKENS)

# DB 주 단위 결과가 없거나 잘못된 레이스 → MEDSL 집계로 주 단위 행을 다시 씀(기존 jacksonjude 주지사 데이터 결함).
#   2022 MN 주지사: 주 단위 행 누락 / 2022 MI 주지사: 득표율 합 195%·공화 후보 오기(Jensen→Dixon)
STATE_REBUILD = {3_002_022: {"27", "26"}}
EXTRA_STATES = STATE_REBUILD

# (year, kind) → election_id. kind: sen / sen_sp / gov
JOBS = {
    (2022, "sen"): 1_002_022, (2022, "sen_sp"): 1_502_022, (2022, "gov"): 3_002_022,
    (2024, "gov"): 3_002_024, (2024, "sen_sp"): 1_502_024,
}
OFFICE_OF = {"sen": "senate", "sen_sp": "senate", "gov": "governor"}


def fetch():
    for y in (2022, 2024):
        out = RAW / str(y)
        out.mkdir(parents=True, exist_ok=True)
        api = f"https://api.github.com/repos/MEDSL/{y}-elections-official/contents/individual_states"
        for x in json.load(urllib.request.urlopen(api)):
            p = out / x["name"]
            if x["name"].endswith(".zip") and not (p.exists() and p.stat().st_size == x["size"]):
                urllib.request.urlretrieve(
                    f"https://github.com/MEDSL/{y}-elections-official/raw/main/individual_states/{x['name']}", p)


def kind_of(r):
    o = (r["office"] or "").strip().upper()
    special = (r.get("special") or "").strip().upper() == "TRUE"
    if o in GOV:
        return "gov"
    if o in SEN_SPECIAL_LABEL or (o in SEN_REG and special):
        return "sen_sp"
    if o in SEN_REG:
        return "sen"
    return None


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


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def scan(year):
    """→ agg[kind][county][mode_class][cand] = {votes, lines}, meta[county]=(name, state_fips)."""
    agg = defaultdict(lambda: defaultdict(lambda: {"TOTAL": defaultdict(lambda: {"votes": 0, "lines": set()}),
                                                     "OTHER": defaultdict(lambda: {"votes": 0, "lines": set()})}))
    pre = defaultdict(lambda: defaultdict(lambda: {"TOTAL": defaultdict(lambda: {"votes": 0, "lines": set()}),
                                                     "OTHER": defaultdict(lambda: {"votes": 0, "lines": set()})}))
    meta = {}
    for z in sorted((RAW / str(year)).glob("*.zip")):
        zf = zipfile.ZipFile(z)
        for n in zf.namelist():
            if not n.endswith(".csv"):
                continue
            for r in csv.DictReader(io.TextIOWrapper(zf.open(n), encoding="utf-8", errors="replace")):
                k = kind_of(r)
                if not k or (year, k) not in JOBS or k == "sen" and year == 2024:
                    continue
                if (r.get("stage") or "GEN").strip().upper() != "GEN":
                    continue
                cand = (r.get("candidate") or "").strip()
                if not cand or noncand(cand):
                    continue
                f = (r.get("county_fips") or "").strip()
                if not f.isdigit():
                    continue
                f = f.zfill(5)
                # mode 판단은 투표소 단위: 그 투표소에 TOTAL 이 있으면 TOTAL 만, 없으면 전 mode 합산
                mc = "TOTAL" if (r.get("mode") or "").strip().upper() == "TOTAL" else "OTHER"
                c = pre[k][(f, r.get("precinct") or "")][mc][cand]
                c["votes"] += to_int(r.get("votes"))
                c["lines"].add((r.get("party_detailed") or r.get("party_simplified") or "").lower().strip())
                meta[f] = ((r.get("county_name") or "").strip().title(), f[:2])
    for k, precincts in pre.items():
        for (f, _), modes in precincts.items():
            for name, c in (modes["TOTAL"] or modes["OTHER"]).items():
                t = agg[k][f]["TOTAL"][name]
                t["votes"] += c["votes"]
                t["lines"] |= c["lines"]
    return agg, meta


def state_cands(cur, eid):
    """DB 주 단위 후보 {주FIPS: [(성 토큰 집합, pid)]} — 원본 정당 칸이 빈 주(예: 2022 NM)의 정당 보정용."""
    out = defaultdict(list)
    for st, name, pid in cur.execute(
            "SELECT r.region_code, c.name, c.party_id FROM results r JOIN candidates c ON c.id=r.candidate_id "
            "WHERE r.election_id=? AND r.level='state'", (eid,)):
        out[st].append(({t for t in name.upper().replace(".", "").split() if len(t) > 2}, pid))
    return out


def pid_of(lines, name, cands):
    if any(l for l in lines):
        return bucket(lines)
    toks = set(name.upper().replace(".", "").split())
    for sur, pid in cands:
        if sur & toks:
            return pid
    return 4


def write(cur, eid, office, counties, meta):
    cur.execute("DELETE FROM results WHERE election_id=? AND level='county'", (eid,))
    cur.execute("DELETE FROM candidates WHERE election_id=? AND LENGTH(region_code)=5", (eid,))
    cur.execute("DELETE FROM elected_seats WHERE election_id=? AND LENGTH(region_code)=5", (eid,))
    states = set()
    sc = state_cands(cur, eid)
    allowed = set(sc) | EXTRA_STATES.get(eid, set())   # 그 선거가 실제 있었던 주만(다른 파일의 동명 직책 혼입 방지)
    for fips, modes in counties.items():
        if fips[:2] not in allowed:
            continue
        cands = modes["TOTAL"] if modes["TOTAL"] else modes["OTHER"]
        buckets = defaultdict(lambda: {"votes": 0, "name": "", "_max": -1})
        for name, c in cands.items():
            b = buckets[pid_of(c["lines"], name, sc.get(fips[:2], []))]
            b["votes"] += c["votes"]
            if c["votes"] > b["_max"]:
                b["name"], b["_max"] = name, c["votes"]
        total = sum(b["votes"] for b in buckets.values())
        if total <= 0:
            continue
        name, parent = meta[fips]
        states.add(parent)
        cur.execute("INSERT OR IGNORE INTO regions(code, name, level, parent_code, fips, state_po, census_vintage) "
                    "VALUES (?,?,?,?,?,?,?)", (fips, name, "county", parent, fips, None, None))
        win = max(buckets, key=lambda p: buckets[p]["votes"])
        for pid, b in buckets.items():
            if b["votes"] == 0:
                continue
            elected = 1 if pid == win else 0
            cur.execute("INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                        "VALUES (?,?,?,?,?,?)", (eid, office, fips, b["name"].title(), pid, elected))
            cid = cur.lastrowid
            cur.execute("INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                        "VALUES (?,?,?,?,?,?)", (eid, "county", fips, cid, b["votes"], round(b["votes"] / total * 100, 2)))
            if elected:
                cur.execute("INSERT INTO elected_seats(region_code, election_id, office, candidate_id) VALUES (?,?,?,?)",
                            (fips, eid, office, cid))
    return states


def rebuild_state(cur, eid, office, counties):
    """STATE_REBUILD 대상 주: 카운티 집계(후보 단위)로 주 단위 results/candidates/elected_seats 재작성."""
    for st in STATE_REBUILD.get(eid, ()):
        tot = defaultdict(lambda: {"votes": 0, "lines": set()})
        for fips, modes in counties.items():
            if fips[:2] != st:
                continue
            for name, c in (modes["TOTAL"] if modes["TOTAL"] else modes["OTHER"]).items():
                tot[name]["votes"] += c["votes"]
                tot[name]["lines"] |= c["lines"]
        if not tot:
            continue
        ids = [r[0] for r in cur.execute("SELECT id FROM candidates WHERE election_id=? AND region_code=?", (eid, st))]
        cur.execute("DELETE FROM results WHERE election_id=? AND level='state' AND region_code=?", (eid, st))
        cur.execute("DELETE FROM elected_seats WHERE election_id=? AND region_code=?", (eid, st))
        cur.executemany("DELETE FROM candidates WHERE id=?", [(i,) for i in ids])
        total = sum(c["votes"] for c in tot.values())
        top = sorted(tot.items(), key=lambda x: -x[1]["votes"])
        for i, (name, c) in enumerate(top[:6]):
            pid = bucket(c["lines"])
            cur.execute("INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                        "VALUES (?,?,?,?,?,?)", (eid, office, st, name.title(), pid, 1 if i == 0 else 0))
            cid = cur.lastrowid
            cur.execute("INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                        "VALUES (?,?,?,?,?,?)", (eid, "state", st, cid, c["votes"], round(c["votes"] / total * 100, 2)))
            if i == 0:
                cur.execute("INSERT INTO elected_seats(region_code, election_id, office, candidate_id) VALUES (?,?,?,?)",
                            (st, eid, office, cid))
        print(f"  rebuilt state {st} eid={eid}: " + ", ".join(f"{n.title()} {c['votes']:,}" for n, c in top[:3]))


def main():
    if "--fetch" in sys.argv or not (RAW / "2022").exists():
        fetch()
    con = sqlite3.connect(DB)
    cur = con.cursor()
    for year in (2022, 2024):
        agg, meta = scan(year)
        for (y, k), eid in JOBS.items():
            if y != year:
                continue
            rebuild_state(cur, eid, OFFICE_OF[k], agg.get(k, {}))
            states = write(cur, eid, OFFICE_OF[k], agg.get(k, {}), meta)
            print(f"{year} {k:6s} eid={eid}: counties={len(agg.get(k, {}))}, states={len(states)}")
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
