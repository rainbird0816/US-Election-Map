"""역대 대선(1789-1972) 주별 승리정당·선거인단·득표 -> SQLite (hist_pres_state).

소스: zonination/election-history elec.csv (GPL-3.0) — 사본 elec_history_1789_2016.csv.
  컬럼: Year("1789 - Washington"), State, total, [party.1,%,EV]×4, Party(주 승리정당), Notes
  party.1~4 는 그 해 후보별 득표(위치 고정, 라벨 없음). 'Party' 가 그 주의 승리 정당.

이 테이블은 '역대 대선' 페이지(PotusHistory)의 지도/범례 전용이다. 1976+ 는 기존
파이프라인(region_election_summary)이 담당하므로 여기서는 < 1976 만 적재한다.
EC 합계·전국 득표율 등 카드 헤드라인 수치는 별도 큐레이션(presidents.js)을 쓴다.

실행: python backend/data_pipeline/ingest_president_history.py
"""
import csv
import re
import sqlite3
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
SRC = pathlib.Path(__file__).resolve().parent / "elec_history_1789_2016.csv"

NAME_FIX = {"Dist. of Col.": "District of Columbia"}
CUTOFF = 1976   # 이 연도 이상은 기존 DB가 담당 → 적재 제외


def _num(v):
    v = (v or "").strip()
    if v in ("", "-"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def parse_rows():
    # 헤더에 '%','EV' 가 4번씩 중복돼 DictReader 로는 못 잡는다 → 위치 인덱스로 파싱.
    # 0 Year,1 State,2 total,[3 v,4 %,5 EV]=p1,[6,7,8]=p2,[9,10,11]=p3,[12,13,14]=p4,15 Party,16 Notes
    with open(SRC, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)   # 헤더 skip
        for row in reader:
            if len(row) < 16:
                continue
            m = re.match(r"\s*(\d{4})\s*-\s*(.+)", row[0] or "")
            if not m:
                continue
            year = int(m.group(1))
            if year >= CUTOFF:
                continue
            state = NAME_FIX.get(row[1].strip(), row[1].strip())
            pcts = sorted((p for p in (_num(row[4]), _num(row[7]), _num(row[10]), _num(row[13]))
                           if p is not None), reverse=True)
            evs = [_num(row[5]), _num(row[8]), _num(row[11]), _num(row[14])]
            ev = int(sum(e for e in evs if e)) or None
            total = _num(row[2])
            yield {
                "cycle_year": year, "winner_last": m.group(2).strip(), "state_name": state,
                "winner_party": (row[15] or "").strip(),
                "top1": pcts[0] if pcts else None,
                "top2": pcts[1] if len(pcts) > 1 else None,
                "ev": ev,
                "total_votes": int(total) if total else None,
            }


def main():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS hist_pres_state (
        cycle_year   INTEGER,
        region_code  TEXT,
        state_po     TEXT,
        state_name   TEXT,
        winner_party TEXT,
        top1_rate    REAL,
        top2_rate    REAL,
        ev           INTEGER,
        total_votes  INTEGER,
        PRIMARY KEY (cycle_year, region_code)
    )""")
    con.execute("CREATE INDEX IF NOT EXISTS idx_hist_year ON hist_pres_state(cycle_year)")
    # 주이름 -> FIPS/약칭
    regions = {r[0]: (r[1], r[2]) for r in con.execute(
        "SELECT name, code, state_po FROM regions WHERE level='state'")}

    con.execute("DELETE FROM hist_pres_state")
    n, miss = 0, set()
    for r in parse_rows():
        rg = regions.get(r["state_name"])
        if not rg:
            miss.add(r["state_name"])
            continue
        code, po = rg
        con.execute(
            """INSERT OR REPLACE INTO hist_pres_state
               (cycle_year, region_code, state_po, state_name, winner_party,
                top1_rate, top2_rate, ev, total_votes)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (r["cycle_year"], code, po, r["state_name"], r["winner_party"],
             r["top1"], r["top2"], r["ev"], r["total_votes"]))
        n += 1
    con.commit()
    years = [y[0] for y in con.execute(
        "SELECT DISTINCT cycle_year FROM hist_pres_state ORDER BY cycle_year")]
    con.close()
    print(f"적재 {n}행, {len(years)}개 선거 ({years[0]}-{years[-1]}).")
    if miss:
        print("  매칭 실패 주:", sorted(miss))


if __name__ == "__main__":
    main()
