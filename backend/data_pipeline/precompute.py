"""results -> region_election_summary / elected_seats (대통령, 주 단위).
주별 승자/득표율 + top_parties_json(정당·색·득표·득표율) 산출.
turnout 은 P1 미수집(NULL).
실행: python backend/data_pipeline/precompute.py
"""
import json
import sqlite3
import pathlib
from collections import defaultdict

DB = pathlib.Path(__file__).resolve().parent.parent / "db" / "election.sqlite"


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    colors = {r[0]: (r[1], r[2]) for r in cur.execute("SELECT id, name, color_hex FROM parties")}

    # 주(state) 단위만 재계산 (county/cd 는 별도)
    cur.execute("DELETE FROM region_election_summary WHERE office='president'")

    # 회차·주별 모든 후보 행
    by = defaultdict(list)
    for eid, code, cid, pid, votes, rate in cur.execute(
        """SELECT r.election_id, r.region_code, c.id, c.party_id, r.votes, r.vote_rate
           FROM results r JOIN candidates c ON c.id=r.candidate_id
           WHERE r.level='state'"""):
        by[(eid, code)].append({"cid": cid, "pid": pid, "votes": votes, "rate": rate})

    n = 0
    for (eid, code), lst in by.items():
        lst.sort(key=lambda x: -x["votes"])
        win = lst[0]
        pname, pcolor = colors.get(win["pid"], ("?", "#bbb"))
        # 후보명 조회
        names = {c["cid"]: cur.execute("SELECT name FROM candidates WHERE id=?", (c["cid"],)).fetchone()[0]
                 for c in lst}
        top = [{"party": colors.get(x["pid"], ("?",))[0],
                "color": colors.get(x["pid"], (None, "#bbb"))[1],
                "name": names[x["cid"]], "votes": x["votes"], "rate": x["rate"]}
               for x in lst[:4]]
        cur.execute(
            """INSERT INTO region_election_summary
               (region_code, election_id, office, winner_candidate_id, winner_party_id,
                winner_rate, turnout, top_parties_json)
               VALUES (?,?,?,?,?,?,?,?)""",
            (code, eid, "president", win["cid"], win["pid"], win["rate"], None,
             json.dumps(top, ensure_ascii=False)),
        )
        n += 1

    con.commit()
    print(f"region_election_summary[president]: {n}")
    # 검증: 회차별 주 수
    for y, c in cur.execute("SELECT election_id, COUNT(*) FROM region_election_summary "
                            "WHERE office='president' GROUP BY election_id ORDER BY election_id"):
        print(f"  {y}: {c}")
    con.close()


if __name__ == "__main__":
    main()
