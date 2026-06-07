"""상원(Senate) 주 단위 개표결과 -> SQLite (level='state').

소스(모두 실제 득표 포함, 컬럼명만 정규화):
  - jacksonjude 1976-2020-senate.csv (MIT 포맷: state_fips, candidatevotes, special)
  - MEDSL 2024-senate-state.csv      (votes, stage='GEN', special)
  - jacksonjude past-senate.csv      (state_po만 → po→fips 변환). 2022 전체 + 2024 보궐(NE)만 사용
                                      (2024 정규는 MEDSL, NE 보궐은 MEDSL 미수록이라 여기서 보강).
→ 1976~2024 정규 상원 + 보궐(special) 전 사이클.

주별 DEM/REP/IND/Other 버킷. 상원은 교차(class)로 매 사이클 약 1/3 주만 선거.
정규 election_id = 1_000_000 + year, 보궐 election_id = 1_500_000 + year (지도엔 정규만,
보궐은 주 상세 패널에서 별도 표기). 같은 주에 정규+보궐이 동시(예: 2022 OK, 2020 GA/AZ)면 둘 다 적재.
실행: python backend/data_pipeline/ingest_senate.py
"""
import csv
import sqlite3
import pathlib
import datetime
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
RAW = ROOT / "data" / "raw"
OFFICE = "senate"
BASE = 1_000_000
SPECIAL_BASE = 1_500_000

# 실제 후보가 아닌 집계 행(개표 잔여) — 'Other' 오염 방지용으로 제외.
# 공백/하이픈 차이를 흡수하려고 알파벳만 남긴 compact 형태로 비교('OVER VOTES'='OVERVOTES').
NONCAND_COMPACT = {"WRITEIN", "WRITEINS", "UNDERVOTES", "OVERVOTES", "SPOILED",
                   "SPOILEDBALLOTS", "BLANK", "BLANKVOTES", "EXHAUSTED",
                   "EXHAUSTEDBALLOTS", "SCATTERING", "SCATTERINGVOTES", "NA",
                   "OTHERWRITEINS", "TOTALWRITEINS", "NONE", "NOCANDIDATE"}


def _is_noncand(name):
    key = "".join(ch for ch in (name or "").upper() if ch.isalpha())
    return key in NONCAND_COMPACT


# 소스 파티 결손 보정(party_detailed 공백인 경우만 적용). {(year, state_fips): {이름부분(대문자): party}}.
#   WY 2020: 전 행 파티 공백. AK 2010: Murkowski 기명(write-in) 당선 — 파티 공백이나 공화로 계수(seat=R).
PARTY_OVERRIDE = {
    (2020, "56"): {"LUMMIS": "republican", "BEN DAVID": "democrat"},
    (2010, "02"): {"MURKOWSKI": "republican"},
}

# 일반선거 '다음 해 1월' 결선이라 11월 소스에 결과가 없는 경우 — 공식 결선 결과(certified)로 대체.
#   GA 2020 정규/특별 → 2021-01-05 결선(둘 다 민주 승). (이름, pid, votes), pid 1=DEM·2=REP.
RUNOFF_RESULT = {
    (2020, "13", False): ([("Jon Ossoff", 1, 2269923), ("David A. Perdue", 2, 2214979)], 4484902),
    (2020, "13", True):  ([("Raphael Warnock", 1, 2289113), ("Kelly Loeffler", 2, 2195841)], 4484954),
}


def _fix_party(year, st, name, party):
    if party:
        return party
    ov = PARTY_OVERRIDE.get((year, st))
    if ov:
        up = (name or "").upper()
        for frag, p in ov.items():
            if frag in up:
                return p
    return party


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


def _rows_mit(path, po2fips):
    """1976-2020-senate.csv / 2024-senate-state.csv (state_fips 보유, stage 컬럼 보유)."""
    with open(path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if (r.get("stage") or "").strip().lower() != "gen":
                continue
            cand = (r.get("candidate") or "NA").strip()
            if _is_noncand(cand):
                continue
            votes = r.get("candidatevotes")
            if votes in (None, ""):
                votes = r.get("votes")
            year = int(r["year"]); st = fips2(r["state_fips"])
            party = (r.get("party_detailed") or r.get("party_simplified") or "").lower().strip()
            # party_simplified 'OTHER' 는 사실상 결손 → override 시도 위해 비움 처리
            if party == "other":
                party = ""
            party = _fix_party(year, st, cand, party)
            yield {
                "year": year,
                "st": st,
                "party": party,
                "cand": cand,
                "votes": _to_int(votes),
                "total": _to_int(r.get("totalvotes")),
                "special": (r.get("special") or "").strip().upper() == "TRUE",
                "runoff": False,   # MIT 소스는 stage='gen'만 — 결선은 별도 stage라 제외됨
            }


def _rows_past(path, po2fips, keep):
    """past-senate.csv (state_po만, stage 없음=일반선거). keep(year, special)->bool 로 대상만."""
    with open(path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            year = int(r["date"].split("/")[-1])
            special = (r.get("special") or "").strip().upper() == "TRUE"
            if not keep(year, special):
                continue
            po = (r.get("state_po") or "").strip().upper()
            if po not in po2fips:        # NPV(전국 popular vote) 등 가짜 행 제외
                continue
            cand = (r.get("candidate") or "NA").strip()
            if _is_noncand(cand):
                continue
            yield {
                "year": year,
                "st": po2fips[po],
                "party": (r.get("party") or "").lower().strip(),
                "cand": cand,
                "votes": _to_int(r.get("candidatevotes")),
                "total": _to_int(r.get("totalvotes")),
                "special": special,
                "runoff": (r.get("runoff") or "").strip().upper() == "TRUE",
            }


def load(po2fips):
    """반환: data[eid][st][pid]={votes,name}, tot[eid][st]=int. 정규/보궐은 eid로 분리."""
    # 보강 소스에서 가져올 대상: 2022 전체 + 2024 보궐만(2024 정규는 MEDSL).
    keep_past = lambda y, sp: (y == 2022) or (y == 2024 and sp)
    streams = [
        _rows_mit(RAW / "1976-2020-senate.csv", po2fips),
        _rows_mit(RAW / "2024-senate-state.csv", po2fips),
        _rows_past(RAW / "past-senate.csv", po2fips, keep_past),
    ]

    # 결선(runoff)이 있던 레이스(예: 2022 GA)는 결선이 실제 당락을 가르므로 결선만 사용
    # → (year, st, special, runoff) 로 일단 모은 뒤, 결선 데이터가 있으면 그것으로 대체(합산 금지).
    races = defaultdict(lambda: defaultdict(lambda: {"votes": 0, "lines": set()}))
    totals = defaultdict(int)
    for stream in streams:
        for r in stream:
            key = (r["year"], r["st"], r["special"], r["runoff"])
            races[key][r["cand"]]["votes"] += r["votes"]
            races[key][r["cand"]]["lines"].add(r["party"])
            if r["total"] > totals[key]:
                totals[key] = r["total"]

    # 후보 단위로 보존(정당 합산하지 않음) — 같은 정당 결선·top-two(예: CA 2016/2018, AK 2022 RCV)에서
    # 실제 후보별 득표·격차가 100%로 뭉개지지 않도록. 퓨전(같은 이름·여러 정당 라인)은 이미 이름 기준 합산됨.
    data = defaultdict(lambda: defaultdict(list))   # data[eid][st] = [{name, pid, votes}]
    tot = defaultdict(dict)
    seen = set()
    for (year, st, special, _ro) in races:
        if (year, st, special) in seen:
            continue
        seen.add((year, st, special))
        ro_key = (year, st, special, True)
        cands = races[ro_key] if ro_key in races else races[(year, st, special, False)]
        total_key = ro_key if ro_key in races else (year, st, special, False)
        eid = (SPECIAL_BASE if special else BASE) + year
        ro_override = RUNOFF_RESULT.get((year, st, special))
        if ro_override:                       # 익년 1월 결선 공식 결과로 대체
            cand_rows, total_ov = ro_override
            data[eid][st] = [{"name": n, "pid": p, "votes": v} for n, p, v in cand_rows]
            tot[eid][st] = total_ov
            continue
        data[eid][st] = [{"name": name, "pid": bucket(c["lines"]), "votes": c["votes"]}
                         for name, c in cands.items()]
        tot[eid][st] = totals[total_key]
    return data, tot


KEEP_TOP = 6   # 후보 표시 상한 — 그 외 군소후보는 '기타'로 합산


def ins_election(cur, eid, year, by_state, totals, special):
    for tbl in ("results", "candidates", "elected_seats"):
        cur.execute(f"DELETE FROM {tbl} WHERE election_id=?", (eid,))
    cur.execute("DELETE FROM elections WHERE id=?", (eid,))
    # 보궐은 연도 셀렉터를 어지럽히지 않도록 elections 행을 만들지 않음(정규만 등재).
    if not special:
        cur.execute(
            "INSERT INTO elections(id, type, name, cycle_year, election_date) VALUES (?,?,?,?,?)",
            (eid, OFFICE, f"{year} Senate Elections", year, election_day(year)),
        )
    n = 0
    for st, cands in by_state.items():
        cands = sorted((c for c in cands if c["votes"] > 0), key=lambda c: -c["votes"])
        if not cands:
            continue
        total = totals.get(st) or sum(c["votes"] for c in cands) or 1
        rows = cands[:KEEP_TOP]
        rest = sum(c["votes"] for c in cands[KEEP_TOP:])
        if rest > 0:
            rows.append({"name": "기타", "pid": 4, "votes": rest})
        for i, c in enumerate(rows):
            elected = 1 if i == 0 else 0      # 최다 득표 후보(정렬상 첫 행)
            cur.execute(
                "INSERT INTO candidates(election_id, office, region_code, name, party_id, is_elected) "
                "VALUES (?,?,?,?,?,?)", (eid, OFFICE, st, c["name"] or "Other", c["pid"], elected))
            cid = cur.lastrowid
            cur.execute(
                "INSERT INTO results(election_id, level, region_code, candidate_id, votes, vote_rate) "
                "VALUES (?,?,?,?,?,?)", (eid, "state", st, cid, c["votes"], round(c["votes"] / total * 100, 2)))
            if elected:
                cur.execute(
                    "INSERT INTO elected_seats(region_code, election_id, office, candidate_id) "
                    "VALUES (?,?,?,?)", (st, eid, OFFICE, cid))
        n += 1
    return n


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    po2fips = {po: code for po, code in
               cur.execute("SELECT state_po, code FROM regions WHERE level='state'")}
    data, totals = load(po2fips)
    for eid in sorted(data):
        special = eid >= SPECIAL_BASE
        year = eid - (SPECIAL_BASE if special else BASE)
        n = ins_election(cur, eid, year, data[eid], totals[eid], special)
        tag = "special" if special else "regular"
        print(f"{year} senate {tag}: states={n}")
    con.commit()
    tot = cur.execute("SELECT COUNT(*) FROM results r JOIN candidates c ON c.id=r.candidate_id "
                      "WHERE c.office='senate' AND r.level='state'").fetchone()[0]
    print(f"senate state result rows: {tot}")
    con.close()


if __name__ == "__main__":
    main()
