"""주 개관 데이터 적재: state_facts + governor_terms (CSV -> SQLite).

선행: fetch_state_facts.py, fetch_governors.py 가 data/raw/*.csv 를 생성.
스키마: schema.sql 의 state_facts / governor_terms (init_db.py 적용 후 실행 가능).

실행: python backend/data_pipeline/ingest_state_overview.py
"""
import csv
import sqlite3
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DB = ROOT / "api" / "db" / "election.sqlite"
FACTS = ROOT / "data" / "raw" / "state_facts.csv"
GOVS = ROOT / "data" / "raw" / "governors_hist.csv"


def ensure_tables(cur):
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS state_facts (
          region_code TEXT PRIMARY KEY, state_po TEXT, name TEXT, capital TEXT,
          admitted_year INTEGER, area_sqmi INTEGER, flag_file TEXT
        );
        CREATE TABLE IF NOT EXISTS governor_terms (
          region_code TEXT, state_po TEXT, governor_name TEXT, party TEXT,
          start_year INTEGER, end_year INTEGER, ordinal TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_gov_state ON governor_terms(region_code, start_year);
        """
    )


def _int(v):
    v = (v or "").strip()
    return int(v) if v else None


def load_facts(cur):
    cur.execute("DELETE FROM state_facts")
    n = 0
    with open(FACTS, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            cur.execute(
                "INSERT INTO state_facts(region_code, state_po, name, capital, admitted_year, area_sqmi, flag_file) "
                "VALUES (?,?,?,?,?,?,?)",
                (r["fips"], r["po"], r["name"], r["capital"] or None,
                 _int(r["admitted_year"]), _int(r["area_sqmi"]), r["flag_file"] or None))
            n += 1
    return n


def load_govs(cur):
    cur.execute("DELETE FROM governor_terms")
    n = 0
    with open(GOVS, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            cur.execute(
                "INSERT INTO governor_terms(region_code, state_po, governor_name, party, start_year, end_year, ordinal) "
                "VALUES (?,?,?,?,?,?,?)",
                (r["fips"], r["state_po"], r["name"], r["party_code"],
                 _int(r["start_year"]), _int(r["end_year"]), r["ordinal"] or None))
            n += 1
    return n


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    ensure_tables(cur)
    nf = load_facts(cur)
    ng = load_govs(cur)
    con.commit()
    span = cur.execute("SELECT MIN(start_year), MAX(start_year) FROM governor_terms").fetchone()
    print(f"state_facts={nf}, governor_terms={ng}, 주지사 임기연도 {span[0]}~{span[1]}")
    con.close()


if __name__ == "__main__":
    main()
