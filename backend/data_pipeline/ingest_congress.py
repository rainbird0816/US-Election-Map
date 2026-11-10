"""연방 의회(상·하원) 의원 임기 적재: unitedstates/congress-legislators -> congress_terms.

소스(퍼블릭 도메인): https://github.com/unitedstates/congress-legislators
  legislators-current.json / legislators-historical.json (1789~, 임기 단위 행)
  - 중도 사퇴·사망 임기는 end 가 '실제 종료일'(예: Waltz 2025-01-20).
  - 임명직 상원은 how='appointment', end=보궐선거일.
  - 임기 중 정당 변경은 party_affiliations, 무소속 교섭단체는 caucus.
  - 하원 district: 0=전체선거구(at-large)·대표(DC/준주), -1=19세기 일반명부(general ticket) 다인 선출.

실행: python backend/data_pipeline/ingest_congress.py [--fetch]
  --fetch 또는 원본이 없으면 data/raw/congress/ 로 내려받는다.
"""
import json
import sqlite3
import sys
import datetime
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
RAW = ROOT / "data" / "raw" / "congress"
SRC = "https://unitedstates.github.io/congress-legislators/{}.json"
FILES = ("legislators-current", "legislators-historical")

# 원문 정당 → content/parties.js 코드. 미매핑은 OTH(원문은 party_raw 로 보존·표시).
PARTY_MAP = {
    "Democrat": "DEM", "Republican": "REP", "Independent": "IND",
    "Ind. Democrat": "IND", "Independent Democrat": "IND", "Ind. Republican": "IND",
    "Ind. Republican-Democrat": "IND", "Ind. Whig": "IND",
    "Whig": "WHG", "Federalist": "FED",
    "Democratic Republican": "DR", "Crawford Republican": "DR",
    "Jackson": "JAC", "Jacksonian": "JAC", "Jackson Republican": "JAC", "Jacksonian Republican": "JAC",
    "Adams": "ADM", "Adams Democrat": "ADM",
    "Anti Jacksonian": "NR", "Anti-Jacksonian": "NR", "Anti Jackson": "NR",
    "Pro-Administration": "PA", "Pro-administration": "PA",
    "Anti-Administration": "AA", "Anti-administration": "AA",
    "Anti Masonic": "AM", "Anti Mason": "AM",
    "American": "KN", "Populist": "POP", "Progressive": "PROG", "Progressive Republican": "PROG",
    "Unionist": "UNI", "Unconditional Unionist": "UNI", "Union": "UNI",
    "Constitutional Unionist": "CU", "Farmer-Labor": "FL", "National Greenbacker": "GB",
    "Readjuster": "READ", "Readjuster Democrat": "READ", "Prohibitionist": "PROH",
    "Libertarian": "LBT", "Free Soil": "FS",
}


def pcode(raw):
    return PARTY_MAP.get(raw, "OTH") if raw else None


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        print("download", f)
        urllib.request.urlretrieve(SRC.format(f), RAW / f"{f}.json")


def load():
    people = []
    for f in FILES:
        people += json.load(open(RAW / f"{f}.json", encoding="utf-8"))
    return people


def full_name(n):
    if n.get("official_full"):
        return n["official_full"]
    parts = [n.get("first"), n.get("middle"), n.get("last")]
    s = " ".join(p for p in parts if p)
    return s + (f" {n['suffix']}" if n.get("suffix") else "")


def main():
    if "--fetch" in sys.argv or not all((RAW / f"{f}.json").exists() for f in FILES):
        fetch()
    people = load()
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.executescript(
        """
        DROP TABLE IF EXISTS congress_terms;
        CREATE TABLE congress_terms (
          bioguide TEXT, name TEXT, gender TEXT, chamber TEXT, state TEXT,
          district INTEGER, sen_class INTEGER, party TEXT, party_raw TEXT, caucus TEXT,
          start TEXT, end TEXT, how TEXT, affiliations TEXT, wikipedia TEXT
        );
        CREATE INDEX idx_cterm ON congress_terms(chamber, start, end);
        CREATE INDEX idx_cterm_bio ON congress_terms(bioguide);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    rows, last_change = [], ""
    for p in people:
        bio = p["id"]["bioguide"]
        name = full_name(p["name"])
        for t in p["terms"]:
            affs = [
                {"start": a["start"], "end": a["end"], "party": pcode(a.get("party")),
                 "party_raw": a.get("party"), "caucus": pcode(a.get("caucus"))}
                for a in t.get("party_affiliations", [])
            ]
            rows.append((
                bio, name, p.get("bio", {}).get("gender"),
                t["type"], t["state"], t.get("district"), t.get("class"),
                pcode(t.get("party")), t.get("party"), pcode(t.get("caucus")),
                t["start"], t["end"], t.get("how"),
                json.dumps(affs, ensure_ascii=False) if affs else None,
                p["id"].get("wikipedia"),
            ))
            last_change = max(last_change, t["start"])
    cur.executemany(f"INSERT INTO congress_terms VALUES ({','.join('?' * 15)})", rows)
    # 데이터 최신성: 가장 최근 임기 시작일(=반영된 마지막 변동) + 내려받은 날짜
    fetched = datetime.date.fromtimestamp((RAW / f"{FILES[0]}.json").stat().st_mtime).isoformat()
    cur.executemany("INSERT OR REPLACE INTO meta(key, value) VALUES (?,?)",
                    [("congress_last_change", last_change), ("congress_fetched", fetched)])
    con.commit()
    print(f"congress_terms: {len(rows)} rows, last change {last_change}, fetched {fetched}")
    con.close()


if __name__ == "__main__":
    main()
