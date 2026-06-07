"""schema + seed 적용해 빈 DB 생성.
실행: python backend/db/init_db.py
"""
import sqlite3
import pathlib

HERE = pathlib.Path(__file__).parent
DB = HERE / "election.sqlite"


def main():
    con = sqlite3.connect(DB)
    for fname in ("schema.sql", "seed_parties.sql"):
        sql = (HERE / fname).read_text(encoding="utf-8")
        con.executescript(sql)
    con.commit()
    con.close()

    # regions / electoral_votes / senate_class 시드 (검증 포함)
    import seed_us
    seed_us.main()

    con = sqlite3.connect(DB)
    n_parties = con.execute("SELECT COUNT(*) FROM parties").fetchone()[0]
    n_states = con.execute("SELECT COUNT(*) FROM regions WHERE level='state'").fetchone()[0]
    ev_2024 = con.execute("SELECT SUM(ev) FROM electoral_votes WHERE cycle_year=2024").fetchone()[0]
    print(f"DB created at {DB}")
    print(f"  parties: {n_parties}  states: {n_states}  EV(2024) total: {ev_2024}")
    con.close()


if __name__ == "__main__":
    main()
